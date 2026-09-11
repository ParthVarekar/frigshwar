import { buildSnapshot, NODE_DEFAULTS, type ComponentNode, type SceneNode, type SceneSnapshot } from '@codeframe/scene'
import { SHADCN_COMPONENTS } from './shadcn/components'
import { SHADCN_REGISTRY } from './shadcn/registry.generated'
import type { ComponentSpec, MeasureText, Props } from './spec'
import type { LibraryTheme } from './theme'

export * from './spec'
export * from './theme'
export { SHADCN_REGISTRY } from './shadcn/registry.generated'

export const LIBRARY_NAME = 'shadcn/ui'
export const COMPONENTS: readonly ComponentSpec[] = SHADCN_COMPONENTS

const byKey = new Map(COMPONENTS.map((spec) => [spec.key, spec]))

export function getSpec(key: string): ComponentSpec | undefined {
  return byKey.get(key)
}

/** Spec defaults overlaid with the instance's own props. */
export function resolveProps(node: ComponentNode): Props {
  const spec = getSpec(node.component)
  return { ...spec?.defaults, ...node.props }
}

export interface VirtualScene {
  snapshot: SceneSnapshot
  /** A frame at (0,0) sized to the instance, holding the drawn parts. */
  rootId: string
}

/**
 * Draws an instance as ordinary scene nodes (ids `<instance>~<part>`), so the
 * canvas and the Preview render components with the same code as everything else.
 */
export function expandInstance(node: ComponentNode, theme: LibraryTheme, measure: MeasureText): VirtualScene | null {
  const spec = getSpec(node.component)
  if (!spec) return null
  const box = { width: node.width, height: node.height }
  const drawing = spec.draw(resolveProps(node), theme, box, measure)
  const rootId = `${node.id}~root`
  const nodes = new Map<string, SceneNode>()
  nodes.set(rootId, {
    ...NODE_DEFAULTS.frame,
    fill: null,
    clip: false,
    ...drawing.root,
    id: rootId,
    name: spec.name,
    parentId: null,
    index: 'a0',
    x: 0,
    y: 0,
    rotation: 0,
    ...box,
  } as SceneNode)
  drawing.children.forEach((part, i) => {
    const { key, type, ...patch } = part
    const id = `${node.id}~${key}`
    nodes.set(id, { ...NODE_DEFAULTS[type], name: key, ...patch, type, id, parentId: rootId, index: `k${String(i).padStart(4, '0')}` } as SceneNode)
  })
  return { snapshot: buildSnapshot(nodes, new Map()), rootId }
}

/**
 * Size an instance should take after its props (or the theme) change. Content
 * that follows the designer's width keeps it; hugging components re-fit.
 */
export function fittedSize(
  spec: ComponentSpec,
  props: Props,
  theme: LibraryTheme,
  measure: MeasureText,
  current: { width: number; height: number },
): { width: number; height: number } {
  const natural = spec.size(props, theme, measure, current.width)
  if (spec.resize === 'both') return current
  if (spec.resize === 'width') return { width: current.width, height: natural.height }
  return natural
}

/**
 * Like `fittedSize`, but a width-resizable instance that was hugging its
 * content (e.g. a Button still at its natural width) re-fits to the new props.
 */
export function refit(
  spec: ComponentSpec,
  before: { props: Props; theme: LibraryTheme },
  after: { props: Props; theme: LibraryTheme },
  measure: MeasureText,
  current: { width: number; height: number },
): { width: number; height: number } {
  const next = fittedSize(spec, after.props, after.theme, measure, current)
  if (spec.resize !== 'width') return next
  const wasHugging = Math.abs(spec.size(before.props, before.theme, measure, current.width).width - current.width) < 1
  return wasHugging ? { width: spec.size(after.props, after.theme, measure, current.width).width, height: next.height } : next
}

/** Registry items needed for a set of items, including their registry dependencies. */
export function registryClosure(items: Iterable<string>): string[] {
  const out = new Set<string>()
  const visit = (name: string) => {
    if (out.has(name) || !SHADCN_REGISTRY[name]) return
    out.add(name)
    for (const dep of SHADCN_REGISTRY[name].registryDependencies) visit(dep)
  }
  for (const item of items) visit(item)
  return [...out].sort()
}

/** npm packages imported by the vendored files, read from their import statements. */
export function npmDependencies(items: Iterable<string>): string[] {
  const packages = new Set<string>()
  for (const name of registryClosure(items)) {
    for (const file of SHADCN_REGISTRY[name].files) {
      for (const match of file.content.matchAll(/from\s+["']([^"']+)["']/g)) {
        const specifier = match[1]
        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier === 'react') continue
        packages.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
      }
    }
  }
  return [...packages].sort()
}
