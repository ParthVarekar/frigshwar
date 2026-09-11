import {
  APPEAR_PRESETS,
  applyPatches,
  childrenOf,
  EASINGS,
  LINK_TRANSITIONS,
  LOOP_PRESETS,
  pathTo,
  type AppearAnimation,
  type AppearPreset,
  type Easing,
  type LinkTransition,
  type LoopAnimation,
  type LoopPreset,
  type NodeId,
  type NodePatch,
  type PrototypeLink,
  type SceneNode,
  type SceneSnapshot,
  type Shadow,
  type StateStyle,
  type Transition,
} from '@codeframe/scene'
import { Minus, Play, Plus } from 'lucide-react'
import { openPreview, playAppear } from '../commands'
import { useSceneStore } from '../scene-context'
import { ColorField, IconButton, NumberField, Section, SelectField, Toggle } from './fields'
import { Glyph } from './Glyph'
import { ALT, MOD } from './keys'
import { common } from './values'

/**
 * The Animate tab: interaction states, appear and loop motion, and prototype
 * links. Every control corresponds to a CSS construct (transition, :hover,
 * :active, @keyframes), so the values here are the values that ship.
 */

const EASING_LABELS: Record<Easing, string> = {
  linear: 'Linear',
  ease: 'Ease',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in and out',
  spring: 'Spring (overshoot)',
}

const APPEAR_LABELS: Record<AppearPreset, string> = {
  fade: 'Fade in',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  scale: 'Scale in',
  blur: 'Blur in',
}

const LOOP_LABELS: Record<LoopPreset, string> = {
  pulse: 'Pulse',
  spin: 'Spin',
  bounce: 'Bounce',
  float: 'Float',
  wiggle: 'Wiggle',
}

const LINK_LABELS: Record<LinkTransition, string> = {
  instant: 'Instant',
  dissolve: 'Dissolve',
  'slide-left': 'Slide in from right',
  'slide-right': 'Slide in from left',
  'slide-up': 'Slide in from below',
  'slide-down': 'Slide in from above',
  'push-left': 'Push left',
  'push-right': 'Push right',
}

const EASING_OPTIONS = EASINGS.map((e) => ({ value: e, label: EASING_LABELS[e] }))
const LIFT_SHADOW: Shadow = { x: 0, y: 12, blur: 28, color: '#1A181438' }
const DEFAULT_APPEAR: AppearAnimation = { preset: 'slide-up', duration: 600, delay: 0, easing: 'ease-out', distance: 24 }
const DEFAULT_LOOP: LoopAnimation = { preset: 'float', duration: 3000, easing: 'ease-in-out' }

type PatchEach = (fn: (node: SceneNode) => NodePatch, merge?: boolean) => void

export function AnimatePanel({ snap, nodes }: { snap: SceneSnapshot; nodes: SceneNode[] }) {
  const store = useSceneStore()
  const patchEach: PatchEach = (fn, merge = false) =>
    store.transact(() => applyPatches(store, nodes.map((n) => [n.id, fn(n)])), { merge })

  return (
    <>
      <StateSection title="Hover" state="hover" nodes={nodes} patchEach={patchEach} />
      <StateSection title="Press" state="press" nodes={nodes} patchEach={patchEach} />
      {nodes.some((n) => n.hover || n.press) && <TransitionSection nodes={nodes} patchEach={patchEach} />}
      <AppearSection nodes={nodes} patchEach={patchEach} onPlay={() => playAppear(store)} />
      <LoopSection nodes={nodes} patchEach={patchEach} />
      <LinkSection snap={snap} nodes={nodes} patchEach={patchEach} />
      <p className="px-3 py-4 text-caption text-ink-2">
        Hover, press and click through it in{' '}
        <button
          type="button"
          onClick={() => openPreview(store)}
          className="text-ink underline decoration-pencil decoration-1 underline-offset-2"
        >
          Preview
        </button>{' '}
        <kbd className="font-mono text-ink-3">
          {MOD} {ALT} ↵
        </kbd>
      </p>
    </>
  )
}

function ToggleSectionButton(props: { on: boolean; label: string; onAdd: () => void; onRemove: () => void }) {
  return props.on ? (
    <IconButton label={`Remove ${props.label}`} onClick={props.onRemove}>
      <Glyph icon={Minus} />
    </IconButton>
  ) : (
    <IconButton label={`Add ${props.label}`} onClick={props.onAdd}>
      <Glyph icon={Plus} />
    </IconButton>
  )
}

function StateSection(props: { title: string; state: 'hover' | 'press'; nodes: SceneNode[]; patchEach: PatchEach }) {
  const { title, state, nodes, patchEach } = props
  const states = nodes.map((n) => n[state])
  const enabled = states.some(Boolean)
  const write = (next: StateStyle | null): NodePatch => (state === 'hover' ? { hover: next } : { press: next })
  const value = <K extends 'scale' | 'opacity' | 'x' | 'y' | 'rotate'>(key: K, fallback: number) =>
    common(states.map((s) => s?.[key] ?? fallback))
  const set = (patch: Partial<StateStyle>, merge = false) => patchEach((n) => write({ ...n[state], ...patch }), merge)
  const unset = (key: keyof StateStyle) =>
    patchEach((n) => {
      const next = { ...n[state] }
      delete next[key]
      return write(next)
    })
  const fillable = nodes.every((n) => n.type !== 'image' && n.type !== 'group')
  const fills = states.map((s) => s?.fill ?? null)

  return (
    <Section
      title={title}
      aside={
        <ToggleSectionButton
          on={enabled}
          label={`${title.toLowerCase()} state`}
          onAdd={() => patchEach(() => write(state === 'hover' ? { scale: 1.03 } : { scale: 0.97 }))}
          onRemove={() => patchEach(() => write(null))}
        />
      }
    >
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField
              label="Scale"
              scale={100}
              precision={0}
              suffix="%"
              min={0}
              max={10}
              value={value('scale', 1)}
              onChange={(scale, merge) => set({ scale }, merge)}
            />
            <NumberField
              label="Opacity"
              scale={100}
              precision={0}
              suffix="%"
              min={0}
              max={1}
              value={value('opacity', 1)}
              onChange={(opacity, merge) => set({ opacity }, merge)}
            />
            <NumberField label="X" title="Move right" value={value('x', 0)} onChange={(x, merge) => set({ x }, merge)} />
            <NumberField label="Y" title="Move down" value={value('y', 0)} onChange={(y, merge) => set({ y }, merge)} />
            <NumberField
              label="°"
              title="Extra rotation"
              precision={1}
              value={value('rotate', 0)}
              onChange={(rotate, merge) => set({ rotate }, merge)}
            />
          </div>
          {fillable &&
            (fills.some(Boolean) ? (
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <ColorField label={`${title} fill`} value={common(fills)} onChange={(fill, merge) => set({ fill }, merge)} />
                </div>
                <IconButton label="Keep the original fill" onClick={() => unset('fill')}>
                  <Glyph icon={Minus} />
                </IconButton>
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  patchEach((n) =>
                    write({ ...n[state], fill: 'fill' in n && typeof n.fill === 'string' ? n.fill : '#1A1814' }),
                  )
                }
                className="mt-1 flex h-7 items-center gap-1 text-caption text-ink-2 hover:text-ink"
              >
                <Glyph icon={Plus} size={11} />
                Change fill
              </button>
            ))}
          <Toggle
            label="Lift shadow"
            checked={common(states.map((s) => Boolean(s?.shadow)))}
            onChange={(on) => (on ? set({ shadow: LIFT_SHADOW }) : unset('shadow'))}
          />
        </>
      )}
    </Section>
  )
}

function TransitionSection({ nodes, patchEach }: { nodes: SceneNode[]; patchEach: PatchEach }) {
  const timing = nodes.map((n) => n.transition)
  const set = (patch: Partial<Transition>, merge = false) => patchEach((n) => ({ transition: { ...n.transition, ...patch } }), merge)
  return (
    <Section title="State transition">
      <div className="grid grid-cols-2 gap-x-3">
        <NumberField
          label="Time"
          suffix="ms"
          precision={0}
          step={10}
          min={0}
          max={20000}
          value={common(timing.map((t) => t.duration))}
          onChange={(duration, merge) => set({ duration }, merge)}
        />
        <NumberField
          label="Delay"
          suffix="ms"
          precision={0}
          step={10}
          min={0}
          max={20000}
          value={common(timing.map((t) => t.delay))}
          onChange={(delay, merge) => set({ delay }, merge)}
        />
      </div>
      <SelectField label="Easing" value={common(timing.map((t) => t.easing))} options={EASING_OPTIONS} onChange={(easing) => set({ easing })} />
    </Section>
  )
}

function AppearSection({ nodes, patchEach, onPlay }: { nodes: SceneNode[]; patchEach: PatchEach; onPlay: () => void }) {
  const list = nodes.map((n) => n.appear)
  const enabled = list.some(Boolean)
  const value = <K extends keyof AppearAnimation>(key: K) => common(list.map((a) => a?.[key] ?? null))
  const set = (patch: Partial<AppearAnimation>, merge = false) =>
    patchEach((n) => ({ appear: { ...(n.appear ?? DEFAULT_APPEAR), ...patch } }), merge)

  return (
    <Section
      title="Appear"
      aside={
        <ToggleSectionButton
          on={enabled}
          label="appear animation"
          onAdd={() => set({})}
          onRemove={() => patchEach(() => ({ appear: null }))}
        />
      }
    >
      {enabled && (
        <div className="flex flex-col gap-1">
          <SelectField
            label="Appear effect"
            value={value('preset')}
            options={APPEAR_PRESETS.map((p) => ({ value: p, label: APPEAR_LABELS[p] }))}
            onChange={(preset) => set({ preset })}
          />
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField
              label="Time"
              suffix="ms"
              precision={0}
              step={50}
              min={0}
              value={value('duration')}
              onChange={(duration, merge) => set({ duration }, merge)}
            />
            <NumberField
              label="Delay"
              suffix="ms"
              precision={0}
              step={50}
              min={0}
              value={value('delay')}
              onChange={(delay, merge) => set({ delay }, merge)}
            />
            {list.some((a) => a?.preset.startsWith('slide')) && (
              <NumberField
                label="Dist"
                title="Slide distance"
                suffix="px"
                min={0}
                value={value('distance')}
                onChange={(distance, merge) => set({ distance }, merge)}
              />
            )}
          </div>
          <SelectField label="Easing" value={value('easing')} options={EASING_OPTIONS} onChange={(easing) => set({ easing })} />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onPlay}
            className="mt-2 flex h-7 items-center justify-center gap-1.5 border border-ink text-ui transition-colors hover:bg-paper-sunk"
          >
            <Glyph icon={Play} size={12} />
            Play on canvas
          </button>
        </div>
      )}
    </Section>
  )
}

function LoopSection({ nodes, patchEach }: { nodes: SceneNode[]; patchEach: PatchEach }) {
  const list = nodes.map((n) => n.loop)
  const enabled = list.some(Boolean)
  const value = <K extends keyof LoopAnimation>(key: K) => common(list.map((l) => l?.[key] ?? null))
  const set = (patch: Partial<LoopAnimation>, merge = false) =>
    patchEach((n) => ({ loop: { ...(n.loop ?? DEFAULT_LOOP), ...patch } }), merge)

  return (
    <Section
      title="Loop"
      aside={
        <ToggleSectionButton on={enabled} label="loop animation" onAdd={() => set({})} onRemove={() => patchEach(() => ({ loop: null }))} />
      }
    >
      {enabled && (
        <div className="flex flex-col gap-1">
          <SelectField
            label="Loop effect"
            value={value('preset')}
            options={LOOP_PRESETS.map((p) => ({ value: p, label: LOOP_LABELS[p] }))}
            onChange={(preset) => set({ preset, easing: preset === 'spin' ? 'linear' : value('easing') ?? 'ease-in-out' })}
          />
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField
              label="Cycle"
              suffix="ms"
              precision={0}
              step={100}
              min={50}
              value={value('duration')}
              onChange={(duration, merge) => set({ duration }, merge)}
            />
          </div>
          <SelectField label="Easing" value={value('easing')} options={EASING_OPTIONS} onChange={(easing) => set({ easing })} />
        </div>
      )}
    </Section>
  )
}

function LinkSection({ snap, nodes, patchEach }: { snap: SceneSnapshot; nodes: SceneNode[]; patchEach: PatchEach }) {
  const links = nodes.map((n) => n.link)
  const enabled = links.some(Boolean)
  const frames = childrenOf(snap, null).filter((id) => snap.nodes.get(id)?.type === 'frame')
  const ownFrame = pathTo(snap, nodes[0].id)[0]
  const firstOther: NodeId | 'back' = frames.find((id) => id !== ownFrame) ?? 'back'
  const value = <K extends keyof PrototypeLink>(key: K) => common(links.map((l) => l?.[key] ?? null))
  const set = (patch: Partial<PrototypeLink>, merge = false) =>
    patchEach(
      (n) => ({ link: { ...(n.link ?? { target: firstOther, transition: 'dissolve', duration: 300, easing: 'ease-out' }), ...patch } }),
      merge,
    )
  const target = value('target')
  const missing = target !== null && target !== 'back' && snap.nodes.get(target)?.type !== 'frame'

  return (
    <Section
      title="On click"
      aside={
        <ToggleSectionButton on={enabled} label="click action" onAdd={() => set({})} onRemove={() => patchEach(() => ({ link: null }))} />
      }
    >
      {enabled && (
        <div className="flex flex-col gap-1">
          <SelectField
            label="Go to"
            value={missing ? null : target}
            options={[
              ...frames.map((id) => ({ value: id as string, label: `Go to ${snap.nodes.get(id)!.name}` })),
              { value: 'back', label: 'Go back' },
            ]}
            onChange={(next) => set({ target: next })}
          />
          {missing && <p className="text-caption text-ink-2">The target frame no longer exists. Pick another.</p>}
          <SelectField
            label="Transition"
            value={value('transition')}
            options={LINK_TRANSITIONS.map((t) => ({ value: t, label: LINK_LABELS[t] }))}
            onChange={(transition) => set({ transition })}
          />
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField
              label="Time"
              suffix="ms"
              precision={0}
              step={50}
              min={0}
              value={value('duration')}
              onChange={(duration, merge) => set({ duration }, merge)}
            />
          </div>
          <SelectField label="Easing" value={value('easing')} options={EASING_OPTIONS} onChange={(easing) => set({ easing })} />
        </div>
      )}
    </Section>
  )
}
