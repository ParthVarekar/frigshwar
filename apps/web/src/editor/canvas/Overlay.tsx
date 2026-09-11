import {
  applyPatches,
  decompose,
  descendantsOf,
  fromPosition,
  multiply,
  parentOf,
  patchesForBox,
  pinSizing,
  selectionBounds,
  snapPoint,
  snapTargets,
  worldBounds,
  worldBox,
  worldCorners,
  type Guide,
  type NodeId,
  type PatchMap,
  type Point,
  type SceneSnapshot,
  type SnapTargets,
} from '@codeframe/scene'
import { getSpec } from '@codeframe/library'
import type Konva from 'konva'
import { useLayoutEffect, useRef, useState } from 'react'
import { constrainComponentPatches } from '../library'
import { Circle, Group, Label, Layer, Line, Rect, Shape, Tag, Text, Transformer } from 'react-konva'
import { useScene, useSceneStore } from '../scene-context'
import { adjustTextResize } from '../edits'
import { INK, INK_2, MARQUEE_FILL, MONO_FONT, PAPER, PENCIL } from '../theme'
import { useTimeline } from '../timeline/timeline-store'
import { useUI, type Viewport } from '../ui-store'
import { screenToWorld, viewportMatrix, worldToScreen } from '../viewport'
import { frameLabels, LABEL_FONT_FAMILY, LABEL_FONT_SIZE, LABEL_GAP, LABEL_HEIGHT } from './labels'

/**
 * Canvas marks drawn in screen space so line weights and type stay constant at
 * any zoom. Marks never animate: they land like ink.
 */
export function Overlay() {
  const snap = useScene()
  const viewport = useUI((s) => s.viewport)
  const selection = useUI((s) => s.selection)
  const hoverId = useUI((s) => s.hoverId)
  const marquee = useUI((s) => s.marquee)
  const editing = useUI((s) => s.editing)
  const guides = useUI((s) => s.guides)
  const showLinks = useUI((s) => s.panelTab === 'animate')
  const linkDraft = useUI((s) => s.linkDraft)
  // Layers drawn mid-animation aren't where their base geometry is; don't offer handles for it.
  const scrubbing = useTimeline((s) => s.open && s.clipId !== null && (s.playing || s.time > 0))
  const selected = new Set(selection)

  return (
    <Layer>
      {frameLabels(snap, viewport).map((label) => (
        <Text
          key={label.id}
          x={label.x}
          y={label.y}
          rotation={label.rotation}
          offsetY={LABEL_GAP + LABEL_HEIGHT}
          width={label.width + 2}
          height={LABEL_HEIGHT}
          verticalAlign="middle"
          wrap="none"
          text={label.text}
          fontFamily={LABEL_FONT_FAMILY}
          fontStyle="italic"
          fontSize={LABEL_FONT_SIZE}
          fill={selected.has(label.id) ? INK : INK_2}
          listening={false}
        />
      ))}

      {hoverId && !selected.has(hoverId) && snap.nodes.has(hoverId) && (
        <Outline snap={snap} viewport={viewport} id={hoverId} stroke={PENCIL} />
      )}
      {selection.map(
        (id) => snap.nodes.has(id) && <Outline key={id} snap={snap} viewport={viewport} id={id} stroke={INK} />,
      )}

      <SelectionTransformer snap={snap} viewport={viewport} selection={selection} hidden={editing !== null || scrubbing} />
      {editing === null && <DimensionTag snap={snap} viewport={viewport} selection={selection} />}

      {marquee && <MarqueeMark viewport={viewport} rect={marquee} />}
      {showLinks && <Connectors snap={snap} viewport={viewport} selection={selection} />}
      {showLinks && !linkDraft && editing === null && selection.length === 1 && snap.nodes.has(selection[0]) && (
        <LinkHandle snap={snap} viewport={viewport} id={selection[0]} />
      )}
      {linkDraft && snap.nodes.has(linkDraft.from) && <LinkDraftMark snap={snap} viewport={viewport} draft={linkDraft} />}
      {guides.map((guide) => (
        <GuideMark key={`${guide.axis}:${guide.value}`} viewport={viewport} guide={guide} />
      ))}
    </Layer>
  )
}

/** Half-pixel snapping keeps 1px hairlines crisp. */
const crisp = (n: number) => Math.round(n) + 0.5

function Outline(props: { snap: SceneSnapshot; viewport: Viewport; id: NodeId; stroke: string; inset?: number }) {
  const inset = props.inset ?? 0
  const corners = worldCorners(props.snap, props.id).map((p) => worldToScreen(props.viewport, p))
  const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4
  const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4
  const points = corners.flatMap((s) => {
    // Pull each corner toward the center by `inset` screen px (a second, inner line).
    const d = Math.hypot(s.x - cx, s.y - cy) || 1
    return [crisp(s.x - ((s.x - cx) / d) * inset), crisp(s.y - ((s.y - cy) / d) * inset)]
  })
  return <Line points={points} closed stroke={props.stroke} strokeWidth={1} listening={false} perfectDrawEnabled={false} />
}

interface TransformGesture {
  update: (fn: () => void) => void
  snap: SceneSnapshot
  viewport: Viewport
  /** Smart-guide lines; null when the selection is rotated (edges aren't axis-aligned). */
  targets: SnapTargets | null
}

const SNAP_DISTANCE = 6

const ALL_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']
const WIDTH_ANCHORS = ['middle-left', 'middle-right']

/** Konva name of the prototype connection handle; the canvas starts a link drag when it's pressed. */
export const LINK_HANDLE = 'link-handle'
const HANDLE_GAP = 16

/**
 * Konva's Transformer drives invisible proxy rects, one per selected node, that
 * mirror each node's world box. Every transform frame maps the proxies back to
 * document patches, computed from the snapshot at gesture start. During the
 * gesture the proxies render from that frozen snapshot so React doesn't fight
 * Konva's internal state, then remount (new epoch) from the committed result.
 */
function SelectionTransformer(props: { snap: SceneSnapshot; viewport: Viewport; selection: NodeId[]; hidden: boolean }) {
  const store = useSceneStore()
  const transformer = useRef<Konva.Transformer>(null)
  const proxies = useRef(new Map<NodeId, Konva.Rect>())
  const gesture = useRef<TransformGesture | null>(null)
  const [frozen, setFrozen] = useState<{ snap: SceneSnapshot; viewport: Viewport } | null>(null)
  const [epoch, setEpoch] = useState(0)

  const snap = frozen?.snap ?? props.snap
  const viewport = frozen?.viewport ?? props.viewport
  const ids = props.selection.filter((id) => {
    const node = snap.nodes.get(id)
    return node && node.visible && !node.locked
  })
  const idsKey = ids.join('|')
  // Library components limit which edges resize: fixed-size ones none, content-sized ones only width.
  const resizeModes = ids.map((id) => {
    const node = snap.nodes.get(id)
    return node?.type === 'component' ? (getSpec(node.component)?.resize ?? 'both') : 'both'
  })
  const enabledAnchors = resizeModes.includes('none') ? [] : resizeModes.includes('width') ? WIDTH_ANCHORS : ALL_ANCHORS

  useLayoutEffect(() => {
    const tr = transformer.current
    if (!tr) return
    tr.nodes(idsKey ? idsKey.split('|').flatMap((id) => proxies.current.get(id) ?? []) : [])
    tr.getLayer()?.batchDraw()
  }, [idsKey, epoch])

  const onTransformStart = () => {
    const start = { snap: store.getSnapshot(), viewport: useUI.getState().viewport }
    const axisAligned = ids.every((id) => decompose(worldBox(start.snap, id).matrix).rotation === 0)
    const exclude = new Set(ids.flatMap((id) => [id, ...descendantsOf(start.snap, id)]))
    const targets = axisAligned
      ? snapTargets(start.snap, ids.map((id) => parentOf(start.snap, id)), exclude)
      : null
    gesture.current = { ...start, targets, update: store.beginGesture() }
    setFrozen(start)
  }

  // Pulls the dragged handle onto smart guides. Ctrl/Cmd resizes freely.
  const snapAnchor = (_: Point, next: Point, evt: unknown): Point => {
    const g = gesture.current
    const anchor = transformer.current?.getActiveAnchor() ?? ''
    const free = evt instanceof MouseEvent && (evt.ctrlKey || evt.metaKey)
    if (!g?.targets || free || anchor === 'rotater') {
      useUI.getState().setGuides([])
      return next
    }
    const lines = {
      x: /left|right/.test(anchor) ? g.targets.x : [],
      y: /top|bottom/.test(anchor) ? g.targets.y : [],
    }
    const snapped = snapPoint(screenToWorld(g.viewport, next), lines, SNAP_DISTANCE / g.viewport.zoom)
    useUI.getState().setGuides(snapped.guides)
    return worldToScreen(g.viewport, snapped)
  }

  const onTransform = () => {
    const g = gesture.current
    if (!g) return
    const patches: PatchMap = new Map()
    for (const id of ids) {
      const proxy = proxies.current.get(id)
      if (!proxy) continue
      // Snap to whole pixels (origins only when unrotated) so exported code gets clean numbers.
      const rotation = proxy.rotation()
      const raw = screenToWorld(g.viewport, { x: proxy.x(), y: proxy.y() })
      const origin = rotation === 0 ? { x: Math.round(raw.x), y: Math.round(raw.y) } : raw
      patchesForBox(
        g.snap,
        id,
        {
          matrix: fromPosition(origin.x, origin.y, rotation),
          width: Math.max(1, Math.round((proxy.width() * proxy.scaleX()) / g.viewport.zoom)),
          height: Math.max(1, Math.round((proxy.height() * proxy.scaleY()) / g.viewport.zoom)),
        },
        patches,
      )
      adjustTextResize(g.snap, id, patches)
    }
    pinSizing(g.snap, patches)
    constrainComponentPatches(store, g.snap, patches)
    g.update(() => applyPatches(store, patches))
  }

  const onTransformEnd = () => {
    useUI.getState().setGuides([])
    gesture.current = null
    setFrozen(null)
    setEpoch((e) => e + 1)
  }

  return (
    <>
      {ids.map((id) => {
        const box = worldBox(snap, id)
        const screen = decompose(multiply(viewportMatrix(viewport), box.matrix))
        return (
          <Rect
            key={`${id}:${epoch}`}
            ref={(node) => {
              if (node) proxies.current.set(id, node)
              else proxies.current.delete(id)
            }}
            x={screen.x}
            y={screen.y}
            rotation={screen.rotation}
            width={box.width * viewport.zoom}
            height={box.height * viewport.zoom}
            listening={false}
          />
        )
      })}
      <Transformer
        ref={transformer}
        visible={!props.hidden && ids.length > 0}
        enabledAnchors={enabledAnchors}
        keepRatio={false}
        flipEnabled={false}
        ignoreStroke
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        rotationSnapTolerance={3}
        rotateAnchorOffset={22}
        anchorSize={7}
        anchorFill={INK}
        anchorStroke={PAPER}
        anchorStrokeWidth={1}
        anchorCornerRadius={0}
        borderStroke={INK}
        borderStrokeWidth={1}
        anchorStyleFunc={(anchor) => {
          if (anchor.hasName('rotater')) {
            anchor.width(9)
            anchor.height(9)
            anchor.offsetX(4.5)
            anchor.offsetY(4.5)
            anchor.cornerRadius(4.5)
          }
        }}
        boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 1 || Math.abs(newBox.height) < 1 ? oldBox : newBox)}
        anchorDragBoundFunc={snapAnchor}
        onTransformStart={onTransformStart}
        onTransform={onTransform}
        onTransformEnd={onTransformEnd}
      />
    </>
  )
}

function formatSize(n: number): string {
  return String(Math.round(n * 10) / 10)
}

function DimensionTag(props: { snap: SceneSnapshot; viewport: Viewport; selection: NodeId[] }) {
  const ids = props.selection.filter((id) => props.snap.nodes.has(id))
  const bounds = selectionBounds(props.snap, ids)
  if (!bounds) return null
  const size = ids.length === 1 ? worldBox(props.snap, ids[0]) : bounds
  const text = `${formatSize(size.width)} × ${formatSize(size.height)}`
  const anchor = worldToScreen(props.viewport, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height })
  const tagWidth = text.length * 6.6 + 8
  return (
    <Label x={Math.round(anchor.x - tagWidth / 2)} y={Math.round(anchor.y + 9)} listening={false}>
      <Tag fill={INK} cornerRadius={2} />
      <Text text={text} fontFamily={MONO_FONT} fontSize={11} fill={PAPER} padding={4} />
    </Label>
  )
}

/** Smart guide: a pencil line across the aligned edges. */
function GuideMark({ viewport, guide }: { viewport: Viewport; guide: Guide }) {
  const vertical = guide.axis === 'x'
  const a = worldToScreen(viewport, vertical ? { x: guide.value, y: guide.start } : { x: guide.start, y: guide.value })
  const b = worldToScreen(viewport, vertical ? { x: guide.value, y: guide.end } : { x: guide.end, y: guide.value })
  const points = vertical ? [crisp(a.x), a.y, crisp(b.x), b.y] : [a.x, crisp(a.y), b.x, crisp(b.y)]
  return <Line points={points} stroke={PENCIL} strokeWidth={1} listening={false} perfectDrawEnabled={false} />
}

/** Prototype connections (Animate tab): a pencil curve from each layer to every frame or layer its actions target. */
function Connectors(props: { snap: SceneSnapshot; viewport: Viewport; selection: NodeId[] }) {
  const { snap, viewport, selection } = props
  const links = new Map<string, { id: NodeId; target: NodeId }>()
  for (const node of snap.nodes.values()) {
    if (!node.visible) continue
    for (const ix of node.interactions) {
      for (const action of ix.actions) {
        if ('target' in action && action.target !== node.id && snap.nodes.has(action.target)) {
          links.set(`${node.id}>${action.target}`, { id: node.id, target: action.target })
        }
      }
    }
  }
  return [...links.values()].map(({ id, target }) => {
    const from = worldBounds(snap, id)
    const to = worldBounds(snap, target)
    const forward = to.x >= from.x + from.width / 2
    const start = worldToScreen(viewport, { x: forward ? from.x + from.width : from.x, y: from.y + from.height / 2 })
    const end = worldToScreen(viewport, { x: forward ? to.x : to.x + to.width, y: to.y + Math.min(to.height / 2, 48) })
    const bend = Math.max(40, Math.abs(end.x - start.x) / 2) * (forward ? 1 : -1)
    const tip = forward ? -8 : 8
    return (
      <Group key={`${id}>${target}`} opacity={selection.includes(id) ? 1 : 0.55}>
        <Shape
          listening={false}
          stroke={PENCIL}
          strokeWidth={1.5}
          sceneFunc={(ctx, shape) => {
            ctx.beginPath()
            ctx.moveTo(start.x, start.y)
            ctx.bezierCurveTo(start.x + bend, start.y, end.x - bend, end.y, end.x + tip / 2, end.y)
            ctx.strokeShape(shape)
          }}
        />
        <Circle x={start.x} y={start.y} radius={3} fill={PENCIL} listening={false} />
        <Line
          points={[end.x, end.y, end.x + tip, end.y - 4, end.x + tip, end.y + 4]}
          closed
          fill={PENCIL}
          listening={false}
        />
      </Group>
    )
  })
}

function handlePoint(snap: SceneSnapshot, viewport: Viewport, id: NodeId): Point {
  const b = worldBounds(snap, id)
  const p = worldToScreen(viewport, { x: b.x + b.width, y: b.y + b.height / 2 })
  return { x: Math.round(p.x + HANDLE_GAP), y: Math.round(p.y) }
}

/** The ⊕ beside the selected layer (Animate tab): drag it onto a frame to link. */
function LinkHandle(props: { snap: SceneSnapshot; viewport: Viewport; id: NodeId }) {
  const { x, y } = handlePoint(props.snap, props.viewport, props.id)
  const linked = Boolean(props.snap.nodes.get(props.id)?.interactions.some((ix) => ix.actions.some((a) => 'target' in a && a.target !== '')))
  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = cursor
  }
  return (
    <Group name={LINK_HANDLE} x={x} y={y}>
      <Circle
        radius={8}
        fill={linked ? PENCIL : PAPER}
        stroke={PENCIL}
        strokeWidth={1.5}
        hitStrokeWidth={10}
        onMouseEnter={(e) => setCursor(e, 'crosshair')}
        onMouseLeave={(e) => setCursor(e, '')}
      />
      <Line points={[-3.5, 0, 3.5, 0]} stroke={linked ? PAPER : PENCIL} strokeWidth={1.5} listening={false} />
      <Line points={[0, -3.5, 0, 3.5]} stroke={linked ? PAPER : PENCIL} strokeWidth={1.5} listening={false} />
    </Group>
  )
}

/** While dragging a link: the pencil curve to the pointer, and the frame it would connect to. */
function LinkDraftMark(props: { snap: SceneSnapshot; viewport: Viewport; draft: { from: NodeId; to: Point; target: NodeId | null } }) {
  const { snap, viewport, draft } = props
  const start = handlePoint(snap, viewport, draft.from)
  const end = worldToScreen(viewport, draft.to)
  const bend = Math.max(40, Math.abs(end.x - start.x) / 2)
  const target = draft.target ? snap.nodes.get(draft.target) : undefined
  return (
    <Group listening={false}>
      {target && <Outline snap={snap} viewport={viewport} id={target.id} stroke={PENCIL} />}
      {target && <Outline snap={snap} viewport={viewport} id={target.id} stroke={PENCIL} inset={2} />}
      <Shape
        stroke={PENCIL}
        strokeWidth={1.5}
        dash={target ? undefined : [5, 4]}
        sceneFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.moveTo(start.x, start.y)
          ctx.bezierCurveTo(start.x + bend, start.y, end.x - bend, end.y, end.x, end.y)
          ctx.strokeShape(shape)
        }}
      />
      <Circle x={start.x} y={start.y} radius={3.5} fill={PENCIL} />
      <Circle x={end.x} y={end.y} radius={3.5} fill={PENCIL} />
      {target && (
        <Label x={Math.round(end.x + 12)} y={Math.round(end.y + 12)}>
          <Tag fill={INK} cornerRadius={2} />
          <Text text={`Link to ${target.name}`} fontFamily={MONO_FONT} fontSize={11} fill={PAPER} padding={4} />
        </Label>
      )}
    </Group>
  )
}

function MarqueeMark(props: { viewport: Viewport; rect: { x: number; y: number; width: number; height: number } }) {
  const a = worldToScreen(props.viewport, { x: props.rect.x, y: props.rect.y })
  return (
    <Rect
      x={crisp(a.x)}
      y={crisp(a.y)}
      width={Math.round(props.rect.width * props.viewport.zoom)}
      height={Math.round(props.rect.height * props.viewport.zoom)}
      stroke={INK}
      strokeWidth={1}
      dash={[4, 3]}
      fill={MARQUEE_FILL}
      listening={false}
    />
  )
}
