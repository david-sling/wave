import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
      expect(prompt).toContain('client_id: $c')
      // From the text: a clock or a $$ differs across shells, so a retry never
      // dedupes, and is identical within one, so two messages collide.
      expect(prompt).toContain('shasum -a 256')
      // The guard is on the input: sha256 of an empty file is a well-formed id,
      // so no check on the hash can tell you the message was empty.
      expect(prompt).toContain(`[ -s "$W/msg.txt" ] ||`)
      // Not greater, not equal: a replay returns the seq it matched, which can
      // be far behind the sender's last post.
      expect(prompt).toMatch(/NOT GREATER than the seq of your previous post/)
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
      // `curl -sf` writes no body on an error, so the 422 whose body is the
      // whole answer vanished and a 429 became an ordinary quiet round.
      expect(prompt).toContain(`-w '%{http_code}'`)
      expect(prompt).not.toContain('curl -sf')
    })

    it('names the one error a client must not retry', () => {
      // A 429 needs a different branch from a network failure: retrying cannot
      // succeed until the slot behind it frees.
      expect(prompt).toContain(`[ "$C" = 429 ]`)
      expect(prompt).toMatch(/do not retry/i)
    })

    it('advances the cursor only after a response it has read', () => {
      expect(prompt).toContain('echo "$N" > "$W/seq"')
      // And refuses to carry anything that is not a number.
      expect(prompt).toContain(`case "$S" in ''|*[!0-9]*)`)
    })

    it('never lets the seq a post returns become the read cursor', () => {
      // An agent read to seq 22, posted, got {"seq":26} back, and armed its
      // watcher from that number. Seq 23, 24 and 25 had been posted by peers
      // while its own message was in flight; all three were marked read and
      // never seen, one of them a question addressed to it by name. The two
      // numbers share a space and look interchangeable, and step 3 hands you
      // one immediately after teaching you to compare post seqs.
      expect(prompt).toContain('That seq is a write position, not a read cursor.')

      // The structural half, which survives the prose being reworded: the
      // cursor file is only ever written from a last_seq, in the two places
      // that have actually read a response.
      const writes = prompt.split('\n').filter((line) => line.includes('> "$W/seq"'))
      expect(writes).toHaveLength(2)
      expect(writes[0]).toContain('jq -r .last_seq')
      expect(writes[1]).toContain('echo "$N"')
    })

    it('keeps curl exit code, which is the whole diagnosis when no HTTP happened', () => {
      // DNS, refused, timeout, TLS and reset all render as http=000.
      expect(prompt).toContain('X=$?')
      expect(prompt).toContain('curl_exit=$X')
    })

    it('cannot print the last good response as though it were this one', () => {
      // curl -o does not truncate when the transfer fails below HTTP, so the
      // error branch printed the previous poll's body as though it were this one.
      expect(prompt).toContain(`: > "$W/r.json"`)
    })

    it('never routes the response body through a shell variable', () => {
      // zsh turns the \n inside a JSON string into a real newline. The old
      // prompt warned about it; -o makes it unreachable.
      expect(prompt).toContain('-o "$W/r.json"')
      expect(prompt).not.toMatch(/R=\$\(curl/)
    })

    it('keeps state in files, since a shell session does not survive a turn', () => {
      expect(prompt).toContain('> "$W/token"')
    })

    it('gives the state directory a name that can be recomputed', () => {
      // mktemp -d put the path to the state in a shell variable, under a random
      // name, in a harness where every call is a fresh shell.
      expect(prompt).not.toContain('mktemp -d')
      expect(prompt).toContain('W="${W%/}/wave-' + fields.channelId + '-$(printf %s "$NAME"')
      expect(prompt).toMatch(/Never remember a path; recompute it/)
    })

    it('keeps two agents on one machine out of the same state directory', () => {
      // Keyed by channel alone, a second agent in the same channel inherited the
      // first one's token file and the two polled as one participant, sharing
      // its concurrency slots until neither could hold a poll.
      //
      // The W= line is the same text for every agent — it has to be, to stay
      // recomputable from a pasted preamble — so the only way to see the paths
      // diverge is to let a shell expand them.
      const stateDir = (agentName: string) => {
        const preamble = buildJoinPrompt({ ...fields, agentName })
          .split('\n')
          // Not a bare W=: watch.sh sets its own from $0 and would come along.
          .filter((line) => line.startsWith('NAME=') || line.startsWith('W="${TMPDIR'))
          .join('\n')
        expect(preamble.split('\n')).toHaveLength(2)
        return execFileSync('sh', ['-c', `${preamble.replace('mkdir -p "$W"', '')}\nprintf %s "$W"`], {
          encoding: 'utf8',
        })
      }

      expect(stateDir('Lighthouse agent')).not.toBe(stateDir('Beacon agent'))
      // NAME reaches the path through the shell, so a name carrying a space, a
      // quote or an operator has to land as inert characters in one directory
      // rather than splitting the command or walking out of $TMPDIR.
      expect(stateDir("Rob & Sue's agent")).toMatch(/\/wave-ZmFrZS1jaGFubmVsLWlk-Rob___Sue_s_agent$/)
      expect(stateDir('../../etc')).toMatch(/\/wave-ZmFrZS1jaGFubmVsLWlk-______etc$/)
      expect(stateDir('Lighthouse agent')).toMatch(/\/wave-ZmFrZS1jaGFubmVsLWlk-Lighthouse_agent$/)
    })

    it('refuses to join on top of a token another agent already wrote', () => {
      // The suffix keeps different names apart, but $W is spelled from NAME and
      // nothing stops two agents being handed the same one. That collision is
      // the one the path cannot fix, and it used to resolve by silent overwrite:
      // the second join replaced the first's token and both posted as one
      // participant. A name you share has to fail loudly instead.
      const guard = prompt
        .split('\n')
        .filter((line) => line.includes('REFUSING') || /^ {5}echo .*(?:NAME|rm -rf)/.test(line))
        .map((line) => line.trim())
        .join('\n')
      expect(guard).toContain('[ -s "$W/token" ]')
      expect(guard).toContain('exit 1; }')

      const runGuard = (token?: string) => {
        const dir = mkdtempSync(join(tmpdir(), 'wave-guard-'))
        if (token !== undefined) writeFileSync(join(dir, 'token'), token)
        return spawnSync('sh', ['-c', `W='${dir}'\n${guard}\necho REACHED_JOIN`], { encoding: 'utf8' })
      }

      const live = runGuard('0fFZxYkzGUtCXYCmIQCeRvuw3FLAf1DurqQS')
      expect(live.status).toBe(1)
      expect(live.stdout).toContain('REFUSING')
      expect(live.stdout).not.toContain('REACHED_JOIN')

      // A first join, and a retry after one that failed: jq writes the four
      // characters "null" on failure, and that must not lock the agent out of
      // its own directory the way a live token does.
      for (const token of [undefined, '', 'null']) {
        const open = runGuard(token)
        expect(open.status).toBe(0)
        expect(open.stdout).toContain('REACHED_JOIN')
        expect(open.stdout).not.toContain('REFUSING')
      }
    })

    it('sends the agent to read the backlog before it speaks', () => {
      // join returns last_seq read after the join event, so a new participant's
      // first poll is empty and a busy channel looks like a dead one.
      expect(prompt).toContain('after=0&wait=0')
      expect(prompt).toMatch(/Read the room before you speak/)
    })

    it('does not sign off by re-posting the introduction', () => {
      expect(prompt).toContain('"$W/bye.txt"')
      expect(prompt).toContain(`jq -Rs '{text: ., kind: "done"}' "$W/bye.txt"`)
    })

    it('does not assume the agent has jq, or a POSIX shell at all', () => {
      // Use case 3 in PRODUCT section 4 is a Mac agent asking a WINDOWS agent
      // to run a build. Windows ships neither jq nor these shell builtins, so
      // the prompt has to say that the protocol is the HTTP calls rather than
      // the spelling — and then hand over the spelling on request. The
      // translation itself is a fetched doc, so what is pinned here is that the
      // prompt points at it and that it is still the thing it points at.
      expect(prompt).toMatch(/Windows does not ship/)
      expect(prompt).toContain('/agent/windows.md')
      expect(readFileSync(new URL('../docs/agent/windows.md', import.meta.url), 'utf8')).toMatch(
        /ConvertFrom-Json/,
      )
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
