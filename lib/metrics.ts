import { keys } from './keys'
import type { WaveRedis } from './redis'
import { epochSeconds } from './time'
import type { ChannelRecord, ParticipantRecord } from './types'

/**
 * The six counts in PRODUCT section 14, and nothing else.
 *
 * Every value here is an integer in a dated bucket. There is no channel ID, no
 * participant ID, no name, and no text in any key or any value — a counter
 * cannot be joined back to the channel that incremented it, which is what
 * "counts only" has to mean to be worth saying.
 *
 * Two retentions, deliberately different. The aggregates outlive the channels
 * they came from, because "channels created per week" is useless if it dies
 * with the week. Anything that identifies a *particular* channel — the markers
 * that stop one channel being counted twice — is stored in that channel's own
 * `emitted` set and dies with it at expiry, along with everything else.
 *
 * Nothing in here may break a request. A counter that fails to increment costs
 * a number on a dashboard; a post that fails because of it costs a message
 * between two agents, which is the entire product. Every call is swallowed.
 */

/** How long an aggregate lives. Long enough for a quarter-over-quarter read. */
export const METRICS_RETENTION_DAYS = 90

const METRIC_TTL_SECONDS = METRICS_RETENTION_DAYS * 24 * 60 * 60

/**
 * Agent products we expect, so the key space stays bounded. `client` is
 * self-reported free text, and an unbounded key space fed by strangers is a
 * way to fill a Redis, so anything unrecognised becomes `other` rather than a
 * key of its own.
 */
const KNOWN_CLIENTS = [
  'claude-code',
  'claude-cowork',
  'codex-cli',
  'cursor',
  'antigravity',
  'gemini-cli',
  'browser',
  'wave-cli',
] as const

/** Buckets for time-to-second-agent, in seconds. A histogram, not a list of durations. */
const JOIN_DELAY_BUCKETS = [30, 60, 300, 900, 3_600, 21_600] as const

/**
 * Answers that name no client at all. Two kinds reach the join call: the
 * `CLIENT` placeholder from the prompt in PRODUCT section 7 left exactly as it
 * was written, and a model or vendor name given where a product was asked for.
 *
 * Both have to be caught before the alias matching below, which reads `claude`
 * out of `<your agent product, e.g. claude-code or codex-cli>` and out of
 * `claude-sonnet-4-5`, and counts either as a harness. That is worse than
 * losing them: the bucket they land in is whichever product the prompt happens
 * to name first, so every agent that skipped the instruction accrues to the
 * largest count rather than spreading across the rest, and a distribution whose
 * biggest entry is also where its errors go cannot answer the question section
 * 14 keeps it for.
 *
 * They fold to `unknown` rather than `other`, because nothing was learned about
 * the client, which is a different fact from a client there is no key for.
 */
const NOT_A_CLIENT = [
  /[<>]/,
  /^claude-(opus|sonnet|haiku|fable|instant)\b/,
  /^(opus|sonnet|haiku)(-|$)/,
  /^gpt[-0-9]/,
  /^o[0-9]/,
  /^gemini-[0-9]/,
]

export function normaliseClient(raw: string | undefined): string {
  if (!raw) return 'unknown'
  const slug = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  const known = KNOWN_CLIENTS.find((name) => slug === name || slug.startsWith(`${name}-`))
  if (known) return known
  if (NOT_A_CLIENT.some((pattern) => pattern.test(slug))) return 'unknown'
  // Common aliases an agent might report for itself.
  if (slug.includes('cowork')) return 'claude-cowork'
  if (slug.includes('claude')) return 'claude-code'
  if (slug.includes('codex')) return 'codex-cli'
  if (slug.includes('cursor')) return 'cursor'
  // Antigravity replaced Gemini CLI for individuals on 2026-06-18 (#40). Both
  // keys stay: `gemini-cli` still has counts behind it from before the switch,
  // and an agent on a paid key can still report it.
  if (slug.includes('antigravity') || slug === 'agy') return 'antigravity'
  if (slug.includes('gemini')) return 'gemini-cli'
  return 'other'
}

export function joinDelayBucket(seconds: number): string {
  const found = JOIN_DELAY_BUCKETS.find((edge) => seconds <= edge)
  return found === undefined ? 'over-6h' : `under-${found}s`
}

/** UTC, so the same channel counts on the same day wherever it was created. */
export function metricDay(at: number = epochSeconds()): string {
  return new Date(at * 1000).toISOString().slice(0, 10)
}

async function bump(redis: WaveRedis, name: string): Promise<void> {
  const key = keys.metric(metricDay(), name)
  await redis.incr(key)
  await redis.expire(key, METRIC_TTL_SECONDS)
}

/** Runs a counter and swallows anything it throws. Analytics never fail a request. */
async function quietly(work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch {
    // Deliberately silent: the value of one counter is never worth an error
    // path in a request that was otherwise fine.
  }
}

/** Marks something as counted for this channel, returning false if it already was. */
async function markOnce(redis: WaveRedis, channelId: string, marker: string): Promise<boolean> {
  const added = await redis.sAdd(keys.emitted(channelId), `m:${marker}`)
  return added > 0
}

export async function countChannelCreated(redis: WaveRedis): Promise<void> {
  await quietly(() => bump(redis, 'channels_created'))
}

/**
 * A join. Always counts the client; counts the channel once, when its second
 * agent arrives, along with how long that took.
 */
export async function countJoin(
  redis: WaveRedis,
  channel: ChannelRecord,
  participant: ParticipantRecord,
  agentsPresent: number,
): Promise<void> {
  await quietly(async () => {
    if (participant.role === 'agent') {
      await bump(redis, `client:${normaliseClient(participant.client)}`)
    }
    if (participant.role !== 'agent' || agentsPresent < 2) return
    if (!(await markOnce(redis, channel.id, 'two_agents'))) return

    await bump(redis, 'channels_two_agents')
    const waited = Math.max(0, epochSeconds() - channel.created_at)
    await bump(redis, `second_join:${joinDelayBucket(waited)}`)
  })
}

/**
 * A message. Counts the channel once when a second, different agent speaks —
 * that is the definition of an exchange in section 14 — and once when any
 * agent says it is done.
 */
export async function countMessage(
  redis: WaveRedis,
  channel: ChannelRecord,
  participant: ParticipantRecord,
  kind: string,
): Promise<void> {
  await quietly(async () => {
    if (participant.role !== 'agent') return

    if (kind === 'done' && (await markOnce(redis, channel.id, 'done'))) {
      await bump(redis, 'channels_done')
    }

    // Cheap path once a channel has already been counted: one set lookup.
    if (await redis.sIsMember(keys.emitted(channel.id), 'm:exchange')) return

    const firstKey = keys.firstPoster(channel.id)
    const first = await redis.get(firstKey)
    if (!first) {
      await redis.set(firstKey, participant.id)
      await redis.expireAt(firstKey, channel.expires_at)
      return
    }
    if (first === participant.id) return

    if (await markOnce(redis, channel.id, 'exchange')) {
      await bump(redis, 'channels_exchanged')
    }
  })
}

/** Reads one day's counters back. For an operator with redis access, not an endpoint. */
export async function readMetric(redis: WaveRedis, name: string, day = metricDay()): Promise<number> {
  const raw = await redis.get(keys.metric(day, name))
  return raw ? Number(raw) : 0
}
