/** Plain records the sync engine stores and plans against. No Electron types. */

export type BackendKind = 'smb' | 'webdav'

export interface SideFile {
  rel: string
  size: number
  mtimeMs: number
  hash: string
}

export interface FileRecord {
  hash: string
  size: number
  mtimeMs: number
  remoteMtimeMs: number
  remoteSize: number
}

/** A content conflict keeps a renamed copy. A delete conflict refused to erase the edited side. */
export interface ConflictRecord {
  original: string
  conflictRel: string | null
  at: string
  kind: 'content' | 'delete'
}

export interface SyncState {
  version: 1
  files: Record<string, FileRecord>
  conflicts: ConflictRecord[]
}

export type ProbeReason = 'offline' | 'auth' | 'unmounted' | 'error'

export type ProbeResult = { ok: true } | { ok: false; reason: ProbeReason }

export interface RemoteListing {
  rel: string
  size: number
  mtimeMs: number
  isDir: boolean
}

export interface WrittenFile {
  size: number
  mtimeMs: number
}

/**
 * One NAS backend. `trash` moves a file aside. It must not unlink it.
 * `rename` is a move on the same backend, used so a conflict keeps both bytes.
 */
export interface SyncBackend {
  probe(): Promise<ProbeResult>
  list(): Promise<RemoteListing[]>
  read(rel: string): Promise<Buffer>
  write(rel: string, data: Buffer): Promise<WrittenFile>
  trash(rel: string, when: Date): Promise<string>
  rename(from: string, to: string): Promise<void>
}

export type PlanAction =
  | { kind: 'upload'; rel: string }
  | { kind: 'download'; rel: string }
  | { kind: 'trash-local'; rel: string }
  | { kind: 'trash-remote'; rel: string }
  | { kind: 'conflict'; rel: string }
  | { kind: 'preserve-remote'; rel: string }
  | { kind: 'preserve-local'; rel: string }
  | { kind: 'adopt'; rel: string }
  | { kind: 'forget'; rel: string }

export interface SyncStatus {
  phase: 'disabled' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
  conflictCount: number
  lastSyncAt: string | null
  lastError: string | null
  pending: boolean
}

export type NasNameKind = 'upn' | 'sam'
export type WebdavAuthKind = 'basic' | 'bearer'

export interface NasSettings {
  enabled: boolean
  backend: BackendKind
  smbPath: string
  smbUrl: string
  webdavUrl: string
  username: string
  /** When true, sign-in replaces `username` with the Microsoft account name. */
  usernameFollowsAccount: boolean
  intervalMinutes: number
  workspacePath: string
  allowInsecureTls: boolean
  entraTenantId: string
  entraClientId: string
  nasNameKind: NasNameKind
  webdavAuth: WebdavAuthKind
  /** Scope for the optional WebDAV bearer hook. Empty when WebDAV uses a password. */
  webdavScope: string
}
