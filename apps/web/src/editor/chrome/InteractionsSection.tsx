import {
  ACTION_TYPES,
  applyPatches,
  childrenOf,
  CURVE_PRESETS,
  DEFAULT_OVERLAY,
  DEFAULT_SCREEN_TRANSITION,
  DEFAULT_TRIGGER,
  descendantsOf,
  newId,
  OVERLAY_POSITIONS,
  pathTo,
  PLAY_MODES,
  TRIGGER_TYPES,
  type Action,
  type ActionOf,
  type ActionType,
  type Interaction,
  type NodeId,
  type OverlayPosition,
  type PlayMode,
  type SceneNode,
  type SceneSnapshot,
  type ScreenTransition,
  type Trigger,
  type TriggerType,
} from '@codeframe/scene'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSceneStore } from '../scene-context'
import { ColorField, IconButton, NumberField, Section, SelectField, TextField, Toggle } from './fields'
import { Glyph } from './Glyph'
import { TimingFields, TransitionFields } from './motion-fields'

/**
 * Interactions, Figma's prototype model: each is a trigger and the actions it
 * runs in order. Destinations are canvas-level frames, scroll targets are layers
 * in the same frame, and animations are the frame's timeline clips.
 */

const TRIGGER_LABELS: Record<TriggerType, string> = {
  click: 'On click',
  'while-hovering': 'While hovering',
  'while-pressing': 'While pressing',
  'mouse-enter': 'Mouse enter',
  'mouse-leave': 'Mouse leave',
  'mouse-down': 'Mouse down',
  'mouse-up': 'Mouse up',
  'after-delay': 'After delay',
  key: 'Key press',
  'in-view': 'When scrolled into view',
}

const ACTION_LABELS: Record<ActionType, string> = {
  navigate: 'Navigate to',
  back: 'Back',
  overlay: 'Open overlay',
  'swap-overlay': 'Swap overlay',
  'close-overlay': 'Close overlay',
  'scroll-to': 'Scroll to',
  'open-url': 'Open link',
  'play-animation': 'Play animation',
}

const POSITION_LABELS: Record<OverlayPosition, string> = {
  center: 'Centered',
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom center',
  'bottom-right': 'Bottom right',
  manual: 'Manual',
}

const PLAY_LABELS: Record<PlayMode, string> = { play: 'Play', restart: 'Restart', reverse: 'Reverse', toggle: 'Play or pause', pause: 'Pause' }
const OVERLAY_TRANSITIONS = ['instant', 'dissolve', 'move-in'] as const
const DIM = '#00000066'

interface Context {
  snap: SceneSnapshot
  frames: NodeId[]
  ownFrame: NodeId
}

function defaultAction(type: ActionType, ctx: Context): Action {
  const other = ctx.frames.find((id) => id !== ctx.ownFrame) ?? ''
  const transition = { ...DEFAULT_SCREEN_TRANSITION }
  switch (type) {
    case 'navigate':
      return { type, target: other, transition }
    case 'back':
      return { type, transition }
    case 'overlay':
      return { type, target: other, overlay: { ...DEFAULT_OVERLAY }, transition }
    case 'swap-overlay':
      return { type, target: other, transition }
    case 'close-overlay':
      return { type }
    case 'scroll-to':
      return { type, target: '', offset: 0, animate: true, timing: { duration: 500, delay: 0, curve: CURVE_PRESETS['ease-in-out'] } }
    case 'open-url':
      return { type, url: '', newTab: true }
    case 'play-animation':
      return { type, animation: [...ctx.snap.animations.values()].find((c) => c.frameId === ctx.ownFrame)?.id ?? '', mode: 'play' }
  }
}

/** A new action of `type`, keeping the destination and transition where both kinds have them. */
function switchAction(action: Action, type: ActionType, ctx: Context): Action {
  const next = defaultAction(type, ctx)
  const layerTarget = type === 'scroll-to' || action.type === 'scroll-to'
  if (!layerTarget && 'target' in next && 'target' in action && action.target) (next as { target: NodeId }).target = action.target
  if ('transition' in next && 'transition' in action) (next as { transition: ScreenTransition }).transition = action.transition
  return next
}

export function InteractionsSection({ snap, nodes }: { snap: SceneSnapshot; nodes: SceneNode[] }) {
  const store = useSceneStore()
  if (nodes.length !== 1) {
    return (
      <Section title="Interactions">
        <p className="text-caption text-ink-2">Select one layer to edit its interactions.</p>
      </Section>
    )
  }
  const node = nodes[0]
  const ctx: Context = {
    snap,
    frames: childrenOf(snap, null).filter((id) => snap.nodes.get(id)?.type === 'frame'),
    ownFrame: pathTo(snap, node.id)[0],
  }
  const write = (interactions: Interaction[], merge = false) => store.transact(() => applyPatches(store, [[node.id, { interactions }]]), { merge })
  const add = () => write([...node.interactions, { id: newId(), trigger: { ...DEFAULT_TRIGGER }, actions: [defaultAction('navigate', ctx)] }])

  return (
    <Section
      title="Interactions"
      aside={
        <IconButton label="Add interaction" onClick={add}>
          <Glyph icon={Plus} />
        </IconButton>
      }
    >
      {node.interactions.length === 0 && (
        <p className="text-caption leading-snug text-ink-2">
          Add a trigger and what it does, or drag the <span className="font-mono text-pencil">⊕</span> handle beside the layer onto a frame.
        </p>
      )}
      {node.interactions.map((ix, i) => (
        <InteractionEditor
          key={ix.id}
          ix={ix}
          ctx={ctx}
          first={i === 0}
          onUpdate={(fn, merge) => write(node.interactions.map((item, k) => (k === i ? fn(item) : item)), merge)}
          onRemove={() => write(node.interactions.filter((_, k) => k !== i))}
        />
      ))}
    </Section>
  )
}

type Update<T> = (fn: (value: T) => T, merge?: boolean) => void

function InteractionEditor(props: { ix: Interaction; ctx: Context; first: boolean; onUpdate: Update<Interaction>; onRemove: () => void }) {
  const { ix, ctx, onUpdate } = props
  const setTrigger = (patch: Partial<Trigger>, merge = false) =>
    onUpdate((current) => {
      // A hover-driven overlay must not catch the pointer, or leaving the layer would close it at once.
      const actions =
        patch.type === 'while-hovering'
          ? current.actions.map((a) => (a.type === 'overlay' ? { ...a, overlay: { ...a.overlay, closeOnOutside: false, background: null } } : a))
          : current.actions
      return { ...current, trigger: { ...current.trigger, ...patch }, actions }
    }, merge)

  return (
    <div className={`flex flex-col gap-1 py-2 ${props.first ? '' : 'border-t border-rule'}`}>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SelectField label="Trigger" value={ix.trigger.type} options={TRIGGER_TYPES.map((t) => ({ value: t, label: TRIGGER_LABELS[t] }))} onChange={(type) => setTrigger({ type })} />
        </div>
        <IconButton label="Remove interaction" onClick={props.onRemove}>
          <Glyph icon={Minus} />
        </IconButton>
      </div>
      {ix.trigger.type === 'after-delay' && (
        <NumberField label="After" suffix="ms" precision={0} step={100} min={0} value={ix.trigger.delay} onChange={(delay, merge) => setTrigger({ delay }, merge)} />
      )}
      {ix.trigger.type === 'key' && <KeyField value={ix.trigger.key} onChange={(key) => setTrigger({ key })} />}
      <div className="mt-1 flex flex-col gap-2 border-l border-ink pl-2.5">
        {ix.actions.map((action, j) => (
          <ActionEditor
            key={j}
            action={action}
            ctx={ctx}
            onUpdate={(fn, merge) => onUpdate((current) => ({ ...current, actions: current.actions.map((a, k) => (k === j ? fn(a) : a)) }), merge)}
            onRemove={() => onUpdate((current) => ({ ...current, actions: current.actions.filter((_, k) => k !== j) }))}
          />
        ))}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onUpdate((current) => ({ ...current, actions: [...current.actions, defaultAction('navigate', ctx)] }))}
          className="flex h-6 items-center gap-1 text-caption text-ink-2 hover:text-ink"
        >
          <Glyph icon={Plus} size={11} />
          Add action
        </button>
      </div>
    </div>
  )
}

function ActionEditor(props: { action: Action; ctx: Context; onUpdate: Update<Action>; onRemove: () => void }) {
  const { action, ctx, onUpdate } = props
  const { snap } = ctx
  const frameOptions = [{ value: '', label: 'Choose a frame…' }, ...ctx.frames.map((id) => ({ value: id as string, label: snap.nodes.get(id)!.name }))]
  const frameValue = (target: NodeId) => (ctx.frames.includes(target) ? target : '')
  const setTarget = (target: NodeId) => onUpdate((a) => ('target' in a ? ({ ...a, target } as Action) : a))
  const updateTransition: Update<ScreenTransition> = (fn, merge) => onUpdate((a) => ('transition' in a ? ({ ...a, transition: fn(a.transition) } as Action) : a), merge)

  let body: React.ReactNode = null
  switch (action.type) {
    case 'navigate':
    case 'swap-overlay':
      body = (
        <>
          <SelectField label="Destination" value={frameValue(action.target)} options={frameOptions} onChange={setTarget} />
          <TransitionFields transitions={[action.transition]} onUpdate={updateTransition} />
        </>
      )
      break
    case 'back':
      body = <TransitionFields transitions={[action.transition]} onUpdate={updateTransition} />
      break
    case 'overlay':
      body = <OverlayFields action={action} frameOptions={frameOptions} frameValue={frameValue(action.target)} onTarget={setTarget} onUpdate={onUpdate} onTransition={updateTransition} />
      break
    case 'close-overlay':
      body = <p className="text-caption text-ink-2">Closes the topmost overlay.</p>
      break
    case 'scroll-to': {
      const layers = descendantsOf(snap, ctx.ownFrame).map((id) => ({
        value: id as string,
        label: `${' '.repeat(Math.max(0, pathTo(snap, id).length - 2))}${snap.nodes.get(id)!.name}`,
      }))
      body = (
        <>
          <SelectField
            label="Scroll target"
            value={snap.nodes.has(action.target) ? action.target : ''}
            options={[{ value: '', label: 'Choose a layer…' }, ...layers]}
            onChange={setTarget}
          />
          <NumberField
            label="Offset"
            title="Space left above the target"
            suffix="px"
            precision={0}
            value={action.offset}
            onChange={(offset, merge) => onUpdate((a) => ({ ...(a as ActionOf<'scroll-to'>), offset }), merge)}
          />
          <Toggle label="Animate the scroll" checked={action.animate} onChange={(animate) => onUpdate((a) => ({ ...(a as ActionOf<'scroll-to'>), animate }))} />
          {action.animate && (
            <TimingFields
              timings={[action.timing]}
              delay={false}
              onChange={(patch, merge) => onUpdate((a) => ({ ...(a as ActionOf<'scroll-to'>), timing: { ...(a as ActionOf<'scroll-to'>).timing, ...patch } }), merge)}
            />
          )}
        </>
      )
      break
    }
    case 'open-url':
      body = (
        <>
          <TextField label="Link" value={action.url} onChange={(url) => onUpdate((a) => ({ ...(a as ActionOf<'open-url'>), url }))} />
          <Toggle label="Open in a new tab" checked={action.newTab} onChange={(newTab) => onUpdate((a) => ({ ...(a as ActionOf<'open-url'>), newTab }))} />
        </>
      )
      break
    case 'play-animation': {
      const clips = [...snap.animations.values()].filter((c) => c.frameId === ctx.ownFrame)
      body =
        clips.length === 0 ? (
          <p className="text-caption leading-snug text-ink-2">This frame has no timeline animations yet.</p>
        ) : (
          <>
            <SelectField
              label="Animation"
              value={clips.some((c) => c.id === action.animation) ? action.animation : ''}
              options={[{ value: '', label: 'Choose an animation…' }, ...clips.map((c) => ({ value: c.id, label: c.name }))]}
              onChange={(animation) => onUpdate((a) => ({ ...(a as ActionOf<'play-animation'>), animation }))}
            />
            <SelectField
              label="Playback"
              value={action.mode}
              options={PLAY_MODES.map((m) => ({ value: m, label: PLAY_LABELS[m] }))}
              onChange={(mode) => onUpdate((a) => ({ ...(a as ActionOf<'play-animation'>), mode }))}
            />
          </>
        )
      break
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SelectField
            label="Action"
            value={action.type}
            options={ACTION_TYPES.map((t) => ({ value: t, label: ACTION_LABELS[t] }))}
            onChange={(type) => type !== action.type && onUpdate((a) => switchAction(a, type, ctx))}
          />
        </div>
        <IconButton label="Remove action" onClick={props.onRemove}>
          <Glyph icon={Minus} />
        </IconButton>
      </div>
      {body}
    </div>
  )
}

function OverlayFields(props: {
  action: ActionOf<'overlay'>
  frameOptions: { value: string; label: string }[]
  frameValue: string
  onTarget: (target: NodeId) => void
  onUpdate: Update<Action>
  onTransition: Update<ScreenTransition>
}) {
  const { action, onUpdate } = props
  const { overlay } = action
  const setOverlay = (patch: Partial<typeof overlay>, merge = false) =>
    onUpdate((a) => (a.type === 'overlay' ? { ...a, overlay: { ...a.overlay, ...patch } } : a), merge)
  return (
    <>
      <SelectField label="Overlay" value={props.frameValue} options={props.frameOptions} onChange={props.onTarget} />
      <SelectField label="Position" value={overlay.position} options={OVERLAY_POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))} onChange={(position) => setOverlay({ position })} />
      {overlay.position === 'manual' && (
        <div className="grid grid-cols-2 gap-x-3">
          <NumberField label="X" precision={0} value={overlay.offset.x} onChange={(x, merge) => setOverlay({ offset: { ...overlay.offset, x } }, merge)} />
          <NumberField label="Y" precision={0} value={overlay.offset.y} onChange={(y, merge) => setOverlay({ offset: { ...overlay.offset, y } }, merge)} />
        </div>
      )}
      <Toggle label="Close when clicking outside" checked={overlay.closeOnOutside} onChange={(closeOnOutside) => setOverlay({ closeOnOutside })} />
      <Toggle label="Dim the background" checked={overlay.background !== null} onChange={(on) => setOverlay({ background: on ? DIM : null })} />
      {overlay.background !== null && <ColorField label="Background" value={overlay.background} onChange={(background, merge) => setOverlay({ background }, merge)} />}
      <TransitionFields transitions={[action.transition]} onUpdate={props.onTransition} types={OVERLAY_TRANSITIONS} />
    </>
  )
}

/** Shows the trigger key; click, then press any key to set it. */
function KeyField({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [listening, setListening] = useState(false)
  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key !== 'Escape') onChange(e.key)
      setListening(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening, onChange])
  return (
    <div className="flex h-7 items-center gap-2 border-b border-rule">
      <span className="smallcaps text-ink-3">Key</span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setListening((l) => !l)}
        className={`ml-auto h-6 min-w-10 border px-2 font-mono text-data transition-colors ${listening ? 'border-pencil text-pencil' : 'border-ink text-ink hover:bg-paper-sunk'}`}
      >
        {listening ? 'Press a key…' : value === ' ' ? 'Space' : value}
      </button>
    </div>
  )
}
