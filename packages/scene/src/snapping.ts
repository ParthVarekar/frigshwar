/**
 * Smart guides: edges and centers of the container and its other children act
 * as magnetic lines. Everything here is world-space, axis-aligned bounds.
 */
import { worldBounds } from './geometry'
import { round2, type Rect } from './matrix'
import { childrenOf, type SceneSnapshot } from './tree'
import type { NodeId } from './types'

/** A snap line at `value`, drawn across [start, end] on the other axis. */
export interface SnapLine {
  value: number
  start: number
  end: number
}

export interface SnapTargets {
  /** Vertical lines (x positions). */
  x: SnapLine[]
  /** Horizontal lines (y positions). */
  y: SnapLine[]
}

export interface Guide {
  axis: 'x' | 'y'
  value: number
  start: number
  end: number
}

function addRect(targets: SnapTargets, r: Rect) {
  for (const v of [r.x, r.x + r.width / 2, r.x + r.width]) targets.x.push({ value: v, start: r.y, end: r.y + r.height })
  for (const v of [r.y, r.y + r.height / 2, r.y + r.height]) targets.y.push({ value: v, start: r.x, end: r.x + r.width })
}

/** Lines from each scope's own box (unless canvas) and its visible children, minus `exclude`. */
export function snapTargets(
  snap: SceneSnapshot,
  scopes: Iterable<NodeId | null>,
  exclude: ReadonlySet<NodeId>,
): SnapTargets {
  const targets: SnapTargets = { x: [], y: [] }
  for (const scope of new Set(scopes)) {
    if (scope !== null && !exclude.has(scope)) addRect(targets, worldBounds(snap, scope))
    for (const id of childrenOf(snap, scope)) {
      const node = snap.nodes.get(id)
      if (!node || !node.visible || exclude.has(id)) continue
      addRect(targets, worldBounds(snap, id))
    }
  }
  return targets
}

function nearestOffset(values: readonly number[], lines: readonly SnapLine[], threshold: number): number | null {
  let best: number | null = null
  for (const v of values) {
    for (const line of lines) {
      const d = line.value - v
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
  }
  return best
}

function guidesOn(
  axis: 'x' | 'y',
  values: readonly number[],
  lines: readonly SnapLine[],
  span: readonly [number, number],
  out: Map<string, Guide>,
) {
  for (const line of lines) {
    if (!values.some((v) => Math.abs(line.value - v) < 0.01)) continue
    const key = `${axis}:${round2(line.value)}`
    const prev = out.get(key)
    out.set(key, {
      axis,
      value: line.value,
      start: Math.min(prev?.start ?? Infinity, line.start, span[0]),
      end: Math.max(prev?.end ?? -Infinity, line.end, span[1]),
    })
  }
}

/** Offset that pulls a moving box's edges or center onto the nearest lines within `threshold`. */
export function snapRect(rect: Rect, targets: SnapTargets, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width]
  const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height]
  const dx = nearestOffset(xs(rect), targets.x, threshold) ?? 0
  const dy = nearestOffset(ys(rect), targets.y, threshold) ?? 0
  const moved = { ...rect, x: rect.x + dx, y: rect.y + dy }
  const guides = new Map<string, Guide>()
  guidesOn('x', xs(moved), targets.x, [moved.y, moved.y + moved.height], guides)
  guidesOn('y', ys(moved), targets.y, [moved.x, moved.x + moved.width], guides)
  return { dx, dy, guides: [...guides.values()] }
}

/** Snaps one coordinate (a dragged edge, or the pointer while drawing). */
export function snapPoint(
  point: { x: number; y: number },
  targets: SnapTargets,
  threshold: number,
): { x: number; y: number; guides: Guide[] } {
  const dx = nearestOffset([point.x], targets.x, threshold) ?? 0
  const dy = nearestOffset([point.y], targets.y, threshold) ?? 0
  const x = point.x + dx
  const y = point.y + dy
  const guides = new Map<string, Guide>()
  guidesOn('x', [x], targets.x, [y, y], guides)
  guidesOn('y', [y], targets.y, [x, x], guides)
  return { x, y, guides: [...guides.values()] }
}
