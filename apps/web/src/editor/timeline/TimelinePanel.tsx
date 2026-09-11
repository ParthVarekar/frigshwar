import {
  ANIMATABLE_PROPERTIES,
  childrenOf,
  CLIP_REPEATS,
  clipTime,
  deleteAnimation,
  evaluateClip,
  newId,
  pathTo,
  putAnimation,
  trackValueAt,
  type AnimatableProperty,
  type AnimationClip,
  type ClipRepeat,
  type Keyframe,
  type NodeId,
  type SceneSnapshot,
  type Track,
} from '@codeframe/scene'
import { Circle, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ColorField, IconButton, NumberField, Segmented, SelectField, Toggle } from '../chrome/fields'
import { Glyph } from '../chrome/Glyph'
import { CurveField } from '../chrome/motion-fields'
import { useScene, useSceneStore } from '../scene-context'
import { useUI } from '../ui-store'
import { baseValue, withKeyframe } from './record'
import { useTimeline, type KeyframeRef } from './timeline-store'

/**
 * The timeline (Figma Motion style): keyframe clips on a frame. Layer rows hold
 * property tracks with keyframe diamonds; the pencil playhead scrubs the canvas.
 * Clips play in Preview and ship with exported code through the motion runtime.
 */

const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
  x: 'X',
  y: 'Y',
  width: 'Width',
  height: 'Height',
  rotation: 'Rotation',
  scale: 'Scale',
  opacity: 'Opacity',
  fill: 'Fill',
  cornerRadius: 'Radius',
  blur: 'Blur',
}
const REPEAT_LABELS: Record<ClipRepeat, string> = { once: 'Once', loop: 'Loop', alternate: 'Back & forth' }
const PAD = 12
const TICK_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000]
const noFocus = (e: { preventDefault(): void }) => e.preventDefault()

export function TimelinePanel() {
  const open = useTimeline((s) => s.open)
  return open ? <Timeline /> : null
}

function formatValue(property: AnimatableProperty, value: number | string | undefined): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value.toUpperCase()
  if (property === 'opacity' || property === 'scale') return `${Math.round(value * 100)}%`
  if (property === 'rotation') return `${Math.round(value * 10) / 10}°`
  return String(Math.round(value * 10) / 10)
}

function Timeline() {
  const store = useSceneStore()
  const snap = useScene()
  const selection = useUI((s) => s.selection)
  const { clipId, time, playing, recording, selected } = useTimeline()
  const actions = useTimeline.getState()
  const [lane, setLane] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  const clip = clipId ? (snap.animations.get(clipId) ?? null) : null
  const frames = childrenOf(snap, null).filter((id) => snap.nodes.get(id)?.type === 'frame')
  const selectionFrame = selection.length > 0 && snap.nodes.has(selection[0]) ? pathTo(snap, selection[0])[0] : null
  const clips = [...snap.animations.values()]

  // The canvas draws the playhead's values while the timeline is open.
  useEffect(() => {
    useTimeline.getState().setPatches(clip ? evaluateClip(snap, clip, time).patches : new Map())
  }, [snap, clip, time])
  useEffect(() => () => useTimeline.getState().setPatches(new Map()), [])

  // Playback from the playhead, honoring repeat.
  const clipKey = clip ? `${clip.id}:${clip.duration}:${clip.repeat}` : ''
  useEffect(() => {
    const current = clipId ? store.getAnimation(clipId) : undefined
    if (!playing || !current) return
    const start = useTimeline.getState().time
    const from = current.repeat === 'once' && start >= current.duration ? 0 : start
    const began = performance.now() - from
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = now - began
      useTimeline.getState().setTime(Math.round(clipTime(current, elapsed)))
      if (current.repeat === 'once' && elapsed >= current.duration) {
        useTimeline.getState().setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, clipKey, clipId, store])

  const laneRef = useCallback((el: HTMLDivElement | null) => {
    setLane(el)
    if (el) setWidth(el.clientWidth)
  }, [])
  useEffect(() => {
    if (!lane) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(lane)
    return () => observer.disconnect()
  }, [lane])

  const groups = useMemo(() => {
    if (!clip) return []
    const byNode = new Map<NodeId, Track[]>()
    for (const track of clip.tracks) if (snap.nodes.has(track.nodeId)) byNode.set(track.nodeId, [...(byNode.get(track.nodeId) ?? []), track])
    return [...byNode.entries()].sort(([a], [b]) => (snap.order.get(a) ?? 0) - (snap.order.get(b) ?? 0))
  }, [clip, snap])

  const selectedTrack = clip && selected ? clip.tracks.find((t) => t.nodeId === selected.nodeId && t.property === selected.property) : undefined
  const selectedKey = selected ? selectedTrack?.keyframes[selected.index] : undefined

  const write = (next: AnimationClip, merge = false) => putAnimation(store, next, { merge })

  const removeSelected = useCallback(() => {
    const { selected: ref, clipId: id } = useTimeline.getState()
    const current = id ? store.getAnimation(id) : undefined
    if (!ref || !current) return
    const tracks = current.tracks
      .map((t) => (t.nodeId === ref.nodeId && t.property === ref.property ? { ...t, keyframes: t.keyframes.filter((_, i) => i !== ref.index) } : t))
      .filter((t) => t.keyframes.length > 0)
    putAnimation(store, { ...current, tracks })
    useTimeline.getState().setSelected(null)
  }, [store])

  // Delete / Backspace removes the selected keyframe instead of the selected layer.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      e.preventDefault()
      e.stopPropagation()
      removeSelected()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selected, removeSelected])

  const createClip = () => {
    const frameId = selectionFrame ?? clip?.frameId ?? frames[0]
    if (!frameId) return
    const count = clips.filter((c) => c.frameId === frameId).length
    const next: AnimationClip = { id: newId(), name: `Animation ${count + 1}`, frameId, duration: 1000, repeat: 'once', autoplay: true, tracks: [] }
    write(next)
    actions.setClip(next.id)
  }

  const inner = Math.max(1, width - PAD * 2)
  const x = (ms: number) => PAD + (clip && clip.duration > 0 ? (ms / clip.duration) * inner : 0)
  const timeAt = (clientX: number) => {
    if (!lane || !clip) return 0
    const ratio = (clientX - lane.getBoundingClientRect().left - PAD) / inner
    return Math.round(Math.min(1, Math.max(0, ratio)) * clip.duration)
  }

  const scrub = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !clip) return
    e.preventDefault()
    actions.setPlaying(false)
    actions.setSelected(null)
    actions.setTime(timeAt(e.clientX))
    const onMove = (ev: PointerEvent) => useTimeline.getState().setTime(timeAt(ev.clientX))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Moves one keyframe to `to`, re-sorting its track and following it with the selection. */
  const moveKey = (from: AnimationClip, track: Track, index: number, to: number, merge: boolean) => {
    const moved: Keyframe = { ...track.keyframes[index], time: Math.min(from.duration, Math.max(0, to)) }
    const keyframes = track.keyframes.map((k, i) => (i === index ? moved : k)).sort((a, b) => a.time - b.time)
    write({ ...from, tracks: from.tracks.map((t) => (t === track ? { ...t, keyframes } : t)) }, merge)
    actions.setSelected({ nodeId: track.nodeId, property: track.property, index: keyframes.indexOf(moved) })
    actions.setTime(moved.time)
  }

  const dragKey = (track: Track, index: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || !clip) return
    e.preventDefault()
    e.stopPropagation()
    actions.setPlaying(false)
    actions.setSelected({ nodeId: track.nodeId, property: track.property, index })
    actions.setTime(track.keyframes[index].time)
    const from = clip
    const startX = e.clientX
    let merge = false
    const onMove = (ev: PointerEvent) => {
      if (!merge && Math.abs(ev.clientX - startX) < 3) return
      const at = timeAt(ev.clientX)
      moveKey(from, track, index, ev.shiftKey ? at : Math.round(at / 10) * 10, merge)
      merge = true
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const step = clip ? (TICK_STEPS.find((s) => (s / Math.max(1, clip.duration)) * inner >= 56) ?? TICK_STEPS[TICK_STEPS.length - 1]) : 1000
  const ticks = clip ? Array.from({ length: Math.floor(clip.duration / step) + 1 }, (_, i) => i * step) : []

  return (
    <section aria-label="Timeline" className="flex h-[248px] shrink-0 flex-col border-t border-ink bg-paper">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-rule px-3">
        <h2 className="section-head w-[72px] shrink-0">Timeline</h2>
        <div className="w-44 shrink-0">
          <SelectField
            label="Animation"
            value={clip ? clip.id : ''}
            options={[
              { value: '', label: clips.length ? 'Choose an animation…' : 'No animations yet' },
              ...clips.map((c) => ({ value: c.id, label: `${c.name} · ${snap.nodes.get(c.frameId)?.name ?? 'missing frame'}` })),
            ]}
            onChange={(id) => actions.setClip(id || null)}
          />
        </div>
        <button type="button" onMouseDown={noFocus} onClick={createClip} className="flex h-7 shrink-0 items-center gap-1 px-2 text-ui text-ink-2 hover:bg-paper-sunk hover:text-ink">
          <Glyph icon={Plus} size={12} />
          New
        </button>
        {clip && (
          <>
            <ClipName key={clip.id} clip={clip} onRename={(name) => write({ ...clip, name })} />
            <div className="w-24 shrink-0">
              <NumberField label="Len" title="Duration" suffix="ms" precision={0} step={100} min={50} max={600000} value={clip.duration} onChange={(duration, merge) => write({ ...clip, duration }, merge)} />
            </div>
            <div className="w-52 shrink-0">
              <Segmented<ClipRepeat> label="Repeat" value={clip.repeat} options={CLIP_REPEATS.map((r) => ({ value: r, label: REPEAT_LABELS[r] }))} onChange={(repeat) => write({ ...clip, repeat })} />
            </div>
            <Toggle label="Autoplay" checked={clip.autoplay} onChange={(autoplay) => write({ ...clip, autoplay })} />
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {clip && (
            <>
              <button
                type="button"
                onMouseDown={noFocus}
                onClick={() => actions.setPlaying(!playing)}
                className="flex h-7 items-center gap-1.5 bg-ink px-2.5 text-ui text-paper transition-colors hover:bg-ink-2"
              >
                <Glyph icon={playing ? Pause : Play} size={12} />
                {playing ? 'Pause' : 'Play'}
              </button>
              <span className="w-28 font-mono text-data text-ink-2">
                {(time / 1000).toFixed(2)} / {(clip.duration / 1000).toFixed(2)} s
              </span>
              <button
                type="button"
                aria-pressed={recording}
                title="Record: Design-tab edits key the layer at the playhead"
                onMouseDown={noFocus}
                onClick={() => actions.setRecording(!recording)}
                className={`flex h-7 items-center gap-1.5 border px-2.5 text-ui transition-colors ${recording ? 'border-pencil text-pencil' : 'border-ink text-ink hover:bg-paper-sunk'}`}
              >
                <Glyph icon={Circle} size={11} className={recording ? 'fill-pencil' : ''} />
                Record
              </button>
              <IconButton
                label="Delete this animation"
                onClick={() => {
                  deleteAnimation(store, clip.id)
                  actions.setClip(null)
                }}
              >
                <Glyph icon={Trash2} size={13} />
              </IconButton>
            </>
          )}
          <IconButton label="Close the timeline" onClick={() => actions.setOpen(false)}>
            <Glyph icon={X} size={13} />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 overflow-y-auto">
          <div className="w-[248px] shrink-0 border-r border-ink">
            <div className="h-6 border-b border-rule" />
            {!clip && <p className="px-3 py-2 text-caption leading-snug text-ink-2">Choose an animation, or make a new one for the selected layer's frame.</p>}
            {clip && groups.length === 0 && <p className="px-3 py-2 text-caption leading-snug text-ink-2">No keyframes yet. Select a layer and key it at the playhead.</p>}
            {groups.map(([nodeId, tracks]) => (
              <div key={nodeId}>
                <button
                  type="button"
                  onMouseDown={noFocus}
                  onClick={() => useUI.getState().setSelection([nodeId])}
                  className={`flex h-6 w-full items-center border-b border-rule px-3 text-left text-ui ${selection.includes(nodeId) ? 'bg-ink text-paper' : 'hover:bg-paper-sunk'}`}
                >
                  <span className="truncate">{snap.nodes.get(nodeId)!.name}</span>
                </button>
                {tracks.map((track) => (
                  <div key={track.property} className="flex h-6 items-center justify-between border-b border-rule pr-3 pl-6">
                    <span className="smallcaps text-ink-3">{PROPERTY_LABELS[track.property]}</span>
                    <span className="font-mono text-caption text-ink-2">{formatValue(track.property, trackValueAt(track, time))}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div ref={laneRef} className="relative min-w-0 flex-1 select-none" onPointerDown={scrub}>
            <div className="relative h-6 border-b border-rule">
              {ticks.map((tick) => (
                <span key={tick} className="absolute top-0 h-full border-l border-rule pt-0.5 pl-1 font-mono text-caption text-ink-3" style={{ left: x(tick) }}>
                  {step >= 1000 ? `${tick / 1000}s` : `${(tick / 1000).toFixed(2)}`}
                </span>
              ))}
            </div>
            {groups.map(([nodeId, tracks]) => (
              <div key={nodeId}>
                <div className="h-6 border-b border-rule bg-paper-sunk/50" />
                {tracks.map((track) => {
                  const first = track.keyframes[0]
                  const last = track.keyframes[track.keyframes.length - 1]
                  return (
                    <div key={track.property} className="relative h-6 border-b border-rule">
                      {track.keyframes.length > 1 && <span aria-hidden className="absolute top-1/2 h-px bg-ink-3" style={{ left: x(first.time), width: x(last.time) - x(first.time) }} />}
                      {track.keyframes.map((k, i) => {
                        const active = selected?.nodeId === track.nodeId && selected.property === track.property && selected.index === i
                        return (
                          <button
                            key={i}
                            type="button"
                            aria-label={`${PROPERTY_LABELS[track.property]} keyframe at ${k.time} ms`}
                            aria-pressed={active}
                            onPointerDown={dragKey(track, i)}
                            className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border ${active ? 'border-pencil bg-pencil' : 'border-ink bg-paper hover:bg-ink'}`}
                            style={{ left: x(k.time) }}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
            {clip && <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-pencil" style={{ left: x(time) }} />}
          </div>
        </div>

        <div className="w-[272px] shrink-0 overflow-y-auto border-l border-ink px-3 py-2">
          {!clip ? (
            <p className="text-caption leading-snug text-ink-2">Timeline animations play when their frame appears (Autoplay) or from a "Play animation" interaction.</p>
          ) : selectedKey && selectedTrack && selected ? (
            <KeyframeInspector
              snap={snap}
              clip={clip}
              track={selectedTrack}
              ref_={selected}
              onChange={(next, merge) => write(next, merge)}
              onMove={(to) => moveKey(clip, selectedTrack, selected.index, to, false)}
              onRemove={removeSelected}
            />
          ) : (
            <AddKeyframe
              snap={snap}
              clip={clip}
              time={time}
              selection={selection}
              onAdd={(nodeId, property) => {
                const node = snap.nodes.get(nodeId)!
                const base = baseValue(node, property)
                const track = clip.tracks.find((t) => t.nodeId === nodeId && t.property === property)
                const value = (track && trackValueAt(track, time)) ?? base
                if (value === undefined) return
                const next = withKeyframe(clip, nodeId, property, time, value, base)
                write(next)
                const keys = next.tracks.find((t) => t.nodeId === nodeId && t.property === property)!.keyframes
                actions.setSelected({ nodeId, property, index: keys.findIndex((k) => Math.abs(k.time - time) <= 1) })
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function ClipName({ clip, onRename }: { clip: AnimationClip; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      aria-label="Animation name"
      spellCheck={false}
      value={draft ?? clip.name}
      onFocus={() => setDraft(clip.name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const name = e.target.value.trim()
        setDraft(null)
        if (name && name !== clip.name) onRename(name)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      className="w-32 min-w-0 truncate border-b border-transparent bg-transparent font-display text-head italic outline-none hover:border-rule focus:border-pencil"
    />
  )
}

function valueField(property: AnimatableProperty) {
  if (property === 'opacity') return { scale: 100, suffix: '%', min: 0, max: 1, precision: 0 }
  if (property === 'scale') return { scale: 100, suffix: '%', min: 0, max: 10, precision: 0 }
  if (property === 'rotation') return { suffix: '°', precision: 1 }
  return { suffix: 'px', precision: 1 }
}

function KeyframeInspector(props: {
  snap: SceneSnapshot
  clip: AnimationClip
  track: Track
  ref_: KeyframeRef
  onChange: (clip: AnimationClip, merge: boolean) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const { snap, clip, track, ref_ } = props
  const key = track.keyframes[ref_.index]
  const setKey = (patch: Partial<Keyframe>, merge = false) =>
    props.onChange({ ...clip, tracks: clip.tracks.map((t) => (t === track ? { ...t, keyframes: t.keyframes.map((k, i) => (i === ref_.index ? { ...k, ...patch } : k)) } : t)) }, merge)
  return (
    <div className="flex flex-col gap-1">
      <h3 className="section-head">Keyframe</h3>
      <p className="truncate text-caption text-ink-2">
        {snap.nodes.get(track.nodeId)?.name} · {PROPERTY_LABELS[track.property]}
      </p>
      <NumberField label="At" suffix="ms" precision={0} step={10} min={0} max={clip.duration} value={key.time} onChange={(to) => props.onMove(to)} />
      {track.property === 'fill' ? (
        <ColorField label="Value" value={typeof key.value === 'string' ? key.value : null} onChange={(value, merge) => setKey({ value }, merge)} />
      ) : (
        <NumberField label="Val" {...valueField(track.property)} value={typeof key.value === 'number' ? key.value : null} onChange={(value, merge) => setKey({ value }, merge)} />
      )}
      <h4 className="smallcaps mt-1 text-ink-3">Easing to the next keyframe</h4>
      <CurveField curves={[key.curve]} onChange={(curve, merge) => setKey({ curve }, merge ?? false)} />
      <button
        type="button"
        onMouseDown={noFocus}
        onClick={props.onRemove}
        className="mt-2 flex h-7 items-center justify-center gap-1.5 border border-ink text-ui transition-colors hover:bg-paper-sunk"
      >
        <Glyph icon={Trash2} size={12} />
        Delete keyframe
      </button>
    </div>
  )
}

function AddKeyframe(props: {
  snap: SceneSnapshot
  clip: AnimationClip
  time: number
  selection: NodeId[]
  onAdd: (nodeId: NodeId, property: AnimatableProperty) => void
}) {
  const { snap, clip, time, selection } = props
  const [property, setProperty] = useState<AnimatableProperty>('opacity')
  const node = selection.length === 1 ? snap.nodes.get(selection[0]) : undefined
  const inFrame = node !== undefined && pathTo(snap, node.id)[0] === clip.frameId
  const options = node ? ANIMATABLE_PROPERTIES.filter((p) => baseValue(node, p) !== undefined) : []
  const chosen = options.includes(property) ? property : options[0]
  return (
    <div className="flex flex-col gap-1">
      <h3 className="section-head">Add keyframe</h3>
      {!node || !inFrame ? (
        <p className="text-caption leading-snug text-ink-2">Select one layer inside “{snap.nodes.get(clip.frameId)?.name ?? 'the frame'}” to key it.</p>
      ) : (
        <>
          <p className="truncate text-caption text-ink-2">
            {node.name} at <span className="font-mono">{time} ms</span>
          </p>
          <SelectField label="Property" value={chosen ?? null} options={options.map((p) => ({ value: p, label: PROPERTY_LABELS[p] }))} onChange={setProperty} />
          <button
            type="button"
            onMouseDown={noFocus}
            disabled={!chosen}
            onClick={() => chosen && props.onAdd(node.id, chosen)}
            className="mt-1 flex h-7 items-center justify-center gap-1.5 bg-ink text-ui text-paper transition-colors hover:bg-ink-2"
          >
            <Glyph icon={Plus} size={12} />
            Key at playhead
          </button>
        </>
      )}
      <p className="mt-2 text-caption leading-snug text-ink-3">Or turn on Record and change the layer in the Design tab: each edit keys it at the playhead.</p>
    </div>
  )
}
