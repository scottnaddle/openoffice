import { request as httpsRequest } from 'node:https'
import { MAX_FILE_BYTES } from '../hash'
import { shouldSkipRel } from '../skip'
import { trashRel } from '../names'
import {
  PROPFIND_BODY,
  basicAuthHeader,
  joinDav,
  parsePropfind,
  type HttpResponse,
  type HttpTransport,
} from './webdav-xml'
import type { ProbeResult, RemoteListing, SyncBackend, WrittenFile } from '../types'

/**
 * WebDAV over HTTPS only. Deletes are MOVE into `.nas-sync-trash`, not DELETE.
 * Basic authentication. Digest and QuickConnect relays that are not WebDAV are out of scope.
 */
export class WebdavBackend implements SyncBackend {
  private readonly transport: HttpTransport

  constructor(
    private readonly opts: {
      url: string
      username: string
      password: string
      allowInsecureTls: boolean
      transport?: HttpTransport
    },
  ) {
    this.transport = opts.transport ?? nodeHttpsTransport
  }

  async probe(): Promise<ProbeResult> {
    try {
      const response = await this.call('PROPFIND', '', PROPFIND_BODY, { Depth: '0' })
      if (response.status === 401 || response.status === 403) return { ok: false, reason: 'auth' }
      if (response.status >= 200 && response.status < 300) return { ok: true }
      if (response.status === 207) return { ok: true }
      return { ok: false, reason: 'error' }
    } catch {
      return { ok: false, reason: 'offline' }
    }
  }

  async list(): Promise<RemoteListing[]> {
    const files: RemoteListing[] = []
    const seen = new Set<string>()
    await this.walk('', files, seen)
    return files
  }

  async read(rel: string): Promise<Buffer> {
    const response = await this.call('GET', rel)
    if (response.status !== 200) throw new Error('io')
    return response.body
  }

  async write(rel: string, data: Buffer): Promise<WrittenFile> {
    await this.ensureParents(rel)
    const response = await this.call('PUT', rel, data)
    if (response.status !== 200 && response.status !== 201 && response.status !== 204)
      throw new Error('io')
    const modified = Date.parse(response.headers['last-modified'] ?? '')
    return { size: data.length, mtimeMs: Number.isFinite(modified) ? modified : Date.now() }
  }

  async rename(from: string, to: string): Promise<void> {
    await this.move(from, to)
  }

  async trash(rel: string, when: Date): Promise<string> {
    const dest = trashRel(rel, when)
    await this.ensureCollection('.nas-sync-trash')
    const stamp = dest.split('/')[1]
    if (stamp) await this.ensureCollection(`.nas-sync-trash/${stamp}`)
    await this.ensureParents(dest)
    await this.move(rel, dest)
    return dest
  }

  private async walk(dir: string, files: RemoteListing[], seen: Set<string>): Promise<void> {
    if (seen.has(dir)) return
    seen.add(dir)
    const response = await this.call('PROPFIND', dir, PROPFIND_BODY, { Depth: '1' })
    if (response.status !== 207 && response.status !== 200) throw new Error('io')
    const rows = parsePropfind(response.body.toString('utf8'), this.opts.url)
    for (const row of rows) {
      if (!row.rel || row.rel === dir) continue
      if (shouldSkipRel(row.rel)) continue
      if (row.isDir) await this.walk(row.rel, files, seen)
      else files.push(row)
    }
  }

  private async move(from: string, to: string): Promise<void> {
    const destination = joinDav(this.opts.url, to)
    const response = await this.call('MOVE', from, undefined, {
      Destination: destination,
      Overwrite: 'F',
    })
    if (response.status !== 201 && response.status !== 204) throw new Error('io')
  }

  private async ensureParents(rel: string): Promise<void> {
    const parts = rel.split('/').slice(0, -1)
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      await this.ensureCollection(acc)
    }
  }

  private async ensureCollection(rel: string): Promise<void> {
    const response = await this.call('MKCOL', rel)
    if (response.status === 201 || response.status === 405 || response.status === 301) return
    if (response.status >= 200 && response.status < 300) return
    throw new Error('io')
  }

  private call(
    method: string,
    rel: string,
    body?: Buffer | string,
    extra?: Record<string, string>,
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(this.opts.username, this.opts.password),
      ...extra,
    }
    const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
    if (payload && method === 'PROPFIND') headers['Content-Type'] = 'application/xml; charset=utf-8'
    return this.transport.request({
      method,
      url: joinDav(this.opts.url, rel),
      headers,
      body: payload,
      rejectUnauthorized: !this.opts.allowInsecureTls,
    })
  }
}

const nodeHttpsTransport: HttpTransport = {
  request(input) {
    return requestHttps(input, 0)
  },
}

function requestHttps(
  input: Parameters<HttpTransport['request']>[0],
  redirects: number,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url)
    if (url.protocol !== 'https:') {
      reject(new Error('bad-url'))
      return
    }
    const req = httpsRequest(
      url,
      {
        method: input.method,
        headers: input.headers,
        rejectUnauthorized: input.rejectUnauthorized,
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (location && [301, 302, 307, 308].includes(status) && redirects < 5) {
          res.resume()
          let next: URL
          try {
            next = new URL(location, url)
          } catch {
            reject(new Error('bad-url'))
            return
          }
          if (next.protocol !== 'https:') {
            reject(new Error('bad-url'))
            return
          }
          const headers = { ...input.headers }
          if (next.host !== url.host) delete headers.Authorization
          resolve(requestHttps({ ...input, url: next.toString(), headers }, redirects + 1))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_FILE_BYTES) {
            req.destroy()
            reject(Object.assign(new Error('too-large'), { code: 'too-large' }))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') headers[key.toLowerCase()] = value
            else if (Array.isArray(value)) headers[key.toLowerCase()] = value.join(', ')
          }
          resolve({ status, headers, body: Buffer.concat(chunks) })
        })
      },
    )
    req.setTimeout(20_000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', reject)
    if (input.body) req.end(input.body)
    else req.end()
  })
}
