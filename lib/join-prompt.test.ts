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

    // Two human-facing lines — the title and the session name — and one assignment.
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^# Wave: join/)
    expect(lines[1]).toBe('NAME="Lighthouse agent"')
    expect(lines[2]).toBe(
      'If your tool can title this session, title it exactly: "\u{1F44B} Lighthouse agent | Release 4.2"',
    )

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
    expect(prompt).toContain('jq -r --arg me "$ME"')
    expect(prompt).toContain('\\(.seq)')
    expect(prompt).toContain('\\(.from.name)')
    expect(prompt).not.toContain('(.seq) (.from.name)')
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
