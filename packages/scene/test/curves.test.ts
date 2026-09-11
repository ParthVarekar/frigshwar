import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  applyClipFrame,
  bezierValue,
  clipPlayback,
  clipTime,
  createNode,
  CURVE_PRESETS,
  curveCss,
  curvePreset,
  evaluateClip,
  normalizeClip,
  SceneStore,
  springDuration,
  springEasing,
  springValue,
  timingCss,
  trackValueAt,
  type AnimationClip,
  type BezierCurve,
  type SpringCurve,
} from '../src'

const linear = CURVE_PRESETS.linear

describe('curves', () => {
  it('evaluates béziers like CSS', () => {
    const easeOut = CURVE_PRESETS['ease-out'] as BezierCurve
    expect(bezierValue(easeOut, 0)).toBe(0)
    expect(bezierValue(easeOut, 1)).toBe(1)
    expect(bezierValue(linear as BezierCurve, 0.37)).toBeCloseTo(0.37, 5)
    expect(bezierValue(easeOut, 0.5)).toBeGreaterThan(0.7)
  })

  it('writes CSS easings, keeping Tailwind-scale values and keywords', () => {
    expect(curveCss(CURVE_PRESETS['ease-out'])).toBe('cubic-bezier(0, 0, 0.2, 1)')
    expect(curveCss(linear)).toBe('linear')
    expect(curveCss(CURVE_PRESETS['ease-out-back'])).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)')
    expect(curvePreset({ type: 'spring', stiffness: 600, damping: 15, mass: 1 })).toBe('bouncy')
    expect(curvePreset({ type: 'bezier', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 })).toBeNull()
  })

  it('settles springs and derives their duration', () => {
    const gentle = CURVE_PRESETS.gentle as SpringCurve
    const bouncy = CURVE_PRESETS.bouncy as SpringCurve
    const ms = springDuration(gentle)
    expect(ms).toBeGreaterThan(500)
    expect(ms).toBeLessThan(2000)
    expect(Math.abs(springValue(gentle, ms / 1000) - 1)).toBeLessThan(0.002)
    // Under-damped springs overshoot.
    let peak = 0
    for (let t = 0; t < 1; t += 0.005) peak = Math.max(peak, springValue(bouncy, t))
    expect(peak).toBeGreaterThan(1.05)
    // Over-damped springs never do.
    const heavy: SpringCurve = { type: 'spring', stiffness: 100, damping: 60, mass: 1 }
    for (let t = 0; t < 3; t += 0.01) expect(springValue(heavy, t)).toBeLessThanOrEqual(1)
  })

  it('samples springs into a CSS linear() easing with its settling time', () => {
    const quick = CURVE_PRESETS.quick as SpringCurve
    const css = springEasing(quick)
    expect(css.startsWith('linear(0, ')).toBe(true)
    expect(css.endsWith(', 1)')).toBe(true)
    expect(timingCss({ duration: 999, delay: 50, curve: quick })).toEqual({ duration: springDuration(quick), delay: 50, easing: css })
  })
})

describe('timeline clips', () => {
  function scene() {
    const store = new SceneStore()
    const frame = createNode(store, { type: 'frame', parentId: null, props: { width: 400, height: 300 } })
    const box = createNode(store, { type: 'rect', parentId: frame, props: { x: 0, y: 0, width: 100, height: 50, fill: '#000000' } })
    const clip: AnimationClip = {
      id: 'c1',
      name: 'Intro',
      frameId: frame,
      duration: 1000,
      repeat: 'once',
      autoplay: true,
      tracks: [
        { nodeId: box, property: 'x', keyframes: [{ time: 200, value: 0, curve: linear }, { time: 600, value: 100, curve: linear }] },
        { nodeId: box, property: 'fill', keyframes: [{ time: 0, value: '#000000', curve: linear }, { time: 1000, value: '#FFFFFF', curve: linear }] },
        { nodeId: box, property: 'rotation', keyframes: [{ time: 0, value: 90, curve: linear }] },
      ],
    }
    return { store, frame, box, clip }
  }

  it('interpolates values between keys and holds outside them', () => {
    const { clip } = scene()
    const x = clip.tracks[0]
    expect(trackValueAt(x, 0)).toBe(0)
    expect(trackValueAt(x, 400)).toBe(50)
    expect(trackValueAt(x, 900)).toBe(100)
    expect(trackValueAt(clip.tracks[1], 500)).toBe('#808080')
  })

  it('maps elapsed time through repeat modes', () => {
    expect(clipTime({ duration: 1000, repeat: 'once' }, 2500)).toBe(1000)
    expect(clipTime({ duration: 1000, repeat: 'loop' }, 2500)).toBe(500)
    expect(clipTime({ duration: 1000, repeat: 'alternate' }, 1250)).toBe(750)
  })

  it('rotates about the center when evaluating for the canvas', () => {
    const { store, box, clip } = scene()
    const frame = evaluateClip(store.getSnapshot(), clip, 0)
    const patch = frame.patches.get(box)!
    expect(patch.rotation).toBe(90)
    expect(patch.x).toBeCloseTo(75, 6)
    expect(patch.y).toBeCloseTo(-25, 6)
    expect(applyClipFrame(store.getSnapshot(), frame).nodes.get(box)!.rotation).toBe(90)
  })

  it('builds per-track WAAPI keyframes padded across the clip', () => {
    const { store, box, clip } = scene()
    const playback = clipPlayback(store.getSnapshot(), clip)
    const x = playback.tracks.find((t) => t.property === 'translate')!
    expect(x).toEqual({
      nodeId: box,
      property: 'translate',
      composite: 'add',
      keyframes: [
        { offset: 0, value: '0px 0px', easing: 'linear' },
        { offset: 0.2, value: '0px 0px', easing: 'linear' },
        { offset: 0.6, value: '100px 0px', easing: 'linear' },
        { offset: 1, value: '100px 0px', easing: 'linear' },
      ],
    })
    expect(playback.tracks.find((t) => t.property === 'backgroundColor')!.keyframes).toHaveLength(2)
  })

  it('stores clips doc-level, normalized, with undo', () => {
    const { store, frame, box } = scene()
    store.transact(() =>
      store.animations.set('c2', {
        id: 'c2',
        frameId: frame,
        duration: -4,
        repeat: 'sometimes',
        tracks: [
          { nodeId: box, property: 'opacity', keyframes: [{ time: 10, value: 3 }, { time: 0, value: 'nope' }] },
          { nodeId: box, property: 'colour', keyframes: [] },
        ],
      }),
    )
    const clip = store.getSnapshot().animations.get('c2')!
    expect(clip).toMatchObject({ name: 'Animation', duration: 1, repeat: 'once', autoplay: true })
    expect(clip.tracks).toEqual([{ nodeId: box, property: 'opacity', keyframes: [{ time: 1, value: 1, curve: CURVE_PRESETS['ease-in-out'] }] }])
    store.undo()
    expect(store.getSnapshot().animations.has('c2')).toBe(false)
    expect(normalizeClip({ id: 'x' })).toBeNull()
  })

  it('keeps unrelated snapshots sharing one animations map', () => {
    const store = new SceneStore(new Y.Doc())
    const before = store.getSnapshot().animations
    createNode(store, { type: 'rect', parentId: null, props: {} })
    expect(store.getSnapshot().animations).toBe(before)
  })
})
