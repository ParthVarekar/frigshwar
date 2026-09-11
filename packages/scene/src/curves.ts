/**
 * Easing curves: cubic béziers and physical springs, their CSS form, and their
 * value at a point in time. Springs become CSS `linear()` easings sampled from
 * the simulation, so they run in plain CSS transitions, keyframes and WAAPI
 * with no JavaScript in shipped code.
 */
import type { BezierCurve, Curve, SpringCurve, Timing } from './types'

const bezier = (x1: number, y1: number, x2: number, y2: number): BezierCurve => ({ type: 'bezier', x1, y1, x2, y2 })
const spring = (stiffness: number, damping: number, mass = 1): SpringCurve => ({ type: 'spring', stiffness, damping, mass })

export type CurvePreset =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in-back'
  | 'ease-out-back'
  | 'ease-in-out-back'
  | 'gentle'
  | 'quick'
  | 'bouncy'
  | 'slow'

/** Béziers match Tailwind's easing scale (so exported classes stay idiomatic); springs match Figma's presets. */
export const CURVE_PRESETS: Readonly<Record<CurvePreset, Curve>> = {
  linear: bezier(0, 0, 1, 1),
  ease: bezier(0.25, 0.1, 0.25, 1),
  'ease-in': bezier(0.4, 0, 1, 1),
  'ease-out': bezier(0, 0, 0.2, 1),
  'ease-in-out': bezier(0.4, 0, 0.2, 1),
  'ease-in-back': bezier(0.36, 0, 0.66, -0.56),
  'ease-out-back': bezier(0.34, 1.56, 0.64, 1),
  'ease-in-out-back': bezier(0.68, -0.6, 0.32, 1.6),
  gentle: spring(100, 15),
  quick: spring(300, 20),
  bouncy: spring(600, 15),
  slow: spring(80, 20),
}

export const BEZIER_PRESETS: readonly CurvePreset[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'ease-in-back', 'ease-out-back', 'ease-in-out-back']
export const SPRING_PRESETS: readonly CurvePreset[] = ['gentle', 'quick', 'bouncy', 'slow']

export function sameCurve(a: Curve, b: Curve): boolean {
  if (a.type === 'bezier' && b.type === 'bezier') return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2
  if (a.type === 'spring' && b.type === 'spring') return a.stiffness === b.stiffness && a.damping === b.damping && a.mass === b.mass
  return false
}

/** The preset a curve equals, or `null` for a custom curve. */
export function curvePreset(curve: Curve): CurvePreset | null {
  return (Object.keys(CURVE_PRESETS) as CurvePreset[]).find((name) => sameCurve(CURVE_PRESETS[name], curve)) ?? null
}

/** Motion v1 stored easing names; its `spring` was an overshooting bézier. */
export function legacyCurve(name: unknown): Curve | undefined {
  switch (name) {
    case 'linear':
    case 'ease':
    case 'ease-in':
    case 'ease-out':
    case 'ease-in-out':
      return CURVE_PRESETS[name]
    case 'spring':
      return CURVE_PRESETS['ease-out-back']
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Béziers
// ---------------------------------------------------------------------------

/** y for x on a CSS cubic-bézier (x1, x2 within 0–1, so x is monotonic in t). */
export function bezierValue(c: BezierCurve, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const cx = 3 * c.x1
  const bx = 3 * (c.x2 - c.x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * c.y1
  const by = 3 * (c.y2 - c.y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  let t = x
  for (let i = 0; i < 8; i++) {
    const error = sampleX(t) - x
    if (Math.abs(error) < 1e-6) return sampleY(t)
    const slope = slopeX(t)
    if (Math.abs(slope) < 1e-6) break
    t -= error / slope
  }
  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 50; i++) {
    const value = sampleX(t)
    if (Math.abs(value - x) < 1e-6) break
    if (value < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return sampleY(t)
}

// ---------------------------------------------------------------------------
// Springs: a unit mass-spring-damper released from 0 towards 1 at rest.
// ---------------------------------------------------------------------------

/** Position at `t` seconds. */
export function springValue({ stiffness: k, damping: c, mass: m }: SpringCurve, t: number): number {
  if (t <= 0) return 0
  const w0 = Math.sqrt(k / m)
  const zeta = c / (2 * Math.sqrt(k * m))
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  const s = Math.sqrt(zeta * zeta - 1)
  const r1 = -w0 * (zeta - s)
  const r2 = -w0 * (zeta + s)
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1)
}

const SETTLE = 0.001
const STEP = 1 / 120
const MAX_SECONDS = 10
const durations = new Map<string, number>()
const easings = new Map<string, string>()
const springKey = (s: SpringCurve) => `${s.stiffness}/${s.damping}/${s.mass}`

/** Settling time in ms: after it, the spring stays within 0.1% of rest. */
export function springDuration(s: SpringCurve): number {
  const key = springKey(s)
  let ms = durations.get(key)
  if (ms === undefined) {
    let last = 0
    for (let i = 0; i * STEP <= MAX_SECONDS; i++) {
      if (Math.abs(springValue(s, i * STEP) - 1) > SETTLE) last = i * STEP
    }
    ms = Math.round(Math.min(MAX_SECONDS, last + STEP) * 1000)
    if (durations.size > 256) durations.clear()
    durations.set(key, ms)
  }
  return ms
}

const fixed = (n: number, digits = 3) => String(Math.round(n * 10 ** digits) / 10 ** digits)

/** The spring as a CSS `linear()` easing over its settling time. */
export function springEasing(s: SpringCurve): string {
  const key = springKey(s)
  const cached = easings.get(key)
  if (cached) return cached
  const seconds = springDuration(s) / 1000
  const n = Math.min(64, Math.max(12, Math.round(seconds * 60)))
  const values: number[] = []
  for (let i = 0; i <= n; i++) values.push(i === n ? 1 : springValue(s, (i / n) * seconds))

  // Keep a point only where dropping it would bend the curve visibly.
  const kept: [number, number][] = [[0, 0]]
  for (let i = 1; i < n; i++) {
    const [px, pv] = kept[kept.length - 1]
    const x = i / n
    const nx = (i + 1) / n
    const interpolated = pv + ((values[i + 1] - pv) * (x - px)) / (nx - px)
    if (Math.abs(interpolated - values[i]) > 0.002) kept.push([x, values[i]])
  }
  kept.push([1, 1])
  const css = `linear(${kept
    .map(([x, v], i) => (i === 0 || i === kept.length - 1 ? fixed(v, 4) : `${fixed(v, 4)} ${fixed(x * 100, 2)}%`))
    .join(', ')})`
  if (easings.size > 256) easings.clear()
  easings.set(key, css)
  return css
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Eased progress (overshoot allowed) at linear progress `p` in 0–1. */
export function curveValue(curve: Curve, p: number): number {
  if (curve.type === 'bezier') return bezierValue(curve, p)
  if (p >= 1) return 1
  return springValue(curve, (Math.max(0, p) * springDuration(curve)) / 1000)
}

export function curveCss(curve: Curve): string {
  if (curve.type === 'spring') return springEasing(curve)
  if (sameCurve(curve, CURVE_PRESETS.linear)) return 'linear'
  if (sameCurve(curve, CURVE_PRESETS.ease)) return 'ease'
  return `cubic-bezier(${fixed(curve.x1)}, ${fixed(curve.y1)}, ${fixed(curve.x2)}, ${fixed(curve.y2)})`
}

/** A spring's own settling time; otherwise the authored duration. */
export function curveDuration(curve: Curve, duration: number): number {
  return curve.type === 'spring' ? springDuration(curve) : duration
}

export interface TimingCss {
  duration: number
  delay: number
  easing: string
}

export function timingCss(timing: Timing): TimingCss {
  return { duration: curveDuration(timing.curve, timing.duration), delay: timing.delay, easing: curveCss(timing.curve) }
}
