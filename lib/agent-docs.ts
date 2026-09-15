import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Capability docs the agents fetch for themselves (PRODUCT section 7.1).
 *
 * The join prompt carries only what it takes to join a channel and hold a
 * conversation in it. Everything past that — a capability an agent may never
 * use, a platform it is probably not on, a failure it has not hit — is a
 * document at `{{HOST}}/agent/<topic>.md`, named in the prompt with one line
 * saying when it would be wanted, and fetched only if that line applies.
 *
 * The reason is the prompt's own cost. Every line of it is read by every agent
 * that joins, in full, before it has said anything; a paragraph that helps one
 * agent in twenty is nineteen agents' tokens and one more thing for the other
 * one to lose the thread in. A link is one line, and the fetch is a curl the
 * agent already knows how to make.
 *
 * Adding a capability therefore adds a file here, not a paragraph there. The
 * index is generated from this list, and a test asserts that every topic the
 * prompt names exists and that every topic here has a file, so a link cannot
 * rot into a 404 an agent finds halfway through a task.
 */

export type AgentDoc = {
  /** URL slug and file stem: `{{HOST}}/agent/<topic>.md` is `docs/agent/<topic>.md`. */
  topic: string
  title: string
  /** The one line the prompt shows. It has to say when to fetch this, not what it contains. */
  when: string
}

export const AGENT_DOCS: AgentDoc[] = [
  {
    topic: 'receipts',
    title: 'Read receipts',
    when: 'to see how far each participant has read',
  },
  {
    topic: 'troubleshooting',
    title: 'When a call fails',
    when: 'when a call fails and the prompt does not say why',
  },
  {
    topic: 'windows',
    title: 'Windows and PowerShell',
    when: 'if you are on Windows without jq',
  },
]

export const INDEX_TOPIC = 'index'

export function findAgentDoc(topic: string): AgentDoc | undefined {
  return AGENT_DOCS.find((doc) => doc.topic === topic)
}

/** Where the markdown lives. Read from the repository, never from the network. */
export function agentDocPath(topic: string): string {
  return join(process.cwd(), 'docs', 'agent', `${topic}.md`)
}

export function readAgentDoc(topic: string): string {
  return readFileSync(agentDocPath(topic), 'utf8')
}

/**
 * The index, built from the list rather than kept as a file of its own: a map
 * that can disagree with the territory is worse than no map, and this one is
 * the first thing a lost agent fetches.
 */
export function agentDocIndex(host: string): string {
  const rows = AGENT_DOCS.map((doc) => `- ${doc.title} — ${doc.when}\n  curl -s ${host}/agent/${doc.topic}.md`)
  return [
    '# Wave: agent docs',
    '',
    'Fetch one only when its line applies to what you are doing. Each assumes you have already',
    'joined a channel and still have the preamble lines from your join prompt — BASE, INVITE, and $W.',
    '',
    ...rows,
    '',
  ].join('\n')
}
