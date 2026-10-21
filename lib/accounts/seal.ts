import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Sealing for the one channel secret an account keeps: its invite (AUTH.md
 * 3.12). AES-256-GCM under a key derived from AUTH_SECRET for this purpose
 * alone, with the account and channel ids as associated data, so a value
 * moved to another row does not open.
 */

const VERSION = 'v1'
const INFO = 'wave/account-channel/invite/v1'

const keyCache = new Map<string, Buffer>()

function keyFor(secret: string): Buffer {
  let key = keyCache.get(secret)
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), INFO, 32))
    keyCache.set(secret, key)
  }
  return key
}

const context = (accountId: string, channelId: string) => Buffer.from(`${accountId}\u0000${channelId}`)

export function sealInvite(secret: string, accountId: string, channelId: string, invite: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), nonce)
  cipher.setAAD(context(accountId, channelId))
  const body = Buffer.concat([cipher.update(invite, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `${VERSION}.${nonce.toString('base64url')}.${body.toString('base64url')}`
}

/** The invite, or null for anything that does not open: wrong row, wrong secret, or tampered. */
export function unsealInvite(secret: string, accountId: string, channelId: string, sealed: string): string | null {
  const [version, nonce, body] = sealed.split('.')
  if (version !== VERSION || !nonce || !body) return null
  try {
    const bytes = Buffer.from(body, 'base64url')
    if (bytes.length < 17) return null
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(nonce, 'base64url'))
    decipher.setAAD(context(accountId, channelId))
    decipher.setAuthTag(bytes.subarray(bytes.length - 16))
    return Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
