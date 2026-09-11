/**
 * One canvas-level frame → one React page component.
 *
 * Structure follows the scene graph 1:1 (absolute positioning inside each
 * frame until auto layout lands). Semantics come from intent: clickable layers
 * are buttons, large type is a heading, library instances are the real shadcn/ui
 * components, images are <img>.
 *
 * Interactions call the vendored motion runtime (`src/motion.tsx`): handlers
 * for pointer triggers, hooks for delay, key and in-view triggers, and `data-cf*`
 * attributes for what the runtime looks up (scroll targets, clip and effect
 * targets, Smart Animate matches, in-view appears).
 */
import { getSpec, resolveProps } from '@codeframe/library'
import {
  childrenOf,
  domLayout,
  interactionBindings,
  motionCss,
  nodeCss,
  parentOf,
  resolveActions,
  stateCss,
  type Action,
  type DomLayout,
  type FrameLayout,
  type FrameNode,
  type NodeId,
  type Point,
  type ResolveContext,
  type ResolvedAction,
  type SceneNode,
  type SceneSnapshot,
} from '@codeframe/scene'
import { camelCase, jsLiteral } from './literal'
import { escapeComment, jsxAttr, jsxText, kebabCase, unique } from './naming'
import { declarationsToClasses, type TailwindOptions } from './tailwind'

export interface SiteContext {
  snap: SceneSnapshot
  /** Frame id → route path. */
  routes: Map<NodeId, string>
  /** Asset id → public URL. */
  assets: Map<string, string>
  tailwind: TailwindOptions
  /** Layers the runtime finds by `data-cf`, with their ids. */
  elementIds: Map<NodeId, string>
  /** Frames taking part in Smart Animate transitions; their layers carry `data-cf-match`. */
  smartFrames: Set<NodeId>
  /** Collected across pages. */
  registry: Set<string>
  fonts: Set<string>
  /** Appear or loop keyframes are needed in index.css. */
  usesMotion: boolean
}

interface PageState {
  site: SiteContext
  resolve: ResolveContext
  imports: Map<string, Set<string>>
  /** Names imported from `@/motion`. */
  motion: Set<string>
  /** Statements at the top of the page component, after `useMotion()`. */
  hooks: string[]
  ids: Set<string>
  /** Local variable names in the component. */
  locals: Set<string>
  hasH1: boolean
  smart: boolean
}

interface Place {
  inButton: boolean
  /** An ancestor handles clicks, so this layer's click must not bubble to it. */
  insideClickable: boolean
  /** Layer-name path under the frame, for Smart Animate matching. */
  matchPath: string
}

const indent = (depth: number) => '  '.repeat(depth)

const ELEMENT_TYPES: Record<string, string> = {
  div: 'HTMLDivElement',
  button: 'HTMLButtonElement',
  p: 'HTMLParagraphElement',
  h1: 'HTMLHeadingElement',
  h2: 'HTMLHeadingElement',
  span: 'HTMLSpanElement',
  img: 'HTMLImageElement',
}

/** The auto layout a node flows in, if its parent is an auto-layout frame. */
function parentLayoutOf(snap: SceneSnapshot, id: NodeId): FrameLayout | null {
  const parentId = parentOf(snap, id)
  const parent = parentId === null ? undefined : snap.nodes.get(parentId)
  return parent?.type === 'frame' ? parent.layout : null
}

function classesFor(node: SceneNode, layout: DomLayout, state: PageState, extra: string[] = []): string[] {
  const { tailwind } = state.site
  const base = { ...nodeCss(node, layout, parentLayoutOf(state.site.snap, node.id)), ...motionCss(node) }
  if (node.appear || node.loop) state.site.usesMotion = true
  const classes = [...declarationsToClasses(base, '', tailwind), ...extra]
  if (node.hover) classes.push(...declarationsToClasses(stateCss(node, node.hover, layout), 'hover:', tailwind))
  if (node.press) classes.push(...declarationsToClasses(stateCss(node, node.press, layout), 'active:', tailwind))
  return [...new Set(classes)]
}

function statement(action: ResolvedAction): string {
  switch (action.type) {
    case 'navigate':
      return `motion.navigate(${[jsLiteral(action.to), ...(action.transition ? [jsLiteral(action.transition)] : [])].join(', ')})`
    case 'back':
      return `motion.back(${action.transition ? jsLiteral(action.transition) : ''})`
    case 'overlay':
      return `motion.openOverlay(${jsLiteral(action.to)}, ${jsLiteral(action.overlay)})`
    case 'swap-overlay':
      return `motion.swapOverlay(${[jsLiteral(action.to), ...(action.transition ? [jsLiteral(action.transition)] : [])].join(', ')})`
    case 'close-overlay':
      return 'motion.closeOverlay()'
    case 'scroll-to':
      return `motion.scrollTo(${jsLiteral(action.to)}, ${jsLiteral(action.scroll)})`
    case 'open-url':
      return `motion.openUrl(${jsLiteral(action.url)}, ${action.newTab})`
    case 'play':
      return `motion.play(${jsLiteral(action.clip)}, ${jsLiteral(action.mode)})`
  }
}

/** What undoes an action when "while hovering" / "while pressing" ends. Mirrors the runtime's `revert`. */
function revertStatement(action: ResolvedAction): string[] {
  switch (action.type) {
    case 'navigate':
      return ['motion.back()']
    case 'overlay':
    case 'swap-overlay':
      return ['motion.closeOverlay()']
    case 'play':
      return [`motion.play(${jsLiteral(action.clip)}, 'reverse')`]
    default:
      return []
  }
}

function arrow(statements: string[], stopPropagation: boolean): string {
  const body = stopPropagation ? ['e.stopPropagation()', ...statements] : statements
  const params = stopPropagation ? '(e)' : '()'
  return body.length === 1 ? `${params} => ${body[0]}` : `${params} => { ${body.join('; ')} }`
}

function runs(actions: readonly Action[], state: PageState): string[] {
  return resolveActions(actions, state.resolve).map(statement)
}

function reverts(actions: readonly Action[], state: PageState): string[] {
  return resolveActions(actions, state.resolve).reverse().flatMap(revertStatement)
}

function isClickable(node: SceneNode, state: PageState): boolean {
  const b = interactionBindings(node)
  return runs([...(b.events.click ?? []), ...(b.events['mouse-down'] ?? []), ...b.whilePressing], state).length > 0
}

/** Event handlers, runtime attributes and page-level hooks for a layer's interactions and effects. */
function behavior(node: SceneNode, tag: string, place: Place | null, state: PageState): string {
  const parts: string[] = []
  const cfId = state.site.elementIds.get(node.id)
  if (cfId) parts.push(` data-cf=${jsxAttr(cfId)}`)
  if (state.smart && place?.matchPath) parts.push(` data-cf-match=${jsxAttr(place.matchPath)}`)
  if (node.appear?.trigger === 'in-view') {
    parts.push(' data-cf-appear="in-view"')
    if (!node.appear.once) parts.push(' data-cf-once="false"')
    if (node.appear.amount !== 0.3) parts.push(` data-cf-amount="${node.appear.amount}"`)
  }

  const b = interactionBindings(node)
  const events: [string, string[]][] = [
    ['onClick', runs(b.events.click ?? [], state)],
    ['onMouseEnter', [...runs(b.events['mouse-enter'] ?? [], state), ...runs(b.whileHovering, state)]],
    ['onMouseLeave', [...runs(b.events['mouse-leave'] ?? [], state), ...reverts(b.whileHovering, state)]],
    ['onMouseDown', [...runs(b.events['mouse-down'] ?? [], state), ...runs(b.whilePressing, state)]],
    ['onMouseUp', [...runs(b.events['mouse-up'] ?? [], state), ...reverts(b.whilePressing, state)]],
  ]
  for (const [event, statements] of events) {
    if (statements.length === 0) continue
    state.motion.add('useMotion')
    parts.push(` ${event}={${arrow(statements, event === 'onClick' && Boolean(place?.insideClickable))}}`)
  }
  for (const { delay, actions } of b.afterDelay) {
    const statements = runs(actions, state)
    if (statements.length === 0) continue
    state.motion.add('useMotion').add('useAfterDelay')
    state.hooks.push(`useAfterDelay(${delay}, ${arrow(statements, false)})`)
  }
  for (const { key, actions } of b.keys) {
    const statements = runs(actions, state)
    if (statements.length === 0) continue
    state.motion.add('useMotion').add('useKey')
    state.hooks.push(`useKey(${jsLiteral(key)}, ${arrow(statements, false)})`)
  }
  const inView = runs(b.inView, state)
  if (inView.length) {
    state.motion.add('useMotion').add('useInView')
    const name = unique(`${camelCase(node.name, 'layer')}InView`, state.locals)
    state.hooks.push(`const ${name} = useInView<${ELEMENT_TYPES[tag] ?? 'HTMLElement'}>(${arrow(inView, false)})`)
    parts.push(` ref={${name}}`)
  }
  return parts.join('')
}

function element(depth: number, tag: string, attributes: string, children: string[]): string {
  if (children.length === 0) return `${indent(depth)}<${tag}${attributes} />`
  return `${indent(depth)}<${tag}${attributes}>\n${children.join('\n')}\n${indent(depth)}</${tag}>`
}

function renderNode(id: NodeId, origin: Point, depth: number, place: Place, state: PageState): string | null {
  const { snap } = state.site
  const node = snap.nodes.get(id)
  if (!node || !node.visible) return null
  const layout = domLayout(snap, id, origin)
  const clickable = isClickable(node, state)
  const cursor = clickable ? ['cursor-pointer'] : []
  const here: Place = { ...place, matchPath: place.matchPath ? `${place.matchPath}/${node.name}` : node.name }
  const inside = (inButton: boolean): Place => ({ inButton, insideClickable: place.insideClickable || clickable, matchPath: here.matchPath })

  switch (node.type) {
    case 'component': {
      const spec = getSpec(node.component)
      if (!spec) return null
      const box = nodeCss(node, layout, parentLayoutOf(snap, node.id))
      if (spec.resize === 'none') {
        delete box.width
        delete box.height
      } else if (spec.resize === 'width') {
        delete box.height
      }
      const props = resolveProps(node)
      const classes = [...declarationsToClasses({ ...box, ...motionCss(node) }, '', state.site.tailwind), ...cursor]
      if (node.hover) classes.push(...declarationsToClasses(stateCss(node, node.hover, layout), 'hover:', state.site.tailwind))
      if (node.press) classes.push(...declarationsToClasses(stateCss(node, node.press, layout), 'active:', state.site.tailwind))
      if (node.appear || node.loop) state.site.usesMotion = true
      for (const [file, names] of Object.entries(spec.imports(props))) {
        const module = `@/components/ui/${file}`
        const set = state.imports.get(module) ?? new Set()
        for (const name of names) set.add(name)
        state.imports.set(module, set)
      }
      for (const item of spec.registry(props)) state.site.registry.add(item)
      const jsx = spec.jsx(props, {
        className: classes.join(' '),
        attributes: behavior(node, 'component', here, state),
        text: jsxText,
        attr: jsxAttr,
        uniqueId: (hint) => unique(kebabCase(hint) || 'field', state.ids, '-'),
      })
      return indent(depth) + jsx
    }

    case 'image': {
      const src = node.assetId ? state.site.assets.get(node.assetId) : undefined
      const fit = node.fit === 'fill' ? 'object-fill' : `object-${node.fit}`
      const classes = classesFor(node, layout, state, [fit, ...cursor])
      if (!src) return element(depth, 'div', ` className=${jsxAttr([...classes, 'bg-neutral-200'].join(' '))}${behavior(node, 'div', here, state)}`, [])
      return `${indent(depth)}<img src="${src}" alt=${jsxAttr(node.name)} className=${jsxAttr(classes.join(' '))}${behavior(node, 'img', here, state)} />`
    }

    case 'text': {
      state.site.fonts.add(node.fontFamily)
      let tag = 'p'
      if (place.inButton) tag = 'span'
      else if (clickable) tag = 'button'
      else if (node.fontSize >= 40 && !state.hasH1) {
        tag = 'h1'
        state.hasH1 = true
      } else if (node.fontSize >= 28) tag = 'h2'
      const extra = [...cursor]
      if (tag === 'span') extra.push('block')
      if (tag === 'button' && node.textAlign === 'left') extra.push('text-left')
      const classes = classesFor(node, layout, state, extra)
      const type = tag === 'button' ? ' type="button"' : ''
      return `${indent(depth)}<${tag}${type} className=${jsxAttr(classes.join(' '))}${behavior(node, tag, here, state)}>${jsxText(node.text)}</${tag}>`
    }

    default: {
      const tag = clickable && !place.inButton ? 'button' : 'div'
      const next = node.type === 'group' ? { x: origin.x + layout.left, y: origin.y + layout.top } : { x: 0, y: 0 }
      const attributes = `${tag === 'button' ? ' type="button"' : ''} className=${jsxAttr(classesFor(node, layout, state, cursor).join(' '))}${behavior(node, tag, here, state)}`
      const children = childrenOf(snap, id)
        .map((child) => renderNode(child, next, depth + 1, inside(place.inButton || tag === 'button'), state))
        .filter((c): c is string => c !== null)
      return element(depth, tag, attributes, children)
    }
  }
}

export interface RenderedPage {
  componentName: string
  source: string
}

export function renderPage(frameId: NodeId, componentName: string, site: SiteContext): RenderedPage {
  const frame = site.snap.nodes.get(frameId) as FrameNode
  const state: PageState = {
    site,
    resolve: { screen: (id) => site.routes.get(id) ?? null, element: (id) => site.elementIds.get(id) ?? null },
    imports: new Map(),
    motion: new Set(),
    hooks: [],
    ids: new Set(),
    locals: new Set(['motion']),
    hasH1: false,
    smart: site.smartFrames.has(frameId),
  }
  const rootLayout = { left: 0, top: 0, width: frame.width, height: frame.height, rotation: 0 }
  const rootCss = { ...nodeCss(frame, rootLayout), ...motionCss(frame) }
  delete rootCss.position
  delete rootCss.left
  delete rootCss.top
  if (frame.appear || frame.loop) site.usesMotion = true
  const rootClasses = ['relative', 'mx-auto', ...declarationsToClasses(rootCss, '', site.tailwind)]
  const rootAttributes = behavior(frame, 'main', null, state)
  const rootPlace: Place = { inButton: false, insideClickable: isClickable(frame, state), matchPath: '' }

  const children = childrenOf(site.snap, frameId)
    .map((id) => renderNode(id, { x: 0, y: 0 }, 3, rootPlace, state))
    .filter((c): c is string => c !== null)

  const importLines = [...state.imports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, names]) => `import { ${[...names].join(', ')} } from '${module}'`)
  if (state.motion.size) importLines.push(`import { ${[...state.motion].sort().join(', ')} } from '@/motion'`)

  const setup = [...(state.motion.has('useMotion') ? ['const motion = useMotion()'] : []), ...state.hooks]
  const source = [
    `/* Set in Codeframe · frame "${escapeComment(frame.name)}" · ${Math.round(frame.width)}×${Math.round(frame.height)} */`,
    ...importLines,
    '',
    `export default function ${componentName}() {`,
    ...setup.map((line) => `  ${line}`),
    ...(setup.length ? [''] : []),
    '  return (',
    element(2, 'main', ` className=${jsxAttr(rootClasses.join(' '))}${rootAttributes}`, children),
    '  )',
    '}',
    '',
  ].join('\n')
  return { componentName, source }
}
