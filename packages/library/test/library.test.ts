import { NODE_DEFAULTS, childrenOf, type ComponentNode } from '@codeframe/scene'
import { describe, expect, it } from 'vitest'
import {
  COMPONENTS,
  DEFAULT_THEME,
  expandInstance,
  getSpec,
  normalizeTheme,
  npmDependencies,
  refit,
  registryClosure,
  SHADCN_REGISTRY,
  withPrimary,
  type MeasureText,
} from '../src'

/** Deterministic metrics: half an em per character, wrapping by width. */
const measure: MeasureText = (text, style, maxWidth) => {
  const width = text.length * style.fontSize * 0.5
  const lines = maxWidth ? Math.max(1, Math.ceil(width / maxWidth)) : Math.max(1, text.split('\n').length)
  return { width: maxWidth ? Math.min(width, maxWidth) : width, height: lines * style.fontSize * style.lineHeight }
}

function instance(component: string, props: ComponentNode['props'], box: { width: number; height: number }): ComponentNode {
  return { ...NODE_DEFAULTS.component, id: 'c1', name: 'c1', parentId: null, index: 'a0', component, props, ...box } as ComponentNode
}

describe('shadcn specs', () => {
  it('has a vendored source for every component it can emit', () => {
    for (const spec of COMPONENTS) {
      for (const item of spec.registry(spec.defaults)) expect(SHADCN_REGISTRY[item], `${spec.key} → ${item}`).toBeDefined()
    }
  })

  it('sizes a button from its label and size', () => {
    const spec = getSpec('shadcn/button')!
    expect(spec.size({ label: 'Button', size: 'default' }, DEFAULT_THEME, measure)).toEqual({ width: 74, height: 36 })
    expect(spec.size({ label: 'Button', size: 'lg' }, DEFAULT_THEME, measure).height).toBe(40)
  })

  it('draws an instance as ordinary scene nodes under a root frame', () => {
    const node = instance('shadcn/button', { label: 'Deploy' }, { width: 90, height: 36 })
    const scene = expandInstance(node, DEFAULT_THEME, measure)!
    const root = scene.snapshot.nodes.get(scene.rootId)!
    expect(root).toMatchObject({ type: 'frame', fill: '#171717', cornerRadius: 8, hover: { fill: '#171717E6' } })
    const [label] = childrenOf(scene.snapshot, scene.rootId)
    expect(scene.snapshot.nodes.get(label)).toMatchObject({ type: 'text', text: 'Deploy', textAlign: 'center', width: 90, y: 8 })
  })

  it('draws a check mark only when checked', () => {
    const on = expandInstance(instance('shadcn/checkbox', { checked: true }, { width: 200, height: 16 }), DEFAULT_THEME, measure)!
    const off = expandInstance(instance('shadcn/checkbox', { checked: false }, { width: 200, height: 16 }), DEFAULT_THEME, measure)!
    expect(childrenOf(on.snapshot, on.rootId)).toHaveLength(4)
    expect(childrenOf(off.snapshot, off.rootId)).toHaveLength(2)
  })

  it('grows a card with its content and re-fits hugging buttons only', () => {
    const card = getSpec('shadcn/card')!
    const short = card.size({ ...card.defaults, content: 'Short' }, DEFAULT_THEME, measure, 360)
    const long = card.size({ ...card.defaults, content: 'A much longer body of text that wraps onto several lines.' }, DEFAULT_THEME, measure, 360)
    expect(long.height).toBeGreaterThan(short.height)

    const button = getSpec('shadcn/button')!
    const theme = DEFAULT_THEME
    const hugging = refit(button, { props: { label: 'Go' }, theme }, { props: { label: 'Go further' }, theme }, measure, { width: 46, height: 36 })
    const fixed = refit(button, { props: { label: 'Go' }, theme }, { props: { label: 'Go further' }, theme }, measure, { width: 200, height: 36 })
    expect(hugging.width).toBe(102)
    expect(fixed.width).toBe(200)
  })
})

describe('registry and theme', () => {
  it('derives npm dependencies from the vendored imports', () => {
    const deps = npmDependencies(['button', 'checkbox'])
    expect(deps).toEqual(expect.arrayContaining(['class-variance-authority', 'radix-ui', 'lucide-react']))
    expect(deps).not.toContain('react')
    expect(registryClosure(['card', 'button'])).toEqual(['button', 'card'])
  })

  it('validates stored themes and keeps primary text legible', () => {
    const theme = normalizeTheme({ primary: 'blue', radius: 99, font: 'Fraunces' })
    expect(theme.primary).toBe(DEFAULT_THEME.primary)
    expect(theme.radius).toBe(40)
    expect(theme.font).toBe('Fraunces')
    expect(withPrimary(DEFAULT_THEME, '#FACC15').primaryForeground).toBe('#171717')
    expect(withPrimary(DEFAULT_THEME, '#4338CA').primaryForeground).toBe('#FAFAFA')
  })
})
