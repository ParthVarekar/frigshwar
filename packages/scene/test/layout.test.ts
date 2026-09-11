import { describe, expect, it } from 'vitest'
import { childrenOf, createNode, nodeCss, SceneStore, subtreeStylesheet, type FrameLayout, type NodeId, type NodePatch } from '../src'

const layout = (patch: Partial<FrameLayout> = {}): FrameLayout => ({
  direction: 'horizontal',
  wrap: false,
  gap: 10,
  crossGap: 10,
  padding: { top: 8, right: 8, bottom: 8, left: 8 },
  justify: 'start',
  align: 'start',
  ...patch,
})

function scene(frame: NodePatch, kids: NodePatch[]) {
  const store = new SceneStore()
  const id = createNode(store, { type: 'frame', parentId: null, props: { x: 100, y: 50, width: 400, height: 200, ...frame } })
  const children = kids.map((props) => createNode(store, { type: 'rect', parentId: id, props }))
  const snap = store.getSnapshot()
  const box = (n: NodeId) => {
    const node = snap.nodes.get(n)!
    return [node.x, node.y, node.width, node.height]
  }
  return { store, snap, id, children, box }
}

describe('auto layout', () => {
  it('hugs content and flows children with gap and padding', () => {
    const { id, children, box } = scene({ layout: layout(), sizeX: 'hug', sizeY: 'hug' }, [
      { width: 40, height: 20, x: 999, y: 999 },
      { width: 60, height: 30 },
      { width: 20, height: 10 },
    ])
    expect(box(id)).toEqual([100, 50, 8 + 40 + 10 + 60 + 10 + 20 + 8, 8 + 30 + 8])
    expect(children.map(box)).toEqual([
      [8, 8, 40, 20],
      [58, 8, 60, 30],
      [128, 8, 20, 10],
    ])
  })

  it('shares free space between fill children, respecting max', () => {
    const { children, box } = scene({ layout: layout({ padding: { top: 0, right: 0, bottom: 0, left: 0 } }) }, [
      { width: 100, height: 20 },
      { width: 10, height: 20, sizeX: 'fill' },
      { width: 10, height: 20, sizeX: 'fill', maxWidth: 50 },
      { width: 10, height: 20, sizeY: 'fill' },
    ])
    // 400 - 100 - 10 - 3 gaps(30) = 260 free, shared by 2 fill items = 130, the second capped at 50.
    expect(children.map(box)).toEqual([
      [0, 0, 100, 20],
      [110, 0, 130, 20],
      [250, 0, 50, 20],
      [310, 0, 10, 200],
    ])
  })

  it('aligns and distributes', () => {
    const centered = scene({ layout: layout({ direction: 'vertical', justify: 'center', align: 'end' }) }, [
      { width: 50, height: 40 },
      { width: 100, height: 40 },
    ])
    // inner 384 × 184; used 40 + 10 + 40 = 90; leftover 94 → start at 47.
    expect(centered.children.map(centered.box)).toEqual([
      [8 + 384 - 50, 8 + 47, 50, 40],
      [8 + 384 - 100, 8 + 47 + 50, 100, 40],
    ])
    const spread = scene({ layout: layout({ justify: 'space-between', padding: { top: 0, right: 0, bottom: 0, left: 0 } }) }, [
      { width: 100, height: 10 },
      { width: 100, height: 10 },
      { width: 100, height: 10 },
    ])
    expect(spread.children.map((c) => spread.box(c)[0])).toEqual([0, 150, 300])
  })

  it('wraps into lines and leaves absolute children alone', () => {
    // Inner width 210 fits two 100px items and a 10px gap; the third wraps below the taller one.
    const { children, box } = scene({ width: 226, layout: layout({ wrap: true, crossGap: 4 }) }, [
      { width: 100, height: 20 },
      { width: 100, height: 30 },
      { width: 100, height: 20 },
      { width: 30, height: 30, x: 150, y: 150, absolute: true },
    ])
    expect(children.map(box)).toEqual([
      [8, 8, 100, 20],
      [118, 8, 100, 30],
      [8, 8 + 30 + 4, 100, 20],
      [150, 150, 30, 30],
    ])
  })

  it('lays out nested auto-layout frames inside out', () => {
    const store = new SceneStore()
    const outer = createNode(store, { type: 'frame', parentId: null, props: { width: 300, height: 100, layout: layout({ padding: { top: 0, right: 0, bottom: 0, left: 0 } }) } })
    createNode(store, { type: 'rect', parentId: outer, props: { width: 50, height: 50 } })
    const inner = createNode(store, { type: 'frame', parentId: outer, props: { sizeX: 'fill', sizeY: 'hug', layout: layout({ direction: 'vertical', gap: 5, padding: { top: 2, right: 2, bottom: 2, left: 2 } }) } })
    const a = createNode(store, { type: 'rect', parentId: inner, props: { width: 20, height: 20, sizeX: 'fill' } })
    createNode(store, { type: 'rect', parentId: inner, props: { width: 20, height: 30 } })
    const snap = store.getSnapshot()
    const n = (id: NodeId) => snap.nodes.get(id)!
    expect([n(inner).x, n(inner).width, n(inner).height]).toEqual([60, 240, 2 + 20 + 5 + 30 + 2])
    expect([n(a).x, n(a).y, n(a).width]).toEqual([2, 2, 236])
    expect(childrenOf(snap, inner)).toHaveLength(2)
  })

  it('keeps computed nodes identical across unrelated rebuilds', () => {
    const { store, children } = scene({ layout: layout() }, [{ width: 40, height: 20 }])
    const before = store.getSnapshot().nodes.get(children[0])
    createNode(store, { type: 'rect', parentId: null, props: { x: 900 } })
    expect(store.getSnapshot().nodes.get(children[0])).toBe(before)
  })
})

describe('auto layout → CSS', () => {
  it('writes flex containers and flow children without offsets', () => {
    const { snap, id, children } = scene({ layout: layout({ direction: 'vertical', justify: 'space-between', align: 'center', padding: { top: 8, right: 16, bottom: 8, left: 16 } }), sizeY: 'hug' }, [
      { width: 40, height: 20, sizeX: 'fill' },
      { width: 60, height: 30, minWidth: 20 },
    ])
    const frame = snap.nodes.get(id)!
    const css = nodeCss(frame, { left: 0, top: 0, width: frame.width, height: frame.height, rotation: 0 })
    expect(css).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      padding: '8px 16px 8px 16px',
      'justify-content': 'space-between',
      'align-items': 'center',
    })
    expect(css.height).toBeUndefined()
    const sheet = subtreeStylesheet(snap, id, (n) => `n-${n}`)
    expect(sheet).toContain(`.n-${children[0]}{position:relative;flex-shrink:0;box-sizing:border-box;align-self:stretch;height:20px;`)
    expect(sheet).toContain(`.n-${children[1]}{position:relative;flex-shrink:0;box-sizing:border-box;width:60px;height:30px;min-width:20px`)
  })
})
