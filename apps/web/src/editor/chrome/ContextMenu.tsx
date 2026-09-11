import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as cmd from '../commands'
import { useScene, useSceneStore } from '../scene-context'
import { useUI } from '../ui-store'
import { ALT, MOD, SHIFT } from './keys'

type MenuItem = { label: string; keys?: string; run: () => void; disabled?: boolean } | 'rule'

/** Right-click menu for the canvas and layer rows. Letterpress shadow, square corners. */
export function ContextMenu() {
  const store = useSceneStore()
  const snap = useScene()
  const menu = useUI((s) => s.contextMenu)
  const selection = useUI((s) => s.selection)
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => useUI.getState().setContextMenu(null)
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', close, { capture: true, passive: true })
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', close, { capture: true })
      window.removeEventListener('blur', close)
    }
  }, [menu])

  // Measure, then keep the menu inside the window.
  useLayoutEffect(() => {
    if (!menu || !panel.current) {
      setPosition(null)
      return
    }
    const rect = panel.current.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    })
  }, [menu])

  if (!menu) return null

  const nodes = selection.flatMap((id) => snap.nodes.get(id) ?? [])
  const anyContainer = nodes.some((n) => n.type === 'frame' || n.type === 'group')
  const allHidden = nodes.length > 0 && nodes.every((n) => !n.visible)
  const allLocked = nodes.length > 0 && nodes.every((n) => n.locked)
  const hasFrames = [...snap.nodes.values()].some((n) => n.type === 'frame' && n.parentId === null)
  const paste: MenuItem = { label: 'Paste here', keys: `${MOD} V`, run: () => cmd.pasteAt(store, menu.world), disabled: !cmd.hasClipboard() }

  const items: MenuItem[] =
    nodes.length > 0
      ? [
          { label: 'Copy', keys: `${MOD} C`, run: () => cmd.copyToClipboard(store) },
          paste,
          { label: 'Duplicate', keys: `${MOD} D`, run: () => cmd.duplicateSelection(store) },
          { label: 'Delete', keys: 'Del', run: () => cmd.deleteSelection(store) },
          'rule',
          { label: 'Bring to front', keys: `${MOD} ${SHIFT} ]`, run: () => cmd.reorderSelection(store, 'front') },
          { label: 'Bring forward', keys: `${MOD} ]`, run: () => cmd.reorderSelection(store, 'forward') },
          { label: 'Send backward', keys: `${MOD} [`, run: () => cmd.reorderSelection(store, 'backward') },
          { label: 'Send to back', keys: `${MOD} ${SHIFT} [`, run: () => cmd.reorderSelection(store, 'back') },
          'rule',
          { label: 'Group selection', keys: `${MOD} G`, run: () => cmd.groupSelection(store) },
          { label: 'Frame selection', keys: `${MOD} ${ALT} G`, run: () => cmd.frameSelection(store) },
          { label: 'Ungroup', keys: `${MOD} ${SHIFT} G`, run: () => cmd.ungroupSelection(store), disabled: !anyContainer },
          'rule',
          { label: allHidden ? 'Show' : 'Hide', keys: `${MOD} ${SHIFT} H`, run: () => cmd.toggleVisibility(store, selection) },
          { label: allLocked ? 'Unlock' : 'Lock', keys: `${MOD} ${SHIFT} L`, run: () => cmd.toggleLock(store, selection) },
          'rule',
          { label: 'Play appear animations', run: () => cmd.playAppear(store), disabled: !nodes.some((n) => n.appear) },
          { label: 'Preview frame', keys: `${MOD} ${ALT} ↵`, run: () => cmd.openPreview(store) },
          { label: 'Export as PNG @2x', run: () => cmd.exportSelectionPng(store), disabled: nodes.length !== 1 },
          { label: 'Zoom to selection', keys: `${SHIFT} 2`, run: () => cmd.zoomToSelection(store) },
        ]
      : [
          paste,
          { label: 'Select all', keys: `${MOD} A`, run: () => cmd.selectAll(store) },
          'rule',
          { label: 'Preview', keys: `${MOD} ${ALT} ↵`, run: () => cmd.openPreview(store), disabled: !hasFrames },
          { label: 'Zoom to fit', keys: `${SHIFT} 1`, run: () => cmd.zoomToFit(store) },
        ]

  return createPortal(
    <div
      ref={panel}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', left: position?.left ?? menu.x, top: position?.top ?? menu.y, visibility: position ? 'visible' : 'hidden' }}
      className="z-50 w-64 animate-print-in rounded-tag border border-ink bg-paper-raised p-1 shadow-press"
    >
      {items.map((item, i) =>
        item === 'rule' ? (
          <div key={`rule-${i}`} className="mx-1 my-1 h-px bg-rule" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              useUI.getState().setContextMenu(null)
              item.run()
            }}
            className="flex h-7 w-full items-center justify-between px-2 text-left text-ui hover:bg-ink hover:text-paper disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            <span>{item.label}</span>
            {item.keys && <kbd className="font-mono text-caption opacity-60">{item.keys}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
