// Sidecar JSON next to a template, or YAML-like front matter at the top of a text template.
import type { CategoryId } from './categories'
import { normalizeCategory } from './categories'

export interface TemplateMeta {
  name: string
  category: CategoryId
  description: string
  thumbnail?: string
  /** Extra placeholder names declared by the author. The file is still scanned. */
  placeholders: string[]
}

export function emptyMeta(name: string, category: CategoryId = 'other'): TemplateMeta {
  return { name, category, description: '', placeholders: [] }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseSidecar(
  json: string,
  fallbackName: string,
  folderCategory?: CategoryId,
): TemplateMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const name = asString(record.name) || fallbackName
  const category = normalizeCategory(
    asString(record.category) || undefined,
    folderCategory ?? 'other',
  )
  const description = asString(record.description).slice(0, 400)
  const thumbnail = asString(record.thumbnail)
  const placeholders = Array.isArray(record.placeholders)
    ? record.placeholders
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : []
  return {
    name: name.slice(0, 80),
    category,
    description,
    ...(thumbnail ? { thumbnail: thumbnail.slice(0, 200) } : {}),
    placeholders: placeholders.slice(0, 40),
  }
}

export function serializeSidecar(
  meta: Pick<TemplateMeta, 'name' | 'category' | 'description'>,
): string {
  return `${JSON.stringify(
    { name: meta.name, category: meta.category, description: meta.description },
    null,
    2,
  )}\n`
}

export interface FrontMatter {
  meta: { name?: string; category?: string; description?: string }
  body: string
}

/** A leading `---` block with `name`, `category`, and `description` lines. Other files pass through. */
export function readFrontMatter(text: string): FrontMatter {
  const normalized = text.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { meta: {}, body: text }
  }
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: text }
  const raw = normalized.slice(normalized.indexOf('\n') + 1, end)
  const body = normalized.slice(end + 4).replace(/^\r?\n/, '')
  const meta: FrontMatter['meta'] = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (match[1] === 'name' || match[1] === 'category' || match[1] === 'description') {
      meta[match[1]] = value
    }
  }
  return { meta, body }
}

export function metaFromFrontMatter(
  text: string,
  fallbackName: string,
  folderCategory?: CategoryId,
): { meta: TemplateMeta; body: string } {
  const { meta, body } = readFrontMatter(text)
  return {
    meta: {
      name: (meta.name || fallbackName).slice(0, 80),
      category: normalizeCategory(meta.category, folderCategory ?? 'other'),
      description: (meta.description ?? '').slice(0, 400),
      placeholders: [],
    },
    body,
  }
}
