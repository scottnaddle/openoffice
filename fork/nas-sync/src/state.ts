import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { SyncState } from './types'

export function emptyState(): SyncState {
  return { version: 1, files: {}, conflicts: [] }
}

export function loadState(file: string): SyncState {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<SyncState>
    if (parsed.version !== 1 || !parsed.files || typeof parsed.files !== 'object')
      return emptyState()
    return {
      version: 1,
      files: parsed.files,
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
    }
  } catch {
    return emptyState()
  }
}

export function saveState(file: string, state: SyncState): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString('hex')}.nas-sync-tmp`
  writeFileSync(tmp, JSON.stringify(state))
  renameSync(tmp, file)
}
