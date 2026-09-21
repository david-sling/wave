import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'
import {
  authorSchema,
  eventNameSchema,
  messageItemSchema,
  messageKindSchema,
  modeSchema,
  presenceSchema,
  roleSchema,
  rosterEntrySchema,
  systemItemSchema,
} from '@/lib/types'

/**
 * `cli/src/types.ts` is a copy, not an import (ARCHITECTURE section 11): the
 * CLI is a separate package and must not pull the app's tree into its install.
 * A copy that nothing checks is a copy that drifts, and the drift surfaces as
 * an agent reading a field the server stopped sending.
 *
 * This lives in the app because the app is where a schema changes, so the app
 * is where the failure should appear. A test in `cli/` would fail on the next
 * CLI change instead, which could be months later. Same pattern as
 * `lib/join-prompt.test.ts` and `lib/agent-docs.test.ts`.
 *
 * What it compares is field names, optionality, and the shape of each field as
 * a string — enough to catch a field added, removed, renamed or retyped, and
 * an enum gaining or losing a member. Inside an inline object literal it
 * compares the member names only; anything deeper than that has a name, and a
 * name is compared as a name.
 */

const CLI_TYPES = 'cli/src/types.ts'
const APP_TYPES = 'lib/types.ts'

type Field = { type: string; optional: boolean }
type Shape = Record<string, Field>

function aliasesIn(path: string): Map<string, ts.TypeNode> {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const aliases = new Map<string, ts.TypeNode>()
  source.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node.type)
  })
  return aliases
}

function aliasNode(path: string, name: string): ts.TypeNode {
  const node = aliasesIn(path).get(name)
  if (node === undefined) throw new Error(`${path} has no exported type ${name}`)
  return node
}

/** A type node as one comparable string. A named type stays its name. */
function render(node: ts.TypeNode): string {
  if (ts.isTypeReferenceNode(node)) return node.typeName.getText()
  if (ts.isUnionTypeNode(node)) return [...node.types.map(render)].sort().join(' | ')
  if (ts.isArrayTypeNode(node)) return `${render(node.elementType)}[]`
  if (ts.isParenthesizedTypeNode(node)) return render(node.type)
  if (ts.isLiteralTypeNode(node)) {
    const literal = node.literal
    return ts.isStringLiteral(literal) ? JSON.stringify(literal.text) : literal.getText()
  }
  if (ts.isTypeLiteralNode(node)) return `{ ${members(node).map(([name]) => name).sort().join(', ')} }`
  if (ts.isIndexedAccessTypeNode(node)) return node.getText()
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return 'string'
    case ts.SyntaxKind.NumberKeyword:
      return 'number'
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean'
    default:
      return node.getText()
  }
}

function members(node: ts.TypeLiteralNode): Array<[string, ts.PropertySignature]> {
  return node.members.filter(ts.isPropertySignature).map((member) => [member.name.getText(), member])
}

/** The fields of a type alias, with `A & { ... }` flattened into one shape. */
function shapeOf(path: string, name: string): Shape {
  const aliases = aliasesIn(path)
  const shape: Shape = {}

  const collect = (node: ts.TypeNode) => {
    if (ts.isIntersectionTypeNode(node)) return node.types.forEach(collect)
    if (ts.isTypeReferenceNode(node)) {
      const referenced = aliases.get(node.typeName.getText())
      if (referenced === undefined) throw new Error(`${path}: ${name} extends ${node.typeName.getText()}, which is not in this file`)
      return collect(referenced)
    }
    if (!ts.isTypeLiteralNode(node)) throw new Error(`${path}: ${name} is not an object type`)
    for (const [field, member] of members(node)) {
      shape[field] = { type: render(member.type!), optional: member.questionToken !== undefined }
    }
  }

  collect(aliasNode(path, name))
  return shape
}

/** The schemas the CLI names, so a field holding one compares as that name. */
const NAMED = new Map<ZodType, string>([
  [authorSchema, 'Author'],
  [roleSchema, 'Role'],
  [presenceSchema, 'Presence'],
  [modeSchema, 'Mode'],
  [messageKindSchema, 'MessageKind'],
  [eventNameSchema, 'EventName'],
  [rosterEntrySchema, 'RosterEntry'],
])

type ZodInternals = { def: { type: string; innerType?: ZodType; values?: unknown[]; element?: ZodType; shape?: Record<string, ZodType> } }

function renderZod(schema: ZodType): Field {
  const inner = schema as unknown as ZodInternals
  if (inner.def.type === 'optional' || inner.def.type === 'default') {
    return { type: renderZod(inner.def.innerType!).type, optional: inner.def.type === 'optional' }
  }

  const named = NAMED.get(schema)
  if (named !== undefined) return { type: named, optional: false }

  const type = (() => {
    switch (inner.def.type) {
      case 'string':
        return 'string'
      case 'number':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'literal':
        return JSON.stringify(inner.def.values![0])
      case 'enum':
        return enumMembers(schema).join(' | ')
      case 'array':
        return `${renderZod(inner.def.element!).type}[]`
      case 'object':
        return `{ ${Object.keys(inner.def.shape!).sort().join(', ')} }`
      default:
        throw new Error(`nothing here renders a zod ${inner.def.type}`)
    }
  })()

  return { type, optional: false }
}

function enumMembers(schema: ZodType): string[] {
  return (schema as unknown as { options: string[] }).options.map((option) => JSON.stringify(option)).sort()
}

function zodShape(schema: ZodType): Shape {
  const shape = (schema as unknown as ZodInternals).def.shape!
  return Object.fromEntries(Object.entries(shape).map(([field, value]) => [field, renderZod(value)]))
}

const OBJECTS: Array<[string, ZodType, string]> = [
  ['authorSchema', authorSchema, 'Author'],
  ['rosterEntrySchema', rosterEntrySchema, 'RosterEntry'],
  ['messageItemSchema', messageItemSchema, 'MessageItem'],
  ['systemItemSchema', systemItemSchema, 'SystemItem'],
]

const ENUMS: Array<[string, ZodType, string]> = [
  ['roleSchema', roleSchema, 'Role'],
  ['presenceSchema', presenceSchema, 'Presence'],
  ['modeSchema', modeSchema, 'Mode'],
  ['messageKindSchema', messageKindSchema, 'MessageKind'],
  ['eventNameSchema', eventNameSchema, 'EventName'],
]

describe(`${CLI_TYPES} is still a copy of the API's shapes`, () => {
  it.each(OBJECTS)('%s matches %s', (schemaName, schema, typeName) => {
    const expected = zodShape(schema)
    const actual = shapeOf(CLI_TYPES, typeName)

    expect(
      Object.keys(actual).sort(),
      `${CLI_TYPES} type ${typeName} has different fields from ${schemaName} in ${APP_TYPES}`,
    ).toEqual(Object.keys(expected).sort())

    for (const [field, shape] of Object.entries(expected)) {
      expect(
        actual[field],
        `${CLI_TYPES} type ${typeName}, field \`${field}\`: ${schemaName} in ${APP_TYPES} says ${shape.optional ? 'optional ' : ''}${shape.type}`,
      ).toEqual(shape)
    }
  })

  it.each(ENUMS)('%s matches %s', (schemaName, schema, typeName) => {
    expect(
      render(aliasNode(CLI_TYPES, typeName)),
      `${CLI_TYPES} type ${typeName} lists different members from ${schemaName} in ${APP_TYPES}`,
    ).toBe(enumMembers(schema).join(' | '))
  })

  it('has an Item union of exactly the two item types', () => {
    expect(render(aliasNode(CLI_TYPES, 'Item'))).toBe('MessageItem | SystemItem')
  })
})

/** The response bodies, which are plain types in the app rather than schemas. */
const RESPONSES: Array<[string, string, string, string]> = [
  ['lib/participants.ts', 'JoinResult', 'JoinResponse', 'the join route returns it verbatim'],
  ['lib/messages.ts', 'PostMessageResult', 'PostResponse', 'the post route returns it verbatim'],
]

describe('the response shapes the CLI reads', () => {
  it.each(RESPONSES)('%s in %s matches %s', (path, appName, cliName) => {
    const expected = shapeOf(path, appName)
    const actual = shapeOf(CLI_TYPES, cliName)

    expect(Object.keys(actual).sort(), `${CLI_TYPES} type ${cliName} against ${appName} in ${path}`).toEqual(
      Object.keys(expected).sort(),
    )
    for (const [field, shape] of Object.entries(expected)) {
      expect(actual[field], `${CLI_TYPES} type ${cliName}, field \`${field}\`, against ${appName} in ${path}`).toEqual(
        shape,
      )
    }
  })

  it('lists the same error codes as lib/http.ts', () => {
    // An agent never reads these, but the CLI switches on two of them to pick
    // an exit code, and a code renamed on one side would make that silently
    // unreachable.
    expect(render(aliasNode(CLI_TYPES, 'ApiErrorCode'))).toBe(render(aliasNode('lib/http.ts', 'ApiErrorCode')))
  })
})
