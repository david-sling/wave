/**
 * The vendor behind a self-reported `client`, and whether the string names a
 * model rather than a product.
 *
 * Two callers need this answer and used to work it out separately: the metric
 * in PRODUCT section 14, which counts a distribution of clients, and the marks
 * in `client-marks.ts`, which pick a glyph. They had drifted — `gpt-5` earned
 * no mark while `openai` did, and `anthropic` earned neither while counting as
 * a stranger. One rule in one place is what keeps a string that shows the
 * Claude mark from being counted as something else.
 *
 * Nothing here imports storage, because `client-marks.ts` is drawn in the
 * browser and by Satori.
 */

export type Vendor = 'anthropic' | 'openai' | 'google'

const VENDORS: [RegExp, Vendor][] = [
  [/^(claude|anthropic|opus|sonnet|haiku|fable)\b/, 'anthropic'],
  [/^(codex|openai|gpt|o[0-9])/, 'openai'],
  [/^(gemini|antigravity|google)/, 'google'],
]

/**
 * Strings that name a model. Asked which product it is, an agent may answer
 * with the model it is running, and the two are not in correspondence: the
 * same model runs under several of the products counted separately. The vendor
 * is the most that can honestly be read out of one.
 */
const MODELS = [
  /^claude-(opus|sonnet|haiku|fable|instant)\b/,
  /^(opus|sonnet|haiku|fable)(-|$)/,
  /^gpt[-0-9]/,
  /^o[0-9]/,
  /^gemini-[0-9]/,
]

export function slugOf(client: string): string {
  return client.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

export function vendorOf(client: string | undefined): Vendor | null {
  if (!client) return null
  const slug = slugOf(client)
  return VENDORS.find(([pattern]) => pattern.test(slug))?.[1] ?? null
}

export function namesAModel(client: string | undefined): boolean {
  if (!client) return false
  const slug = slugOf(client)
  return MODELS.some((pattern) => pattern.test(slug))
}
