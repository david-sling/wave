import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AGENT_DOCS, INDEX_TOPIC, agentDocIndex, agentDocPath, findAgentDoc, readAgentDoc } from './agent-docs'
import { JOIN_PROMPT_TEMPLATE } from './join-prompt'

/** Every `{{HOST}}/agent/<topic>.md` the prompt tells an agent to fetch. */
function linkedTopics(): string[] {
  return [...JOIN_PROMPT_TEMPLATE.matchAll(/\{\{HOST\}\}\/agent\/([a-z-]+)\.md/g)].map((match) => match[1])
}

describe('the agent docs', () => {
  it('has a file for every topic in the registry', () => {
    for (const doc of AGENT_DOCS) {
      expect(existsSync(agentDocPath(doc.topic)), `${doc.topic}.md is registered but missing`).toBe(true)
      expect(readAgentDoc(doc.topic).trim().length).toBeGreaterThan(0)
    }
  })

  /**
   * The failure this prevents is the worst one this design has: an agent that
   * followed a link from the prompt, got a 404, and is now stuck mid-task with
   * no instruction for what it was about to do.
   */
  it('registers every topic the join prompt links to', () => {
    const linked = linkedTopics()
    expect(linked.length).toBeGreaterThan(0)
    for (const topic of linked) {
      expect(findAgentDoc(topic) ?? (topic === INDEX_TOPIC ? true : undefined), `${topic} is linked but unknown`).toBeTruthy()
    }
  })

  it('links the index, which is the way back from a wrong guess', () => {
    expect(linkedTopics()).toContain(INDEX_TOPIC)
  })

  it('says when to fetch each one, not what is in it', () => {
    // The line is what an agent decides on without spending a fetch, so it has
    // to describe the situation it is in rather than the document's contents.
    for (const doc of AGENT_DOCS) expect(doc.when).toMatch(/^(to|when|if)\b/)
  })

  it('names every registered topic in the generated index, with a runnable fetch', () => {
    const index = agentDocIndex('https://wave.example.com')
    for (const doc of AGENT_DOCS) {
      expect(index).toContain(doc.title)
      expect(index).toContain(`curl -s https://wave.example.com/agent/${doc.topic}.md`)
    }
  })

  it('keeps each doc to one capability an agent could be told about in a line', () => {
    // Not a size rule for its own sake: a doc long enough to need its own index
    // is a doc the prompt should not have sent an agent to mid-task.
    for (const doc of AGENT_DOCS) {
      expect(readAgentDoc(doc.topic).split('\n').length, `${doc.topic}.md is too long to read mid-task`).toBeLessThan(120)
    }
  })

  it('assumes nothing the join prompt did not already give the agent', () => {
    // A doc is read after the preamble, never instead of it, so it may use
    // $BASE, $W and the token file — and must not invent a second way in.
    for (const doc of AGENT_DOCS) {
      const body = readAgentDoc(doc.topic)
      expect(body).not.toContain('{{INVITE}}')
      expect(body).not.toMatch(/\{\{[A-Z_]+\}\}/)
    }
  })

  it('is the same markdown the docs directory holds', () => {
    // The route serves these files; nothing transforms them on the way out.
    for (const doc of AGENT_DOCS) {
      expect(readAgentDoc(doc.topic)).toBe(readFileSync(agentDocPath(doc.topic), 'utf8'))
    }
  })
})
