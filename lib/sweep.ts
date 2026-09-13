import { listParticipants } from './channels'
import { appendItem } from './items'
import { keys } from './keys'
import { PRESENCE } from './limits'
import { saveParticipant } from './participants'
import { forgetActiveChannel, type WaveRedis } from './redis'
import { epochSeconds } from './time'
import { parseChannel, toAuthor, type ChannelRecord } from './types'

/**
 * The sweep (ARCHITECTURE section 5).
 *
 * Presence itself needs no sweep: the roster derives idle and gone from
 * last_seen on read. What needs a trigger is writing the events into the
 * transcript, and that trigger is any request that touches the channel. Writing
 * one is an append like any other, so it wakes every poll holding the channel
 * and reaches the people waiting for it at once. A channel nobody is
 * touching gets its events on the next daily cron run, or when someone shows
 * up — which is the same thing, because the events exist to tell participants
 * something and an untouched channel has nobody to tell.
 */

export type SweepResult = { timed_out: number; expiring: boolean }

/**
 * Claims a one-shot event. The set add is atomic, so of any number of requests
 * racing to sweep the same channel exactly one emits.
 */
async function claim(redis: WaveRedis, channelId: string, marker: string): Promise<boolean> {
  return (await redis.sAdd(keys.emitted(channelId), marker)) === 1
}

export async function sweepChannel(
  redis: WaveRedis,
  channel: ChannelRecord,
  now: number = epochSeconds(),
): Promise<SweepResult> {
  const result: SweepResult = { timed_out: 0, expiring: false }

  for (const participant of await listParticipants(redis, channel.id)) {
    const silentFor = now - participant.last_seen
    const stillHere = participant.left_at === undefined && participant.state !== 'gone'
    if (!stillHere || silentFor < PRESENCE.goneAfter) continue
    if (!(await claim(redis, channel.id, `timed_out:${participant.id}`))) continue

    await saveParticipant(redis, channel, { ...participant, state: 'gone' })
    await appendItem(redis, channel, {
      type: 'system',
      event: 'participant.timed_out',
      subject: toAuthor(participant),
    })
    result.timed_out += 1
  }

  const timeLeft = channel.expires_at - now
  if (timeLeft > 0 && timeLeft <= PRESENCE.expiringWarningBefore) {
    if (await claim(redis, channel.id, 'expiring')) {
      await appendItem(redis, channel, { type: 'system', event: 'channel.expiring' })
      result.expiring = true
    }
  }

  return result
}

/**
 * Sweeps every live channel and drops expired ones from the work list. Their
 * keys are already gone: every key carries EXPIREAT, so Redis deletes a channel
 * on time whether or not this ever runs.
 */
export async function sweepAllChannels(
  redis: WaveRedis,
  now: number = epochSeconds(),
): Promise<{ swept: number; retired: number; timed_out: number; expiring: number }> {
  const totals = { swept: 0, retired: 0, timed_out: 0, expiring: 0 }

  for (const channelId of await redis.zRangeByScore(keys.activeChannels(), 0, now)) {
    await forgetActiveChannel(redis, channelId)
    totals.retired += 1
  }

  for (const channelId of await redis.zRangeByScore(keys.activeChannels(), now + 1, Number.MAX_SAFE_INTEGER)) {
    const channel = parseChannel(await redis.hGetAll(keys.channel(channelId)))
    if (!channel) {
      // Expired between the two reads, or purged by close. Nothing to sweep.
      await forgetActiveChannel(redis, channelId)
      totals.retired += 1
      continue
    }
    const result = await sweepChannel(redis, channel, now)
    totals.swept += 1
    totals.timed_out += result.timed_out
    totals.expiring += result.expiring ? 1 : 0
  }

  return totals
}
