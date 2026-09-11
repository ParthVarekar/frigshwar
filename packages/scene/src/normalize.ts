/**
 * Validation for object-valued node props. They're stored as whole JSON values
 * in the CRDT, so a client on another version (or a bad write) can't be allowed
 * to hand the renderer a malformed shape. Invalid fields fall back to defaults;
 * an invalid object becomes `null` (effect off).
 */
import {
  DEFAULT_TRANSITION,
  type AppearAnimation,
  type AppearPreset,
  type Easing,
  type LinkTransition,
  type LoopAnimation,
  type LoopPreset,
  type PrototypeLink,
  type Shadow,
  type StateStyle,
  type Transition,
} from './types'

export const EASINGS: readonly Easing[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring']
export const APPEAR_PRESETS: readonly AppearPreset[] = ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'blur']
export const LOOP_PRESETS: readonly LoopPreset[] = ['pulse', 'spin', 'bounce', 'float', 'wiggle']
export const LINK_TRANSITIONS: readonly LinkTransition[] = [
  'instant',
  'dissolve',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'push-left',
  'push-right',
]

export const DEFAULT_SHADOW: Shadow = { x: 0, y: 4, blur: 12, color: '#1A181433' }

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback

const color = (v: unknown): string | undefined =>
  typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : undefined

const MS_MAX = 20_000
const PX_MAX = 10_000

export function normalizeShadow(v: unknown): Shadow | null {
  if (!isObj(v)) return null
  return {
    x: num(v.x, DEFAULT_SHADOW.x, -PX_MAX, PX_MAX),
    y: num(v.y, DEFAULT_SHADOW.y, -PX_MAX, PX_MAX),
    blur: num(v.blur, DEFAULT_SHADOW.blur, 0, 500),
    color: color(v.color) ?? DEFAULT_SHADOW.color,
  }
}

export function normalizeTransition(v: unknown): Transition {
  if (!isObj(v)) return { ...DEFAULT_TRANSITION }
  return {
    duration: num(v.duration, DEFAULT_TRANSITION.duration, 0, MS_MAX),
    delay: num(v.delay, DEFAULT_TRANSITION.delay, 0, MS_MAX),
    easing: pick(v.easing, EASINGS, DEFAULT_TRANSITION.easing),
  }
}

export function normalizeState(v: unknown): StateStyle | null {
  if (!isObj(v)) return null
  const out: StateStyle = {}
  if (typeof v.opacity === 'number') out.opacity = num(v.opacity, 1, 0, 1)
  if (typeof v.scale === 'number') out.scale = num(v.scale, 1, 0, 10)
  if (typeof v.rotate === 'number') out.rotate = num(v.rotate, 0, -3600, 3600)
  if (typeof v.x === 'number') out.x = num(v.x, 0, -PX_MAX, PX_MAX)
  if (typeof v.y === 'number') out.y = num(v.y, 0, -PX_MAX, PX_MAX)
  const fill = color(v.fill)
  if (fill) out.fill = fill
  const shadow = normalizeShadow(v.shadow)
  if (shadow) out.shadow = shadow
  return out
}

export function normalizeAppear(v: unknown): AppearAnimation | null {
  if (!isObj(v)) return null
  return {
    preset: pick(v.preset, APPEAR_PRESETS, 'fade'),
    duration: num(v.duration, 600, 0, MS_MAX),
    delay: num(v.delay, 0, 0, MS_MAX),
    easing: pick(v.easing, EASINGS, 'ease-out'),
    distance: num(v.distance, 24, 0, PX_MAX),
  }
}

export function normalizeLoop(v: unknown): LoopAnimation | null {
  if (!isObj(v)) return null
  return {
    preset: pick(v.preset, LOOP_PRESETS, 'pulse'),
    duration: num(v.duration, 2000, 50, MS_MAX * 3),
    easing: pick(v.easing, EASINGS, 'ease-in-out'),
  }
}

export function normalizeLink(v: unknown): PrototypeLink | null {
  if (!isObj(v) || typeof v.target !== 'string' || v.target.length === 0) return null
  return {
    target: v.target,
    transition: pick(v.transition, LINK_TRANSITIONS, 'dissolve'),
    duration: num(v.duration, 300, 0, MS_MAX),
    easing: pick(v.easing, EASINGS, 'ease-out'),
  }
}

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
  link: normalizeLink,
}
