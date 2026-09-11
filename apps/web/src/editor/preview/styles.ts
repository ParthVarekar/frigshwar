import { expandInstance, type LibraryTheme } from '@codeframe/library'
import { descendantsOf, subtreeStylesheet, type NodeId, type SceneSnapshot } from '@codeframe/scene'
import { measureLibraryText } from '../library'

/** Class name for a node's element. Component part ids contain `~`, which selectors can't. */
export const domClass = (id: NodeId) => `cf-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`

/** CSS for a subtree rendered as DOM, including the drawn parts of library components. */
export function treeStylesheet(snap: SceneSnapshot, rootId: NodeId, theme: LibraryTheme): string {
  const rules = [subtreeStylesheet(snap, rootId, domClass)]
  for (const id of [rootId, ...descendantsOf(snap, rootId)]) {
    const node = snap.nodes.get(id)
    if (node?.type !== 'component') continue
    const scene = expandInstance(node, theme, measureLibraryText)
    if (scene) rules.push(subtreeStylesheet(scene.snapshot, scene.rootId, domClass))
  }
  return rules.join('\n')
}
