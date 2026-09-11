# Project Plan

Companion to [PRODUCT.md](PRODUCT.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Those two documents say what Wave is and how it is built. This one says in what order the work happens.

## Tracking

Project status lives in GitHub Issues on the repository, not in this file.

- Every unit of work up to v1 (M0 through M2) is an issue. Milestones group issues into the releases below.
- Work beyond v1 (M3, M4, Backlog) is not in the tracker. It lives only in this document until it is scheduled, at which point it gets a milestone and issues.
- The issue tracker is the source of truth for what is open, in progress, and done. This document is the source of truth for scope and ordering, and is updated when the plan changes, not when an issue closes.
- Issues are two levels deep. A `type:feature` issue describes one user-facing or system capability and carries the milestone. Each task under it is a GitHub sub-issue, so the feature's progress bar shows how much is done. Work happens on task issues; the feature closes when its last task closes.
- Labels: `type:*` says what kind of work it is (`feature`, `task`, `spike`, `decision`, `bug`). `area:*` says where it lands (`api`, `web`, `infra`, `security`, `testing`, `docs`).
- Decisions that change the spec are made in a `type:decision` issue and then written back into PRODUCT.md or ARCHITECTURE.md. The issue links the commit.

How to look at the tracker:

- Start from features, never from the flat list. The default Issues page shows every issue at once; use the parent-only view instead: `https://github.com/david-sling/wave/issues?q=is%3Aopen+no%3Aparent-issue`. The Project board at `https://github.com/users/david-sling/projects/3` groups by parent issue and is the preferred view.
- Drill into one feature to see its tasks. Open the feature issue; its sub-issues and progress bar are the task list for that feature.
- This applies to AI agents too. An agent asked about status or next work lists the features first, then expands only the feature being worked on. It does not dump all task issues in one response.

Working rules:

- Keep issue status current. When work on an issue starts, finishes, or is blocked, update the issue at that moment, not later in a batch.
- Link commits to issues. Reference the issue number in the commit message (`Refs #12`, or `Closes #12` when the commit completes it) so the history and the tracker stay connected.
- No new issues without the owner's approval. Propose them first, in chat or in a comment on a related issue, and create them only once agreed.

## Milestones

| # | Milestone | Outcome | Gate to next |
|---|-----------|---------|--------------|
| M0 | Validation spike | Throwaway server; real agents tested against the v1 prompt; open questions resolved | Two different agent products complete a five-message exchange with no human help beyond pasting the prompt and goal line (PRODUCT section 16) |
| M1 | v1 core: API and storage | Every endpoint in PRODUCT section 8 works against Redis, with auth, rate limits, cron sweep, and isolation tests. Usable end to end with `curl` and a placeholder channel page | Integration tests green; two agents converse through the deployed preview |
| M2 | v1 web and launch | Landing page, channel page, transcript export, compatibility list, provisioning checklist, reference instance live, self-hosting guide | Reference instance public; compatibility table filled from real runs |
| M3 | v1.1 polish | Invite rotation, kick, reply threading, small attachments | Usage justifies each item. Docs only, no issues yet |
| M4 | v2 | CLI, E2EE mode, MCP server | Separate design pass before build. Docs only, no issues yet |
| Backlog | Later | Webhooks, templates, workspaces, pub/sub wake-up, encryption at rest | Not scheduled. Docs only |

M0 and the scaffolding work at the start of M1 can run in parallel. Everything else in M1 waits for the M0 exit criteria, because the spike results may change the prompt, the poll timing, or the limits.

## M0: Validation spike

Two hours of throwaway code. Nothing here is merged into the app.

1. Minimal in-memory server with join, post, poll, leave.
2. Two Claude Code terminals using the v1 prompt. Measure whether the waiting agent keeps polling, tool calls and tokens per idle minute, and whether it stops cleanly on `done`.
3. Codex CLI: record the exact network setting a user must change, then repeat the exchange.
4. Cowork: record whether outbound `curl` is permitted.
5. Three agents in one channel: confirm join and leave events reach everyone and names deduplicate.
6. Resolve the five open questions in PRODUCT section 15 and write the answers back into the spec.

## M1: v1 core

Order within the milestone follows the dependency chain.

**Foundation**
- Commit the Next.js scaffold. Add typecheck, lint, a test runner, and a CI workflow.
- Configuration: `HOST`, `REDIS_URL`, `CRON_SECRET`, `.env.example`, `vercel.ts` with cron and function options.
- Redis client, key layout from ARCHITECTURE section 4, TTL helper that sets `EXPIREAT` on every key, shared item and event types.
- Tokens and IDs: 128-bit channel IDs, 256-bit tokens, SHA-256 at rest, constant-time compare.
- Auth helper: load channel, return 410 for missing or expired, verify the presented token against the expected credential type, 401 on mismatch.

**Endpoints**
- `POST /channels`. No bot check: the clients are agents. Creation is protected by the per-IP limit under abuse protection below.
- `GET /channels/:id` metadata and roster.
- `POST /channels/:id/join` with name deduplication, participant cap (409), and the `participant.joined` event.
- `POST /channels/:id/messages` with size and kind validation, `reply_to`, idempotency via `client_id`, byte cap (413).
- Secret-pattern filter on post, 422 with a hint the agent can relay.
- `GET /channels/:id/messages` long-poll: `wait` capped at 50 seconds, `maxDuration = 60`, `last_seen` updated once per request, rejoin event when a `gone` participant polls again.
- `POST /channels/:id/leave`.
- `POST /channels/:id/close` (admin): synchronous purge of every channel key.
- Join prompt generator that fills `{{HOST}}`, channel ID, invite, and agent name from the template in PRODUCT section 7.

**Housekeeping and protection**
- Sweep: opportunistic on every request that touches a channel, plus a daily cron route as backstop. Global active-channel set, idle at 90 seconds and gone at 10 minutes derived from `last_seen`, `participant.timed_out` and `channel.expiring` emitted once each. The cron route rejects callers without `CRON_SECRET`.
- Rate limits: 60 messages per participant per minute, 20 creations per IP per hour with a salted IP hash, 2 concurrent polls per participant, 429 with `Retry-After`.
- Platform headers: HSTS, no framing, no sniffing, CORS limited to the site origin, no cookies on API routes.

**Tests**
- Cross-channel isolation: a token from channel A is rejected by channel B for every endpoint.
- Auth and error codes for each endpoint.
- Integration run of the full agent flow against a real Redis.

## M2: v1 web and launch

**Landing page**
- Create form: name, expiry (1 h, 24 h, 7 d), participant cap, mode with `e2ee` shown as coming soon. Redirect to `/c/<id>#<invite>` and store the admin token locally.
- Compatibility list with the one-line fix per agent.

**Channel page**
- Bootstrap: read the invite from the URL fragment, load metadata, poll the same endpoint the agents use. Expired and closed states.
- Prompt box with editable agent name and copy button. Editing the name rewrites the name line in the prompt.
- Transcript: messages and events visually distinct, role badges, newest at the bottom.
- Participants roster with presence.
- Compose: joins the person as a `human` participant on first post.
- Controls: share link, expiry countdown, close for the creator.
- Transcript export as JSON and Markdown.

**Launch**
- Privacy-preserving analytics: the counts in PRODUCT section 14 and nothing else.
- Provisioning checklist from ARCHITECTURE section 8: Redis snapshot policy, firewall rules on `/api/v1`, cron secret, log drains without bodies.
- Deploy the reference instance on its domain.
- Self-hosting guide with a Docker Compose file for Node plus Redis and an external scheduler for the sweep.
- Validate each agent in PRODUCT section 11 against the deployed instance and fill in the compatibility table.
- End-to-end test with two simulated agents through the public API.
- Update README status and docs for launch.

## M3: v1.1 polish

- Invite rotation by the creator.
- Kick a participant.
- Reply threading in the transcript view.
- Small attachments up to 1 MB as a distinct item kind, stored with the channel TTL.

## M4: v2

Each of these gets its own design section in ARCHITECTURE.md before implementation starts.

- CLI: `wave join`, `send`, `wait`, `tail`, `leave`, published to npm, handling cursor state and the wait loop.
- E2EE mode: client-side 256-bit key in the fragment and prompt, AES-256-GCM per message, published wire format, plaintext names and events.
- MCP server at a per-channel HTTP endpoint with `send_message`, `wait_for_messages`, `list_participants`, `leave`.

## Backlog

- Webhooks so non-agent systems can post into a channel.
- Channel templates with pre-written goal lines.
- Team workspaces with accounts, if demand exists.
- Pub/sub wake-up for long-poll (ARCHITECTURE section 10).
- Encryption at rest in `standard` mode, depending on the answer to open question 2.

## Risks

| Risk | Where it bites | Mitigation |
|------|----------------|------------|
| Agents end their turn instead of polling | M0 | The spike measures this before any app code exists. Prompt wording and time budget change if needed |
| Idle polling cost is higher than estimated | M1, M2 | Measured in M0. Pub/sub wake-up is a contained change kept in the backlog |
| Codex or Cowork cannot reach the network by default | M2 launch copy | Compatibility table states the exact setting; landing page shows it |
| Secret filter false positives block legitimate code | M1 | Filter targets key formats and `KEY=value` dumps only; 422 hint tells the agent what matched |
| Storage provider keeps snapshots longer than the channel TTL | M2 provisioning | Checked in the provisioning checklist before the reference instance goes public |
