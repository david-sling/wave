import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GOAL_LINE, JOIN_PROMPT_TEMPLATE, buildJoinPrompt, channelLabel, defaultAgentName } from './join-prompt'

const fields = {
  host: 'https://wave.example.com',
  channelId: 'ZmFrZS1jaGFubmVsLWlk',
  channelName: 'Release 4.2',
  invite: 'EPMbHaa_zgNMoLNWhmLWuQyEja16cWPAwH1HuugRUTE',
  agentName: "David's agent",
}

describe('the template', () => {
  it('is the same text as the block in PRODUCT section 7', () => {
    const doc = readFileSync(new URL('../docs/PRODUCT.md', import.meta.url), 'utf8')
    const section = doc.split('## 7. The join prompt (v1)')[1]
    const block = section.split('```text')[1].split('```')[0].trim()
    expect(JOIN_PROMPT_TEMPLATE.trim()).toBe(block)
  })
})

describe('buildJoinPrompt', () => {
  it('leaves no placeholder behind', () => {
    expect(buildJoinPrompt(fields)).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('fills the channel, the host, and the invite where the agent needs them', () => {
    const prompt = buildJoinPrompt(fields)
    expect(prompt).toContain(`BASE=${fields.host}/api/v1/channels/${fields.channelId}`)
    expect(prompt).toContain(`INVITE=${fields.invite}`)
    expect(prompt).toContain(`NAME="David's agent"`)
    expect(prompt.split('\n')[0]).toBe(`# Wave: join "Release 4.2" as "David's agent"`)
  })

  it('substitutes the host everywhere it appears, not just the first time', () => {
    const prompt = buildJoinPrompt(fields)
    expect(prompt).toContain('curl against https://wave.example.com')
    expect(prompt).not.toContain('{{HOST}}')
  })

  it('still gives an unnamed channel a distinguishable title', () => {
    const unnamed = buildJoinPrompt({ ...fields, channelName: '' })
    expect(unnamed.split('\n')[0]).toBe(`# Wave: join "channel ZmFrZS" as "David's agent"`)
    expect(channelLabel(undefined, 'abcdefghij')).toBe('channel abcdef')
    expect(channelLabel('   ', 'abcdefghij')).toBe('channel abcdef')
    // base64url IDs can open with punctuation; a title should not.
    expect(channelLabel(undefined, '-_j7yRyj2iQ')).toBe('channel j7yRyj')
  })

  it('assigns the name once and interpolates it into the join', () => {
    // A name that cannot collide with the illustrative response in step 3.
    const prompt = buildJoinPrompt({ ...fields, agentName: 'Lighthouse agent' })
    const lines = prompt.split('\n').filter((line) => line.includes('Lighthouse agent'))

    // One human-facing line, the title, and one assignment.
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^# Wave: join/)
    expect(lines[1]).toBe('NAME="Lighthouse agent"')

    // The join body reads the variable, so editing the visible line changes who joins.
    expect(prompt).toContain('\\"name\\":\\"$NAME\\"')
  })

  /**
   * The first M0 run died here: two agents independently wrote
   * d.get("messages") and polled an empty parse while the cursor moved on. The
   * prompt now shows the response, and the jq filter has to survive template
   * escaping — a lost backslash would hand agents a broken example.
   */
  it('shows the agent what it is parsing', () => {
    const prompt = buildJoinPrompt(fields)
    expect(prompt).toContain('"items"')
    expect(prompt).toContain('There is no "messages" field')
    expect(prompt).toContain('"last_seq":8')
  })

  it('keeps the jq example runnable through template escaping', () => {
    const prompt = buildJoinPrompt(fields)
    expect(prompt).toContain('jq -r --arg me "$(cat "$W/me")"')
    expect(prompt).toContain('\\(.seq)')
    expect(prompt).toContain('\\(.from.name)')
    expect(prompt).not.toContain('(.seq) (.from.name)')
  })

  /**
   * Every assertion here is a bug the prompt itself caused, found by agents in
   * the channel rather than by us. They are pinned because each one is a line
   * that reads as fussy detail until it costs someone a session.
   */
  describe('the traps it used to teach', () => {
    const prompt = buildJoinPrompt(fields)

    it('builds message JSON with jq instead of inlining it', () => {
      // Inline -d died on the first apostrophe, parenthesis or newline. Two
      // different agents in two different shells lost a message to it.
      expect(prompt).toContain('jq -Rs')
      expect(prompt).not.toContain(`-d '{"text":"..."}'`)
      // And a client_id with it, so a retry after an ambiguous failure returns
      // the seq it already has instead of saying the same thing twice.
      expect(prompt).toContain('client_id: $c')
      // Derived from the text, never the clock or the process. `date +%s`-`$$`
      // was measured giving three different ids across three shells within one
      // second — so a retry never deduped — and three identical ids inside one
      // shell, so two different messages collided and the second was dropped.
      expect(prompt).toContain('shasum -a 256')
      expect(prompt).not.toContain('$(date +%s)-$$')
    })

    it("keeps the '%s' in printf", () => {
      // printf "$X" eats percent signs and backslashes, silently, exit 0.
      expect(prompt).toContain(`printf '%s'`)
    })

    it('guards the poll against a body it could not read', () => {
      // A 0-byte body made jq print nothing and exit 0, so last_seq became ""
      // and the next request went out as after= — the cursor blanked rather
      // than held, and the agent re-read the channel believing it was polling.
      expect(prompt).toContain('jq -er .last_seq')
      expect(prompt).toContain('[ -z "$N" ]')
      // The status code is read rather than thrown away. `curl -sf` was worse
      // than nothing here: on an error it writes no body at all, so the 422 the
      // secret filter returns — whose body is the whole answer — vanished, and
      // a 429 became an ordinary quiet round.
      expect(prompt).toContain(`-w '%{http_code}'`)
      expect(prompt).not.toContain('curl -sf')
    })

    it('names the one error a client must not retry', () => {
      // Two agents measured this: a held poll's slot outlives the client that
      // abandoned it, and retrying into the refusal keeps the slot alive. The
      // remedy is in the body already; the script has to act on it rather than
      // fold it into a generic backoff.
      expect(prompt).toContain(`[ "$C" = 429 ]`)
      expect(prompt).toMatch(/do not retry/i)
    })

    it('advances the cursor only after a response it has read', () => {
      // The cursor moves on the line after the items are written out, never before.
      expect(prompt).toContain('echo "$N" > "$W/seq"')
      // And it refuses to carry anything that is not a number. An agent whose
      // parser printed the word "None" would have polled with after=None ever
      // after; an empty one replays the channel from the start, which for an
      // agent is re-execution rather than re-reading.
      expect(prompt).toContain(`case "$S" in ''|*[!0-9]*)`)
    })

    it('cannot print the last good response as though it were this one', () => {
      // curl -o does not truncate the file when the transfer fails at transport
      // level, so on http=000 the error branch printed the PREVIOUS poll's body:
      // a complete, well-formed, entirely healthy 200 with real messages in it.
      // The one class of failure with no explanatory body got handed the last
      // good one instead, and a parser that trusted it would replay stale items
      // as new. An agent hit this for real while its watcher was dying.
      expect(prompt).toContain(`: > "$W/r.json"`)
    })

    it('never routes the response body through a shell variable', () => {
      // zsh turns the \n inside a JSON string into a real newline, so a body
      // captured into a variable and echoed back stopped parsing. The old
      // prompt warned about it; this one makes it unreachable by writing the
      // body straight to a file with -o and reading it with jq.
      expect(prompt).toContain('-o "$W/r.json"')
      expect(prompt).not.toMatch(/R=\$\(curl/)
    })

    it('keeps state in files, since a shell session does not survive a turn', () => {
      expect(prompt).toContain('> "$W/token"')
    })

    it('gives the state directory a name that can be recomputed', () => {
      // mktemp -d stored the path to the state in the one place the prompt had
      // just said never to keep state: a shell variable, under a random name
      // nothing could reconstruct. In a harness where every call is a fresh
      // shell that fails on the second command.
      expect(prompt).not.toContain('mktemp -d')
      expect(prompt).toContain('W="${W%/}/wave-' + fields.channelId + '"')
      expect(prompt).toMatch(/Never remember a path; recompute it/)
    })

    it('sends the agent to read the backlog before it speaks', () => {
      // join returns last_seq read after the join event, so a new participant's
      // first poll is empty and a busy channel looks like a dead one. One agent
      // worked a whole release beside a peer without ever reading the message
      // where that peer said what access it had: it was seq 2, and the cursor
      // it was handed started at 3.
      expect(prompt).toContain('after=0&wait=0')
      expect(prompt).toMatch(/Read the room before you speak/)
    })

    it('does not sign off by re-posting the introduction', () => {
      // Step 6 built the done message from the same file step 3 wrote the hello into.
      expect(prompt).toContain('"$W/bye.txt"')
      expect(prompt).toContain(`jq -Rs '{text: ., kind: "done"}' "$W/bye.txt"`)
    })

    it('does not assume the agent has jq, or a POSIX shell at all', () => {
      // Use case 3 in PRODUCT section 4 is a Mac agent asking a WINDOWS agent
      // to run a build. Windows ships neither jq nor these shell builtins, and
      // every step here is written in both, so the prompt has to say that the
      // protocol is the HTTP calls rather than the spelling.
      expect(prompt).toMatch(/Windows does not ship/)
      expect(prompt).toMatch(/ConvertFrom-Json/)
    })

    it('says leaving is final, so an agent idles instead of burning its identity', () => {
      expect(prompt).toMatch(/Leaving is final/)
    })
  })

  it('offers a default agent name', () => {
    expect(defaultAgentName('David')).toBe("David's agent")
    expect(defaultAgentName('  ')).toBe("<MY NAME>'s agent")
  })
})

describe('the goal line', () => {
  it('is still in the template, so a purpose has something to replace', () => {
    expect(JOIN_PROMPT_TEMPLATE).toContain(GOAL_LINE)
  })

  it('is replaced by the purpose when one is given', () => {
    const prompt = buildJoinPrompt({ ...fields, purpose: 'Agree the /orders response shape for cancelled orders.' })
    expect(prompt).toContain("Your user's goal for this channel: Agree the /orders response shape for cancelled orders.")
    expect(prompt).not.toContain(GOAL_LINE)
  })

  it('is left alone when the purpose is blank', () => {
    expect(buildJoinPrompt({ ...fields, purpose: '   ' })).toContain(GOAL_LINE)
    expect(buildJoinPrompt(fields)).toContain(GOAL_LINE)
  })
})
