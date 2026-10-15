import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { applyPlaceholders } from './apply'
import {
  builtinById,
  builtinPlaceholderNames,
  builtinTemplates,
  documentThumbnail,
  thumbnailDataUrl,
} from './builtin'
import { resolveInside } from './paths'
import type { TemplateCard } from './public'
import { scanTemplateDir } from './scan'
import type { ScannedTemplate } from './scan'

function thumbnailForFile(file: ScannedTemplate): string {
  if (file.thumbnailPath) {
    try {
      const bytes = readFileSync(file.thumbnailPath)
      if (file.thumbnailPath.endsWith('.svg')) return thumbnailDataUrl(bytes.toString('utf8'))
      if (file.thumbnailPath.endsWith('.png'))
        return `data:image/png;base64,${bytes.toString('base64')}`
    } catch {
      /* fall through to the generated card */
    }
  }
  return thumbnailDataUrl(documentThumbnail(file.name, file.extension))
}

export function listTemplateCards(companyRoot: string | null): TemplateCard[] {
  const builtin: TemplateCard[] = builtinTemplates().map((item) => ({
    id: `builtin:${item.id}`,
    source: 'builtin',
    name: item.name,
    category: item.category,
    description: item.description,
    extension: item.extension,
    placeholders: builtinPlaceholderNames(item),
    thumbnailDataUrl: thumbnailDataUrl(documentThumbnail(item.name, item.extension)),
    previewText: item.description,
  }))
  if (!companyRoot) return builtin
  const company: TemplateCard[] = scanTemplateDir(companyRoot).map((file) => ({
    id: `company:${file.relativePath}`,
    source: 'company',
    name: file.name,
    category: file.category,
    description: file.description,
    extension: file.extension,
    placeholders: file.placeholders,
    thumbnailDataUrl: thumbnailForFile(file),
    previewText: file.previewText || file.description,
  }))
  return [...builtin, ...company]
}

export interface TemplateBytes {
  bytes: Buffer
  extension: string
  name: string
}

export function readTemplateBytes(id: string, companyRoot: string | null): TemplateBytes | null {
  if (id.startsWith('builtin:')) {
    const item = builtinById(id.slice('builtin:'.length))
    if (!item) return null
    return { bytes: item.bytes, extension: item.extension, name: item.name }
  }
  if (!id.startsWith('company:') || !companyRoot) return null
  const relativePath = id.slice('company:'.length)
  const full = resolveInside(companyRoot, relativePath)
  if (!full) return null
  try {
    return {
      bytes: readFileSync(full),
      extension: extname(full).slice(1).toLowerCase(),
      name: fileNameOf(relativePath),
    }
  } catch {
    return null
  }
}

function fileNameOf(relativePath: string): string {
  const base = relativePath.split('/').pop() ?? relativePath
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

export function filledTemplate(
  id: string,
  companyRoot: string | null,
  values: Record<string, string>,
): TemplateBytes | null {
  const source = readTemplateBytes(id, companyRoot)
  if (!source) return null
  return {
    ...source,
    bytes: applyPlaceholders(source.bytes, source.extension, values),
  }
}
