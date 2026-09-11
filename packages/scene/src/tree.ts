import { isContainerType, type AssetRecord, type NodeId, type SceneNode } from './types'

/** Key under which canvas-level nodes are listed in `children`. Not a valid node id. */
export const ROOT = '#root'

const EMPTY: readonly NodeId[] = Object.freeze([])

/** Immutable, derived view of the document. Rebuilt after every Yjs transaction. */
export interface SceneSnapshot {
  readonly nodes: ReadonlyMap<NodeId, SceneNode>
  /** Children per container id (or ROOT), sorted back-to-front. */
  readonly children: ReadonlyMap<string, readonly NodeId[]>
  /** Effective parent after repairing orphans and cycles. `null` = canvas. */
  readonly parents: ReadonlyMap<NodeId, NodeId | null>
  /** Global paint order (depth-first pre-order). Higher paints later. */
  readonly order: ReadonlyMap<NodeId, number>
  readonly assets: ReadonlyMap<string, AssetRecord>
}

/**
 * Concurrent edits can produce states no single client would write: a child whose
 * parent was deleted, or A-inside-B while someone else moved B-inside-A. Every
 * client must repair these the same way, so the rules only depend on the merged
 * document:
 *  - a parent that is missing, not a container, or the node itself → canvas
 *  - in a parent cycle, the member with the smallest id is lifted to canvas
 */
export function buildSnapshot(
  nodes: ReadonlyMap<NodeId, SceneNode>,
  assets: ReadonlyMap<string, AssetRecord>,
  previous?: SceneSnapshot,
): SceneSnapshot {
  const parents = new Map<NodeId, NodeId | null>()
  for (const node of nodes.values()) {
    const p = node.parentId
    const parent = p !== null ? nodes.get(p) : undefined
    parents.set(node.id, parent && p !== node.id && isContainerType(parent.type) ? p : null)
  }

  const ids = [...nodes.keys()].sort()
  const done = new Set<NodeId>()
  for (const start of ids) {
    const path: NodeId[] = []
    const onPath = new Set<NodeId>()
    let cur: NodeId | null = start
    while (cur !== null && !done.has(cur)) {
      if (onPath.has(cur)) {
        const cycle = path.slice(path.indexOf(cur))
        parents.set(cycle.reduce((a, b) => (a < b ? a : b)), null)
        path.length = 0
        onPath.clear()
        cur = start
        continue
      }
      onPath.add(cur)
      path.push(cur)
      cur = parents.get(cur) ?? null
    }
    for (const id of path) done.add(id)
  }

  const grouped = new Map<string, SceneNode[]>()
  for (const node of nodes.values()) {
    const key = parents.get(node.id) ?? ROOT
    let list = grouped.get(key)
    if (!list) grouped.set(key, (list = []))
    list.push(node)
  }

  const children = new Map<string, readonly NodeId[]>()
  for (const [key, list] of grouped) {
    list.sort(compareSiblings)
    const next = list.map((n) => n.id)
    const prev = previous?.children.get(key)
    children.set(key, prev && sameIds(prev, next) ? prev : next)
  }

  const order = new Map<NodeId, number>()
  const visit = (key: string) => {
    for (const id of children.get(key) ?? EMPTY) {
      order.set(id, order.size)
      visit(id)
    }
  }
  visit(ROOT)

  return { nodes, children, parents, order, assets }
}

function compareSiblings(a: SceneNode, b: SceneNode): number {
  if (a.index !== b.index) return a.index < b.index ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function sameIds(a: readonly NodeId[], b: readonly NodeId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

export function emptySnapshot(): SceneSnapshot {
  return buildSnapshot(new Map(), new Map())
}

export function childrenOf(snap: SceneSnapshot, parentId: NodeId | null): readonly NodeId[] {
  return snap.children.get(parentId ?? ROOT) ?? EMPTY
}

export function parentOf(snap: SceneSnapshot, id: NodeId): NodeId | null {
  return snap.parents.get(id) ?? null
}

/** Nearest first: [parent, grandparent, …]. */
export function ancestorsOf(snap: SceneSnapshot, id: NodeId): NodeId[] {
  const out: NodeId[] = []
  for (let p = parentOf(snap, id); p !== null; p = parentOf(snap, p)) out.push(p)
  return out
}

/** Root-level ancestor first, `id` last. */
export function pathTo(snap: SceneSnapshot, id: NodeId): NodeId[] {
  return [...ancestorsOf(snap, id).reverse(), id]
}

export function isAncestorOf(snap: SceneSnapshot, ancestorId: NodeId, id: NodeId): boolean {
  for (let p = parentOf(snap, id); p !== null; p = parentOf(snap, p)) {
    if (p === ancestorId) return true
  }
  return false
}

export function descendantsOf(snap: SceneSnapshot, id: NodeId): NodeId[] {
  const out: NodeId[] = []
  const walk = (key: NodeId) => {
    for (const child of childrenOf(snap, key)) {
      out.push(child)
      walk(child)
    }
  }
  walk(id)
  return out
}

/** Sorts back-to-front in paint order. */
export function sortByPaintOrder(snap: SceneSnapshot, ids: Iterable<NodeId>): NodeId[] {
  return [...ids].sort((a, b) => (snap.order.get(a) ?? 0) - (snap.order.get(b) ?? 0))
}

/** Drops missing ids and ids whose ancestor is also present. Result is in paint order. */
export function normalizeSelection(snap: SceneSnapshot, ids: Iterable<NodeId>): NodeId[] {
  const set = new Set([...ids].filter((id) => snap.nodes.has(id)))
  return sortByPaintOrder(
    snap,
    [...set].filter((id) => !ancestorsOf(snap, id).some((a) => set.has(a))),
  )
}
