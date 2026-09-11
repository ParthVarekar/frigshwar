import { describe, expect, it } from 'vitest'
import {
  addAutoLayout,
  atPosition,
  childrenOf,
  createNode,
  flowPosition,
  inferLayout,
  moveNodes,
  pinSizing,
  removeAutoLayout,
  SceneStore,
  setAbsolute,
  wrapInAutoLayout,
  type FrameLayout,
  type NodeId,
  type NodePatch,
  type PatchMap,
} from '../src'

function frameWith(kids: NodePatch[], frame: NodePatch = {}) {
  const store = new SceneStore()
  const id = createNode(store, { type: 'frame', parentId: null, props: { x: 100, y: 50, width: 400, height: 200, ...frame } })
  const children = kids.map((props) => createNode(store, { type: 'rect', parentId: id, props }))
  const box = (n: NodeId) => {
    const node = store.getSnapshot().nodes.get(n)!
    return [node.x, node.y, node.width, node.height]
  }
  return { store, id, children, box }
}

const stack = (patch: Partial<FrameLayout> = {}): FrameLayout => ({
  direction: 'horizontal',
  wrap: false,
  gap: 10,
  crossGap: 10,
  padding: { top: 8, right: 8, bottom: 8, left: 8 },
  justify: 'start',
  align: 'start',
  ...patch,
})

describe('adding auto layout', () => {
  it('infers direction, gap, padding, alignment and order from positions', () => {
    // Created out of visual order: the middle one first.
    const { store, id, children } = frameWith([
      { x: 80, y: 30, width: 40, height: 40 },
      { x: 20, y: 40, width: 40, height: 20 },
      { x: 140, y: 45, width: 40, height: 10 },
    ])
    const { layout, order } = inferLayout(store.getSnapshot(), id)
    expect(layout).toMatchObject({
      direction: 'horizontal',
      gap: 20,
      padding: { top: 30, right: 220, bottom: 130, left: 20 },
      align: 'center',
      justify: 'start',
    })
    expect(order).toEqual([children[1], children[0], children[2]])
  })

  it('reads a column as vertical', () => {
    const { store, id } = frameWith([
      { x: 10, y: 10, width: 200, height: 30 },
      { x: 10, y: 52, width: 120, height: 30 },
    ])
    expect(inferLayout(store.getSnapshot(), id).layout).toMatchObject({ direction: 'vertical', gap: 12, align: 'start' })
  })

  it('keeps children in place and reorders them to match', () => {
    const { store, id, children, box } = frameWith([
      { x: 80, y: 20, width: 40, height: 40 },
      { x: 20, y: 20, width: 40, height: 40 },
    ])
    expect(addAutoLayout(store, [id])).toEqual([id])
    expect(childrenOf(store.getSnapshot(), id)).toEqual([children[1], children[0]])
    expect(box(children[1])).toEqual([20, 20, 40, 40])
    expect(box(children[0])).toEqual([80, 20, 40, 40])
    expect(addAutoLayout(store, [id])).toEqual([])
  })

  it('wraps a selection in a hugging stack as one undo step', () => {
    const store = new SceneStore()
    const a = createNode(store, { type: 'rect', parentId: null, props: { x: 0, y: 0, width: 50, height: 50 } })
    const b = createNode(store, { type: 'rect', parentId: null, props: { x: 0, y: 70, width: 50, height: 50 } })
    const wrapper = wrapInAutoLayout(store, [a, b])!
    const snap = store.getSnapshot()
    expect(snap.nodes.get(wrapper)).toMatchObject({ layout: { direction: 'vertical', gap: 20 }, sizeX: 'hug', sizeY: 'hug', width: 50, height: 120 })
    store.undo()
    expect(store.getSnapshot().nodes.has(wrapper)).toBe(false)
    expect(store.getSnapshot().nodes.get(b)?.parentId).toBeNull()
  })
})

describe('leaving auto layout', () => {
  it('bakes computed geometry when layout is removed', () => {
    const { store, id, children, box } = frameWith(
      [{ width: 40, height: 20, sizeX: 'fill' }, { width: 60, height: 30 }],
      { layout: stack({ padding: { top: 0, right: 0, bottom: 0, left: 0 } }), sizeY: 'hug' },
    )
    const before = children.map(box)
    removeAutoLayout(store, [id])
    const snap = store.getSnapshot()
    expect(snap.nodes.get(id)).toMatchObject({ layout: null, height: 30, sizeY: 'fixed' })
    expect(children.map(box)).toEqual(before)
    expect(snap.nodes.get(children[0])?.sizeX).toBe('fixed')
  })

  it('pins an absolute child where it was drawn', () => {
    const { store, children, box } = frameWith([{ width: 40, height: 20 }, { width: 40, height: 20 }], { layout: stack() })
    setAbsolute(store, [children[1]], true)
    expect(box(children[1])).toEqual([58, 8, 40, 20])
    expect(store.getSnapshot().nodes.get(children[1])?.absolute).toBe(true)
  })

  it('keeps a fill size when a child is moved out', () => {
    const { store, children, box } = frameWith([{ width: 10, height: 20, sizeX: 'fill' }], { layout: stack() })
    moveNodes(store, [children[0]], null, 0)
    expect(box(children[0])).toEqual([108, 58, 384, 20])
    expect(store.getSnapshot().nodes.get(children[0])?.sizeX).toBe('fixed')
  })
})

describe('stack gestures', () => {
  it('finds the drop slot along the flow', () => {
    // Items at x 8–48, 58–98, 108–148 inside a frame at (100, 50).
    const { store, id, children } = frameWith([{ width: 40, height: 20 }, { width: 40, height: 20 }, { width: 40, height: 20 }], { layout: stack() })
    const snap = store.getSnapshot()
    expect(flowPosition(snap, id, { x: 100 + 20, y: 60 })).toBe(0)
    expect(flowPosition(snap, id, { x: 100 + 60, y: 60 })).toBe(1)
    expect(flowPosition(snap, id, { x: 100 + 300, y: 60 })).toBe(3)
    // Dragging the first item past the second.
    const exclude = new Set([children[0]])
    const position = flowPosition(snap, id, { x: 100 + 90, y: 60 }, exclude)
    expect(position).toBe(2)
    expect(atPosition(snap, [children[0]], id, position)).toBe(false)
    expect(atPosition(snap, [children[0]], id, 1)).toBe(true)
    moveNodes(store, [children[0]], id, position)
    expect(childrenOf(store.getSnapshot(), id)).toEqual([children[1], children[0], children[2]])
  })

  it('switches hand-sized axes to fixed', () => {
    const { store, id } = frameWith([{ width: 40, height: 20 }], { layout: stack(), sizeX: 'hug', sizeY: 'hug' })
    const snap = store.getSnapshot()
    const patches: PatchMap = new Map([[id, { width: 300, height: snap.nodes.get(id)!.height }]])
    expect(pinSizing(snap, patches).get(id)).toEqual({ width: 300, height: 36, sizeX: 'fixed' })
  })
})
