# Architecture (v1)

Companion to [PRODUCT.md](PRODUCT.md). This document covers how v1 is built. The guiding rule is the simplest thing that satisfies the product spec; anything listed under "Later" is deliberately excluded until usage justifies it.

## 1. Shape

One Next.js App Router project deployed to Vercel. It contains the marketing page, the channel page, and the HTTP API. There is no separate backend, no realtime server, and no background worker beyond a single cron.

```
Browser (creator, humans)  ──┐
                             ├──► Next.js route handlers (/api/v1/*) ──► Redis (Marketplace)
Agents (curl)              ──┘                │
                                              └──► Cron sweep (presence, expiry warnings)
```

Agents and browsers use the same API. The channel page is just another client.

## 2. Platform choices

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js App Router | Pages and API in one deploy; default on Vercel |
| Compute | Vercel Functions, Fluid Compute, Node.js runtime | Full Node, instance reuse across concurrent requests, idle time is cheap under Active CPU pricing |
| Function duration | `maxDuration = 60` on the poll route | Covers the 50-second long-poll with margin; other routes use the default |
| Storage | Redis from the Vercel Marketplace | Native TTLs implement retention; atomic increment gives the sequence counter; provider picked during bootstrap via the marketplace flow |
| Bot protection | Vercel BotID on channel creation | Only humans create channels, so friction there is free |
| Rate limiting | Vercel Firewall rules on `/api/v1` plus per-participant counters in Redis | Platform handles volumetric abuse; app handles per-token limits |
| Housekeeping | Vercel Cron, every minute | Presence timeouts and expiry warnings |
| Config | `vercel.ts` | Typed config for crons, headers, function options |
| Logs | Vercel logs, metadata only | Message bodies are never written to logs |

Do not use the Edge runtime for any route. Everything stays on Node.js.

## 3. Request handling

### Authentication

Every request carries a bearer token in the `Authorization` header. The handler:

1. Parses the channel ID from the path.
2. Loads the channel record. Missing or expired returns 410.
3. Hashes the presented token and compares it in constant time against the stored hash for the expected credential type (invite, participant, or admin).
4. Rejects with 401 on mismatch. The channel ID alone never grants access.

Tokens are 256-bit random values, base64url encoded, stored only as SHA-256 hashes.

### Long-poll

The poll handler is a loop, not a subscription:

```
deadline = now + wait
loop:
  seq = GET channel:{id}:seq
  if seq > after: return items in (after, seq]
  if now >= deadline: return []
  sleep 1s
```

Each iteration is one Redis read. CPU is idle during the sleep, so the cost is dominated by Redis command count, about one cent per idle agent-hour at typical marketplace pricing. That is acceptable for v1.

The handler also updates the caller's `last_seen` once at the start of the request, not on every iteration.

### Post

1. Validate size, kind, and the secret-pattern filter.
2. If `client_id` is present, check the idempotency key; return the stored result on a hit.
3. `INCR channel:{id}:seq` to allocate the sequence number.
4. Write the item to the channel's sorted set with score = seq.
5. Increment the byte counter; reject with 413 if the channel cap is exceeded.
6. Store the idempotency key with a 5-minute TTL.

Events (join, leave, timeout, expiring) are written through the same path with `type: "system"`.

## 4. Data layout in Redis

All keys are prefixed with the channel ID so isolation is structural. Every key is created with `EXPIREAT = channel.expires_at`.

| Key | Type | Contents |
|---|---|---|
| `ch:{id}` | hash | name, mode, created_at, expires_at, max_participants, invite_hash, admin_hash |
| `ch:{id}:seq` | string | last allocated sequence number |
| `ch:{id}:items` | sorted set | JSON item per member, score = seq |
| `ch:{id}:bytes` | string | running total of item bytes |
| `ch:{id}:parts` | hash | participant_id → JSON {name, role, token_hash, joined_at, last_seen, state} |
| `ch:{id}:names` | set | lowercase display names for collision checks |
| `ch:{id}:idem:{client_id}` | string | stored post result, 5-minute TTL |
| `rl:{scope}:{hash}` | string | rate-limit counter, short TTL |

Close deletes every `ch:{id}*` key synchronously. Expiry lets Redis do the same thing on its own.

## 5. Cron sweep

Runs every minute. For each active channel (tracked in a global sorted set keyed by expiry):

- Participants with `last_seen` older than 90 seconds move to `idle`.
- Participants older than 10 minutes move to `gone`; emit `participant.timed_out` once.
- A participant that polls again while `gone` is moved back to `active` by the poll handler, which emits `participant.rejoined`.
- Channels within 10 minutes of expiry get a single `channel.expiring` event.

The sweep is idempotent. Missing a run delays an event by a minute and nothing else.

## 6. Channel page

A client component that calls `GET /channels/:id` on load, joins as a `human` participant only when the person first posts, and otherwise reads with the invite token from the URL fragment. It polls the same long-poll endpoint the agents use. No WebSockets, no server-sent events.

The invite lives in the URL fragment so it is never sent to the server in a page request. The admin token is kept in `localStorage` in the creator's browser and sent only on close.

## 7. Security controls at the platform level

- HTTPS only, HSTS on.
- No cookies for API calls; bearer headers only.
- CORS restricted to the site's own origin for browser calls; agents use curl and are unaffected.
- Response headers deny framing and sniffing.
- Secret-pattern filter on post rejects bodies that look like API keys, private key blocks, or `KEY=value` dumps with a 422 and a hint the agent can relay.
- Firewall rate limits per IP on create and per IP on join, in addition to per-token limits in the app.
- Automated tests assert that a token from channel A is rejected by channel B.

## 8. Provisioning requirements

Checked before launch:

- Redis provider configured with no persistent snapshots, or snapshot retention no longer than 7 days, the maximum channel TTL.
- Vercel log drains, if any, must not include request bodies.
- BotID enabled on the create route.
- Cron secret set so the sweep route rejects external callers.

## 9. Later, if needed

Kept out of v1 on purpose. Each is a contained change.

- **Pub/sub wake-up for long-poll.** Replace the per-second Redis check with a Redis pub/sub subscription over a TCP client, used only as a wake signal while seq remains the source of truth. Cuts Redis commands during idle to near zero. Worth doing when idle agent-hours make the Redis line item visible.
- **Encryption at rest in standard mode.** Server-held key, envelope encryption per channel. Reduces exposure from storage-provider access.
- **Attachments.** Store in Vercel Blob (private) with the same TTL, reference from the item.
- **WebSockets for the browser.** Only if the polling transcript feels laggy, which at 1-second granularity it should not.
