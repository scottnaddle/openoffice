import { isAbsolute, relative, resolve, sep } from 'node:path'

/** True when `target` is `root` or a path inside it. Does not follow symlinks. */
export function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

/** Resolve a relative template path and refuse anything that leaves the folder. */
export function resolveInside(root: string, relativePath: string): string | null {
  if (!relativePath || relativePath.includes('\0')) return null
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.split('/').some((part) => part === '..' || part === '')) return null
  const target = resolve(root, ...normalized.split('/'))
  return isPathInside(root, target) ? target : null
}

export function toRelativePosix(root: string, target: string): string {
  return relative(root, target).split(sep).join('/')
}
