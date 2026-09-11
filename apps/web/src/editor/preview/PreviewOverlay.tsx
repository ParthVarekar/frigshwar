import {
  childrenOf,
  EASING_CSS,
  MOTION_KEYFRAMES,
  subtreeStylesheet,
  type LinkTransition,
  type NodeId,
  type PrototypeLink,
  type SceneSnapshot,
} from '@codeframe/scene'
import { RotateCcw, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SelectField } from '../chrome/fields'
import { Glyph } from '../chrome/Glyph'
import { useScene } from '../scene-context'
import { IMAGE_PLACEHOLDER } from '../theme'
import { useUI } from '../ui-store'

/**
 * Preview: frames rendered as real DOM + CSS from the scene→CSS mapping the
 * exporter uses, so hover/press states, appear and loop animations, and
 * click-through prototype links behave exactly as they will in shipped code.
 */
export function PreviewOverlay() {
  const preview = useUI((s) => s.preview)
  return preview ? <Preview startId={preview.frameId} /> : null
}

const className = (id: NodeId) => `cf-${id}`

interface Navigation {
  from: NodeId
  link: PrototypeLink
}

function Preview({ startId }: { startId: NodeId }) {
  const snap = useScene()
  const [stack, setStack] = useState<NodeId[]>([startId])
  const [navigation, setNavigation] = useState<Navigation | null>(null)
  const [run, setRun] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const current = stack[stack.length - 1]
  const close = () => useUI.getState().setPreview(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      useUI.getState().setPreview(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useLayoutEffect(() => {
    const el = stage.current!
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const frames = childrenOf(snap, null).filter((id) => snap.nodes.get(id)?.type === 'frame')
  const from = navigation?.from
  const stylesheet = useMemo(
    () => [MOTION_KEYFRAMES, ...[current, from].flatMap((id) => (id ? subtreeStylesheet(snap, id, className) : []))].join('\n'),
    [snap, current, from],
  )

  const follow = (link: PrototypeLink) => {
    if (navigation) return
    const back = link.target === 'back'
    const to = back ? stack[stack.length - 2] : link.target
    if (!to || to === current || snap.nodes.get(to)?.type !== 'frame') return
    setStack(back ? stack.slice(0, -1) : [...stack, to])
    setNavigation(link.transition === 'instant' || link.duration === 0 ? null : { from: current, link })
  }

  const restart = (frameId: NodeId) => {
    setStack([frameId])
    setNavigation(null)
    setRun((r) => r + 1)
  }

  if (!snap.nodes.has(startId)) return null

  return (
    <div role="dialog" aria-label="Preview" className="fixed inset-0 z-40 flex animate-print-in flex-col bg-desk">
      <style>{stylesheet}</style>
      <header className="rule-double flex h-14 shrink-0 items-center gap-4 bg-paper px-4">
        <span className="font-display text-mark leading-none font-semibold italic" style={{ fontVariationSettings: '"opsz" 72' }}>
          Preview
        </span>
        <div className="w-60">
          <SelectField
            label="Frame"
            value={current}
            options={frames.map((id) => ({ value: id, label: snap.nodes.get(id)!.name }))}
            onChange={restart}
          />
        </div>
        {stack.length > 1 && <span className="font-mono text-caption text-ink-3">{stack.length - 1} deep</span>}
        <span className="ml-auto text-caption text-ink-2">Hover, press and click through. Esc closes.</span>
        <button
          type="button"
          onClick={() => restart(stack[0])}
          className="flex h-8 items-center gap-1.5 border border-ink px-2.5 text-ui transition-colors hover:bg-paper-sunk"
        >
          <Glyph icon={RotateCcw} size={13} />
          Restart
        </button>
        <button
          type="button"
          onClick={close}
          className="flex h-8 items-center gap-1.5 bg-ink px-2.5 text-ui text-paper transition-colors hover:bg-ink-2"
        >
          <Glyph icon={X} size={13} />
          Close
        </button>
      </header>
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden">
        {size.width > 0 && navigation && (
          <Screen key={`from:${navigation.from}:${run}`} snap={snap} id={navigation.from} stage={size} role="from" navigation={navigation} />
        )}
        {size.width > 0 && (
          <Screen
            key={`${current}:${stack.length}:${run}`}
            snap={snap}
            id={current}
            stage={size}
            role="to"
            navigation={navigation}
            onLink={follow}
            onDone={() => setNavigation(null)}
          />
        )}
      </div>
    </div>
  )
}

function screenKeyframes(transition: LinkTransition, role: 'from' | 'to', stage: { width: number; height: number }): Keyframe[] | null {
  const { width: w, height: h } = stage
  const enter = (transform: string): Keyframe[] | null => (role === 'to' ? [{ transform }, { transform: 'none' }] : null)
  switch (transition) {
    case 'dissolve':
      return role === 'to' ? [{ opacity: 0 }, { opacity: 1 }] : null
    case 'slide-left':
      return enter(`translateX(${w}px)`)
    case 'slide-right':
      return enter(`translateX(${-w}px)`)
    case 'slide-up':
      return enter(`translateY(${h}px)`)
    case 'slide-down':
      return enter(`translateY(${-h}px)`)
    case 'push-left':
      return role === 'to' ? enter(`translateX(${w}px)`) : [{ transform: 'none' }, { transform: `translateX(${-w}px)` }]
    case 'push-right':
      return role === 'to' ? enter(`translateX(${-w}px)`) : [{ transform: 'none' }, { transform: `translateX(${w}px)` }]
    default:
      return null
  }
}

function Screen(props: {
  snap: SceneSnapshot
  id: NodeId
  stage: { width: number; height: number }
  role: 'from' | 'to'
  navigation: Navigation | null
  onLink?: (link: PrototypeLink) => void
  onDone?: () => void
}) {
  const { snap, id, stage, role, navigation, onLink, onDone } = props
  const el = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  useLayoutEffect(() => {
    done.current = onDone
  })

  useLayoutEffect(() => {
    if (!navigation || !el.current) return
    const keyframes = screenKeyframes(navigation.link.transition, role, stage)
    if (!keyframes) return
    const animation = el.current.animate(keyframes, {
      duration: navigation.link.duration,
      easing: EASING_CSS[navigation.link.easing],
      fill: 'both',
    })
    if (role === 'to') animation.onfinish = () => done.current?.()
    return () => animation.cancel()
    // Runs once per navigation; the stage size at that moment is what the slide uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, role])

  const node = snap.nodes.get(id)
  if (!node) return null
  const scale = Math.min(1, (stage.width - 64) / node.width, (stage.height - 64) / node.height)
  return (
    <div
      ref={el}
      className="absolute inset-0 flex items-center justify-center bg-desk"
      style={{ pointerEvents: role === 'from' ? 'none' : undefined }}
    >
      <div className="relative flex-none" style={{ width: node.width, height: node.height, scale: String(Math.max(scale, 0.05)) }}>
        <DomNode snap={snap} id={id} onLink={onLink} />
      </div>
    </div>
  )
}

function DomNode({ snap, id, onLink }: { snap: SceneSnapshot; id: NodeId; onLink?: (link: PrototypeLink) => void }) {
  const node = snap.nodes.get(id)
  if (!node || !node.visible) return null
  const link = node.link
  let content: ReactNode = null
  if (node.type === 'text') {
    content = node.text
  } else if (node.type === 'image') {
    const src = node.assetId ? snap.assets.get(node.assetId)?.src : undefined
    content = src ? (
      <img src={src} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: node.fit }} />
    ) : (
      <div style={{ width: '100%', height: '100%', background: IMAGE_PLACEHOLDER }} />
    )
  } else {
    content = childrenOf(snap, id).map((child) => <DomNode key={child} snap={snap} id={child} onLink={onLink} />)
  }
  return (
    <div
      className={className(id)}
      style={link && onLink ? { cursor: 'pointer' } : undefined}
      onClick={
        link && onLink
          ? (e) => {
              e.stopPropagation()
              onLink(link)
            }
          : undefined
      }
    >
      {content}
    </div>
  )
}
