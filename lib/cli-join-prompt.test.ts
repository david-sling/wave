import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../cli/src/version'
import {
  CLI_JOIN_PROMPT_TEMPLATE,
  CLI_MIN_VERSION,
  GOAL_LINE,
  buildJoinPrompt,
  curlPromptDoc,
  sessionFileName,
} from './join-prompt'

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
    expect(prompt).toContain(`NAME  David's agent`)
    expect(prompt).toContain('FILE  /tmp/wave-ZmFrZS1jaGFubmVsLWlk-davids-agent')
    expect(prompt.split('\n')[0]).toBe(`# Wave: join "Release 4.2" as "David's agent"`)
  })

  it('still answers a purpose in place of the closing line', () => {
    const purposed = buildJoinPrompt({ ...fields, purpose: 'Agree the /orders shape.' }, 'cli')

    expect(purposed).not.toContain(GOAL_LINE)
    expect(purposed).toContain("Your user's goal for this channel: Agree the /orders shape.")
  })
})

describe('sessionFileName', () => {
  it('keeps two channels and two agents apart, in a name any shell takes unquoted', () => {
    expect(sessionFileName('ZmFr', "David's agent")).toBe('wave-ZmFr-davids-agent')
    expect(sessionFileName('ZmFr', 'Windows agent')).toBe('wave-ZmFr-windows-agent')
    expect(sessionFileName('Yz9x', "David's agent")).not.toBe(sessionFileName('ZmFr', "David's agent"))
    expect(sessionFileName('ZmFr', "<MY NAME>'s agent")).toMatch(/^wave-ZmFr-[a-z0-9-]+$/)
    expect(sessionFileName('ZmFr', '???')).toBe('wave-ZmFr-agent')
  })
})

describe('what the CLI variant does differently', () => {
  // A command line, not a prose line that happens to start with the verb.
  const commands = prompt.split('\n').filter((line) => /^\s*wave \w+ (-s |")/.test(line))

  it('makes every command plain wave, with nothing a permission rule cannot cover', () => {
    // Measured, not predicted: a preamble of assignments and $(cat ...) in
    // front of each call got "allow once" and never "allow always" from
    // Claude Code, one dialog per call. Nothing may come before `wave`, and
    // nothing inside it may need a shell to expand.
    expect(commands.length).toBeGreaterThan(6)
    for (const command of commands) {
      expect(command, command).toContain('-s <FILE>')
      expect(command.replace(/<[^>]*>/g, ''), command).not.toMatch(/\$|\||;|&&|`|>|</)
      expect(command, command).not.toContain('--session ')
    }
    expect(prompt).not.toMatch(/^\s*(export |[A-Z]+=)/m)
    expect(prompt).toContain('exactly as written, each on its own')
  })

  it('refuses a second join into a live session, the way the curl prompt does', () => {
    expect(prompt).toContain('It refuses if FILE already holds a')
    expect(prompt).toContain('Join once only')
  })

  it('leaves no file behind to clean up by hand', () => {
    expect(prompt).not.toContain('rm -rf')
    expect(prompt).toContain('wave leave -s <FILE>')
    expect(prompt).toContain('deletes FILE')
  })

  it('keeps the cursor out of any file', () => {
    expect(prompt).not.toMatch(/(seq|cursor)\.txt|\/(seq|cursor)\b/)
    expect(prompt).toContain('belongs in your notes')
    // And says where a cursor comes from, which is the one number an agent has
    // been observed taking from the wrong place.
    expect(prompt).toContain('the seq wave send prints is where your message landed, not what you have read')
  })

  it('sends a diff through a file, not a pipe', () => {
    expect(prompt).toContain('wave send -s <FILE> --file <path>')
    expect(prompt).not.toMatch(/wave send -s <FILE> -(\s|$)/m)
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

  it('names the install, the runtime it needs, and the version that has -s', () => {
    expect(prompt).toContain('npm i -g @david-sling/wave')
    expect(prompt).toContain('Node 20 or later')
    expect(prompt).toContain(`"wave --version" does not print ${CLI_MIN_VERSION} or later`)
  })

  it('never asks for a CLI newer than the one in this repository', () => {
    const parts = (version: string) => version.split('.').map(Number)
    const [need, have] = [parts(CLI_MIN_VERSION), parts(VERSION)]
    const cmp = need[0]! - have[0]! || need[1]! - have[1]! || need[2]! - have[2]!
    expect(cmp).toBeLessThanOrEqual(0)
  })
})

describe('the agent choice', () => {
  it('defaults to any agent, which leaves the client for the agent to fill in', () => {
    expect(buildJoinPrompt({ ...fields, provider: 'any' }, 'cli')).toBe(prompt)
    expect(prompt).toContain('--client <your agent product, e.g. claude-code or codex-cli> -s <FILE>')
  })

  it('fills in the client for Claude Code, and changes nothing else', () => {
    const claude = buildJoinPrompt({ ...fields, provider: 'claude-code' }, 'cli')
    expect(claude).toContain('--client claude-code -s <FILE>')
    expect(claude.replace('--client claude-code', '--client <your agent product, e.g. claude-code or codex-cli>')).toBe(prompt)
  })

  it('makes no claim about how many times a tool will ask', () => {
    expect(prompt).not.toMatch(/allow wave once|one allowance covers|asks? (at most )?once/i)
  })
})

describe('the curl fallback', () => {
  it('is linked from the install step, for an agent that cannot use wave', () => {
    const install = prompt.slice(prompt.indexOf('0. Once per machine'), prompt.indexOf('1. Join once'))
    expect(install).toContain(`${fields.host}/agent/curl.md`)
    expect(install).toContain('cannot install or run it')
    // Rejoining over curl after a wave join would put the agent in the room twice.
    expect(install).toContain('leave first')
  })

  it('is the curl prompt itself, with the invite left out of it', () => {
    const doc = curlPromptDoc(fields.host)
    expect(doc).toContain('curl')
    expect(doc).toContain(`BASE=${fields.host}/api/v1/channels/<channel id>`)
    expect(doc).toContain('<invite>')
    expect(doc).not.toMatch(/\{\{[A-Z_]+\}\}/)
    expect(doc).not.toContain('npm i -g')
    // The goal was set in the prompt the agent came from; the fallback must not lose it.
    expect(doc).toContain('Your goal is still the one in the')
  })
})
