import { describe, expect, it } from 'vitest'
import { planSync } from '../src/plan'
import { shouldSkipRel } from '../src/skip'
import type { SideFile, SyncState } from '../src/types'

function file(rel: string, hash: string, mtimeMs = 10): SideFile {
  return { rel, hash, size: hash.length, mtimeMs }
}

function state(files: SyncState['files']): SyncState {
  return { version: 1, files, conflicts: [] }
}

function record(hash: string): SyncState['files'][string] {
  return { hash, size: hash.length, mtimeMs: 10, remoteMtimeMs: 10, remoteSize: hash.length }
}

describe('planSync', () => {
  it('uploads a new local file and downloads a new remote file', () => {
    const actions = planSync({
      local: new Map([['a.txt', file('a.txt', 'local')]]),
      remote: new Map([['b.txt', file('b.txt', 'remote')]]),
      state: state({}),
    })
    expect(actions).toEqual([
      { kind: 'upload', rel: 'a.txt' },
      { kind: 'download', rel: 'b.txt' },
    ])
  })

  it('adopts identical bytes and uploads or downloads a one-sided edit', () => {
    const actions = planSync({
      local: new Map([
        ['same.txt', file('same.txt', 'aaa')],
        ['local.txt', file('local.txt', 'new-local')],
        ['remote.txt', file('remote.txt', 'old')],
      ]),
      remote: new Map([
        ['same.txt', file('same.txt', 'aaa')],
        ['local.txt', file('local.txt', 'old')],
        ['remote.txt', file('remote.txt', 'new-remote')],
      ]),
      state: state({
        'same.txt': record('aaa'),
        'local.txt': record('old'),
        'remote.txt': record('old'),
      }),
    })
    expect(actions).toEqual([
      { kind: 'upload', rel: 'local.txt' },
      { kind: 'download', rel: 'remote.txt' },
    ])
  })

  it('marks a content conflict when both sides diverge', () => {
    const actions = planSync({
      local: new Map([['notes.txt', file('notes.txt', 'local')]]),
      remote: new Map([['notes.txt', file('notes.txt', 'remote')]]),
      state: state({ 'notes.txt': record('base') }),
    })
    expect(actions).toEqual([{ kind: 'conflict', rel: 'notes.txt' }])
  })

  it('adopts when both sides changed to the same bytes', () => {
    const actions = planSync({
      local: new Map([['notes.txt', file('notes.txt', 'same', 20)]]),
      remote: new Map([['notes.txt', file('notes.txt', 'same', 30)]]),
      state: state({ 'notes.txt': record('base') }),
    })
    expect(actions).toEqual([{ kind: 'adopt', rel: 'notes.txt' }])
  })

  it('trashes the unchanged side when the other side deleted the file', () => {
    const actions = planSync({
      local: new Map([
        ['keep.txt', file('keep.txt', 'edited')],
        ['local-gone.txt', file('local-gone.txt', 'same')],
      ]),
      remote: new Map([['gone.txt', file('gone.txt', 'same')]]),
      state: state({
        'gone.txt': record('same'),
        'local-gone.txt': record('same'),
        'keep.txt': record('base'),
      }),
    })
    expect(actions).toEqual([
      { kind: 'trash-remote', rel: 'gone.txt' },
      { kind: 'preserve-local', rel: 'keep.txt' },
      { kind: 'trash-local', rel: 'local-gone.txt' },
    ])
  })

  it('does not plan temp or lock files', () => {
    expect(shouldSkipRel('~$notes.docx')).toBe(true)
    expect(shouldSkipRel('.~lock.notes.docx#')).toBe(true)
    expect(shouldSkipRel('draft.tmp')).toBe(true)
    expect(shouldSkipRel('.nas-sync-trash/2026/notes.txt')).toBe(true)
    expect(shouldSkipRel('notes.txt')).toBe(false)
    const actions = planSync({
      local: new Map([['~$notes.docx', file('~$notes.docx', 'lock')]]),
      remote: new Map(),
      state: state({}),
    })
    expect(actions).toEqual([])
  })
})
