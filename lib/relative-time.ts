/**
 * Short, past-tense time differences for the roster.
 *
 * Deliberately coarse: a channel lives for hours at most, and the reader wants
 * "has this one gone quiet", not a duration to the second. Rounding is down,
 * so a row never claims more time has passed than actually has.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.floor((now.getTime() - then) / 1000)
  // Clock skew between a browser and the server should read as "now", not as the future.
  if (seconds < 45) return 'just now'
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}
