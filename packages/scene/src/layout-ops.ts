/**
 * Editing auto layout. Adding it infers direction, gap, padding, alignment and
 * flow order from where the children already sit (Figma's Shift+A). Removing it,
 * or taking a child out of the flow, writes the computed geometry back so
 * nothing jumps. Canvas gestures use the slot helpers to reorder a stack
 * instead of moving its children.
 */
import { worldMatrix } from './geometry'
import { inFlow, isAutoLayout, stackedSize } from './layout'
import { apply, invert, unionRects, type Point, type Rect } from './matrix'
import { DEFAULT_LAYOUT } from './normalize'
import { applyPatches, frameNodes } from './ops'
import { keysForPosition } from './order'
import type { SceneStore, TransactOptions } from './store'
import type { PatchMap } from './transform'
import { childrenOf, normalizeSelection, parentOf, type SceneSnapshot } from './tree'
import type { FrameLayout, LayoutAlign, NodeId, NodePatch, SceneNode } from './types'

/** Whether a node is placed by its parent's auto layout. */
export function isStacked(snap: SceneSnapshot, id: NodeId): boolean {
  const node = snap.nodes.get(id)
  const parentId = parentOf(snap, id)
  return !!node && parentId !== null && isAutoLayout(snap.nodes.get(parentId)) && inFlow(node)
}

const aligned = (values: number[]) => values.every((v) => Math.abs(v - values[0]) <= 1)

/** The layout that keeps a frame's children about where they are, and their order in it. */
export function inferLayout(snap: SceneSnapshot, frameId: NodeId): { layout: FrameLayout; order: NodeId[] } {
  const frame = snap.nodes.get(frameId)
  const children = childrenOf(snap, frameId)
  const items = children.flatMap((id) => {
    const n = snap.nodes.get(id)!
    return inFlow(n) ? [{ id, x: n.x, y: n.y, width: n.width, height: n.height }] : []
  })
  const bounds = unionRects(items)
  if (!frame || !bounds) return { layout: { ...DEFAULT_LAYOUT, padding: { ...DEFAULT_LAYOUT.padding } }, order: [...children] }

  // Side by side, a row spans about the sum of the widths; stacked, about the widest.
  const total = (key: 'width' | 'height') => items.reduce((sum, it) => sum + it[key], 0) || 1
  const horizontal = items.length > 1 && bounds.width / total('width') > bounds.height / total('height')
  const start = (r: Rect) => (horizontal ? r.x : r.y)
  const end = (r: Rect) => (horizontal ? r.x + r.width : r.y + r.height)
  const sorted = [...items].sort((a, b) => start(a) - start(b))
  const gaps = sorted.slice(1).map((it, i) => Math.max(0, start(it) - end(sorted[i])))
  const gap = gaps.length ? Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length) : DEFAULT_LAYOUT.gap

  const crossStart = sorted.map((r) => (horizontal ? r.y : r.x))
  const crossEnd = sorted.map((r) => (horizontal ? r.y + r.height : r.x + r.width))
  const align: LayoutAlign = aligned(crossStart)
    ? 'start'
    : aligned(crossStart.map((s, i) => (s + crossEnd[i]) / 2))
      ? 'center'
      : aligned(crossEnd)
        ? 'end'
        : 'start'

  const px = (v: number) => Math.max(0, Math.round(v))
  const layout: FrameLayout = {
    ...DEFAULT_LAYOUT,
    direction: horizontal ? 'horizontal' : 'vertical',
    gap,
    crossGap: gap,
    padding: {
      top: px(bounds.y),
      right: px(frame.width - bounds.x - bounds.width),
      bottom: px(frame.height - bounds.y - bounds.height),
      left: px(bounds.x),
    },
    align,
  }
  // Flow children take their visual order within the slots they already hold; the rest stay put.
  const flowing = new Set(items.map((it) => it.id))
  let next = 0
  const order = children.map((id) => (flowing.has(id) ? sorted[next++].id : id))
  return { layout, order }
}

/** Turns on auto layout for frames without it. `hug` sizes them to their content. Returns the frames changed. */
export function addAutoLayout(store: SceneStore, ids: Iterable<NodeId>, hug = false, options?: TransactOptions): NodeId[] {
  const snap = store.getSnapshot()
  const patches: PatchMap = new Map()
  const changed: NodeId[] = []
  for (const id of ids) {
    const node = snap.nodes.get(id)
    if (node?.type !== 'frame' || node.layout) continue
    const { layout, order } = inferLayout(snap, id)
    patches.set(id, { layout, ...(hug ? { sizeX: 'hug' as const, sizeY: 'hug' as const } : {}) })
    const children = childrenOf(snap, id)
    if (order.some((childId, i) => childId !== children[i])) {
      const keys = keysForPosition([], 0, order.length)
      order.forEach((childId, i) => patches.set(childId, { index: keys[i] }))
    }
    changed.push(id)
  }
  if (patches.size > 0) applyPatches(store, patches, options)
  return changed
}

/** Wraps nodes in a new auto-layout frame that hugs them. One undo step. */
export function wrapInAutoLayout(store: SceneStore, ids: Iterable<NodeId>): NodeId | null {
  const id = frameNodes(store, ids)
  if (id) addAutoLayout(store, [id], true, { merge: true })
  return id
}

function baked(node: SceneNode): NodePatch {
  return { x: node.x, y: node.y, ...stackedSize(node) }
}

/** Turns auto layout off, writing the computed geometry back so nothing moves. */
export function removeAutoLayout(store: SceneStore, ids: Iterable<NodeId>): void {
  const snap = store.getSnapshot()
  const patches: PatchMap = new Map()
  for (const id of ids) {
    const frame = snap.nodes.get(id)
    if (!isAutoLayout(frame)) continue
    patches.set(id, {
      layout: null,
      width: frame.width,
      height: frame.height,
      sizeX: frame.sizeX === 'hug' ? 'fixed' : frame.sizeX,
      sizeY: frame.sizeY === 'hug' ? 'fixed' : frame.sizeY,
    })
    for (const childId of childrenOf(snap, id)) {
      const child = snap.nodes.get(childId)!
      if (inFlow(child)) patches.set(childId, baked(child))
    }
  }
  if (patches.size > 0) applyPatches(store, patches)
}

/** Takes children out of their stack's flow (where they're drawn) or puts them back. */
export function setAbsolute(store: SceneStore, ids: Iterable<NodeId>, absolute: boolean): void {
  const snap = store.getSnapshot()
  const patches: PatchMap = new Map()
  for (const id of ids) {
    const node = snap.nodes.get(id)
    if (!node || node.absolute === absolute) continue
    patches.set(id, absolute && isStacked(snap, id) ? { ...baked(node), absolute } : { absolute })
  }
  if (patches.size > 0) applyPatches(store, patches)
}

/**
 * A size set by hand fixes that axis, as in Figma: typing or dragging a width
 * onto a hug or fill layer switches its width to fixed. Mutates and returns `patches`.
 */
export function pinSizing(snap: SceneSnapshot, patches: PatchMap): PatchMap {
  for (const [id, patch] of patches) {
    const node = snap.nodes.get(id)
    if (!node) continue
    if (patch.width !== undefined && patch.sizeX === undefined && node.sizeX !== 'fixed' && Math.abs(patch.width - node.width) > 0.5) {
      patch.sizeX = 'fixed'
    }
    if (patch.height !== undefined && patch.sizeY === undefined && node.sizeY !== 'fixed' && Math.abs(patch.height - node.height) > 0.5) {
      patch.sizeY = 'fixed'
    }
  }
  return patches
}

/**
 * Where a drop at a world point lands in a stack's flow, as the slot among all
 * of the frame's children that `moveNodes` takes. Wrapped stacks read in lines.
 */
export function flowPosition(snap: SceneSnapshot, frameId: NodeId, point: Point, exclude: ReadonlySet<NodeId> = new Set()): number {
  const frame = snap.nodes.get(frameId)
  const children = childrenOf(snap, frameId)
  if (!isAutoLayout(frame)) return children.length
  const { direction, wrap } = frame.layout
  const p = apply(invert(worldMatrix(snap, frameId)), point)
  const isAfter = (n: SceneNode) => {
    const cx = n.x + n.width / 2
    const cy = n.y + n.height / 2
    if (direction === 'horizontal') return wrap ? p.y > n.y + n.height || (p.y >= n.y && p.x > cx) : p.x > cx
    return wrap ? p.x > n.x + n.width || (p.x >= n.x && p.y > cy) : p.y > cy
  }
  const flow = children.filter((id) => !exclude.has(id) && inFlow(snap.nodes.get(id)!))
  const before = flow.find((id) => !isAfter(snap.nodes.get(id)!))
  if (before !== undefined) return children.indexOf(before)
  const last = flow.at(-1)
  return last === undefined ? children.length : children.indexOf(last) + 1
}

/** Whether nodes already sit at `position` among a frame's children, so a move would change nothing. */
export function atPosition(snap: SceneSnapshot, ids: Iterable<NodeId>, frameId: NodeId, position: number): boolean {
  const moving = normalizeSelection(snap, ids)
  if (moving.some((id) => parentOf(snap, id) !== frameId)) return false
  const children = childrenOf(snap, frameId)
  const set = new Set(moving)
  const rest = children.filter((id) => !set.has(id))
  const slot = children.slice(0, position).filter((id) => !set.has(id)).length
  const expected = [...rest.slice(0, slot), ...moving, ...rest.slice(slot)]
  return expected.every((id, i) => id === children[i])
}
