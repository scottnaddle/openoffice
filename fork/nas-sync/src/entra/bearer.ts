/**
 * Pluggable WebDAV bearer hook.
 * SMB and ordinary NAS WebDAV cannot take an Entra token. The default hook
 * asks MSAL for a silent access token. A site that does accept a bearer token
 * can pass another `WebdavBearerHook` into `authorizationFromHook`.
 */
export interface WebdavBearerHook {
  accessToken(): Promise<string | null>
}

export function bearerAuthorization(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed || /[\s\r\n]/.test(trimmed)) return null
  return `Bearer ${trimmed}`
}

export function authorizationFromHook(hook: WebdavBearerHook): () => Promise<string> {
  return async () => {
    const token = await hook.accessToken()
    const header = token ? bearerAuthorization(token) : null
    if (!header) throw new Error('auth')
    return header
  }
}

export function createBearerHook(getToken: () => Promise<string | null>): WebdavBearerHook {
  return { accessToken: getToken }
}
