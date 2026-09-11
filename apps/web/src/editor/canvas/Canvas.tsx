import {
  apply,
  applyPatches,
  childrenOf,
  createNode,
  descendantsOf,
  frameAt,
  hitTest,
  IDENTITY,
  invert,
  moveNodes,
  NODE_DEFAULTS,
  nodesInRect,
  normalizeSelection,
  parentOf,
  patchesForTranslate,
  duplicateNodes,
  selectionBounds,
  snapPoint,
  snapRect,
  snapTargets,
  worldMatrix,
  type Guide,
  type NodeId,
  type NodePatch,
  type Point,
  type Rect,
  type SceneSnapshot,
  type SnapTargets,
} from '@codeframe/scene'
import Konva from 'konva'
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Layer, Stage } from 'react-konva'
import { createTextAt, placeImages, zoomToFit } from '../commands'
import { useSceneStore } from '../scene-context'
import { drillTarget, resolveTarget } from '../selection'
import { useUI } from '../ui-store'
import { screenToWorld, zoomAround } from '../viewport'
import { frameLabels, hitFrameLabel } from './labels'
import { NodeList } from './NodeView'
import { Overlay } from './Overlay'
import { TextEditor } from './TextEditor'

const DRAG_THRESHOLD = 3
/** Screen pixels of slop when hit-testing thin or small nodes. */
const HIT_SLOP = 4
const GRID = 24
/** Screen pixels within which smart guides pull. Hold Ctrl/Cmd to move freely. */
const SNAP_DISTANCE = 6

interface TrackHandlers {
  move?: (ev: PointerEvent, screen: Point) => void
  up?: (ev: PointerEvent, screen: Point, moved: boolean) => void
}

function nearestFrame(snap: SceneSnapshot, id: NodeId): NodeId | null {
  for (let p = parentOf(snap, id); p !== null; p = parentOf(snap, p)) {
    if (snap.nodes.get(p)?.type === 'frame') return p
  }
  return null
}

export function Canvas() {
  const store = useSceneStore()
  const container = useRef<HTMLDivElement>(null)
  const stage = useRef<Konva.Stage>(null)
  const viewport = useUI((s) => s.viewport)
  const size = useUI((s) => s.canvasSize)
  const tool = useUI((s) => s.tool)
  const spaceHeld = useUI((s) => s.spaceHeld)
  const [grabbing, setGrabbing] = useState(false)

  useEffect(() => {
    const el = container.current!
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      useUI.getState().setCanvasSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || size.width === 0) return
    fitted.current = true
    zoomToFit(store)
  }, [size.width, store])

  // Wheel pans; Ctrl/Cmd+wheel and trackpad pinch zoom around the pointer.
  useEffect(() => {
    const el = container.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      const { setViewport } = useUI.getState()
      if (e.ctrlKey || e.metaKey) {
        const clamped = Math.max(-60, Math.min(60, dy))
        setViewport((v) => zoomAround(v, screen, v.zoom * Math.exp(-clamped * 0.006)))
      } else if (e.shiftKey && dx === 0) {
        setViewport((v) => ({ ...v, x: v.x - dy }))
      } else {
        setViewport((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toScreen = (e: { clientX: number; clientY: number }): Point => {
    const rect = container.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const track = (start: ReactPointerEvent, handlers: TrackHandlers) => {
    const origin = toScreen(start)
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const screen = toScreen(ev)
      if (!moved && Math.hypot(screen.x - origin.x, screen.y - origin.y) < DRAG_THRESHOLD) return
      moved = true
      handlers.move?.(ev, screen)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      handlers.up?.(ev, toScreen(ev), moved)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  /** The click target under a screen point, frame captions included. */
  const pick = (screen: Point, deep: boolean): { target: NodeId | null; chain: NodeId[]; onLabel: boolean } => {
    const snap = store.getSnapshot()
    const { viewport, selection } = useUI.getState()
    const labelId = hitFrameLabel(frameLabels(snap, viewport), screen)
    if (labelId) return { target: labelId, chain: [labelId], onLabel: true }
    const chain = hitTest(snap, screenToWorld(viewport, screen), HIT_SLOP / viewport.zoom)
    return { target: resolveTarget(snap, chain, selection, deep), chain, onLabel: false }
  }

  const startPan = (e: ReactPointerEvent) => {
    const start = useUI.getState().viewport
    const origin = toScreen(e)
    setGrabbing(true)
    track(e, {
      move: (_, s) => useUI.getState().setViewport({ ...start, x: start.x + s.x - origin.x, y: start.y + s.y - origin.y }),
      up: () => setGrabbing(false),
    })
  }

  const startMarquee = (e: ReactPointerEvent, startWorld: Point, scopeId: NodeId | null, base: NodeId[]) => {
    useUI.getState().setSelection(base)
    track(e, {
      move: (_, s) => {
        const { viewport, setMarquee, setSelection } = useUI.getState()
        const w = screenToWorld(viewport, s)
        const rect = {
          x: Math.min(startWorld.x, w.x),
          y: Math.min(startWorld.y, w.y),
          width: Math.abs(w.x - startWorld.x),
          height: Math.abs(w.y - startWorld.y),
        }
        setMarquee(rect)
        const snap = store.getSnapshot()
        setSelection(normalizeSelection(snap, [...base, ...nodesInRect(snap, rect, scopeId)]))
      },
      up: (_, __, moved) => {
        const { setMarquee, setSelection } = useUI.getState()
        setMarquee(null)
        if (!moved && scopeId) setSelection([scopeId])
      },
    })
  }

  /**
   * Moves nodes, snapping the selection box to smart guides (Ctrl/Cmd moves
   * freely) and Alt-dragging a duplicate. On drop, nodes dragged into or out of
   * a frame are reparented. The whole drag is one undo step.
   */
  const startMove = (e: ReactPointerEvent, ids: NodeId[], startWorld: Point, clickTarget: NodeId | null) => {
    let startSnap = store.getSnapshot()
    let movable = ids.filter((id) => startSnap.nodes.get(id) && !startSnap.nodes.get(id)!.locked)
    const update = store.beginGesture()
    let targets: SnapTargets | null = null
    let startBox: Rect | null = null
    let duplicated = false
    track(e, {
      move: (ev, s) => {
        if (movable.length === 0) return
        if (ev.altKey && !duplicated) {
          duplicated = true
          update(() => {
            movable = duplicateNodes(store, movable, { inPlace: true })
          })
          startSnap = store.getSnapshot()
          useUI.getState().setSelection(movable)
        }
        if (!targets) {
          const exclude = new Set(movable.flatMap((id) => [id, ...descendantsOf(startSnap, id)]))
          targets = snapTargets(startSnap, movable.map((id) => parentOf(startSnap, id)), exclude)
          startBox = selectionBounds(startSnap, movable)
        }
        const { viewport, setHover, setGuides } = useUI.getState()
        const w = screenToWorld(viewport, s)
        let dx = Math.round(w.x - startWorld.x)
        let dy = Math.round(w.y - startWorld.y)
        const lockY = ev.shiftKey && Math.abs(dx) > Math.abs(dy)
        const lockX = ev.shiftKey && !lockY
        if (lockY) dy = 0
        if (lockX) dx = 0
        let guides: Guide[] = []
        if (startBox && !(ev.ctrlKey || ev.metaKey)) {
          const snapped = snapRect({ ...startBox, x: startBox.x + dx, y: startBox.y + dy }, targets, SNAP_DISTANCE / viewport.zoom)
          if (!lockX) dx += snapped.dx
          if (!lockY) dy += snapped.dy
          guides = snapped.guides.filter((g) => (g.axis === 'x' ? !lockX : !lockY))
        }
        setHover(null)
        setGuides(guides)
        update(() => applyPatches(store, patchesForTranslate(startSnap, movable, dx, dy)))
      },
      up: (_, s, moved) => {
        useUI.getState().setGuides([])
        if (!moved) {
          if (clickTarget) useUI.getState().setSelection([clickTarget])
          return
        }
        if (movable.length === 0) return
        const snap = store.getSnapshot()
        const dragged = new Set(movable.flatMap((id) => [id, ...descendantsOf(snap, id)]))
        const drop = frameAt(snap, screenToWorld(useUI.getState().viewport, s), dragged)
        const leaving = movable.filter((id) => nearestFrame(snap, id) !== drop)
        if (leaving.length) update(() => moveNodes(store, leaving, drop, childrenOf(snap, drop).length))
      },
    })
  }

  const startSelect = (e: ReactPointerEvent, screen: Point, world: Point) => {
    const snap = store.getSnapshot()
    const state = useUI.getState()
    const sel = state.selection
    const { target, chain, onLabel } = pick(screen, e.ctrlKey || e.metaKey)

    if (target === null) return startMarquee(e, world, null, e.shiftKey ? sel : [])

    // Dragging on the empty body of a canvas-level frame selects inside it.
    const frameBody =
      !onLabel &&
      chain.length === 1 &&
      snap.nodes.get(target)?.type === 'frame' &&
      parentOf(snap, target) === null &&
      childrenOf(snap, target).length > 0 &&
      !sel.includes(target)
    if (frameBody) return startMarquee(e, world, target, e.shiftKey ? sel : [])

    if (e.shiftKey) {
      const next = sel.includes(target) ? sel.filter((id) => id !== target) : normalizeSelection(snap, [...sel, target])
      state.setSelection(next)
      if (next.includes(target)) startMove(e, next, world, null)
      return
    }
    if (sel.includes(target)) return startMove(e, sel, world, sel.length > 1 ? target : null)
    state.setSelection([target])
    startMove(e, [target], world, null)
  }

  const startCreate = (e: ReactPointerEvent, type: 'frame' | 'rect' | 'ellipse', startWorld: Point) => {
    const snap = store.getSnapshot()
    const parentId = frameAt(snap, startWorld)
    const toLocal = invert(parentId ? worldMatrix(snap, parentId) : IDENTITY)
    const targets = snapTargets(snap, [parentId], new Set())
    const threshold = SNAP_DISTANCE / useUI.getState().viewport.zoom
    const a = apply(toLocal, e.ctrlKey || e.metaKey ? startWorld : snapPoint(startWorld, targets, threshold))
    const update = store.beginGesture()
    let id: NodeId | null = null
    const place = (box: NodePatch) =>
      update(() => {
        if (id === null) id = createNode(store, { type, parentId, props: box })
        else applyPatches(store, [[id, box]])
      })

    track(e, {
      move: (ev, s) => {
        const raw = screenToWorld(useUI.getState().viewport, s)
        const snapped = ev.ctrlKey || ev.metaKey ? { ...raw, guides: [] } : snapPoint(raw, targets, threshold)
        useUI.getState().setGuides(snapped.guides)
        const b = apply(toLocal, snapped)
        let w = b.x - a.x
        let h = b.y - a.y
        if (ev.shiftKey) {
          const side = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w || 1) * side
          h = Math.sign(h || 1) * side
        }
        place({
          x: Math.round(Math.min(a.x, a.x + w)),
          y: Math.round(Math.min(a.y, a.y + h)),
          width: Math.max(1, Math.round(Math.abs(w))),
          height: Math.max(1, Math.round(Math.abs(h))),
        })
        if (id) useUI.getState().setSelection([id])
      },
      up: (_, __, moved) => {
        useUI.getState().setGuides([])
        if (!moved) place({ x: Math.round(a.x), y: Math.round(a.y), width: 100, height: 100 })
        const state = useUI.getState()
        if (id) state.setSelection([id])
        state.setTool('select')
      },
    })
  }

  const startText = (e: ReactPointerEvent, startWorld: Point) => {
    track(e, {
      up: (_, s, moved) => {
        const state = useUI.getState()
        const end = screenToWorld(state.viewport, s)
        const width = moved ? Math.round(Math.abs(end.x - startWorld.x)) : 0
        const lineBox = NODE_DEFAULTS.text.fontSize * NODE_DEFAULTS.text.lineHeight
        const origin = moved
          ? { x: Math.min(startWorld.x, end.x), y: Math.min(startWorld.y, end.y) }
          : { x: startWorld.x, y: startWorld.y - lineBox / 2 }
        const id = createTextAt(store, origin, '', width > 8 ? width : undefined)
        state.setSelection([id])
        state.setEditing({ id, isNew: true })
        state.setTool('select')
      },
    })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const screen = toScreen(e)
    // Transformer handles belong to Konva.
    if (stage.current?.getIntersection(screen)?.getParent() instanceof Konva.Transformer) return
    const state = useUI.getState()
    if (e.button === 1 || (e.button === 0 && (state.tool === 'hand' || state.spaceHeld))) return startPan(e)
    if (e.button !== 0) return
    const world = screenToWorld(state.viewport, screen)
    if (state.tool === 'text') return startText(e, world)
    if (state.tool === 'frame' || state.tool === 'rect' || state.tool === 'ellipse') return startCreate(e, state.tool, world)
    if (state.tool === 'select') startSelect(e, screen, world)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = useUI.getState()
    const screen = toScreen(e)
    state.setPointerWorld(screenToWorld(state.viewport, screen))
    if (e.buttons !== 0) return
    if (state.tool !== 'select' || state.spaceHeld) return state.setHover(null)
    state.setHover(pick(screen, e.ctrlKey || e.metaKey).target)
  }

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const state = useUI.getState()
    if (state.tool !== 'select') return
    const { chain } = pick(toScreen(e), false)
    const snap = store.getSnapshot()
    const sel = state.selection
    if (sel.length === 1 && chain.includes(sel[0]) && snap.nodes.get(sel[0])?.type === 'text') {
      state.setEditing({ id: sel[0], isNew: false })
      return
    }
    const deeper = drillTarget(chain, sel)
    if (deeper) state.setSelection([deeper])
  }

  const cursor = grabbing
    ? 'grabbing'
    : tool === 'hand' || spaceHeld
      ? 'grab'
      : tool === 'text'
        ? 'text'
        : tool === 'select'
          ? 'default'
          : 'crosshair'

  const spacing = GRID * viewport.zoom
  const gridOpacity = Math.max(0, Math.min(1, (viewport.zoom - 0.25) / 0.15))

  return (
    <div
      ref={container}
      className="relative min-w-0 flex-1 touch-none overflow-hidden bg-desk select-none"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        useUI.getState().setHover(null)
        useUI.getState().setPointerWorld(null)
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        const state = useUI.getState()
        if (state.tool !== 'select') state.setTool('select')
        const screen = toScreen(e)
        const { target } = pick(screen, e.ctrlKey || e.metaKey)
        if (target === null) state.setSelection([])
        else if (!state.selection.includes(target)) state.setSelection([target])
        state.setContextMenu({ x: e.clientX, y: e.clientY, world: screenToWorld(state.viewport, screen) })
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
        if (files.length === 0) return
        e.preventDefault()
        void placeImages(store, files, screenToWorld(useUI.getState().viewport, toScreen(e)))
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: gridOpacity,
          backgroundImage: 'radial-gradient(circle, var(--color-desk-dot) 1px, transparent 1.3px)',
          backgroundSize: `${spacing}px ${spacing}px`,
          backgroundPosition: `${viewport.x - spacing / 2}px ${viewport.y - spacing / 2}px`,
        }}
      />
      {size.width > 0 && size.height > 0 && (
        <Stage ref={stage} width={size.width} height={size.height} style={{ position: 'absolute', inset: 0 }}>
          <Layer listening={false} x={viewport.x} y={viewport.y} scaleX={viewport.zoom} scaleY={viewport.zoom}>
            <NodeList parentId={null} />
          </Layer>
          <Overlay />
        </Stage>
      )}
      <TextEditor />
    </div>
  )
}
