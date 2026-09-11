import { describe, expect, it } from 'vitest'
import {
  CURVE_PRESETS,
  DEFAULT_OVERLAY,
  interactionBindings,
  NODE_DEFAULTS,
  resolveAction,
  resolveActions,
  scrollPlayback,
  springDuration,
  springEasing,
  type Action,
  type SceneNode,
  type SpringCurve,
} from '../src'

const node = (patch: Partial<SceneNode>): SceneNode => ({ ...NODE_DEFAULTS.rect, id: 'n', name: 'n', parentId: null, index: 'a0', ...patch }) as SceneNode
const ctx = {
  screen: (id: string) => (id === 'about' ? '/about' : null),
  element: (id: string) => (id === 'faq' ? 'faq' : null),
}

describe('interaction bindings', () => {
  it('groups actions by trigger', () => {
    const go: Action = { type: 'back', transition: { type: 'dissolve', direction: 'left', timing: { duration: 200, delay: 0, curve: CURVE_PRESETS.linear } } }
    const b = interactionBindings(
      node({
        interactions: [
          { id: 'a', trigger: { type: 'click', delay: 0, key: 'Enter' }, actions: [go] },
          { id: 'b', trigger: { type: 'click', delay: 0, key: 'Enter' }, actions: [{ type: 'close-overlay' }] },
          { id: 'c', trigger: { type: 'after-delay', delay: 1200, key: 'Enter' }, actions: [go] },
          { id: 'd', trigger: { type: 'key', delay: 0, key: 'ArrowRight' }, actions: [go] },
          { id: 'e', trigger: { type: 'while-hovering', delay: 0, key: 'Enter' }, actions: [] },
        ],
      }),
    )
    expect(b.events.click).toEqual([go, { type: 'close-overlay' }])
    expect(b.afterDelay).toEqual([{ delay: 1200, actions: [go] }])
    expect(b.keys).toEqual([{ key: 'ArrowRight', actions: [go] }])
    expect(b.whileHovering).toEqual([])
  })
})

describe('action resolution', () => {
  it('resolves routes, element ids and CSS easings, dropping unset actions', () => {
    const quick = CURVE_PRESETS.quick as SpringCurve
    const actions: Action[] = [
      { type: 'navigate', target: 'about', transition: { type: 'smart-animate', direction: 'left', timing: { duration: 1, delay: 0, curve: quick } } },
      { type: 'navigate', target: '', transition: { type: 'instant', direction: 'left', timing: { duration: 1, delay: 0, curve: quick } } },
      { type: 'overlay', target: 'about', overlay: DEFAULT_OVERLAY, transition: { type: 'instant', direction: 'up', timing: { duration: 300, delay: 0, curve: CURVE_PRESETS.linear } } },
      { type: 'scroll-to', target: 'faq', offset: 24, animate: false, timing: { duration: 400, delay: 0, curve: CURVE_PRESETS['ease-out'] } },
      { type: 'open-url', url: '', newTab: true },
      { type: 'play-animation', animation: 'intro', mode: 'toggle' },
    ]
    expect(resolveActions(actions, ctx)).toEqual([
      { type: 'navigate', to: '/about', transition: { type: 'smart-animate', direction: 'left', duration: springDuration(quick), easing: springEasing(quick) } },
      { type: 'overlay', to: '/about', overlay: { ...DEFAULT_OVERLAY, transition: undefined } },
      { type: 'scroll-to', to: 'faq', scroll: { offset: 24, duration: 0, easing: 'cubic-bezier(0, 0, 0.2, 1)' } },
      { type: 'play', clip: 'intro', mode: 'toggle' },
    ])
    expect(resolveAction({ type: 'swap-overlay', target: 'missing', transition: actions[0].type === 'navigate' ? actions[0].transition : (undefined as never) }, ctx)).toBeNull()
  })
})

describe('scroll effects', () => {
  it('builds per-property tracks padded across the scroll range, holding own values', () => {
    const [effect] = scrollPlayback(
      node({
        rotation: 10,
        opacity: 0.8,
        scroll: {
          source: 'page',
          keyframes: [
            { at: 0.2, state: { y: 40, opacity: 0 } },
            { at: 0.8, state: { y: -40 } },
          ],
        },
      }),
    )
    expect(effect.source).toBe('page')
    expect(effect.tracks.map((t) => t.property)).toEqual(['translate', 'opacity'])
    expect(effect.tracks[0].keyframes).toEqual([
      { offset: 0, value: '0px 40px', easing: 'linear' },
      { offset: 0.2, value: '0px 40px', easing: 'linear' },
      { offset: 0.8, value: '0px -40px', easing: 'linear' },
      { offset: 1, value: '0px -40px', easing: 'linear' },
    ])
    expect(effect.tracks[1].keyframes.map((k) => k.value)).toEqual(['0', '0', '0.8', '0.8'])
    expect(scrollPlayback(node({ parallax: { speed: 0.5 } }))).toEqual([{ source: 'in-view', parallax: 0.5, tracks: [] }])
  })
})
