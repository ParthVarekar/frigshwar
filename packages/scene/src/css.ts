/**
 * Scene graph → CSS. The Preview renders with this and the code exporter builds
 * on it, so canvas, preview and shipped code share one mapping.
 *
 * Conventions that keep the output close to hand-written CSS:
 *  - strokes are inset box-shadows, so they never shift layout;
 *  - rotation pivots on the element's center (CSS default), converted from the
 *    model's top-left pivot;
 *  - states and motion use the individual `translate`/`scale`/`rotate` props and
 *    keyframes use `transform`, so they compose instead of overwriting each other;
 *  - curves go through `curveCss`: béziers as `cubic-bezier()`, springs as `linear()`.
 */
import { curveCss, timingCss } from './curves'
import { localBounds } from './geometry'
import { inFlow, isAutoLayout } from './layout'
import { round2, type Point } from './matrix'
import { childrenOf, type SceneSnapshot } from './tree'
import type { FrameLayout, NodeId, SceneNode, Shadow, SizingMode, StateStyle, TextNode } from './types'

/** Property (kebab-case) → value with units. */
export type CssDeclarations = Record<string, string>

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

/** An auto-layout frame as a flex container. Items start at `flex-start` on both axes unless aligned. */
function flexCss(l: FrameLayout): CssDeclarations {
  const css: CssDeclarations = { display: 'flex' }
  if (l.direction === 'vertical') css['flex-direction'] = 'column'
  if (l.wrap) css['flex-wrap'] = 'wrap'
  const main = l.justify === 'space-between' ? 0 : l.gap
  const cross = l.wrap ? l.crossGap : 0
  if (!l.wrap || main === cross) {
    if (main) css.gap = px(main)
  } else {
    const [rowGap, columnGap] = l.direction === 'horizontal' ? [cross, main] : [main, cross]
    if (rowGap) css['row-gap'] = px(rowGap)
    if (columnGap) css['column-gap'] = px(columnGap)
  }
  const { top, right, bottom, left } = l.padding
  if (top || right || bottom || left) css.padding = `${px(top)} ${px(right)} ${px(bottom)} ${px(left)}`
  if (l.justify !== 'start') css['justify-content'] = l.justify === 'end' ? 'flex-end' : l.justify
  css['align-items'] = l.align === 'start' ? 'flex-start' : l.align === 'end' ? 'flex-end' : 'center'
  return css
}

/**
 * Width and height by sizing mode. Hugging boxes leave the browser to size them
 * from content; `fill` flexes along the parent's direction and stretches across it.
 */
function sizeCss(node: SceneNode, box: DomLayout, parent: FrameLayout | null): CssDeclarations {
  const css: CssDeclarations = {}
  const axis = (dim: 'width' | 'height', mode: SizingMode) => {
    const horizontalAxis = dim === 'width'
    if (parent && mode === 'fill') {
      if ((parent.direction === 'horizontal') === horizontalAxis) {
        css.flex = '1 1 0px'
        css[horizontalAxis ? 'min-width' : 'min-height'] = '0px'
      } else {
        css['align-self'] = 'stretch'
      }
      return
    }
    if (mode === 'hug' && isAutoLayout(node)) return
    // Flowing text sizes itself the way it does on the canvas.
    if (parent && node.type === 'text' && (horizontalAxis ? node.autoResize === 'width' : node.autoResize !== 'none')) return
    css[dim] = px(box[dim])
  }
  axis('width', node.sizeX)
  axis('height', node.sizeY)
  if (node.minWidth !== null) css['min-width'] = px(node.minWidth)
  if (node.maxWidth !== null) css['max-width'] = px(node.maxWidth)
  if (node.minHeight !== null) css['min-height'] = px(node.minHeight)
  if (node.maxHeight !== null) css['max-height'] = px(node.maxHeight)
  return css
}

/**
 * `parentLayout` is the auto layout of the element's parent frame, if any:
 * children that flow in it get relative positioning without offsets.
 */
export function nodeCss(node: SceneNode, layout: DomLayout, parentLayout: FrameLayout | null = null): CssDeclarations {
  const flowing = parentLayout !== null && inFlow(node)
  const css: CssDeclarations = flowing
    ? { position: 'relative', 'flex-shrink': '0', 'box-sizing': 'border-box' }
    : { position: 'absolute', left: px(layout.left), top: px(layout.top), 'box-sizing': 'border-box' }
  Object.assign(css, sizeCss(node, layout, flowing ? parentLayout : null))
  if (isAutoLayout(node)) Object.assign(css, flexCss(node.layout))
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
  if (state.blur) css.filter = `blur(${px(state.blur)})`
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

/**
 * State transition timing, plus appear and loop animations (the loop starts
 * once a load-triggered appear ends). Appear reads its start state from
 * `--cf-from-*` custom properties, so one shared `@keyframes` serves every layer.
 */
export function motionCss(node: SceneNode): CssDeclarations {
  const css: CssDeclarations = {}
  if (node.hover || node.press) {
    const t = timingCss(node.transition)
    css['transition-property'] = 'translate, scale, rotate, opacity, background-color, color, box-shadow, text-shadow, filter'
    css['transition-duration'] = `${t.duration}ms`
    css['transition-timing-function'] = t.easing
    if (t.delay) css['transition-delay'] = `${t.delay}ms`
  }
  const animations: string[] = []
  let loopDelay = 0
  if (node.appear) {
    const { from } = node.appear
    const t = timingCss(node.appear.timing)
    if (from.opacity !== undefined || node.opacity < 1) css['--cf-from-opacity'] = String(round2(from.opacity ?? node.opacity))
    if (from.x) css['--cf-from-x'] = px(from.x)
    if (from.y) css['--cf-from-y'] = px(from.y)
    if (from.scale !== undefined && from.scale !== 1) css['--cf-from-scale'] = String(round2(from.scale))
    if (from.rotate) css['--cf-from-rotate'] = `${round2(from.rotate)}deg`
    if (from.blur) css['--cf-from-filter'] = `blur(${px(from.blur)})`
    animations.push(`cf-appear ${t.duration}ms ${t.easing} ${t.delay}ms backwards`)
    if (node.appear.trigger === 'load') loopDelay = t.delay + t.duration
  }
  if (node.loop) {
    const l = node.loop
    animations.push(`cf-loop-${l.preset} ${l.duration}ms ${curveCss(l.curve)} ${loopDelay}ms infinite`)
  }
  if (animations.length) css.animation = animations.join(', ')
  return css
}

/**
 * Keyframes and runtime hooks referenced by `motionCss`. Appear uses `backwards`
 * fill, so once it finishes the element's own styles (and its :hover rules) are
 * back in charge. In-view appears hold their start state, paused, until the
 * motion runtime marks the element `data-cf-inview`.
 */
export const MOTION_KEYFRAMES = [
  '@keyframes cf-appear{from{opacity:var(--cf-from-opacity,1);transform:translate(var(--cf-from-x,0px),var(--cf-from-y,0px)) scale(var(--cf-from-scale,1)) rotate(var(--cf-from-rotate,0deg));filter:var(--cf-from-filter,none)}}',
  '[data-cf-appear="in-view"]:not([data-cf-inview]){animation-play-state:paused}',
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
  const visit = (id: NodeId, origin: Point, isRoot: boolean, parentLayout: FrameLayout | null) => {
    const node = snap.nodes.get(id)
    if (!node || !node.visible) return
    const layout = isRoot
      ? { left: 0, top: 0, width: node.width, height: node.height, rotation: 0 }
      : domLayout(snap, id, origin)
    const selector = `.${className(id)}`
    rules.push(`${selector}{${declarations({ ...nodeCss(node, layout, parentLayout), ...motionCss(node) })}}`)
    if (node.hover) rules.push(`${selector}:hover{${declarations(stateCss(node, node.hover, layout))}}`)
    if (node.press) rules.push(`${selector}:active{${declarations(stateCss(node, node.press, layout))}}`)
    const next = node.type === 'group' ? { x: origin.x + layout.left, y: origin.y + layout.top } : { x: 0, y: 0 }
    const childLayout = node.type === 'frame' ? node.layout : null
    for (const child of childrenOf(snap, id)) visit(child, next, false, childLayout)
  }
  visit(rootId, { x: 0, y: 0 }, true, null)
  return rules.join('\n')
}
