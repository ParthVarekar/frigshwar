import {
  CURVE_PRESETS,
  curvePreset,
  DIRECTIONS,
  springDuration,
  TRANSITION_TYPES,
  type Curve,
  type CurvePreset,
  type Direction,
  type MotionState,
  type ScreenTransition,
  type SpringCurve,
  type Timing,
  type TransitionType,
} from '@codeframe/scene'
import { Spline } from 'lucide-react'
import { useState } from 'react'
import { CurveEditor } from './CurveEditor'
import { NumberField, Popover, SelectField } from './fields'
import { Glyph } from './Glyph'
import { common } from './values'

/** Controls shared by the Animate tab's sections: curves, timing, screen transitions, motion states. */

const CURVE_LABELS: Record<CurvePreset, string> = {
  linear: 'Linear',
  ease: 'Ease',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in and out',
  'ease-in-back': 'Ease in back',
  'ease-out-back': 'Ease out back',
  'ease-in-out-back': 'Ease in and out back',
  gentle: 'Spring: gentle',
  quick: 'Spring: quick',
  bouncy: 'Spring: bouncy',
  slow: 'Spring: slow',
}

type CurveChoice = CurvePreset | 'custom'

const CURVE_OPTIONS: { value: CurveChoice; label: string }[] = [
  ...(Object.keys(CURVE_LABELS) as CurvePreset[]).map((value) => ({ value, label: CURVE_LABELS[value] })),
  { value: 'custom', label: 'Custom…' },
]

const TRANSITION_LABELS: Record<TransitionType, string> = {
  instant: 'Instant',
  dissolve: 'Dissolve',
  'smart-animate': 'Smart animate',
  'move-in': 'Move in',
  'move-out': 'Move out',
  push: 'Push',
  'slide-in': 'Slide in',
  'slide-out': 'Slide out',
}

const DIRECTION_LABELS: Record<Direction, string> = { left: 'Toward the left', right: 'Toward the right', up: 'Upward', down: 'Downward' }
const DIRECTIONAL: ReadonlySet<TransitionType> = new Set(['move-in', 'move-out', 'push', 'slide-in', 'slide-out'])

/** Easing preset picker with a curve editor. Springs set their own duration, so their settling time shows instead. */
export function CurveField(props: { curves: Curve[]; onChange: (curve: Curve, merge?: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const choice = common(props.curves.map((c): CurveChoice => curvePreset(c) ?? 'custom'))
  const springs = props.curves.filter((c): c is SpringCurve => c.type === 'spring')
  const settle = springs.length > 0 && springs.length === props.curves.length ? common(springs.map(springDuration)) : null
  return (
    <>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SelectField label="Easing" value={choice} options={CURVE_OPTIONS} onChange={(name) => (name === 'custom' ? setOpen(true) : props.onChange(CURVE_PRESETS[name]))} />
        </div>
        <button
          ref={setAnchor}
          type="button"
          title="Edit the curve"
          aria-label="Edit the curve"
          aria-expanded={open}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center transition-colors ${open ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-sunk hover:text-ink'}`}
        >
          <Glyph icon={Spline} size={13} />
        </button>
      </div>
      {settle !== null && (
        <p className="mt-1 text-caption text-ink-2">
          Settles in <span className="font-mono">{settle} ms</span>
        </p>
      )}
      {open && props.curves.length > 0 && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} className="p-3" height={420}>
          <CurveEditor curve={props.curves[0]} onChange={(curve, merge) => props.onChange(curve, merge)} />
        </Popover>
      )}
    </>
  )
}

export function TimingFields(props: { timings: Timing[]; onChange: (patch: Partial<Timing>, merge?: boolean) => void; delay?: boolean }) {
  const { timings, onChange } = props
  const springs = timings.length > 0 && timings.every((t) => t.curve.type === 'spring')
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3">
        {!springs && (
          <NumberField
            label="Time"
            suffix="ms"
            precision={0}
            step={50}
            min={0}
            max={20000}
            value={common(timings.map((t) => t.duration))}
            onChange={(duration, merge) => onChange({ duration }, merge)}
          />
        )}
        {props.delay !== false && (
          <NumberField
            label="Delay"
            suffix="ms"
            precision={0}
            step={50}
            min={0}
            max={20000}
            value={common(timings.map((t) => t.delay))}
            onChange={(delay, merge) => onChange({ delay }, merge)}
          />
        )}
      </div>
      <CurveField curves={timings.map((t) => t.curve)} onChange={(curve, merge) => onChange({ curve }, merge)} />
    </>
  )
}

export function TransitionFields(props: {
  transitions: ScreenTransition[]
  onUpdate: (fn: (transition: ScreenTransition) => ScreenTransition, merge?: boolean) => void
  types?: readonly TransitionType[]
}) {
  const { transitions, onUpdate } = props
  const type = common(transitions.map((t) => t.type))
  return (
    <>
      <SelectField
        label="Animation"
        value={type}
        options={(props.types ?? TRANSITION_TYPES).map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))}
        onChange={(next) => onUpdate((t) => ({ ...t, type: next }))}
      />
      {type !== null && DIRECTIONAL.has(type) && (
        <SelectField
          label="Direction"
          value={common(transitions.map((t) => t.direction))}
          options={DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABELS[d] }))}
          onChange={(direction) => onUpdate((t) => ({ ...t, direction }))}
        />
      )}
      {type !== 'instant' && (
        <TimingFields
          timings={transitions.map((t) => t.timing)}
          delay={false}
          onChange={(patch, merge) => onUpdate((t) => ({ ...t, timing: { ...t.timing, ...patch } }), merge)}
        />
      )}
    </>
  )
}

/** Opacity, scale, offset, rotation and blur: a start state, a scroll keyframe. Unset values show as the layer's own. */
export function MotionStateFields(props: { states: MotionState[]; onChange: (patch: Partial<MotionState>, merge: boolean) => void }) {
  const value = (key: keyof MotionState, fallback: number) => common(props.states.map((s) => s[key] ?? fallback))
  const { onChange } = props
  return (
    <div className="grid grid-cols-2 gap-x-3">
      <NumberField label="Op" title="Opacity" scale={100} precision={0} suffix="%" min={0} max={1} value={value('opacity', 1)} onChange={(opacity, merge) => onChange({ opacity }, merge)} />
      <NumberField label="Sc" title="Scale" scale={100} precision={0} suffix="%" min={0} max={10} value={value('scale', 1)} onChange={(scale, merge) => onChange({ scale }, merge)} />
      <NumberField label="X" title="Offset right" value={value('x', 0)} onChange={(x, merge) => onChange({ x }, merge)} />
      <NumberField label="Y" title="Offset down" value={value('y', 0)} onChange={(y, merge) => onChange({ y }, merge)} />
      <NumberField label="°" title="Extra rotation" precision={1} value={value('rotate', 0)} onChange={(rotate, merge) => onChange({ rotate }, merge)} />
      <NumberField label="Blur" suffix="px" min={0} max={500} value={value('blur', 0)} onChange={(blur, merge) => onChange({ blur }, merge)} />
    </div>
  )
}
