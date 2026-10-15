import { webdavUrlAllowed } from '../mount'
import type { RemoteListing } from '../types'

export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: Buffer
}

export interface HttpRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: Buffer
  rejectUnauthorized: boolean
}

export interface HttpTransport {
  request(input: HttpRequest): Promise<HttpResponse>
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

export function hrefToRel(href: string, baseUrl: string): string | null {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return null
  }
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  if (url.host !== base.host) return null
  const basePath = decodePath(base.pathname).replace(/\/$/, '')
  const full = decodePath(url.pathname)
  if (full !== basePath && !full.startsWith(`${basePath}/`)) return null
  const rel = full.slice(basePath.length).replace(/^\/+/, '').replace(/\/+$/, '')
  if (!rel) return ''
  if (rel.split('/').some((part) => part === '' || part === '.' || part === '..')) return null
  return rel
}

export function parsePropfind(xml: string, baseUrl: string): RemoteListing[] {
  const rows: RemoteListing[] = []
  const blocks = xml.matchAll(/<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi)
  for (const match of blocks) {
    const block = match[1] ?? ''
    const href = tagText(block, 'href')
    if (!href) continue
    const rel = hrefToRel(href, baseUrl)
    if (rel === null) continue
    const collection = /<(?:[\w.-]+:)?collection\b/i.test(block)
    const length = Number(tagText(block, 'getcontentlength') ?? '')
    const modified = Date.parse(tagText(block, 'getlastmodified') ?? '')
    rows.push({
      rel,
      size: Number.isFinite(length) ? length : 0,
      mtimeMs: Number.isFinite(modified) ? modified : 0,
      isDir: collection || href.endsWith('/'),
    })
  }
  return rows
}

function tagText(block: string, name: string): string | null {
  const match = block.match(
    new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'i'),
  )
  if (!match) return null
  return decodeXml(match[1] ?? '').trim()
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function decodePath(value: string): string {
  return value
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
    .join('/')
}

export function joinDav(baseUrl: string, rel: string): string {
  if (!webdavUrlAllowed(baseUrl)) throw new Error('bad-url')
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/$/, '')
  const encoded = rel
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
  url.pathname = encoded ? `${basePath}/${encoded}` : `${basePath}/`
  url.username = ''
  url.password = ''
  url.hash = ''
  return url.toString()
}

export { PROPFIND_BODY }
