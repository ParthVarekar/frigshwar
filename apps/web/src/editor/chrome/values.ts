import type { NodeId, NodePatch } from '@codeframe/scene'

/** The shared value, or `null` when the selection disagrees ("Mixed"). */
export function common<T>(values: readonly T[]): T | null {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null
}

/** Writes patches as one undo step, or folds them into the previous one (scrubs, color drags). */
export type Commit = (patches: Iterable<[NodeId, NodePatch]>, merge: boolean) => void
