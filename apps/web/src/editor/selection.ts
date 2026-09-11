import { parentOf, type NodeId, type SceneSnapshot } from '@codeframe/scene'

/**
 * Which node a click lands on, given the hit chain (canvas-level ancestor first,
 * deepest hit last):
 *
 *  1. Ctrl/Cmd-click selects the deepest node.
 *  2. Children of canvas-level frames are directly clickable. Anything else
 *     selects its canvas-level ancestor (groups and nested frames need a double-click).
 *  3. A node already selected at or below that default stays the target, so
 *     dragging a selected group moves the group.
 *  4. Siblings of the current selection are directly clickable: once you've
 *     entered a container, you stay in it.
 */
export function resolveTarget(
  snap: SceneSnapshot,
  chain: readonly NodeId[],
  selection: readonly NodeId[],
  deep: boolean,
): NodeId | null {
  if (chain.length === 0) return null
  if (deep) return chain[chain.length - 1]

  const fallback = snap.nodes.get(chain[0])?.type === 'frame' && chain.length > 1 ? 1 : 0
  const selectedAt = chain.findIndex((id) => selection.includes(id))
  if (selectedAt >= fallback) return chain[selectedAt]

  const scopes = new Set(selection.map((id) => parentOf(snap, id)).filter((p): p is NodeId => p !== null))
  for (let i = chain.length - 1; i > fallback; i--) {
    const parent = parentOf(snap, chain[i])
    if (parent !== null && scopes.has(parent)) return chain[i]
  }
  return chain[fallback]
}

/** Double-click: one level below the selected node in the chain. */
export function drillTarget(chain: readonly NodeId[], selection: readonly NodeId[]): NodeId | null {
  const at = chain.findIndex((id) => selection.includes(id))
  return at >= 0 && at < chain.length - 1 ? chain[at + 1] : null
}
