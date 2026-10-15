import type { NasSettings, SyncStatus } from './types'

/** Shown in the window. Tokens and the NAS password are never included. */
export interface MicrosoftAccountView {
  displayName: string
  email: string
  upn: string
  samAccountName: string
}

export interface NasSyncSnapshot {
  settings: NasSettings
  hasPassword: boolean
  status: SyncStatus
  account: MicrosoftAccountView | null
  entraDefaults: { tenantId: string; clientId: string }
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
  signIn(): Promise<NasSyncSaveResult>
  signOut(): Promise<NasSyncSnapshot>
  notifyNetwork(online: boolean): void
  onStatus(listener: (snapshot: NasSyncSnapshot) => void): () => void
}
