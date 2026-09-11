import {
  addAutoLayout,
  isAutoLayout,
  isStacked,
  parentOf,
  removeAutoLayout,
  setAbsolute,
  type FrameLayout,
  type FrameNode,
  type LayoutAlign,
  type NodeId,
  type NodePatch,
  type Padding,
  type SceneNode,
  type SceneSnapshot,
  type SceneStore,
  type SizingMode,
} from '@codeframe/scene'
import { Minus, Plus, Square } from 'lucide-react'
import { useState } from 'react'
import { IconButton, NumberField, Section, Segmented, SelectField, Toggle } from './fields'
import { Glyph } from './Glyph'
import { ALT, SHIFT } from './keys'
import { common, type Commit } from './values'

type Flow = 'vertical' | 'horizontal' | 'wrap'

/** Auto layout on frames (Figma auto layout, Framer stacks): flow, alignment, gap, padding. */
export function AutoLayoutSection({ store, frames, commit }: { store: SceneStore; frames: FrameNode[]; commit: Commit }) {
  const ids = frames.map((f) => f.id)
  const stacks = frames.filter(isAutoLayout)
  const on = stacks.length === frames.length
  return (
    <Section
      title="Auto layout"
      aside={
        on ? (
          <IconButton label={`Remove auto layout (${ALT} ${SHIFT} A)`} onClick={() => removeAutoLayout(store, ids)}>
            <Glyph icon={Minus} />
          </IconButton>
        ) : (
          <IconButton label={`Add auto layout (${SHIFT} A)`} onClick={() => addAutoLayout(store, ids)}>
            <Glyph icon={Plus} />
          </IconButton>
        )
      }
    >
      {on && <LayoutFields layouts={stacks.map((f) => [f.id, f.layout])} commit={commit} />}
    </Section>
  )
}

function LayoutFields({ layouts, commit }: { layouts: [NodeId, FrameLayout][]; commit: Commit }) {
  const all = layouts.map(([, l]) => l)
  const pads = all.map((l) => l.padding)
  const [perSide, setPerSide] = useState(() => pads.some((p) => p.left !== p.right || p.top !== p.bottom))
  const value = <K extends keyof FrameLayout>(key: K) => common(all.map((l) => l[key]))
  const set = (patch: Partial<FrameLayout>, merge = false) =>
    commit(layouts.map(([id, l]) => [id, { layout: { ...l, ...patch } }]), merge)
  const setPadding = (patch: Partial<Padding>, merge: boolean) =>
    commit(layouts.map(([id, l]) => [id, { layout: { ...l, padding: { ...l.padding, ...patch } } }]), merge)
  const side = (key: keyof Padding) => common(pads.map((p) => p[key]))
  const pair = (a: keyof Padding, b: keyof Padding) => (pads.every((p) => p[a] === p[b]) ? side(a) : null)

  const justify = value('justify')
  const auto = justify === 'space-between'
  const wrap = value('wrap')
  const flow = common(all.map((l): Flow => (l.wrap ? 'wrap' : l.direction)))

  return (
    <div className="flex flex-col gap-2">
      <Segmented<Flow>
        label="Flow"
        value={flow}
        options={[
          { value: 'vertical', label: 'Vertical', title: 'Stack top to bottom' },
          { value: 'horizontal', label: 'Horizontal', title: 'Stack left to right' },
          { value: 'wrap', label: 'Wrap', title: 'Left to right, wrapping into rows' },
        ]}
        onChange={(next) => set(next === 'wrap' ? { direction: 'horizontal', wrap: true } : { direction: next, wrap: false })}
      />
      <div className="grid grid-cols-[64px_1fr] gap-x-3">
        <AlignmentPad layouts={all} onChange={(patch) => set(patch)} />
        <div className="flex flex-col">
          <NumberField
            label="Gap"
            title="Gap between items"
            min={0}
            precision={0}
            disabled={auto}
            placeholder={auto ? 'Auto' : undefined}
            value={auto ? null : value('gap')}
            onChange={(gap, merge) => set({ gap }, merge)}
          />
          {wrap !== false && (
            <NumberField
              label="Rows"
              title="Gap between rows"
              min={0}
              precision={0}
              value={value('crossGap')}
              onChange={(crossGap, merge) => set({ crossGap }, merge)}
            />
          )}
          <Toggle
            label="Auto gap"
            checked={justify === null ? null : auto}
            onChange={(checked) => set({ justify: checked ? 'space-between' : 'start' })}
          />
        </div>
      </div>
      <div className="flex items-end gap-2">
        {perSide ? (
          <div className="grid flex-1 grid-cols-4 gap-x-2">
            {(['top', 'right', 'bottom', 'left'] as const).map((key) => (
              <NumberField
                key={key}
                label={key[0].toUpperCase()}
                title={`Padding ${key}`}
                min={0}
                precision={0}
                value={side(key)}
                onChange={(v, merge) => setPadding({ [key]: v }, merge)}
              />
            ))}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-x-3">
            <NumberField
              label="Pad H"
              title="Horizontal padding"
              min={0}
              precision={0}
              value={pair('left', 'right')}
              onChange={(v, merge) => setPadding({ left: v, right: v }, merge)}
            />
            <NumberField
              label="Pad V"
              title="Vertical padding"
              min={0}
              precision={0}
              value={pair('top', 'bottom')}
              onChange={(v, merge) => setPadding({ top: v, bottom: v }, merge)}
            />
          </div>
        )}
        <IconButton label="Padding per side" active={perSide} onClick={() => setPerSide(!perSide)}>
          <Glyph icon={Square} size={13} />
        </IconButton>
      </div>
    </div>
  )
}

const SPOTS: LayoutAlign[] = ['start', 'center', 'end']
const X_NAMES: Record<LayoutAlign, string> = { start: 'left', center: 'center', end: 'right' }
const Y_NAMES: Record<LayoutAlign, string> = { start: 'top', center: 'middle', end: 'bottom' }

/**
 * Figma's 3×3 alignment pad. Columns are x and rows are y whichever way the stack
 * flows. With auto gap the main axis is spread, so a whole line lights up.
 */
function AlignmentPad({ layouts, onChange }: { layouts: FrameLayout[]; onChange: (patch: Partial<FrameLayout>) => void }) {
  const horizontal = common(layouts.map((l) => l.direction)) !== 'vertical'
  const justify = common(layouts.map((l) => l.justify))
  const align = common(layouts.map((l) => l.align))
  const spread = justify === 'space-between'
  return (
    <div role="radiogroup" aria-label="Alignment" className="grid h-16 w-16 grid-cols-3 grid-rows-3 border border-ink">
      {SPOTS.flatMap((y) =>
        SPOTS.map((x) => {
          const main = horizontal ? x : y
          const cross = horizontal ? y : x
          const active = align === cross && (spread || justify === main)
          const label = `Align ${Y_NAMES[y]} ${X_NAMES[x]}`
          return (
            <button
              key={`${y}-${x}`}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(spread ? { align: cross } : { align: cross, justify: main })}
              className="group flex items-center justify-center transition-colors hover:bg-paper-sunk"
            >
              <span className={active ? 'h-2.5 w-2.5 bg-ink' : 'h-1 w-1 bg-ink-3 group-hover:bg-ink'} />
            </button>
          )
        }),
      )}
    </div>
  )
}

function inStack(snap: SceneSnapshot, node: SceneNode): boolean {
  const parentId = parentOf(snap, node.id)
  return node.type !== 'group' && parentId !== null && isAutoLayout(snap.nodes.get(parentId))
}

function sizing(node: SceneNode, axis: 'x' | 'y', mode: SizingMode): NodePatch {
  // Fixing an axis keeps the size it has now.
  if (axis === 'x') return mode === 'fixed' ? { sizeX: mode, width: node.width } : { sizeX: mode }
  return mode === 'fixed' ? { sizeY: mode, height: node.height } : { sizeY: mode }
}

/** Hug / fill / fixed per axis, min and max, and opting out of the flow. Only where auto layout applies. */
export function ResizingSection(props: { store: SceneStore; snap: SceneSnapshot; nodes: SceneNode[]; commit: Commit }) {
  const { store, snap, nodes, commit } = props
  const stacks = nodes.every(isAutoLayout)
  const children = nodes.every((n) => inStack(snap, n))
  if (!stacks && !children) return null
  const flowing = nodes.every((n) => isStacked(snap, n.id))

  const modes = (key: 'sizeX' | 'sizeY') => {
    const current = nodes.map((n) => n[key])
    return [
      { value: 'fixed' as const, label: 'Fixed' },
      ...(stacks || current.includes('hug') ? [{ value: 'hug' as const, label: 'Hug contents' }] : []),
      ...(flowing || current.includes('fill') ? [{ value: 'fill' as const, label: 'Fill container' }] : []),
    ]
  }
  const limit = (key: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight', label: string, title: string) => (
    <NumberField
      label={label}
      title={`${title}. Empty for none`}
      min={0}
      precision={0}
      placeholder="–"
      value={common(nodes.map((n) => n[key]))}
      onChange={(v, merge) => commit(nodes.map((n) => [n.id, { [key]: v }]), merge)}
      onClear={() => commit(nodes.map((n) => [n.id, { [key]: null }]), false)}
    />
  )

  return (
    <Section title="Resizing">
      <div className="grid grid-cols-2 gap-x-3">
        <label className="flex flex-col">
          <span className="smallcaps text-ink-3">Width</span>
          <SelectField<SizingMode>
            label="Width sizing"
            value={common(nodes.map((n) => n.sizeX))}
            options={modes('sizeX')}
            onChange={(mode) => commit(nodes.map((n) => [n.id, sizing(n, 'x', mode)]), false)}
          />
        </label>
        <label className="flex flex-col">
          <span className="smallcaps text-ink-3">Height</span>
          <SelectField<SizingMode>
            label="Height sizing"
            value={common(nodes.map((n) => n.sizeY))}
            options={modes('sizeY')}
            onChange={(mode) => commit(nodes.map((n) => [n.id, sizing(n, 'y', mode)]), false)}
          />
        </label>
        {limit('minWidth', 'Min W', 'Minimum width')}
        {limit('maxWidth', 'Max W', 'Maximum width')}
        {limit('minHeight', 'Min H', 'Minimum height')}
        {limit('maxHeight', 'Max H', 'Maximum height')}
      </div>
      {children && (
        <Toggle
          label="Ignore auto layout"
          checked={common(nodes.map((n) => n.absolute))}
          onChange={(absolute) => setAbsolute(store, nodes.map((n) => n.id), absolute)}
        />
      )}
    </Section>
  )
}
