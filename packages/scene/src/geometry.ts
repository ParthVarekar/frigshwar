import {
  apply,
  boundsOfPoints,
  fromPosition,
  IDENTITY,
  invert,
  multiply,
  rectCorners,
  rectsIntersect,
  unionRects,
  type Matrix,
  type Point,
  type Rect,
} from './matrix'
import { childrenOf, parentOf, type SceneSnapshot } from './tree'
import { isContainerType, type NodeId, type SceneNode } from './types'

const worldCache = new WeakMap<SceneSnapshot, Map<NodeId, Matrix>>()
const groupBoundsCache = new WeakMap<SceneSnapshot, Map<NodeId, Rect>>()

function cacheFor<T>(store: WeakMap<SceneSnapshot, Map<NodeId, T>>, snap: SceneSnapshot): Map<NodeId, T> {
  let map = store.get(snap)
  if (!map) store.set(snap, (map = new Map()))
  return map
}

/** A group is transparent: its local matrix is the identity. */
export function localMatrix(node: SceneNode): Matrix {
  if (node.type === 'group') return IDENTITY
  return fromPosition(node.x, node.y, node.rotation)
}

export function worldMatrix(snap: SceneSnapshot, id: NodeId): Matrix {
  const cache = cacheFor(worldCache, snap)
  const hit = cache.get(id)
  if (hit) return hit
  const node = snap.nodes.get(id)
  if (!node) return IDENTITY
  const m = multiply(parentSpaceMatrix(snap, id), localMatrix(node))
  cache.set(id, m)
  return m
}

/** World matrix of the space the node's x/y/rotation are expressed in. */
export function parentSpaceMatrix(snap: SceneSnapshot, id: NodeId): Matrix {
  const parent = parentOf(snap, id)
  return parent === null ? IDENTITY : worldMatrix(snap, parent)
}

/**
 * The node's box in its own local space. For groups this is derived from the
 * children and is expressed in the group's (= its parent's) space.
 */
export function localBounds(snap: SceneSnapshot, id: NodeId): Rect {
  const node = snap.nodes.get(id)
  if (!node) return { x: 0, y: 0, width: 0, height: 0 }
  if (node.type !== 'group') return { x: 0, y: 0, width: node.width, height: node.height }
  const cache = cacheFor(groupBoundsCache, snap)
  const hit = cache.get(id)
  if (hit) return hit
  const rects = childrenOf(snap, id).map((childId) => {
    const child = snap.nodes.get(childId)!
    const b = localBounds(snap, childId)
    const m = multiply(localMatrix(child), [1, 0, 0, 1, b.x, b.y])
    return boundsOfPoints(rectCorners(m, b.width, b.height))
  })
  const rect = unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 }
  cache.set(id, rect)
  return rect
}

export function worldCorners(snap: SceneSnapshot, id: NodeId): [Point, Point, Point, Point] {
  const b = localBounds(snap, id)
  return rectCorners(multiply(worldMatrix(snap, id), [1, 0, 0, 1, b.x, b.y]), b.width, b.height)
}

/** Axis-aligned bounding box in world space. */
export function worldBounds(snap: SceneSnapshot, id: NodeId): Rect {
  return boundsOfPoints(worldCorners(snap, id))
}

export function selectionBounds(snap: SceneSnapshot, ids: readonly NodeId[]): Rect | null {
  return unionRects(ids.filter((id) => snap.nodes.has(id)).map((id) => worldBounds(snap, id)))
}

export function toLocal(snap: SceneSnapshot, id: NodeId, world: Point): Point {
  return apply(invert(worldMatrix(snap, id)), world)
}

/**
 * Topmost node under a world point, as a chain from its root-level ancestor down
 * to the deepest hit. Hidden and locked subtrees are skipped; clipped frames
 * only hit children inside their box. `tolerance` is in world units.
 */
export function hitTest(snap: SceneSnapshot, point: Point, tolerance = 0): NodeId[] {
  const roots = childrenOf(snap, null)
  for (let i = roots.length - 1; i >= 0; i--) {
    const chain = hitNode(snap, roots[i], point, tolerance)
    if (chain) return chain
  }
  return []
}

function hitNode(snap: SceneSnapshot, id: NodeId, point: Point, tol: number): NodeId[] | null {
  const node = snap.nodes.get(id)
  if (!node || !node.visible || node.locked) return null
  const local = toLocal(snap, id, point)
  const inside =
    node.type !== 'group' &&
    local.x >= -tol &&
    local.y >= -tol &&
    local.x <= node.width + tol &&
    local.y <= node.height + tol

  if (isContainerType(node.type) && !(node.type === 'frame' && node.clip && !inside)) {
    const kids = childrenOf(snap, id)
    for (let i = kids.length - 1; i >= 0; i--) {
      const chain = hitNode(snap, kids[i], point, tol)
      if (chain) return [id, ...chain]
    }
  }
  if (!inside) return null
  if (node.type === 'ellipse' && node.width > 0 && node.height > 0) {
    const rx = node.width / 2 + tol
    const ry = node.height / 2 + tol
    const dx = (local.x - node.width / 2) / rx
    const dy = (local.y - node.height / 2) / ry
    if (dx * dx + dy * dy > 1) return null
  }
  return [id]
}

/** Deepest frame containing the point: the parent a new or dropped node should land in. */
export function frameAt(snap: SceneSnapshot, point: Point, exclude: ReadonlySet<NodeId> = new Set()): NodeId | null {
  const search = (parent: NodeId | null): NodeId | null => {
    const kids = childrenOf(snap, parent)
    for (let i = kids.length - 1; i >= 0; i--) {
      const id = kids[i]
      const node = snap.nodes.get(id)
      if (!node || !node.visible || exclude.has(id)) continue
      if (node.type === 'group') {
        const deeper = search(id)
        if (deeper) return deeper
        continue
      }
      if (node.type !== 'frame' || node.locked) continue
      const p = toLocal(snap, id, point)
      if (p.x >= 0 && p.y >= 0 && p.x <= node.width && p.y <= node.height) return search(id) ?? id
    }
    return null
  }
  return search(null)
}

/** Direct children of `parentId` whose world bounds touch `rect`. For marquee selection. */
export function nodesInRect(snap: SceneSnapshot, rect: Rect, parentId: NodeId | null): NodeId[] {
  return childrenOf(snap, parentId).filter((id) => {
    const node = snap.nodes.get(id)
    return node && node.visible && !node.locked && rectsIntersect(worldBounds(snap, id), rect)
  })
}
