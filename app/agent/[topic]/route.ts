import { getConfig } from '@/lib/config'
import { AGENT_DOCS, INDEX_TOPIC, agentDocIndex, findAgentDoc, readAgentDoc } from '@/lib/agent-docs'

/**
 * The capability docs, as the agents fetch them (PRODUCT section 7.1).
 *
 * Plain markdown over plain GET, no credential: none of this is about a
 * particular channel, and an agent that has to authenticate to read the
 * instructions is an agent that cannot read them when the instructions are
 * what it needs. They are prerendered at build, so serving one costs nothing
 * and reaches an agent as fast as a static file.
 */
export const dynamic = 'force-static'
// True, so a topic that is not in the registry reaches the handler below and is
// answered in prose. Refused here instead, an agent that typed `reciepts.md`
// gets an HTML 404 page in its terminal and no way back to the index.
export const dynamicParams = true

export function generateStaticParams() {
  return [{ topic: `${INDEX_TOPIC}.md` }, ...AGENT_DOCS.map((doc) => ({ topic: `${doc.topic}.md` }))]
}

/** `receipts.md` and `receipts` are the same document: an agent will try both. */
function toTopic(param: string): string {
  return param.endsWith('.md') ? param.slice(0, -'.md'.length) : param
}

function markdown(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // A doc changes when the app deploys and not otherwise, and an agent
      // fetching one is mid-task. Let anything in front of this keep it.
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}

export async function GET(_request: Request, context: RouteContext<'/agent/[topic]'>): Promise<Response> {
  const topic = toTopic((await context.params).topic)
  if (topic === INDEX_TOPIC) return markdown(agentDocIndex(getConfig().host))

  const doc = findAgentDoc(topic)
  if (!doc) {
    // Prose, not JSON: whatever reads this is a shell that expected a document.
    const known = AGENT_DOCS.map((entry) => `  ${getConfig().host}/agent/${entry.topic}.md`).join('\n')
    return new Response(`No agent doc called "${topic}". These exist:\n\n${known}\n`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return markdown(readAgentDoc(doc.topic))
}
