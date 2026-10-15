/** Entra public-client settings. The authority host is fixed so a setting cannot point sign-in at another site. */

export const ENTRA_TENANT_ENV = 'NAS_SYNC_ENTRA_TENANT_ID'
export const ENTRA_CLIENT_ENV = 'NAS_SYNC_ENTRA_CLIENT_ID'
export const GRAPH_USER_READ = 'User.Read'

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function entraBuildDefaults(): { tenantId: string; clientId: string } {
  // Direct property access so the packager can replace these with build-time values.
  return {
    tenantId: (process.env.NAS_SYNC_ENTRA_TENANT_ID ?? '').trim(),
    clientId: (process.env.NAS_SYNC_ENTRA_CLIENT_ID ?? '').trim(),
  }
}

export function tenantIdAllowed(value: string): boolean {
  if (value === 'organizations' || value === 'common' || value === 'consumers') return true
  if (UUID.test(value)) return true
  // A verified domain such as contoso.onmicrosoft.com. A single word is not a tenant.
  if (value.length > 253 || value.includes('..') || !value.includes('.')) return false
  return /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])$/.test(value)
}

export function clientIdAllowed(value: string): boolean {
  return UUID.test(value)
}

export function authorityForTenant(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}`
}

export function resolveEntraConfig(
  settings: { entraTenantId: string; entraClientId: string },
  defaults: { tenantId: string; clientId: string } = entraBuildDefaults(),
): { tenantId: string; clientId: string } | null {
  const tenantId = settings.entraTenantId.trim() || defaults.tenantId.trim()
  const clientId = settings.entraClientId.trim() || defaults.clientId.trim()
  if (!tenantIdAllowed(tenantId) || !clientIdAllowed(clientId)) return null
  return { tenantId, clientId }
}

/** One Graph scope, or several custom scopes separated by spaces. */
export function parseScopes(value: string): string[] | null {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return []
  for (const part of parts) {
    if (part.length > 200 || !/^[A-Za-z0-9:/._-]+$/.test(part)) return null
  }
  return parts
}

export function signInScopes(settings: { webdavAuth: string; webdavScope: string }): string[] {
  const scopes = [GRAPH_USER_READ]
  if (settings.webdavAuth !== 'bearer') return scopes
  const extra = parseScopes(settings.webdavScope) ?? []
  for (const scope of extra) {
    if (!scopes.includes(scope)) scopes.push(scope)
  }
  return scopes
}
