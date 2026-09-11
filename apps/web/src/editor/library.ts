/**
 * The editor side of the component library: the document's theme, text
 * metrics for component specs, inserting instances and editing their props.
 */
import {
  fittedSize,
  getSpec,
  normalizeTheme,
  refit,
  resolveProps,
  THEME_META_KEY,
  withPrimary,
  type LibraryTheme,
  type MeasureText,
  type Props,
} from '@codeframe/library'
import {
  apply,
  applyPatches,
  createNode,
  frameAt,
  IDENTITY,
  invert,
  worldMatrix,
  type ComponentNode,
  type NodeId,
  type NodePatch,
  type PatchMap,
  type Point,
  type SceneSnapshot,
  type SceneStore,
} from '@codeframe/scene'
import { useSyncExternalStore } from 'react'
import { viewportCenterWorld } from './commands'
import { measureText } from './text'
import { useUI } from './ui-store'

/** Drag-and-drop payload type for library tiles. */
export const COMPONENT_MIME = 'application/x-codeframe-component'

/** Specs measure with the same Konva text engine the canvas draws with. */
export const measureLibraryText: MeasureText = (text, style, maxWidth) =>
  measureText({
    text,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    italic: false,
    lineHeight: style.lineHeight,
    letterSpacing: 0,
    autoResize: maxWidth === undefined ? 'width' : 'height',
    width: maxWidth ?? 0,
    height: 0,
  })

let cached: { raw: unknown; theme: LibraryTheme } | null = null

/** The document's theme; the same object until it changes, so React can subscribe to it. */
export function readTheme(store: SceneStore): LibraryTheme {
  const raw = store.meta.get(THEME_META_KEY)
  if (!cached || cached.raw !== raw) cached = { raw, theme: normalizeTheme(raw) }
  return cached.theme
}

export function useLibraryTheme(store: SceneStore): LibraryTheme {
  return useSyncExternalStore(store.subscribe, () => readTheme(store))
}

/** Changes theme tokens and re-fits instances whose size depends on them (e.g. a new font). */
export function updateTheme(store: SceneStore, patch: Partial<LibraryTheme>): void {
  const before = readTheme(store)
  let after: LibraryTheme = { ...before, ...patch }
  if (patch.primary) after = withPrimary(after, patch.primary)
  const patches: [NodeId, NodePatch][] = []
  for (const node of store.getSnapshot().nodes.values()) {
    if (node.type !== 'component') continue
    const spec = getSpec(node.component)
    if (!spec) continue
    const props = resolveProps(node)
    const size = refit(spec, { props, theme: before }, { props, theme: after }, measureLibraryText, node)
    if (size.width !== node.width || size.height !== node.height) patches.push([node.id, size])
  }
  // Theme tokens live in document meta, outside undo history; keep the re-fit with them.
  store.transact(() => {
    store.meta.set(THEME_META_KEY, after)
    applyPatches(store, patches)
  }, { untracked: true })
}

/** Inserts an instance centered on `world` (default: the middle of the view), inside the frame there. */
export function insertComponent(store: SceneStore, key: string, world: Point = viewportCenterWorld()): NodeId | null {
  const spec = getSpec(key)
  if (!spec) return null
  const size = spec.size(spec.defaults, readTheme(store), measureLibraryText)
  const snap = store.getSnapshot()
  const parentId = frameAt(snap, world)
  const local = apply(invert(parentId ? worldMatrix(snap, parentId) : IDENTITY), world)
  const id = createNode(store, {
    type: 'component',
    parentId,
    props: {
      name: spec.name,
      component: key,
      props: { ...spec.defaults },
      x: Math.round(local.x - size.width / 2),
      y: Math.round(local.y - size.height / 2),
      width: size.width,
      height: size.height,
    },
  })
  const ui = useUI.getState()
  ui.setSelection([id])
  ui.setTool('select')
  return id
}

/** Writes props to instances, re-fitting any whose size follows their content. */
export function setComponentProps(store: SceneStore, nodes: ComponentNode[], patch: Props, merge: boolean): void {
  const theme = readTheme(store)
  const patches = nodes.flatMap((node): [NodeId, NodePatch][] => {
    const spec = getSpec(node.component)
    if (!spec) return []
    const before = resolveProps(node)
    const after = { ...before, ...patch }
    const size = refit(spec, { props: before, theme }, { props: after, theme }, measureLibraryText, node)
    return [[node.id, { props: { ...node.props, ...patch }, ...size }]]
  })
  store.transact(() => applyPatches(store, patches), { merge })
}

/** Height (and width, for fixed-size components) an instance takes at a given box. */
export function componentBox(store: SceneStore, node: ComponentNode, box: { width: number; height: number }) {
  const spec = getSpec(node.component)
  return spec ? fittedSize(spec, resolveProps(node), readTheme(store), measureLibraryText, box) : box
}

/**
 * Keeps size edits within what each component allows: fixed-size components
 * keep their natural size, content-sized ones recompute height for the new width.
 */
export function constrainComponentPatches(store: SceneStore, snap: SceneSnapshot, patches: PatchMap): void {
  for (const [id, patch] of patches) {
    const node = snap.nodes.get(id)
    if (node?.type !== 'component' || (patch.width === undefined && patch.height === undefined)) continue
    const spec = getSpec(node.component)
    if (!spec || spec.resize === 'both') continue
    const box = componentBox(store, node, { width: patch.width ?? node.width, height: patch.height ?? node.height })
    patch.width = box.width
    patch.height = box.height
  }
}
