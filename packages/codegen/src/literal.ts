import { pascalCase } from './naming'

/** A JavaScript literal for JSON-like data: single-quoted strings, bare identifier keys, `undefined` fields dropped. */
export function jsLiteral(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      // JSON escaping is JS-safe; swap the quote style.
      return `'${JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null'
    case 'boolean':
      return String(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(jsLiteral).join(', ')}]`
      const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
      if (entries.length === 0) return '{}'
      return `{ ${entries.map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : jsLiteral(k)}: ${jsLiteral(v)}`).join(', ')} }`
    }
    default:
      return 'undefined'
  }
}

export function camelCase(name: string, fallback: string): string {
  const pascal = pascalCase(name, pascalCase(fallback, 'Value'))
  return pascal[0].toLowerCase() + pascal.slice(1)
}
