import { GRAPH_USER_READ } from './config'
import { fetchGraphMe, type GraphTransport } from './graph'
import { openMicrosoftLogin } from './login-url'
import { profileFromSources, type GraphMe, type MicrosoftProfile } from './profile'

export interface EntraTokenResult {
  accessToken: string
  username: string
  name: string
  homeAccountId: string
  claims: Record<string, unknown>
}

/**
 * The real client is MSAL's public-client auth-code + PKCE flow.
 * `acquireInteractive` opens the system browser only through `openBrowser`.
 * This module refuses any URL that is not a Microsoft login host.
 */
export interface EntraClient {
  acquireInteractive(
    scopes: string[],
    openBrowser: (url: string) => Promise<void>,
  ): Promise<EntraTokenResult>
  acquireSilent(scopes: string[]): Promise<string | null>
}

export async function signInWithMicrosoft(opts: {
  client: EntraClient
  openExternal: (url: string) => Promise<void>
  bearerScopes: string[]
  fetchMe?: (token: string) => Promise<GraphMe | null>
  graphTransport?: GraphTransport
}): Promise<MicrosoftProfile> {
  const openBrowser = (url: string) => openMicrosoftLogin(url, opts.openExternal)
  const result = await opts.client.acquireInteractive([GRAPH_USER_READ], openBrowser)
  const graph = opts.fetchMe
    ? await opts.fetchMe(result.accessToken)
    : await fetchGraphMe(result.accessToken, opts.graphTransport)
  const profile = profileFromSources({
    username: result.username,
    name: result.name,
    homeAccountId: result.homeAccountId,
    claims: result.claims,
    graph,
  })
  if (!profile) throw new Error('entra-failed')
  const extra = opts.bearerScopes.filter((scope) => scope !== GRAPH_USER_READ)
  if (extra.length > 0) {
    const silent = await opts.client.acquireSilent(extra)
    if (!silent) await opts.client.acquireInteractive(extra, openBrowser)
  }
  return profile
}
