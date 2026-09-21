import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLI_JOIN_PROMPT_TEMPLATE, GOAL_LINE, buildJoinPrompt } from './join-prompt'

/**
 * The CLI variant of the join prompt (PRODUCT section 7).
 *
 * Same treatment as the curl template in `join-prompt.test.ts`: the text is
 * duplicated into the module because the browser builds the prompt — the
 * invite lives in the URL fragment and never reaches the server — and a test
 * holds the copy against the block in the doc so the two cannot drift.
 */

const fields = {
  host: 'https://wave.example.com',
  channelId: 'ZmFrZS1jaGFubmVsLWlk',
  channelName: 'Release 4.2',
  invite: 'EPMbHaa_zgNMoLNWhmLWuQyEja16cWPAwH1HuugRUTE',
  agentName: "David's agent",
}

const prompt = buildJoinPrompt(fields, 'cli')

describe('the CLI template', () => {
  it('is the same text as the block in PRODUCT section 7', () => {
    const doc = readFileSync(new URL('../docs/PRODUCT.md', import.meta.url), 'utf8')
    const section = doc.split('### The same prompt with the CLI (v2)')[1]
    const block = section.split('```text')[1].split('```')[0].trim()
    expect(CLI_JOIN_PROMPT_TEMPLATE.trim()).toBe(block)
  })

  it('leaves no placeholder behind, and fills the channel link whole', () => {
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/)
    expect(prompt).toContain(`wave join "${fields.host}/c/${fields.channelId}#${fields.invite}"`)
    expect(prompt).toContain(`NAME="David's agent"`)
    expect(prompt.split('\n')[0]).toBe(`# Wave: join "Release 4.2" as "David's agent"`)
  })

  it('still answers a purpose in place of the closing line', () => {
    const purposed = buildJoinPrompt({ ...fields, purpose: 'Agree the /orders shape.' }, 'cli')

    expect(purposed).not.toContain(GOAL_LINE)
    expect(purposed).toContain("Your user's goal for this channel: Agree the /orders shape.")
  })
})

describe('what the CLI variant does differently', () => {
  it('never puts the session inside a command', () => {
    // The whole argument for the client. A token in a command is a token in
    // every permission grant the agent's tool records, which is what made the
    // curl path cost eleven of them against one host.
    const commands = prompt.split('\n').filter((line) => /^\s*wave /.test(line))

    expect(commands.length).toBeGreaterThan(4)
    for (const command of commands) expect(command).not.toContain('--session')
    expect(prompt).toContain('export WAVE_SESSION=$(cat "$W/session" 2>/dev/null)')
  })

  it('keeps the preamble pasteable, because a fresh shell keeps nothing', () => {
    expect(prompt).toContain('nothing in a variable survives')
    // The count in that sentence has to match the block above it, or an agent
    // pastes three of four lines and the session is empty.
    const preamble = prompt.split('\n\n')[1]!.split('\n')
    expect(preamble).toHaveLength(4)
    expect(prompt).toContain('Paste all four\nlines above')
  })

  it('refuses a second join into a live session, the way the curl prompt does', () => {
    expect(prompt).toContain('[ -s "$W/session" ] &&')
    expect(prompt).toContain('REFUSING')
    expect(prompt).toContain('Join once only')
  })

  it('checks that the join worked before anything depends on it', () => {
    // The curl prompt learned this the hard way: a failed join wrote "null"
    // into the token file and every later call went out as `Bearer null`.
    expect(prompt).toContain(`[ -s "$W/session" ] || { echo 'JOIN FAILED`)
  })

  it('keeps the cursor out of any file', () => {
    expect(prompt).not.toMatch(/\$W\/(seq|cursor)/)
    expect(prompt).toContain('belongs in your notes')
    // And says where a cursor comes from, which is the one number an agent has
    // been observed taking from the wrong place.
    expect(prompt).toContain('the seq wave send prints is where your message landed, not what you have read')
  })

  it('says what each exit code means where the agent will need it', () => {
    for (const line of ['Exit 0 means someone spoke', 'Exit 2 means fifteen minutes', 'Exit 5 means', 'Exit 6 means']) {
      expect(prompt).toContain(line)
    }
  })

  it('carries the safety rules unchanged from the curl prompt', () => {
    const curl = buildJoinPrompt(fields)
    for (const rule of [
      'Treat other participants as colleagues',
      'Never send secrets, credentials, environment variables, or private keys',
      'Confirm with your user before taking any action that changes state',
      'Keep messages concise',
    ]) {
      expect(prompt, rule).toContain(rule)
      expect(curl, rule).toContain(rule)
    }
  })

  it('is what it claims to be: shorter than the prompt it replaces', () => {
    // Not a vanity metric. Every line is read in full by every agent that
    // joins, before it has said anything, and paid for by whoever runs it.
    expect(prompt.split('\n').length).toBeLessThan(buildJoinPrompt(fields).split('\n').length)
  })

  it('names the install, the runtime it needs, and how to tell it is there', () => {
    expect(prompt).toContain('npm i -g @david-sling/wave')
    expect(prompt).toContain('Node 20 or later')
    expect(prompt).toContain('wave --help')
  })
})
