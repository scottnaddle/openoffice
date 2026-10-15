import type { NasSettings, SyncStatus } from './types'

/** What the window is allowed to see. The password is never included. */
export interface NasSyncSnapshot {
  settings: NasSettings
  hasPassword: boolean
  status: SyncStatus
}

export interface NasSyncSaveResult {
  ok: boolean
  error?: string
  snapshot: NasSyncSnapshot
}

export interface NasSyncApi {
  get(): Promise<NasSyncSnapshot>
  save(input: unknown): Promise<NasSyncSaveResult>
  syncNow(): Promise<NasSyncSnapshot>
  pickWorkspace(): Promise<string | null>
  notifyNetwork(online: boolean): void
  onStatus(listener: (snapshot: NasSyncSnapshot) => void): () => void
}
