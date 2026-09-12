import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JOIN_PROMPT_TEMPLATE, buildJoinPrompt, channelLabel, defaultAgentName } from './join-prompt'

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
  })

  it('keeps the name in one place, so editing the visible line changes the join', () => {
    const prompt = buildJoinPrompt({ ...fields, agentName: 'Windows agent' })
    const nameLines = prompt.split('\n').filter((line) => line.includes('Windows agent'))
    expect(nameLines).toHaveLength(2)
    expect(nameLines[0]).toMatch(/^# Wave: join/)
    expect(nameLines[1]).toBe('NAME="Windows agent"')
    expect(prompt).toContain('\\"name\\":\\"$NAME\\"')
  })

  it('offers a default agent name', () => {
    expect(defaultAgentName('David')).toBe("David's agent")
    expect(defaultAgentName('  ')).toBe('Your agent')
  })
})
