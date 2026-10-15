import { shouldSkipRel } from './skip'
import type { PlanAction, SideFile, SyncState } from './types'

/**
 * Two-way diff. Content equality is the hash. A deletion is applied only when
 * the other side still matches the last sync. If the other side was edited,
 * the edit is kept (`preserve-*`) and counted as a conflict.
 */
export function planSync(input: {
  local: ReadonlyMap<string, SideFile>
  remote: ReadonlyMap<string, SideFile>
  state: SyncState
}): PlanAction[] {
  const names = new Set<string>([
    ...input.local.keys(),
    ...input.remote.keys(),
    ...Object.keys(input.state.files),
  ])
  const actions: PlanAction[] = []
  for (const rel of [...names].sort()) {
    if (shouldSkipRel(rel)) continue
    const local = input.local.get(rel)
    const remote = input.remote.get(rel)
    const record = input.state.files[rel]
    if (!record) {
      if (local && remote) {
        actions.push({ kind: local.hash === remote.hash ? 'adopt' : 'conflict', rel })
      } else if (local) actions.push({ kind: 'upload', rel })
      else if (remote) actions.push({ kind: 'download', rel })
      continue
    }
    if (!local && !remote) {
      actions.push({ kind: 'forget', rel })
      continue
    }
    if (!local && remote) {
      const remoteChanged = remote.hash !== record.hash
      actions.push({ kind: remoteChanged ? 'preserve-remote' : 'trash-remote', rel })
      continue
    }
    if (local && !remote) {
      const localChanged = local.hash !== record.hash
      actions.push({ kind: localChanged ? 'preserve-local' : 'trash-local', rel })
      continue
    }
    if (!local || !remote) continue
    const localChanged = local.hash !== record.hash
    const remoteChanged = remote.hash !== record.hash
    if (localChanged && remoteChanged) {
      actions.push({ kind: local.hash === remote.hash ? 'adopt' : 'conflict', rel })
    } else if (localChanged) actions.push({ kind: 'upload', rel })
    else if (remoteChanged) actions.push({ kind: 'download', rel })
    else if (local.mtimeMs !== record.mtimeMs || remote.mtimeMs !== record.remoteMtimeMs) {
      actions.push({ kind: 'adopt', rel })
    }
  }
  return actions
}

/** Drop conflict rows whose extra copy is gone, or whose delete was already reconciled. */
export function pruneConflicts(
  state: SyncState,
  local: ReadonlyMap<string, SideFile>,
  remote: ReadonlyMap<string, SideFile>,
): void {
  state.conflicts = state.conflicts.filter((conflict) => {
    if (conflict.kind === 'content') {
      const rel = conflict.conflictRel
      if (!rel) return false
      return local.has(rel) || remote.has(rel)
    }
    const record = state.files[conflict.original]
    const left = local.get(conflict.original)
    const right = remote.get(conflict.original)
    if (left && right && record && left.hash === right.hash && left.hash === record.hash)
      return false
    return true
  })
}
