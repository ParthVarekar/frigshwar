import { curveDuration, curveValue, descendantsOf, localBounds, type NodeId, type SceneSnapshot } from '@codeframe/scene'
import Konva from 'konva'
import { konvaNode } from './registry'

/**
 * Plays appear animations in place on the canvas, for quick feedback while
 * editing. Preview mode is the faithful version (real CSS); this one ignores
 * blur and pivots rotation on the layer's corner. Returns how many played.
 */
export function playAppearOnCanvas(snap: SceneSnapshot, ids: readonly NodeId[]): number {
  const all = new Set(ids.flatMap((id) => [id, ...descendantsOf(snap, id)]))
  let played = 0
  for (const id of all) {
    const node = snap.nodes.get(id)
    const k = konvaNode(id)
    if (!node?.appear || !node.visible || !k) continue
    const { from, timing } = node.appear
    const end = { x: k.x(), y: k.y(), opacity: node.opacity, scaleX: 1, scaleY: 1, rotation: k.rotation() }
    const start = { ...end, opacity: from.opacity ?? node.opacity, rotation: end.rotation + (from.rotate ?? 0) }
    start.x += from.x ?? 0
    start.y += from.y ?? 0
    if (from.scale !== undefined && from.scale !== 1) {
      // Scale about the box center; Konva scales about the node origin.
      const b = localBounds(snap, id)
      start.scaleX = from.scale
      start.scaleY = from.scale
      start.x += (b.x + b.width / 2) * (1 - from.scale)
      start.y += (b.y + b.height / 2) * (1 - from.scale)
    }
    k.setAttrs(start)
    k.getLayer()?.batchDraw()
    const tween = new Konva.Tween({
      node: k,
      duration: curveDuration(timing.curve, timing.duration) / 1000,
      // Konva easings are (elapsed, start, change, duration); springs and béziers both fit.
      easing: (t: number, b: number, c: number, d: number) => b + c * curveValue(timing.curve, d > 0 ? t / d : 1),
      ...end,
      onFinish: () => tween.destroy(),
    })
    window.setTimeout(() => tween.play(), timing.delay)
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
