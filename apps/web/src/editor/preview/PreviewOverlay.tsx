import { MotionRouter, type Screen } from '@codeframe/runtime'
import { childrenOf, clipPlayback, descendantsOf, MOTION_KEYFRAMES, scrollPlayback, type NodeId } from '@codeframe/scene'
import { RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { SelectField } from '../chrome/fields'
import { Glyph } from '../chrome/Glyph'
import { useLibraryTheme } from '../library'
import { useScene, useSceneStore } from '../scene-context'
import { useUI } from '../ui-store'
import { DomTree } from './dom'
import { treeStylesheet } from './styles'

/**
 * Preview: frames rendered as real DOM + CSS from the scene→CSS mapping the
 * exporter uses, run by the same motion runtime exported sites ship
 * (`@codeframe/runtime`), so every interaction, transition, overlay, clip and
 * scroll effect behaves exactly as it will in the exported code.
 */
export function PreviewOverlay() {
  const preview = useUI((s) => s.preview)
  return preview ? <Preview startId={preview.frameId} /> : null
}

function Preview({ startId }: { startId: NodeId }) {
  const snap = useScene()
  const theme = useLibraryTheme(useSceneStore())
  const [home, setHome] = useState(startId)
  const [run, setRun] = useState(0)
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
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

  // Measure on attach so the first frame renders; the observer tracks resizes.
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    setStage(el)
    if (el) setWidth(el.clientWidth)
  }, [])

  useLayoutEffect(() => {
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stage])

  const frames = useMemo(() => childrenOf(snap, null).filter((id) => snap.nodes.get(id)?.type === 'frame'), [snap])
  const stylesheet = useMemo(() => [MOTION_KEYFRAMES, ...frames.map((id) => treeStylesheet(snap, id, theme))].join('\n'), [snap, frames, theme])

  // Screens keyed by frame id, with the same clip and scroll-effect data an export writes.
  const screens = useMemo(() => {
    const out: Record<string, Screen> = {}
    for (const id of frames) {
      const frame = snap.nodes.get(id)!
      out[id] = {
        component: () => <DomTree snap={snap} id={id} theme={theme} live />,
        width: frame.width,
        height: frame.height,
        clips: [...snap.animations.values()]
          .filter((clip) => clip.frameId === id)
          .map((clip) => {
            const playback = clipPlayback(snap, clip)
            return {
              id: playback.id,
              duration: playback.duration,
              repeat: playback.repeat,
              autoplay: playback.autoplay,
              tracks: playback.tracks.map((t) => ({ target: t.nodeId, property: t.property, composite: t.composite, keyframes: t.keyframes })),
            }
          }),
        effects: [id, ...descendantsOf(snap, id)].flatMap((layer) => scrollPlayback(snap.nodes.get(layer)!).map((effect) => ({ target: layer, ...effect }))),
      }
    }
    return out
  }, [snap, frames, theme])

  // Fit the frame's width to the stage; tall frames scroll like a page.
  const renderFrame = useCallback(
    (content: ReactNode, id: string) => {
      const node = snap.nodes.get(id)
      if (!node) return content
      const scale = Math.max(0.05, Math.min(1, (width - 64) / node.width))
      return (
        <div className="flex justify-center p-8">
          <div className="relative flex-none" style={{ width: node.width * scale, height: node.height * scale }}>
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: node.width, height: node.height, scale: String(scale) }}>
              {content}
            </div>
          </div>
        </div>
      )
    },
    [snap, width],
  )

  if (!snap.nodes.has(home)) return null

  return (
    <div role="dialog" aria-label="Preview" className="fixed inset-0 z-40 flex animate-print-in flex-col bg-desk">
      <style>{stylesheet}</style>
      <header className="rule-double flex h-14 shrink-0 items-center gap-4 bg-paper px-4">
        <span className="font-display text-mark leading-none font-semibold italic" style={{ fontVariationSettings: '"opsz" 72' }}>
          Preview
        </span>
        <div className="w-60">
          <SelectField
            label="Start at"
            value={home}
            options={frames.map((id) => ({ value: id, label: snap.nodes.get(id)!.name }))}
            onChange={(id) => {
              setHome(id)
              setRun((r) => r + 1)
            }}
          />
        </div>
        <span className="ml-auto text-caption text-ink-2">Hover, press, scroll and click through. Esc closes.</span>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
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
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto">
        {width > 0 && (
          <MotionRouter
            key={`${home}:${run}`}
            screens={screens}
            home={home}
            history="memory"
            scroller={stage}
            openUrl={(url) => window.open(url, '_blank', 'noopener')}
            frame={renderFrame}
          />
        )}
      </div>
    </div>
  )
}
