# Authentication: constraints

Status: constraints, decided 2026-09-30. Owner: David. Companion to [PRODUCT.md](PRODUCT.md) section 15.6 and [PLAN.md](PLAN.md) backlog. The architecture is not written yet; this document fixes what any architecture must satisfy, and records the decisions that settled its open questions. "Core section N" refers to PRODUCT.md; "ARCHITECTURE N" to ARCHITECTURE.md.

## 1. What is being constrained

Sign-up, sign-in, sessions, the owner on a channel record, and `wave login` in the CLI (core section 15.6). Not organisations, membership, roles, or anything that outlives a channel and names a second person; those belong to a product built on Wave and core never learns about them.

Two kinds of credential exist after this work, and they never mix:

| Credential | Held by | Grants | Exists today |
|---|---|---|---|
| Channel tokens: invite, participant, admin | Agents and browsers, per channel | Join, read, post, leave, close on one channel | Yes |
| Session: a signed-in person | One browser, or one CLI after `wave login` | Ownership of channels this person created, and nothing about any channel they did not | No |

## 2. Constraints inherited from the product

These are decided already and are restated here so the architecture cannot drift from them.

1. **No account is needed for anything that exists today.** Create, join, read, post, leave, close, and the whole join prompt work exactly as now with sign-in off, and exactly as now for a person who chooses not to sign in when it is on (core principle 1).
2. **An account gives an agent nothing.** Agents authenticate with channel tokens only. There is no persistent agent identity in core (core section 4, non-goals). No endpoint an agent uses accepts a session.
3. **Sign-in is off by default.** An instance with no sign-in configuration sets no cookie, exposes no sign-in in the UI, and behaves byte-for-byte as before. Turning it on changes nothing in the prompt or the join flow (core section 15.6).
4. **The API stays bearer-only.** `/api/v1/*` takes channel tokens in the `Authorization` header and nothing else. No route under it reads a cookie. A session cookie is for pages and server actions only, so CSRF exposure for agents is unchanged (core section 15.6, ARCHITECTURE 7).
5. **Two services with sign-in off, three with it on.** An instance without sign-in runs on Next.js and Redis alone, exactly as today. An instance that turns sign-in on adds one durable store for accounts and sessions, because Redis is provisioned for data that expires and accounts do not. Decided 2026-09-30, answering open question 1; it replaces the second revisit trigger in core section 15.6. Channels stay in Redis; the durable store never holds a channel or a message. The store must be something any self-hoster can run beside the app, and no vendor an instance cannot opt out of.
6. **Identity is built, not bought.** Passkeys are the primary method and a magic link by email is the fallback and the recovery path. Core also ships simple OAuth sign-in: a person may sign in through a consumer provider an instance has configured, and an instance that configures none has none. Decided 2026-09-30, answering open question 8. It is simple in a specific sense: it signs in a person and nothing else. Organisation sign-on, verified domains, provisioning, and any rule about who may sign in through which provider are not core's and are built above core on the seam in section 5.3. Nothing in the reference path depends on a vendor, and every provider is a per-instance option (core section 15.6).
7. **Email is part of the price of sign-in.** Every account has a verified email address, and an instance that turns sign-in on must configure a way to send it. Decided 2026-09-30, answering open question 2. There is no passkey-only configuration: one recovery story, one thing to test. The sender is configured like everything else, through the environment, and is a per-instance choice, never a vendor core depends on.
8. **The admin token keeps working.** A signed-in creator gets an owner on the channel record *and* the admin token, and either proves control. A channel created without a session never gains an owner later (core section 5).
9. **What an account stores is bounded.** The sign-in record, its sessions, and the ids of channels it owns. Never a message body, and nothing about channels the account does not own (core section 9).
10. **Ownership is where later features attach.** Invite rotation, kick, and per-account limits are owner features. Nothing else in the product is unlocked by an account (core section 13, Later).

## 3. Constraints on credentials and transport

1. **Every one-time secret is 256-bit random, stored only as a hash, compared in constant time.** Magic-link tokens, device-flow codes, and anything else that grants access once get the treatment `lib/tokens.ts` gives channel tokens today. The session token is the exception, amended 2026-09-30 after the spike: the library stores it as the cookie carries it and looks it up by equality, with no hook to change that. It sits inside the same trust boundary as the signing secret, so a read of one is a read of both, and the exposure is the one core section 15.2 already accepts for the Redis URL. Sessions are still random, opaque, and revocable (item 4).
2. **No secret in a URL that the server logs.** Core section 10 forbids tokens in URLs because they leak through logs and referrers, and Vercel logs record request URLs (ARCHITECTURE 8). A magic link therefore carries its token in the URL fragment, which browsers never send, and the page exchanges it once by POST. Decided 2026-09-30, answering open question 3; it is the same convention the invite already uses. The token is single-use, expires in minutes, and is useless after the exchange even if the link is opened again. The rule in section 10 holds unchanged.
3. **The session cookie is HttpOnly, Secure, SameSite, and bound to the instance origin.** It is set only on `HOST` (or the Vercel origin when `HOST` is unset), never on a parent domain. HTTPS and HSTS are already required (ARCHITECTURE 7).
4. **Sessions are server-side records.** Not stateless tokens the server cannot revoke. Each is listable and revocable per account, has a lifetime, and records how it was established (which sign-in method, and for an external adapter, which issuer). Revoking is synchronous: a revoked session fails its next request.
5. **Authorisation is on the server, against the record.** Owner checks compare the account id in the session with the owner on the channel record, server-side, on every request. Nothing the client says about ownership is trusted.
6. **The session grants one thing on a channel: a new admin token.** Decided 2026-09-30, answering open questions 5 and 6. The API keeps one credential class; a session is never a bearer on `/api/v1/*`. What ownership adds is that the owner, from a page or server action, can rotate the admin token of a channel they own: a new token is issued and the old one stops working at once. Every admin action, close today and kick and invite rotation later, then goes through the admin token as it does now. Because the admin token is stored only as a hash, recovery and rotation are the same operation; there is no "show me my token".
7. **The two credential kinds never cross.** No API route accepts a session where a channel token is expected. No page or server action accepts a channel token where a session is expected. In the CLI, a person's session and an agent's session string are different values, in different places, accepted by different commands; an agent command never takes a person session and a person command never takes an agent's session string.
8. **Identity is a stable opaque id.** Email, if present, is an attribute that can change and can be absent. An external sign-in adapter identifies a person by issuer and subject, never by an email claim.
9. **Uniform responses.** Sign-in, sign-up, and magic-link requests do not reveal whether an account exists. Failures are rate-limited with the salted-hash counters the instance already uses (ARCHITECTURE 7, `lib/rate-limit.ts`); no raw IP is stored, in keeping with core section 15.1.
10. **An instance with sign-in off rejects every session.** A forged or stale cookie presented to an instance that has no sign-in configuration is ignored as if absent. There is no path where a cookie alone, without server-side configuration, is honoured.
11. **Enabling sign-in cannot break anonymous use.** Missing or invalid sign-in configuration fails the sign-in request with the name of the variable, the way `lib/config.ts` does, and leaves the rest of the instance running.

## 4. Constraints on data and retention

1. **Accounts are durable; everything else is not.** Channels expire, accounts do not, and they live in different stores. The channel record in Redis carries at most an owner id; the account never carries a channel body. Anything sign-in keeps in Redis is short-lived and carries a TTL, sits outside the `ch:` namespace like metrics, and is unreachable by the sweep's patterns.
2. **Redis keeps its provisioning rule.** ARCHITECTURE 8 caps snapshots at the maximum channel TTL because nothing durable lives in Redis, and that stays true: accounts and sessions go to the durable store (section 2.5), so nothing about Redis provisioning changes for an instance with sign-in on. The only thing Redis may hold for sign-in is short-lived state with a TTL: a pending magic link or device code, a rate-limit counter.
3. **The owned-channel list is bounded.** Channels expire without telling the account. The ids an account holds must be pruned, so an account that has created many channels does not hold an unbounded list of dead ones, and reading the list never leaks whether a channel id is live to anyone but its owner.
4. **Deleting an account** deletes its sessions and removes the owner from its channels. The channels keep working through their admin tokens, since deleting the owner must not close a live conversation. Deletion is synchronous, like close.
5. **Isolation between accounts is structural and tested.** An account can list, rotate, and act on channels it owns and no others. Tests assert this, as they assert isolation between channels today.
6. **Analytics stay counts.** Sign-in events are counted, never attributed. No email, name, or account id enters analytics or logs (core section 9).
7. **Privacy of the owner.** The owner on a channel record is an account id. It is not shown to participants and is not in the roster, the join event, the prompt, or the transcript export. Whether the channel *has* an owner may be visible; who it is may not.

## 5. Constraints that keep core open, and usable underneath

Core section 15.6 puts identity in the open so that the code that most needs review is public, and so a product built on Wave can use it instead of building a second one. That imposes constraints on shape, without core knowing what sits on top.

1. **Session resolution is a function, not a route.** Reading the current session from a request, and the account it names, is an exported function a route handler can call. An overriding route in another app can resolve the session, add its own context, and call the same channel functions core calls. This matches how overrides work already: a handler that adds context and calls the core function.
2. **Channel creation takes an optional owner.** The create path can be called with an account id and records it as owner. It is the only place an owner is written.
3. **Sessions record their provenance.** Method, issuer where there is one, and creation time. Core needs this for its own session list; it also lets an overriding layer end sessions established one way without touching the others, or require a method, without core having a concept of why.
4. **An account may hold more than one sign-in method**, and an external adapter never becomes the only way in for an account that also has a passkey. Core needs this so a person is not locked out by a provider outage; an overlay may need it for the same reason.
5. **Core's OAuth is generic and small.** A provider is configured by issuer, client id, and secret, in the environment, and identifies a person by issuer and subject. Core names no vendor as required. It links an external identity to an existing account only through a flow the account holder completes, never by matching an email claim on its own. It has no concept of a domain, a tenant, or a policy, and gains none: anything of that shape belongs above core.
6. **Session issuance is a function too.** The seam an overlay's own sign-on needs is not core's OAuth adapter but the ability to issue a core session for an account with provenance (method and issuer), from an overriding route, after the overlay has satisfied itself about who is signing in. Core's own sign-in methods use the same function.
7. **Per-account limits live in `lib/limits.ts`** with the other limits: owned channels per account, sessions per account, sign-in attempts per window. They are core's abuse controls and are not a paywall.
8. **Core stores nothing that names another product.** Account records hold the fields in section 4 and nothing else. Anything an overlay needs to remember about a person lives in the overlay's own store, keyed by core's account id.

## 6. Constraints on `wave login`

1. **It is core's command, in the open CLI**, and it signs in a person, not an agent (core section 15.6).
2. **It uses a device authorisation flow.** The CLI shows a code, the person approves it in a browser where they are signed in, and the CLI receives a session. The approval happens in the browser session, so whatever that session required applies. The code is short-lived, single-use, and bound to the CLI instance that requested it.
3. **The person's session is never in the agent's session string.** `join` still produces a string that carries channel credentials only. A person session is not written to a `-s` file and is not accepted by `send`, `wait`, `tail`, or `leave`.
4. **The person session is the one exception to the CLI's no-state rule.** ARCHITECTURE 11 says the CLI has no path of its own, and a test holds that over all of `cli/src/`. That rule exists because agents collided on shared files, and a person is one per machine account, so the reason does not apply to them. Decided 2026-09-30, answering open question 4: the CLI holds no state of its own except a person's session, kept in the operating system's credential store, never in a file under a path the CLI chose. The test is extended to allow exactly one module to reach the credential store and nothing else. ARCHITECTURE 11 is amended to say so. Reaching the store on macOS, Windows, and Linux is an architecture question.
5. **Signing out is real.** `wave logout`, or removing the session from the browser's session list, revokes the server-side record, not only the local copy.

## 7. Threats the architecture must answer

Additions to the table in core section 10. Each needs a named control in the architecture.

| Threat | What the control must achieve |
|---|---|
| Magic link intercepted or replayed | Single use, minutes to live, useless after the first exchange, carried in the fragment so it never reaches a log |
| Session cookie stolen | Revocable server-side, listable to the account holder, short enough life, bound to the origin |
| Session fixation or CSRF against pages and server actions | Session is issued only after sign-in completes, cookie attributes as in section 3, server actions verify origin as the framework already does |
| Account enumeration | Uniform responses and timing on sign-in and sign-up |
| Credential stuffing or brute force | Per-IP and per-account counters with salted hashes, lockout that does not reveal existence |
| Owner claimed on a channel that has none | Owner is written once, at creation, from the session, and never by a later request |
| Session honoured where a channel token belongs | No API route reads a cookie; tests assert that a valid session on `/api/v1/*` is treated as no credential |
| Channel token honoured where a session belongs | No page or action reads a bearer; tests assert the reverse |
| Sign-in off but cookie presented | Absent configuration rejects every session uniformly |
| Admin token leaked for an owned channel | The owner rotates it from a page behind the session; the old token fails at once (section 3.6) |
| Cross-account read | Owned-channel access checks the owner on the record on every request; isolation tests |
| Device code phished | Code is bound to the requesting CLI, shown to the person with what it grants, expires in minutes, and approval requires an existing browser session |
| Account key swept or expired | Account keys are outside every channel pattern and carry no TTL; a test asserts the sweep cannot reach them |

## 8. Open questions, and their answers

All eight were answered on 2026-09-30. Each entry keeps the question so the reasoning stays findable, and points at the section that now carries the decision.

1. **Durable accounts in a store provisioned for ephemera.** Decided 2026-09-30: sign-in needs a store Redis cannot be, and that store is required only when sign-in is on (section 2.5). Which store, and how core stays vendor-neutral about it, is an architecture question.
2. **Passkeys without email.** Decided 2026-09-30: there is no such configuration. Email is required when sign-in is on (section 2.7); the magic link is the recovery path for a lost passkey.
3. **Magic links against the no-secrets-in-URLs rule.** Decided 2026-09-30: the token travels in the fragment and is exchanged by POST (section 3.2).
4. **Where `wave login` keeps its session.** Decided 2026-09-30: the operating system's credential store, as a stated and tested exception (section 6.4).
5. **Owner actions over the API.** Decided 2026-09-30: never. The session rotates the admin token; the admin token acts (section 3.6).
6. **Admin token rotation for owned channels.** Decided 2026-09-30 with question 5: rotation is the one thing the session grants on a channel, and it is also the recovery path when the browser has lost the token.
7. **The order of shipping.** Decided 2026-09-30: one release carries sign-in, the owner on the record, a list of the channels an account owns, admin token rotation (section 3.6), and per-account creation limits. Kick and invite rotation stay in v1.1 and attach to the owner when they land. `wave login` follows once the credential-store work exists (section 6.4). PLAN.md's backlog line is updated when the milestone is cut.
8. **The external adapter in core at all.** Decided 2026-09-30: simple OAuth for people is core's (sections 2.6 and 5.5); organisation sign-on is not, and is built on session issuance with provenance (section 5.6).
