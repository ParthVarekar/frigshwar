/**
 * Validation for object-valued node props and timeline clips. They're stored as
 * whole JSON values in the CRDT, so a client on another version (or a bad write)
 * can't be allowed to hand the renderer a malformed shape. Invalid fields fall
 * back to defaults; an invalid effect becomes `null` (off). Motion v1 values
 * (easing names, appear presets, the single click `link`) are migrated on read.
 */
import { CURVE_PRESETS, legacyCurve } from './curves'
import {
  DEFAULT_TRANSITION,
  type Action,
  type ActionType,
  type AnimatableProperty,
  type AnimationClip,
  type AppearEffect,
  type AppearTrigger,
  type ClipRepeat,
  type Curve,
  type Direction,
  type FrameLayout,
  type Interaction,
  type Keyframe,
  type LayoutAlign,
  type LayoutJustify,
  type LoopEffect,
  type LoopPreset,
  type MotionState,
  type OverlayPosition,
  type OverlaySettings,
  type ParallaxEffect,
  type PlayMode,
  type ScreenTransition,
  type ScrollEffect,
  type ScrollSource,
  type Shadow,
  type SizingMode,
  type StateStyle,
  type Timing,
  type Track,
  type TransitionType,
  type Trigger,
  type TriggerType,
} from './types'

export const APPEAR_PRESETS = ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'blur'] as const
export type AppearPreset = (typeof APPEAR_PRESETS)[number]
export const APPEAR_TRIGGERS: readonly AppearTrigger[] = ['load', 'in-view']
export const LOOP_PRESETS: readonly LoopPreset[] = ['pulse', 'spin', 'bounce', 'float', 'wiggle']
export const SCROLL_SOURCES: readonly ScrollSource[] = ['page', 'in-view']
export const TRIGGER_TYPES: readonly TriggerType[] = [
  'click',
  'while-hovering',
  'while-pressing',
  'mouse-enter',
  'mouse-leave',
  'mouse-down',
  'mouse-up',
  'after-delay',
  'key',
  'in-view',
]
export const ACTION_TYPES: readonly ActionType[] = ['navigate', 'back', 'overlay', 'swap-overlay', 'close-overlay', 'scroll-to', 'open-url', 'play-animation']
export const TRANSITION_TYPES: readonly TransitionType[] = ['instant', 'dissolve', 'smart-animate', 'move-in', 'move-out', 'push', 'slide-in', 'slide-out']
export const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down']
export const OVERLAY_POSITIONS: readonly OverlayPosition[] = [
  'center',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'manual',
]
export const PLAY_MODES: readonly PlayMode[] = ['play', 'restart', 'reverse', 'toggle', 'pause']
export const CLIP_REPEATS: readonly ClipRepeat[] = ['once', 'loop', 'alternate']
export const ANIMATABLE_PROPERTIES: readonly AnimatableProperty[] = ['x', 'y', 'width', 'height', 'rotation', 'scale', 'opacity', 'fill', 'cornerRadius', 'blur']

export const DEFAULT_SHADOW: Shadow = { x: 0, y: 4, blur: 12, color: '#1A181433' }
export const DEFAULT_TRIGGER: Trigger = { type: 'click', delay: 800, key: 'Enter' }
export const DEFAULT_SCREEN_TRANSITION: ScreenTransition = {
  type: 'dissolve',
  direction: 'left',
  timing: { duration: 300, delay: 0, curve: CURVE_PRESETS['ease-out'] },
}
export const DEFAULT_OVERLAY: OverlaySettings = { position: 'center', offset: { x: 0, y: 0 }, closeOnOutside: true, background: '#00000066' }
const APPEAR_TIMING: Timing = { duration: 600, delay: 0, curve: CURVE_PRESETS['ease-out'] }
const SCROLL_TIMING: Timing = { duration: 500, delay: 0, curve: CURVE_PRESETS['ease-in-out'] }

/** The `from` state each appear preset starts at. `distance` is the slide travel in px. */
export function appearPresetState(preset: AppearPreset, distance = 24): MotionState {
  switch (preset) {
    case 'fade':
      return { opacity: 0 }
    case 'slide-up':
      return { opacity: 0, y: distance }
    case 'slide-down':
      return { opacity: 0, y: -distance }
    case 'slide-left':
      return { opacity: 0, x: distance }
    case 'slide-right':
      return { opacity: 0, x: -distance }
    case 'scale':
      return { opacity: 0, scale: 0.92 }
    case 'blur':
      return { opacity: 0, blur: 12 }
  }
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

const str = (v: unknown, fallback: string, max: number): string => (typeof v === 'string' ? v.slice(0, max) : fallback)

const color = (v: unknown): string | undefined =>
  typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : undefined

const MS_MAX = 20_000
const PX_MAX = 10_000
const ID_MAX = 64

export function normalizeShadow(v: unknown): Shadow | null {
  if (!isObj(v)) return null
  return {
    x: num(v.x, DEFAULT_SHADOW.x, -PX_MAX, PX_MAX),
    y: num(v.y, DEFAULT_SHADOW.y, -PX_MAX, PX_MAX),
    blur: num(v.blur, DEFAULT_SHADOW.blur, 0, 500),
    color: color(v.color) ?? DEFAULT_SHADOW.color,
  }
}

/** A curve object, or a v1 easing name. */
export function normalizeCurve(v: unknown, fallback: Curve): Curve {
  const legacy = legacyCurve(v)
  if (legacy) return legacy
  if (!isObj(v)) return fallback
  if (v.type === 'spring') {
    return { type: 'spring', stiffness: num(v.stiffness, 300, 1, 5000), damping: num(v.damping, 20, 1, 500), mass: num(v.mass, 1, 0.05, 50) }
  }
  if (v.type === 'bezier') {
    return { type: 'bezier', x1: num(v.x1, 0.25, 0, 1), y1: num(v.y1, 0.1, -5, 5), x2: num(v.x2, 0.25, 0, 1), y2: num(v.y2, 1, -5, 5) }
  }
  return fallback
}

/** Also reads v1 timings, which named their curve `easing`. */
export function normalizeTiming(v: unknown, fallback: Timing): Timing {
  if (!isObj(v)) return { ...fallback }
  return {
    duration: num(v.duration, fallback.duration, 0, MS_MAX),
    delay: num(v.delay, fallback.delay, 0, MS_MAX),
    curve: normalizeCurve(v.curve ?? v.easing, fallback.curve),
  }
}

export function normalizeTransition(v: unknown): Timing {
  return normalizeTiming(v, DEFAULT_TRANSITION)
}

export function normalizeMotionState(v: unknown): MotionState {
  const out: MotionState = {}
  if (!isObj(v)) return out
  if (typeof v.opacity === 'number') out.opacity = num(v.opacity, 1, 0, 1)
  if (typeof v.scale === 'number') out.scale = num(v.scale, 1, 0, 10)
  if (typeof v.rotate === 'number') out.rotate = num(v.rotate, 0, -3600, 3600)
  if (typeof v.x === 'number') out.x = num(v.x, 0, -PX_MAX, PX_MAX)
  if (typeof v.y === 'number') out.y = num(v.y, 0, -PX_MAX, PX_MAX)
  if (typeof v.blur === 'number') out.blur = num(v.blur, 0, 0, 500)
  return out
}

export function normalizeState(v: unknown): StateStyle | null {
  if (!isObj(v)) return null
  const out: StateStyle = normalizeMotionState(v)
  const fill = color(v.fill)
  if (fill) out.fill = fill
  const shadow = normalizeShadow(v.shadow)
  if (shadow) out.shadow = shadow
  return out
}

export function normalizeAppear(v: unknown): AppearEffect | null {
  if (!isObj(v)) return null
  const legacy = !isObj(v.from) && typeof v.preset === 'string'
  if (!legacy && !isObj(v.from)) return null
  return {
    from: legacy ? appearPresetState(pick(v.preset, APPEAR_PRESETS, 'fade'), num(v.distance, 24, 0, PX_MAX)) : normalizeMotionState(v.from),
    trigger: pick(v.trigger, APPEAR_TRIGGERS, 'load'),
    once: bool(v.once, true),
    amount: num(v.amount, 0.3, 0, 1),
    timing: normalizeTiming(legacy ? v : v.timing, APPEAR_TIMING),
  }
}

export function normalizeLoop(v: unknown): LoopEffect | null {
  if (!isObj(v)) return null
  return {
    preset: pick(v.preset, LOOP_PRESETS, 'pulse'),
    duration: num(v.duration, 2000, 50, MS_MAX * 3),
    curve: normalizeCurve(v.curve ?? v.easing, CURVE_PRESETS['ease-in-out']),
  }
}

export function normalizeScroll(v: unknown): ScrollEffect | null {
  if (!isObj(v) || !Array.isArray(v.keyframes)) return null
  const keyframes = v.keyframes
    .slice(0, 16)
    .filter(isObj)
    .map((k) => ({ at: num(k.at, 0, 0, 1), state: normalizeMotionState(k.state) }))
    .sort((a, b) => a.at - b.at)
  if (keyframes.length < 2) return null
  return { source: pick(v.source, SCROLL_SOURCES, 'in-view'), keyframes }
}

export function normalizeParallax(v: unknown): ParallaxEffect | null {
  return isObj(v) ? { speed: num(v.speed, 0.8, -5, 5) } : null
}

export function normalizeTrigger(v: unknown): Trigger {
  if (!isObj(v)) return { ...DEFAULT_TRIGGER }
  return {
    type: pick(v.type, TRIGGER_TYPES, 'click'),
    delay: num(v.delay, DEFAULT_TRIGGER.delay, 0, MS_MAX * 3),
    key: str(v.key, DEFAULT_TRIGGER.key, 32) || DEFAULT_TRIGGER.key,
  }
}

export function normalizeScreenTransition(v: unknown): ScreenTransition {
  if (!isObj(v)) return { ...DEFAULT_SCREEN_TRANSITION }
  return {
    type: pick(v.type, TRANSITION_TYPES, 'dissolve'),
    direction: pick(v.direction, DIRECTIONS, 'left'),
    timing: normalizeTiming(v.timing, DEFAULT_SCREEN_TRANSITION.timing),
  }
}

export function normalizeOverlay(v: unknown): OverlaySettings {
  if (!isObj(v)) return { ...DEFAULT_OVERLAY }
  const offset = isObj(v.offset) ? v.offset : {}
  return {
    position: pick(v.position, OVERLAY_POSITIONS, 'center'),
    offset: { x: num(offset.x, 0, -PX_MAX, PX_MAX), y: num(offset.y, 0, -PX_MAX, PX_MAX) },
    closeOnOutside: bool(v.closeOnOutside, true),
    background: v.background === null ? null : (color(v.background) ?? DEFAULT_OVERLAY.background),
  }
}

/**
 * Web, mail and phone links or site-relative paths only: a shared document must
 * not be able to put a `javascript:` URL into Preview or exported code. A bare
 * domain gets `https://`.
 */
export function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return ''
  const url = v.trim().slice(0, 2048)
  if (url === '') return ''
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

const targetOf = (v: Obj): string => (typeof v.target === 'string' ? v.target.slice(0, ID_MAX) : '')

export function normalizeAction(v: unknown): Action | null {
  if (!isObj(v)) return null
  switch (v.type) {
    case 'navigate':
      return { type: 'navigate', target: targetOf(v), transition: normalizeScreenTransition(v.transition) }
    case 'back':
      return { type: 'back', transition: normalizeScreenTransition(v.transition) }
    case 'overlay':
      return { type: 'overlay', target: targetOf(v), overlay: normalizeOverlay(v.overlay), transition: normalizeScreenTransition(v.transition) }
    case 'swap-overlay':
      return { type: 'swap-overlay', target: targetOf(v), transition: normalizeScreenTransition(v.transition) }
    case 'close-overlay':
      return { type: 'close-overlay' }
    case 'scroll-to':
      return {
        type: 'scroll-to',
        target: targetOf(v),
        offset: num(v.offset, 0, -PX_MAX, PX_MAX),
        animate: bool(v.animate, true),
        timing: normalizeTiming(v.timing, SCROLL_TIMING),
      }
    case 'open-url':
      return { type: 'open-url', url: safeUrl(v.url), newTab: bool(v.newTab, true) }
    case 'play-animation':
      return { type: 'play-animation', animation: str(v.animation, '', ID_MAX), mode: pick(v.mode, PLAY_MODES, 'play') }
    default:
      return null
  }
}

export function normalizeInteractions(v: unknown): Interaction[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: Interaction[] = []
  v.slice(0, 32).forEach((item, i) => {
    if (!isObj(item)) return
    let id = typeof item.id === 'string' && item.id ? item.id.slice(0, ID_MAX) : `ix${i}`
    while (seen.has(id)) id = `${id}-${i}`
    seen.add(id)
    const actions = Array.isArray(item.actions)
      ? item.actions
          .slice(0, 16)
          .map(normalizeAction)
          .filter((a): a is Action => a !== null)
      : []
    out.push({ id, trigger: normalizeTrigger(item.trigger), actions })
  })
  return out
}

const LEGACY_TRANSITIONS: Record<string, [TransitionType, Direction]> = {
  instant: ['instant', 'left'],
  dissolve: ['dissolve', 'left'],
  'slide-left': ['move-in', 'left'],
  'slide-right': ['move-in', 'right'],
  'slide-up': ['move-in', 'up'],
  'slide-down': ['move-in', 'down'],
  'push-left': ['push', 'left'],
  'push-right': ['push', 'right'],
}

/** Motion v1 stored a single click `link` per layer; it becomes one click interaction. */
export function migrateLink(v: unknown): Interaction[] {
  if (!isObj(v) || typeof v.target !== 'string' || v.target.length === 0) return []
  const [type, direction] =
    typeof v.transition === 'string' && Object.hasOwn(LEGACY_TRANSITIONS, v.transition) ? LEGACY_TRANSITIONS[v.transition] : LEGACY_TRANSITIONS.dissolve
  const transition: ScreenTransition = {
    type,
    direction,
    timing: normalizeTiming({ duration: v.duration, easing: v.easing }, DEFAULT_SCREEN_TRANSITION.timing),
  }
  const action: Action = v.target === 'back' ? { type: 'back', transition } : { type: 'navigate', target: v.target.slice(0, ID_MAX), transition }
  return [{ id: 'link', trigger: { ...DEFAULT_TRIGGER }, actions: [action] }]
}

const RANGES: Record<Exclude<AnimatableProperty, 'fill'>, [number, number]> = {
  x: [-PX_MAX * 10, PX_MAX * 10],
  y: [-PX_MAX * 10, PX_MAX * 10],
  width: [0, PX_MAX * 10],
  height: [0, PX_MAX * 10],
  rotation: [-3600, 3600],
  scale: [0, 10],
  opacity: [0, 1],
  cornerRadius: [0, PX_MAX],
  blur: [0, 500],
}

export function normalizeClip(v: unknown): AnimationClip | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || typeof v.frameId !== 'string' || !v.frameId) return null
  const duration = num(v.duration, 1000, 1, 600_000)
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const t of Array.isArray(v.tracks) ? v.tracks.slice(0, 1000) : []) {
    if (!isObj(t) || typeof t.nodeId !== 'string' || !t.nodeId) continue
    if (!ANIMATABLE_PROPERTIES.includes(t.property as AnimatableProperty)) continue
    const property = t.property as AnimatableProperty
    const key = `${t.nodeId}:${property}`
    if (seen.has(key)) continue
    seen.add(key)
    const keyframes: Keyframe[] = []
    for (const k of Array.isArray(t.keyframes) ? t.keyframes.slice(0, 500) : []) {
      if (!isObj(k)) continue
      let value: number | string | undefined
      if (property === 'fill') value = color(k.value)
      else if (typeof k.value === 'number' && Number.isFinite(k.value)) value = Math.min(RANGES[property][1], Math.max(RANGES[property][0], k.value))
      if (value === undefined) continue
      keyframes.push({ time: num(k.time, 0, 0, duration), value, curve: normalizeCurve(k.curve, CURVE_PRESETS['ease-in-out']) })
    }
    keyframes.sort((a, b) => a.time - b.time)
    tracks.push({ nodeId: t.nodeId.slice(0, ID_MAX), property, keyframes })
  }
  return {
    id: v.id.slice(0, ID_MAX),
    name: str(v.name, 'Animation', 120) || 'Animation',
    frameId: v.frameId.slice(0, ID_MAX),
    duration,
    repeat: pick(v.repeat, CLIP_REPEATS, 'once'),
    autoplay: bool(v.autoplay, true),
    tracks,
  }
}

export const SIZING_MODES: readonly SizingMode[] = ['fixed', 'hug', 'fill']
export const LAYOUT_ALIGNS: readonly LayoutAlign[] = ['start', 'center', 'end']
export const LAYOUT_JUSTIFIES: readonly LayoutJustify[] = ['start', 'center', 'end', 'space-between']
export const DEFAULT_LAYOUT: FrameLayout = {
  direction: 'vertical',
  wrap: false,
  gap: 16,
  crossGap: 16,
  padding: { top: 16, right: 16, bottom: 16, left: 16 },
  justify: 'start',
  align: 'start',
}

export function normalizeLayout(v: unknown): FrameLayout | null {
  if (!isObj(v)) return null
  const padding = isObj(v.padding) ? v.padding : {}
  return {
    direction: v.direction === 'horizontal' ? 'horizontal' : 'vertical',
    wrap: bool(v.wrap, false),
    gap: num(v.gap, DEFAULT_LAYOUT.gap, 0, PX_MAX),
    crossGap: num(v.crossGap, DEFAULT_LAYOUT.crossGap, 0, PX_MAX),
    padding: {
      top: num(padding.top, 0, 0, PX_MAX),
      right: num(padding.right, 0, 0, PX_MAX),
      bottom: num(padding.bottom, 0, 0, PX_MAX),
      left: num(padding.left, 0, 0, PX_MAX),
    },
    justify: pick(v.justify, LAYOUT_JUSTIFIES, 'start'),
    align: pick(v.align, LAYOUT_ALIGNS, 'start'),
  }
}

const normalizeSizing = (v: unknown): SizingMode => pick(v, SIZING_MODES, 'fixed')
const normalizeLimit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(PX_MAX * 10, Math.max(0, v)) : null)

/** Component props are flat primitives; anything else is dropped. */
export function normalizeComponentProps(v: unknown): Record<string, string | number | boolean> {
  if (!isObj(v)) return {}
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value.slice(0, 5000)
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

/** Object-valued props and their validators. */
export const COMPOSITE_PROPS: Readonly<Record<string, (value: unknown) => unknown>> = {
  props: normalizeComponentProps,
  shadow: normalizeShadow,
  hover: normalizeState,
  press: normalizeState,
  transition: normalizeTransition,
  appear: normalizeAppear,
  loop: normalizeLoop,
  scroll: normalizeScroll,
  parallax: normalizeParallax,
  interactions: normalizeInteractions,
  layout: normalizeLayout,
  sizeX: normalizeSizing,
  sizeY: normalizeSizing,
  minWidth: normalizeLimit,
  maxWidth: normalizeLimit,
  minHeight: normalizeLimit,
  maxHeight: normalizeLimit,
}
