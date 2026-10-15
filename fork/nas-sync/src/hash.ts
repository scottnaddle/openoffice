import { createHash } from 'node:crypto'

export const MAX_FILE_BYTES = 256 * 1024 * 1024

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
