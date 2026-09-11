/**
 * Editor commands shared by keyboard shortcuts, menus and canvas gestures.
 * They read client state from the UI store and write through scene operations.
 */
import {
  addAsset,
  addAutoLayout,
  alignNodes,
  apply,
  childrenOf,
  createNode,
  deleteNodes,
  distributeNodes,
  duplicateNodes,
  frameAt,
  frameNodes,
  groupNodes,
  IDENTITY,
  invert,
  isAutoLayout,
  isClipboardPayload,
  isStacked,
  NODE_DEFAULTS,
  normalizeSelection,
  parentOf,
  pasteNodes,
  patchesForTranslate,
  pathTo,
  rectsIntersect,
  removeAutoLayout,
  reorderNodes,
  selectionBounds,
  serializeNodes,
  unionRects,
  unwrapNodes,
  worldBounds,
  worldMatrix,
  wrapInAutoLayout,
  applyPatches,
  type AlignEdge,
  type ClipboardPayload,
  type NodeId,
  type Point,
  type ReorderDirection,
  type SceneStore,
  type TextAutoResize,
} from '@codeframe/scene'
import { exportNodePng, playAppearOnCanvas } from './canvas/motion'
import { importImageFile } from './images'
import { measureText } from './text'
import { useUI } from './ui-store'
import { fitRect, screenToWorld, stepZoom, zoomAround } from './viewport'

const ui = () => useUI.getState()

function selected(store: SceneStore): NodeId[] {
  return normalizeSelection(store.getSnapshot(), ui().selection)
}

function unlocked(store: SceneStore, ids: NodeId[]): NodeId[] {
  const snap = store.getSnapshot()
  return ids.filter((id) => !snap.nodes.get(id)?.locked)
}

// --- history ---------------------------------------------------------------

export function undo(store: SceneStore) {
  store.undo()
  pruneSelection(store)
}

export function redo(store: SceneStore) {
  store.redo()
  pruneSelection(store)
}

export function pruneSelection(store: SceneStore) {
  const snap = store.getSnapshot()
  const { selection, hoverId, editing, setSelection, setHover, setEditing } = ui()
  setSelection(selection.filter((id) => snap.nodes.has(id)))
  if (hoverId && !snap.nodes.has(hoverId)) setHover(null)
  if (editing && !snap.nodes.has(editing.id)) setEditing(null)
}

// --- structure ---------------------------------------------------------------

export function deleteSelection(store: SceneStore) {
  const ids = unlocked(store, selected(store))
  if (ids.length === 0) return
  deleteNodes(store, ids)
  ui().setSelection([])
}

export function duplicateSelection(store: SceneStore) {
  const ids = selected(store)
  if (ids.length) ui().setSelection(duplicateNodes(store, ids))
}

export function groupSelection(store: SceneStore) {
  const id = groupNodes(store, selected(store))
  if (id) ui().setSelection([id])
}

export function frameSelection(store: SceneStore) {
  const id = frameNodes(store, selected(store))
  if (id) ui().setSelection([id])
}

export function ungroupSelection(store: SceneStore) {
  const lifted = unwrapNodes(store, selected(store))
  if (lifted.length) ui().setSelection(lifted)
}

export function reorderSelection(store: SceneStore, direction: ReorderDirection) {
  reorderNodes(store, selected(store), direction)
}

/** Arrow keys move layers; inside a stack, arrows along its direction reorder instead (as in Figma). */
export function nudgeSelection(store: SceneStore, dx: number, dy: number) {
  const ids = unlocked(store, selected(store))
  if (ids.length === 0) return
  const snap = store.getSnapshot()
  const stacked = ids.filter((id) => isStacked(snap, id))
  const free = ids.filter((id) => !isStacked(snap, id))
  const stack = stacked.length ? snap.nodes.get(parentOf(snap, stacked[0])!) : undefined
  if (isAutoLayout(stack)) {
    const step = stack.layout.direction === 'horizontal' ? dx : dy
    if (step !== 0) reorderNodes(store, stacked, step < 0 ? 'backward' : 'forward')
  }
  if (free.length) applyPatches(store, patchesForTranslate(snap, free, dx, dy))
}

/** Shift+A: auto layout on a lone plain frame; anything else is wrapped in a new stack. */
export function addAutoLayoutToSelection(store: SceneStore) {
  const snap = store.getSnapshot()
  const ids = unlocked(store, selected(store))
  if (ids.length === 0) return
  const only = ids.length === 1 ? snap.nodes.get(ids[0]) : undefined
  if (only?.type === 'frame' && !only.layout) {
    addAutoLayout(store, ids)
    return
  }
  const id = wrapInAutoLayout(store, ids)
  if (id) ui().setSelection([id])
}

/** Alt+Shift+A. */
export function removeAutoLayoutFromSelection(store: SceneStore) {
  removeAutoLayout(store, unlocked(store, selected(store)))
}

export function toggleVisibility(store: SceneStore, ids: NodeId[]) {
  const snap = store.getSnapshot()
  const visible = !ids.every((id) => snap.nodes.get(id)?.visible)
  applyPatches(store, ids.map((id) => [id, { visible }]))
}

export function toggleLock(store: SceneStore, ids: NodeId[]) {
  const snap = store.getSnapshot()
  const locked = !ids.every((id) => snap.nodes.get(id)?.locked)
  applyPatches(store, ids.map((id) => [id, { locked }]))
}

// --- selection ---------------------------------------------------------------

export function selectAll(store: SceneStore) {
  const snap = store.getSnapshot()
  const sel = ui().selection
  const scope = sel.length ? parentOf(snap, sel[0]) : null
  ui().setSelection(
    childrenOf(snap, scope).filter((id) => {
      const node = snap.nodes.get(id)!
      return node.visible && !node.locked
    }),
  )
}

export function selectParent(store: SceneStore) {
  const snap = store.getSnapshot()
  const parents = new Set(ui().selection.map((id) => parentOf(snap, id)).filter((p) => p !== null))
  ui().setSelection([...parents])
}

/** Enter: edit a lone text, otherwise step into the selected containers. */
export function enterSelection(store: SceneStore) {
  const snap = store.getSnapshot()
  const sel = ui().selection
  if (sel.length === 1 && snap.nodes.get(sel[0])?.type === 'text') {
    ui().setEditing({ id: sel[0], isNew: false })
    return
  }
  const children = sel.flatMap((id) => childrenOf(snap, id))
  if (children.length) ui().setSelection(children)
}

// --- viewport ----------------------------------------------------------------

function canvasCenter(): Point {
  const { width, height } = ui().canvasSize
  return { x: width / 2, y: height / 2 }
}

export function viewportCenterWorld(): Point {
  return screenToWorld(ui().viewport, canvasCenter())
}

export function zoomStep(direction: 1 | -1) {
  ui().setViewport((v) => zoomAround(v, canvasCenter(), stepZoom(v.zoom, direction)))
}

export function zoomTo(zoom: number) {
  ui().setViewport((v) => zoomAround(v, canvasCenter(), zoom))
}

export function zoomToFit(store: SceneStore) {
  const snap = store.getSnapshot()
  const bounds = unionRects(childrenOf(snap, null).map((id) => worldBounds(snap, id)))
  if (bounds) ui().setViewport(fitRect(bounds, ui().canvasSize, 72, 1))
}

export function zoomToSelection(store: SceneStore) {
  const bounds = selectionBounds(store.getSnapshot(), ui().selection)
  if (bounds) ui().setViewport(fitRect(bounds, ui().canvasSize, 96, 4))
  else zoomToFit(store)
}

// --- creation ----------------------------------------------------------------

function localPoint(store: SceneStore, parentId: NodeId | null, world: Point): Point {
  const snap = store.getSnapshot()
  return apply(invert(parentId ? worldMatrix(snap, parentId) : IDENTITY), world)
}

/** Creates a text node with its top-left at `world`. A `width` makes it wrap. */
export function createTextAt(store: SceneStore, world: Point, text: string, width?: number): NodeId {
  const parentId = frameAt(store.getSnapshot(), world)
  const local = localPoint(store, parentId, world)
  const autoResize: TextAutoResize = width ? 'height' : 'width'
  const size = measureText({ ...NODE_DEFAULTS.text, text, autoResize, width: width ?? 0 })
  return createNode(store, {
    type: 'text',
    parentId,
    props: { text, autoResize, x: Math.round(local.x), y: Math.round(local.y), ...size },
  })
}

export async function placeImages(store: SceneStore, files: File[], at: Point = viewportCenterWorld()) {
  const created: NodeId[] = []
  for (const [i, file] of files.entries()) {
    let asset
    try {
      asset = await importImageFile(file)
    } catch {
      continue
    }
    addAsset(store, asset)
    const parentId = frameAt(store.getSnapshot(), at)
    const local = localPoint(store, parentId, at)
    const scale = Math.min(1, 480 / Math.max(asset.width, asset.height))
    const width = Math.round(asset.width * scale)
    const height = Math.round(asset.height * scale)
    created.push(
      createNode(store, {
        type: 'image',
        parentId,
        props: {
          name: file.name.replace(/\.[^.]+$/, '') || 'Image',
          assetId: asset.id,
          x: Math.round(local.x - width / 2 + i * 24),
          y: Math.round(local.y - height / 2 + i * 24),
          width,
          height,
        },
      }),
    )
  }
  if (created.length) {
    ui().setSelection(created)
    ui().setTool('select')
  }
}

export function pickImages(store: SceneStore) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = () => {
    if (input.files?.length) void placeImages(store, [...input.files])
  }
  input.click()
}

// --- clipboard -----------------------------------------------------------------

/** Last copied layers, for menu-driven paste (reading the system clipboard needs a permission prompt). */
let clipboard: ClipboardPayload | null = null
/** Pastes of the current copy so far; each lands a step further down-right. */
let pasteCount = 0
/** Set when a native paste event arrives, so the keyboard fallback stands down. */
let pasteHandled = true

export function hasClipboard(): boolean {
  return clipboard !== null
}

export function copySelection(store: SceneStore, data: DataTransfer): boolean {
  const ids = selected(store)
  if (ids.length === 0) return false
  clipboard = serializeNodes(store.getSnapshot(), ids)
  pasteCount = 0
  data.setData('text/plain', JSON.stringify(clipboard))
  return true
}

/**
 * Copy without a clipboard event (menus, and the keyboard path in case the
 * browser doesn't deliver one): keeps an in-app copy and mirrors it to the
 * system clipboard for other tabs.
 */
export function copyToClipboard(store: SceneStore): boolean {
  const ids = selected(store)
  if (ids.length === 0) return false
  clipboard = serializeNodes(store.getSnapshot(), ids)
  pasteCount = 0
  void navigator.clipboard?.writeText(JSON.stringify(clipboard)).catch(() => {})
  return true
}

/** Ctrl/Cmd+V: if no paste event follows (focus quirks, blocked clipboard), paste the in-app copy. */
export function armPasteFallback(store: SceneStore) {
  pasteHandled = false
  window.setTimeout(() => {
    if (!pasteHandled && clipboard) pastePayload(store, clipboard)
    pasteHandled = true
  }, 60)
}

export function openExport() {
  ui().setEditing(null)
  ui().setExportOpen(true)
}

function payloadBounds(payload: ClipboardPayload) {
  const roots = payload.nodes.filter((n) => payload.roots.includes(n.id) && n.type !== 'group')
  return unionRects(roots.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height })))
}

/** Pastes the last copy centered on a world point, into the frame under it. */
export function pasteAt(store: SceneStore, world: Point | null) {
  if (!clipboard) return
  if (!world) return pastePayload(store, clipboard)
  const bounds = payloadBounds(clipboard)
  const offset = bounds
    ? { x: Math.round(world.x - bounds.x - bounds.width / 2), y: Math.round(world.y - bounds.y - bounds.height / 2) }
    : { x: 0, y: 0 }
  ui().setSelection(pasteNodes(store, clipboard, frameAt(store.getSnapshot(), world), { offset }))
}

export function pasteData(store: SceneStore, data: DataTransfer) {
  pasteHandled = true
  const images = [...data.files].filter((f) => f.type.startsWith('image/'))
  if (images.length) {
    void placeImages(store, images)
    return
  }
  const text = data.getData('text/plain')
  if (!text) {
    if (clipboard) pastePayload(store, clipboard)
    return
  }
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    // plain text, handled below
  }
  if (isClipboardPayload(parsed)) {
    clipboard = parsed
    pastePayload(store, parsed)
  } else ui().setSelection([createTextAt(store, viewportCenterWorld(), text.slice(0, 5000))])
}

/** Pastes in place, or centered in view when the original spot is off-screen. */
function pastePayload(store: SceneStore, payload: ClipboardPayload) {
  const snap = store.getSnapshot()
  const sel = selected(store)
  const target =
    sel.length === 1 && snap.nodes.get(sel[0])?.type === 'frame' ? sel[0] : sel.length ? parentOf(snap, sel[0]) : null

  const bounds = payloadBounds(payload)
  const { viewport, canvasSize } = ui()
  const view = { ...screenToWorld(viewport, { x: 0, y: 0 }), width: canvasSize.width / viewport.zoom, height: canvasSize.height / viewport.zoom }
  // Step each paste down-right so a copy never hides exactly on top of its original.
  pasteCount++
  let offset = { x: 20 * pasteCount, y: 20 * pasteCount }
  // An unmeasured canvas (0×0) has no view to be off-screen from.
  if (bounds && canvasSize.width > 0 && canvasSize.height > 0 && !rectsIntersect(bounds, view)) {
    const center = viewportCenterWorld()
    offset = { x: Math.round(center.x - bounds.x - bounds.width / 2), y: Math.round(center.y - bounds.y - bounds.height / 2) }
  }
  ui().setSelection(pasteNodes(store, payload, target, { offset }))
}

// --- layout, preview & motion ---------------------------------------------------

export function alignSelection(store: SceneStore, edge: AlignEdge) {
  alignNodes(store, selected(store), edge)
}

export function distributeSelection(store: SceneStore, axis: 'horizontal' | 'vertical') {
  distributeNodes(store, selected(store), axis)
}

/** Opens Preview on the canvas-level frame holding the selection, or the first frame. */
export function openPreview(store: SceneStore) {
  const snap = store.getSnapshot()
  const first = ui().selection.find((id) => snap.nodes.has(id))
  const top = first ? pathTo(snap, first)[0] : undefined
  const frameId =
    top && snap.nodes.get(top)?.type === 'frame'
      ? top
      : childrenOf(snap, null).find((id) => snap.nodes.get(id)?.type === 'frame')
  if (!frameId) return
  ui().setEditing(null)
  ui().setPreview({ frameId })
}

/** Plays appear animations on the canvas for the selection (or everything). */
export function playAppear(store: SceneStore) {
  const snap = store.getSnapshot()
  const sel = ui().selection
  return playAppearOnCanvas(snap, sel.length ? sel : [...childrenOf(snap, null)])
}

export function exportSelectionPng(store: SceneStore) {
  const [id] = selected(store)
  if (id) exportNodePng(id, store.getNode(id)?.name ?? 'layer', ui().viewport.zoom)
}
