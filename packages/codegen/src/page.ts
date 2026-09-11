/**
 * One canvas-level frame → one React page component.
 *
 * Structure follows the scene graph 1:1 (absolute positioning inside each
 * frame until auto-layout lands). Semantics come from intent: linked layers are
 * buttons, large type is a heading, library instances are the real shadcn/ui
 * components, images are <img>.
 */
import { getSpec, resolveProps } from '@codeframe/library'
import {
  childrenOf,
  domLayout,
  motionCss,
  nodeCss,
  stateCss,
  type DomLayout,
  type FrameNode,
  type NodeId,
  type Point,
  type PrototypeLink,
  type SceneNode,
  type SceneSnapshot,
} from '@codeframe/scene'
import { escapeComment, jsxAttr, jsxText, kebabCase, unique } from './naming'
import { declarationsToClasses, type TailwindOptions } from './tailwind'

export interface SiteContext {
  snap: SceneSnapshot
  /** Frame id → route path. */
  routes: Map<NodeId, string>
  /** Asset id → public URL. */
  assets: Map<string, string>
  tailwind: TailwindOptions
  /** Collected across pages. */
  registry: Set<string>
  fonts: Set<string>
  usesMotion: boolean
}

interface PageState {
  site: SiteContext
  imports: Map<string, Set<string>>
  ids: Set<string>
  usesNavigate: boolean
  hasH1: boolean
}

const indent = (depth: number) => '  '.repeat(depth)

function classesFor(node: SceneNode, layout: DomLayout, state: PageState, extra: string[] = []): string[] {
  const { tailwind } = state.site
  const base = { ...nodeCss(node, layout), ...motionCss(node) }
  if (node.appear || node.loop) state.site.usesMotion = true
  const classes = [...declarationsToClasses(base, '', tailwind), ...extra]
  if (node.hover) classes.push(...declarationsToClasses(stateCss(node, node.hover, layout), 'hover:', tailwind))
  if (node.press) classes.push(...declarationsToClasses(stateCss(node, node.press, layout), 'active:', tailwind))
  return [...new Set(classes)]
}

function onClick(link: PrototypeLink | null, state: PageState): string {
  if (!link) return ''
  const target = link.target === 'back' ? '-1' : state.site.routes.get(link.target)
  if (!target) return ''
  state.usesNavigate = true
  const to = target === '-1' ? '-1' : `'${target}'`
  const options = link.transition === 'instant' ? '' : `, { transition: '${link.transition}', duration: ${link.duration}, easing: '${link.easing}' }`
  return ` onClick={() => navigate(${to}${options})}`
}

function element(depth: number, tag: string, attributes: string, children: string[]): string {
  if (children.length === 0) return `${indent(depth)}<${tag}${attributes} />`
  return `${indent(depth)}<${tag}${attributes}>\n${children.join('\n')}\n${indent(depth)}</${tag}>`
}

function renderNode(id: NodeId, origin: Point, depth: number, inButton: boolean, state: PageState): string | null {
  const { snap } = state.site
  const node = snap.nodes.get(id)
  if (!node || !node.visible) return null
  const layout = domLayout(snap, id, origin)
  const click = onClick(node.link, state)
  const clickable = click ? ['cursor-pointer'] : []

  switch (node.type) {
    case 'component': {
      const spec = getSpec(node.component)
      if (!spec) return null
      const box = nodeCss(node, layout)
      if (spec.resize === 'none') {
        delete box.width
        delete box.height
      } else if (spec.resize === 'width') {
        delete box.height
      }
      const props = resolveProps(node)
      const classes = [...declarationsToClasses({ ...box, ...motionCss(node) }, '', state.site.tailwind), ...clickable]
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
        attributes: click,
        text: jsxText,
        attr: jsxAttr,
        uniqueId: (hint) => unique(kebabCase(hint) || 'field', state.ids, '-'),
      })
      return indent(depth) + jsx
    }

    case 'image': {
      const src = node.assetId ? state.site.assets.get(node.assetId) : undefined
      const fit = node.fit === 'fill' ? 'object-fill' : `object-${node.fit}`
      const classes = classesFor(node, layout, state, [fit, ...clickable])
      if (!src) return element(depth, 'div', ` className=${jsxAttr([...classes, 'bg-neutral-200'].join(' '))}${click}`, [])
      return `${indent(depth)}<img src="${src}" alt=${jsxAttr(node.name)} className=${jsxAttr(classes.join(' '))}${click} />`
    }

    case 'text': {
      state.site.fonts.add(node.fontFamily)
      let tag = 'p'
      if (inButton) tag = 'span'
      else if (click) tag = 'button'
      else if (node.fontSize >= 40 && !state.hasH1) {
        tag = 'h1'
        state.hasH1 = true
      } else if (node.fontSize >= 28) tag = 'h2'
      const extra = [...clickable]
      if (tag === 'span') extra.push('block')
      if (tag === 'button' && node.textAlign === 'left') extra.push('text-left')
      const classes = classesFor(node, layout, state, extra)
      const type = tag === 'button' ? ' type="button"' : ''
      return `${indent(depth)}<${tag}${type} className=${jsxAttr(classes.join(' '))}${click}>${jsxText(node.text)}</${tag}>`
    }

    default: {
      const tag = click && !inButton ? 'button' : 'div'
      const next = node.type === 'group' ? { x: origin.x + layout.left, y: origin.y + layout.top } : { x: 0, y: 0 }
      const children = childrenOf(snap, id)
        .map((child) => renderNode(child, next, depth + 1, inButton || tag === 'button', state))
        .filter((c): c is string => c !== null)
      const type = tag === 'button' ? ' type="button"' : ''
      return element(depth, tag, `${type} className=${jsxAttr(classesFor(node, layout, state, clickable).join(' '))}${click}`, children)
    }
  }
}

export interface RenderedPage {
  componentName: string
  source: string
}

export function renderPage(frameId: NodeId, componentName: string, site: SiteContext): RenderedPage {
  const frame = site.snap.nodes.get(frameId) as FrameNode
  const state: PageState = { site, imports: new Map(), ids: new Set(), usesNavigate: false, hasH1: false }
  const rootLayout = { left: 0, top: 0, width: frame.width, height: frame.height, rotation: 0 }
  const rootCss = { ...nodeCss(frame, rootLayout), ...motionCss(frame) }
  delete rootCss.position
  delete rootCss.left
  delete rootCss.top
  if (frame.appear || frame.loop) site.usesMotion = true
  const rootClasses = ['relative', 'mx-auto', ...declarationsToClasses(rootCss, '', site.tailwind)]

  const children = childrenOf(site.snap, frameId)
    .map((id) => renderNode(id, { x: 0, y: 0 }, 3, false, state))
    .filter((c): c is string => c !== null)

  const importLines = [...state.imports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, names]) => `import { ${[...names].join(', ')} } from '${module}'`)
  if (state.usesNavigate) importLines.push(`import { useNavigate } from '@/router'`)

  const source = [
    `/* Set in Codeframe · frame "${escapeComment(frame.name)}" · ${Math.round(frame.width)}×${Math.round(frame.height)} */`,
    ...importLines,
    '',
    `export default function ${componentName}() {`,
    ...(state.usesNavigate ? ['  const navigate = useNavigate()', ''] : []),
    '  return (',
    element(2, 'main', ` className=${jsxAttr(rootClasses.join(' '))}`, children),
    '  )',
    '}',
    '',
  ].join('\n')
  return { componentName, source }
}
