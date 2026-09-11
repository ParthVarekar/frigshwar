import {
  ancestorsOf,
  applyPatches,
  childrenOf,
  isAncestorOf,
  isContainerType,
  moveNodes,
  normalizeSelection,
  parentOf,
  type NodeId,
  type NodeType,
} from '@codeframe/scene'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  Frame,
  Group,
  Image,
  Lock,
  LockOpen,
  Square,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { toggleLock, toggleVisibility } from '../commands'
import { useChildren, useNode, useScene, useSceneStore } from '../scene-context'
import { useUI } from '../ui-store'
import { Glyph } from './Glyph'

const TYPE_GLYPHS: Record<NodeType, LucideIcon> = {
  frame: Frame,
  rect: Square,
  ellipse: Circle,
  text: Type,
  image: Image,
  group: Group,
}

const ROW_INDENT = 14

type DropMark = { kind: 'line'; top: number; left: number } | { kind: 'inside'; top: number; height: number }

/**
 * Layers, front to back. Rows are plain markup; pointer handling is delegated
 * to the tree so rows stay cheap and memoised. Dragging a row reorders it, or
 * drops it inside a frame or group (middle of the row).
 */
export function LayersPanel() {
  const store = useSceneStore()
  const layerCount = useScene().nodes.size
  const hasRoots = useChildren(null).length > 0
  const selection = useUI((s) => s.selection)
  const tree = useRef<HTMLDivElement>(null)
  const [drop, setDrop] = useState<DropMark | null>(null)

  // Reveal whatever gets selected on the canvas.
  useEffect(() => {
    if (selection.length === 0) return
    const snap = store.getSnapshot()
    useUI.getState().expandAll(selection.flatMap((id) => ancestorsOf(snap, id)))
    const last = selection[selection.length - 1]
    requestAnimationFrame(() =>
      tree.current?.querySelector(`[data-layer-id="${last}"]`)?.scrollIntoView({ block: 'nearest' }),
    )
  }, [selection, store])

  const startDrag = (e: ReactPointerEvent, ids: NodeId[], clickTarget: NodeId | null) => {
    const start = { x: e.clientX, y: e.clientY }
    let active = false
    let target: { parentId: NodeId | null; position: number } | null = null

    const onMove = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return
      active = true
      target = null
      const container = tree.current!
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-layer-id]')
      const snap = store.getSnapshot()
      const overId = row?.dataset.layerId
      const over = overId ? snap.nodes.get(overId) : undefined
      if (!row || !overId || !over || !container.contains(row)) return setDrop(null)

      const rect = row.getBoundingClientRect()
      const top = rect.top - container.getBoundingClientRect().top + container.scrollTop
      const rel = (ev.clientY - rect.top) / rect.height
      if (isContainerType(over.type) && rel > 0.25 && rel < 0.75) {
        target = { parentId: overId, position: childrenOf(snap, overId).length }
        setDrop({ kind: 'inside', top, height: rect.height })
      } else {
        const parentId = parentOf(snap, overId)
        const index = childrenOf(snap, parentId).indexOf(overId)
        // Rows run front to back, so the upper half of a row means "in front of it".
        const inFront = rel < 0.5
        target = { parentId, position: inFront ? index + 1 : index }
        setDrop({ kind: 'line', top: inFront ? top : top + rect.height, left: Number.parseFloat(row.style.paddingLeft) || 8 })
      }
      const parent = target.parentId
      if (parent !== null && ids.some((id) => id === parent || isAncestorOf(snap, id, parent))) {
        target = null
        setDrop(null)
      }
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDrop(null)
      if (!active) {
        if (clickTarget) useUI.getState().setSelection([clickTarget])
        return
      }
      if (target) moveNodes(store, ids, target.parentId, target.position)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (el.closest('button, input')) return
    const ui = useUI.getState()
    const id = el.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    if (!id) {
      ui.setSelection([])
      return
    }
    const sel = ui.selection
    const toggle = e.shiftKey || e.ctrlKey || e.metaKey
    const next = toggle
      ? sel.includes(id)
        ? sel.filter((s) => s !== id)
        : normalizeSelection(store.getSnapshot(), [...sel, id])
      : sel.includes(id)
        ? sel
        : [id]
    ui.setSelection(next)
    if (next.includes(id)) startDrag(e, next, !toggle && sel.includes(id) && sel.length > 1 ? id : null)
  }

  return (
    <aside aria-label="Layers" className="flex w-[248px] shrink-0 flex-col border-r border-ink bg-paper">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-rule px-3">
        <h2 className="section-head">Layers</h2>
        <span className="font-mono text-caption text-ink-3">{layerCount}</span>
      </header>
      <div
        ref={tree}
        role="tree"
        aria-label="Layer tree"
        aria-multiselectable
        className="relative min-h-0 flex-1 overflow-y-auto py-1 select-none"
        onPointerDown={onPointerDown}
        onPointerLeave={() => useUI.getState().setHover(null)}
        onContextMenu={(e) => {
          e.preventDefault()
          const ui = useUI.getState()
          const id = (e.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
          if (!id) ui.setSelection([])
          else if (!ui.selection.includes(id)) ui.setSelection([id])
          ui.setContextMenu({ x: e.clientX, y: e.clientY, world: null })
        }}
      >
        {hasRoots ? (
          <LayerList parentId={null} depth={0} />
        ) : (
          <p className="px-3 py-4 text-ink-3">
            An empty desk. Press <kbd className="font-mono text-ink-2">F</kbd> to set a frame.
          </p>
        )}
        {drop?.kind === 'line' && (
          <div className="pointer-events-none absolute right-2 z-10 h-0.5 bg-pencil" style={{ top: drop.top - 1, left: drop.left + 16 }} />
        )}
        {drop?.kind === 'inside' && (
          <div
            className="pointer-events-none absolute inset-x-1 z-10 border border-pencil bg-pencil-wash/40"
            style={{ top: drop.top, height: drop.height }}
          />
        )}
      </div>
    </aside>
  )
}

const LayerList = memo(function LayerList({ parentId, depth }: { parentId: NodeId | null; depth: number }) {
  const ids = useChildren(parentId)
  return [...ids].reverse().map((id) => <LayerRow key={id} id={id} depth={depth} />)
})

const LayerRow = memo(function LayerRow({ id, depth }: { id: NodeId; depth: number }) {
  const store = useSceneStore()
  const node = useNode(id)
  const hasChildren = useChildren(id).length > 0
  const selected = useUI((s) => s.selection.includes(id))
  const hovered = useUI((s) => s.hoverId === id)
  const expanded = useUI((s) => s.expanded.has(id))
  const [renaming, setRenaming] = useState(false)
  if (!node) return null

  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth + 1}
        data-layer-id={id}
        className={`group flex h-7 items-center gap-1 pr-1.5 text-ui ${
          selected ? 'bg-ink text-paper' : hovered ? 'bg-paper-sunk' : ''
        }`}
        style={{ paddingLeft: 8 + depth * ROW_INDENT }}
        onPointerEnter={() => useUI.getState().setHover(id)}
        onDoubleClick={() => setRenaming(true)}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className={`flex h-5 w-4 shrink-0 items-center justify-center ${hasChildren ? '' : 'invisible'}`}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => useUI.getState().setExpanded(id, !expanded)}
        >
          <Glyph icon={expanded ? ChevronDown : ChevronRight} size={12} />
        </button>
        <Glyph icon={TYPE_GLYPHS[node.type]} size={13} className={selected ? 'text-paper/70' : 'text-ink-3'} />
        {renaming ? (
          <RenameInput
            initial={node.name}
            onDone={(name) => {
              setRenaming(false)
              if (name && name !== node.name) applyPatches(store, [[id, { name }]])
            }}
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate pl-1 ${node.visible ? '' : selected ? 'text-paper/50' : 'text-ink-3'}`}
          >
            {node.name}
          </span>
        )}
        <RowToggle
          label={node.locked ? 'Unlock' : 'Lock'}
          icon={node.locked ? Lock : LockOpen}
          persistent={node.locked}
          onClick={() => toggleLock(store, [id])}
        />
        <RowToggle
          label={node.visible ? 'Hide' : 'Show'}
          icon={node.visible ? Eye : EyeOff}
          persistent={!node.visible}
          onClick={() => toggleVisibility(store, [id])}
        />
      </div>
      {hasChildren && expanded && <LayerList parentId={id} depth={depth + 1} />}
    </>
  )
})

function RowToggle(props: { label: string; icon: LucideIcon; persistent: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={props.label}
      aria-label={props.label}
      onMouseDown={(e) => e.preventDefault()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={props.onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center opacity-70 hover:opacity-100 ${
        props.persistent ? '' : 'invisible group-hover:visible'
      }`}
    >
      <Glyph icon={props.icon} size={12} />
    </button>
  )
}

function RenameInput(props: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(props.initial)
  const finished = useRef(false)
  const finish = (name: string | null) => {
    if (finished.current) return
    finished.current = true
    props.onDone(name === null ? null : name.trim())
  }
  return (
    <input
      autoFocus
      aria-label="Layer name"
      spellCheck={false}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
      className="min-w-0 flex-1 border-b border-pencil bg-transparent pl-1 text-inherit outline-none"
    />
  )
}
