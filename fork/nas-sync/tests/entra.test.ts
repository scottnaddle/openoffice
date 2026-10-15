import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { WebdavBackend } from '../src/backends/webdav'
import { authorizationFromHook, bearerAuthorization } from '../src/entra/bearer'
import { resolveEntraConfig, signInScopes, tenantIdAllowed } from '../src/entra/config'
import { parseGraphMe } from '../src/entra/graph'
import { microsoftLoginUrlAllowed } from '../src/entra/login-url'
import {
  applyAccountUsername,
  conflictUserName,
  nasLoginName,
  parseStoredAccount,
  profileFromSources,
  serializeAccount,
} from '../src/entra/profile'
import { signInWithMicrosoft, type EntraClient } from '../src/entra/sign-in'
import { conflictRelPath } from '../src/names'
import { writeSealedString } from '../src/secret-file'
import { defaultSettings, normalizeSettings } from '../src/settings'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = '22222222-2222-2222-2222-222222222222'

describe('Microsoft sign-in for NAS sync', () => {
  it('uses the typed tenant and client, then the build-time default', () => {
    expect(tenantIdAllowed('organizations')).toBe(true)
    expect(tenantIdAllowed('not a tenant')).toBe(false)
    expect(
      resolveEntraConfig(
        { entraTenantId: TENANT, entraClientId: '' },
        { tenantId: '', clientId: CLIENT },
      ),
    ).toEqual({ tenantId: TENANT, clientId: CLIENT })
    expect(
      resolveEntraConfig(
        { entraTenantId: 'nope', entraClientId: CLIENT },
        { tenantId: TENANT, clientId: CLIENT },
      ),
    ).toBeNull()
  })

  it('prefills the NAS user from the UPN or sAMAccountName and keeps a typed name', () => {
    const profile = profileFromSources({
      username: 'ada@contoso.com',
      name: 'Ada Lovelace',
      homeAccountId: 'home',
      graph: {
        displayName: 'Ada Lovelace',
        mail: 'ada@contoso.com',
        userPrincipalName: 'ada@contoso.com',
        onPremisesSamAccountName: 'ada',
      },
    })
    expect(profile?.email).toBe('ada@contoso.com')
    expect(nasLoginName(profile!, 'upn')).toBe('ada@contoso.com')
    expect(nasLoginName(profile!, 'sam')).toBe('ada')
    expect(nasLoginName({ upn: 'ada@contoso.com', samAccountName: '' }, 'sam')).toBe('ada')

    const settings = {
      ...defaultSettings('/Users/ada/Documents/Office'),
      username: 'shared',
      usernameFollowsAccount: false,
    }
    expect(applyAccountUsername(settings, profile!).username).toBe('shared')
    expect(
      applyAccountUsername({ ...settings, username: '', usernameFollowsAccount: true }, profile!)
        .username,
    ).toBe('ada@contoso.com')
    expect(conflictUserName({ username: '', nasNameKind: 'upn' }, profile, 'mac')).toBe(
      'ada@contoso.com',
    )
    expect(
      conflictRelPath('notes.txt', 'ada@contoso.com', new Date('2026-10-15T00:00:00Z'), new Set()),
    ).toBe('notes (conflict - ada@contoso.com 2026-10-15).txt')
  })

  it('signs in through the system browser and does not open any other host', async () => {
    const opened: string[] = []
    const scopes: string[][] = []
    const client: EntraClient = {
      async acquireInteractive(next, openBrowser) {
        scopes.push(next)
        await openBrowser('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1')
        return {
          accessToken: 'graph-token',
          username: 'ada@contoso.com',
          name: 'Ada',
          homeAccountId: 'home',
          claims: { preferred_username: 'ada@contoso.com' },
        }
      },
      async acquireSilent() {
        return 'nas-token'
      },
    }
    const profile = await signInWithMicrosoft({
      client,
      openExternal: async (url) => {
        opened.push(url)
      },
      bearerScopes: signInScopes({ webdavAuth: 'bearer', webdavScope: 'api://nas/access' }),
      fetchMe: async () => ({
        displayName: 'Ada Lovelace',
        mail: 'ada@contoso.com',
        userPrincipalName: 'ada@contoso.com',
        onPremisesSamAccountName: '',
      }),
    })
    expect(profile.displayName).toBe('Ada Lovelace')
    expect(opened).toEqual(['https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1'])
    expect(scopes[0]).toEqual(['User.Read'])
    expect(microsoftLoginUrlAllowed('http://login.microsoftonline.com/x')).toBe(false)
    expect(microsoftLoginUrlAllowed('https://ada:pw@login.microsoftonline.com/x')).toBe(false)
    const evil: EntraClient = {
      async acquireInteractive(_scopes, openBrowser) {
        await openBrowser('https://evil.example/login')
        return {
          accessToken: 'x',
          username: 'a@b.c',
          name: 'A',
          homeAccountId: 'h',
          claims: {},
        }
      },
      async acquireSilent() {
        return null
      },
    }
    await expect(
      signInWithMicrosoft({
        client: evil,
        openExternal: async () => {
          throw new Error('should-not-open')
        },
        bearerScopes: ['User.Read'],
        fetchMe: async () => null,
      }),
    ).rejects.toThrow('bad-login-url')
  })

  it('sends a bearer token only through the WebDAV hook', async () => {
    expect(bearerAuthorization('tok en')).toBeNull()
    expect(
      parseGraphMe('{"userPrincipalName":"ada@contoso.com","mail":"ada@contoso.com"}')?.mail,
    ).toBe('ada@contoso.com')
    let header = ''
    const backend = new WebdavBackend({
      url: 'https://nas.example/office',
      username: 'ada@contoso.com',
      password: 'not-sent',
      allowInsecureTls: false,
      authorization: authorizationFromHook({
        async accessToken() {
          return 'nas-access'
        },
      }),
      transport: {
        async request(input) {
          header = input.headers.Authorization
          return { status: 207, headers: {}, body: Buffer.from('<d:multistatus/>') }
        },
      },
    })
    await expect(backend.probe()).resolves.toEqual({ ok: true })
    expect(header).toBe('Bearer nas-access')
    expect(header).not.toContain('not-sent')
    const denied = new WebdavBackend({
      url: 'https://nas.example/office',
      username: 'ada',
      password: '',
      allowInsecureTls: false,
      authorization: authorizationFromHook({
        async accessToken() {
          return null
        },
      }),
      transport: {
        async request() {
          throw new Error('should-not-call')
        },
      },
    })
    await expect(denied.probe()).resolves.toEqual({ ok: false, reason: 'auth' })
  })

  it('keeps the token cache sealed and out of settings', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nas-entra-'))
    try {
      const cache = path.join(root, 'msal-cache.bin')
      const plain = '{"AccessToken":"secret-token"}'
      writeSealedString(cache, plain, (value) => Buffer.from(value.split('').reverse().join('')))
      const stored = readFileSync(cache).toString()
      expect(stored).not.toContain('secret-token')
      expect(() => writeSealedString(cache, plain, (value) => Buffer.from(value))).toThrow(
        'plaintext-password',
      )
      const account = serializeAccount({
        displayName: 'Ada',
        email: 'ada@contoso.com',
        upn: 'ada@contoso.com',
        samAccountName: 'ada',
        homeAccountId: 'home',
      })
      expect(account).not.toContain('AccessToken')
      expect(parseStoredAccount(account)?.upn).toBe('ada@contoso.com')
      expect(parseStoredAccount('{"accessToken":"x","upn":"a@b.c"}')).toBeNull()
      const saved = normalizeSettings(
        {
          enabled: false,
          backend: 'smb',
          username: 'ada@contoso.com',
          intervalMinutes: 15,
          workspacePath: '/Users/ada/Documents/Office',
          entraTenantId: TENANT,
          entraClientId: CLIENT,
          nasNameKind: 'upn',
          webdavAuth: 'basic',
        },
        '/Users/ada/Documents/Office',
      )
      expect(saved.ok).toBe(true)
      if (!saved.ok) return
      expect(JSON.stringify(saved.settings)).not.toContain('accessToken')
      const bad = normalizeSettings(
        {
          enabled: true,
          backend: 'webdav',
          webdavUrl: 'https://nas.example/office',
          webdavAuth: 'bearer',
          webdavScope: '',
          intervalMinutes: 15,
          workspacePath: '/Users/ada/Documents/Office',
        },
        '/Users/ada/Documents/Office',
      )
      expect(bad).toEqual({ ok: false, error: 'bearer-scope' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
