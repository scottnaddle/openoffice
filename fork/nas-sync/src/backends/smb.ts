import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { listTree, readInside, trashInside, writeInside } from '../local-tree'
import { mountLooksAttached, smbUrlAllowed } from '../mount'
import { rename } from 'node:fs/promises'
import { resolveInside } from '../paths'
import type { ProbeResult, RemoteListing, SyncBackend, WrittenFile } from '../types'

export function openSmbWithFinder(url: string): Promise<void> {
  if (!smbUrlAllowed(url)) return Promise.reject(new Error('bad-smb-url'))
  if (process.platform !== 'darwin') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/open', [url], { shell: false, stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('open-timeout'))
    }, 15_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error('open-failed'))
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function darwinMountAttached(mountPath: string): boolean {
  return mountLooksAttached(mountPath, (target) => {
    try {
      const stat = statSync(target)
      if (!stat.isDirectory() && target !== '/') return null
      // Device id differs across mounts. Node 22 statfs has no fsid field.
      return { fsidKey: String(stat.dev) }
    } catch {
      return null
    }
  })
}

/**
 * SMB via a folder macOS has already mounted, usually `/Volumes/<share>`.
 * When `smbUrl` is set and the folder is missing, ask Finder once with `open`.
 */
export class SmbBackend implements SyncBackend {
  constructor(
    private readonly opts: {
      mountPath: string
      smbUrl?: string
      isMounted?: () => boolean
      openUrl?: (url: string) => Promise<void>
      /** How long to wait for Finder to mount. Tests pass a short wait. */
      mountAttempts?: number
      mountWaitMs?: number
    },
  ) {}

  async probe(): Promise<ProbeResult> {
    if (this.mounted()) return { ok: true }
    const url = this.opts.smbUrl?.trim() ?? ''
    if (url && smbUrlAllowed(url)) {
      try {
        await (this.opts.openUrl ?? openSmbWithFinder)(url)
      } catch {
        return { ok: false, reason: 'unmounted' }
      }
      const attempts = this.opts.mountAttempts ?? 16
      const waitMs = this.opts.mountWaitMs ?? 500
      for (let i = 0; i < attempts; i += 1) {
        if (this.mounted()) return { ok: true }
        if (waitMs > 0) await delay(waitMs)
      }
    }
    return { ok: false, reason: 'unmounted' }
  }

  async list(): Promise<RemoteListing[]> {
    const rows = await listTree(this.opts.mountPath)
    return rows.map((row) => ({ ...row, isDir: false }))
  }

  read(rel: string): Promise<Buffer> {
    return readInside(this.opts.mountPath, rel)
  }

  write(rel: string, data: Buffer): Promise<WrittenFile> {
    return writeInside(this.opts.mountPath, rel, data)
  }

  trash(rel: string, when: Date): Promise<string> {
    return trashInside(this.opts.mountPath, rel, when)
  }

  async rename(from: string, to: string): Promise<void> {
    const src = resolveInside(this.opts.mountPath, from)
    const dest = resolveInside(this.opts.mountPath, to)
    await rename(src, dest)
  }

  private mounted(): boolean {
    if (this.opts.isMounted) return this.opts.isMounted()
    return darwinMountAttached(this.opts.mountPath)
  }
}
