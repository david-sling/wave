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

## 6. Create from Slack

A Slack app with one slash command, `/wave-create`, run inside a Slack conversation. It creates a Wave channel and gets it to everyone in that conversation, so nobody opens a browser, creates the channel, and pastes the link back into Slack by hand.

Why it might be worth doing:

- It is where the humans already are. Every multi-person use case starts with two people agreeing in a chat tool that their agents should talk; today one of them leaves to create the channel and comes back with the link. Section 7 of PRODUCT already anticipates the recipient who only saw the prompt "via Slack".
- Membership without accounts. A Slack conversation is an existing answer to "who should hold this invite" that Wave never has to store. It may soften the case for the "team workspaces with accounts" backlog item rather than add to it.
- Per-person prompts. Slack knows each recipient's name, so each can receive the join prompt with `<name>'s agent` already filled in.
- It answers idea 3's watcher problem. The Slack thread is where the link lands and where the humans will steer from.

What it would break or require:

- The invite enters a store Wave does not control. The invite rides in the URL fragment so it never reaches Wave's server in a page request; a Slack message puts it in Slack's history, search, exports, and in front of anyone who joins that Slack channel later. "Everyone in that chat" becomes "everyone ever in that chat". A plain public message should be rejected. The honest shapes are a public message with a button that returns the prompt ephemerally, or a DM to each current member.
- Who can close it. The admin token lives only in the creator's browser, and a bot has no browser. The invoker should receive it once, ephemerally, as a link the channel page knows how to claim into local storage and strip from the URL. That affordance does not exist and is the one Wave-side change this needs. Letting nobody hold it is a regression from browser creation.
- It forces the creation credential idea 3 deferred. A bot on a hosting provider's egress shares one IP across every workspace that installs it, so the per-IP limit either blocks it or is bypassed for it. Create needs an instance-level key, with the counter attached to a workspace or user fingerprint instead of an address.
- The first long-lived third-party secret. Wave stores only hashes of its own tokens and nothing that outlives a channel. A Slack app has a signing secret and a per-workspace bot token. These belong in a separate service that talks to any Wave host over the public API, which also keeps self-hosting (principle 7) honest.
- Slack is one of several. Discord, Teams, and Google Chat are the same feature; the first adapter sets the pattern, so design the contract once. A command run in a 300-person channel is not a request for a 300-person Wave channel; the participant cap is the natural refusal point.
- Scope creep at the door. Posting Wave events back into the Slack thread is the webhook backlog item in reverse and a second transcript. Not this.

Smallest useful version: a separate small service, one slash command. It creates the channel with a creation key, posts one message carrying only the channel name, expiry, and a "Get my join prompt" button, and answers the button with an ephemeral prompt filled in with that person's name. The admin token goes to the invoker once as a claim link. No events back to Slack, no close command, no member enumeration.

## 7. A hosted agent that leads the channel

A paid agent, run by Wave, that joins a channel as a participant and uses the other agents there to accomplish a task bigger than any one of them was asked to do. The humans each bring an agent with its own repo and permissions; the hosted agent supplies the plan and the coordination.

Why it might be worth doing:

- The ingredients are already in the room. Use case 7 (team huddle) has three agents with complementary access and nobody coordinating them except whichever human is most patient. The lead role exists today; it is just unpaid and manual.
- No protocol change. Prompt is the installer, so a hosted agent is one more participant that joined by the same call. It holds no credentials of its own and accomplishes everything by asking the agents that do, which is the confused-deputy problem from idea 2 solved by construction.
- It is the first thing Wave could charge for. Transport is hard to price; a coordinator that gets a multi-repo change done is not.

What it would break or require:

- It is the non-goal. "Task orchestration, scheduling, or supervisor agents" is excluded for all versions, and principle 5 says the goal comes from each human. A hosted lead is a supervisor agent by definition. This is a decision to move the line, not to stretch it, and it should be taken as one.
- Consent. Each human's agent takes instructions from that human. A third party's agent posting "do X" into the channel is a message like any other, and the other agents' humans still steer, but the join prompt would have to be explicit about how far to follow a lead that is not your human.
- Accounts, billing, and a vendor. Paid means identity and payment, which Wave has none of, and hosted means choosing a model provider, which strains principle 2. Both are fine for a product built on Wave and wrong inside it.
- Data leaves the minimal store. The whole transcript flows into an agent runtime with its own logging and retention, run by Wave. Principle 4 holds today because Wave is a wire; this makes it a reader.
- Compute and cost model. The same shift as idea 2: from cheap transport to hosting long-running agents, with the outage, cost, and liability profile that comes with directing other people's work.

Smallest useful version: no hosting and no payment. A documented "lead" prompt or skill that anyone pastes into their own agent, turning it into the coordinator for that channel. It tests whether coordination through a Wave channel works at all before deciding whether Wave should be the one running it.

## 8. The join prompt as an installed skill

A Claude Code skill, and the equivalent for Codex and the other agents, so a person types `/wave <channel-url>` inside their agent instead of pasting the whole join prompt. The skill holds the instructions; the URL carries the host, the channel, and the invite. Nothing in the skill is specific to any channel.

Why it might be worth doing:

- Distribution inside the tool. A `/wave` entry in the agent's command list is the product advertising itself where its users already are, and once installed every later join is one line. This is the cheapest channel Wave has after the invite itself.
- The prompt is the part that breaks. Every parsing instruction in PRODUCT section 7 is there because an agent got it wrong once, and today that text is re-delivered by paste on every join. A skill is the same text installed once, and it can be written per agent — Claude Code's version can name its permission prompt, Codex's its sandbox — where the pasted prompt has to address every agent at once. The compatibility notes per agent move from the channel page into the skill.
- No secret in the artifact. The skill is static instructions; the invite arrives at run time in the argument. It can sit in a public marketplace or an awesome-list without carrying anything that grants access.
- It composes with what is planned. With the CLI of ARCHITECTURE section 11 the skill shrinks to "run `wave join $URL`, then loop on `wait` and `send`". With the MCP server it becomes the line that installs the endpoint. The skill is the delivery vehicle for whichever of those exists.

What it would break or require:

- Principle 1 softens. "Prompt is the installer" means there is nothing to install, and a skill is an install. The pasted prompt has to stay the default on the channel page, with the skill as the returning user's shortcut, or the zero-setup claim goes. The recipient who has never heard of Wave is still served by the paste; the skill only helps on the second join.
- Version drift. The pasted prompt is always the server's current text. An installed skill is a copy frozen at install time, and an old copy against a changed API fails the quiet way section 7 warns about: the loop prints nothing and the cursor moves. Either the API stays pinned at v1 for as long as any skill is out there, or the skill fetches the current template from the instance at run time and fills in the fragment locally. That needs an endpoint returning the template without the invite, so the invite never appears in a request the server could log.
- Self-hosting. The host comes from the URL, never from the skill, or every skill copy points at the reference instance and principle 7 is quietly broken for anyone who installs it.
- One source, several formats. Each agent product has its own skill layout and install path, so this is N copies of the same instructions to keep in step. The same problem as the CLI's copied types, solved the same way: generated from `lib/join-prompt.ts` in this repository, with a test that each skill body matches the template.
- Trust. A skill is text an agent follows with shell access, and publishing one asks people to install instructions from Wave. It has to stay small enough to read in full, live in this repository under the same review as the prompt, and be pinned by whatever mechanism the marketplace offers, because a tampered copy is a way to exfiltrate whatever the agent can reach.

Smallest useful version: one Claude Code skill under `skills/wave/` in this repository, taking the channel URL as its only argument, with a body that is the v1 template from `lib/join-prompt.ts` with host, channel ID, and invite parsed from the URL and the agent name defaulting from the environment. A test asserts the body matches the template. Installed by pointing Claude Code at the repository; no marketplace listing until the prompt has been through the validation PRODUCT section 16 describes. Codex second, generated from the same source.
