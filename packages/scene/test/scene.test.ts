import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  applyPatches,
  buildSnapshot,
  childrenOf,
  createNode,
  deleteNodes,
  duplicateNodes,
  frameNodes,
  groupNodes,
  hitTest,
  moveNodes,
  NODE_DEFAULTS,
  parentOf,
  pasteNodes,
  patchesForBox,
  reorderNodes,
  SceneStore,
  serializeNodes,
  translation,
  unwrapNodes,
  worldBounds,
  type NodeId,
  type NodePatch,
  type NodeType,
  type Rect,
  type SceneNode,
} from '../src'

function rect(store: SceneStore, x: number, y: number, w: number, h: number, parentId: NodeId | null = null) {
  return createNode(store, { type: 'rect', parentId, props: { x, y, width: w, height: h } })
}

function frame(store: SceneStore, props: NodePatch = {}, parentId: NodeId | null = null) {
  return createNode(store, { type: 'frame', parentId, props })
}

function expectRectClose(actual: Rect, expected: Rect) {
  expect(actual.x).toBeCloseTo(expected.x, 1)
  expect(actual.y).toBeCloseTo(expected.y, 1)
  expect(actual.width).toBeCloseTo(expected.width, 1)
  expect(actual.height).toBeCloseTo(expected.height, 1)
}

function raw(id: string, type: NodeType, parentId: string | null, index = 'a0'): SceneNode {
  return { ...NODE_DEFAULTS[type], id, name: id, parentId, index } as SceneNode
}

describe('snapshot repair', () => {
  it('lifts nodes whose parent is missing or not a container to the canvas', () => {
    const snap = buildSnapshot(
      new Map([
        ['r', raw('r', 'rect', null, 'a0')],
        ['orphan', raw('orphan', 'rect', 'gone', 'a1')],
        ['inside-rect', raw('inside-rect', 'rect', 'r', 'a2')],
      ]),
      new Map(),
    )
    expect(parentOf(snap, 'orphan')).toBeNull()
    expect(parentOf(snap, 'inside-rect')).toBeNull()
    expect(childrenOf(snap, null)).toEqual(['r', 'orphan', 'inside-rect'])
  })

  it('breaks parent cycles the same way regardless of insertion order', () => {
    const nodes = [raw('b', 'frame', 'a'), raw('a', 'frame', 'b'), raw('c', 'rect', 'b')]
    const forward = buildSnapshot(new Map(nodes.map((n) => [n.id, n])), new Map())
    const reverse = buildSnapshot(new Map([...nodes].reverse().map((n) => [n.id, n])), new Map())
    for (const snap of [forward, reverse]) {
      expect(parentOf(snap, 'a')).toBeNull()
      expect(parentOf(snap, 'b')).toBe('a')
      expect(parentOf(snap, 'c')).toBe('b')
    }
  })
})

describe('operations', () => {
  it('stacks new nodes on top and names them by type', () => {
    const store = new SceneStore()
    const a = rect(store, 0, 0, 10, 10)
    const b = rect(store, 0, 0, 10, 10)
    const snap = store.getSnapshot()
    expect(childrenOf(snap, null)).toEqual([a, b])
    expect(snap.nodes.get(b)!.name).toBe('Rectangle 2')
  })

  it('reparents into a rotated frame without moving on screen', () => {
    const store = new SceneStore()
    const f = frame(store, { x: 100, y: 100, width: 200, height: 200, rotation: 90 })
    const r = rect(store, 150, 50, 20, 10)
    const before = worldBounds(store.getSnapshot(), r)
    moveNodes(store, [r], f, 0)
    const snap = store.getSnapshot()
    expect(parentOf(snap, r)).toBe(f)
    expect(snap.nodes.get(r)!.rotation).toBe(-90)
    expectRectClose(worldBounds(snap, r), before)
  })

  it('refuses to move a node into its own descendant', () => {
    const store = new SceneStore()
    const outer = frame(store)
    const inner = frame(store, {}, outer)
    moveNodes(store, [outer], inner, 0)
    expect(parentOf(store.getSnapshot(), outer)).toBeNull()
  })

  it('groups and ungroups in place, preserving z-order', () => {
    const store = new SceneStore()
    const a = rect(store, 0, 0, 10, 10)
    const b = rect(store, 50, 50, 10, 10)
    const c = rect(store, 20, 20, 10, 10)
    const g = groupNodes(store, [a, b])!
    let snap = store.getSnapshot()
    expect(childrenOf(snap, null)).toEqual([g, c])
    expect(childrenOf(snap, g)).toEqual([a, b])
    expectRectClose(worldBounds(snap, g), { x: 0, y: 0, width: 60, height: 60 })

    unwrapNodes(store, [g])
    snap = store.getSnapshot()
    expect(childrenOf(snap, null)).toEqual([a, b, c])
    expectRectClose(worldBounds(snap, b), { x: 50, y: 50, width: 10, height: 10 })
  })

  it('frames a selection at its bounds and keeps children in place', () => {
    const store = new SceneStore()
    const a = rect(store, 10, 20, 10, 10)
    const b = rect(store, 40, 60, 10, 10)
    const f = frameNodes(store, [a, b])!
    const snap = store.getSnapshot()
    expect(snap.nodes.get(f)).toMatchObject({ x: 10, y: 20, width: 40, height: 50 })
    expect(snap.nodes.get(b)).toMatchObject({ x: 30, y: 40 })
    expectRectClose(worldBounds(snap, b), { x: 40, y: 60, width: 10, height: 10 })
  })

  it('deletes descendants and groups left empty', () => {
    const store = new SceneStore()
    const f = frame(store)
    const a = rect(store, 0, 0, 10, 10, f)
    const b = rect(store, 0, 0, 10, 10, f)
    const g = groupNodes(store, [a, b])!
    deleteNodes(store, [a, b])
    const snap = store.getSnapshot()
    expect(snap.nodes.has(g)).toBe(false)
    expect(snap.nodes.has(f)).toBe(true)
  })

  it('reorders forward, to front, to back and backward', () => {
    const store = new SceneStore()
    const [a, b, c, d] = [0, 1, 2, 3].map(() => rect(store, 0, 0, 10, 10))
    const order = () => childrenOf(store.getSnapshot(), null)
    reorderNodes(store, [b], 'forward')
    expect(order()).toEqual([a, c, b, d])
    reorderNodes(store, [a], 'front')
    expect(order()).toEqual([c, b, d, a])
    reorderNodes(store, [d], 'back')
    expect(order()).toEqual([d, c, b, a])
    reorderNodes(store, [b], 'backward')
    expect(order()).toEqual([d, b, c, a])
  })

  it('duplicates canvas-level frames to the right, children in place', () => {
    const store = new SceneStore()
    const f = frame(store, { x: 0, y: 0, width: 100, height: 50 })
    rect(store, 5, 5, 10, 10, f)
    const [copy] = duplicateNodes(store, [f])
    const snap = store.getSnapshot()
    expect(childrenOf(snap, null)).toEqual([f, copy])
    expect(snap.nodes.get(copy)).toMatchObject({ x: 140, y: 0 })
    expect(childrenOf(snap, copy)).toHaveLength(1)
    expect(snap.nodes.get(childrenOf(snap, copy)[0])).toMatchObject({ x: 5, y: 5 })
  })

  it('pastes into a different parent using world coordinates', () => {
    const store = new SceneStore()
    const f = frame(store, { x: 100, y: 100 })
    const r = rect(store, 10, 10, 10, 10, f)
    const payload = serializeNodes(store.getSnapshot(), [r])
    const [pasted] = pasteNodes(store, JSON.parse(JSON.stringify(payload)), null, { offset: { x: 5, y: 5 } })
    expect(store.getSnapshot().nodes.get(pasted)).toMatchObject({ x: 115, y: 115, parentId: null })
  })
})

describe('geometry', () => {
  it('hit-tests through clipped frames and ellipses', () => {
    const store = new SceneStore()
    const f = frame(store, { width: 100, height: 100, clip: true })
    const e = createNode(store, { type: 'ellipse', parentId: f, props: { x: 80, y: 80, width: 40, height: 40 } })
    expect(hitTest(store.getSnapshot(), { x: 95, y: 95 })).toEqual([f, e])
    expect(hitTest(store.getSnapshot(), { x: 81, y: 81 })).toEqual([f])
    expect(hitTest(store.getSnapshot(), { x: 110, y: 110 })).toEqual([])
    applyPatches(store, [[f, { clip: false }]])
    expect(hitTest(store.getSnapshot(), { x: 110, y: 110 })).toEqual([f, e])
  })

  it('resizes a group by scaling its children', () => {
    const store = new SceneStore()
    const a = rect(store, 0, 0, 10, 10)
    const b = rect(store, 90, 0, 10, 10)
    const g = groupNodes(store, [a, b])!
    applyPatches(store, patchesForBox(store.getSnapshot(), g, { matrix: translation(0, 0), width: 200, height: 10 }))
    const snap = store.getSnapshot()
    expect(snap.nodes.get(a)).toMatchObject({ x: 0, width: 20 })
    expect(snap.nodes.get(b)).toMatchObject({ x: 180, width: 20 })
  })
})

describe('undo', () => {
  it('treats each operation as one step and a gesture as one step', () => {
    const store = new SceneStore()
    const gesture = store.beginGesture()
    let id = ''
    gesture(() => {
      id = rect(store, 0, 0, 1, 1)
    })
    gesture(() => applyPatches(store, [[id, { width: 50 }]]))
    gesture(() => applyPatches(store, [[id, { width: 80 }]]))
    const other = rect(store, 0, 0, 1, 1)

    store.undo()
    expect(store.getSnapshot().nodes.has(other)).toBe(false)
    expect(store.getNode(id)?.width).toBe(80)
    store.undo()
    expect(store.getSnapshot().nodes.has(id)).toBe(false)
    store.redo()
    expect(store.getNode(id)?.width).toBe(80)
  })

  it('never undoes a collaborator’s edits', () => {
    const local = new SceneStore()
    const remote = new SceneStore()
    remote.doc.on('update', (update: Uint8Array) => Y.applyUpdate(local.doc, update, 'remote'))
    const mine = rect(local, 0, 0, 1, 1)
    const theirs = rect(remote, 0, 0, 1, 1)
    local.undo()
    expect(local.getSnapshot().nodes.has(mine)).toBe(false)
    expect(local.getSnapshot().nodes.has(theirs)).toBe(true)
  })
})
