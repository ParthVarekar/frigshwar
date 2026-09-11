/**
 * Scene graph → CSS. The Preview renders with this today and the code exporter
 * builds on it, so canvas, preview and shipped code share one mapping.
 *
 * Conventions that keep the output close to hand-written CSS:
 *  - strokes are inset box-shadows, so they never shift layout;
 *  - rotation pivots on the element's center (CSS default), converted from the
 *    model's top-left pivot;
 *  - states and motion use the individual `translate`/`scale`/`rotate` props and
 *    keyframes use `transform`, so they compose instead of overwriting each other.
 */
import { localBounds } from './geometry'
import { round2, type Point } from './matrix'
import { childrenOf, type SceneSnapshot } from './tree'
import type { Easing, NodeId, SceneNode, Shadow, StateStyle, TextNode } from './types'

/** Property (kebab-case) → value with units. */
export type CssDeclarations = Record<string, string>

/** Matches Tailwind's easing scale so exported classes stay idiomatic. */
export const EASING_CSS: Record<Easing, string> = {
  linear: 'linear',
  ease: 'ease',
  'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
  'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
  'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

export interface DomLayout {
  left: number
  top: number
  width: number
  height: number
  rotation: number
}

const px = (n: number) => `${round2(n)}px`

/**
 * A node's element box relative to its parent element. `origin` is where the
 * parent element starts, in the node's coordinate space: (0,0) inside frames,
 * the wrapper's corner inside groups (whose children share the group's space).
 */
export function domLayout(snap: SceneSnapshot, id: NodeId, origin: Point = { x: 0, y: 0 }): DomLayout {
  const node = snap.nodes.get(id)!
  if (node.type === 'group') {
    const b = localBounds(snap, id)
    return { left: b.x - origin.x, top: b.y - origin.y, width: b.width, height: b.height, rotation: 0 }
  }
  const { width: w, height: h, rotation } = node
  const r = (rotation * Math.PI) / 180
  // Where the center lands after rotating about the top-left corner.
  const cx = (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r)
  const cy = (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r)
  return {
    left: round2(node.x - origin.x - w / 2 + cx),
    top: round2(node.y - origin.y - h / 2 + cy),
    width: w,
    height: h,
    rotation,
  }
}

export function fontStack(family: string): string {
  const generic = /mono/i.test(family)
    ? 'ui-monospace, monospace'
    : /fraunces|serif/i.test(family)
      ? 'Georgia, serif'
      : 'ui-sans-serif, system-ui, sans-serif'
  return `"${family}", ${generic}`
}

function shadowValue(s: Shadow): string {
  return `${px(s.x)} ${px(s.y)} ${px(s.blur)} ${s.color}`
}

function boxShadow(node: SceneNode, shadow: Shadow | null): string | null {
  const layers: string[] = []
  if (shadow && node.type !== 'text' && node.type !== 'group') layers.push(shadowValue(shadow))
  if ('stroke' in node && node.stroke && node.strokeWidth > 0) layers.push(`inset 0 0 0 ${px(node.strokeWidth)} ${node.stroke}`)
  return layers.length ? layers.join(', ') : null
}

function textCss(node: TextNode): CssDeclarations {
  const css: CssDeclarations = {
    margin: '0',
    color: node.fill,
    'font-family': fontStack(node.fontFamily),
    'font-size': px(node.fontSize),
    'font-weight': String(node.fontWeight),
    'line-height': String(node.lineHeight),
    'text-align': node.textAlign,
    'white-space': node.autoResize === 'width' ? 'pre' : 'pre-wrap',
    'overflow-wrap': 'break-word',
  }
  if (node.italic) css['font-style'] = 'italic'
  if (node.letterSpacing) css['letter-spacing'] = px(node.letterSpacing)
  return css
}

export function nodeCss(node: SceneNode, layout: DomLayout): CssDeclarations {
  const css: CssDeclarations = {
    position: 'absolute',
    left: px(layout.left),
    top: px(layout.top),
    width: px(layout.width),
    height: px(layout.height),
    'box-sizing': 'border-box',
  }
  if (layout.rotation) css.rotate = `${round2(layout.rotation)}deg`
  if (node.opacity < 1) css.opacity = String(round2(node.opacity))
  switch (node.type) {
    case 'frame':
      if (node.fill) css['background-color'] = node.fill
      if (node.cornerRadius) css['border-radius'] = px(node.cornerRadius)
      if (node.clip) css.overflow = 'hidden'
      break
    case 'rect':
      if (node.fill) css['background-color'] = node.fill
      if (node.cornerRadius) css['border-radius'] = px(node.cornerRadius)
      break
    case 'ellipse':
      if (node.fill) css['background-color'] = node.fill
      css['border-radius'] = '50%'
      break
    case 'image':
      if (node.cornerRadius) css['border-radius'] = px(node.cornerRadius)
      css.overflow = 'hidden'
      break
    case 'text':
      Object.assign(css, textCss(node))
      break
    case 'group':
      break
  }
  const shadows = boxShadow(node, node.shadow)
  if (shadows) css['box-shadow'] = shadows
  if (node.type === 'text' && node.shadow) css['text-shadow'] = shadowValue(node.shadow)
  return css
}

export function stateCss(node: SceneNode, state: StateStyle, layout: DomLayout): CssDeclarations {
  const css: CssDeclarations = {}
  if (state.x || state.y) css.translate = `${px(state.x ?? 0)} ${px(state.y ?? 0)}`
  if (state.scale !== undefined && state.scale !== 1) css.scale = String(round2(state.scale))
  if (state.rotate) css.rotate = `${round2(layout.rotation + state.rotate)}deg`
  if (state.opacity !== undefined) css.opacity = String(round2(state.opacity))
  if (state.fill && node.type !== 'image' && node.type !== 'group') {
    css[node.type === 'text' ? 'color' : 'background-color'] = state.fill
  }
  if (state.shadow) {
    if (node.type === 'text') css['text-shadow'] = shadowValue(state.shadow)
    else {
      const shadows = boxShadow(node, state.shadow)
      if (shadows) css['box-shadow'] = shadows
    }
  }
  return css
}

/** Transition timing for states, plus appear/loop animations (loop starts once appear ends). */
export function motionCss(node: SceneNode): CssDeclarations {
  const css: CssDeclarations = {}
  if (node.hover || node.press) {
    const t = node.transition
    css['transition-property'] = 'translate, scale, rotate, opacity, background-color, color, box-shadow, text-shadow'
    css['transition-duration'] = `${t.duration}ms`
    css['transition-timing-function'] = EASING_CSS[t.easing]
    if (t.delay) css['transition-delay'] = `${t.delay}ms`
  }
  const animations: string[] = []
  let loopDelay = 0
  if (node.appear) {
    const a = node.appear
    animations.push(`cf-appear-${a.preset} ${a.duration}ms ${EASING_CSS[a.easing]} ${a.delay}ms backwards`)
    if (a.preset.startsWith('slide')) css['--cf-distance'] = px(a.distance)
    loopDelay = a.delay + a.duration
  }
  if (node.loop) {
    const l = node.loop
    animations.push(`cf-loop-${l.preset} ${l.duration}ms ${EASING_CSS[l.easing]} ${loopDelay}ms infinite`)
  }
  if (animations.length) css.animation = animations.join(', ')
  return css
}

/**
 * Keyframes referenced by `motionCss`. Appear uses `backwards` fill, so once it
 * finishes the element's own styles (and its :hover rules) are back in charge.
 */
export const MOTION_KEYFRAMES = [
  '@keyframes cf-appear-fade{from{opacity:0}}',
  '@keyframes cf-appear-slide-up{from{opacity:0;transform:translateY(var(--cf-distance))}}',
  '@keyframes cf-appear-slide-down{from{opacity:0;transform:translateY(calc(var(--cf-distance) * -1))}}',
  '@keyframes cf-appear-slide-left{from{opacity:0;transform:translateX(var(--cf-distance))}}',
  '@keyframes cf-appear-slide-right{from{opacity:0;transform:translateX(calc(var(--cf-distance) * -1))}}',
  '@keyframes cf-appear-scale{from{opacity:0;transform:scale(0.92)}}',
  '@keyframes cf-appear-blur{from{opacity:0;filter:blur(12px)}}',
  '@keyframes cf-loop-pulse{50%{opacity:0.5}}',
  '@keyframes cf-loop-spin{to{transform:rotate(360deg)}}',
  '@keyframes cf-loop-bounce{0%,100%{transform:translateY(-12%)}50%{transform:none}}',
  '@keyframes cf-loop-float{50%{transform:translateY(-8px)}}',
  '@keyframes cf-loop-wiggle{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}',
].join('\n')

export function declarations(css: CssDeclarations): string {
  return Object.entries(css)
    .map(([property, value]) => `${property}:${value}`)
    .join(';')
}

/**
 * Stylesheet for a subtree rendered as nested absolutely-positioned elements.
 * The root is drawn at (0,0), unrotated, like a page.
 */
export function subtreeStylesheet(snap: SceneSnapshot, rootId: NodeId, className: (id: NodeId) => string): string {
  const rules: string[] = []
  const visit = (id: NodeId, origin: Point, isRoot: boolean) => {
    const node = snap.nodes.get(id)
    if (!node || !node.visible) return
    const layout = isRoot
      ? { left: 0, top: 0, width: node.width, height: node.height, rotation: 0 }
      : domLayout(snap, id, origin)
    const selector = `.${className(id)}`
    rules.push(`${selector}{${declarations({ ...nodeCss(node, layout), ...motionCss(node) })}}`)
    if (node.hover) rules.push(`${selector}:hover{${declarations(stateCss(node, node.hover, layout))}}`)
    if (node.press) rules.push(`${selector}:active{${declarations(stateCss(node, node.press, layout))}}`)
    const next = node.type === 'group' ? { x: origin.x + layout.left, y: origin.y + layout.top } : { x: 0, y: 0 }
    for (const child of childrenOf(snap, id)) visit(child, next, false)
  }
  visit(rootId, { x: 0, y: 0 }, true)
  return rules.join('\n')
}
