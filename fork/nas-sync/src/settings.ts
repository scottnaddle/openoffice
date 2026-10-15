import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { clientIdAllowed, parseScopes, tenantIdAllowed } from './entra/config'
import { smbUrlAllowed, webdavUrlAllowed } from './mount'
import { pathsOverlap } from './paths'
import type { NasNameKind, NasSettings, WebdavAuthKind } from './types'

export function defaultSettings(workspacePath: string): NasSettings {
  return {
    enabled: false,
    backend: 'smb',
    smbPath: '',
    smbUrl: '',
    webdavUrl: '',
    username: '',
    usernameFollowsAccount: true,
    intervalMinutes: 15,
    workspacePath,
    allowInsecureTls: false,
    entraTenantId: '',
    entraClientId: '',
    nasNameKind: 'upn',
    webdavAuth: 'basic',
    webdavScope: '',
  }
}

export function loadSettings(file: string, workspacePath: string): NasSettings {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const normalized = normalizeSettings(parsed, workspacePath)
    if (!normalized.ok) return defaultSettings(workspacePath)
    return normalized.settings
  } catch {
    return defaultSettings(workspacePath)
  }
}

/** Settings JSON never includes a password field. */
export function saveSettings(file: string, settings: NasSettings): void {
  mkdirSync(dirname(file), { recursive: true })
  const body = JSON.stringify(settings, null, 2)
  if (/"password"|"accessToken"|"refreshToken"|"idToken"/.test(body)) {
    throw new Error('password-in-settings')
  }
  const tmp = `${file}.${randomBytes(4).toString('hex')}.nas-sync-tmp`
  writeFileSync(tmp, body)
  renameSync(tmp, file)
}

export type NormalizeResult =
  { ok: true; settings: NasSettings; password?: string } | { ok: false; error: string }

export function normalizeSettings(input: unknown, fallbackWorkspace: string): NormalizeResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'bad-settings' }
  const raw = input as Record<string, unknown>
  const enabled = raw.enabled === true
  const backend = raw.backend === 'webdav' ? 'webdav' : raw.backend === 'smb' ? 'smb' : null
  if (!backend) return { ok: false, error: 'bad-settings' }
  const smbPath = asPath(raw.smbPath)
  const smbUrl = asText(raw.smbUrl, 512)
  const webdavUrl = asText(raw.webdavUrl, 512)
  const username = asText(raw.username, 256)
  const workspacePath = asPath(raw.workspacePath) || fallbackWorkspace
  const allowInsecureTls = raw.allowInsecureTls === true
  const entraTenantId = asText(raw.entraTenantId, 253)
  const entraClientId = asText(raw.entraClientId, 64)
  const nasNameKind: NasNameKind = raw.nasNameKind === 'sam' ? 'sam' : 'upn'
  const webdavAuth: WebdavAuthKind = raw.webdavAuth === 'bearer' ? 'bearer' : 'basic'
  const webdavScope = asText(raw.webdavScope, 512)
  const usernameFollowsAccount =
    raw.usernameFollowsAccount === true || (raw.usernameFollowsAccount !== false && !username)
  const intervalMinutes = asInterval(raw.intervalMinutes)
  if (intervalMinutes === null) return { ok: false, error: 'bad-interval' }
  if (smbUrl && !smbUrlAllowed(smbUrl)) return { ok: false, error: 'bad-smb-url' }
  if (webdavUrl && !webdavUrlAllowed(webdavUrl)) return { ok: false, error: 'bad-url' }
  if (username.includes('/') || username.includes('\\')) return { ok: false, error: 'bad-settings' }
  if (workspacePath && !isAbsolutePath(workspacePath)) return { ok: false, error: 'bad-path' }
  if (smbPath && !isAbsolutePath(smbPath)) return { ok: false, error: 'bad-path' }
  if (pathsOverlap(workspacePath, smbPath)) return { ok: false, error: 'paths-overlap' }
  if (enabled && backend === 'smb' && !smbPath) return { ok: false, error: 'smb-path' }
  if (enabled && backend === 'webdav' && !webdavUrl) return { ok: false, error: 'bad-url' }
  if (enabled && !workspacePath) return { ok: false, error: 'bad-path' }
  if (entraTenantId && !tenantIdAllowed(entraTenantId)) return { ok: false, error: 'entra-config' }
  if (entraClientId && !clientIdAllowed(entraClientId)) return { ok: false, error: 'entra-config' }
  if (webdavScope && parseScopes(webdavScope) === null) return { ok: false, error: 'bearer-scope' }
  if (enabled && backend === 'webdav' && webdavAuth === 'bearer' && !webdavScope) {
    return { ok: false, error: 'bearer-scope' }
  }

  let password: string | undefined
  if (typeof raw.password === 'string') {
    if (raw.password.length > 256) return { ok: false, error: 'bad-settings' }
    if (raw.password.length > 0) password = raw.password
  } else if (raw.password !== undefined && raw.password !== null) {
    return { ok: false, error: 'bad-settings' }
  }

  return {
    ok: true,
    password,
    settings: {
      enabled,
      backend,
      smbPath,
      smbUrl,
      webdavUrl,
      username,
      usernameFollowsAccount,
      intervalMinutes,
      workspacePath,
      allowInsecureTls,
      entraTenantId,
      entraClientId,
      nasNameKind,
      webdavAuth,
      webdavScope,
    },
  }
}

function asText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asPath(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function asInterval(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(n) || n < 1 || n > 24 * 60) return null
  return n
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
}
