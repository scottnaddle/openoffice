import { mkdirSync, readFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import path from 'node:path'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { dialog, ipcMain, safeStorage } from 'electron'
import { PRODUCT_NAME } from '@genoffice/i18n'
import { SmbBackend } from '../backends/smb'
import { WebdavBackend } from '../backends/webdav'
import { NAS_SYNC_CHANNELS } from '../channels'
import { syncOnce } from '../engine'
import type { NasSyncSaveResult, NasSyncSnapshot } from '../public'
import { SyncScheduler } from '../scheduler'
import { readPasswordFile, writePasswordFile } from '../secret-file'
import { loadSettings, normalizeSettings, saveSettings } from '../settings'
import { loadState, saveState } from '../state'
import type { NasSettings, SyncBackend, SyncStatus } from '../types'

export interface ForkNasSyncDeps {
  userData: string
  documentsDir: string
  getWindow: () => BrowserWindow | null
}

let scheduler: SyncScheduler | null = null
let deps: ForkNasSyncDeps | null = null
let status: SyncStatus = {
  phase: 'idle',
  conflictCount: 0,
  lastSyncAt: null,
  lastError: null,
  pending: false,
}

function dir(): string {
  if (!deps) throw new Error('nas-sync-stopped')
  return path.join(deps.userData, 'nas-sync')
}

function settingsPath(): string {
  return path.join(dir(), 'settings.json')
}

function statePath(): string {
  return path.join(dir(), 'state.json')
}

function secretPath(): string {
  return path.join(dir(), 'secret.bin')
}

function fallbackWorkspace(): string {
  if (!deps) return ''
  return path.join(deps.documentsDir, PRODUCT_NAME)
}

function hasPassword(): boolean {
  try {
    return readFileSync(secretPath()).length > 0
  } catch {
    return false
  }
}

function snapshot(): NasSyncSnapshot {
  const settings = deps
    ? loadSettings(settingsPath(), fallbackWorkspace())
    : {
        enabled: false,
        backend: 'smb' as const,
        smbPath: '',
        smbUrl: '',
        webdavUrl: '',
        username: '',
        intervalMinutes: 15,
        workspacePath: '',
        allowInsecureTls: false,
      }
  return { settings, hasPassword: hasPassword(), status }
}

function broadcast(): void {
  const win = deps?.getWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send(NAS_SYNC_CHANNELS.status, snapshot())
}

function backendFor(settings: NasSettings, password: string): SyncBackend {
  if (settings.backend === 'smb') {
    return new SmbBackend({ mountPath: settings.smbPath, smbUrl: settings.smbUrl })
  }
  return new WebdavBackend({
    url: settings.webdavUrl,
    username: settings.username,
    password,
    allowInsecureTls: settings.allowInsecureTls,
  })
}

async function runOnce(): Promise<{
  phase: 'synced' | 'offline' | 'error' | 'disabled'
  conflictCount: number
  error: string | null
}> {
  if (!deps) return { phase: 'disabled', conflictCount: 0, error: null }
  const settings = loadSettings(settingsPath(), fallbackWorkspace())
  if (!settings.enabled)
    return { phase: 'disabled', conflictCount: status.conflictCount, error: null }
  mkdirSync(settings.workspacePath, { recursive: true })
  const password = readPasswordFile(secretPath(), (blob) => safeStorage.decryptString(blob))
  const user = settings.username || userInfo().username || 'user'
  const previous = loadState(statePath())
  const result = await syncOnce({
    localRoot: settings.workspacePath,
    backend: backendFor(settings, password),
    state: previous,
    user,
    now: new Date(),
  })
  if (result.phase !== 'offline') saveState(statePath(), result.state)
  return { phase: result.phase, conflictCount: result.conflictCount, error: result.error }
}

function wireIpc(): void {
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.get)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.save)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.syncNow)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.pickWorkspace)
  ipcMain.removeAllListeners(NAS_SYNC_CHANNELS.network)

  ipcMain.handle(NAS_SYNC_CHANNELS.get, (): NasSyncSnapshot => snapshot())

  ipcMain.handle(NAS_SYNC_CHANNELS.save, (_event, input: unknown): NasSyncSaveResult => {
    const normalized = normalizeSettings(input, fallbackWorkspace())
    if (!normalized.ok) return { ok: false, error: normalized.error, snapshot: snapshot() }
    if (normalized.password !== undefined) {
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: 'keychain-unavailable', snapshot: snapshot() }
      }
      try {
        writePasswordFile(secretPath(), normalized.password, (plain) =>
          safeStorage.encryptString(plain),
        )
      } catch {
        return { ok: false, error: 'keychain-unavailable', snapshot: snapshot() }
      }
    }
    saveSettings(settingsPath(), normalized.settings)
    if (normalized.settings.enabled) scheduler?.start()
    else {
      status = { ...status, phase: 'disabled', pending: false }
      scheduler?.stop()
      scheduler?.start()
    }
    broadcast()
    return { ok: true, snapshot: snapshot() }
  })

  ipcMain.handle(NAS_SYNC_CHANNELS.syncNow, async (): Promise<NasSyncSnapshot> => {
    scheduler?.kick()
    return snapshot()
  })

  ipcMain.handle(NAS_SYNC_CHANNELS.pickWorkspace, async (): Promise<string | null> => {
    const win = deps?.getWindow()
    const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const picked =
      win && !win.isDestroyed()
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return null
    return picked.filePaths[0]
  })

  ipcMain.on(NAS_SYNC_CHANNELS.network, (_event, online: unknown) => {
    if (online === true) scheduler?.kick()
    else if (online === false) scheduler?.noteOffline()
    broadcast()
  })
}

/** Start after the shell window exists. Headless export must not call this. */
export function startForkNasSync(next: ForkNasSyncDeps): void {
  stopForkNasSync()
  deps = next
  mkdirSync(dir(), { recursive: true })
  scheduler = new SyncScheduler({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    intervalMs: () => loadSettings(settingsPath(), fallbackWorkspace()).intervalMinutes * 60_000,
    enabled: () => loadSettings(settingsPath(), fallbackWorkspace()).enabled,
    run: async () => {
      try {
        return await runOnce()
      } catch {
        return { phase: 'error', conflictCount: status.conflictCount, error: 'io' }
      }
    },
    onStatus: (nextStatus) => {
      status = nextStatus
      broadcast()
    },
  })
  wireIpc()
  scheduler.start()
}

export function stopForkNasSync(): void {
  scheduler?.stop()
  scheduler = null
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.get)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.save)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.syncNow)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.pickWorkspace)
  ipcMain.removeAllListeners(NAS_SYNC_CHANNELS.network)
  deps = null
}
