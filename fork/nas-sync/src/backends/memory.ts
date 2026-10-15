import { shouldSkipRel } from '../skip'
import { trashRel } from '../names'
import type { ProbeResult, RemoteListing, SyncBackend, WrittenFile } from '../types'

interface Stored {
  bytes: Buffer
  mtimeMs: number
}

/** In-memory NAS. Trash moves the entry; nothing is dropped. */
export class MemoryBackend implements SyncBackend {
  readonly files = new Map<string, Stored>()
  online = true
  authFailed = false
  now = 1_700_000_000_000

  async probe(): Promise<ProbeResult> {
    if (!this.online) return { ok: false, reason: 'offline' }
    if (this.authFailed) return { ok: false, reason: 'auth' }
    return { ok: true }
  }

  async list(): Promise<RemoteListing[]> {
    const rows: RemoteListing[] = []
    for (const [rel, stored] of this.files) {
      if (shouldSkipRel(rel)) continue
      rows.push({ rel, size: stored.bytes.length, mtimeMs: stored.mtimeMs, isDir: false })
    }
    return rows
  }

  async read(rel: string): Promise<Buffer> {
    const stored = this.files.get(rel)
    if (!stored) throw new Error('missing')
    return Buffer.from(stored.bytes)
  }

  async write(rel: string, data: Buffer): Promise<WrittenFile> {
    this.now += 1
    const bytes = Buffer.from(data)
    this.files.set(rel, { bytes, mtimeMs: this.now })
    return { size: bytes.length, mtimeMs: this.now }
  }

  async trash(rel: string, when: Date): Promise<string> {
    const stored = this.files.get(rel)
    if (!stored) throw new Error('missing')
    const dest = trashRel(rel, when)
    this.files.delete(rel)
    this.files.set(dest, stored)
    return dest
  }

  async rename(from: string, to: string): Promise<void> {
    const stored = this.files.get(from)
    if (!stored) throw new Error('missing')
    if (this.files.has(to)) throw new Error('exists')
    this.files.delete(from)
    this.files.set(to, stored)
  }
}
