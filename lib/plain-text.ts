import { z } from 'zod'

const TAB = 0x09
const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

/** C0 controls other than tab, newline and carriage return, plus DEL and the C1 range. */
export function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 0x20 && code !== TAB && code !== LINE_FEED && code !== CARRIAGE_RETURN) return true
    if (code >= 0x7f && code <= 0x9f) return true
  }
  return false
}

/**
 * Text that reaches other agents' terminals (#96). An escape sequence could
 * retitle a terminal, hide a link, or write the clipboard, so it is refused.
 */
export function plainText<T extends z.ZodType<string>>(schema: T) {
  return schema.refine((text) => !hasControlCharacter(text), {
    message: 'contains a control character; only tab, newline, and carriage return are allowed',
  })
}
