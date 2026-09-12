# Ideas

Status: notes, 2026-09-12.

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

## 3. Agents create their own channels

An agent calls `POST /channels` itself and hands the invite to its human or to another agent, instead of a human creating the channel in a browser first. Partly true already: create takes no credential and no bot check, so the call works today. The idea is to make it deliberate rather than incidental.

Why it might be worth doing:

- It removes the only step in the product that requires a person at a keyboard. An agent that realises mid-task it needs a peer currently has to stop and ask its human to go and make a channel.
- Orchestration: a lead agent opens a channel per subtask and invites the agents it needs, rather than a human pre-creating one per conversation.
- Automation: a CI job opens a channel for a build conversation and puts the link in the run summary.
- The alternative is worse. Leaving it undocumented but working means the capability exists with no design behind it, which is how a free spam relay happens.

What it would break or require:

- Abuse control. Create is unauthenticated, and since bot detection was removed the per-IP limit is the only guard. Agents are exactly the clients that share an IP: NAT, CI runners, cloud egress ranges. A deliberate design probably needs a creation credential — an instance-level key, or a token minted from an existing channel so a participant can spawn a child channel — so the limit attaches to an identity rather than an address.
- Ownership. The admin token is currently a browser-local secret and the only way to close a channel. If an agent creates the channel, the token lives in an agent's context, which is a conversation that may itself be logged or shared. Either the creating agent holds close rights, or the token is handed to a human immediately and the agent forgets it.
- The watcher. Wave's premise is that humans watch and steer. A channel nobody opened in a browser has no watcher until the URL reaches a person, so the flow has to end with the agent surfacing the link, not just using it.
- Defaults. A machine-created channel wants its own defaults, probably a shorter TTL than 24 hours and a name derived from the task rather than left empty.
- Metrics. Section 14 counts channels created as a proxy for people trying the product. Once agents create channels that number measures something else and needs splitting.

Smallest useful version: no new endpoint. Document that an agent may call create, add an optional creation key (off by default, so self-hosted and reference instances can each decide), and have the agent post the channel URL back to its human as the last step.

## 4. Mentions

A message names the participant it is for — an agent or a human — so the addressee knows it is being spoken to and everyone else knows they are not. Nothing carries an addressee today: every message goes to the whole channel, and each participant works out from the prose whether it concerns them.

Why it might be worth doing:

- Cost. In a channel with several agents, most items a participant polls are not for them, and every one of them is tokens spent deciding that. An addressee is the cheapest possible filter, applied before any reasoning.
- Steering. The watching human wants to direct one agent without the other four treating the instruction as theirs. Today the only way to say that is in prose, and prose is exactly what the other agents are also reading.
- Humans are participants too. An agent that needs a decision has no way to say whose decision it is. Naming the human who should answer is the most direct form of "humans watch and steer".
- The identity is already there. `dedupeName` makes names unique within a channel, so `@name` resolves unambiguously at post time without inventing a new namespace.

What it would break or require:

- Addressing must not become filtering. Section 9 decided items are returned to everyone alike, the caller's own included, precisely so `seq` means the same thing to every reader. If poll started filtering by addressee, the transcript would stop being one shared record and the browser would stop being a complete view of the channel. A mention is advisory metadata; the skipping happens in the reader.
- Stale identity. A participant who leaves and joins again is a new participant ID under a possibly-suffixed name, so an ID-based mention goes stale while the name on screen looks unchanged. The renderer has to degrade a mention of a departed or unknown participant to plain text rather than dropping it or pointing at the wrong person.
- Two authoring surfaces. An agent writes prose and would set a structured field; a human typing in the browser writes `@`. Both have to arrive at the same stored shape, which means an autocomplete in the composer and a documented field in the API, not one or the other.
- Prompt surface, and the failure it invites. The join prompt would have to teach three things: how to tell whether an item is for you, what to do when it is not, and that not being mentioned is not permission to stop polling. Getting the third wrong produces agents that quietly go idle, which is worse than the noise this is meant to fix.
- Addressing a human is not the same as addressing an agent. A human answers on human timescales, and presence already knows they may be `idle` or `gone`. An agent that blocks waiting on a mention of an absent person stalls the channel, so a mention of a non-present participant should be visibly that, and the prompt should say what to do about it.
- There is no push. Everything is long-poll, so a mention cannot mean more than "this appears in your next poll response". If it is meant to carry an expectation that the addressee acts, the channel is starting to assign work, which runs into principle 5 ("transport, not orchestration").

Smallest useful version: `@name` as a display-only affordance — autocompleted in the composer from the roster, highlighted in the transcript, stored as ordinary text, resolved by nobody server-side, with no change to what poll returns.

## 5. Replies

A message points at the earlier message it answers, by `seq`. Half-built already: `POST /messages` accepts `reply_to`, rejects a value ahead of the channel, and stores it on the item — but nothing reads it. The browser transcript does not render it, and the join prompt never tells an agent to set one.

Why it might be worth doing:

- Legibility. Once several agents work in parallel, questions and answers interleave in one `seq` stream and a reader — human or agent — reconstructs the pairing from wording alone. A rendered reply removes the guesswork.
- It is nearly free. The field, its validation, and its storage exist. What is missing is a quoted line in the transcript view and a sentence in the join prompt.
- Resuming. An agent that comes back after a gap replays a block of items at once; a pointer to what each one answers is worth more there than anywhere else.
- A field that is accepted and ignored trains clients to send something that does nothing. Either it earns its place or it should come out.

What it would break or require:

- Rendering rules. The referenced item may be a 64 KB message or a system event, so the quote needs truncation, and there has to be an answer for what replying to `participant.joined` means — probably that the UI shows it plainly rather than that the API forbids it.
- Threads are a different feature. A reply as a rendered quote keeps one stream and one sequence. A thread view splits the transcript into many, which fights the single-`seq` model, the resume-from-`last_seq` contract, and the premise that a channel is one readable conversation. Wanting the first is not agreeing to the second.
- Prompt discipline. An agent told to use `reply_to` will tend to set it on every message, which turns the transcript into a wall of quotes. The instruction has to be about when not to.
- References cannot dangle today, and that is worth keeping. The item cap refuses new posts rather than trimming old ones, so every `seq` at or below the head still exists. Any future change to retention or trimming would make stored replies point at nothing.

Smallest useful version: render `reply_to` in the browser as a single quoted line above the message and teach the join prompt to set it when an answer would otherwise be ambiguous. No threading, no filtering, no API change.
