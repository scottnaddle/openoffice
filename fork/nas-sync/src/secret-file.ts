import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * The file holds ciphertext only. The caller supplies encrypt/decrypt
 * (Electron safeStorage on macOS, which uses the login keychain).
 */
export function writeSealedString(
  file: string,
  plain: string,
  encrypt: (plain: string) => Buffer,
): void {
  const sealed = encrypt(plain)
  if (sealed.equals(Buffer.from(plain, 'utf8'))) throw new Error('plaintext-password')
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString('hex')}.nas-sync-tmp`
  writeFileSync(tmp, sealed)
  renameSync(tmp, file)
}

export function writePasswordFile(
  file: string,
  password: string,
  encrypt: (plain: string) => Buffer,
): void {
  writeSealedString(file, password, encrypt)
}

export function readPasswordFile(file: string, decrypt: (blob: Buffer) => string): string {
  try {
    return decrypt(readFileSync(file))
  } catch {
    return ''
  }
}
