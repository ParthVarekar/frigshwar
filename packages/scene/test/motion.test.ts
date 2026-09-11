import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  alignNodes,
  childrenOf,
  createNode,
  CURVE_PRESETS,
  distributeNodes,
  domLayout,
  getNodesMap,
  groupNodes,
  motionCss,
  NODE_DEFAULTS,
  nodeCss,
  normalizeInteractions,
  pasteNodes,
  patchNode,
  readNode,
  SceneStore,
  serializeNodes,
  snapRect,
  snapTargets,
  subtreeStylesheet,
  type Interaction,
  type NodeId,
  type NodePatch,
  type SceneNode,
} from '../src'

function add(store: SceneStore, props: NodePatch, parentId: NodeId | null = null, type: 'rect' | 'frame' = 'rect') {
  return createNode(store, { type, parentId, props })
}

describe('normalization of stored effects and motion', () => {
  it('replaces malformed values instead of passing them to the renderer', () => {
    const doc = new Y.Doc()
    const nodes = getNodesMap(doc)
    const y = new Y.Map<unknown>()
    y.set('id', 'a')
    y.set('type', 'rect')
    y.set('hover', { scale: 'big', opacity: 2, fill: 'red' })
    y.set('constructor', 1)
    y.set('appear', 'yes')
    y.set('transition', { duration: -5, easing: 'bogus' })
    y.set('link', { target: 42 })
    y.set('shadow', { x: 2, color: 'nope' })
    nodes.set('a', y)

    const node = readNode(nodes.get('a')!)!
    expect(node.hover).toEqual({ opacity: 1 })
    expect(node.appear).toBeNull()
    expect(node.transition).toEqual({ duration: 0, delay: 0, curve: CURVE_PRESETS['ease-out'] })
    expect(node.interactions).toEqual([])
    expect(Object.hasOwn(node, 'link')).toBe(false)
    expect(node.shadow).toEqual({ x: 2, y: 4, blur: 12, color: '#1A181433' })
    expect(Object.hasOwn(node, 'constructor')).toBe(false)
  })

  it('migrates motion v1 values: easing names, appear presets and the click link', () => {
    const doc = new Y.Doc()
    const nodes = getNodesMap(doc)
    const y = new Y.Map<unknown>()
    y.set('id', 'b')
    y.set('type', 'rect')
    y.set('transition', { duration: 180, delay: 0, easing: 'spring' })
    y.set('appear', { preset: 'slide-up', duration: 700, delay: 120, easing: 'ease-out', distance: 28 })
    y.set('loop', { preset: 'float', duration: 4000, easing: 'ease-in-out' })
    y.set('link', { target: 'card', transition: 'push-left', duration: 520, easing: 'ease-in-out' })
    nodes.set('b', y)

    const node = readNode(nodes.get('b')!)!
    expect(node.transition.curve).toEqual(CURVE_PRESETS['ease-out-back'])
    expect(node.appear).toEqual({
      from: { opacity: 0, y: 28 },
      trigger: 'load',
      once: true,
      amount: 0.3,
      timing: { duration: 700, delay: 120, curve: CURVE_PRESETS['ease-out'] },
    })
    expect(node.loop).toEqual({ preset: 'float', duration: 4000, curve: CURVE_PRESETS['ease-in-out'] })
    expect(node.interactions).toEqual([
      {
        id: 'link',
        trigger: { type: 'click', delay: 800, key: 'Enter' },
        actions: [
          { type: 'navigate', target: 'card', transition: { type: 'push', direction: 'left', timing: { duration: 520, delay: 0, curve: CURVE_PRESETS['ease-in-out'] } } },
        ],
      },
    ])

    // Writing interactions retires the v1 link.
    doc.transact(() => patchNode(y, { interactions: [] }))
    expect(y.has('link')).toBe(false)
    expect(readNode(y)!.interactions).toEqual([])
  })

  it('validates interactions and keeps half-configured actions', () => {
    const [ix] = normalizeInteractions([
      {
        trigger: { type: 'after-delay', delay: 1500 },
        actions: [
          { type: 'navigate' },
          { type: 'open-url', url: 'javascript:alert(1)' },
          { type: 'open-url', url: 'example.com/docs' },
          { type: 'teleport' },
          { type: 'overlay', target: 'menu', overlay: { position: 'top-right', background: null } },
        ],
      },
    ])
    expect(ix.id).toBe('ix0')
    expect(ix.trigger).toEqual({ type: 'after-delay', delay: 1500, key: 'Enter' })
    expect(ix.actions.map((a) => a.type)).toEqual(['navigate', 'open-url', 'open-url', 'overlay'])
    expect(ix.actions[0]).toMatchObject({ target: '' })
    expect(ix.actions[1]).toMatchObject({ url: '' })
    expect(ix.actions[2]).toMatchObject({ url: 'https://example.com/docs', newTab: true })
    expect(ix.actions[3]).toMatchObject({ overlay: { position: 'top-right', closeOnOutside: true, background: null } })
  })
})

describe('align and distribute', () => {
  it('aligns a selection to its shared bounds', () => {
    const store = new SceneStore()
    const a = add(store, { x: 0, y: 0, width: 10, height: 10 })
    const b = add(store, { x: 50, y: 20, width: 20, height: 20 })
    const c = add(store, { x: 10, y: 80, width: 10, height: 10 })
    alignNodes(store, [a, b, c], 'left')
    alignNodes(store, [a, b, c], 'bottom')
    const n = (id: NodeId) => store.getNode(id)!
    expect([n(a).x, n(b).x, n(c).x]).toEqual([0, 0, 0])
    expect([n(a).y, n(b).y, n(c).y]).toEqual([80, 70, 80])
  })

  it('centers a single node inside its parent frame', () => {
    const store = new SceneStore()
    const frame = add(store, { x: 100, y: 100, width: 200, height: 100 }, null, 'frame')
    const r = add(store, { x: 10, y: 10, width: 20, height: 20 }, frame)
    alignNodes(store, [r], 'center')
    expect(store.getNode(r)!.x).toBe(90)
  })

  it('spreads three nodes into equal gaps', () => {
    const store = new SceneStore()
    const a = add(store, { x: 0, y: 0, width: 10, height: 10 })
    const b = add(store, { x: 15, y: 0, width: 10, height: 10 })
    const c = add(store, { x: 90, y: 0, width: 10, height: 10 })
    distributeNodes(store, [c, a, b], 'horizontal')
    expect(store.getNode(b)!.x).toBe(45)
  })
})

describe('smart guides', () => {
  it('snaps an edge to a sibling within the threshold and reports the guide', () => {
    const store = new SceneStore()
    add(store, { x: 100, y: 0, width: 50, height: 50 })
    const moving = add(store, { x: 47, y: 70, width: 50, height: 20 })
    const targets = snapTargets(store.getSnapshot(), [null], new Set([moving]))
    const result = snapRect({ x: 47, y: 70, width: 50, height: 20 }, targets, 5)
    expect(result.dx).toBe(3)
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([{ axis: 'x', value: 100, start: 0, end: 90 }])
  })
})

describe('scene → CSS', () => {
  it('converts a top-left rotation pivot into a centered CSS rotation', () => {
    const store = new SceneStore()
    const r = add(store, { x: 10, y: 20, width: 100, height: 50, rotation: 90 })
    expect(domLayout(store.getSnapshot(), r)).toEqual({ left: -65, top: 45, width: 100, height: 50, rotation: 90 })
  })

  it('draws strokes as inset shadows after the drop shadow', () => {
    const node = {
      ...NODE_DEFAULTS.rect,
      id: 'r',
      name: 'r',
      parentId: null,
      index: 'a0',
      stroke: '#000000',
      strokeWidth: 2,
      shadow: { x: 0, y: 4, blur: 12, color: '#1A181433' },
    } as SceneNode
    const css = nodeCss(node, { left: 0, top: 0, width: 10, height: 10, rotation: 0 })
    expect(css['box-shadow']).toBe('0px 4px 12px #1A181433, inset 0 0 0 2px #000000')
  })

  it('offsets children of a group wrapper by the wrapper corner', () => {
    const store = new SceneStore()
    const frame = add(store, { width: 400, height: 300 }, null, 'frame')
    const r1 = add(store, { x: 30, y: 40, width: 10, height: 10 }, frame)
    const r2 = add(store, { x: 60, y: 40, width: 10, height: 10 }, frame)
    const g = groupNodes(store, [r1, r2])!
    const sheet = subtreeStylesheet(store.getSnapshot(), frame, (id) => `n-${id}`)
    expect(sheet).toContain(`.n-${g}{position:absolute;left:30px;top:40px;box-sizing:border-box;width:40px;height:10px`)
    expect(sheet).toContain(`.n-${r2}{position:absolute;left:30px;top:0px;`)
  })

  it('chains a loop after the appear animation', () => {
    const node = {
      ...NODE_DEFAULTS.rect,
      appear: { from: { opacity: 0, y: 24 }, trigger: 'load', once: true, amount: 0.3, timing: { duration: 600, delay: 100, curve: CURVE_PRESETS['ease-out'] } },
      loop: { preset: 'float', duration: 3000, curve: CURVE_PRESETS['ease-in-out'] },
    } as SceneNode
    expect(motionCss(node)).toEqual({
      '--cf-from-opacity': '0',
      '--cf-from-y': '24px',
      animation: 'cf-appear 600ms cubic-bezier(0, 0, 0.2, 1) 100ms backwards, cf-loop-float 3000ms cubic-bezier(0.4, 0, 0.2, 1) 700ms infinite',
    })
  })

  it('writes springs as linear() easings with their own duration', () => {
    const quick = CURVE_PRESETS.quick
    const node = { ...NODE_DEFAULTS.rect, hover: { scale: 1.05 }, transition: { duration: 200, delay: 0, curve: quick } } as SceneNode
    const css = motionCss(node)
    expect(css['transition-timing-function']).toMatch(/^linear\(0, /)
    expect(css['transition-duration']).not.toBe('200ms')
  })
})

describe('prototype interactions', () => {
  it('re-points action targets between frames that are pasted together', () => {
    const store = new SceneStore()
    const home = add(store, { width: 100, height: 100 }, null, 'frame')
    const about = add(store, { x: 200, width: 100, height: 100 }, null, 'frame')
    const navigate: Interaction = {
      id: 'go',
      trigger: { type: 'click', delay: 0, key: 'Enter' },
      actions: [{ type: 'navigate', target: about, transition: { type: 'push', direction: 'left', timing: { duration: 300, delay: 0, curve: CURVE_PRESETS.gentle } } }],
    }
    add(store, { interactions: [navigate] }, home)
    const [homeCopy, aboutCopy] = pasteNodes(store, serializeNodes(store.getSnapshot(), [home, about]), null)
    const snap = store.getSnapshot()
    const button = snap.nodes.get(childrenOf(snap, homeCopy)[0])!
    expect(button.interactions[0].actions[0]).toMatchObject({ type: 'navigate', target: aboutCopy })
  })
})
