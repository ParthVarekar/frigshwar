import { descendantsOf, localBounds, type Easing, type NodeId, type SceneSnapshot } from '@codeframe/scene'
import Konva from 'konva'
import { konvaNode } from './registry'

type KonvaEasing = (typeof Konva.Easings)[keyof typeof Konva.Easings]

const KONVA_EASING: Record<Easing, KonvaEasing> = {
  linear: Konva.Easings.Linear,
  ease: Konva.Easings.EaseInOut,
  'ease-in': Konva.Easings.EaseIn,
  'ease-out': Konva.Easings.EaseOut,
  'ease-in-out': Konva.Easings.EaseInOut,
  spring: Konva.Easings.BackEaseOut,
}

/**
 * Plays appear animations in place on the canvas, for quick feedback while
 * editing. Preview mode is the faithful version (real CSS); this one ignores
 * blur and approximates scale on rotated nodes. Returns how many played.
 */
export function playAppearOnCanvas(snap: SceneSnapshot, ids: readonly NodeId[]): number {
  const all = new Set(ids.flatMap((id) => [id, ...descendantsOf(snap, id)]))
  let played = 0
  for (const id of all) {
    const node = snap.nodes.get(id)
    const k = konvaNode(id)
    if (!node?.appear || !node.visible || !k) continue
    const { preset, distance, duration, delay, easing } = node.appear
    const end = { x: k.x(), y: k.y(), opacity: node.opacity, scaleX: 1, scaleY: 1 }
    const start = { ...end, opacity: 0 }
    if (preset === 'slide-up') start.y += distance
    else if (preset === 'slide-down') start.y -= distance
    else if (preset === 'slide-left') start.x += distance
    else if (preset === 'slide-right') start.x -= distance
    else if (preset === 'scale') {
      // Scale about the box center; Konva scales about the node origin.
      const b = localBounds(snap, id)
      const s = 0.92
      start.scaleX = s
      start.scaleY = s
      start.x += (b.x + b.width / 2) * (1 - s)
      start.y += (b.y + b.height / 2) * (1 - s)
    }
    k.setAttrs(start)
    k.getLayer()?.batchDraw()
    const tween = new Konva.Tween({
      node: k,
      duration: duration / 1000,
      easing: KONVA_EASING[easing],
      ...end,
      onFinish: () => tween.destroy(),
    })
    window.setTimeout(() => tween.play(), delay)
    played++
  }
  return played
}

/** Downloads a node as a 2× PNG, independent of the current zoom. */
export function exportNodePng(id: NodeId, name: string, zoom: number): boolean {
  const k = konvaNode(id)
  if (!k) return false
  const url = k.toDataURL({ pixelRatio: 2 / zoom, mimeType: 'image/png' })
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'layer'}@2x.png`
  link.click()
  return true
}
