import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SmbBackend } from '../src/backends/smb'
import { WebdavBackend } from '../src/backends/webdav'
import { hrefToRel, joinDav, parsePropfind, type HttpTransport } from '../src/backends/webdav-xml'
import { mountLooksAttached, smbUrlAllowed, webdavUrlAllowed } from '../src/mount'

const SAMPLE = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/office/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/office/notes%20a.txt</d:href>
    <d:propstat>
      <d:prop>
        <d:getcontentlength>5</d:getcontentlength>
        <d:getlastmodified>Thu, 15 Oct 2026 00:00:00 GMT</d:getlastmodified>
        <d:resourcetype></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`

describe('WebDAV and SMB addresses', () => {
  it('parses a PROPFIND body relative to the share root', () => {
    const rows = parsePropfind(SAMPLE, 'https://nas.example/office')
    expect(rows.map((row) => row.rel)).toEqual(['', 'notes a.txt'])
    expect(rows[1]?.size).toBe(5)
    expect(rows[1]?.isDir).toBe(false)
    expect(hrefToRel('/office/subdir/a.txt', 'https://nas.example/office')).toBe('subdir/a.txt')
    expect(hrefToRel('/other/a.txt', 'https://nas.example/office')).toBeNull()
    expect(joinDav('https://nas.example/office', 'subdir/a b.txt')).toBe(
      'https://nas.example/office/subdir/a%20b.txt',
    )
  })

  it('allows https WebDAV and smb URLs only without embedded passwords', () => {
    expect(webdavUrlAllowed('https://nas.example:5006/office')).toBe(true)
    expect(webdavUrlAllowed('http://nas.example/office')).toBe(false)
    expect(webdavUrlAllowed('https://ada:secret@nas.example/office')).toBe(false)
    expect(smbUrlAllowed('smb://nas.example/Share')).toBe(true)
    expect(smbUrlAllowed('smb://ada:secret@nas.example/Share')).toBe(false)
    expect(smbUrlAllowed('https://nas.example/Share')).toBe(false)
  })

  it('treats a different filesystem id as a mounted share', () => {
    expect(
      mountLooksAttached('/Volumes/Share', (target) =>
        target === '/' ? { fsidKey: 'root' } : { fsidKey: 'share' },
      ),
    ).toBe(true)
    expect(mountLooksAttached('/Users/ada/Documents', () => ({ fsidKey: 'root' }))).toBe(false)
    expect(mountLooksAttached('/Volumes/Missing', () => null)).toBe(false)
  })

  it('asks macOS to open an smb URL when the mount is missing', async () => {
    const opened: string[] = []
    let mounted = false
    const backend = new SmbBackend({
      mountPath: '/Volumes/Share',
      smbUrl: 'smb://nas.example/Share',
      isMounted: () => mounted,
      openUrl: async (url) => {
        opened.push(url)
        mounted = true
      },
      mountAttempts: 2,
      mountWaitMs: 0,
    })
    await expect(backend.probe()).resolves.toEqual({ ok: true })
    expect(opened).toEqual(['smb://nas.example/Share'])
  })

  it('moves a file on a mounted folder instead of deleting it', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nas-smb-'))
    try {
      const backend = new SmbBackend({ mountPath: root, isMounted: () => true })
      await backend.write('notes.txt', Buffer.from('keep-me'))
      const trashed = await backend.trash('notes.txt', new Date('2026-10-15T00:00:00.000Z'))
      expect(trashed.startsWith('.nas-sync-trash/')).toBe(true)
      expect(readFileSync(path.join(root, trashed), 'utf8')).toBe('keep-me')
      const names = await backend.list()
      expect(names.map((row) => row.rel)).not.toContain('notes.txt')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('lists WebDAV files through the injected transport and moves deletions', async () => {
    const files = new Map<string, Buffer>([['notes.txt', Buffer.from('remote')]])
    const transport: HttpTransport = {
      async request(input) {
        const url = new URL(input.url)
        const rel = decodeURIComponent(url.pathname.replace(/^\/office\/?/, ''))
        if (input.method === 'PROPFIND') {
          if (input.headers.Depth === '0')
            return { status: 207, headers: {}, body: Buffer.from(SAMPLE) }
          const body = [...files.keys()]
            .map(
              (name) =>
                `<d:response><d:href>/office/${encodeURIComponent(name)}</d:href><d:propstat><d:prop><d:getcontentlength>1</d:getcontentlength><d:getlastmodified>Thu, 15 Oct 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype></d:resourcetype></d:prop></d:propstat></d:response>`,
            )
            .join('')
          return {
            status: 207,
            headers: {},
            body: Buffer.from(`<d:multistatus>${body}</d:multistatus>`),
          }
        }
        if (input.method === 'GET') {
          const data = files.get(rel)
          if (!data) return { status: 404, headers: {}, body: Buffer.alloc(0) }
          return { status: 200, headers: {}, body: data }
        }
        if (input.method === 'PUT') {
          files.set(rel, Buffer.from(input.body ?? Buffer.alloc(0)))
          return {
            status: 201,
            headers: { 'last-modified': 'Thu, 15 Oct 2026 00:00:01 GMT' },
            body: Buffer.alloc(0),
          }
        }
        if (input.method === 'MOVE') {
          const dest = new URL(input.headers.Destination)
          const destRel = decodeURIComponent(dest.pathname.replace(/^\/office\/?/, ''))
          const data = files.get(rel)
          if (!data) return { status: 404, headers: {}, body: Buffer.alloc(0) }
          files.delete(rel)
          files.set(destRel, data)
          return { status: 201, headers: {}, body: Buffer.alloc(0) }
        }
        if (input.method === 'MKCOL') return { status: 201, headers: {}, body: Buffer.alloc(0) }
        return { status: 500, headers: {}, body: Buffer.alloc(0) }
      },
    }
    const backend = new WebdavBackend({
      url: 'https://nas.example/office',
      username: 'ada',
      password: 'secret',
      allowInsecureTls: false,
      transport,
    })
    await expect(backend.probe()).resolves.toEqual({ ok: true })
    const listed = await backend.list()
    expect(listed.map((row) => row.rel)).toContain('notes.txt')
    const trashed = await backend.trash('notes.txt', new Date('2026-10-15T00:00:00.000Z'))
    expect(files.has('notes.txt')).toBe(false)
    expect(files.get(trashed)?.toString()).toBe('remote')
  })
})
