import { keys } from './keys'
import { applyTtl, type WaveRedis } from './redis'
import { hashToken, newToken } from './tokens'
import type { ChannelRecord } from './types'

/**
 * Device tokens (ARCHITECTURE section 14): extra keys to one seat, for an
 * account that opens its channel on another device. Each authenticates as the
 * same participant (lib/auth.ts) and can be withdrawn on its own. Nothing here
 * knows about sessions or accounts; lib/accounts/channels.ts keeps that side.
 */

/** A new token for the seat. Returns the plain token once, and its hash for revocation. */
export async function issueDeviceToken(
  redis: WaveRedis,
  channel: ChannelRecord,
  participantId: string,
): Promise<{ token: string; tokenHash: string }> {
  const token = newToken()
  const tokenHash = hashToken(token)
  await redis.hSet(keys.devices(channel.id), { [tokenHash]: participantId })
  await applyTtl(redis, [keys.devices(channel.id)], channel.expires_at)
  return { token, tokenHash }
}

export async function revokeDeviceToken(redis: WaveRedis, channelId: string, tokenHash: string): Promise<void> {
  await redis.hDel(keys.devices(channelId), tokenHash)
}
