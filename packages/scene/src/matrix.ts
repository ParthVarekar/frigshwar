/**
 * 2D affine matrix [a, b, c, d, e, f] mapping (x, y) to
 * (a·x + c·y + e, b·x + d·y + f), the same layout as DOMMatrix / canvas.
 */
export type Matrix = readonly [number, number, number, number, number, number]

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** `multiply(m, n)` applies `n` first, then `m`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function translation(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y]
}

export function rotationDeg(deg: number): Matrix {
  if (deg === 0) return IDENTITY
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [cos, sin, -sin, cos, 0, 0]
}

/** Translate to (x, y), then rotate about that point. */
export function fromPosition(x: number, y: number, rotation: number): Matrix {
  return multiply(translation(x, y), rotationDeg(rotation))
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2]
  if (det === 0) return IDENTITY
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}

export function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

/** Position and rotation of a rigid (rotation + translation) matrix. */
export function decompose(m: Matrix): { x: number; y: number; rotation: number } {
  return { x: m[4], y: m[5], rotation: normalizeDeg((Math.atan2(m[1], m[0]) * 180) / Math.PI) }
}

/** Normalises to (-180, 180] and snaps float noise to clean values. */
export function normalizeDeg(deg: number): number {
  let d = ((deg % 360) + 360) % 360
  if (d > 180) d -= 360
  const rounded = Math.round(d * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

export function rectCorners(m: Matrix, width: number, height: number): [Point, Point, Point, Point] {
  return [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: width, y: 0 }),
    apply(m, { x: width, y: height }),
    apply(m, { x: 0, y: height }),
  ]
}

export function boundsOfPoints(points: readonly Point[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  return boundsOfPoints(rects.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
  ]))
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** Rounds to 2 decimals; stored geometry never carries float noise into generated code. */
export function round2(n: number): number {
  const r = Math.round(n * 100) / 100
  return Object.is(r, -0) ? 0 : r
}
