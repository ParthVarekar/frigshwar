import { localBounds, localMatrix, parentSpaceMatrix, worldMatrix } from './geometry'
import { decompose, invert, multiply, round2, translation, type Matrix } from './matrix'
import { childrenOf, type SceneSnapshot } from './tree'
import type { NodeId, NodePatch } from './types'

/** A node's box in world space: `matrix` maps the box's local (0,0) corner and axes. */
export interface Box {
  matrix: Matrix
  width: number
  height: number
}

export type PatchMap = Map<NodeId, NodePatch>

export function worldBox(snap: SceneSnapshot, id: NodeId): Box {
  const b = localBounds(snap, id)
  return { matrix: multiply(worldMatrix(snap, id), translation(b.x, b.y)), width: b.width, height: b.height }
}

function addPatch(out: PatchMap, id: NodeId, patch: NodePatch) {
  out.set(id, { ...out.get(id), ...patch })
}

/**
 * Patches that move/resize/rotate a node so its world box becomes `next`.
 * Geometry is always derived from `snap` (the state when the gesture began), so
 * repeated calls during a drag never accumulate rounding error.
 *
 * Groups have no geometry, so the box change is applied to their descendants
 * (through nested groups). A frame resizes without scaling its children.
 */
export function patchesForBox(snap: SceneSnapshot, id: NodeId, next: Box, out: PatchMap = new Map()): PatchMap {
  const node = snap.nodes.get(id)
  if (!node) return out
  if (node.type !== 'group') {
    const local = decompose(multiply(invert(parentSpaceMatrix(snap, id)), next.matrix))
    addPatch(out, id, {
      x: round2(local.x),
      y: round2(local.y),
      rotation: local.rotation,
      width: round2(Math.max(0, next.width)),
      height: round2(Math.max(0, next.height)),
    })
    return out
  }
  const prev = worldBox(snap, id)
  const sx = prev.width > 0 ? next.width / prev.width : 1
  const sy = prev.height > 0 ? next.height / prev.height : 1
  const affine = multiply(next.matrix, multiply([sx, 0, 0, sy, 0, 0], invert(prev.matrix)))
  for (const child of childrenOf(snap, id)) applyAffine(snap, child, affine, out)
  return out
}

/** Moves nodes by a world-space delta. */
export function patchesForTranslate(snap: SceneSnapshot, ids: readonly NodeId[], dx: number, dy: number): PatchMap {
  const out: PatchMap = new Map()
  for (const id of ids) {
    const box = worldBox(snap, id)
    patchesForBox(snap, id, { ...box, matrix: multiply(translation(dx, dy), box.matrix) }, out)
  }
  return out
}

/**
 * Applies a world-space affine to a node. Non-uniform scale on a rotated node
 * would need skew, which the model doesn't have, so it's approximated by the
 * closest rotation plus axis scale (area-preserving).
 */
function applyAffine(snap: SceneSnapshot, id: NodeId, affine: Matrix, out: PatchMap) {
  const node = snap.nodes.get(id)
  if (!node) return
  if (node.type === 'group') {
    for (const child of childrenOf(snap, id)) applyAffine(snap, child, affine, out)
    return
  }
  const m = multiply(affine, worldMatrix(snap, id))
  const scaleX = Math.hypot(m[0], m[1])
  const det = m[0] * m[3] - m[1] * m[2]
  const scaleY = scaleX > 0 ? Math.abs(det) / scaleX : Math.hypot(m[2], m[3])
  const angle = Math.atan2(m[1], m[0])
  const rigid: Matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), m[4], m[5]]
  const local = decompose(multiply(invert(parentSpaceMatrix(snap, id)), rigid))
  addPatch(out, id, {
    x: round2(local.x),
    y: round2(local.y),
    rotation: local.rotation,
    width: round2(node.width * scaleX),
    height: round2(node.height * scaleY),
  })
}

/**
 * Patches that re-express a subtree's position in a different parent space
 * without moving it on screen. `delta` = inverse(newSpace) · oldSpace.
 */
export function rebaseSubtree(snap: SceneSnapshot, id: NodeId, delta: Matrix, out: PatchMap = new Map()): PatchMap {
  const node = snap.nodes.get(id)
  if (!node) return out
  if (node.type === 'group') {
    for (const child of childrenOf(snap, id)) rebaseSubtree(snap, child, delta, out)
    return out
  }
  const local = decompose(multiply(delta, localMatrix(node)))
  addPatch(out, id, { x: round2(local.x), y: round2(local.y), rotation: local.rotation })
  return out
}
