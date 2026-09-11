import { Check, ChevronDown } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { HexAlphaColorPicker } from 'react-colorful'
import { Glyph } from './Glyph'

/**
 * Broadsheet form controls: no boxes, just a ruled baseline (like a form
 * printed on paper). Pencil marks focus; ink marks the committed state.
 */

const preventFocusSteal = (e: { preventDefault(): void }) => e.preventDefault()

const RULED = 'flex h-7 items-center gap-1.5 border-b border-rule transition-colors hover:border-ink-3 focus-within:border-pencil'

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-rule px-3 pt-2.5 pb-3">
      <header className="mb-1 flex h-6 items-center justify-between">
        <h3 className="section-head">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  )
}

export function IconButton(props: {
  label: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  active?: boolean
  size?: 'sm' | 'md'
}) {
  const box = props.size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onMouseDown={preventFocusSteal}
      onClick={props.onClick}
      className={`flex ${box} shrink-0 items-center justify-center transition-colors disabled:text-ink-3/50 disabled:hover:bg-transparent ${
        props.active ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-sunk hover:text-ink'
      }`}
    >
      {props.children}
    </button>
  )
}

function formatNumber(n: number, precision: number): string {
  return String(Number(n.toFixed(precision)))
}

export function NumberField(props: {
  label: string
  /** `null` renders as "Mixed". */
  value: number | null
  onChange: (value: number, merge: boolean) => void
  min?: number
  max?: number
  /** Increment in displayed units. */
  step?: number
  precision?: number
  /** Display multiplier, e.g. 100 to edit a 0–1 value as a percentage. */
  scale?: number
  suffix?: string
  title?: string
  /** Read-only, e.g. a position set by auto layout. */
  disabled?: boolean
  /** Shown when the value is `null`. Defaults to "Mixed". */
  placeholder?: string
  /** Makes an emptied field clear the value (optional limits). */
  onClear?: () => void
}) {
  const { label, value, onChange, min = -Infinity, max = Infinity, step = 1, precision = 2, scale = 1, suffix, title, disabled, onClear } = props
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const shown = value === null ? '' : formatNumber(value * scale, precision)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const commit = (text: string) => {
    setDraft(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (onClear && text.trim() === '') {
      if (value !== null) onClear()
      return
    }
    const parsed = Number.parseFloat(text)
    if (!Number.isFinite(parsed)) return
    const next = clamp(parsed / scale)
    if (value === null || Math.abs(next - value) > 1e-9) onChange(next, false)
  }

  // Drag the label to scrub; Shift for ×10. One undo step per scrub.
  const scrub = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || disabled) return
    e.preventDefault()
    const startX = e.clientX
    const start = (value ?? 0) * scale
    let started = false
    const onMove = (ev: PointerEvent) => {
      const steps = Math.round((ev.clientX - startX) / 2)
      if (!started && steps === 0) return
      onChange(clamp((start + steps * step * (ev.shiftKey ? 10 : 1)) / scale), started)
      started = true
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'ew-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <label className={`${RULED} ${disabled ? 'border-dotted hover:border-rule' : ''}`} title={title}>
      <span onPointerDown={scrub} className={`smallcaps min-w-4 shrink-0 text-ink-3 select-none ${disabled ? '' : 'cursor-ew-resize'}`}>
        {label}
      </span>
      <input
        inputMode="decimal"
        spellCheck={false}
        readOnly={disabled}
        aria-label={title ?? label}
        className={`min-w-0 flex-1 bg-transparent font-mono text-data outline-none placeholder:text-ink-3 ${disabled ? 'text-ink-3' : 'text-ink'}`}
        value={draft ?? shown}
        placeholder={value === null ? (props.placeholder ?? 'Mixed') : undefined}
        onFocus={(e) => {
          if (disabled) return
          setDraft(shown)
          const input = e.currentTarget
          requestAnimationFrame(() => input.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !disabled) {
            e.preventDefault()
            const base = Number.parseFloat(e.currentTarget.value)
            const current = Number.isFinite(base) ? base : (value ?? 0) * scale
            const next = clamp((current + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)) / scale)
            setDraft(formatNumber(next * scale, precision))
            onChange(next, false)
          }
        }}
      />
      {suffix && <span className="font-mono text-caption text-ink-3">{suffix}</span>}
    </label>
  )
}

/** A labelled text value, committed on Enter or blur (Ctrl/Cmd+Enter when multiline). */
export function TextField(props: { label: string; value: string | null; onChange: (value: string) => void; multiline?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const commit = (text: string) => {
    setDraft(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (text !== props.value) props.onChange(text)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (!props.multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelled.current = true
      e.currentTarget.blur()
    }
  }
  const common = {
    'aria-label': props.label,
    spellCheck: false,
    value: draft ?? props.value ?? '',
    placeholder: props.value === null ? 'Mixed' : undefined,
    onFocus: () => setDraft(props.value ?? ''),
    onKeyDown,
  }
  return (
    <label className="flex flex-col border-b border-rule pt-1.5 pb-1 transition-colors hover:border-ink-3 focus-within:border-pencil">
      <span className="smallcaps text-ink-3">{props.label}</span>
      {props.multiline ? (
        <textarea
          {...common}
          rows={3}
          className="resize-none bg-transparent text-ui leading-snug outline-none placeholder:text-ink-3"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
        />
      ) : (
        <input
          {...common}
          className="h-6 bg-transparent text-ui outline-none placeholder:text-ink-3"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
        />
      )}
    </label>
  )
}

const CHECKER ='repeating-conic-gradient(#d9d2c3 0 25%, #ffffff 0 50%) 0 0 / 8px 8px'

function normalizeHex(text: string): string | null {
  let hex = text.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join('')
  return /^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex) ? hex.toUpperCase() : null
}

export function ColorField(props: { label: string; value: string | null; onChange: (value: string, merge: boolean) => void }) {
  const { label, value, onChange } = props
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [swatch, setSwatch] = useState<HTMLButtonElement | null>(null)
  const merging = useRef(false)
  const cancelled = useRef(false)
  const hex = value ? value.replace('#', '').toUpperCase() : ''

  const commit = (text: string) => {
    setDraft(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = normalizeHex(text)
    if (next && next !== hex) onChange(`#${next}`, false)
  }

  return (
    <div className={RULED}>
      <button
        ref={setSwatch}
        type="button"
        aria-label={`${label}: open color picker`}
        onMouseDown={preventFocusSteal}
        onClick={() => {
          merging.current = false
          setOpen((o) => !o)
        }}
        className="h-4 w-4 shrink-0 border border-ink"
        style={{ background: value ? `linear-gradient(${value}, ${value}), ${CHECKER}` : CHECKER }}
      />
      <input
        aria-label={`${label} hex`}
        spellCheck={false}
        maxLength={9}
        className="min-w-0 flex-1 bg-transparent font-mono text-data uppercase outline-none placeholder:text-ink-3 placeholder:normal-case"
        value={draft ?? hex}
        placeholder={value === null ? 'Mixed' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          }
        }}
      />
      {open && (
        <Popover anchor={swatch}onClose={() => setOpen(false)}>
          <div className="cf-picker">
            <HexAlphaColorPicker
              color={value ?? '#000000'}
              onChange={(color) => {
                onChange(color.toUpperCase(), merging.current)
                merging.current = true
              }}
            />
          </div>
        </Popover>
      )}
    </div>
  )
}

export function SelectField<T extends string | number>(props: {
  label: string
  value: T | null
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label className={`${RULED} relative`}>
      <span className="sr-only">{props.label}</span>
      <select
        className="cf-select h-full min-w-0 flex-1 bg-transparent pr-4 text-ui outline-none"
        value={props.value === null ? '' : String(props.value)}
        onChange={(e) => {
          const option = props.options.find((o) => String(o.value) === e.target.value)
          if (option) props.onChange(option.value)
        }}
      >
        {props.value === null && (
          <option value="" disabled>
            Mixed
          </option>
        )}
        {props.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <Glyph icon={ChevronDown} size={12} className="pointer-events-none absolute right-0 text-ink-3" />
    </label>
  )
}

export function Segmented<T extends string>(props: {
  label: string
  value: T | null
  options: readonly { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex h-7 border border-ink">
      {props.options.map((o, i) => {
        const active = props.value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onMouseDown={preventFocusSteal}
            onClick={() => props.onChange(o.value)}
            className={`min-w-0 flex-1 truncate px-1 text-caption transition-colors ${i > 0 ? 'border-l border-ink' : ''} ${
              active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-sunk'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle(props: { label: string; checked: boolean | null; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex h-7 items-center gap-2 text-ui select-none">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={props.checked ?? false}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="flex h-3.5 w-3.5 items-center justify-center border border-ink text-paper peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-pencil">
        {props.checked && <Glyph icon={Check} size={10} />}
        {props.checked === null && <span className="h-px w-2 bg-ink" />}
      </span>
      {props.label}
    </label>
  )
}

/** Floats beside an anchor; closes on outside press or Escape. Letterpress shadow, no blur. */
export function Popover(props: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  className?: string
  /** Room to keep below the popover's top edge before the window's bottom. */
  height?: number
}) {
  const { anchor, onClose } = props
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !anchor?.contains(target)) close.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [anchor])

  if (!anchor) return null
  const rect = anchor.getBoundingClientRect()
  const style: CSSProperties = {
    position: 'fixed',
    top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - (props.height ?? 280))),
    left: rect.right,
    transform: 'translateX(-100%)',
  }
  return createPortal(
    <div
      ref={panel}
      style={style}
      className={`z-50 animate-print-in rounded-tag border border-ink bg-paper-raised shadow-press ${props.className ?? 'p-2'}`}
    >
      {props.children}
    </div>,
    document.body,
  )
}
