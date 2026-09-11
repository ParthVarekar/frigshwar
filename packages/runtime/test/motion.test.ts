import { describe, expect, it } from 'vitest'
import { matchName, MOTION_STYLES, overlayKeyframes, overlayStyle, reverseTransition, screenKeyframes, viewProgress, type Transition } from '../src/motion'

const t = (type: Transition['type'], direction: Transition['direction'] = 'left'): Transition => ({ type, direction, duration: 300, easing: 'ease' })
const stage = { width: 400, height: 300 }

describe('transitions', () => {
  it('reverses the transition used to arrive', () => {
    expect(reverseTransition(t('move-in', 'left'))).toMatchObject({ type: 'move-out', direction: 'right' })
    expect(reverseTransition(t('push', 'up'))).toMatchObject({ type: 'push', direction: 'down' })
    expect(reverseTransition(t('slide-out', 'right'))).toMatchObject({ type: 'slide-in', direction: 'left' })
    expect(reverseTransition(undefined)).toBeUndefined()
  })

  it('moves screens along the direction, slides a third as far', () => {
    expect(screenKeyframes(t('push', 'left'), stage)).toEqual({
      old: [{ transform: 'none' }, { transform: 'translate(-400px, 0px)' }],
      new: [{ transform: 'translate(400px, 0px)' }, { transform: 'none' }],
    })
    expect(screenKeyframes(t('slide-in', 'up'), stage).old).toEqual([{ transform: 'none' }, { transform: 'translate(0px, -100px)' }])
    expect(screenKeyframes(t('move-out', 'down'), stage)).toEqual({ old: [{ transform: 'none' }, { transform: 'translate(0px, 300px)' }], new: null })
    expect(screenKeyframes(t('dissolve'), stage)).toEqual({ old: null, new: null })
  })

  it('suppresses the default crossfade only for moving transitions', () => {
    expect(MOTION_STYLES).toContain('html[data-cf-vt="push"]::view-transition-old(cf-screen)')
    expect(MOTION_STYLES).not.toContain('html[data-cf-vt="dissolve"]')
  })
})

describe('overlays', () => {
  it('positions without transforms', () => {
    const size = { width: 200, height: 100 }
    expect(overlayStyle({ position: 'center', offset: { x: 0, y: 0 } }, size)).toMatchObject({ top: 'calc(50% - 50px)', left: 'calc(50% - 100px)' })
    expect(overlayStyle({ position: 'bottom-right', offset: { x: 0, y: 0 } }, size)).toMatchObject({ bottom: 0, right: 0 })
    expect(overlayStyle({ position: 'top-center', offset: { x: 0, y: 0 } }, size)).toMatchObject({ top: 0, left: 'calc(50% - 100px)' })
    expect(overlayStyle({ position: 'manual', offset: { x: 12, y: 34 } }, size)).toMatchObject({ left: 12, top: 34 })
  })

  it('enters from the container edge or fades', () => {
    expect(overlayKeyframes(t('move-in', 'up'), stage)).toEqual([{ translate: '0px 300px' }, { translate: '0px 0px' }])
    expect(overlayKeyframes(t('dissolve'), stage)).toEqual([{ opacity: 0 }, { opacity: 1 }])
  })
})

describe('helpers', () => {
  it('makes valid view-transition names from layer paths', () => {
    expect(matchName('Card/Title')).toBe('cf-m-card-title')
    expect(matchName('  ✦ ')).toBe('cf-m-layer')
  })

  it('measures progress through the viewport', () => {
    expect(viewProgress(800, 100, 0, 800)).toBe(0)
    expect(viewProgress(350, 100, 0, 800)).toBe(0.5)
    expect(viewProgress(-100, 100, 0, 800)).toBe(1)
  })
})
