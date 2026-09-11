import * as Y from 'yjs'
import { COMPOSITE_PROPS } from './normalize'
import {
  isNodeType,
  NODE_DEFAULTS,
  TYPE_LABELS,
  type AssetRecord,
  type NodePatch,
  type SceneNode,
} from './types'

/**
 * Yjs layout of a Codeframe document:
 *
 *   nodes:  Y.Map<nodeId, Y.Map<prop, primitive>>   one Y.Map per node, so concurrent
 *                                                    edits to different props merge
 *   assets: Y.Map<assetId, AssetRecord>             immutable, content-addressed
 *   meta:   Y.Map<string, primitive>                 document title, schema version
 */
export type YNode = Y.Map<unknown>

export const SCHEMA_VERSION = 1

export function getNodesMap(doc: Y.Doc): Y.Map<YNode> {
  return doc.getMap<YNode>('nodes')
}

export function getAssetsMap(doc: Y.Doc): Y.Map<AssetRecord> {
  return doc.getMap<AssetRecord>('assets')
}

export function getMetaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>('meta')
}

/**
 * Reads a node, filling defaults and dropping values of the wrong type, so a
 * document written by an older or newer client still renders.
 */
export function readNode(y: YNode): SceneNode | null {
  const raw = y.toJSON() as Record<string, unknown>
  if (!isNodeType(raw.type) || typeof raw.id !== 'string') return null
  const defaults = NODE_DEFAULTS[raw.type] as unknown as Record<string, unknown>
  const node: Record<string, unknown> = {
    ...defaults,
    name: TYPE_LABELS[raw.type],
    parentId: null,
    index: 'a0',
  }
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (Object.hasOwn(COMPOSITE_PROPS, key)) {
      node[key] = COMPOSITE_PROPS[key](value)
      continue
    }
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    const fallback = defaults[key]
    if (fallback !== undefined && fallback !== null && value !== null && typeof value !== typeof fallback) continue
    node[key] = value
  }
  return node as unknown as SceneNode
}

export function insertNode(nodes: Y.Map<YNode>, node: SceneNode): void {
  const y = new Y.Map<unknown>()
  for (const [key, value] of Object.entries(node)) {
    if (value !== undefined) y.set(key, value)
  }
  nodes.set(node.id, y)
}

/** Writes only props that actually change; no-op sets would still grow the CRDT history. */
export function patchNode(y: YNode, patch: NodePatch): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || key === 'id' || key === 'type') continue
    if (y.get(key) !== value) y.set(key, value)
  }
}
