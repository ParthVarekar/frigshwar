import type { Guide, NodeId, Point, Rect } from '@codeframe/scene'
import { create } from 'zustand'

/** Per-client editor state. Nothing here is part of the shared document. */

export type Tool = 'select' | 'hand' | 'frame' | 'rect' | 'ellipse' | 'text'

export type PanelTab = 'design' | 'animate'

/** screen = world · zoom + (x, y) */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface TextEditing {
  id: NodeId
  /** Created by this edit: typing folds into the creation's undo step. */
  isNew: boolean
}

export interface ContextMenuState {
  /** Client coordinates. */
  x: number
  y: number
  /** World point under the cursor when opened on the canvas. */
  world: Point | null
}

interface UIState {
  tool: Tool
  selection: NodeId[]
  hoverId: NodeId | null
  editing: TextEditing | null
  viewport: Viewport
  canvasSize: { width: number; height: number }
  /** World-space marquee while dragging a selection box. */
  marquee: Rect | null
  /** World-space smart guides while snapping. */
  guides: Guide[]
  expanded: ReadonlySet<NodeId>
  spaceHeld: boolean
  pointerWorld: Point | null
  panelTab: PanelTab
  preview: { frameId: NodeId } | null
  contextMenu: ContextMenuState | null

  setTool: (tool: Tool) => void
  setSelection: (ids: NodeId[]) => void
  setHover: (id: NodeId | null) => void
  setEditing: (editing: TextEditing | null) => void
  setViewport: (next: Viewport | ((prev: Viewport) => Viewport)) => void
  setCanvasSize: (size: { width: number; height: number }) => void
  setMarquee: (rect: Rect | null) => void
  setGuides: (guides: Guide[]) => void
  setExpanded: (id: NodeId, open: boolean) => void
  expandAll: (ids: Iterable<NodeId>) => void
  setSpaceHeld: (held: boolean) => void
  setPointerWorld: (point: Point | null) => void
  setPanelTab: (tab: PanelTab) => void
  setPreview: (preview: { frameId: NodeId } | null) => void
  setContextMenu: (menu: ContextMenuState | null) => void
}

export const useUI = create<UIState>()((set) => ({
  tool: 'select',
  selection: [],
  hoverId: null,
  editing: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  canvasSize: { width: 0, height: 0 },
  marquee: null,
  guides: [],
  expanded: new Set(),
  spaceHeld: false,
  pointerWorld: null,
  panelTab: 'design',
  preview: null,
  contextMenu: null,

  setTool: (tool) => set({ tool }),
  setSelection: (ids) => set((s) => (sameIds(s.selection, ids) ? s : { selection: ids })),
  setHover: (hoverId) => set((s) => (s.hoverId === hoverId ? s : { hoverId })),
  setEditing: (editing) => set({ editing }),
  setViewport: (next) => set((s) => ({ viewport: typeof next === 'function' ? next(s.viewport) : next })),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setMarquee: (marquee) => set({ marquee }),
  setGuides: (guides) => set((s) => (s.guides.length === 0 && guides.length === 0 ? s : { guides })),
  setExpanded: (id, open) =>
    set((s) => {
      const expanded = new Set(s.expanded)
      if (open) expanded.add(id)
      else expanded.delete(id)
      return { expanded }
    }),
  expandAll: (ids) =>
    set((s) => {
      const missing = [...ids].filter((id) => !s.expanded.has(id))
      return missing.length ? { expanded: new Set([...s.expanded, ...missing]) } : s
    }),
  setSpaceHeld: (spaceHeld) => set((s) => (s.spaceHeld === spaceHeld ? s : { spaceHeld })),
  setPointerWorld: (pointerWorld) => set({ pointerWorld }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setPreview: (preview) => set({ preview, contextMenu: null, hoverId: null }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
}))

function sameIds(a: readonly NodeId[], b: readonly NodeId[]) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}
