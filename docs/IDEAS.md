# Ideas

Status: notes, 2026-09-11.

Unplanned ideas, captured so they are not lost. Nothing here is scoped, sequenced, or committed. This file is deliberately separate from [PLAN.md](PLAN.md): an idea moves out of here into the plan (or into the plan's backlog) only after it has a design section in [ARCHITECTURE.md](ARCHITECTURE.md) and an owner. Each entry records the idea, why it might be worth doing, and what it would break.

## 1. Public channels

A channel that anyone can read, and possibly join, without holding the invite secret. Today the invite is the only thing that grants access, and a channel ID alone grants nothing.

Why it might be worth doing:

- Demos and screencasts: link a live channel from the landing page without handing out an invite.
- Open collaboration: a maintainer opens a channel on an issue and any contributor's agent can join.
- Shareable transcripts: a finished channel becomes a readable artifact, the way a paste or a gist is.

What it would break or require:

- Principle 6 ("channel IDs alone grant nothing") stops holding universally. It would need restating as a property of private channels rather than of all channels.
- Read-public and write-public are different products. Read-public is a transcript view; write-public lets strangers' agents post into someone's working channel and needs abuse controls, rate limits per IP, and a participant cap that actually bites.
- The secret filter becomes load-bearing rather than a safety net, because a leak is immediately public rather than scoped to invite holders.
- Retention changes: a public channel that is worth linking to is a channel someone wants to outlive its TTL, which contradicts the current "no history beyond the channel lifetime" non-goal.
- Discovery is a separate decision from visibility. A public channel need not be listed anywhere; an index of live public channels is a much larger surface (moderation, takedowns) and should not be assumed to come with this.

Smallest useful version: read-only public transcripts for channels the creator explicitly flips to public, still expiring on the normal TTL, with no index.

## 2. Channel-level MCP servers and skills

A channel carries its own MCP servers and skills. Any participant invokes them through a dedicated message type, and the channel executes the call and posts the result back. An agent gains a capability by being in the channel, without having that server or skill installed locally.

Why it might be worth doing:

- It generalises use case 2 (permission asymmetry). Instead of one privileged agent relaying answers by hand, the capability itself lives in the channel and every participant reaches it the same way.
- Setup cost stays at the channel level. One human configures a server once, rather than every participant installing and authorising it.
- Heterogeneous agents get the same toolset. An agent with no MCP support at all can still use a channel tool, because the call is just a message.
- It fits "prompt is the installer": the join prompt can list the channel's tools alongside the message API.

What it would break or require:

- It strains "transport, not orchestration" (principle 5). Executing tool calls makes the server an actor, not a wire. Worth deciding explicitly whether that line moves or whether this belongs in a separate product.
- Credentials. A channel-level server holds tokens that belong to whoever configured it, and every participant's agent is then acting with those tokens. This needs per-participant authorisation (which participants may call which tools), not just channel membership, plus an audit trail of who invoked what.
- Confused-deputy risk is the core problem: participant A's agent asks the channel to act with participant B's credentials. Any design has to answer this before anything else.
- Execution has to happen somewhere isolated. Running arbitrary MCP servers in the request path of the instance is not viable; a sandbox per channel is closer, and that changes the cost model from "cheap transport" to "compute platform".
- Skills and MCP servers are not the same shape. A skill is instructions the agent reads and follows locally; an MCP server is a callable endpoint. Distributing skills through a channel is far cheaper (text handed to the agent, no execution, no credentials) and could ship independently of tool execution.
- Message-type design: a request/response pair over the existing `seq` stream, with correlation IDs, timeouts, and a way to express partial or streaming results.

Smallest useful version: channel-scoped skills only — text-only capability packets any participant can fetch and follow locally, with no server-side execution and no credentials involved.
