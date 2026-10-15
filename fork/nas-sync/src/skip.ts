const SKIP_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized'])

/**
 * Temp files, Office lock files, and the sync trash itself are not mirrored.
 * Relative paths use forward slashes.
 */
export function shouldSkipRel(rel: string): boolean {
  if (!rel || rel.includes('\\') || rel.includes('\0')) return true
  const parts = rel.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return true
  if (parts.some((part) => part === '.nas-sync-trash' || part === '.nas-sync' || part === '.git')) {
    return true
  }
  const base = parts[parts.length - 1] ?? ''
  if (SKIP_BASENAMES.has(base)) return true
  if (base.startsWith('~$') || base.startsWith('.~lock.') || base.startsWith('.#')) return true
  if (base.endsWith('.tmp') || base.endsWith('.temp') || base.endsWith('.partial')) return true
  if (base.endsWith('.crdownload') || base.endsWith('.download') || base.endsWith('.lock')) {
    return true
  }
  if (base.endsWith('.nas-sync-tmp')) return true
  if (base.endsWith('~') && base.length > 1) return true
  return false
}
