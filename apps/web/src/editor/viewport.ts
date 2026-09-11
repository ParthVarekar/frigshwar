import type { Matrix, Point, Rect } from '@codeframe/scene'
import type { Viewport } from './ui-store'

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 64

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y }
}

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom }
}

export function viewportMatrix(v: Viewport): Matrix {
  return [v.zoom, 0, 0, v.zoom, v.x, v.y]
}

/** Zooms so the world point under `screen` stays put. */
export function zoomAround(v: Viewport, screen: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom)
  const world = screenToWorld(v, screen)
  return { zoom, x: screen.x - world.x * zoom, y: screen.y - world.y * zoom }
}

export function fitRect(rect: Rect, size: { width: number; height: number }, padding = 64, maxZoom = 1): Viewport {
  const w = Math.max(1, size.width - padding * 2)
  const h = Math.max(1, size.height - padding * 2)
  const zoom = clampZoom(Math.min(maxZoom, w / Math.max(1, rect.width), h / Math.max(1, rect.height)))
  return {
    zoom,
    x: size.width / 2 - (rect.x + rect.width / 2) * zoom,
    y: size.height / 2 - (rect.y + rect.height / 2) * zoom,
  }
}

/** Steps through a fixed ladder so repeated zoom-in/out lands on round numbers. */
const LADDER = [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 32, 64]

export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return LADDER.find((z) => z > zoom + 1e-6) ?? MAX_ZOOM
  return [...LADDER].reverse().find((z) => z < zoom - 1e-6) ?? MIN_ZOOM
}
