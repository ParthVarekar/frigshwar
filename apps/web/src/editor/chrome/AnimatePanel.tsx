import {
  APPEAR_PRESETS,
  appearPresetState,
  applyPatches,
  CURVE_PRESETS,
  LOOP_PRESETS,
  round2,
  type AppearEffect,
  type AppearPreset,
  type LoopEffect,
  type LoopPreset,
  type MotionState,
  type NodePatch,
  type SceneNode,
  type SceneSnapshot,
  type ScrollEffect,
  type ScrollSource,
  type Shadow,
  type StateStyle,
} from '@codeframe/scene'
import { Minus, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { openPreview, playAppear } from '../commands'
import { useSceneStore } from '../scene-context'
import { ColorField, IconButton, NumberField, Section, Segmented, SelectField, Toggle } from './fields'
import { Glyph } from './Glyph'
import { InteractionsSection } from './InteractionsSection'
import { ALT, MOD } from './keys'
import { CurveField, MotionStateFields, TimingFields } from './motion-fields'
import { common } from './values'

/**
 * The Animate tab: interactions (triggers and actions), hover and press states,
 * appear, scroll transform, parallax and loop effects. Every control maps to a
 * CSS construct or to the motion runtime, so the values here are what ships.
 */

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

const LIFT_SHADOW: Shadow = { x: 0, y: 12, blur: 28, color: '#1A181438' }
const DEFAULT_APPEAR: AppearEffect = {
  from: appearPresetState('slide-up'),
  trigger: 'load',
  once: true,
  amount: 0.3,
  timing: { duration: 600, delay: 0, curve: CURVE_PRESETS['ease-out'] },
}
const DEFAULT_LOOP: LoopEffect = { preset: 'float', duration: 3000, curve: CURVE_PRESETS['ease-in-out'] }
const DEFAULT_SCROLL: ScrollEffect = {
  source: 'in-view',
  keyframes: [
    { at: 0, state: { opacity: 0, y: 40 } },
    { at: 0.5, state: { opacity: 1, y: 0 } },
  ],
}

type PatchEach = (fn: (node: SceneNode) => NodePatch, merge?: boolean) => void

export function AnimatePanel({ snap, nodes }: { snap: SceneSnapshot; nodes: SceneNode[] }) {
  const store = useSceneStore()
  const patchEach: PatchEach = (fn, merge = false) =>
    store.transact(() => applyPatches(store, nodes.map((n) => [n.id, fn(n)])), { merge })

  return (
    <>
      <InteractionsSection snap={snap} nodes={nodes} />
      <StateSection title="Hover" state="hover" nodes={nodes} patchEach={patchEach} />
      <StateSection title="Press" state="press" nodes={nodes} patchEach={patchEach} />
      {nodes.some((n) => n.hover || n.press) && <TransitionSection nodes={nodes} patchEach={patchEach} />}
      <AppearSection nodes={nodes} patchEach={patchEach} onPlay={() => playAppear(store)} />
      <ScrollSection nodes={nodes} patchEach={patchEach} />
      <ParallaxSection nodes={nodes} patchEach={patchEach} />
      <LoopSection nodes={nodes} patchEach={patchEach} />
      <p className="px-3 py-4 text-caption text-ink-2">
        Hover, press, scroll and click through it in{' '}
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
          <MotionStateFields states={states.map((s) => s ?? {})} onChange={set} />
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
  return (
    <Section title="State transition">
      <TimingFields
        timings={nodes.map((n) => n.transition)}
        onChange={(patch, merge) => patchEach((n) => ({ transition: { ...n.transition, ...patch } }), merge)}
      />
    </Section>
  )
}

const STATE_KEYS = ['opacity', 'scale', 'rotate', 'x', 'y', 'blur'] as const
const sameState = (a: MotionState, b: MotionState) => STATE_KEYS.every((k) => a[k] === b[k])
const slideDistance = (from: MotionState) => Math.abs(from.x || from.y || 0) || 24

function appearPreset(effect: AppearEffect): AppearPreset | 'custom' {
  return APPEAR_PRESETS.find((p) => sameState(appearPresetState(p, slideDistance(effect.from)), effect.from)) ?? 'custom'
}

function AppearSection({ nodes, patchEach, onPlay }: { nodes: SceneNode[]; patchEach: PatchEach; onPlay: () => void }) {
  const [editStart, setEditStart] = useState(false)
  const effects = nodes.map((n) => n.appear).filter((a): a is AppearEffect => a !== null)
  const enabled = effects.length > 0
  const update = (fn: (effect: AppearEffect) => AppearEffect, merge = false) =>
    patchEach((n) => ({ appear: fn(n.appear ?? DEFAULT_APPEAR) }), merge)
  const preset = common(effects.map(appearPreset))
  const trigger = common(effects.map((a) => a.trigger))

  return (
    <Section
      title="Appear"
      aside={
        <ToggleSectionButton
          on={enabled}
          label="appear animation"
          onAdd={() => update((a) => a)}
          onRemove={() => patchEach(() => ({ appear: null }))}
        />
      }
    >
      {enabled && (
        <div className="flex flex-col gap-1">
          <SelectField
            label="Appear effect"
            value={preset}
            options={[...APPEAR_PRESETS.map((p) => ({ value: p as AppearPreset | 'custom', label: APPEAR_LABELS[p] })), { value: 'custom', label: 'Custom start state' }]}
            onChange={(p) => {
              if (p === 'custom') setEditStart(true)
              else update((a) => ({ ...a, from: appearPresetState(p, slideDistance(a.from)) }))
            }}
          />
          <SelectField
            label="Trigger"
            value={trigger}
            options={[
              { value: 'load', label: 'When the page loads' },
              { value: 'in-view', label: 'When scrolled into view' },
            ]}
            onChange={(next) => update((a) => ({ ...a, trigger: next }))}
          />
          {preset?.startsWith('slide') && !editStart && (
            <NumberField
              label="Dist"
              title="Slide distance"
              suffix="px"
              min={0}
              value={common(effects.map((a) => slideDistance(a.from)))}
              onChange={(distance, merge) =>
                update((a) => {
                  const p = appearPreset(a)
                  return p === 'custom' ? a : { ...a, from: appearPresetState(p, distance) }
                }, merge)
              }
            />
          )}
          {(preset === 'custom' || editStart) && (
            <>
              <h4 className="smallcaps mt-1 text-ink-3">Starts from</h4>
              <MotionStateFields states={effects.map((a) => a.from)} onChange={(patch, merge) => update((a) => ({ ...a, from: { ...a.from, ...patch } }), merge)} />
            </>
          )}
          <TimingFields
            timings={effects.map((a) => a.timing)}
            onChange={(patch, merge) => update((a) => ({ ...a, timing: { ...a.timing, ...patch } }), merge)}
          />
          {trigger === 'in-view' && (
            <>
              <NumberField
                label="Show"
                title="How much of the layer must be visible"
                suffix="%"
                scale={100}
                precision={0}
                step={5}
                min={0}
                max={1}
                value={common(effects.map((a) => a.amount))}
                onChange={(amount, merge) => update((a) => ({ ...a, amount }), merge)}
              />
              <Toggle label="Replay each time it enters" checked={common(effects.map((a) => !a.once))} onChange={(on) => update((a) => ({ ...a, once: !on }))} />
            </>
          )}
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

function ScrollSection({ nodes, patchEach }: { nodes: SceneNode[]; patchEach: PatchEach }) {
  const effects = nodes.map((n) => n.scroll).filter((e): e is ScrollEffect => e !== null)
  const enabled = effects.length > 0
  const single = nodes.length === 1 ? nodes[0].scroll : null
  const update = (fn: (effect: ScrollEffect) => ScrollEffect, merge = false) => patchEach((n) => ({ scroll: fn(n.scroll ?? DEFAULT_SCROLL) }), merge)
  const setKeyframe = (i: number, fn: (k: ScrollEffect['keyframes'][number]) => ScrollEffect['keyframes'][number], merge = false) =>
    update((e) => ({ ...e, keyframes: e.keyframes.map((k, j) => (j === i ? fn(k) : k)) }), merge)
  const source = common(effects.map((e) => e.source))

  return (
    <Section
      title="Scroll transform"
      aside={
        <ToggleSectionButton on={enabled} label="scroll transform" onAdd={() => update((e) => e)} onRemove={() => patchEach(() => ({ scroll: null }))} />
      }
    >
      {enabled && (
        <div className="flex flex-col gap-1">
          <Segmented<ScrollSource>
            label="Progress from"
            value={source}
            options={[
              { value: 'in-view', label: 'Layer in view', title: 'From entering the viewport to leaving it' },
              { value: 'page', label: 'Page scroll', title: 'From the top of the page to the bottom' },
            ]}
            onChange={(next) => update((e) => ({ ...e, source: next }))}
          />
          {single ? (
            <>
              {single.keyframes.map((k, i) => (
                <div key={i} className="mt-1 border-l border-ink pl-2.5">
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <NumberField
                        label="At"
                        title="Scroll progress"
                        suffix="%"
                        scale={100}
                        precision={0}
                        step={5}
                        min={0}
                        max={1}
                        value={k.at}
                        onChange={(at, merge) => setKeyframe(i, (kf) => ({ ...kf, at }), merge)}
                      />
                    </div>
                    {single.keyframes.length > 2 && (
                      <IconButton label="Remove keyframe" onClick={() => update((e) => ({ ...e, keyframes: e.keyframes.filter((_, j) => j !== i) }))}>
                        <Glyph icon={Minus} />
                      </IconButton>
                    )}
                  </div>
                  <MotionStateFields states={[k.state]} onChange={(patch, merge) => setKeyframe(i, (kf) => ({ ...kf, state: { ...kf.state, ...patch } }), merge)} />
                </div>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  update((e) => {
                    const last = e.keyframes[e.keyframes.length - 1]
                    return { ...e, keyframes: [...e.keyframes, { at: Math.min(1, round2(last.at + 0.25)), state: { ...last.state } }] }
                  })
                }
                className="flex h-6 items-center gap-1 text-caption text-ink-2 hover:text-ink"
              >
                <Glyph icon={Plus} size={11} />
                Add keyframe
              </button>
            </>
          ) : (
            <p className="text-caption text-ink-2">Select one layer to edit its keyframes.</p>
          )}
        </div>
      )}
    </Section>
  )
}

function ParallaxSection({ nodes, patchEach }: { nodes: SceneNode[]; patchEach: PatchEach }) {
  const speeds = nodes.map((n) => n.parallax?.speed ?? null)
  const enabled = speeds.some((s) => s !== null)
  return (
    <Section
      title="Parallax"
      aside={
        <ToggleSectionButton
          on={enabled}
          label="parallax"
          onAdd={() => patchEach(() => ({ parallax: { speed: 0.8 } }))}
          onRemove={() => patchEach(() => ({ parallax: null }))}
        />
      }
    >
      {enabled && (
        <>
          <NumberField
            label="Speed"
            title="Scroll speed relative to the page"
            suffix="%"
            scale={100}
            precision={0}
            step={5}
            min={-5}
            max={5}
            value={common(speeds)}
            onChange={(speed, merge) => patchEach(() => ({ parallax: { speed } }), merge)}
          />
          <p className="mt-1 text-caption leading-snug text-ink-3">100% moves with the page. Lower lags behind; 0% holds still.</p>
        </>
      )}
    </Section>
  )
}

function LoopSection({ nodes, patchEach }: { nodes: SceneNode[]; patchEach: PatchEach }) {
  const list = nodes.map((n) => n.loop)
  const enabled = list.some(Boolean)
  const value = <K extends keyof LoopEffect>(key: K) => common(list.map((l) => l?.[key] ?? null))
  const set = (patch: Partial<LoopEffect>, merge = false) =>
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
            onChange={(preset) => set(preset === 'spin' ? { preset, curve: CURVE_PRESETS.linear } : { preset })}
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
          <CurveField curves={list.flatMap((l) => (l ? [l.curve] : []))} onChange={(curve, merge) => set({ curve }, merge)} />
        </div>
      )}
    </Section>
  )
}
