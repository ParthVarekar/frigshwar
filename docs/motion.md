# Motion & interaction spec (v2)

Status: **spec, being implemented** (see [PROGRESS.md](PROGRESS.md), milestones M1–M3).
Replaces motion v1: hover/press/appear/loop plus a single click `link` per layer.

## What the industry does (researched 2026-09-11)

| Capability | Figma Design (prototype) | Figma Sites | Figma Motion (Config 2026) | Framer |
|---|---|---|---|---|
| Triggers | click/tap, while hovering, while pressing, mouse enter, mouse leave, mouse down, mouse up, after delay, key/gamepad, on drag, video ends/hits | click, hover, press, in view, page load, other layer in view, scroll, cursor | play from prototype or on load | tap, hover, press, mouse enter/leave, appear (in view / load), loop, scroll |
| Actions | navigate, change to (variant), back, scroll to, open link, open/swap/close overlay, set variable, conditional, play/pause video, multiple actions per trigger | change to, back, scroll to, lightbox, set variable, conditional | n/a | navigate (with page effect), overlay/popover, variant change, scroll to section |
| Transitions | instant, dissolve, smart animate, move in/out, push, slide in/out (each with 4 directions) | instant / animate | n/a | instant, fade, slide, push, custom page effects; magic motion between variants |
| Curves | linear, ease in/out/in-out, ease in/out/in-out back, custom bezier; springs: gentle, quick, bouncy, slow, custom (stiffness, damping, mass) | preset curves | easing curves, springs, timing/easing variables | tween (bezier + duration), spring (stiffness/damping/mass or time + bounce), inertia |
| Effects | none; state is modelled with interactive components | hover, press, reveal, scroll parallax, scroll transform, mouse parallax, cursor, marquee, spin, typewriter, scramble text, draggable | presets | appear, hover, press, loop, scroll transform, scroll speed (parallax), drag, cursor, sticky, text effects, ticker, 3D transforms |
| Timeline | none | none | **keyframe timeline**, presets, animated components, read-only timeline in Dev Mode | none (variants plus effects) |
| Export | none | published site | MP4/GIF/WEBM/animated SVG, CSS/JSON/React code | published site |
| Scroll/overlay | fixed, sticky, overflow scroll (h/v/both), overlays: position (center, 6 anchors, manual), close on click outside, background dim | sticky, fixed, breakpoints | n/a | sticky, fixed, overlays, popovers |

Sources: Figma Learn ("Prototype animations", "Connect your prototype", "Add interactions to an
element", "What's new from Config 2026"), Framer Academy (scroll transforms), framer.com/updates,
and third-party Framer animation guides.

**Takeaway:** Codeframe v1 had a slice of Framer's effects and a single click link. A
"functional" motion system needs four layers that compose: **curves** (bezier + spring),
**effects** (always-on, per layer), **interactions** (trigger → actions → transition,
including Smart Animate and overlays) and a **timeline** (keyframes, Figma Motion style). All of
it must export to code that runs identically to Preview.

---

## 1. Timing and curves

```ts
type Curve =
  | { type: 'bezier'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'spring'; stiffness: number; damping: number; mass: number }

interface Timing { duration: number /* ms, ignored for springs */; delay: number; curve: Curve }
```

- Bezier presets (UI): linear, ease in, ease out, ease in and out, ease in back, ease out back,
  ease in and out back, custom.
- Spring presets (Figma values): gentle (100/15/1), quick (300/20/1), bouncy (600/15/1),
  slow (80/20/1), custom.
- A spring's duration is **derived**: simulate until it settles within 0.1% and stays there.
  The UI shows the derived ms.
- CSS output: bezier → `cubic-bezier()`. Spring → CSS `linear()` easing sampled from the
  simulation (about 40 points, trimmed collinear), with the derived duration. Both work in
  transitions, `@keyframes` and WAAPI, so springs need no JS in shipped code.
- Legacy easing strings (`'ease-out'`, `'spring'`, …) normalize to curves.

## 2. Effects (always on, per layer)

| Field | Shape | Ships as |
|---|---|---|
| `hover`, `press` | `StateStyle` (opacity, scale, rotate, x, y, fill, shadow, blur) + `transition: Timing` | `:hover` / `:active` rules + `transition` |
| `appear` | `{ from: MotionState, trigger: 'load' \| 'in-view', once: boolean, amount: 0–1, timing }` | `@keyframes` + runtime in-view observer toggling `data-cf-inview` |
| `loop` | `{ preset, duration, delay, curve, direction: 'normal' \| 'alternate' }` | `@keyframes infinite` |
| `scroll` | `{ source: 'page' \| 'in-view', keyframes: { at: 0–1, state: MotionState }[] }` | runtime maps scroll progress to transforms (CSS `animation-timeline` where supported) |
| `parallax` | `{ speed: number }` (1 = normal scroll) | runtime translateY |

`MotionState = { opacity?, scale?, rotate?, x?, y?, blur? }`.
Appear presets (fade, slide ×4, scale, blur) are UI shortcuts that fill `from`.

## 3. Interactions

```ts
interface Interaction { id: string; trigger: Trigger; actions: Action[] }

type Trigger =
  | { type: 'click' } | { type: 'mouse-enter' } | { type: 'mouse-leave' }
  | { type: 'while-hovering' } | { type: 'while-pressing' }
  | { type: 'mouse-down' } | { type: 'mouse-up' }
  | { type: 'after-delay'; delay: number } | { type: 'key'; key: string }
  | { type: 'in-view' }

type Action =
  | { type: 'navigate'; target: NodeId; transition: ScreenTransition }
  | { type: 'back'; transition: ScreenTransition }
  | { type: 'overlay'; target: NodeId; overlay: OverlaySettings; transition: ScreenTransition }
  | { type: 'swap-overlay'; target: NodeId; transition: ScreenTransition }
  | { type: 'close-overlay' }
  | { type: 'scroll-to'; target: NodeId; offset: number; animate: boolean; timing: Timing }
  | { type: 'open-url'; url: string; newTab: boolean }
  | { type: 'play-animation'; animation: AnimationId; mode: 'play' | 'restart' | 'reverse' | 'toggle' | 'pause' }

interface ScreenTransition {
  type: 'instant' | 'dissolve' | 'smart-animate' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out'
  direction: 'left' | 'right' | 'up' | 'down'
  timing: Timing
}

interface OverlaySettings {
  position: 'center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'manual'
  offset: { x: number; y: number }
  closeOnOutside: boolean
  background: Color | null
}
```

- A layer holds any number of interactions, and each has one or more actions (Figma's
  "multiple actions").
- `while-hovering` / `while-pressing` + `navigate` / `overlay` revert when the gesture ends (Figma
  semantics).
- **Smart Animate:** layers in the source and destination screens are matched by their
  name path under the screen (`Card/Title`). Matched layers animate box, rotation, opacity, fill
  and corner radius (FLIP with WAAPI). Destination-only layers dissolve in and source-only
  layers dissolve out. Codegen emits `data-cf-match="Card/Title"` only on screens that take part
  in a smart-animate transition.
- Migration: v1 `link` becomes one `click` interaction with `navigate` / `back`.
  `slide-left` → `move-in` left, `push-left` → `push` left, `dissolve` → `dissolve`.

## 4. Timeline (keyframe animations)

```ts
interface AnimationClip {
  id: AnimationId
  name: string
  /** Top-level frame the clip belongs to; tracks may target any layer inside it. */
  frameId: NodeId
  duration: number
  repeat: 'once' | 'loop' | 'alternate'
  autoplay: boolean // play when the screen loads
  tracks: Track[]
}
interface Track { nodeId: NodeId; property: AnimatableProperty; keyframes: Keyframe[] }
interface Keyframe { time: number /* ms */; value: number | Color; curve: Curve /* into the next key */ }
type AnimatableProperty = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity' | 'scale' | 'fill' | 'cornerRadius' | 'blur'
```

- Stored in a doc-level `Y.Map` (`animations`), one entry per clip. Concurrent edits to the
  same clip resolve last-writer-wins per clip; clips never conflict with node edits.
- Editor: a bottom timeline panel with layer rows, property tracks, keyframe diamonds, a
  playhead and scrubbing. **Auto-key:** while the playhead is off zero and auto-key is on,
  property edits on the canvas write keyframes instead of base values. The canvas renders
  `evaluateClip(snapshot, clip, t)` while scrubbing or playing.
- Playback triggers: `autoplay` on screen load, or the `play-animation` action.
- Ships as CSS: one `@keyframes` per animated layer per clip, with percent stops and
  per-segment `animation-timing-function` (springs as `linear()`). Play, restart, reverse and
  pause are a runtime class/`animation-play-state` toggle.

## 5. One runtime, two hosts

`packages/runtime` holds the DOM-level motion core: spring sampling, screen transitions,
Smart Animate FLIP, overlays, scroll-to, in-view and scroll observers, clip playback. Preview
imports it directly. Codegen vendors the same source into exported projects
(`src/lib/codeframe-motion.ts`), and a test fails if the vendored copy drifts.
