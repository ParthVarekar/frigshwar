import type { NodeId } from '@codeframe/scene'
import type Konva from 'konva'

/**
 * Scene node id → the Konva node that draws it. Only for imperative work that
 * React shouldn't re-render: canvas animation playback and PNG export.
 */
const konvaNodes = new Map<NodeId, Konva.Node>()
const refs = new Map<NodeId, (node: Konva.Node | null) => void>()

/** A stable ref callback per id, so memoised views don't re-register on every render. */
export function konvaRef(id: NodeId): (node: Konva.Node | null) => void {
  let ref = refs.get(id)
  if (!ref) {
    ref = (node) => {
      if (node) konvaNodes.set(id, node)
      else konvaNodes.delete(id)
    }
    refs.set(id, ref)
  }
  return ref
}

export function konvaNode(id: NodeId): Konva.Node | undefined {
  return konvaNodes.get(id)
}
