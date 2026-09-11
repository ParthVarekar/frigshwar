/**
 * Property edits that need geometry: the properties panel and the transformer
 * both express changes as box changes, so groups and rotated nodes behave the
 * same whether you drag a handle or type a number.
 */
import {
  apply,
  localBounds,
  multiply,
  parentSpaceMatrix,
  patchesForBox,
  patchesForTranslate,
  rotationDeg,
  translation,
  worldBox,
  type NodeId,
  type NodePatch,
  type PatchMap,
  type SceneSnapshot,
  type TextNode,
} from '@codeframe/scene'
import { CONTENT_FONTS } from '../fonts'
import { measureText } from './text'

function merge(out: PatchMap, patches: PatchMap): PatchMap {
  for (const [id, patch] of patches) out.set(id, { ...out.get(id), ...patch })
  return out
}

/** Position in parent space: a node's x/y, or a group's derived bounds. */
export function localPosition(snap: SceneSnapshot, id: NodeId): { x: number; y: number } {
  const node = snap.nodes.get(id)!
  if (node.type !== 'group') return { x: node.x, y: node.y }
  const b = localBounds(snap, id)
  return { x: b.x, y: b.y }
}

export function setPosition(snap: SceneSnapshot, id: NodeId, axis: 'x' | 'y', value: number, out: PatchMap = new Map()) {
  const delta = value - localPosition(snap, id)[axis]
  const dx = axis === 'x' ? delta : 0
  const dy = axis === 'y' ? delta : 0
  const m = parentSpaceMatrix(snap, id)
  return merge(out, patchesForTranslate(snap, [id], m[0] * dx + m[2] * dy, m[1] * dx + m[3] * dy))
}

export function setSize(snap: SceneSnapshot, id: NodeId, dim: 'width' | 'height', value: number, out: PatchMap = new Map()) {
  const box = worldBox(snap, id)
  patchesForBox(snap, id, { ...box, [dim]: Math.max(0, value) }, out)
  adjustTextResize(snap, id, out)
  return out
}

/** Rotates about the box center, like the canvas handle, rather than the stored origin. */
export function setRotation(snap: SceneSnapshot, id: NodeId, degrees: number, out: PatchMap = new Map()) {
  const node = snap.nodes.get(id)
  if (!node || node.type === 'group') return out
  const box = worldBox(snap, id)
  const center = apply(box.matrix, { x: box.width / 2, y: box.height / 2 })
  const spin = multiply(
    translation(center.x, center.y),
    multiply(rotationDeg(degrees - node.rotation), translation(-center.x, -center.y)),
  )
  return patchesForBox(snap, id, { ...box, matrix: multiply(spin, box.matrix) }, out)
}

/**
 * Resizing a text box changes its sizing mode the way designers expect:
 * changing an auto-width text's width fixes the width (it wraps), and
 * changing its height fixes the whole box.
 */
export function adjustTextResize(snap: SceneSnapshot, id: NodeId, patches: PatchMap) {
  const node = snap.nodes.get(id)
  const patch = patches.get(id)
  if (node?.type !== 'text' || !patch || patch.width === undefined || patch.height === undefined) return
  const widthChanged = Math.abs(patch.width - node.width) > 0.5
  const heightChanged = Math.abs(patch.height - node.height) > 0.5
  let mode = node.autoResize
  if (heightChanged) mode = 'none'
  else if (widthChanged && mode === 'width') mode = 'height'
  if (mode === 'height') patch.height = measureText({ ...node, width: patch.width, autoResize: 'height' }).height
  patch.autoResize = mode
}

/** Applies typographic changes and re-measures the box. Snaps weight to one the family ships. */
export function textPatch(node: TextNode, patch: Partial<TextNode>): NodePatch {
  const next = { ...node, ...patch }
  const weights = CONTENT_FONTS[next.fontFamily]
  if (weights && !weights.includes(next.fontWeight)) {
    next.fontWeight = weights.reduce((a, b) => (Math.abs(b - next.fontWeight) < Math.abs(a - next.fontWeight) ? b : a))
  }
  return { ...patch, fontWeight: next.fontWeight, ...measureText(next) }
}
