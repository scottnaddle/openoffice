import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { userInfo } from 'node:os'
import path from 'node:path'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { dialog, ipcMain, safeStorage, shell } from 'electron'
import { PRODUCT_NAME } from '@genoffice/i18n'
import { SmbBackend } from '../backends/smb'
import { WebdavBackend } from '../backends/webdav'
import { NAS_SYNC_CHANNELS } from '../channels'
import { syncOnce } from '../engine'
import { authorizationFromHook, createBearerHook } from '../entra/bearer'
import { entraBuildDefaults, parseScopes, resolveEntraConfig, signInScopes } from '../entra/config'
import { entraErrorCode } from '../entra/login-url'
import { createMsalClient } from '../entra/msal-client'
import {
  applyAccountUsername,
  conflictUserName,
  parseStoredAccount,
  serializeAccount,
  type MicrosoftProfile,
} from '../entra/profile'
import { signInWithMicrosoft } from '../entra/sign-in'
import type { NasSyncSaveResult, NasSyncSnapshot } from '../public'
import { SyncScheduler } from '../scheduler'
import { readPasswordFile, writePasswordFile, writeSealedString } from '../secret-file'
import { defaultSettings, loadSettings, normalizeSettings, saveSettings } from '../settings'
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

function accountPath(): string {
  return path.join(dir(), 'account.bin')
}

function cachePath(): string {
  return path.join(dir(), 'msal-cache.bin')
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

function encryptionReady(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function seal(plain: string): Buffer {
  if (!encryptionReady()) throw new Error('keychain-unavailable')
  return safeStorage.encryptString(plain)
}

function unseal(blob: Buffer): string {
  return safeStorage.decryptString(blob)
}

function loadAccount(): MicrosoftProfile | null {
  return parseStoredAccount(readPasswordFile(accountPath(), unseal))
}

function snapshot(): NasSyncSnapshot {
  const settings = deps ? loadSettings(settingsPath(), fallbackWorkspace()) : defaultSettings('')
  const account = deps ? loadAccount() : null
  return {
    settings,
    hasPassword: hasPassword(),
    status,
    account: account
      ? {
          displayName: account.displayName,
          email: account.email,
          upn: account.upn,
          samAccountName: account.samAccountName,
        }
      : null,
    entraDefaults: entraBuildDefaults(),
  }
}

function broadcast(): void {
  const win = deps?.getWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send(NAS_SYNC_CHANNELS.status, snapshot())
}

function silentAccessToken(settings: NasSettings, scopes: string[]): Promise<string | null> {
  const config = resolveEntraConfig(settings)
  if (!config || !encryptionReady()) return Promise.resolve(null)
  const client = createMsalClient({
    ...config,
    loadCache: () => readPasswordFile(cachePath(), unseal),
    storeCache: (serialized) => writeSealedString(cachePath(), serialized, seal),
  })
  return client.acquireSilent(scopes)
}

function backendFor(settings: NasSettings, password: string): SyncBackend {
  if (settings.backend === 'smb') {
    return new SmbBackend({ mountPath: settings.smbPath, smbUrl: settings.smbUrl })
  }
  const bearer = settings.webdavAuth === 'bearer'
  const scopes = parseScopes(settings.webdavScope) ?? []
  return new WebdavBackend({
    url: settings.webdavUrl,
    username: settings.username,
    password,
    allowInsecureTls: settings.allowInsecureTls,
    authorization: bearer
      ? authorizationFromHook(createBearerHook(() => silentAccessToken(settings, scopes)))
      : undefined,
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
  const password = readPasswordFile(secretPath(), unseal)
  const user = conflictUserName(settings, loadAccount(), userInfo().username || '')
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
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.signIn)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.signOut)
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
    const account = loadAccount()
    const settings = account
      ? applyAccountUsername(normalized.settings, account)
      : normalized.settings
    saveSettings(settingsPath(), settings)
    if (settings.enabled) scheduler?.start()
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

  ipcMain.handle(NAS_SYNC_CHANNELS.signIn, async (): Promise<NasSyncSaveResult> => {
    if (!deps) return { ok: false, error: 'entra-failed', snapshot: snapshot() }
    if (!encryptionReady())
      return { ok: false, error: 'keychain-unavailable', snapshot: snapshot() }
    const settings = loadSettings(settingsPath(), fallbackWorkspace())
    const config = resolveEntraConfig(settings)
    if (!config) return { ok: false, error: 'entra-config', snapshot: snapshot() }
    try {
      const client = createMsalClient({
        ...config,
        loadCache: () => readPasswordFile(cachePath(), unseal),
        storeCache: (serialized) => writeSealedString(cachePath(), serialized, seal),
      })
      const profile = await signInWithMicrosoft({
        client,
        openExternal: (url) => shell.openExternal(url),
        bearerScopes: signInScopes(settings),
      })
      writeSealedString(accountPath(), serializeAccount(profile), seal)
      saveSettings(settingsPath(), applyAccountUsername(settings, profile))
      broadcast()
      return { ok: true, snapshot: snapshot() }
    } catch (error) {
      return { ok: false, error: entraErrorCode(error), snapshot: snapshot() }
    }
  })

  ipcMain.handle(NAS_SYNC_CHANNELS.signOut, (): NasSyncSnapshot => {
    if (deps) {
      rmSync(accountPath(), { force: true })
      rmSync(cachePath(), { force: true })
    }
    broadcast()
    return snapshot()
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
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.signIn)
  ipcMain.removeHandler(NAS_SYNC_CHANNELS.signOut)
  ipcMain.removeAllListeners(NAS_SYNC_CHANNELS.network)
  deps = null
}
