// Copy a template and fill placeholders. The template file itself is never written.
import { metaFromFrontMatter } from './metadata'
import { replacePlaceholders, replacePlaceholdersInXml } from './placeholders'
import { unzipSync, zipSync } from './zip'
import type { ZipEntry } from './zip'

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'html', 'htm'])
const ZIP_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'hwpx'])

function shouldFillPart(name: string): boolean {
  if (name === '[Content_Types].xml' || name.endsWith('.rels')) return false
  return (
    name.endsWith('.xml') || name.endsWith('.txt') || name.endsWith('.html') || name.endsWith('.md')
  )
}

export function applyToTextFile(text: string, values: Record<string, string>): string {
  const { body } = metaFromFrontMatter(text, '')
  return replacePlaceholders(body, values)
}

export function applyToZip(bytes: Buffer, values: Record<string, string>): Buffer {
  const entries = unzipSync(bytes)
  const next: ZipEntry[] = []
  const names = [...entries.keys()]
  if (names[0] !== 'mimetype' && entries.has('mimetype')) {
    names.splice(names.indexOf('mimetype'), 1)
    names.unshift('mimetype')
  }
  for (const name of names) {
    const data = entries.get(name)
    if (!data) continue
    if (name === 'mimetype') {
      next.push({ name, data, method: 0 })
      continue
    }
    if (!shouldFillPart(name)) {
      next.push({ name, data })
      continue
    }
    const text = data.toString('utf8')
    const filled = name.endsWith('.xml')
      ? replacePlaceholdersInXml(text, values)
      : replacePlaceholders(text, values)
    next.push({ name, data: Buffer.from(filled) })
  }
  return zipSync(next)
}

export function applyPlaceholders(
  bytes: Buffer,
  extension: string,
  values: Record<string, string>,
): Buffer {
  const ext = extension.toLowerCase().replace(/^\./, '')
  if (TEXT_EXTENSIONS.has(ext)) {
    return Buffer.from(applyToTextFile(bytes.toString('utf8'), values))
  }
  if (ZIP_EXTENSIONS.has(ext)) return applyToZip(bytes, values)
  return Buffer.from(bytes)
}
