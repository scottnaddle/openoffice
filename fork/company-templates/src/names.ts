import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function safeTemplateBase(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return cleaned || 'template'
}

export function uniquePath(
  dir: string,
  fileName: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let candidate = join(dir, fileName)
  let n = 2
  while (exists(candidate)) {
    candidate = join(dir, `${base} (${n})${ext}`)
    n += 1
    if (n > 500) break
  }
  return candidate
}
