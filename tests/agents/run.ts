import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { chmodSync, createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildJoinPrompt, sessionFileName } from '../../lib/join-prompt.ts'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HOST = (process.env.WAVE_HOST ?? 'http://localhost:3000').replace(/\/$/, '')
const MODEL = process.env.AGENT_MODEL
const MINUTES = Number(process.env.AGENT_RUN_MINUTES ?? 20)
const BUDGET = process.env.AGENT_BUDGET_USD

type Role = { name: string; brief: string; duties: string[] }

const TOPIC =
  'Agree the JSON shape of GET /orders/:id for an order that has been cancelled: which fields it keeps, what it adds (who cancelled it, when, why, refund state), and one example response.'

const ROLES: Role[] = [
  {
    name: 'Lead',
    brief:
      'You supervise this channel. You do not design the API yourself: you run the discussion and decide when it is settled.',
    duties: [
      'Once the backend, frontend and reviewer agents have joined, run `wave who` and name each of them in a message that assigns their part.',
      'Answer at least one earlier message that is no longer the last one with --reply-to.',
      'When the three agree, post the agreed shape as the decision, and ask each of them to finish.',
      'Leave last: wait until every other agent has left (use `wave who`), then send --done with a one-line summary and leave.',
    ],
  },
  {
    name: 'Backend agent',
    brief: 'You own the orders service and propose the response shape.',
    duties: [
      'Write your proposed example response (formatted JSON, several lines) to a file in your working directory and send it with `wave send -s <FILE> --file <path>`.',
      'Revise it once in answer to the frontend agent or the reviewer.',
      'When the Lead asks you to finish, send --done with a one-line summary and leave.',
    ],
  },
  {
    name: 'Frontend agent',
    brief: 'You build the order page that renders this response, and you care about what the UI needs to show.',
    duties: [
      'Ask the backend agent at least one concrete question about a field, using --reply-to on the message you are asking about.',
      'Say plainly when the shape gives the UI what it needs.',
      'When the Lead asks you to finish, send --done with a one-line summary and leave.',
    ],
  },
  {
    name: 'Reviewer agent',
    brief: 'You review API changes for consistency, naming, and anything that leaks data.',
    duties: [
      'Before reviewing, check that the channel refuses credentials: send the message "Filter check: AKIAIOSFODNN7EXAMPLE". That is the AWS documentation example key, public and not real. It should be refused with exit 6. Then tell the channel whether it was refused.',
      'Raise at least one concrete review point on the proposed shape.',
      'When the Lead asks you to finish, send --done with a one-line summary and leave.',
    ],
  },
]

function purpose(role: Role): string {
  return [
    `${TOPIC}`,
    `Your role: ${role.brief}`,
    'Your duties:',
    ...role.duties.map((duty) => `- ${duty}`),
    'You are running unattended as part of a test. There is no user to ask, so do not wait for confirmation, and do not treat that as a reason to stop. Run every wave wait in the foreground with --timeout 180, never in the background. Keep messages short. If wave wait times out twice in a row with nobody speaking, send --done saying so and leave.',
  ].join('\n')
}

async function api(path: string, init: RequestInit & { token?: string } = {}): Promise<unknown> {
  const { token, ...rest } = init
  const response = await fetch(`${HOST}/api/v1${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`)
  return body
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

async function preflight(runDir: string): Promise<string> {
  try {
    const response = await fetch(`${HOST}/`)
    if (!response.ok) fail(`${HOST} answered ${response.status}. Start the app with \`npm run dev\` and try again.`)
  } catch {
    fail(`Nothing is answering at ${HOST}. Start the app with \`npm run dev\` (and Redis), or set WAVE_HOST.`)
  }
  if (spawnSync('claude', ['--version'], { encoding: 'utf8' }).status !== 0) {
    fail('The claude CLI is not on PATH. Install Claude Code and try again.')
  }
  const build = spawnSync('npm', ['run', 'build'], { cwd: join(REPO, 'cli'), encoding: 'utf8' })
  if (build.status !== 0) fail(`The CLI did not build:\n${build.stdout}${build.stderr}`)

  const bin = join(runDir, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'wave'), `#!/bin/sh\nexec node ${JSON.stringify(join(REPO, 'cli/bin/wave.cjs'))} "$@"\n`)
  chmodSync(join(bin, 'wave'), 0o755)
  return bin
}

type Item = {
  seq: number
  type: 'message' | 'system'
  event?: string
  text?: string
  kind?: string
  reply_to?: number
  from?: { name: string }
  subject?: { name: string }
}

function line(item: Item): string {
  if (item.type === 'system') return `  · ${item.text ?? item.event}`
  const tags = [item.kind === 'done' ? 'done' : '', item.reply_to ? `↳ ${item.reply_to}` : '']
    .filter(Boolean)
    .join(', ')
  const text = (item.text ?? '').split('\n')
  const head = `  [${item.seq}] ${item.from?.name}${tags ? ` (${tags})` : ''}: ${text[0]}`
  return [head, ...text.slice(1, 4).map((rest) => `        ${rest}`), ...(text.length > 4 ? ['        …'] : [])].join(
    '\n',
  )
}

type AgentRun = { role: Role; dir: string; log: string; child: ChildProcess; exited: Promise<number | null> }

function start(role: Role, prompt: string, runDir: string, bin: string): AgentRun {
  const dir = join(runDir, role.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
  mkdirSync(dir, { recursive: true })
  const log = join(dir, 'stream.jsonl')
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'default',
    '--allowedTools',
    'Bash(wave *)',
    'Write',
    'Read',
    ...(MODEL ? ['--model', MODEL] : []),
    ...(BUDGET ? ['--max-budget-usd', BUDGET] : []),
  ]
  const child = spawn('claude', args, {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = createWriteStream(log)
  child.stdout!.pipe(out)
  child.stderr!.pipe(createWriteStream(join(dir, 'stderr.log')))
  const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)))
  return { role, dir, log, child, exited }
}

type Stream = {
  commands: string[]
  results: string[]
  denials: string[]
  cost: number
  turns: number
  error: boolean
}

function readStream(log: string): Stream {
  const stream: Stream = { commands: [], results: [], denials: [], cost: 0, turns: 0, error: false }
  let text = ''
  try {
    text = readFileSync(log, 'utf8')
  } catch {
    return stream
  }
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    let event: {
      type?: string
      message?: { content?: Array<{ type?: string; name?: string; input?: { command?: string }; content?: unknown }> }
      permission_denials?: Array<{ tool_name?: string; tool_input?: { command?: string } }>
      total_cost_usd?: number
      num_turns?: number
      is_error?: boolean
    }
    try {
      event = JSON.parse(raw)
    } catch {
      continue
    }
    for (const block of event.message?.content ?? []) {
      if (block.type === 'tool_use' && block.name === 'Bash' && block.input?.command)
        stream.commands.push(block.input.command)
      if (block.type === 'tool_result') {
        const content = block.content
        stream.results.push(typeof content === 'string' ? content : JSON.stringify(content))
      }
    }
    if (event.type === 'result') {
      stream.denials = (event.permission_denials ?? []).map(
        (denial) => denial.tool_input?.command ?? denial.tool_name ?? '?',
      )
      stream.cost = event.total_cost_usd ?? 0
      stream.turns = event.num_turns ?? 0
      stream.error = event.is_error === true
    }
  }
  return stream
}

type Check = { name: string; ok: boolean; detail?: string }

function checks(items: Item[], runs: AgentRun[], streams: Map<string, Stream>): Check[] {
  const messages = items.filter((item) => item.type === 'message')
  const by = (name: string) => messages.filter((item) => item.from?.name === name)
  const event = (kind: string, name: string) => items.some((item) => item.event === kind && item.subject?.name === name)
  const verbs = ['join', 'wait', 'send', 'who', 'leave']
  const result: Check[] = []

  for (const { role } of runs) {
    const stream = streams.get(role.name)!
    const used = verbs.filter((verb) =>
      stream.commands.some((command) => new RegExp(`^\\s*wave ${verb}\\b`).test(command)),
    )
    const foreign = stream.commands.filter((command) => !/^\s*wave /.test(command))
    result.push(
      { name: `${role.name} joined`, ok: event('participant.joined', role.name) },
      { name: `${role.name} spoke`, ok: by(role.name).some((item) => item.kind !== 'done') },
      { name: `${role.name} finished with --done`, ok: by(role.name).some((item) => item.kind === 'done') },
      { name: `${role.name} left`, ok: event('participant.left', role.name) },
      {
        name: `${role.name} ran only plain wave commands`,
        ok: foreign.length === 0 && stream.denials.length === 0,
        detail: [
          ...foreign.map((command) => `ran: ${command}`),
          ...stream.denials.map((command) => `denied: ${command}`),
        ]
          .join(' | ')
          .slice(0, 300),
      },
      { name: `${role.name} verbs used`, ok: used.includes('join') && used.includes('send'), detail: used.join(', ') },
    )
  }

  const reviewer = streams.get('Reviewer agent')
  result.push(
    {
      name: 'someone ran wave who',
      ok: [...streams.values()].some((s) => s.commands.some((c) => /^\s*wave who\b/.test(c))),
    },
    { name: 'a reply used --reply-to', ok: messages.some((item) => item.reply_to !== undefined) },
    {
      name: 'a multi-line message went through (--file)',
      ok: messages.some((item) => (item.text ?? '').includes('\n')),
    },
    {
      name: 'the secret filter refused the test key',
      ok:
        !messages.some((item) => (item.text ?? '').includes('AKIAIOSFODNN7EXAMPLE')) &&
        (reviewer?.results.some((result) => /looks like it contains|exit code 6/i.test(result)) ?? false),
    },
    {
      name: 'the Lead left last',
      ok: (() => {
        const lefts = items.filter((item) => item.event === 'participant.left')
        return lefts.at(-1)?.subject?.name === 'Lead'
      })(),
    },
  )
  return result
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(tmpdir(), 'wave-agent-runs', stamp)
  mkdirSync(runDir, { recursive: true })
  const bin = await preflight(runDir)

  const created = (await api('/channels', {
    method: 'POST',
    body: JSON.stringify({ name: `Agent run ${stamp.slice(11, 16).replace('-', ':')}`, ttl: '24h' }),
  })) as { channel_id: string; invite_token: string }
  const link = `${HOST}/c/${created.channel_id}#${created.invite_token}`

  console.log(`\nWatch the chat:\n  ${link}\n`)
  console.log(`Logs: ${runDir}\n`)

  const runs: AgentRun[] = []
  for (const role of ROLES) {
    const prompt = buildJoinPrompt(
      {
        host: HOST,
        channelId: created.channel_id,
        channelName: `Agent run`,
        invite: created.invite_token,
        agentName: role.name,
        purpose: purpose(role),
        provider: 'claude-code',
        platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
        installer: 'npm',
      },
      'cli',
    ).replaceAll(
      `/tmp/${sessionFileName(created.channel_id, role.name)}`,
      join(runDir, sessionFileName(created.channel_id, role.name)),
    )
    runs.push(start(role, prompt, runDir, bin))
    console.log(`  started ${role.name}`)
    await new Promise((done) => setTimeout(done, role.name === 'Lead' ? 15_000 : 4_000))
  }

  let cursor = 0
  const items: Item[] = []
  let running = runs.length
  for (const run of runs) void run.exited.then(() => (running -= 1))
  const deadline = Date.now() + MINUTES * 60_000

  while (running > 0 && Date.now() < deadline) {
    const poll = (await api(`/channels/${created.channel_id}/messages?after=${cursor}&wait=20`, {
      token: created.invite_token,
    })) as { items: Item[]; last_seq: number }
    for (const item of poll.items) {
      items.push(item)
      console.log(line(item))
    }
    cursor = poll.last_seq
  }

  if (running > 0) {
    console.log(`\n${running} agent(s) still running after ${MINUTES} minutes; stopping them.`)
    for (const run of runs) run.child.kill('SIGTERM')
    await Promise.all(runs.map((run) => run.exited))
  }

  const rest = (await api(`/channels/${created.channel_id}/messages?after=${cursor}&wait=0`, {
    token: created.invite_token,
  })) as { items: Item[] }
  for (const item of rest.items) {
    items.push(item)
    console.log(line(item))
  }

  const streams = new Map(runs.map((run) => [run.role.name, readStream(run.log)]))
  const report = checks(items, runs, streams)
  const cost = [...streams.values()].reduce((sum, stream) => sum + stream.cost, 0)

  console.log('\nChecks')
  for (const check of report) {
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? `  (${check.detail})` : ''}`)
  }
  console.log('\nAgents')
  for (const [name, stream] of streams) {
    console.log(`  ${name}: ${stream.turns} turns, $${stream.cost.toFixed(2)}${stream.error ? ', ended in error' : ''}`)
  }
  console.log(`\nTotal $${cost.toFixed(2)}. Chat: ${link}\nLogs: ${runDir}`)

  writeFileSync(join(runDir, 'report.json'), JSON.stringify({ link, report, items }, null, 2))
  process.exit(report.every((check) => check.ok) ? 0 : 1)
}

await main()
