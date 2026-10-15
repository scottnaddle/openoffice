import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryBackend } from '../src/backends/memory'
import { syncOnce } from '../src/engine'
import { sha256 } from '../src/hash'
import { listTree, writeInside } from '../src/local-tree'
import { emptyState } from '../src/state'
import type { SyncState } from '../src/types'

const roots: string[] = []

function workspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nas-sync-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('syncOnce', () => {
  it('keeps both copies when the same file changed on each side', async () => {
    const root = workspace()
    const backend = new MemoryBackend()
    const when = new Date('2026-10-15T03:04:05.000Z')
    await writeInside(root, 'notes.txt', Buffer.from('local-v2'))
    await backend.write('notes.txt', Buffer.from('remote-v2'))
    const base = sha256(Buffer.from('base'))
    const state: SyncState = {
      version: 1,
      files: {
        'notes.txt': { hash: base, size: 4, mtimeMs: 1, remoteMtimeMs: 1, remoteSize: 4 },
      },
      conflicts: [],
    }
    const result = await syncOnce({
      localRoot: root,
      backend,
      state,
      user: 'ada',
      now: when,
    })
    const conflict = 'notes (conflict - ada 2026-10-15).txt'
    expect(result.phase).toBe('synced')
    expect(result.conflictCount).toBe(1)
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('local-v2')
    expect(readFileSync(path.join(root, conflict), 'utf8')).toBe('remote-v2')
    expect(backend.files.get('notes.txt')?.bytes.toString()).toBe('local-v2')
    expect(backend.files.get(conflict)?.bytes.toString()).toBe('remote-v2')
    expect(result.state.files['notes.txt']?.hash).toBe(sha256(Buffer.from('local-v2')))
    expect(result.state.files[conflict]?.hash).toBe(sha256(Buffer.from('remote-v2')))
  })

  it('moves a remote file into trash when it was deleted locally and not edited', async () => {
    const root = workspace()
    const backend = new MemoryBackend()
    const bytes = Buffer.from('hello')
    const written = await backend.write('gone.txt', bytes)
    const state: SyncState = {
      version: 1,
      files: {
        'gone.txt': {
          hash: sha256(bytes),
          size: bytes.length,
          mtimeMs: written.mtimeMs,
          remoteMtimeMs: written.mtimeMs,
          remoteSize: written.size,
        },
      },
      conflicts: [],
    }
    const result = await syncOnce({
      localRoot: root,
      backend,
      state,
      user: 'ada',
      now: new Date('2026-10-15T00:00:00.000Z'),
    })
    expect(result.phase).toBe('synced')
    expect(backend.files.has('gone.txt')).toBe(false)
    const trashed = [...backend.files.keys()].filter((rel) => rel.startsWith('.nas-sync-trash/'))
    expect(trashed).toHaveLength(1)
    expect(backend.files.get(trashed[0])?.bytes.toString()).toBe('hello')
    expect(result.state.files['gone.txt']).toBeUndefined()
  })

  it('moves a local file into trash when the NAS copy was deleted and not edited', async () => {
    const root = workspace()
    const backend = new MemoryBackend()
    const bytes = Buffer.from('hello')
    await writeInside(root, 'gone.txt', bytes)
    const state: SyncState = {
      version: 1,
      files: {
        'gone.txt': {
          hash: sha256(bytes),
          size: bytes.length,
          mtimeMs: 1,
          remoteMtimeMs: 1,
          remoteSize: bytes.length,
        },
      },
      conflicts: [],
    }
    const result = await syncOnce({
      localRoot: root,
      backend,
      state,
      user: 'ada',
      now: new Date('2026-10-15T00:00:00.000Z'),
    })
    expect(result.phase).toBe('synced')
    const listed = await listTree(root)
    expect(listed.map((row) => row.rel)).not.toContain('gone.txt')
    const trashed = listed.filter((row) => row.rel.startsWith('.nas-sync-trash/'))
    expect(trashed).toHaveLength(0)
    const onDisk = readFileSync(
      path.join(root, '.nas-sync-trash', '2026-10-15T00-00-00-000Z', 'gone.txt'),
    )
    expect(onDisk.toString()).toBe('hello')
    expect(result.state.files['gone.txt']).toBeUndefined()
  })

  it('does not transfer while the NAS is offline and keeps the previous state', async () => {
    const root = workspace()
    const backend = new MemoryBackend()
    backend.online = false
    await writeInside(root, 'new.txt', Buffer.from('local'))
    const previous = emptyState()
    const result = await syncOnce({
      localRoot: root,
      backend,
      state: previous,
      user: 'ada',
      now: new Date('2026-10-15T00:00:00.000Z'),
    })
    expect(result.phase).toBe('offline')
    expect(result.pending).toBe(true)
    expect(result.state.files).toEqual({})
    expect(backend.files.size).toBe(0)
  })

  it('refuses to drop an edit when the other side deleted the file', async () => {
    const root = workspace()
    const backend = new MemoryBackend()
    const bytes = Buffer.from('remote-edit')
    await backend.write('notes.txt', bytes)
    const state: SyncState = {
      version: 1,
      files: {
        'notes.txt': {
          hash: sha256(Buffer.from('base')),
          size: 4,
          mtimeMs: 1,
          remoteMtimeMs: 1,
          remoteSize: 4,
        },
      },
      conflicts: [],
    }
    const result = await syncOnce({
      localRoot: root,
      backend,
      state,
      user: 'ada',
      now: new Date('2026-10-15T00:00:00.000Z'),
    })
    expect(result.state.conflicts).toEqual([
      expect.objectContaining({ original: 'notes.txt', kind: 'delete' }),
    ])
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('remote-edit')
    expect(backend.files.get('notes.txt')?.bytes.toString()).toBe('remote-edit')
  })
})
