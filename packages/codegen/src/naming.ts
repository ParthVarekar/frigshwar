function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

export function pascalCase(name: string, fallback: string): string {
  const joined = words(name)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
  return /^[A-Za-z]/.test(joined) ? joined : fallback + joined
}

export function kebabCase(name: string): string {
  return words(name)
    .map((w) => w.toLowerCase())
    .join('-')
}

export function unique(base: string, taken: Set<string>, separator = ''): string {
  let candidate = base
  for (let i = 2; taken.has(candidate); i++) candidate = `${base}${separator}${i}`
  taken.add(candidate)
  return candidate
}

/** JSX text, or a string expression when the text would otherwise be reinterpreted. */
export function jsxText(value: string): string {
  if (value === '') return ''
  const plain = !/[{}<>&\n\r]/.test(value) && value === value.trim() && !/\s{2,}/.test(value)
  return plain ? value : `{${JSON.stringify(value)}}`
}

/** A JSX attribute value with its quotes. */
export function jsxAttr(value: string): string {
  return /["\\&\n\r{}]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`
}

export function escapeComment(value: string): string {
  return value.replace(/\*\//g, '* /')
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
