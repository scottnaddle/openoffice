import path from 'node:path'

/** Absolute path for `rel` inside `root`, or throw if it would escape `root`. */
export function resolveInside(root: string, rel: string): string {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) {
    throw new Error('bad-path')
  }
  const parts = rel.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..'))
    throw new Error('bad-path')
  const full = path.resolve(root, ...parts)
  const base = path.resolve(root)
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('bad-path')
  return full
}

export function toRel(root: string, full: string): string {
  const base = path.resolve(root)
  const abs = path.resolve(full)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error('bad-path')
  return abs
    .slice(base.length)
    .replace(/^[/\\]/, '')
    .split(path.sep)
    .join('/')
}

export function pathsOverlap(left: string, right: string): boolean {
  if (!left || !right) return false
  const a = path.resolve(left)
  const b = path.resolve(right)
  if (a === b) return true
  return a.startsWith(b + path.sep) || b.startsWith(a + path.sep)
}
