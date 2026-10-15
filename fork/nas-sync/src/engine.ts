import { conflictRelPath } from './names'
import { listTree, readInside, sideFromListing, trashInside, writeInside } from './local-tree'
import { planSync, pruneConflicts } from './plan'
import { shouldSkipRel } from './skip'
import type { FileRecord, PlanAction, SideFile, SyncBackend, SyncState } from './types'

export interface SyncOnceResult {
  phase: 'synced' | 'offline' | 'error'
  conflictCount: number
  error: string | null
  pending: boolean
  state: SyncState
}

/**
 * One pass. Offline and auth failures leave the previous state in place so the
 * next pass can retry. Bytes are never unlinked: deletions move into trash,
 * and a content conflict renames the NAS copy before the local bytes are uploaded.
 */
export async function syncOnce(input: {
  localRoot: string
  backend: SyncBackend
  state: SyncState
  user: string
  now: Date
}): Promise<SyncOnceResult> {
  const state = cloneState(input.state)
  const probe = await input.backend.probe()
  if (!probe.ok) {
    const offline = probe.reason === 'offline' || probe.reason === 'unmounted'
    return {
      phase: offline ? 'offline' : 'error',
      conflictCount: state.conflicts.length,
      error: probe.reason,
      pending: true,
      state,
    }
  }

  const localListed = await listTree(input.localRoot)
  const remoteListed = (await input.backend.list()).filter(
    (entry) => !entry.isDir && !shouldSkipRel(entry.rel),
  )
  const errors: string[] = []
  const local = new Map<string, SideFile>()
  const remote = new Map<string, SideFile>()

  for (const entry of localListed) {
    try {
      local.set(
        entry.rel,
        await sideFromListing(entry, state.files[entry.rel], 'local', () =>
          readInside(input.localRoot, entry.rel),
        ),
      )
    } catch (error) {
      errors.push(codeOf(error))
    }
  }
  for (const entry of remoteListed) {
    try {
      remote.set(
        entry.rel,
        await sideFromListing(entry, state.files[entry.rel], 'remote', () =>
          input.backend.read(entry.rel),
        ),
      )
    } catch (error) {
      errors.push(codeOf(error))
    }
  }

  pruneConflicts(state, local, remote)
  const actions = planSync({ local, remote, state })
  const taken = new Set<string>([...local.keys(), ...remote.keys()])
  for (const action of actions) {
    try {
      await applyAction(action, { ...input, state, local, remote, taken })
    } catch (error) {
      errors.push(codeOf(error))
    }
  }

  const failed = errors.length > 0
  return {
    phase: failed ? 'error' : 'synced',
    conflictCount: state.conflicts.length,
    error: failed ? errors[0] : null,
    pending: failed,
    state,
  }
}

async function applyAction(
  action: PlanAction,
  ctx: {
    localRoot: string
    backend: SyncBackend
    state: SyncState
    user: string
    now: Date
    local: Map<string, SideFile>
    remote: Map<string, SideFile>
    taken: Set<string>
  },
): Promise<void> {
  const { rel } = action
  if (action.kind === 'forget') {
    delete ctx.state.files[rel]
    return
  }
  if (action.kind === 'adopt') {
    const left = ctx.local.get(rel)
    const right = ctx.remote.get(rel)
    if (!left || !right) return
    ctx.state.files[rel] = recordFrom(left, right)
    return
  }
  if (action.kind === 'upload' || action.kind === 'preserve-local') {
    const left = ctx.local.get(rel)
    if (!left) return
    const bytes = await readInside(ctx.localRoot, rel)
    const written = await ctx.backend.write(rel, bytes)
    ctx.state.files[rel] = {
      hash: left.hash,
      size: left.size,
      mtimeMs: left.mtimeMs,
      remoteSize: written.size,
      remoteMtimeMs: written.mtimeMs,
    }
    if (action.kind === 'preserve-local') pushDeleteConflict(ctx, rel)
    return
  }
  if (action.kind === 'download' || action.kind === 'preserve-remote') {
    const right = ctx.remote.get(rel)
    if (!right) return
    const bytes = await ctx.backend.read(rel)
    const written = await writeInside(ctx.localRoot, rel, bytes)
    ctx.state.files[rel] = {
      hash: right.hash,
      size: written.size,
      mtimeMs: written.mtimeMs,
      remoteSize: right.size,
      remoteMtimeMs: right.mtimeMs,
    }
    if (action.kind === 'preserve-remote') pushDeleteConflict(ctx, rel)
    return
  }
  if (action.kind === 'trash-remote') {
    await ctx.backend.trash(rel, ctx.now)
    delete ctx.state.files[rel]
    return
  }
  if (action.kind === 'trash-local') {
    await trashInside(ctx.localRoot, rel, ctx.now)
    delete ctx.state.files[rel]
    return
  }
  const left = ctx.local.get(rel)
  const right = ctx.remote.get(rel)
  if (!left || !right) return
  const remoteBytes = await ctx.backend.read(rel)
  const localBytes = await readInside(ctx.localRoot, rel)
  const conflictRel = conflictRelPath(rel, ctx.user, ctx.now, ctx.taken)
  ctx.taken.add(conflictRel)
  await ctx.backend.rename(rel, conflictRel)
  const writtenRemote = await ctx.backend.write(rel, localBytes)
  const writtenLocal = await writeInside(ctx.localRoot, conflictRel, remoteBytes)
  ctx.state.files[rel] = {
    hash: left.hash,
    size: left.size,
    mtimeMs: left.mtimeMs,
    remoteSize: writtenRemote.size,
    remoteMtimeMs: writtenRemote.mtimeMs,
  }
  ctx.state.files[conflictRel] = {
    hash: right.hash,
    size: writtenLocal.size,
    mtimeMs: writtenLocal.mtimeMs,
    remoteSize: right.size,
    remoteMtimeMs: right.mtimeMs,
  }
  ctx.state.conflicts.push({
    original: rel,
    conflictRel,
    at: ctx.now.toISOString(),
    kind: 'content',
  })
}

function pushDeleteConflict(ctx: { state: SyncState; now: Date }, rel: string): void {
  ctx.state.conflicts.push({
    original: rel,
    conflictRel: null,
    at: ctx.now.toISOString(),
    kind: 'delete',
  })
}

function recordFrom(local: SideFile, remote: SideFile): FileRecord {
  return {
    hash: local.hash,
    size: local.size,
    mtimeMs: local.mtimeMs,
    remoteMtimeMs: remote.mtimeMs,
    remoteSize: remote.size,
  }
}

function cloneState(state: SyncState): SyncState {
  return {
    version: 1,
    files: { ...state.files },
    conflicts: state.conflicts.map((conflict) => ({ ...conflict })),
  }
}

function codeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'too-large')
    return 'too-large'
  return 'io'
}
