import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPasswordFile, writePasswordFile } from '../src/secret-file'
import { normalizeSettings, saveSettings } from '../src/settings'

describe('NAS settings and the password file', () => {
  it('stores settings without a password field', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nas-settings-'))
    try {
      const normalized = normalizeSettings(
        {
          enabled: true,
          backend: 'webdav',
          webdavUrl: 'https://nas.example/office',
          username: 'ada',
          password: 's3cret-value',
          intervalMinutes: 15,
          workspacePath: '/Users/ada/Documents/IeumOffice',
          allowInsecureTls: false,
        },
        '/Users/ada/Documents/IeumOffice',
      )
      expect(normalized.ok).toBe(true)
      if (!normalized.ok) return
      expect(normalized.password).toBe('s3cret-value')
      expect(normalized.settings).not.toHaveProperty('password')
      const file = path.join(root, 'settings.json')
      saveSettings(file, normalized.settings)
      const body = readFileSync(file, 'utf8')
      expect(body).not.toContain('s3cret-value')
      expect(body).not.toContain('"password"')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects http, passwords inside URLs, and a workspace nested in the mount', () => {
    const base = {
      enabled: true,
      username: 'ada',
      intervalMinutes: 15,
      workspacePath: '/Users/ada/Documents/IeumOffice',
    }
    expect(
      normalizeSettings(
        { ...base, backend: 'webdav', webdavUrl: 'http://nas.example/office' },
        base.workspacePath,
      ).ok,
    ).toBe(false)
    expect(
      normalizeSettings(
        { ...base, backend: 'webdav', webdavUrl: 'https://ada:s3cret@nas.example/office' },
        base.workspacePath,
      ).ok,
    ).toBe(false)
    expect(
      normalizeSettings(
        {
          ...base,
          backend: 'smb',
          smbPath: '/Volumes/Share',
          smbUrl: 'smb://ada:s3cret@nas/Share',
        },
        base.workspacePath,
      ).ok,
    ).toBe(false)
    const overlap = normalizeSettings(
      {
        ...base,
        backend: 'smb',
        smbPath: '/Users/ada/Documents/IeumOffice',
        workspacePath: '/Users/ada/Documents/IeumOffice/nested',
      },
      base.workspacePath,
    )
    expect(overlap).toEqual({ ok: false, error: 'paths-overlap' })
  })

  it('writes only ciphertext for the password', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nas-secret-'))
    const file = path.join(root, 'secret.bin')
    const password = 's3cret-value'
    try {
      expect(() =>
        writePasswordFile(file, password, (plain) => Buffer.from(plain, 'utf8')),
      ).toThrow('plaintext-password')
      writePasswordFile(file, password, (plain) =>
        Buffer.from(plain, 'utf8').map((byte) => byte ^ 0x5a),
      )
      const stored = readFileSync(file)
      expect(stored.includes(Buffer.from(password))).toBe(false)
      const opened = readPasswordFile(file, (blob) =>
        Buffer.from(blob.map((byte) => byte ^ 0x5a)).toString('utf8'),
      )
      expect(opened).toBe(password)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
