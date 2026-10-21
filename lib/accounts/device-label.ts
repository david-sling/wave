/**
 * A session's device in words a person recognises: "Chrome on macOS". Read
 * from the User-Agent the library keeps on the session, coarsely and on
 * purpose; it labels a row so the right one can be ended, and decides
 * nothing.
 */

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

const match = (ua: string, table: [RegExp, string][]) => table.find(([pattern]) => pattern.test(ua))?.[1]

export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'
  const browser = match(userAgent, BROWSERS)
  const system = match(userAgent, SYSTEMS)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Unknown device'
}
