// {{이름}} placeholders in template text and in OOXML / HWPX text nodes.
// A placeholder split across runs is filled without touching the other runs.

export const PLACEHOLDER_RE = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g

const DATE_KEYS = new Set(['날짜', 'date', '작성일', '기안일'])
const AUTHOR_KEYS = new Set(['작성자', '기안자', 'author', 'name', '이름'])
const DEPT_KEYS = new Set(['부서', 'department', 'dept'])
const COMPANY_KEYS = new Set(['회사명', '회사', 'company'])

export const MAX_PLACEHOLDER_VALUE = 500
export const MAX_PLACEHOLDERS = 40

export interface TemplateProfile {
  name: string
  department: string
  company: string
}

export const EMPTY_PROFILE: TemplateProfile = { name: '', department: '', company: '' }

export function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const name = match[1].trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/** Leave unknown names in place. Known names become the given value, including an empty string. */
export function replacePlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (full, raw: string) => {
    const name = raw.trim()
    return Object.hasOwn(values, name) ? values[name] : full
  })
}

export function formatTemplateDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Prefill the form. Date is ISO. Profile fields fill the matching names. Anything else starts empty. */
export function prefillPlaceholders(
  names: readonly string[],
  profile: TemplateProfile,
  date: Date,
): Record<string, string> {
  const formatted = formatTemplateDate(date)
  const out: Record<string, string> = {}
  for (const name of names) {
    const key = name.trim()
    if (DATE_KEYS.has(key)) out[name] = formatted
    else if (AUTHOR_KEYS.has(key)) out[name] = profile.name
    else if (DEPT_KEYS.has(key)) out[name] = profile.department
    else if (COMPANY_KEYS.has(key)) out[name] = profile.company
    else out[name] = ''
  }
  return out
}

export function sanitizeValues(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PLACEHOLDERS) break
    const name = key.trim()
    if (!name || name.length > 40 || typeof value !== 'string') continue
    out[name] = value.slice(0, MAX_PLACEHOLDER_VALUE)
  }
  return out
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function encodeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const TEXT_NODE_RE = /<((?:w:t|a:t|hp:t|t))\b([^>]*)>([\s\S]*?)<\/\1>/g

interface Piece {
  innerStart: number
  innerEnd: number
  decoded: string
}

function textPieces(xml: string): Piece[] {
  const pieces: Piece[] = []
  for (const match of xml.matchAll(TEXT_NODE_RE)) {
    const fullStart = match.index ?? 0
    const inner = match[3]
    const close = `</${match[1]}>`
    const innerStart = fullStart + match[0].length - inner.length - close.length
    pieces.push({ innerStart, innerEnd: innerStart + inner.length, decoded: decodeXml(inner) })
  }
  return pieces
}

/**
 * Fill placeholders inside text nodes. A value is XML-escaped.
 * When Word (or a similar writer) splits one placeholder across runs, the value
 * lands in the first run and the leftover pieces of that placeholder are cleared.
 */
export function replacePlaceholdersInXml(xml: string, values: Record<string, string>): string {
  const pieces = textPieces(xml)
  if (pieces.length === 0) return xml
  const ranges: { start: number; end: number; index: number }[] = []
  let cursor = 0
  pieces.forEach((piece, index) => {
    ranges.push({ start: cursor, end: cursor + piece.decoded.length, index })
    cursor += piece.decoded.length
  })
  const joined = pieces.map((piece) => piece.decoded).join('')
  const matches = [...joined.matchAll(PLACEHOLDER_RE)]
  if (matches.length === 0) return xml

  const decoded = pieces.map((piece) => piece.decoded)
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]
    const name = match[1].trim()
    if (!Object.hasOwn(values, name)) continue
    const start = match.index ?? 0
    const end = start + match[0].length
    const involved = ranges.filter((range) => range.end > start && range.start < end)
    if (involved.length === 0) continue
    const first = involved[0]
    const last = involved[involved.length - 1]
    const localStart = start - first.start
    const localEnd = end - last.start
    const value = values[name]
    if (involved.length === 1) {
      const current = decoded[first.index]
      decoded[first.index] = current.slice(0, localStart) + value + current.slice(localEnd)
    } else {
      decoded[first.index] = decoded[first.index].slice(0, localStart) + value
      for (let k = 1; k < involved.length - 1; k++) decoded[involved[k].index] = ''
      decoded[last.index] = decoded[last.index].slice(localEnd)
    }
  }

  let out = xml
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (decoded[i] === pieces[i].decoded) continue
    out = out.slice(0, pieces[i].innerStart) + encodeXml(decoded[i]) + out.slice(pieces[i].innerEnd)
  }
  return out
}

export function visibleText(xml: string): string {
  return textPieces(xml)
    .map((piece) => piece.decoded)
    .join('')
}
