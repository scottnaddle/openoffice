/** Only the Microsoft login hosts may be opened for this sign-in. */

const HOSTS = new Set(['login.microsoftonline.com', 'login.microsoft.com'])

export function microsoftLoginUrlAllowed(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  return HOSTS.has(parsed.hostname.toLowerCase())
}

export async function openMicrosoftLogin(
  url: string,
  open: (url: string) => Promise<void>,
): Promise<void> {
  if (!microsoftLoginUrlAllowed(url)) throw new Error('bad-login-url')
  await open(url)
}

export function entraErrorCode(error: unknown): string {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (text.includes('keychain-unavailable') || text.includes('plaintext-password')) {
    return 'keychain-unavailable'
  }
  if (/access_denied|user_cancel|cancel/i.test(text)) return 'entra-cancelled'
  return 'entra-failed'
}
