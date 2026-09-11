import { childrenOf, decompose, multiply, worldMatrix, type NodeId, type Point, type SceneSnapshot } from '@codeframe/scene'
import type { Viewport } from '../ui-store'
import { viewportMatrix } from '../viewport'

/** Frame captions: Fraunces italic above each canvas-level frame, in screen space. */
export const LABEL_FONT_FAMILY = 'Fraunces'
export const LABEL_FONT_SIZE = 12
export const LABEL_HEIGHT = 16
export const LABEL_GAP = 4

export interface FrameLabel {
  id: NodeId
  text: string
  /** Screen position of the frame's top-left corner; the caption sits above it. */
  x: number
  y: number
  rotation: number
  width: number
}

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!
  measureCtx.font = `italic ${LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`
  return measureCtx.measureText(text).width
}

let cache: { snap: SceneSnapshot; viewport: Viewport; labels: FrameLabel[] } | null = null

export function frameLabels(snap: SceneSnapshot, viewport: Viewport): FrameLabel[] {
  if (cache && cache.snap === snap && cache.viewport === viewport) return cache.labels
  const labels = childrenOf(snap, null).flatMap((id): FrameLabel[] => {
    const node = snap.nodes.get(id)!
    if (node.type !== 'frame' || !node.visible) return []
    const { x, y, rotation } = decompose(multiply(viewportMatrix(viewport), worldMatrix(snap, id)))
    const maxWidth = Math.max(0, node.width * viewport.zoom)
    let text = node.name
    while (text.length > 1 && textWidth(text) > maxWidth) text = `${text.slice(0, text.endsWith('…') ? -2 : -1)}…`
    return [{ id, text, x, y, rotation, width: Math.min(textWidth(text), maxWidth) }]
  })
  cache = { snap, viewport, labels }
  return labels
}

export function hitFrameLabel(labels: readonly FrameLabel[], screen: Point): NodeId | null {
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i]
    const r = (-label.rotation * Math.PI) / 180
    const dx = screen.x - label.x
    const dy = screen.y - label.y
    const lx = dx * Math.cos(r) - dy * Math.sin(r)
    const ly = dx * Math.sin(r) + dy * Math.cos(r)
    if (lx >= 0 && lx <= Math.max(label.width, 12) && ly >= -(LABEL_GAP + LABEL_HEIGHT) && ly <= 0) return label.id
  }
  return null
}
