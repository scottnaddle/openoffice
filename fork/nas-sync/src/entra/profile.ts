/** Account fields safe to show. Tokens never belong in this record. */

export interface MicrosoftProfile {
  displayName: string
  email: string
  upn: string
  samAccountName: string
  homeAccountId: string
}

export interface GraphMe {
  displayName?: string
  mail?: string
  userPrincipalName?: string
  onPremisesSamAccountName?: string
}

export function nasLoginName(
  account: { upn: string; samAccountName: string },
  kind: 'upn' | 'sam',
): string {
  if (kind === 'sam') {
    const sam = account.samAccountName.trim()
    if (sam) return sam
    const at = account.upn.indexOf('@')
    if (at > 0) return account.upn.slice(0, at)
  }
  return account.upn.trim()
}

export function profileFromSources(input: {
  username?: string
  name?: string
  homeAccountId?: string
  claims?: Record<string, unknown>
  graph?: GraphMe | null
}): MicrosoftProfile | null {
  const claim = (key: string): string => {
    const value = input.claims?.[key]
    return typeof value === 'string' ? value.trim() : ''
  }
  const upn =
    input.graph?.userPrincipalName?.trim() ||
    claim('preferred_username') ||
    input.username?.trim() ||
    ''
  if (!upn || upn.length > 256 || /[\s/\\]/.test(upn)) return null
  const email = input.graph?.mail?.trim() || claim('email') || upn
  const displayName =
    input.graph?.displayName?.trim() || input.name?.trim() || claim('name') || email
  const sam = input.graph?.onPremisesSamAccountName?.trim() || claim('onprem_sam_account_name')
  return {
    displayName: displayName.slice(0, 128),
    email: email.slice(0, 256),
    upn,
    samAccountName: sam.slice(0, 64),
    homeAccountId: (input.homeAccountId ?? '').slice(0, 256),
  }
}

export function serializeAccount(account: MicrosoftProfile): string {
  const body = {
    displayName: account.displayName,
    email: account.email,
    upn: account.upn,
    samAccountName: account.samAccountName,
    homeAccountId: account.homeAccountId,
  }
  const text = JSON.stringify(body)
  if (/"accessToken"|"refreshToken"|"idToken"|"password"/.test(text)) {
    throw new Error('token-in-account')
  }
  return text
}

export function parseStoredAccount(text: string): MicrosoftProfile | null {
  if (/"accessToken"|"refreshToken"|"idToken"|"password"/.test(text)) return null
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return profileFromSources({
      username: typeof parsed.upn === 'string' ? parsed.upn : '',
      name: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      homeAccountId: typeof parsed.homeAccountId === 'string' ? parsed.homeAccountId : '',
      graph: {
        mail: typeof parsed.email === 'string' ? parsed.email : '',
        userPrincipalName: typeof parsed.upn === 'string' ? parsed.upn : '',
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
        onPremisesSamAccountName:
          typeof parsed.samAccountName === 'string' ? parsed.samAccountName : '',
      },
    })
  } catch {
    return null
  }
}

export function conflictUserName(
  settings: { username: string; nasNameKind: 'upn' | 'sam' },
  account: MicrosoftProfile | null,
  osUser: string,
): string {
  const typed = settings.username.trim()
  if (typed) return typed
  if (account) return nasLoginName(account, settings.nasNameKind)
  return osUser.trim() || 'user'
}

export function applyAccountUsername<
  T extends { username: string; usernameFollowsAccount: boolean; nasNameKind: 'upn' | 'sam' },
>(settings: T, account: MicrosoftProfile): T {
  if (settings.username.trim() && !settings.usernameFollowsAccount) return settings
  return {
    ...settings,
    username: nasLoginName(account, settings.nasNameKind),
    usernameFollowsAccount: true,
  }
}
