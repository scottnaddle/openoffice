import { request as httpsRequest } from 'node:https'
import type { GraphMe } from './profile'

const ME_URL =
  'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,onPremisesSamAccountName'

export interface GraphTransport {
  request(input: { url: string; token: string }): Promise<{ status: number; body: string } | null>
}

export function parseGraphMe(body: string): GraphMe | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const text = (key: string): string | undefined => {
      const value = parsed[key]
      return typeof value === 'string' ? value : undefined
    }
    return {
      displayName: text('displayName'),
      mail: text('mail'),
      userPrincipalName: text('userPrincipalName'),
      onPremisesSamAccountName: text('onPremisesSamAccountName'),
    }
  } catch {
    return null
  }
}

export async function fetchGraphMe(
  token: string,
  transport: GraphTransport = nodeGraphTransport,
): Promise<GraphMe | null> {
  if (!token.trim() || /[\s\r\n]/.test(token)) return null
  const response = await transport.request({ url: ME_URL, token })
  if (!response || response.status !== 200) return null
  return parseGraphMe(response.body)
}

const nodeGraphTransport: GraphTransport = {
  request({ url, token }) {
    return new Promise((resolve) => {
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        resolve(null)
        return
      }
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'graph.microsoft.com') {
        resolve(null)
        return
      }
      const req = httpsRequest(
        parsed,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        },
        (res) => {
          const status = res.statusCode ?? 0
          if (status >= 300 && status < 400) {
            res.resume()
            resolve(null)
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }))
        },
      )
      req.setTimeout(20_000, () => {
        req.destroy()
        resolve(null)
      })
      req.on('error', () => resolve(null))
      req.end()
    })
  },
}
