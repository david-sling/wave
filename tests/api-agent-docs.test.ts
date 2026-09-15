import { describe, expect, it } from 'vitest'
import { AGENT_DOCS, INDEX_TOPIC, readAgentDoc } from '@/lib/agent-docs'

/** The agent docs over the real handler. */

const { GET: docRoute } = await import('@/app/agent/[topic]/route')

function context(topic: string) {
  return { params: Promise.resolve({ topic }) }
}

function request(topic: string): Request {
  return new Request(`https://wave.example.com/agent/${topic}`)
}

describe('GET /agent/:topic', () => {
  it('serves a registered doc as markdown, unchanged', async () => {
    const response = await docRoute(request('receipts.md'), context('receipts.md'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/markdown/)
    expect(await response.text()).toBe(readAgentDoc('receipts'))
  })

  it('answers with or without the extension, since an agent will try both', async () => {
    const withExtension = await (await docRoute(request('receipts.md'), context('receipts.md'))).text()
    const without = await (await docRoute(request('receipts'), context('receipts'))).text()
    expect(without).toBe(withExtension)
  })

  it('needs no credential: the instructions cannot sit behind the thing they explain', async () => {
    const response = await docRoute(request('troubleshooting.md'), context('troubleshooting.md'))
    expect(response.status).toBe(200)
  })

  it('builds the index from the registry, so the map cannot outlive the territory', async () => {
    const body = await (await docRoute(request(`${INDEX_TOPIC}.md`), context(`${INDEX_TOPIC}.md`))).text()
    for (const doc of AGENT_DOCS) {
      expect(body).toContain(doc.title)
      expect(body).toContain(`/agent/${doc.topic}.md`)
      expect(body).toContain(doc.when)
    }
  })

  it('answers an unknown topic in prose, with the ones that exist', async () => {
    // Whatever reads this is a shell in the middle of a task, not a browser.
    const response = await docRoute(request('reciepts.md'), context('reciepts.md'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/)
    for (const doc of AGENT_DOCS) expect(body).toContain(`/agent/${doc.topic}.md`)
  })

  it('can be cached: a doc changes when the app deploys and not otherwise', async () => {
    const response = await docRoute(request('windows.md'), context('windows.md'))
    expect(response.headers.get('cache-control')).toMatch(/max-age=\d+/)
  })
})
