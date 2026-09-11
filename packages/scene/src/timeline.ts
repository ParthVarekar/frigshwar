/**
 * Keyframe animation clips: the value of a track at a time, the scene as it
 * looks at the playhead (for the canvas), and WAAPI playback data for the motion
 * runtime (Preview and exported code). One WAAPI animation per track keeps each
 * segment's easing exact; x and y compose on `translate` with `composite: add`.
 */
import { curveCss, curveValue } from './curves'
import { round2 } from './matrix'
import { buildSnapshot, type SceneSnapshot } from './tree'
import type { AnimatableProperty, AnimationClip, ClipRepeat, Color, MotionState, NodeId, NodePatch, SceneNode, ScrollSource, Track } from './types'

type Rgba = [number, number, number, number]

function parseColor(hex: string): Rgba {
  const h = hex.replace('#', '')
  const channel = (i: number) => Number.parseInt(h.slice(i, i + 2), 16)
  return [channel(0), channel(2), channel(4), h.length >= 8 ? channel(6) : 255]
}

function formatColor([r, g, b, a]: Rgba): Color {
  const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase()
  return `#${hex(r)}${hex(g)}${hex(b)}${Math.round(a) >= 255 ? '' : hex(a)}`
}

function mix(a: number | Color, b: number | Color, t: number): number | Color {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t
  if (typeof a === 'string' && typeof b === 'string') {
    const ca = parseColor(a)
    const cb = parseColor(b)
    return formatColor(ca.map((v, i) => v + (cb[i] - v) * t) as Rgba)
  }
  return t < 0.5 ? a : b
}

/** Holds the first value before the first key and the last value after the last. */
export function trackValueAt(track: Track, time: number): number | Color | undefined {
  const keys = track.keyframes
  if (keys.length === 0) return undefined
  if (time <= keys[0].time) return keys[0].value
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (time < b.time) {
      const span = b.time - a.time
      return mix(a.value, b.value, curveValue(a.curve, span > 0 ? (time - a.time) / span : 1))
    }
  }
  return keys[keys.length - 1].value
}

/** Playhead position after `elapsed` ms of playback. */
export function clipTime(clip: { duration: number; repeat: ClipRepeat }, elapsed: number): number {
  const d = clip.duration
  if (d <= 0 || elapsed <= 0) return 0
  if (clip.repeat === 'once') return Math.min(elapsed, d)
  const cycle = Math.floor(elapsed / d)
  const t = elapsed - cycle * d
  return clip.repeat === 'alternate' && cycle % 2 === 1 ? d - t : t
}

export interface ClipFrame {
  patches: Map<NodeId, NodePatch>
  /** Animated values with no node prop behind them. */
  extras: Map<NodeId, { scale?: number; blur?: number }>
}

/**
 * Every animated layer's values at `time`. Rotation pivots on the layer's
 * center, as it does in CSS, so x/y are adjusted to keep the center in place.
 */
export function evaluateClip(snap: SceneSnapshot, clip: AnimationClip, time: number): ClipFrame {
  const values = new Map<NodeId, Partial<Record<AnimatableProperty, number | Color>>>()
  for (const track of clip.tracks) {
    if (!snap.nodes.has(track.nodeId)) continue
    const value = trackValueAt(track, time)
    if (value === undefined) continue
    values.set(track.nodeId, { ...values.get(track.nodeId), [track.property]: value })
  }

  const patches = new Map<NodeId, NodePatch>()
  const extras = new Map<NodeId, { scale?: number; blur?: number }>()
  for (const [id, v] of values) {
    const node = snap.nodes.get(id)!
    const n = (key: AnimatableProperty) => (typeof v[key] === 'number' ? (v[key] as number) : undefined)
    const patch: NodePatch = {}
    if (n('opacity') !== undefined) patch.opacity = Math.min(1, Math.max(0, n('opacity')!))
    if (node.type !== 'group') {
      const x = n('x') ?? node.x
      const y = n('y') ?? node.y
      const w = Math.max(0, n('width') ?? node.width)
      const h = Math.max(0, n('height') ?? node.height)
      if (n('x') !== undefined) patch.x = x
      if (n('y') !== undefined) patch.y = y
      if (n('width') !== undefined) patch.width = w
      if (n('height') !== undefined) patch.height = h
      const rotation = n('rotation')
      if (rotation !== undefined) {
        const r0 = (node.rotation * Math.PI) / 180
        const cx = x + (w / 2) * Math.cos(r0) - (h / 2) * Math.sin(r0)
        const cy = y + (w / 2) * Math.sin(r0) + (h / 2) * Math.cos(r0)
        const r = (rotation * Math.PI) / 180
        patch.rotation = rotation
        patch.x = cx - ((w / 2) * Math.cos(r) - (h / 2) * Math.sin(r))
        patch.y = cy - ((w / 2) * Math.sin(r) + (h / 2) * Math.cos(r))
      }
      if (typeof v.fill === 'string' && 'fill' in node) patch.fill = v.fill
      if (n('cornerRadius') !== undefined && 'cornerRadius' in node) patch.cornerRadius = Math.max(0, n('cornerRadius')!)
    }
    patches.set(id, patch)
    const extra: { scale?: number; blur?: number } = {}
    if (n('scale') !== undefined) extra.scale = Math.max(0, n('scale')!)
    if (n('blur') !== undefined) extra.blur = Math.max(0, n('blur')!)
    if (extra.scale !== undefined || extra.blur !== undefined) extras.set(id, extra)
  }
  return { patches, extras }
}

/** The scene with a clip frame applied, for drawing the canvas at the playhead. */
export function applyClipFrame(snap: SceneSnapshot, frame: ClipFrame): SceneSnapshot {
  if (frame.patches.size === 0) return snap
  const nodes = new Map(snap.nodes)
  for (const [id, patch] of frame.patches) nodes.set(id, { ...nodes.get(id)!, ...patch } as SceneNode)
  return buildSnapshot(nodes, snap.assets, snap, snap.animations)
}

export interface WaapiKeyframe {
  offset: number
  value: string
  easing: string
}

export interface WaapiTrack {
  nodeId: NodeId
  /** WAAPI (camelCase) property name. */
  property: string
  composite: 'replace' | 'add'
  keyframes: WaapiKeyframe[]
}

export interface ClipPlayback {
  id: string
  name: string
  duration: number
  repeat: ClipRepeat
  autoplay: boolean
  tracks: WaapiTrack[]
}

function trackCss(node: SceneNode, property: AnimatableProperty): { property: string; composite: 'replace' | 'add'; format: (v: number | Color) => string | null } | null {
  const numeric = (fn: (v: number) => string) => (v: number | Color) => (typeof v === 'number' ? fn(v) : null)
  if (node.type === 'group' && property !== 'opacity') return null
  switch (property) {
    case 'x':
      return { property: 'translate', composite: 'add', format: numeric((v) => `${round2(v - node.x)}px 0px`) }
    case 'y':
      return { property: 'translate', composite: 'add', format: numeric((v) => `0px ${round2(v - node.y)}px`) }
    case 'width':
      return { property: 'width', composite: 'replace', format: numeric((v) => `${round2(Math.max(0, v))}px`) }
    case 'height':
      return { property: 'height', composite: 'replace', format: numeric((v) => `${round2(Math.max(0, v))}px`) }
    case 'rotation':
      return { property: 'rotate', composite: 'replace', format: numeric((v) => `${round2(v)}deg`) }
    case 'scale':
      return { property: 'scale', composite: 'replace', format: numeric((v) => String(round2(Math.max(0, v)))) }
    case 'opacity':
      return { property: 'opacity', composite: 'replace', format: numeric((v) => String(round2(Math.min(1, Math.max(0, v))))) }
    case 'blur':
      return { property: 'filter', composite: 'replace', format: numeric((v) => `blur(${round2(Math.max(0, v))}px)`) }
    case 'cornerRadius':
      return 'cornerRadius' in node ? { property: 'borderRadius', composite: 'replace', format: numeric((v) => `${round2(Math.max(0, v))}px`) } : null
    case 'fill':
      if (node.type === 'image' || node.type === 'component') return null
      return { property: node.type === 'text' ? 'color' : 'backgroundColor', composite: 'replace', format: (v) => (typeof v === 'string' ? v : null) }
  }
}

/** Per-track WAAPI keyframes, padded to hold the first and last values across the whole clip. */
export function clipPlayback(snap: SceneSnapshot, clip: AnimationClip): ClipPlayback {
  const tracks: WaapiTrack[] = []
  for (const track of clip.tracks) {
    const node = snap.nodes.get(track.nodeId)
    const css = node && clip.duration > 0 ? trackCss(node, track.property) : null
    if (!css) continue
    const keyframes: WaapiKeyframe[] = []
    for (const k of track.keyframes) {
      const value = css.format(k.value)
      if (value !== null) keyframes.push({ offset: Math.min(1, Math.max(0, k.time / clip.duration)), value, easing: curveCss(k.curve) })
    }
    if (keyframes.length === 0) continue
    if (keyframes[0].offset > 0) keyframes.unshift({ ...keyframes[0], offset: 0, easing: 'linear' })
    const last = keyframes[keyframes.length - 1]
    if (last.offset < 1) keyframes.push({ ...last, offset: 1, easing: 'linear' })
    tracks.push({ nodeId: track.nodeId, property: css.property, composite: css.composite, keyframes })
  }
  return { id: clip.id, name: clip.name, duration: clip.duration, repeat: clip.repeat, autoplay: clip.autoplay, tracks }
}

export interface ScrollPlayback {
  source: ScrollSource
  /** Scroll speed (parallax); the runtime computes the travel from the viewport. */
  parallax?: number
  tracks: { property: string; keyframes: WaapiKeyframe[] }[]
}

/**
 * A layer's scroll transform and parallax as runtime effects. Scroll keyframes
 * interpolate linearly between scroll positions; properties no keyframe sets
 * don't animate, and keyframes that omit an animated property hold the layer's
 * own value.
 */
export function scrollPlayback(node: SceneNode): ScrollPlayback[] {
  const out: ScrollPlayback[] = []
  if (node.scroll) {
    const keys = node.scroll.keyframes
    const uses = (...props: (keyof MotionState)[]) => keys.some((k) => props.some((p) => k.state[p] !== undefined))
    const track = (property: string, value: (s: MotionState) => string) => {
      const keyframes = keys.map((k) => ({ offset: k.at, value: value(k.state), easing: 'linear' }))
      if (keyframes[0].offset > 0) keyframes.unshift({ ...keyframes[0], offset: 0 })
      if (keyframes[keyframes.length - 1].offset < 1) keyframes.push({ ...keyframes[keyframes.length - 1], offset: 1 })
      return { property, keyframes }
    }
    const tracks: ScrollPlayback['tracks'] = []
    if (uses('x', 'y')) tracks.push(track('translate', (s) => `${round2(s.x ?? 0)}px ${round2(s.y ?? 0)}px`))
    if (uses('scale')) tracks.push(track('scale', (s) => String(round2(s.scale ?? 1))))
    if (uses('rotate') && node.type !== 'group') tracks.push(track('rotate', (s) => `${round2(node.rotation + (s.rotate ?? 0))}deg`))
    if (uses('opacity')) tracks.push(track('opacity', (s) => String(round2(s.opacity ?? node.opacity))))
    if (uses('blur')) tracks.push(track('filter', (s) => `blur(${round2(s.blur ?? 0)}px)`))
    if (tracks.length) out.push({ source: node.scroll.source, tracks })
  }
  if (node.parallax) out.push({ source: 'in-view', parallax: node.parallax.speed, tracks: [] })
  return out
}
