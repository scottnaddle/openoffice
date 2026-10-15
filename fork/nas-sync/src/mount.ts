/** SMB and WebDAV address checks. Credentials in the URL are rejected so they are not stored or passed to `open`. */

export function smbUrlAllowed(url: string): boolean {
  if (!/^smb:\/\/\S+$/.test(url)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'smb:') return false
  if (parsed.username || parsed.password) return false
  if (!parsed.hostname) return false
  return true
}

export function webdavUrlAllowed(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  if (!parsed.hostname) return false
  return true
}

export interface VolumeId {
  fsidKey: string
}

/**
 * A share mounted at `mountPath` has a different volume id from `/`.
 * A missing path, or a normal folder on the startup disk, is not a mount.
 */
export function mountLooksAttached(
  mountPath: string,
  statfs: (target: string) => VolumeId | null,
): boolean {
  if (!mountPath.startsWith('/')) return false
  const here = statfs(mountPath)
  const root = statfs('/')
  if (!here || !root) return false
  return here.fsidKey !== root.fsidKey
}
