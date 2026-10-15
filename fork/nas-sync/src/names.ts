/** `name (conflict - <user> <date>).ext`, with a numeric suffix if that name is taken. */

export function sanitizeUser(user: string): string {
  const cleaned = user
    .replace(/[^\p{L}\p{N}._-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32)
  return cleaned || 'user'
}

export function formatConflictDate(when: Date): string {
  const year = when.getUTCFullYear()
  const month = String(when.getUTCMonth() + 1).padStart(2, '0')
  const day = String(when.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function trashRel(rel: string, when: Date): string {
  const stamp = when.toISOString().replace(/[:.]/g, '-')
  return `.nas-sync-trash/${stamp}/${rel}`
}

export function conflictRelPath(
  rel: string,
  user: string,
  when: Date,
  taken: ReadonlySet<string>,
): string {
  const slash = rel.lastIndexOf('/')
  const dir = slash >= 0 ? rel.slice(0, slash + 1) : ''
  const file = slash >= 0 ? rel.slice(slash + 1) : rel
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  const ext = dot > 0 ? file.slice(dot) : ''
  const label = `${stem} (conflict - ${sanitizeUser(user)} ${formatConflictDate(when)})`
  let name = `${label}${ext}`
  let n = 2
  while (taken.has(dir + name)) {
    name = `${label} ${n}${ext}`
    n += 1
  }
  return dir + name
}
