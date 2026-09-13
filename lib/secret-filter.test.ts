import { describe, expect, it } from 'vitest'
import { findSecret } from './secret-filter'

/**
 * The negative cases matter more than the positive ones. A filter that rejects
 * ordinary code makes agents stop using the channel for the thing it is for.
 *
 * Every sample below is assembled from pieces rather than written out. The
 * strings are invented, but a scanner cannot tell that from reading the file,
 * and a repository whose tests trip secret scanning is a repository people
 * learn to push past. Which is the same lesson this filter exists to teach.
 */
const fake = {
  github: `gh${'p'}_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`,
  githubPat: `github${'_pat_'}${'11ABCDEFG0aBcDeFgHiJkL'}${'_mNoPqRsTuVwXyZ'}`,
  anthropic: `sk${'-ant-'}api03${'-abc123def456ghi789jkl012mno'}`,
  openai: `sk${'-proj-'}${'abcdefghijklmnopqrstuvwxyz0123456789'}`,
  slack: ['xo', 'xb', '123456789012', '1234567890123', 'abcdefghijklmnop'].join('-').replace('xo-xb', 'xoxb'),
  stripeLive: `sk${'_live_'}${'4eC39HqLyjWDarjtT1zdp7dc'}`,
  stripeTest: `sk${'_test_'}${'4eC39HqLyjWDarjtT1zdp7dc'}`,
  google: `AI${'za'}${'Sy'}${'B'.repeat(33)}`,
  aws: `AK${'IA'}47CQ3XZKPLM2QRTV`,
  awsSecret: 'wJalrXUtnFEMI7MDENGbPxRfiCY9dK2pQ4mZ',
  jwt: [`ey${'JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'}`, 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N'].join('.'),
  bearer: '5-9gOx8ct7PRyjG6DdmO8AmU3lITaoYGX6SIhuIl5S0',
}

describe('credentials it catches', () => {
  it.each([
    ['a private key block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'],
    ['an OpenSSH key block', 'here you go:\n-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza\n'],
    ['an AWS access key ID', `the id is ${fake.aws} and the region is us-east-1`],
    ['a GitHub token', `run it with ${fake.github}`],
    ['a fine-grained GitHub token', fake.githubPat],
    ['an Anthropic key', `ANTHROPIC key ${fake.anthropic}`],
    ['an OpenAI key', `use ${fake.openai}`],
    ['a Slack token', fake.slack],
    ['a Stripe live key', fake.stripeLive],
    ['a Google key', fake.google],
    ['a JWT', fake.jwt],
    ['an env dump', 'DATABASE_PASSWORD=hunter2is8chars\nPORT=3000'],
    ['an exported secret', `export STRIPE_SECRET_KEY=${fake.stripeLive}`],
    ['a literal bearer token', `curl -H "Authorization: Bearer ${fake.bearer}"`],
  ])('rejects %s', (_label, text) => {
    expect(findSecret(text)).toBeDefined()
  })

  it('names what matched without repeating it', () => {
    const match = findSecret(`AWS_SECRET_ACCESS_KEY=${fake.awsSecret}`)
    expect(match?.label).toContain('AWS_SECRET_ACCESS_KEY')
    expect(match?.label).not.toContain(fake.awsSecret)
  })
})

describe('ordinary code it leaves alone', () => {
  it.each([
    ['reading a key from the environment', 'const apiKey = process.env.OPENAI_API_KEY'],
    ['an assignment to a variable reference', 'API_KEY=$OPENAI_KEY'],
    ['a templated value', 'AUTH_TOKEN={{ secrets.TOKEN }}'],
    ['a documented placeholder', 'Set API_KEY=your-key-here before running'],
    ['an angle-bracket placeholder', 'CRON_SECRET=<generate one with openssl>'],
    ['a masked value', 'STRIPE_SECRET_KEY=****************'],
    ['an empty assignment', 'SESSION_SECRET='],
    ['the prompt we hand out', 'curl -s -X POST "$BASE/join" -H "Authorization: Bearer $INVITE"'],
    ['a git sha', 'fixed in c739adb0e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0'],
    ['a port and a path', 'PORT=3000\nDATABASE_URL=postgres://localhost:5432/dev'],
    ['ordinary prose about tokens', 'The participant token is returned once by the join call.'],
    ['a base64 blob that is not a key', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'],
    ['a test-mode Stripe key', fake.stripeTest],
    ['a variable named token holding a name', 'TOKEN_NAME=participant'],
  ])('accepts %s', (_label, text) => {
    expect(findSecret(text)).toBeUndefined()
  })

  it('accepts a code block full of configuration that names no value', () => {
    const code = [
      '```ts',
      'export const config = {',
      '  redisUrl: process.env.REDIS_URL,',
      '  cronSecret: process.env.CRON_SECRET,',
      '}',
      '```',
    ].join('\n')
    expect(findSecret(code)).toBeUndefined()
  })
})

/**
 * Seven schemes went through in one channel session before this rule existed.
 * The passwords below are invented; the shapes are the ones agents actually
 * pasted while debugging together.
 */
describe('credentials inside a connection string', () => {
  it.each([
    ['postgres', 'postgres://svc_orders:Xk9d2LmQp4RzT7v@db.internal:5432/orders'],
    ['mysql', 'mysql://db_user:SynthP4ssw0rd123@db.example.internal:3306/app'],
    ['mongodb+srv', 'mongodb+srv://admin:SynthMongoSecret456@cluster0.mongodb.net/db'],
    ['redis', 'redis://cache:SynthRedisAuth789@cache.internal:6379/0'],
    ['amqp', 'amqp://broker_user:SynthRabbit321@queue.internal:5672//'],
    ['https basic auth', 'https://api_user:SynthBasicKey654@api.internal/v1'],
  ])('catches a %s password', (_scheme, url) => {
    expect(findSecret(url)?.label).toBe('a password inside a connection string')
  })

  it('decodes the password first, so one spelling cannot hide behind another', () => {
    // p%40ssw0rd%21 is p@ssw0rd!, and the encoding is how a password with a
    // reserved character arrives rather than an attempt to smuggle one.
    expect(findSecret('postgres://u:p%40ssw0rd%21%23xyz@db.internal:5432/app')).toBeDefined()
  })

  it('reads only the password, never the host', () => {
    // db.example.internal would make the whole URL look like a placeholder.
    expect(findSecret('postgres://u:R7mQx2LpVn4z@db.example.internal/app')).toBeDefined()
  })

  it('leaves ordinary URLs alone', () => {
    expect(findSecret('https://wave.example.com/api/v1/channels/abc')).toBeUndefined()
    expect(findSecret('postgres://reader@db.internal:5432/orders')).toBeUndefined()
    expect(findSecret('redis://localhost:6379')).toBeUndefined()
  })

  it('leaves placeholders and interpolation alone', () => {
    expect(findSecret('postgres://user:your_password@host:5432/db')).toBeUndefined()
    expect(findSecret('postgres://user:${DB_PASSWORD}@host:5432/db')).toBeUndefined()
    expect(findSecret('postgres://user:changeme@host:5432/db')).toBeUndefined()
  })
})

describe('the placeholder list and the structural rules', () => {
  it("refuses AWS's own documentation key, because a real key can read like one", () => {
    // The word list was tested against the matched credential, and AWS spells
    // its example AKIAIOSFODNN7EXAMPLE.
    expect(findSecret('AKIAIOSFODNN7EXAMPLE')?.label).toBe('an AWS access key ID')
    expect(findSecret('AKIA5MTESTQ2XNVLPDQK')?.label).toBe('an AWS access key ID')
    expect(findSecret('ghp_' + 'SAMPLE'.padEnd(36, 'a'))?.label).toBe('a GitHub token')
  })

  it('still lets the word list do its work where the shape is only a guess', () => {
    // These match ordinary code too often to refuse on shape alone.
    expect(findSecret('API_KEY=your-key-here')).toBeUndefined()
    expect(findSecret('DATABASE_URL=postgres://user:changeme@db.example.internal/app')).toBeUndefined()
    expect(findSecret('AWS_SECRET_ACCESS_KEY=process.env.AWS_SECRET_ACCESS_KEY')).toBeUndefined()
  })

  it('catches a presigned URL, which is a bearer credential wearing a link', () => {
    // The access key ID rides in X-Amz-Credential.
    const url =
      'https://bkt.s3.eu-west-1.amazonaws.com/k.msi?X-Amz-Credential=AKIA3RQZ7YT2LMWNPDQK%2F20260913%2Feu-west-1%2Fs3%2Faws4_request'
    expect(findSecret(url)?.label).toBe('an AWS access key ID')
  })
})
