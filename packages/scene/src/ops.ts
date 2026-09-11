/**
 * Document operations. Each one reads the current snapshot, computes every write
 * up front (the snapshot doesn't update until a transaction ends), then applies
 * them in a single transaction so it is one undo step and one sync message.
 */
import { insertNode, patchNode } from './doc'
import { parentSpaceMatrix, selectionBounds, worldBounds, worldMatrix } from './geometry'
import { newId } from './ids'
import { inFlow, isAutoLayout, stackedSize } from './layout'
import { apply, IDENTITY, invert, multiply, normalizeDeg, round2, translation, unionRects, type Matrix, type Point } from './matrix'
import { migrateLink } from './normalize'
import { keysForPosition } from './order'
import type { SceneStore, TransactOptions } from './store'
import { patchesForTranslate, rebaseSubtree, type PatchMap } from './transform'
import {
  ancestorsOf,
  childrenOf,
  descendantsOf,
  isAncestorOf,
  normalizeSelection,
  parentOf,
  type SceneSnapshot,
} from './tree'
import {
  isContainerType,
  NODE_DEFAULTS,
  TYPE_LABELS,
  type Action,
  type AnimationClip,
  type AssetRecord,
  type Interaction,
  type NodeId,
  type NodePatch,
  type NodeType,
  type SceneNode,
} from './types'

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height'] as const

function spaceOf(snap: SceneSnapshot, containerId: NodeId | null): Matrix {
  return containerId === null ? IDENTITY : worldMatrix(snap, containerId)
}

function siblingKeys(snap: SceneSnapshot, parentId: NodeId | null, exclude?: ReadonlySet<NodeId>): string[] {
  return childrenOf(snap, parentId)
    .filter((id) => !exclude?.has(id))
    .map((id) => snap.nodes.get(id)!.index)
}

export function nextName(snap: SceneSnapshot, type: NodeType): string {
  let count = 0
  for (const node of snap.nodes.values()) if (node.type === type) count++
  return `${TYPE_LABELS[type]} ${count + 1}`
}

export function applyPatches(store: SceneStore, patches: Iterable<[NodeId, NodePatch]>, options?: TransactOptions): void {
  store.transact(() => {
    for (const [id, patch] of patches) {
      const y = store.nodes.get(id)
      if (y) patchNode(y, cleanPatch(patch))
    }
  }, options)
}

/** Rounds geometry so float noise never reaches the document (or generated code). */
function cleanPatch(patch: NodePatch): NodePatch {
  const out: NodePatch = { ...patch }
  for (const key of GEOMETRY_KEYS) {
    const v = out[key]
    if (typeof v === 'number') out[key] = round2(v)
  }
  if (typeof out.rotation === 'number') out.rotation = normalizeDeg(out.rotation)
  return out
}

export interface CreateNodeInput {
  type: NodeType
  props?: NodePatch
  parentId?: NodeId | null
  /** Slot among the parent's current children. Defaults to the top. */
  position?: number
  id?: NodeId
}

export function createNode(store: SceneStore, input: CreateNodeInput, options?: TransactOptions): NodeId {
  const snap = store.getSnapshot()
  const parentId = input.parentId ?? null
  const keys = siblingKeys(snap, parentId)
  const node = {
    ...NODE_DEFAULTS[input.type],
    name: nextName(snap, input.type),
    ...cleanPatch(input.props ?? {}),
    id: input.id ?? newId(),
    type: input.type,
    parentId,
    index: keysForPosition(keys, input.position ?? keys.length)[0],
  } as SceneNode
  store.transact(() => insertNode(store.nodes, node), options)
  return node.id
}

/** Deletes nodes with their descendants, plus any group left empty. */
export function deleteNodes(store: SceneStore, ids: Iterable<NodeId>): void {
  const snap = store.getSnapshot()
  const doomed = new Set<NodeId>()
  for (const id of ids) {
    if (!snap.nodes.has(id)) continue
    doomed.add(id)
    for (const d of descendantsOf(snap, id)) doomed.add(d)
  }
  for (const id of [...doomed]) {
    for (const ancestor of ancestorsOf(snap, id)) {
      const node = snap.nodes.get(ancestor)!
      if (node.type !== 'group' || !childrenOf(snap, ancestor).every((c) => doomed.has(c))) break
      doomed.add(ancestor)
    }
  }
  if (doomed.size === 0) return
  store.transact(() => {
    for (const id of doomed) store.nodes.delete(id)
  })
}

/**
 * Moves nodes into `targetId` (or the canvas) at slot `position` of the target's
 * current children, keeping them visually in place.
 */
export function moveNodes(
  store: SceneStore,
  ids: Iterable<NodeId>,
  targetId: NodeId | null,
  position: number,
  options?: TransactOptions,
): void {
  const snap = store.getSnapshot()
  const target = targetId === null ? null : snap.nodes.get(targetId)
  if (targetId !== null && (!target || !isContainerType(target.type))) return
  const moving = normalizeSelection(snap, ids).filter(
    (id) => id !== targetId && !(targetId !== null && isAncestorOf(snap, id, targetId)),
  )
  if (moving.length === 0) return
  const movingSet = new Set(moving)
  const slot = childrenOf(snap, targetId).slice(0, position).filter((id) => !movingSet.has(id)).length
  const keys = keysForPosition(siblingKeys(snap, targetId, movingSet), slot, moving.length)
  applyPatches(store, planReparent(snap, moving, targetId, keys), options)
}

function planReparent(snap: SceneSnapshot, ids: readonly NodeId[], targetId: NodeId | null, keys: readonly string[]): PatchMap {
  const out: PatchMap = new Map()
  const inverseTarget = invert(spaceOf(snap, targetId))
  const intoStack = targetId !== null && isAutoLayout(snap.nodes.get(targetId))
  ids.forEach((id, i) => {
    const parentId = parentOf(snap, id)
    if (parentId !== targetId) {
      rebaseSubtree(snap, id, multiply(inverseTarget, parentSpaceMatrix(snap, id)), out)
      const node = snap.nodes.get(id)!
      if (!intoStack && leavesStack(snap, parentId, node)) out.set(id, { ...out.get(id), ...stackedSize(node) })
    }
    out.set(id, { ...out.get(id), parentId: targetId, index: keys[i] })
  })
  return out
}

function leavesStack(snap: SceneSnapshot, parentId: NodeId | null, node: SceneNode): boolean {
  return parentId !== null && isAutoLayout(snap.nodes.get(parentId)) && inFlow(node)
}

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back'

export function reorderNodes(store: SceneStore, ids: Iterable<NodeId>, direction: ReorderDirection): void {
  const snap = store.getSnapshot()
  const selected = new Set(normalizeSelection(snap, ids))
  const byParent = new Map<NodeId | null, NodeId[]>()
  for (const id of selected) {
    const parent = parentOf(snap, id)
    byParent.set(parent, [...(byParent.get(parent) ?? []), id])
  }
  const patches: PatchMap = new Map()
  for (const parent of byParent.keys()) {
    const list = childrenOf(snap, parent).map((id) => ({ id, key: snap.nodes.get(id)!.index }))
    const isSel = (i: number) => selected.has(list[i].id)
    const moveTo = (from: number, to: number) => {
      const [item] = list.splice(from, 1)
      item.key = keysForPosition(list.map((e) => e.key), to)[0]
      list.splice(to, 0, item)
      patches.set(item.id, { index: item.key })
    }
    if (direction === 'forward') {
      for (let i = list.length - 2; i >= 0; i--) if (isSel(i) && !isSel(i + 1)) moveTo(i, i + 1)
    } else if (direction === 'backward') {
      for (let i = 1; i < list.length; i++) if (isSel(i) && !isSel(i - 1)) moveTo(i, i - 1)
    } else {
      const members = list.filter((e) => selected.has(e.id))
      const rest = list.filter((e) => !selected.has(e.id)).map((e) => e.key)
      const keys = keysForPosition(rest, direction === 'front' ? rest.length : 0, members.length)
      members.forEach((e, i) => patches.set(e.id, { index: keys[i] }))
    }
  }
  if (patches.size > 0) applyPatches(store, patches)
}

/** Wraps nodes in a group placed where the topmost of them was. */
export function groupNodes(store: SceneStore, ids: Iterable<NodeId>): NodeId | null {
  return wrapNodes(store, ids, 'group')
}

/** Wraps nodes in a frame sized to their bounds. */
export function frameNodes(store: SceneStore, ids: Iterable<NodeId>): NodeId | null {
  return wrapNodes(store, ids, 'frame')
}

function wrapNodes(store: SceneStore, ids: Iterable<NodeId>, type: 'group' | 'frame'): NodeId | null {
  const snap = store.getSnapshot()
  const selection = normalizeSelection(snap, ids)
  if (selection.length === 0) return null
  const topmost = selection[selection.length - 1]
  const parentId = parentOf(snap, topmost)
  const siblings = childrenOf(snap, parentId)
  const slot = siblings.indexOf(topmost) + 1
  const wrapperId = newId()

  let wrapperProps: NodePatch = {}
  let wrapperSpace = spaceOf(snap, parentId)
  if (type === 'frame') {
    const inverseParent = invert(wrapperSpace)
    const bounds = unionRects(
      selection.map((id) => {
        const r = worldBounds(snap, id)
        const a = apply(inverseParent, { x: r.x, y: r.y })
        const b = apply(inverseParent, { x: r.x + r.width, y: r.y + r.height })
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
      }),
    )!
    wrapperProps = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, fill: null }
    wrapperSpace = multiply(wrapperSpace, translation(bounds.x, bounds.y))
  }

  const wrapper = {
    ...NODE_DEFAULTS[type],
    name: nextName(snap, type),
    ...cleanPatch(wrapperProps),
    id: wrapperId,
    type,
    parentId,
    index: keysForPosition(siblingKeys(snap, parentId), slot)[0],
  } as SceneNode

  const childKeys = keysForPosition([], 0, selection.length)
  const inverseWrapper = invert(wrapperSpace)
  const patches: PatchMap = new Map()
  selection.forEach((id, i) => {
    rebaseSubtree(snap, id, multiply(inverseWrapper, parentSpaceMatrix(snap, id)), patches)
    patches.set(id, { ...patches.get(id), parentId: wrapperId, index: childKeys[i] })
  })

  store.transact(() => {
    insertNode(store.nodes, wrapper)
    applyPatches(store, patches)
  })
  return wrapperId
}

/** Dissolves groups and frames, lifting their children into place. Returns the lifted ids. */
export function unwrapNodes(store: SceneStore, ids: Iterable<NodeId>): NodeId[] {
  const snap = store.getSnapshot()
  const containers = normalizeSelection(snap, ids).filter((id) => isContainerType(snap.nodes.get(id)!.type))
  if (containers.length === 0) return []
  const patches: PatchMap = new Map()
  const lifted: NodeId[] = []
  for (const containerId of containers) {
    const parentId = parentOf(snap, containerId)
    const kids = childrenOf(snap, containerId)
    const siblings = childrenOf(snap, parentId)
    const keys = keysForPosition(siblingKeys(snap, parentId), siblings.indexOf(containerId) + 1, kids.length)
    const delta = multiply(invert(spaceOf(snap, parentId)), worldMatrix(snap, containerId))
    const intoStack = parentId !== null && isAutoLayout(snap.nodes.get(parentId))
    kids.forEach((id, i) => {
      rebaseSubtree(snap, id, delta, patches)
      const node = snap.nodes.get(id)!
      const size = !intoStack && leavesStack(snap, containerId, node) ? stackedSize(node) : {}
      patches.set(id, { ...patches.get(id), ...size, parentId, index: keys[i] })
      lifted.push(id)
    })
  }
  store.transact(() => {
    applyPatches(store, patches)
    for (const id of containers) store.nodes.delete(id)
  })
  return lifted
}

// ---------------------------------------------------------------------------
// Clipboard & duplication
// ---------------------------------------------------------------------------

export interface ClipboardPayload {
  kind: 'codeframe/nodes'
  version: 1
  /** Root nodes carry world-space x/y/rotation so they can land in any parent. */
  roots: NodeId[]
  nodes: SceneNode[]
  assets: AssetRecord[]
}

export function serializeNodes(snap: SceneSnapshot, ids: Iterable<NodeId>): ClipboardPayload {
  const roots = normalizeSelection(snap, ids)
  const worldPatches: PatchMap = new Map()
  for (const id of roots) rebaseSubtree(snap, id, parentSpaceMatrix(snap, id), worldPatches)
  const nodes: SceneNode[] = []
  const assetIds = new Set<string>()
  for (const id of roots) {
    for (const nodeId of [id, ...descendantsOf(snap, id)]) {
      const node = { ...snap.nodes.get(nodeId)!, ...worldPatches.get(nodeId) } as SceneNode
      if (nodeId === id) node.parentId = null
      if (node.type === 'image' && node.assetId) assetIds.add(node.assetId)
      nodes.push(node)
    }
  }
  const assets = [...assetIds].flatMap((a) => snap.assets.get(a) ?? [])
  return { kind: 'codeframe/nodes', version: 1, roots, nodes, assets }
}

export function isClipboardPayload(value: unknown): value is ClipboardPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ClipboardPayload).kind === 'codeframe/nodes' &&
    Array.isArray((value as ClipboardPayload).nodes)
  )
}

/** Inserts a payload into `targetId`, offset in world space. Returns the new root ids. */
export function pasteNodes(
  store: SceneStore,
  payload: ClipboardPayload,
  targetId: NodeId | null,
  options: { offset?: Point; position?: number } = {},
): NodeId[] {
  const snap = store.getSnapshot()
  const idMap = new Map(payload.nodes.map((n) => [n.id, newId()]))
  const rootSet = new Set(payload.roots)
  const keys = siblingKeys(snap, targetId)
  const rootKeys = keysForPosition(keys, options.position ?? keys.length, payload.roots.length)
  const offset = options.offset ?? { x: 0, y: 0 }

  // Rebase root subtrees from world space into the target, via a scratch snapshot of the payload.
  const scratch = new Map(payload.nodes.map((n) => [n.id, n]))
  const scratchSnap = scratchSnapshot(scratch)
  const delta = multiply(invert(spaceOf(snap, targetId)), translation(offset.x, offset.y))
  const patches: PatchMap = new Map()
  for (const root of payload.roots) rebaseSubtree(scratchSnap, root, delta, patches)

  const created: SceneNode[] = payload.nodes.map((node) => {
    const isRoot = rootSet.has(node.id)
    return {
      ...node,
      ...cleanPatch(patches.get(node.id) ?? {}),
      id: idMap.get(node.id)!,
      parentId: isRoot ? targetId : (idMap.get(node.parentId ?? '') ?? targetId),
      index: isRoot ? rootKeys[payload.roots.indexOf(node.id)] : node.index,
      // Payloads copied by a v1 client still carry `link`.
      interactions: remapInteractions(node.interactions ?? migrateLink((node as { link?: unknown }).link), idMap),
    } as SceneNode
  })

  store.transact(() => {
    for (const asset of payload.assets) if (!store.assets.has(asset.id)) store.assets.set(asset.id, asset)
    for (const node of created) insertNode(store.nodes, node)
  })
  return payload.roots.map((id) => idMap.get(id)!)
}

function scratchSnapshot(nodes: Map<NodeId, SceneNode>): SceneSnapshot {
  const children = new Map<string, NodeId[]>()
  const parents = new Map<NodeId, NodeId | null>()
  for (const node of nodes.values()) {
    const parent = node.parentId !== null && nodes.has(node.parentId) ? node.parentId : null
    parents.set(node.id, parent)
    if (parent !== null) children.set(parent, [...(children.get(parent) ?? []), node.id])
  }
  return { nodes, children, parents, order: new Map(), assets: new Map(), animations: new Map() }
}

/** Action targets inside a pasted set (frames linking to each other) follow the copies. */
function remapInteractions(interactions: Interaction[], idMap: ReadonlyMap<NodeId, NodeId>): Interaction[] {
  return interactions.map((ix) => ({
    ...ix,
    actions: ix.actions.map((a) => ('target' in a && idMap.has(a.target) ? ({ ...a, target: idMap.get(a.target)! } as Action) : a)),
  }))
}

/**
 * Duplicates nodes directly above their originals. Canvas-level frames are
 * placed to the right of the selection instead of on top of it.
 */
export function duplicateNodes(store: SceneStore, ids: Iterable<NodeId>, options: { inPlace?: boolean } = {}): NodeId[] {
  const snap = store.getSnapshot()
  const selection = normalizeSelection(snap, ids)
  const byParent = new Map<NodeId | null, NodeId[]>()
  for (const id of selection) {
    const parent = parentOf(snap, id)
    byParent.set(parent, [...(byParent.get(parent) ?? []), id])
  }
  const created: NodeId[] = []
  store.transact(() => {
    for (const [parent, members] of byParent) {
      const siblings = childrenOf(snap, parent)
      const position = Math.max(...members.map((id) => siblings.indexOf(id))) + 1
      const shiftRight = !options.inPlace && parent === null && members.every((id) => snap.nodes.get(id)!.type === 'frame')
      const bounds = shiftRight ? unionRects(members.map((id) => worldBounds(snap, id))) : null
      const offset = bounds ? { x: bounds.width + 40, y: 0 } : { x: 0, y: 0 }
      created.push(...pasteNodes(store, serializeNodes(snap, members), parent, { offset, position }))
    }
  })
  return created
}

export function addAsset(store: SceneStore, asset: AssetRecord): void {
  if (store.assets.has(asset.id)) return
  store.transact(() => store.assets.set(asset.id, asset), { untracked: true })
}

// ---------------------------------------------------------------------------
// Timeline clips
// ---------------------------------------------------------------------------

/** Creates or replaces a clip. Clips are whole JSON values, so the last writer wins per clip. */
export function putAnimation(store: SceneStore, clip: AnimationClip, options?: TransactOptions): void {
  store.transact(() => store.animations.set(clip.id, JSON.parse(JSON.stringify(clip))), options)
}

export function deleteAnimation(store: SceneStore, id: string): void {
  if (!store.animations.has(id)) return
  store.transact(() => store.animations.delete(id))
}

// ---------------------------------------------------------------------------
// Align & distribute (world-space bounding boxes, like Figma)
// ---------------------------------------------------------------------------

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

function mergePatches(into: PatchMap, from: PatchMap) {
  for (const [id, patch] of from) into.set(id, { ...into.get(id), ...patch })
}

/** Aligns to the selection's bounds, or to the parent's box when one node is selected. */
export function alignNodes(store: SceneStore, ids: Iterable<NodeId>, edge: AlignEdge): void {
  const snap = store.getSnapshot()
  const selection = normalizeSelection(snap, ids).filter((id) => !snap.nodes.get(id)!.locked)
  if (selection.length === 0) return
  const parentId = parentOf(snap, selection[0])
  if (selection.length === 1 && parentId === null) return
  const target = selection.length === 1 ? worldBounds(snap, parentId!) : selectionBounds(snap, selection)!
  const patches: PatchMap = new Map()
  for (const id of selection) {
    const b = worldBounds(snap, id)
    let dx = 0
    let dy = 0
    if (edge === 'left') dx = target.x - b.x
    else if (edge === 'center') dx = target.x + target.width / 2 - (b.x + b.width / 2)
    else if (edge === 'right') dx = target.x + target.width - (b.x + b.width)
    else if (edge === 'top') dy = target.y - b.y
    else if (edge === 'middle') dy = target.y + target.height / 2 - (b.y + b.height / 2)
    else dy = target.y + target.height - (b.y + b.height)
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) mergePatches(patches, patchesForTranslate(snap, [id], dx, dy))
  }
  if (patches.size) applyPatches(store, patches)
}

/** Equal gaps between three or more nodes, keeping the outermost two in place. */
export function distributeNodes(store: SceneStore, ids: Iterable<NodeId>, axis: 'horizontal' | 'vertical'): void {
  const snap = store.getSnapshot()
  const selection = normalizeSelection(snap, ids).filter((id) => !snap.nodes.get(id)!.locked)
  if (selection.length < 3) return
  const horizontal = axis === 'horizontal'
  const start = (r: { x: number; y: number }) => (horizontal ? r.x : r.y)
  const size = (r: { width: number; height: number }) => (horizontal ? r.width : r.height)
  const items = selection.map((id) => ({ id, box: worldBounds(snap, id) })).sort((a, b) => start(a.box) - start(b.box))
  const first = start(items[0].box)
  const last = items[items.length - 1].box
  const gap = (start(last) + size(last) - first - items.reduce((sum, i) => sum + size(i.box), 0)) / (items.length - 1)
  const patches: PatchMap = new Map()
  let cursor = first
  for (const { id, box } of items) {
    const delta = cursor - start(box)
    if (Math.abs(delta) > 1e-6) mergePatches(patches, patchesForTranslate(snap, [id], horizontal ? delta : 0, horizontal ? 0 : delta))
    cursor += size(box) + gap
  }
  if (patches.size) applyPatches(store, patches)
}
