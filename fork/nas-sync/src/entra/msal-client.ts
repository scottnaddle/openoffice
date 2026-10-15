import { LogLevel, PublicClientApplication, type ICachePlugin } from '@azure/msal-node'
import { authorityForTenant } from './config'
import type { EntraClient, EntraTokenResult } from './sign-in'

function asClaims(value: object | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function mapResult(result: {
  accessToken?: string
  account: { username?: string; name?: string; homeAccountId?: string } | null
  idTokenClaims?: object
}): EntraTokenResult {
  return {
    accessToken: result.accessToken ?? '',
    username: result.account?.username ?? '',
    name: result.account?.name ?? '',
    homeAccountId: result.account?.homeAccountId ?? '',
    claims: asClaims(result.idTokenClaims),
  }
}

/**
 * Public client. Auth code + PKCE, system browser, and MSAL's loopback
 * redirect (`http://localhost:<port>`). The cache plugin persists only what
 * the caller stores; this module does not write a file.
 */
export function createMsalClient(opts: {
  tenantId: string
  clientId: string
  loadCache: () => string
  storeCache: (serialized: string) => void
}): EntraClient {
  const cachePlugin: ICachePlugin = {
    async beforeCacheAccess(context) {
      const raw = opts.loadCache()
      if (raw) context.tokenCache.deserialize(raw)
    },
    async afterCacheAccess(context) {
      if (context.cacheHasChanged) opts.storeCache(context.tokenCache.serialize())
    },
  }
  const app = new PublicClientApplication({
    auth: {
      clientId: opts.clientId,
      authority: authorityForTenant(opts.tenantId),
    },
    cache: { cachePlugin },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Error,
        piiLoggingEnabled: false,
        loggerCallback() {},
      },
    },
  })
  return {
    async acquireInteractive(scopes, openBrowser) {
      const result = await app.acquireTokenInteractive({ scopes, openBrowser })
      if (!result?.accessToken) throw new Error('entra-failed')
      return mapResult(result)
    },
    async acquireSilent(scopes) {
      const accounts = await app.getAllAccounts()
      const account = accounts[0]
      if (!account) return null
      try {
        const result = await app.acquireTokenSilent({ account, scopes })
        return result?.accessToken || null
      } catch {
        return null
      }
    },
  }
}
