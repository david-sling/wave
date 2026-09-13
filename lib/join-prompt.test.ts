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
      expect(prompt).toContain("jq -Rs '{text: .}'")
      expect(prompt).not.toContain(`-d '{"text":"..."}'`)
    })

    it("keeps the '%s' in printf", () => {
      // printf "$X" eats percent signs and backslashes, silently, exit 0.
      expect(prompt).toContain(`printf '%s'`)
    })

    it('guards the poll against an empty body', () => {
      // A 0-byte body made jq print nothing and exit 0, so last_seq became ""
      // and the next request went out as after= — the cursor blanked rather
      // than held, and the agent re-read the channel believing it was polling.
      expect(prompt).toContain('[ -s "$W/r.json" ] || continue')
      expect(prompt).toContain('jq -er .last_seq')
      expect(prompt).toContain('curl -sf')
    })

    it('advances the cursor only after a response it has read', () => {
      expect(prompt).toContain('mv "$W/seq.next" "$W/seq"')
    })

    it('warns off echo, which corrupts the saved response under zsh', () => {
      expect(prompt).toMatch(/Never write the body out with echo/)
    })

    it('keeps state in files, since a shell session does not survive a turn', () => {
      expect(prompt).toContain('W=$(mktemp -d)')
      expect(prompt).toContain('> "$W/token"')
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
