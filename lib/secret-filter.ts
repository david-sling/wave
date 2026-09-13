/**
 * The secret filter (PRODUCT section 10, ARCHITECTURE section 7).
 *
 * The prompt tells every agent never to put credentials in a channel. This is
 * the backstop for when one does anyway. It is deliberately narrow: key
 * formats issued by known services, private key blocks, and environment dumps.
 * A channel is full of code, and a filter that rejects ordinary code would be
 * worse than no filter at all — agents would stop using it rather than argue
 * with it.
 *
 * What matched is reported by name only. Neither the value nor the message
 * body is ever returned or logged.
 */

export type SecretMatch = {
  /** Human-readable name of what matched, safe to relay to an agent and its human. */
  label: string
}

/**
 * `structural` rules match formats that do not occur by accident, so the
 * placeholder word list is not applied to them: it tests the matched credential
 * itself, and a real key whose random tail contains TEST would walk past it.
 */
type Rule = { label: string; pattern: RegExp; structural?: true }

/**
 * Values that look like credentials but are placeholders. Checked before a
 * match counts, so documentation and examples pass.
 */
const PLACEHOLDER = /^(?:x+|\*+|\.+|-+|_+|<[^>]*>|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_]+%)$/i
const PLACEHOLDER_WORDS = /(?:your|example|placeholder|redacted|changeme|dummy|sample|insert|replace|todo|fake|test)/i

const RULES: Rule[] = [
  { label: 'a private key block', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, structural: true },
  { label: 'an AWS access key ID', pattern: /\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ABIA|AGPA)[A-Z0-9]{16}\b/, structural: true },
  { label: 'a GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/, structural: true },
  { label: 'an Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, structural: true },
  { label: 'an OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/, structural: true },
  { label: 'a Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, structural: true },
  { label: 'a Stripe live key', pattern: /\b[rs]k_live_[A-Za-z0-9]{16,}\b/, structural: true },
  { label: 'a Google API key', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/, structural: true },
  { label: 'an npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/, structural: true },
  { label: 'a JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, structural: true },
]

/** Environment-variable names whose value is a credential by definition. */
const SECRET_NAME = /(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|APIKEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIALS?|AUTH)/i

/**
 * `NAME=value`, optionally exported or quoted, one per line: the shape of a
 * pasted .env. Only `=`, never `key: value` — that form is object and YAML
 * syntax, and `cronSecret: process.env.CRON_SECRET` is code, not a leak.
 */
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n#]+)["']?\s*$/gm

/** Values that name where a secret lives rather than being one. */
const REFERENCE = /process\.env|os\.environ|getenv|System\.getenv|\bsecrets?\.|\bvault\b|\$\(|`/i

/** A literal bearer token in a pasted request, which is how an agent leaks its own channel token. */
const BEARER = /\b[Bb]earer\s+([A-Za-z0-9._~+/=-]{20,})/g

/**
 * `scheme://user:password@host`. The password is group 2 and it is the only
 * part checked: a hostname is routinely `db.example.internal`, and testing the
 * whole URL would let the word "example" in the host wave a real password past.
 *
 * Found by agents in a channel, who got seven schemes through — postgres,
 * mysql, mongodb+srv, redis, amqp, https basic-auth, and a %-encoded password.
 * No rule matched any of them, because the name `DATABASE_URL` does not read
 * as a credential and a connection string is not a `KEY=value` line.
 */
const URL_CREDENTIAL = /\b[a-z][a-z0-9+.-]*:\/\/([^\s:@/]+):([^\s:@/]+)@/gi

/**
 * Whether a value has the shape of a credential rather than a word. Keeps
 * `TOKEN_NAME=participant` out of the filter while catching a real key.
 */
function looksLikeSecretValue(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 12) return false
  const hasLetters = /[A-Za-z]/.test(trimmed)
  const hasDigitsOrSymbols = /[0-9_\-./+=]/.test(trimmed)
  return hasLetters && hasDigitsOrSymbols
}

/**
 * `p%40ssw0rd` is the same secret as `p@ssw0rd`, and percent-encoding is how a
 * password containing a reserved character arrives. Decoding first means one
 * spelling cannot walk past a check the other fails.
 */
function decodePassword(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return true
  if (PLACEHOLDER.test(trimmed)) return true
  if (PLACEHOLDER_WORDS.test(trimmed)) return true
  if (REFERENCE.test(trimmed)) return true
  // Shell and template interpolation: the value is a reference, not the secret.
  return /\$\{?[A-Za-z_]/.test(trimmed) || /\{\{.*\}\}/.test(trimmed)
}

/**
 * Returns what the text looks like, or undefined when nothing does. First match
 * wins: the agent only needs one thing to fix, and listing every match would
 * describe the secret.
 */
export function findSecret(text: string): SecretMatch | undefined {
  for (const rule of RULES) {
    const match = rule.pattern.exec(text)
    if (!match) continue
    if (rule.structural || !isPlaceholder(match[0])) return { label: rule.label }
  }

  for (const match of text.matchAll(ASSIGNMENT)) {
    const [, name, value] = match
    if (SECRET_NAME.test(name) && !isPlaceholder(value) && looksLikeSecretValue(value)) {
      return { label: `an environment variable named ${name}` }
    }
  }

  for (const match of text.matchAll(BEARER)) {
    if (!isPlaceholder(match[1])) return { label: 'a bearer token' }
  }

  for (const match of text.matchAll(URL_CREDENTIAL)) {
    const password = decodePassword(match[2])
    if (!isPlaceholder(password) && password.length >= 6) {
      return { label: 'a password inside a connection string' }
    }
  }

  return undefined
}
