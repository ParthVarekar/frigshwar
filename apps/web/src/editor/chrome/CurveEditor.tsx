import { CURVE_PRESETS, springDuration, springValue, type BezierCurve, type Curve, type SpringCurve } from '@codeframe/scene'
import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { NumberField, Segmented } from './fields'

const SIZE = 208
const PAD = 14
const INNER = SIZE - PAD * 2
/** Handles can pull the curve past its ends, for anticipation and overshoot. */
const Y_MIN = -0.5
const Y_MAX = 1.5
const round = (n: number) => Math.round(n * 100) / 100

type OnChange = (curve: Curve, merge: boolean) => void

/**
 * The curve editor, drafted like a plate in a manual: béziers by their two
 * handles, springs by their physics with the response they produce.
 */
export function CurveEditor({ curve, onChange }: { curve: Curve; onChange: OnChange }) {
  return (
    <div className="flex w-[208px] flex-col gap-2">
      <Segmented<Curve['type']>
        label="Curve type"
        value={curve.type}
        options={[
          { value: 'bezier', label: 'Bézier' },
          { value: 'spring', label: 'Spring' },
        ]}
        onChange={(type) => type !== curve.type && onChange(type === 'spring' ? CURVE_PRESETS.gentle : CURVE_PRESETS['ease-out'], false)}
      />
      {curve.type === 'bezier' ? <BezierEditor curve={curve} onChange={onChange} /> : <SpringEditor curve={curve} onChange={onChange} />}
    </div>
  )
}

function BezierEditor({ curve, onChange }: { curve: BezierCurve; onChange: OnChange }) {
  const svg = useRef<SVGSVGElement>(null)
  const x = (v: number) => PAD + v * INNER
  const y = (v: number) => PAD + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * INNER

  const drag = (handle: 1 | 2) => (e: ReactPointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    let merge = false
    const onMove = (ev: PointerEvent) => {
      const rect = svg.current!.getBoundingClientRect()
      const px = ((ev.clientX - rect.left) / rect.width) * SIZE
      const py = ((ev.clientY - rect.top) / rect.height) * SIZE
      const vx = round(Math.min(1, Math.max(0, (px - PAD) / INNER)))
      const vy = round(Math.min(Y_MAX, Math.max(Y_MIN, Y_MAX - ((py - PAD) / INNER) * (Y_MAX - Y_MIN))))
      onChange(handle === 1 ? { ...curve, x1: vx, y1: vy } : { ...curve, x2: vx, y2: vy }, merge)
      merge = true
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handles: [1 | 2, number, number][] = [
    [1, curve.x1, curve.y1],
    [2, curve.x2, curve.y2],
  ]
  return (
    <>
      <svg ref={svg} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block w-full touch-none border border-rule bg-paper" role="img" aria-label="Easing curve">
        <rect x={PAD} y={y(1)} width={INNER} height={y(0) - y(1)} fill="none" stroke="var(--color-rule)" />
        <line x1={x(0)} y1={y(0)} x2={x(curve.x1)} y2={y(curve.y1)} stroke="var(--color-ink-3)" />
        <line x1={x(1)} y1={y(1)} x2={x(curve.x2)} y2={y(curve.y2)} stroke="var(--color-ink-3)" />
        <path
          d={`M ${x(0)} ${y(0)} C ${x(curve.x1)} ${y(curve.y1)} ${x(curve.x2)} ${y(curve.y2)} ${x(1)} ${y(1)}`}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.5}
        />
        {handles.map(([handle, hx, hy]) => (
          <rect
            key={handle}
            x={x(hx) - 5}
            y={y(hy) - 5}
            width={10}
            height={10}
            fill="var(--color-ink)"
            stroke="var(--color-paper)"
            className="cursor-grab"
            onPointerDown={drag(handle)}
          />
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-x-3">
        <NumberField label="X1" precision={2} step={0.01} min={0} max={1} value={curve.x1} onChange={(x1, merge) => onChange({ ...curve, x1 }, merge)} />
        <NumberField label="Y1" precision={2} step={0.01} min={-5} max={5} value={curve.y1} onChange={(y1, merge) => onChange({ ...curve, y1 }, merge)} />
        <NumberField label="X2" precision={2} step={0.01} min={0} max={1} value={curve.x2} onChange={(x2, merge) => onChange({ ...curve, x2 }, merge)} />
        <NumberField label="Y2" precision={2} step={0.01} min={-5} max={5} value={curve.y2} onChange={(y2, merge) => onChange({ ...curve, y2 }, merge)} />
      </div>
    </>
  )
}

function SpringEditor({ curve, onChange }: { curve: SpringCurve; onChange: OnChange }) {
  const ms = springDuration(curve)
  const samples = 64
  const values = Array.from({ length: samples + 1 }, (_, i) => springValue(curve, ((i / samples) * ms) / 1000))
  const lo = Math.min(0, ...values)
  const hi = Math.max(1, ...values)
  const height = 120
  const px = (i: number) => PAD + (i / samples) * INNER
  const py = (v: number) => PAD + ((hi - v) / (hi - lo)) * (height - PAD * 2)
  return (
    <>
      <svg viewBox={`0 0 ${SIZE} ${height}`} className="block w-full border border-rule bg-paper" role="img" aria-label="Spring response over time">
        <line x1={PAD} y1={py(1)} x2={SIZE - PAD} y2={py(1)} stroke="var(--color-rule)" strokeDasharray="3 3" />
        <line x1={PAD} y1={py(0)} x2={SIZE - PAD} y2={py(0)} stroke="var(--color-rule)" />
        <polyline points={values.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
      </svg>
      <div className="grid grid-cols-2 gap-x-3">
        <NumberField label="Stiff" title="Stiffness" precision={0} step={10} min={1} max={5000} value={curve.stiffness} onChange={(stiffness, merge) => onChange({ ...curve, stiffness }, merge)} />
        <NumberField label="Damp" title="Damping" precision={1} min={1} max={500} value={curve.damping} onChange={(damping, merge) => onChange({ ...curve, damping }, merge)} />
        <NumberField label="Mass" precision={2} step={0.1} min={0.05} max={50} value={curve.mass} onChange={(mass, merge) => onChange({ ...curve, mass }, merge)} />
      </div>
      <p className="text-caption text-ink-2">
        Settles in <span className="font-mono">{ms} ms</span>
      </p>
    </>
  )
}
