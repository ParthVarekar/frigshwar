import { ChevronDown, Code, Play, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { openExport, openPreview, pickImages, redo, undo, zoomStep, zoomTo, zoomToFit, zoomToSelection } from '../commands'
import { useHistoryState, useSceneStore } from '../scene-context'
import { useTimeline } from '../timeline/timeline-store'
import { useUI, type Tool } from '../ui-store'
import { IconButton, Popover } from './fields'
import { Glyph } from './Glyph'
import { ALT, MOD, SHIFT } from './keys'

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Move', key: 'V' },
  { tool: 'frame', label: 'Frame', key: 'F' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', key: 'O' },
  { tool: 'text', label: 'Text', key: 'T' },
]

const noFocus = (e: { preventDefault(): void }) => e.preventDefault()

/** The masthead: wordmark, the draft's title, tools set as words, history and zoom. */
export function Masthead() {
  const store = useSceneStore()
  const tool = useUI((s) => s.tool)
  const setTool = useUI((s) => s.setTool)

  return (
    <header className="rule-double flex h-14 shrink-0 items-stretch bg-paper">
      <div className="flex w-[248px] shrink-0 items-center gap-2.5 border-r border-ink px-4">
        <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" fill="var(--color-ink)" />
          <rect x="8" y="8" width="16" height="16" fill="none" stroke="var(--color-paper)" strokeWidth="2" />
          <rect x="12" y="14" width="8" height="2" fill="var(--color-pencil)" />
        </svg>
        <span className="font-display text-mark leading-none font-semibold" style={{ fontVariationSettings: '"opsz" 72' }}>
          Codeframe
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-6 px-4">
        <div className="flex min-w-0 flex-col">
          <span className="smallcaps leading-none text-ink-3">Draft</span>
          <DocumentTitle />
        </div>

        <nav aria-label="Tools" className="mx-auto flex items-center">
          {TOOLS.map(({ tool: t, label, key }) => (
            <ToolButton key={t} label={label} shortcut={key} active={tool === t} onClick={() => setTool(t)} />
          ))}
          <ToolButton label="Image" shortcut="I" onClick={() => pickImages(store)} />
          <span className="mx-2 h-4 w-px bg-rule" aria-hidden />
          <ToolButton label="Hand" shortcut="H" active={tool === 'hand'} onClick={() => setTool('hand')} />
        </nav>

        <TimelineToggle />
        <button
          type="button"
          title={`Export site code (${MOD} ${SHIFT} E)`}
          onMouseDown={noFocus}
          onClick={openExport}
          className="flex h-8 shrink-0 items-center gap-1.5 border border-ink px-3 text-ui transition-colors hover:bg-paper-sunk"
        >
          <Glyph icon={Code} size={13} />
          Export code
        </button>
      </div>

      <div className="flex w-[272px] shrink-0 items-center justify-between border-l border-ink px-3">
        <HistoryButtons />
        <div className="flex items-center gap-1.5">
          <ZoomMenu />
          <button
            type="button"
            title={`Preview (${MOD} ${ALT} ↵)`}
            onMouseDown={noFocus}
            onClick={() => openPreview(store)}
            className="flex h-8 items-center gap-1.5 bg-ink px-3 text-ui text-paper transition-colors hover:bg-ink-2"
          >
            <Glyph icon={Play} size={12} />
            Preview
          </button>
        </div>
      </div>
    </header>
  )
}

function TimelineToggle() {
  const open = useTimeline((s) => s.open)
  return (
    <button
      type="button"
      aria-pressed={open}
      title="Timeline: keyframe animations"
      onMouseDown={noFocus}
      onClick={() => useTimeline.getState().setOpen(!open)}
      className={`flex h-8 shrink-0 items-center gap-1.5 border border-ink px-3 text-ui transition-colors ${open ? 'bg-ink text-paper' : 'hover:bg-paper-sunk'}`}
    >
      Timeline
    </button>
  )
}

function ToolButton(props: { label: string; shortcut: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.active ?? undefined}
      title={`${props.label} (${props.shortcut})`}
      onMouseDown={noFocus}
      onClick={props.onClick}
      className={`flex h-8 items-center gap-1.5 px-2.5 text-ui transition-colors ${
        props.active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-sunk'
      }`}
    >
      {props.label}
      <kbd className={`font-mono text-caption ${props.active ? 'text-paper/60' : 'text-ink-3'}`}>{props.shortcut}</kbd>
    </button>
  )
}

function DocumentTitle() {
  const store = useSceneStore()
  const title = useSyncExternalStore(store.subscribe, () => {
    const value = store.meta.get('title')
    return typeof value === 'string' ? value : ''
  })
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    document.title = title ? `${title} · Codeframe` : 'Codeframe'
  }, [title])

  return (
    <input
      aria-label="Document title"
      spellCheck={false}
      value={draft ?? title}
      placeholder="Untitled page"
      onFocus={() => setDraft(title)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const next = e.target.value.trim()
        setDraft(null)
        if (next !== title) store.transact(() => store.meta.set('title', next), { untracked: true })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      className="w-60 min-w-0 truncate border-b border-transparent bg-transparent font-display text-title leading-tight italic outline-none placeholder:text-ink-3 hover:border-rule focus:border-pencil"
      style={{ fontVariationSettings: '"opsz" 24' }}
    />
  )
}

function HistoryButtons() {
  const store = useSceneStore()
  const { canUndo, canRedo } = useHistoryState()
  return (
    <div className="flex items-center">
      <IconButton size="md" label={`Undo (${MOD} Z)`} disabled={!canUndo} onClick={() => undo(store)}>
        <Glyph icon={Undo2} size={15} />
      </IconButton>
      <IconButton size="md" label={`Redo (${MOD} ${SHIFT} Z)`} disabled={!canRedo} onClick={() => redo(store)}>
        <Glyph icon={Redo2} size={15} />
      </IconButton>
    </div>
  )
}

function ZoomMenu() {
  const store = useSceneStore()
  const zoom = useUI((s) => s.viewport.zoom)
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const items: [label: string, keys: string, run: () => void][] = [
    ['Zoom in', `${MOD} +`, () => zoomStep(1)],
    ['Zoom out', `${MOD} −`, () => zoomStep(-1)],
    ['Actual size', `${SHIFT} 0`, () => zoomTo(1)],
    ['Fit everything', `${SHIFT} 1`, () => zoomToFit(store)],
    ['Fit selection', `${SHIFT} 2`, () => zoomToSelection(store)],
  ]
  return (
    <>
      <button
        ref={setButton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={noFocus}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1 px-2 font-mono text-data transition-colors hover:bg-paper-sunk"
      >
        {Math.round(zoom * 100)}%
        <Glyph icon={ChevronDown} size={12} className="text-ink-3" />
      </button>
      {open && (
        <Popover anchor={button}onClose={() => setOpen(false)} className="p-1">
          <div role="menu" className="flex w-52 flex-col">
            {items.map(([label, keys, run]) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onMouseDown={noFocus}
                onClick={() => {
                  run()
                  setOpen(false)
                }}
                className="flex h-7 items-center justify-between px-2 text-left text-ui hover:bg-ink hover:text-paper"
              >
                <span>{label}</span>
                <kbd className="font-mono text-caption opacity-60">{keys}</kbd>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}
