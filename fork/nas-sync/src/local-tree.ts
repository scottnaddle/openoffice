import { existsSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256, MAX_FILE_BYTES } from './hash'
import { trashRel } from './names'
import { resolveInside, toRel } from './paths'
import { shouldSkipRel } from './skip'
import type { FileRecord, SideFile } from './types'

export interface ListedFile {
  rel: string
  size: number
  mtimeMs: number
}

export async function listTree(root: string): Promise<ListedFile[]> {
  const found: ListedFile[] = []
  await walk(root, root, found)
  return found
}

async function walk(root: string, dir: string, found: ListedFile[]): Promise<void> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  for (const name of names) {
    const full = path.join(dir, name)
    let rel: string
    try {
      rel = toRel(root, full)
    } catch {
      continue
    }
    if (shouldSkipRel(rel)) continue
    let st
    try {
      st = await lstat(full)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) {
      await walk(root, full, found)
      continue
    }
    if (!st.isFile()) continue
    found.push({ rel, size: st.size, mtimeMs: Math.round(st.mtimeMs) })
  }
}

export async function readInside(root: string, rel: string): Promise<Buffer> {
  return readFile(resolveInside(root, rel))
}

export async function writeInside(
  root: string,
  rel: string,
  data: Buffer,
): Promise<{ size: number; mtimeMs: number }> {
  const full = resolveInside(root, rel)
  await mkdir(path.dirname(full), { recursive: true })
  const tmp = `${full}.nas-sync-tmp`
  await writeFile(tmp, data)
  await rename(tmp, full)
  const st = await lstat(full)
  return { size: st.size, mtimeMs: Math.round(st.mtimeMs) }
}

/** Move into `.nas-sync-trash`. Never unlinks the bytes. */
export async function trashInside(root: string, rel: string, when: Date): Promise<string> {
  const destRel = uniqueTrash(root, trashRel(rel, when))
  const from = resolveInside(root, rel)
  const dest = resolveInside(root, destRel)
  await mkdir(path.dirname(dest), { recursive: true })
  await rename(from, dest)
  return destRel
}

function uniqueTrash(root: string, rel: string): string {
  let candidate = rel
  let n = 2
  while (existsSync(resolveInside(root, candidate))) {
    const dot = rel.lastIndexOf('.')
    const slash = rel.lastIndexOf('/')
    const dotInFile = dot > slash ? dot : -1
    candidate =
      dotInFile > 0 ? `${rel.slice(0, dotInFile)}-${n}${rel.slice(dotInFile)}` : `${rel}-${n}`
    n += 1
  }
  return candidate
}

/**
 * Reuse the stored hash when size and mtime still match the last sync.
 * A changed mtime or size reads the file and hashes it.
 */
export async function sideFromListing(
  listed: ListedFile,
  record: FileRecord | undefined,
  side: 'local' | 'remote',
  read: () => Promise<Buffer>,
): Promise<SideFile> {
  const same =
    record !== undefined &&
    listed.size === (side === 'local' ? record.size : record.remoteSize) &&
    listed.mtimeMs === (side === 'local' ? record.mtimeMs : record.remoteMtimeMs)
  if (same) {
    return { rel: listed.rel, size: listed.size, mtimeMs: listed.mtimeMs, hash: record.hash }
  }
  if (listed.size > MAX_FILE_BYTES) {
    const error = new Error('too-large')
    ;(error as Error & { code: string }).code = 'too-large'
    throw error
  }
  const bytes = await read()
  if (bytes.length > MAX_FILE_BYTES) {
    const error = new Error('too-large')
    ;(error as Error & { code: string }).code = 'too-large'
    throw error
  }
  return { rel: listed.rel, size: bytes.length, mtimeMs: listed.mtimeMs, hash: sha256(bytes) }
}
