// Walk a company templates folder. The folder may be a NAS mount or a synced
// directory, so the walk is shallow, skips lock and trash files, and does not
// follow symlinks.
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { CategoryId } from './categories'
import { normalizeCategory } from './categories'
import { metaFromFrontMatter, parseSidecar } from './metadata'
import type { TemplateMeta } from './metadata'
import { extractPlaceholders, visibleText } from './placeholders'
import { toRelativePosix } from './paths'
import { unzipSync } from './zip'

export const TEMPLATE_EXTENSIONS = new Set([
  'docx',
  'xlsx',
  'pptx',
  'hwpx',
  'hwp',
  'md',
  'markdown',
  'txt',
  'html',
  'htm',
])

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'html', 'htm'])
const ZIP_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'hwpx'])

/** Directory names that are never templates. `.nas-sync-trash` is the NAS sync trash. */
export const SKIP_DIR_NAMES = new Set(['.nas-sync-trash', '.nas-sync', 'node_modules', '.git'])

export const DEFAULT_MAX_FILES = 500
export const DEFAULT_MAX_DEPTH = 6
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export interface ScanLimits {
  maxFiles?: number
  maxDepth?: number
  maxBytes?: number
}

export interface ScannedTemplate {
  absolutePath: string
  relativePath: string
  name: string
  category: CategoryId
  description: string
  extension: string
  placeholders: string[]
  previewText: string
  thumbnailPath?: string
  size: number
  mtimeMs: number
}

export function shouldSkipName(name: string): boolean {
  if (!name || name.startsWith('.')) return true
  if (name.startsWith('~$') || name.startsWith('~')) return true
  if (name.endsWith('.tmp') || name.endsWith('.bak') || name.endsWith('.crdownload')) return true
  if (name.endsWith('.thumb.svg') || name.endsWith('.thumb.png')) return true
  return false
}

function extensionOf(name: string): string {
  return extname(name).slice(1).toLowerCase()
}

function sidecarPath(filePath: string): string {
  return `${filePath}.json`
}

function readSidecar(
  filePath: string,
  fallbackName: string,
  folderCategory?: CategoryId,
): TemplateMeta | null {
  try {
    return parseSidecar(readFileSync(sidecarPath(filePath), 'utf8'), fallbackName, folderCategory)
  } catch {
    return null
  }
}

function thumbnailBeside(filePath: string, meta: TemplateMeta | null): string | undefined {
  if (meta?.thumbnail) {
    const candidate = join(dirname(filePath), meta.thumbnail)
    try {
      const stat = lstatSync(candidate)
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 150_000) return candidate
    } catch {
      /* missing thumbnail */
    }
  }
  for (const suffix of ['.thumb.svg', '.thumb.png']) {
    const candidate = `${filePath}${suffix}`
    try {
      const stat = lstatSync(candidate)
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 150_000) return candidate
    } catch {
      /* no sibling thumbnail */
    }
  }
  return undefined
}

function zipText(bytes: Buffer): string {
  try {
    const entries = unzipSync(bytes)
    const parts: string[] = []
    for (const [name, data] of entries) {
      if (name.endsWith('.xml') || name.endsWith('.txt') || name.endsWith('.html')) {
        const text = data.toString('utf8')
        parts.push(name.endsWith('.xml') ? visibleText(text) : text)
      }
    }
    return parts.join('\n')
  } catch {
    return ''
  }
}

function readTemplateText(
  filePath: string,
  extension: string,
  size: number,
  maxBytes: number,
): { text: string; body: string } {
  if (size > maxBytes) return { text: '', body: '' }
  if (ZIP_EXTENSIONS.has(extension)) {
    const text = zipText(readFileSync(filePath))
    return { text, body: text }
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = metaFromFrontMatter(raw, '')
    return { text: parsed.body, body: parsed.body }
  }
  return { text: '', body: '' }
}

export function scanTemplateDir(root: string, limits: ScanLimits = {}): ScannedTemplate[] {
  const maxFiles = limits.maxFiles ?? DEFAULT_MAX_FILES
  const maxDepth = limits.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES
  const found: ScannedTemplate[] = []

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || found.length >= maxFiles) return
    let entries: {
      name: string
      isDirectory: () => boolean
      isFile: () => boolean
      isSymbolicLink: () => boolean
    }[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) return
      if (entry.isSymbolicLink()) continue
      if (shouldSkipName(entry.name) || SKIP_DIR_NAMES.has(entry.name)) continue
      const full = join(dir, entry.name)
      let stat
      try {
        stat = lstatSync(full)
      } catch {
        continue
      }
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) walk(full, depth + 1)
        continue
      }
      if (!stat.isFile()) continue
      const extension = extensionOf(entry.name)
      if (!TEMPLATE_EXTENSIONS.has(extension)) continue
      const fallbackName = basename(entry.name, extname(entry.name))
      const parent = basename(dir)
      const folderCategory = dir === root ? undefined : normalizeCategory(parent, 'other')
      const folderHint = folderCategory && folderCategory !== 'other' ? folderCategory : undefined
      const sidecar = readSidecar(full, fallbackName, folderHint)
      let textMeta = sidecar
      let previewSource = ''
      if (TEXT_EXTENSIONS.has(extension) && stat.size <= maxBytes) {
        try {
          const raw = readFileSync(full, 'utf8')
          const parsed = metaFromFrontMatter(raw, fallbackName, folderHint)
          previewSource = parsed.body
          if (!sidecar) textMeta = parsed.meta
        } catch {
          /* unreadable text template: keep the sidecar, with no preview */
        }
      } else {
        const read = readTemplateText(full, extension, stat.size, maxBytes)
        previewSource = read.body
      }
      const meta = textMeta ?? {
        name: fallbackName,
        category: folderHint ?? 'other',
        description: '',
        placeholders: [],
      }
      const placeholders = [
        ...new Set([...meta.placeholders, ...extractPlaceholders(previewSource)]),
      ]
      found.push({
        absolutePath: full,
        relativePath: toRelativePosix(root, full),
        name: meta.name || fallbackName,
        category: meta.category,
        description: meta.description,
        extension,
        placeholders,
        previewText: previewSource.replace(/\s+/g, ' ').trim().slice(0, 180),
        thumbnailPath: thumbnailBeside(full, sidecar),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    }
  }

  try {
    const rootStat = lstatSync(root)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return []
  } catch {
    return []
  }
  walk(root, 0)
  found.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return found
}

export function folderFingerprint(root: string): string {
  const files = scanTemplateDir(root)
  return files
    .map((file) => `${file.relativePath}:${file.size}:${Math.round(file.mtimeMs)}`)
    .join('\n')
}
