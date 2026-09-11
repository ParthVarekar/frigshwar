import {
  addAsset,
  applyPatches,
  DEFAULT_SHADOW,
  isStacked,
  pinSizing,
  round2,
  TYPE_LABELS,
  worldBox,
  type AlignEdge,
  type FrameNode,
  type ImageFit,
  type ImageNode,
  type NodePatch,
  type PatchMap,
  type SceneNode,
  type SceneSnapshot,
  type SceneStore,
  type Shadow,
  type TextAlign,
  type TextAutoResize,
  type TextNode,
} from '@codeframe/scene'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Minus,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { getSpec, LIBRARY_NAME, resolveProps, type Props } from '@codeframe/library'
import type { ComponentNode } from '@codeframe/scene'
import { useState } from 'react'
import { CONTENT_FONTS } from '../../fonts'
import { constrainComponentPatches, setComponentProps } from '../library'
import { alignSelection, distributeSelection } from '../commands'
import { localPosition, setPosition, setRotation, setSize, textPatch } from '../edits'
import { importImageFile } from '../images'
import { useScene, useSceneStore } from '../scene-context'
import { recordPatches } from '../timeline/record'
import { recordTarget } from '../timeline/timeline-store'
import { useUI, type PanelTab } from '../ui-store'
import { AnimatePanel } from './AnimatePanel'
import { ColorField, IconButton, NumberField, Section, Segmented, SelectField, TextField, Toggle } from './fields'
import { Glyph } from './Glyph'
import { AutoLayoutSection, ResizingSection } from './LayoutSection'
import { ALT, MOD, SHIFT } from './keys'
import { common, type Commit } from './values'

const DEFAULT_FILL = '#D9D3C7'
const DEFAULT_STROKE = '#1A1814'

const WEIGHT_NAMES: Record<number, string> = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extrabold',
}

export function PropertiesPanel() {
  const snap = useScene()
  const selection = useUI((s) => s.selection)
  const tab = useUI((s) => s.panelTab)
  const nodes = selection.flatMap((id) => snap.nodes.get(id) ?? [])
  return (
    <aside aria-label="Properties" className="flex w-[272px] shrink-0 flex-col border-l border-ink bg-paper">
      <PanelTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {nodes.length === 0 ? (
          <NothingSelected />
        ) : tab === 'design' ? (
          <Inspector snap={snap} nodes={nodes} />
        ) : (
          <AnimatePanel snap={snap} nodes={nodes} />
        )}
      </div>
    </aside>
  )
}

const TABS: [PanelTab, string][] = [
  ['design', 'Design'],
  ['animate', 'Animate'],
]

function PanelTabs() {
  const tab = useUI((s) => s.panelTab)
  const setTab = useUI((s) => s.setPanelTab)
  return (
    <div role="tablist" aria-label="Properties" className="flex h-10 shrink-0 items-end gap-5 border-b border-rule px-3">
      {TABS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab(value)}
          className={`-mb-px h-9 border-b-2 font-display text-head italic transition-colors ${
            tab === value ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Inspector({ snap, nodes }: { snap: SceneSnapshot; nodes: SceneNode[] }) {
  const store = useSceneStore()
  // Recording on the timeline turns animatable edits into keyframes at the playhead.
  const commit: Commit = (patches, merge) =>
    store.transact(() => {
      const target = recordTarget()
      const clip = target ? store.getAnimation(target.clipId) : undefined
      applyPatches(store, clip && target ? recordPatches(store, snap, clip, target.time, patches, merge) : patches)
    }, { merge })
  // Geometry edits are computed from this render's snapshot; during a scrub that's
  // the gesture's starting state, so absolute values never compound.
  const each = (fn: (node: SceneNode, out: PatchMap) => void, merge: boolean) => {
    const out: PatchMap = new Map()
    for (const node of nodes) fn(node, out)
    pinSizing(snap, out)
    constrainComponentPatches(store, snap, out)
    commit(out, merge)
  }
  const single = nodes.length === 1 ? nodes[0] : null
  const types = new Set(nodes.map((n) => n.type))
  const only = (type: SceneNode['type']) => types.size === 1 && types.has(type)
  const positions = nodes.map((n) => localPosition(snap, n.id))
  const boxes = nodes.map((n) => worldBox(snap, n.id))
  const paintable = nodes.filter((n): n is Extract<SceneNode, { stroke: unknown }> => 'stroke' in n)
  const rounded = nodes.filter((n): n is Extract<SceneNode, { cornerRadius: number }> => 'cornerRadius' in n)
  // A stack places its children; their X/Y are read-only.
  const stacked = nodes.some((n) => isStacked(snap, n.id))

  return (
    <>
      <header className="border-b border-ink px-3 pt-3 pb-2.5">
        <span className="smallcaps text-ink-3">{single ? TYPE_LABELS[single.type] : `${nodes.length} layers`}</span>
        {single ? (
          <NameInput key={single.id} store={store} node={single} />
        ) : (
          <p className="font-display text-title leading-tight italic">Mixed selection</p>
        )}
      </header>

      <AlignBar store={store} nodes={nodes} />

      {only('component') && <ComponentSection store={store} nodes={nodes as ComponentNode[]} />}

      <Section title="Position">
        <div className="grid grid-cols-2 gap-x-3">
          <NumberField
            label="X"
            title={stacked ? 'X, set by auto layout' : undefined}
            disabled={stacked}
            value={common(positions.map((p) => p.x))}
            onChange={(v, merge) => each((n, out) => setPosition(snap, n.id, 'x', v, out), merge)}
          />
          <NumberField
            label="Y"
            title={stacked ? 'Y, set by auto layout' : undefined}
            disabled={stacked}
            value={common(positions.map((p) => p.y))}
            onChange={(v, merge) => each((n, out) => setPosition(snap, n.id, 'y', v, out), merge)}
          />
          <NumberField
            label="W"
            min={0}
            value={common(boxes.map((b) => round2(b.width)))}
            onChange={(v, merge) => each((n, out) => setSize(snap, n.id, 'width', v, out), merge)}
          />
          <NumberField
            label="H"
            min={0}
            value={common(boxes.map((b) => round2(b.height)))}
            onChange={(v, merge) => each((n, out) => setSize(snap, n.id, 'height', v, out), merge)}
          />
          {!types.has('group') && (
            <NumberField
              label="°"
              title="Rotation"
              precision={1}
              value={common(nodes.map((n) => n.rotation))}
              onChange={(v, merge) => each((n, out) => setRotation(snap, n.id, v, out), merge)}
            />
          )}
          {rounded.length === nodes.length && (
            <NumberField
              label="R"
              title="Corner radius"
              min={0}
              value={common(rounded.map((n) => n.cornerRadius))}
              onChange={(cornerRadius, merge) => commit(nodes.map((n) => [n.id, { cornerRadius }]), merge)}
            />
          )}
        </div>
        {only('frame') && (
          <Toggle
            label="Clip content"
            checked={common((nodes as FrameNode[]).map((n) => n.clip))}
            onChange={(clip) => commit(nodes.map((n) => [n.id, { clip }]), false)}
          />
        )}
      </Section>

      {only('frame') && (
        <AutoLayoutSection key={nodes.map((n) => n.id).join('|')} store={store} frames={nodes as FrameNode[]} commit={commit} />
      )}
      <ResizingSection store={store} snap={snap} nodes={nodes} commit={commit} />

      <Section title="Layer">
        <NumberField
          label="Opacity"
          min={0}
          max={1}
          scale={100}
          precision={0}
          suffix="%"
          value={common(nodes.map((n) => n.opacity))}
          onChange={(opacity, merge) => commit(nodes.map((n) => [n.id, { opacity }]), merge)}
        />
      </Section>

      {paintable.length === nodes.length && <PaintSections nodes={paintable} commit={commit} />}
      {!types.has('group') && !types.has('component') && <ShadowSection nodes={nodes} commit={commit} />}
      {only('text') && <TypeSection nodes={nodes as TextNode[]} commit={commit} />}
      {only('image') && <ImageSection store={store} nodes={nodes as ImageNode[]} commit={commit} />}
    </>
  )
}

/** Props of a library component, driven by its spec's control schema. */
function ComponentSection({ store, nodes }: { store: SceneStore; nodes: ComponentNode[] }) {
  const key = common(nodes.map((n) => n.component))
  const spec = key ? getSpec(key) : undefined
  if (!spec) {
    return (
      <Section title="Component">
        <p className="text-caption text-ink-2">{key ? `Unknown component “${key}”.` : 'Different components selected.'}</p>
      </Section>
    )
  }
  const props = nodes.map(resolveProps)
  const set = (patch: Props, merge = false) => setComponentProps(store, nodes, patch, merge)
  return (
    <Section title={spec.name} aside={<span className="smallcaps text-ink-3">{LIBRARY_NAME}</span>}>
      <div className="flex flex-col gap-1">
        {Object.entries(spec.controls).map(([name, control]) => {
          const value = common(props.map((p) => p[name] ?? null))
          switch (control.kind) {
            case 'text':
              return (
                <TextField
                  key={name}
                  label={control.label}
                  multiline={control.multiline}
                  value={value === null ? null : String(value)}
                  onChange={(v) => set({ [name]: v })}
                />
              )
            case 'select':
              return (
                <SelectField
                  key={name}
                  label={control.label}
                  value={value === null ? null : String(value)}
                  options={control.options}
                  onChange={(v) => set({ [name]: v })}
                />
              )
            case 'boolean':
              return <Toggle key={name} label={control.label} checked={value === null ? null : value === true} onChange={(v) => set({ [name]: v })} />
            case 'number':
              return (
                <NumberField
                  key={name}
                  label={control.label}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  suffix={control.suffix}
                  precision={0}
                  value={typeof value === 'number' ? value : null}
                  onChange={(v, merge) => set({ [name]: v }, merge)}
                />
              )
          }
        })}
      </div>
      {spec.resize !== 'both' && (
        <p className="mt-2 text-caption leading-snug text-ink-3">
          {spec.resize === 'none' ? 'Sized by its content.' : 'Width is yours; height follows the content.'}
        </p>
      )}
    </Section>
  )
}

const ALIGN_BUTTONS: [AlignEdge, LucideIcon, string][] = [
  ['left', AlignStartVertical, `Align left (${ALT} A)`],
  ['center', AlignCenterVertical, `Align horizontal centers (${ALT} H)`],
  ['right', AlignEndVertical, `Align right (${ALT} D)`],
  ['top', AlignStartHorizontal, `Align top (${ALT} W)`],
  ['middle', AlignCenterHorizontal, `Align vertical centers (${ALT} V)`],
  ['bottom', AlignEndHorizontal, `Align bottom (${ALT} S)`],
]

/** A lone canvas-level node has nothing to align to; distribute needs three. */
function AlignBar({ store, nodes }: { store: SceneStore; nodes: SceneNode[] }) {
  const cannotAlign = nodes.length === 1 && nodes[0].parentId === null
  return (
    <div className="flex items-center justify-between border-b border-rule px-2 py-1">
      <div className="flex">
        {ALIGN_BUTTONS.map(([edge, icon, label]) => (
          <IconButton key={edge} label={label} disabled={cannotAlign} onClick={() => alignSelection(store, edge)}>
            <Glyph icon={icon} size={15} />
          </IconButton>
        ))}
      </div>
      <div className="flex border-l border-rule pl-1">
        <IconButton
          label={`Distribute horizontally (${ALT} ${SHIFT} H)`}
          disabled={nodes.length < 3}
          onClick={() => distributeSelection(store, 'horizontal')}
        >
          <Glyph icon={AlignHorizontalDistributeCenter} size={15} />
        </IconButton>
        <IconButton
          label={`Distribute vertically (${ALT} ${SHIFT} V)`}
          disabled={nodes.length < 3}
          onClick={() => distributeSelection(store, 'vertical')}
        >
          <Glyph icon={AlignVerticalDistributeCenter} size={15} />
        </IconButton>
      </div>
    </div>
  )
}

function NameInput({ store, node }: { store: SceneStore; node: SceneNode }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      aria-label="Layer name"
      spellCheck={false}
      value={draft ?? node.name}
      onFocus={() => setDraft(node.name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const name = e.target.value.trim()
        setDraft(null)
        if (name && name !== node.name) applyPatches(store, [[node.id, { name }]])
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(node.name)
          e.currentTarget.blur()
        }
      }}
      className="block w-full truncate border-b border-transparent bg-transparent font-display text-title leading-tight italic outline-none hover:border-rule focus:border-pencil"
      style={{ fontVariationSettings: '"opsz" 24' }}
    />
  )
}

function PaintSections({ nodes, commit }: { nodes: Extract<SceneNode, { stroke: unknown }>[]; commit: Commit }) {
  const fills = nodes.map((n) => n.fill)
  const strokes = nodes.map((n) => n.stroke)
  const hasFill = fills.some((f) => f !== null)
  const hasStroke = strokes.some((s) => s !== null)
  const set = (patch: NodePatch, merge = false) => commit(nodes.map((n) => [n.id, patch]), merge)

  return (
    <>
      <Section
        title="Fill"
        aside={
          hasFill ? (
            <IconButton label="Remove fill" onClick={() => set({ fill: null })}>
              <Glyph icon={Minus} />
            </IconButton>
          ) : (
            <IconButton label="Add fill" onClick={() => set({ fill: DEFAULT_FILL })}>
              <Glyph icon={Plus} />
            </IconButton>
          )
        }
      >
        {hasFill && <ColorField label="Fill" value={common(fills)} onChange={(fill, merge) => set({ fill }, merge)} />}
      </Section>

      <Section
        title="Stroke"
        aside={
          hasStroke ? (
            <IconButton label="Remove stroke" onClick={() => set({ stroke: null })}>
              <Glyph icon={Minus} />
            </IconButton>
          ) : (
            <IconButton label="Add stroke" onClick={() => set({ stroke: DEFAULT_STROKE, strokeWidth: 1 })}>
              <Glyph icon={Plus} />
            </IconButton>
          )
        }
      >
        {hasStroke && (
          <div className="grid grid-cols-[1fr_76px] gap-x-3">
            <ColorField label="Stroke" value={common(strokes)} onChange={(stroke, merge) => set({ stroke }, merge)} />
            <NumberField
              label="Wt"
              title="Stroke weight, drawn inside"
              min={0}
              value={common(nodes.map((n) => n.strokeWidth))}
              onChange={(strokeWidth, merge) => set({ strokeWidth }, merge)}
            />
          </div>
        )}
      </Section>
    </>
  )
}

function ShadowSection({ nodes, commit }: { nodes: SceneNode[]; commit: Commit }) {
  const shadows = nodes.map((n) => n.shadow)
  const has = shadows.some(Boolean)
  const field = <K extends keyof Shadow>(key: K) => common(shadows.map((s) => s?.[key] ?? null))
  const set = (patch: Partial<Shadow>, merge = false) =>
    commit(nodes.map((n) => [n.id, { shadow: { ...(n.shadow ?? DEFAULT_SHADOW), ...patch } }]), merge)

  return (
    <Section
      title="Shadow"
      aside={
        has ? (
          <IconButton label="Remove shadow" onClick={() => commit(nodes.map((n) => [n.id, { shadow: null }]), false)}>
            <Glyph icon={Minus} />
          </IconButton>
        ) : (
          <IconButton label="Add drop shadow" onClick={() => set({})}>
            <Glyph icon={Plus} />
          </IconButton>
        )
      }
    >
      {has && (
        <>
          <div className="grid grid-cols-3 gap-x-3">
            <NumberField label="X" value={field('x')} onChange={(x, merge) => set({ x }, merge)} />
            <NumberField label="Y" value={field('y')} onChange={(y, merge) => set({ y }, merge)} />
            <NumberField label="Blur" min={0} value={field('blur')} onChange={(blur, merge) => set({ blur }, merge)} />
          </div>
          <ColorField label="Shadow color" value={field('color')} onChange={(color, merge) => set({ color }, merge)} />
        </>
      )}
    </Section>
  )
}

function TypeSection({ nodes, commit }: { nodes: TextNode[]; commit: Commit }) {
  const family = common(nodes.map((n) => n.fontFamily))
  const weights = (family && CONTENT_FONTS[family]) || [300, 400, 500, 600, 700, 800]
  const set = (patch: Partial<TextNode>, merge = false) => commit(nodes.map((n) => [n.id, textPatch(n, patch)]), merge)

  return (
    <Section title="Type">
      <div className="flex flex-col gap-1">
        <SelectField
          label="Font family"
          value={family}
          options={Object.keys(CONTENT_FONTS).map((f) => ({ value: f, label: f }))}
          onChange={(fontFamily) => set({ fontFamily })}
        />
        <div className="grid grid-cols-2 gap-x-3">
          <SelectField
            label="Weight"
            value={common(nodes.map((n) => n.fontWeight))}
            options={weights.map((w) => ({ value: w, label: WEIGHT_NAMES[w] ?? String(w) }))}
            onChange={(fontWeight) => set({ fontWeight })}
          />
          <NumberField
            label="Size"
            min={1}
            precision={1}
            value={common(nodes.map((n) => n.fontSize))}
            onChange={(fontSize, merge) => set({ fontSize }, merge)}
          />
          <NumberField
            label="LH"
            title="Line height, as a multiple of size"
            min={0.5}
            step={0.05}
            value={common(nodes.map((n) => n.lineHeight))}
            onChange={(lineHeight, merge) => set({ lineHeight }, merge)}
          />
          <NumberField
            label="LS"
            title="Letter spacing, px"
            step={0.1}
            value={common(nodes.map((n) => n.letterSpacing))}
            onChange={(letterSpacing, merge) => set({ letterSpacing }, merge)}
          />
        </div>
        <ColorField label="Text color" value={common(nodes.map((n) => n.fill))} onChange={(fill, merge) => set({ fill }, merge)} />
        <div className="mt-2 flex flex-col gap-2">
          <Segmented<TextAlign>
            label="Alignment"
            value={common(nodes.map((n) => n.textAlign))}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(textAlign) => set({ textAlign })}
          />
          <Segmented<TextAutoResize>
            label="Sizing"
            value={common(nodes.map((n) => n.autoResize))}
            options={[
              { value: 'width', label: 'Auto width', title: 'Grows sideways; never wraps' },
              { value: 'height', label: 'Auto height', title: 'Fixed width; wraps and grows down' },
              { value: 'none', label: 'Fixed', title: 'Fixed box' },
            ]}
            onChange={(autoResize) => set({ autoResize })}
          />
        </div>
        <Toggle label="Italic" checked={common(nodes.map((n) => n.italic))} onChange={(italic) => set({ italic })} />
      </div>
    </Section>
  )
}

function ImageSection({ store, nodes, commit }: { store: SceneStore; nodes: ImageNode[]; commit: Commit }) {
  const replace = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const asset = await importImageFile(file)
      addAsset(store, asset)
      commit(nodes.map((n) => [n.id, { assetId: asset.id }]), false)
    }
    input.click()
  }
  return (
    <Section title="Image">
      <Segmented<ImageFit>
        label="Fit"
        value={common(nodes.map((n) => n.fit))}
        options={[
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Stretch' },
        ]}
        onChange={(fit) => commit(nodes.map((n) => [n.id, { fit }]), false)}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={replace}
        className="mt-2 h-7 w-full border border-ink text-ui transition-colors hover:bg-paper-sunk"
      >
        Replace image…
      </button>
    </Section>
  )
}

const KEY_INDEX: [string, string][] = [
  ['Frame', 'F'],
  ['Rectangle', 'R'],
  ['Ellipse', 'O'],
  ['Text', 'T'],
  ['Place image', 'I'],
  ['Pan', 'Space + drag'],
  ['Zoom', `${MOD} + scroll`],
  ['Fit everything', `${SHIFT} 1`],
  ['Group', `${MOD} G`],
  ['Frame selection', `${MOD} ${ALT} G`],
  ['Auto layout', `${SHIFT} A`],
  ['Duplicate', `${MOD} D  ·  ${ALT} drag`],
  ['Align left', `${ALT} A`],
  ['Move without snapping', `${MOD} drag`],
  ['Preview', `${MOD} ${ALT} ↵`],
  ['Undo', `${MOD} Z`],
]

function NothingSelected() {
  return (
    <div className="px-4 pt-6 pb-4">
      <p className="font-display text-title italic">Nothing selected</p>
      <p className="mt-1 text-ink-2">Click something on the desk, or set a new frame to start a layout.</p>
      <h3 className="section-head mt-7 mb-2">Index of keys</h3>
      <dl className="flex flex-col gap-1.5">
        {KEY_INDEX.map(([label, keys]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="shrink-0">{label}</dt>
            <span aria-hidden className="min-w-2 flex-1 -translate-y-[3px] border-b border-dotted border-ink-3" />
            <dd className="shrink-0 font-mono text-caption text-ink-2">{keys}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
