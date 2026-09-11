import {
  CURVE_PRESETS,
  pathTo,
  putAnimation,
  type AnimatableProperty,
  type AnimationClip,
  type Keyframe,
  type NodeId,
  type NodePatch,
  type SceneNode,
  type SceneSnapshot,
  type SceneStore,
} from '@codeframe/scene'

/** Keys within this many ms of the playhead are the same keyframe. */
const SAME_KEY_MS = 1

/** Properties Design-tab edits can key while recording. */
const RECORDABLE: ReadonlySet<string> = new Set<AnimatableProperty>(['x', 'y', 'width', 'height', 'rotation', 'opacity', 'fill', 'cornerRadius'])

/** A layer's own value for an animatable property, or `undefined` when it doesn't have one. */
export function baseValue(node: SceneNode, property: AnimatableProperty): number | string | undefined {
  switch (property) {
    case 'scale':
      return 1
    case 'blur':
      return 0
    case 'fill':
      return 'fill' in node && typeof node.fill === 'string' ? node.fill : undefined
    case 'cornerRadius':
      return 'cornerRadius' in node ? node.cornerRadius : undefined
    default:
      return node.type === 'group' && property !== 'opacity' ? undefined : node[property]
  }
}

/**
 * Sets the value at `time`, adding the keyframe if needed. A new track also gets
 * a key at 0 holding `base`, so the clip animates from the layer's own value.
 */
export function withKeyframe(
  clip: AnimationClip,
  nodeId: NodeId,
  property: AnimatableProperty,
  time: number,
  value: number | string,
  base: number | string | undefined,
): AnimationClip {
  const curve = CURVE_PRESETS['ease-in-out']
  const index = clip.tracks.findIndex((t) => t.nodeId === nodeId && t.property === property)
  if (index === -1) {
    const keyframes: Keyframe[] = time > SAME_KEY_MS && base !== undefined ? [{ time: 0, value: base, curve }, { time, value, curve }] : [{ time, value, curve }]
    return { ...clip, tracks: [...clip.tracks, { nodeId, property, keyframes }] }
  }
  const track = clip.tracks[index]
  const at = track.keyframes.findIndex((k) => Math.abs(k.time - time) <= SAME_KEY_MS)
  const keyframes =
    at === -1
      ? [...track.keyframes, { time, value, curve }].sort((a, b) => a.time - b.time)
      : track.keyframes.map((k, i) => (i === at ? { ...k, value } : k))
  return { ...clip, tracks: clip.tracks.map((t, i) => (i === index ? { ...track, keyframes } : t)) }
}

/**
 * Record mode: keys recordable properties of layers inside the clip's frame at
 * the playhead and returns the rest of the patches to apply as ordinary edits.
 * Unchanged values on untracked properties are dropped rather than keyed.
 */
export function recordPatches(
  store: SceneStore,
  snap: SceneSnapshot,
  clip: AnimationClip,
  time: number,
  patches: Iterable<[NodeId, NodePatch]>,
  merge: boolean,
): [NodeId, NodePatch][] {
  let next = clip
  const rest: [NodeId, NodePatch][] = []
  for (const [id, patch] of patches) {
    const node = snap.nodes.get(id)
    if (!node || pathTo(snap, id)[0] !== clip.frameId) {
      rest.push([id, patch])
      continue
    }
    const remaining: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(patch)) {
      const property = key as AnimatableProperty
      const keyable = RECORDABLE.has(key) && (typeof value === 'number' || (property === 'fill' && typeof value === 'string'))
      const base = keyable ? baseValue(node, property) : undefined
      if (!keyable || base === undefined) {
        remaining[key] = value
        continue
      }
      const tracked = next.tracks.some((t) => t.nodeId === id && t.property === property)
      if (!tracked && value === base) continue
      next = withKeyframe(next, id, property, time, value as number | string, base)
    }
    if (Object.keys(remaining).length) rest.push([id, remaining as NodePatch])
  }
  if (next !== clip) putAnimation(store, next, { merge })
  return rest
}
