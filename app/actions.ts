'use server'

import { headers } from 'next/headers'
import { getAccountSession } from '@/lib/accounts/auth'
import { countOwnedChannels, rememberOwnedChannel } from '@/lib/accounts/owned'
import { getPool } from '@/lib/accounts/store'
import { createChannel as createChannelRecord, createChannelRequestSchema } from '@/lib/channels'
import { ApiError } from '@/lib/http'
import { enforceLimit } from '@/lib/rate-limit'
import { LIMITS } from '@/lib/limits'
import { getRedis } from '@/lib/redis'

export type CreatedChannelState = {
  channelId: string
  invite: string
  adminToken: string
  url: string
}

export type CreateChannelState = {
  error?: string
  created?: CreatedChannelState
}

/**
 * Create-channel form handler (PRODUCT section 6.1).
 *
 * Returns the channel to the browser rather than redirecting to it: the invite
 * belongs in the URL fragment, and a redirect would put it in a response
 * header on the way there. The admin token is the creator's alone, so it goes
 * to their browser and nowhere else.
 */
export async function createChannel(_previous: CreateChannelState, formData: FormData): Promise<CreateChannelState> {
  const parsed = createChannelRequestSchema.safeParse({
    name: String(formData.get('name') ?? '').trim() || undefined,
    ttl: String(formData.get('ttl') ?? ''),
    max_participants: Number(formData.get('max_participants')),
    mode: String(formData.get('mode') ?? 'standard'),
  })

  if (!parsed.success) {
    const problem = parsed.error.issues[0]
    const field = String(problem.path[0] ?? '')
    return {
      error:
        field === 'ttl'
          ? 'Choose how long the channel should live.'
          : field === 'max_participants'
            ? 'Participants must be a whole number from 2 to 50.'
            : field === 'name'
              ? 'Keep the channel name under 60 characters.'
              : 'Check the form and try again.',
    }
  }

  try {
    const redis = await getRedis()
    const requestHeaders = await headers()
    const address = requestHeaders.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    await enforceLimit(redis, {
      scope: 'create',
      subject: address,
      max: LIMITS.createsPerHourPerIp,
      windowSeconds: 3_600,
    })

    // A signed-in creator owns the channel (AUTH.md 2.8). This action is the
    // only place an owner is written; the API never reads a session.
    const account = await getAccountSession(requestHeaders)
    if (account) {
      await enforceLimit(redis, {
        scope: 'create-account',
        subject: account.user.id,
        max: LIMITS.createsPerHourPerAccount,
        windowSeconds: 3_600,
      })
      if ((await countOwnedChannels(getPool(), account.user.id)) >= LIMITS.ownedChannelsPerAccount) {
        return {
          error: `You own ${LIMITS.ownedChannelsPerAccount} live channels already. Close one, or wait for one to expire.`,
        }
      }
    }

    const channel = await createChannelRecord(redis, parsed.data, { ownerId: account?.user.id })
    if (account) {
      await rememberOwnedChannel(
        getPool(),
        account.user.id,
        channel.channel_id,
        Math.floor(Date.parse(channel.expires_at) / 1000),
      )
    }
    return {
      created: {
        channelId: channel.channel_id,
        invite: channel.invite_token,
        adminToken: channel.admin_token,
        url: channel.url,
      },
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message }
    }
    console.error(`create channel failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`)
    return { error: 'This instance could not create the channel. Try again in a moment.' }
  }
}
