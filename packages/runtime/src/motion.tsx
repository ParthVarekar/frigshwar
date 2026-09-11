/**
 * Codeframe motion runtime: screens, transitions, overlays, interactions,
 * timeline clips and scroll effects for a site designed in Codeframe.
 *
 * The editor's Preview runs this exact file, so a prototype behaves the same in
 * the editor and in exported code. It depends only on React and the platform:
 * the View Transitions API (screen transitions and Smart Animate), Web
 * Animations (overlays, clips, scroll effects) and IntersectionObserver.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefCallback,
} from 'react'
import { flushSync } from 'react-dom'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransitionType = 'instant' | 'dissolve' | 'smart-animate' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out'

/** The way the moving screen travels: `left` enters from the right edge. */
export type Direction = 'left' | 'right' | 'up' | 'down'

export interface Transition {
  type: TransitionType
  direction: Direction
  /** Milliseconds. */
  duration: number
  /** Any CSS easing, including `linear()` springs. */
  easing: string
}

export type OverlayPosition = 'center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'manual'

export interface OverlayOptions {
  position: OverlayPosition
  /** `manual`: offset from the top-left corner, px. */
  offset: { x: number; y: number }
  closeOnOutside: boolean
  /** Color behind the overlay, or `null` for none. */
  background: string | null
  transition?: Transition
}

export interface ScrollOptions {
  /** Space left above the target, px. */
  offset: number
  /** 0 jumps. */
  duration: number
  easing: string
}

export type PlayMode = 'play' | 'restart' | 'reverse' | 'toggle' | 'pause'

export type MotionAction =
  | { type: 'navigate'; to: string; transition?: Transition }
  | { type: 'back'; transition?: Transition }
  | { type: 'overlay'; to: string; overlay: OverlayOptions }
  | { type: 'swap-overlay'; to: string; transition?: Transition }
  | { type: 'close-overlay' }
  | { type: 'scroll-to'; to: string; scroll: ScrollOptions }
  | { type: 'open-url'; url: string; newTab: boolean }
  | { type: 'play'; clip: string; mode: PlayMode }

export interface AnimatedKeyframe {
  offset: number
  value: string
  easing: string
}

export interface ClipTrack {
  /** `data-cf` of the animated element. */
  target: string
  /** Web Animations property name, e.g. `translate` or `backgroundColor`. */
  property: string
  composite: 'replace' | 'add'
  keyframes: AnimatedKeyframe[]
}

/** A keyframe animation authored on the timeline. */
export interface Clip {
  id: string
  duration: number
  repeat: 'once' | 'loop' | 'alternate'
  autoplay: boolean
  tracks: ClipTrack[]
}

/** Scroll transform or parallax on one element. */
export interface ScrollEffect {
  target: string
  /** `page`: the page's scroll position. `in-view`: from entering the viewport (0) to leaving it (1). */
  source: 'page' | 'in-view'
  /** Scroll speed relative to the page (parallax). */
  parallax?: number
  tracks: { property: string; keyframes: AnimatedKeyframe[] }[]
}

export interface Screen {
  component: ComponentType
  /** The frame's size, px. Overlays are sized with it. */
  width: number
  height: number
  clips?: Clip[]
  effects?: ScrollEffect[]
}

export interface Motion {
  navigate(to: string, transition?: Transition): void
  /** Returns to the previous screen, reversing the transition that arrived here unless one is given. */
  back(transition?: Transition): void
  openOverlay(to: string, options?: Partial<OverlayOptions>): void
  swapOverlay(to: string, transition?: Transition): void
  closeOverlay(): void
  scrollTo(target: string, options?: Partial<ScrollOptions>): void
  openUrl(url: string, newTab?: boolean): void
  play(clip: string, mode?: PlayMode): void
  run(actions: readonly MotionAction[]): void
  /** Undoes what `run` did, for "while hovering" and "while pressing". */
  revert(actions: readonly MotionAction[]): void
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

const OPPOSITE: Record<Direction, Direction> = { left: 'right', right: 'left', up: 'down', down: 'up' }
const REVERSED: Partial<Record<TransitionType, TransitionType>> = {
  'move-in': 'move-out',
  'move-out': 'move-in',
  'slide-in': 'slide-out',
  'slide-out': 'slide-in',
}

/** The transition that undoes `t`: move-in left becomes move-out right, push left becomes push right. */
export function reverseTransition(t: Transition | undefined): Transition | undefined {
  return t && { ...t, type: REVERSED[t.type] ?? t.type, direction: OPPOSITE[t.direction] }
}

function travel(direction: Direction, size: { width: number; height: number }): [number, number] {
  switch (direction) {
    case 'left':
      return [size.width, 0]
    case 'right':
      return [-size.width, 0]
    case 'up':
      return [0, size.height]
    case 'down':
      return [0, -size.height]
  }
}

/**
 * Keyframes for the outgoing and incoming screen snapshots. The moving screen
 * travels along the direction; slides move the other screen a third as far.
 * `null` leaves that side to the browser's default crossfade.
 */
export function screenKeyframes(t: Transition, size: { width: number; height: number }): { old: Keyframe[] | null; new: Keyframe[] | null } {
  const [dx, dy] = travel(t.direction, size)
  const at = (f: number): Keyframe => ({ transform: f === 0 ? 'none' : `translate(${dx * f}px, ${dy * f}px)` })
  switch (t.type) {
    case 'move-in':
      return { old: null, new: [at(1), at(0)] }
    case 'move-out':
      return { old: [at(0), at(-1)], new: null }
    case 'push':
      return { old: [at(0), at(-1)], new: [at(1), at(0)] }
    case 'slide-in':
      return { old: [at(0), at(-1 / 3)], new: [at(1), at(0)] }
    case 'slide-out':
      return { old: [at(0), at(-1)], new: [at(1 / 3), at(0)] }
    default:
      return { old: null, new: null }
  }
}

/** Enter keyframes for an overlay, travelling from the edge of `container`. */
export function overlayKeyframes(t: Transition, container: { width: number; height: number }): Keyframe[] {
  if (t.type === 'move-in' || t.type === 'push' || t.type === 'slide-in') {
    const [dx, dy] = travel(t.direction, container)
    return [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }]
  }
  return [{ opacity: 0 }, { opacity: 1 }]
}

/** Where an overlay of `size` sits in its layer. Positions avoid transforms so enter animations can use them. */
export function overlayStyle(options: Pick<OverlayOptions, 'position' | 'offset'>, size: { width: number; height: number }): CSSProperties {
  const style: CSSProperties = { position: 'absolute', width: size.width, height: size.height }
  if (options.position === 'manual') return { ...style, left: options.offset.x, top: options.offset.y }
  const [vertical, horizontal] = options.position === 'center' ? ['center', 'center'] : options.position.split('-')
  if (vertical === 'top') style.top = 0
  else if (vertical === 'bottom') style.bottom = 0
  else style.top = `calc(50% - ${size.height / 2}px)`
  if (horizontal === 'left') style.left = 0
  else if (horizontal === 'right') style.right = 0
  else style.left = `calc(50% - ${size.width / 2}px)`
  return style
}

/** A valid, readable `view-transition-name` for a Smart Animate match path such as `Card/Title`. */
export function matchName(path: string): string {
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `cf-m-${slug || 'layer'}`
}

/** Progress of an element through the viewport: 0 as its top enters at the bottom, 1 as its bottom leaves at the top. */
export function viewProgress(top: number, height: number, viewportTop: number, viewportHeight: number): number {
  const total = viewportHeight + height
  return total > 0 ? Math.min(1, Math.max(0, (viewportTop + viewportHeight - top) / total)) : 0
}

// ---------------------------------------------------------------------------
// DOM effects
// ---------------------------------------------------------------------------

const STYLE_ID = 'codeframe-motion'

/** Rules the transitions rely on, injected once. */
export const MOTION_STYLES = [
  '::view-transition-group(*),::view-transition-image-pair(*),::view-transition-old(*),::view-transition-new(*){animation-duration:var(--cf-vt-duration,300ms);animation-timing-function:var(--cf-vt-easing,ease)}',
  'html[data-cf-vt]::view-transition-old(root),html[data-cf-vt]::view-transition-new(root){animation:none}',
  'html[data-cf-vt]::view-transition-group(cf-screen){overflow:clip}',
  ...['move-in', 'move-out', 'push', 'slide-in', 'slide-out'].map(
    (type) => `html[data-cf-vt="${type}"]::view-transition-old(cf-screen),html[data-cf-vt="${type}"]::view-transition-new(cf-screen){animation:none}`,
  ),
  'html[data-cf-vt="move-out"]::view-transition-old(cf-screen),html[data-cf-vt="slide-out"]::view-transition-old(cf-screen){z-index:1}',
].join('\n')

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = MOTION_STYLES
  document.head.append(style)
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function byCfId(scope: ParentNode | null, id: string): HTMLElement | null {
  return scope?.querySelector<HTMLElement>(`[data-cf="${CSS.escape(id)}"]`) ?? null
}

/** Names every `[data-cf-match]` element so the browser morphs matching layers between screens. */
function nameMatches(scope: HTMLElement): HTMLElement[] {
  const seen = new Map<string, number>()
  const named: HTMLElement[] = []
  for (const el of scope.querySelectorAll<HTMLElement>('[data-cf-match]')) {
    const base = matchName(el.dataset.cfMatch ?? '')
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    el.style.setProperty('view-transition-name', n ? `${base}-${n}` : base)
    named.push(el)
  }
  return named
}

interface ViewTransitionLike {
  ready: Promise<void>
  finished: Promise<void>
  skipTransition?: () => void
}

/** How long the browser may take to capture the old screen before the swap happens without animation. */
const CAPTURE_TIMEOUT = 300

/** Swaps screens with `update`, animating the change with the View Transitions API when it can. */
export async function runScreenTransition(screen: HTMLElement | null, update: () => void, t: Transition | undefined): Promise<void> {
  const doc = document as unknown as { startViewTransition?: (update: () => void) => ViewTransitionLike }
  if (!screen || !t || t.type === 'instant' || t.duration <= 0 || reducedMotion()) {
    update()
    return
  }
  const size = screen.getBoundingClientRect()
  if (!doc.startViewTransition || document.visibilityState === 'hidden') {
    update()
    const keyframes = screenKeyframes(t, size).new ?? [{ opacity: 0 }, { opacity: 1 }]
    screen.animate(keyframes, { duration: t.duration, easing: t.easing })
    return
  }

  ensureStyles()
  const root = document.documentElement
  root.style.setProperty('--cf-vt-duration', `${t.duration}ms`)
  root.style.setProperty('--cf-vt-easing', t.easing)
  root.dataset.cfVt = t.type
  const smart = t.type === 'smart-animate'
  const named = smart ? nameMatches(screen) : []
  let updated = false
  const transition = doc.startViewTransition(() => {
    updated = true
    for (const el of named) el.style.removeProperty('view-transition-name')
    update()
    if (smart) named.push(...nameMatches(screen))
  })
  // The update waits for a rendered frame; where none comes (a throttled or
  // unpainted page) skip the animation rather than leave the click hanging.
  const watchdog = window.setTimeout(() => {
    if (!updated) transition.skipTransition?.()
  }, CAPTURE_TIMEOUT)
  transition.finished.finally(() => window.clearTimeout(watchdog)).catch(() => {})
  try {
    await transition.ready
    const keyframes = screenKeyframes(t, size)
    const options = { duration: t.duration, easing: t.easing, fill: 'both' as const }
    if (keyframes.old) root.animate(keyframes.old, { ...options, pseudoElement: '::view-transition-old(cf-screen)' })
    if (keyframes.new) root.animate(keyframes.new, { ...options, pseudoElement: '::view-transition-new(cf-screen)' })
    await transition.finished
  } catch {
    // Skipped (e.g. the page was hidden) or interrupted by another transition.
  } finally {
    for (const el of named) el.style.removeProperty('view-transition-name')
    delete root.dataset.cfVt
  }
}

/** Scrolls so `target` sits `offset` px below the top, easing with any CSS easing. */
function scrollToElement(scroller: HTMLElement | null, target: HTMLElement, options: ScrollOptions) {
  const box = scroller ?? document.scrollingElement ?? document.documentElement
  const top = scroller ? scroller.getBoundingClientRect().top : 0
  const from = box.scrollTop
  const to = Math.max(0, from + target.getBoundingClientRect().top - top - options.offset)
  if (options.duration <= 0 || reducedMotion()) {
    box.scrollTop = to
    return
  }
  // A target-less effect reports eased progress for any easing string, springs included.
  const clock = new Animation(new KeyframeEffect(null, null, { duration: options.duration, easing: options.easing, fill: 'forwards' }), document.timeline)
  clock.play()
  const tick = () => {
    const progress = clock.effect?.getComputedTiming().progress ?? 1
    box.scrollTop = from + (to - from) * progress
    if (clock.playState !== 'finished') requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function animateTracks(el: HTMLElement, tracks: { property: string; keyframes: AnimatedKeyframe[] }[], options: KeyframeAnimationOptions, composite: (property: string) => CompositeOperation) {
  return tracks.map((track) =>
    el.animate(
      track.keyframes.map((k) => ({ offset: k.offset, easing: k.easing, [track.property]: k.value })),
      { ...options, composite: composite(track.property) },
    ),
  )
}

function playClip(scope: HTMLElement | null, clip: Clip, mode: PlayMode, running: Map<string, Animation[]>) {
  const create = () =>
    clip.tracks.flatMap((track) => {
      const el = byCfId(scope, track.target)
      if (!el) return []
      return animateTracks(
        el,
        [track],
        {
          duration: clip.duration,
          iterations: clip.repeat === 'once' ? 1 : Infinity,
          direction: clip.repeat === 'alternate' ? 'alternate' : 'normal',
          fill: 'both',
        },
        () => track.composite,
      )
    })
  let animations = running.get(clip.id)
  switch (mode) {
    case 'restart':
      animations?.forEach((a) => a.cancel())
      animations = create()
      break
    case 'play':
      if (!animations) animations = create()
      else
        for (const a of animations) {
          if (a.playbackRate < 0) a.reverse()
          else a.play()
        }
      break
    case 'reverse':
      if (!animations) {
        animations = create()
        for (const a of animations) a.finish()
      }
      for (const a of animations) a.reverse()
      break
    case 'pause':
      animations?.forEach((a) => a.pause())
      break
    case 'toggle':
      if (!animations) animations = create()
      else if (animations.some((a) => a.playState === 'running')) animations.forEach((a) => a.pause())
      else animations.forEach((a) => a.play())
      break
  }
  running.set(clip.id, animations ?? [])
}

/** In-view appear effects: marks elements `data-cf-inview` so their paused CSS animation runs. */
function observeAppears(scope: HTMLElement, root: HTMLElement | null): () => void {
  const elements = [...scope.querySelectorAll<HTMLElement>('[data-cf-appear="in-view"]')]
  if (elements.length === 0) return () => {}
  if (typeof IntersectionObserver === 'undefined') {
    for (const el of elements) el.dataset.cfInview = ''
    return () => {}
  }
  const observers = elements.map((el) => {
    const amount = Math.min(1, Math.max(0, Number(el.dataset.cfAmount ?? 0.3)))
    const once = el.dataset.cfOnce !== 'false'
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= amount) {
          el.dataset.cfInview = ''
          if (once) observer.disconnect()
        } else if (!entry.isIntersecting && !once && el.dataset.cfInview !== undefined) {
          delete el.dataset.cfInview
          for (const a of el.getAnimations()) a.currentTime = 0
        }
      },
      { root, threshold: [0, amount] },
    )
    observer.observe(el)
    return observer
  })
  return () => observers.forEach((o) => o.disconnect())
}

/** The element's box ignoring its own transforms, so effects that move it don't feed back into their progress. */
function layoutBox(el: HTMLElement): { top: number; height: number } {
  const parent = el.offsetParent as HTMLElement | null
  if (!parent) return el.getBoundingClientRect()
  const box = parent.getBoundingClientRect()
  const scale = parent.offsetHeight > 0 ? box.height / parent.offsetHeight : 1
  return { top: box.top + (el.offsetTop + parent.clientTop) * scale, height: el.offsetHeight * scale }
}

/** Scroll transforms and parallax, driven from the scroll position. */
function bindScrollEffects(scope: HTMLElement, effects: readonly ScrollEffect[], scroller: HTMLElement | null): () => void {
  const source = scroller ?? document.scrollingElement ?? document.documentElement
  const bound = effects.flatMap((effect) => {
    const el = byCfId(scope, effect.target)
    if (!el) return []
    const options: KeyframeAnimationOptions = { duration: 1000, fill: 'both' }
    const animations = animateTracks(el, effect.tracks, options, (p) => (p === 'translate' ? 'add' : 'replace'))
    if (effect.parallax !== undefined) animations.push(el.animate([{ translate: '0px 0px' }, { translate: '0px 0px' }], { ...options, composite: 'add' }))
    for (const a of animations) a.pause()
    return [{ el, effect, animations }]
  })
  if (bound.length === 0) return () => {}

  let frame = 0
  const update = () => {
    frame = 0
    const viewport = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight }
    for (const { el, effect, animations } of bound) {
      const box = layoutBox(el)
      let progress: number
      if (effect.source === 'page') {
        const max = source.scrollHeight - source.clientHeight
        progress = max > 0 ? source.scrollTop / max : 0
      } else {
        progress = viewProgress(box.top, box.height, viewport.top, viewport.height)
      }
      if (effect.parallax !== undefined) {
        // Moving at `speed` means lagging (1 - speed) of the distance scrolled past the element.
        const lag = ((1 - effect.parallax) * (viewport.height + box.height)) / 2
        const effectTrack = animations[animations.length - 1].effect as KeyframeEffect
        effectTrack.setKeyframes([{ translate: `0px ${-lag}px` }, { translate: `0px ${lag}px` }])
      }
      for (const a of animations) a.currentTime = progress * 1000
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  const target: HTMLElement | Window = scroller ?? window
  target.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  update()
  return () => {
    target.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    if (frame) cancelAnimationFrame(frame)
    for (const { animations } of bound) animations.forEach((a) => a.cancel())
  }
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

// ---------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------

const NOOP_MOTION: Motion = {
  navigate: () => {},
  back: () => {},
  openOverlay: () => {},
  swapOverlay: () => {},
  closeOverlay: () => {},
  scrollTo: () => {},
  openUrl: () => {},
  play: () => {},
  run: () => {},
  revert: () => {},
}

const MotionContext = createContext<Motion>(NOOP_MOTION)
const ScrollerContext = createContext<HTMLElement | null>(null)

/** Navigation, overlays, scrolling and clip playback for the current screen. */
export function useMotion(): Motion {
  return useContext(MotionContext)
}

/** Runs `callback` once, `ms` after the component mounts ("after delay" trigger). */
export function useAfterDelay(ms: number, callback: () => void): void {
  const latest = useRef(callback)
  useLayoutEffect(() => {
    latest.current = callback
  })
  useEffect(() => {
    const timer = window.setTimeout(() => latest.current(), ms)
    return () => window.clearTimeout(timer)
  }, [ms])
}

/** Runs `callback` when `key` (a `KeyboardEvent.key`) is pressed outside text fields. */
export function useKey(key: string, callback: () => void): void {
  const latest = useRef(callback)
  useLayoutEffect(() => {
    latest.current = callback
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.repeat || isEditable(e.target)) return
      e.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key])
}

/** A ref that runs `callback` the first time the element is `amount` visible ("in view" trigger). */
export function useInView<T extends Element>(callback: () => void, amount = 0.3): RefCallback<T> {
  const latest = useRef(callback)
  const root = useContext(ScrollerContext)
  useLayoutEffect(() => {
    latest.current = callback
  })
  return useCallback(
    (el: T | null) => {
      if (!el || typeof IntersectionObserver === 'undefined') return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && entry.intersectionRatio >= amount) {
            observer.disconnect()
            latest.current()
          }
        },
        { root, threshold: [0, amount] },
      )
      observer.observe(el)
      return () => observer.disconnect()
    },
    [amount, root],
  )
}

interface OverlayEntry {
  key: number
  id: string
  options: OverlayOptions
  closing: boolean
}

const DEFAULT_OVERLAY: OverlayOptions = { position: 'center', offset: { x: 0, y: 0 }, closeOnOutside: true, background: '#00000066' }

export interface MotionRouterProps {
  screens: Readonly<Record<string, Screen>>
  /** The first screen. */
  home: string
  /** `hash` keeps the screen in the URL (exported sites); `memory` doesn't (Preview). */
  history?: 'hash' | 'memory'
  /** Scroll container for scroll-to, in-view and scroll effects. Defaults to the page. */
  scroller?: HTMLElement | null
  /** `viewport` pins overlays to the window; `router` keeps them inside this component. */
  overlays?: 'viewport' | 'router'
  /** Wraps the current screen, e.g. to center or scale it. */
  frame?: (screen: ReactNode, id: string) => ReactNode
  /** Opens external links. Defaults to `window.open`. */
  openUrl?: (url: string, newTab: boolean) => void
  className?: string
  style?: CSSProperties
}

function hashRoute(screens: Readonly<Record<string, Screen>>, home: string): string {
  const route = typeof window === 'undefined' ? '' : decodeURI(window.location.hash.replace(/^#/, ''))
  return Object.hasOwn(screens, route) ? route : home
}

/** Shows one screen at a time and runs every interaction authored in Codeframe. */
export function MotionRouter(props: MotionRouterProps) {
  const { screens, home, history = 'hash', scroller = null } = props
  const [current, setCurrent] = useState(() => (history === 'hash' ? hashRoute(screens, home) : home))
  const [visit, setVisit] = useState(0)
  const [overlays, setOverlays] = useState<OverlayEntry[]>([])
  const screenEl = useRef<HTMLDivElement>(null)
  const stack = useRef<{ id: string; transition?: Transition }[]>([{ id: current }])
  const clips = useRef(new Map<string, Animation[]>())
  const pendingBack = useRef<Transition | undefined>(undefined)
  const overlaySeq = useRef(0)
  const latest = useRef({ props, current })
  useLayoutEffect(() => {
    latest.current = { props, current }
  })

  const show = useCallback((id: string, transition: Transition | undefined, updateStack: () => void) => {
    const { props: p } = latest.current
    if (!Object.hasOwn(p.screens, id)) return
    void runScreenTransition(
      screenEl.current,
      () =>
        flushSync(() => {
          updateStack()
          setOverlays([])
          setCurrent(id)
          setVisit((v) => v + 1)
          const box: HTMLElement | Window = p.scroller ?? window
          box.scrollTo(0, 0)
        }),
      transition,
    )
  }, [])

  useEffect(() => {
    if (history !== 'hash') return
    const onPop = () => {
      const { props: p, current: now } = latest.current
      const route = hashRoute(p.screens, p.home)
      if (route === now) return
      const transition = pendingBack.current
      pendingBack.current = undefined
      const index = stack.current.findLastIndex((entry) => entry.id === route)
      show(route, transition, () => {
        if (index >= 0) stack.current.length = index + 1
        else stack.current.push({ id: route })
      })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [history, show])

  const motion = useMemo<Motion>(() => {
    const api: Motion = {
      navigate(to, transition) {
        const { props: p, current: now } = latest.current
        if (!Object.hasOwn(p.screens, to) || to === now) return
        if (p.history !== 'memory') window.history.pushState(null, '', `#${encodeURI(to)}`)
        show(to, transition, () => stack.current.push({ id: to, transition }))
      },
      back(transition) {
        const { props: p } = latest.current
        const entries = stack.current
        if (entries.length < 2) return
        const reversed = transition ?? reverseTransition(entries[entries.length - 1].transition)
        if (p.history !== 'memory') {
          pendingBack.current = reversed
          window.history.back()
          return
        }
        show(entries[entries.length - 2].id, reversed, () => entries.pop())
      },
      openOverlay(to, options) {
        if (!Object.hasOwn(latest.current.props.screens, to)) return
        const entry = { key: ++overlaySeq.current, id: to, options: { ...DEFAULT_OVERLAY, ...options }, closing: false }
        setOverlays((list) => [...list, entry])
      },
      swapOverlay(to, transition) {
        if (!Object.hasOwn(latest.current.props.screens, to)) return
        setOverlays((list) => {
          const top = list.findLast((entry) => !entry.closing)
          if (!top) return list
          return list.map((entry) => (entry === top ? { ...entry, key: ++overlaySeq.current, id: to, options: { ...entry.options, transition } } : entry))
        })
      },
      closeOverlay() {
        setOverlays((list) => {
          const top = list.findLast((entry) => !entry.closing)
          return top ? list.map((entry) => (entry === top ? { ...entry, closing: true } : entry)) : list
        })
      },
      scrollTo(target, options) {
        const el = byCfId(screenEl.current?.parentElement ?? null, target)
        if (el) scrollToElement(latest.current.props.scroller ?? null, el, { offset: 0, duration: 0, easing: 'ease', ...options })
      },
      openUrl(url, newTab = true) {
        if (/^\s*(javascript|data|vbscript):/i.test(url)) return
        const open = latest.current.props.openUrl
        if (open) open(url, newTab)
        else window.open(url, newTab ? '_blank' : '_self', 'noopener')
      },
      play(clipId, mode = 'play') {
        const { props: p, current: now } = latest.current
        const clip = p.screens[now]?.clips?.find((c) => c.id === clipId)
        if (clip) playClip(screenEl.current, clip, mode, clips.current)
      },
      run(actions) {
        for (const action of actions) {
          switch (action.type) {
            case 'navigate':
              api.navigate(action.to, action.transition)
              break
            case 'back':
              api.back(action.transition)
              break
            case 'overlay':
              api.openOverlay(action.to, action.overlay)
              break
            case 'swap-overlay':
              api.swapOverlay(action.to, action.transition)
              break
            case 'close-overlay':
              api.closeOverlay()
              break
            case 'scroll-to':
              api.scrollTo(action.to, action.scroll)
              break
            case 'open-url':
              api.openUrl(action.url, action.newTab)
              break
            case 'play':
              api.play(action.clip, action.mode)
              break
          }
        }
      },
      revert(actions) {
        for (const action of [...actions].reverse()) {
          if (action.type === 'navigate') api.back()
          else if (action.type === 'overlay' || action.type === 'swap-overlay') api.closeOverlay()
          else if (action.type === 'play') api.play(action.clip, 'reverse')
        }
      },
    }
    return api
  }, [show])

  // Per screen visit: autoplay clips, watch in-view appears, bind scroll effects.
  const screen: Screen | undefined = screens[current]
  useLayoutEffect(() => {
    const scope = screenEl.current
    if (!scope) return
    const running = clips.current
    for (const clip of screen?.clips ?? []) if (clip.autoplay) playClip(scope, clip, 'restart', running)
    const stopAppears = observeAppears(scope, scroller)
    const stopEffects = bindScrollEffects(scope, screen?.effects ?? [], scroller)
    return () => {
      stopAppears()
      stopEffects()
      for (const list of running.values()) list.forEach((a) => a.cancel())
      running.clear()
    }
  }, [screen, visit, scroller])

  const Current = screen?.component
  const content = Current ? <Current key={`${current}:${visit}`} /> : null
  const fixed = (props.overlays ?? 'viewport') === 'viewport'

  return (
    <MotionContext.Provider value={motion}>
      <ScrollerContext.Provider value={scroller}>
        <div className={props.className} style={{ position: 'relative', ...props.style }}>
          <div ref={screenEl} style={{ viewTransitionName: 'cf-screen' } as CSSProperties}>
            {props.frame ? props.frame(content, current) : content}
          </div>
          {overlays.map((entry, index) => {
            const overlay = screens[entry.id]
            return overlay ? (
              <OverlayLayer
                key={entry.key}
                entry={entry}
                screen={overlay}
                index={index}
                fixed={fixed}
                onClose={motion.closeOverlay}
                onClosed={(key) => setOverlays((list) => list.filter((e) => e.key !== key))}
              />
            ) : null
          })}
        </div>
      </ScrollerContext.Provider>
    </MotionContext.Provider>
  )
}

function OverlayLayer(props: { entry: OverlayEntry; screen: Screen; index: number; fixed: boolean; onClose: () => void; onClosed: (key: number) => void }) {
  const { entry, screen } = props
  const layer = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const onClosed = useRef(props.onClosed)
  useLayoutEffect(() => {
    onClosed.current = props.onClosed
  })

  const animate = (closing: boolean): Animation | null => {
    const t = entry.options.transition
    if (!t || t.type === 'instant' || t.duration <= 0 || reducedMotion() || !box.current || !layer.current) return null
    const keyframes = overlayKeyframes(t, layer.current.getBoundingClientRect())
    const fade = [{ opacity: 0 }, { opacity: 1 }]
    const options: KeyframeAnimationOptions = { duration: t.duration, easing: t.easing, fill: 'both' }
    backdrop.current?.animate(closing ? fade.reverse() : fade, options)
    return box.current.animate(closing ? keyframes.reverse() : keyframes, options)
  }

  useLayoutEffect(() => {
    const enter = animate(false)
    return () => enter?.cancel()
    // Plays once per overlay entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (!entry.closing) return
    const exit = animate(true)
    if (!exit) onClosed.current(entry.key)
    else exit.onfinish = () => onClosed.current(entry.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.closing])

  const { options } = entry
  const Content = screen.component
  const blocking = options.closeOnOutside || options.background !== null
  return (
    <div ref={layer} style={{ position: props.fixed ? 'fixed' : 'absolute', inset: 0, zIndex: 1000 + props.index, pointerEvents: 'none' }}>
      <div
        ref={backdrop}
        style={{ position: 'absolute', inset: 0, background: options.background ?? 'transparent', pointerEvents: blocking ? 'auto' : 'none' }}
        onClick={options.closeOnOutside ? props.onClose : undefined}
      />
      <div ref={box} style={{ ...overlayStyle(options, screen), pointerEvents: 'auto' }}>
        <Content />
      </div>
    </div>
  )
}
