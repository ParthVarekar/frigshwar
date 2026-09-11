# Codeframe progress log

The handoff document. If you are picking this work up (human or agent), read this
file first, then [feature-parity.md](feature-parity.md) (what Figma/Framer do and
where we stand) and [architecture.md](architecture.md) (how the code fits together).

**Rule:** update this file at the end of every milestone, before starting the next.

---

## How to resume

1. `startup.bat` (Windows) or see "Run it" in the [README](../README.md). The editor
   runs on http://localhost:5173, the sync server on :1234. `shutdown.bat` stops both.
2. Checks that must stay green:
   - `npm test --workspaces --if-present`: scene, library and codegen unit and golden tests
   - `npx tsc -b` in `apps/web`: typecheck
   - `npm run lint -w apps/web`: oxlint
   - `npx tsx scripts/export-smoke.ts <out-dir>`, then `npm install && npm run build` inside
     `<out-dir>`: proves an exported project builds with no manual fixes
3. Find the first unchecked milestone under "Current effort" and continue it.
   The "Log" section says what the last session was in the middle of.

## State of the product

### Done before 2026-09-11

- Monorepo: `apps/web` (editor), `apps/server` (Hocuspocus + SQLite),
  `packages/scene` (scene graph on Yjs), `packages/library` (shadcn/ui specs),
  `packages/codegen` (scene → Vite/React/Tailwind project).
- Canvas editor (Konva): frames, rects, ellipses, text, images, groups; fills, inside strokes,
  radius, shadows; layers tree; smart guides and snapping; align and distribute; undo/redo;
  local autosave (y-indexeddb); PNG export; context menu; keyboard shortcuts.
- Motion v1 (Animate tab): hover and press state styles plus a transition, appear presets,
  loop presets, and one click link per layer to a frame (or back) with dissolve, slide or
  push. The ⊕ handle on the canvas is dragged onto a frame to link.
- Preview: DOM render through the shared scene→CSS mapping (`packages/scene/src/css.ts`).
- Component library: 12 shadcn/ui components drawn on the canvas, themed with shared
  tokens, and exported as the real vendored shadcn source.
- Export code dialog: whole site as a project (one page per top-level frame, hash
  router, fonts, images, shadcn components), with file browser, copy and zip download.
- Copy/cut/paste with a cascading offset and cross-tab JSON clipboard.
- `startup.bat` / `shutdown.bat`.

### Not committed

Everything after the `initialization` commit is uncommitted working tree (library, export
dialog, copy/paste, link drag, and everything in the current effort). Commit before moving
machines: `git add -A && git commit`.

---

## Current effort: animation rework, page structure, Figma/Framer parity (started 2026-09-11)

Request (paraphrased): the animation system isn't functional enough, so study what Figma
and Framer do and rebuild it. Improve page structure. Do a full functional analysis so no
Figma or Framer feature is missed. Get the docs in order and keep a progress log.

Interpretation of "page structure" (no clarification was available):
(a) real **Pages** in the document (named pages with routes, SEO title/description, a home
page) instead of "every top-level frame is a page"; (b) **structured layout**: auto layout
(stacks) and semantic tags, so exported pages are flex/semantic HTML rather than
absolutely positioned boxes; (c) responsive **breakpoints** per page.

### Milestones

- [x] **M0: Docs and research.** PROGRESS.md (this), CLAUDE.md, architecture.md, Figma/Framer
      research, full parity matrix in feature-parity.md, motion spec in motion.md.
- [x] **M1: Interaction model.** Scene types for multiple interactions per layer
      (trigger → action → animation), spring and bezier curves, Smart Animate, overlays,
      scroll-into-view and scroll-transform effects, migration from v1 `link`. Tests.
- [x] **M2: Motion runtime.** One runtime used by Preview and by exported code: triggers,
      navigate/back/overlay/scroll-to/open-URL actions, transitions including Smart Animate
      (layer matching by name), springs via CSS `linear()`, in-view and scroll effects.
- [x] **M3: Prototype UX.** (Flows / starting points moved to the M5 backlog.) Interaction list editor, curve and spring editor with preview,
      noodles for every interaction, flow starting points, overlay settings, on-canvas
      effect playback.
- [ ] **M4: Page structure.** Pages entity and panel (route, title, description, home),
      auto layout on frames (direction, gap, padding, alignment, wrap, hug/fill/fixed
      sizing), semantic tags, flex-based codegen, breakpoints.
- [ ] **M5+: Parity backlog.** Work down the gaps in feature-parity.md by priority.

---

## Log

### 2026-09-11

- Verified the previous batch in the browser: library insert (Button, Card), export dialog
  (2 pages, 14 files), paste cascade (+20/+40), and cut. Fixed keyboard shortcuts to match by
  `e.key` when `e.code` is missing, and paste centering when the canvas is unmeasured.
  The link-handle drag was not browser-verified: the pane was hidden, so Konva never mounted.
- Started the current effort, beginning with M0.
- **M0 done.** Researched Figma prototyping (triggers, actions, animations), Figma Sites
  interactions, Figma Motion (Config 2026 keyframe timeline) and Framer effects. Wrote
  `docs/motion.md` (v2 model: curves, effects, interactions, timeline, shared runtime),
  `docs/feature-parity.md` (12 areas, every feature rated with priority),
  `docs/architecture.md` and `CLAUDE.md`.
- **M1 done.** `packages/scene`:
  - `types.ts`: `Curve` (bezier | spring), `Timing`, `MotionState`, `AppearEffect`
    (from-state, load/in-view, once, amount), `LoopEffect`, `ScrollEffect`, `ParallaxEffect`,
    `Interaction` (trigger + actions), `ScreenTransition`, `OverlaySettings`, and
    `AnimationClip` / `Track` / `Keyframe`.
  - `curves.ts`: presets (Tailwind béziers, Figma springs), bezier solve, analytic spring,
    derived settling time, `linear()` sampling, `curveCss`, `timingCss`.
  - `timeline.ts`: `trackValueAt`, `clipTime`, `evaluateClip` (center-pivot rotation),
    `applyClipFrame`, `clipPlayback` (per-track WAAPI data, x/y as composite translate).
  - `interactions.ts`: click-navigation helpers.
  - `normalize.ts`: every new shape, URL sanitizing (`safeUrl`), v1 migration.
  - `doc.ts`: the `animations` Y.Map, `link` migrated on read and deleted when
    interactions are written. `SCHEMA_VERSION` is 2.
  - Store: snapshot `animations`, clips on the undo stack. `ops.ts`: `putAnimation` /
    `deleteAnimation`, paste remaps action targets.
  - `css.ts`: shared `cf-appear` keyframes driven by `--cf-from-*` vars, and in-view hold
    rule, springs as `linear()`.
  - Consumers adapted and compiling: codegen (click navigate emits
    `{transition, direction, duration, easing}`; router handles new types), web (Animate
    panel with curve presets and settle time, appear trigger and replay, click animation plus
    direction, hover blur), preview (move-in/out, push, slide-in/out per direction), canvas
    appear playback with real curves, seed doc, smoke script.
  - Tests: scene 38, codegen 5, library 7. Typecheck and oxlint are clean.
- **M2 design decisions** (so a new session can continue):
  - `packages/runtime/src/motion.tsx` is a **single self-contained React file** (react +
    react-dom only). The editor Preview imports it from `@codeframe/runtime`. Codegen vendors
    the same text into exports as `src/motion.tsx` via `scripts/sync-runtime.mjs`, which
    writes `packages/codegen/src/runtime.generated.ts`; a test fails on drift.
  - `MotionRouter` (history `hash` in exports, `memory` in Preview) replaces `ROUTER_TSX`.
    Screens are `{ component, clips?, effects? }` keyed by route (exports) or frame id
    (Preview).
  - **Screen transitions use the View Transitions API.** The screen container has
    `view-transition-name: cf-screen`, and move/push/slide are WAAPI animations on
    `::view-transition-old/new(cf-screen)` with the UA crossfade disabled via a `data-cf-vt`
    attribute on `<html>`. **Smart Animate** sets `view-transition-name` from `data-cf-match`
    (layer name path, deduped) on the old screen before the transition and the new screen
    inside the update, so the browser morphs matched layers. Fallback when unsupported or
    hidden: WAAPI enter animation only.
  - Actions reach the runtime as resolved JSON: `{type:'navigate', to, transition:{type,
    direction, duration, easing}}` and similar. Generated JSX calls `motion.navigate(...)` /
    `motion.openOverlay(...)` etc. from `useMotion()`. While-hovering / while-pressing run on
    enter/down and `motion.revert()` on leave/up (navigate → back, overlay → close).
  - Hooks: `useAfterDelay`, `useKey`, `useInView` (in-view trigger). The in-view appear
    observer toggles `data-cf-inview` (CSS hold rule already in `MOTION_KEYFRAMES`).
  - Clips play with WAAPI on `[data-cf="<id>"]`. Scroll transform and parallax run as WAAPI
    animations (composite add) driven by `ViewTimeline` / `ScrollTimeline` when supported,
    else a scroll listener setting `currentTime`. Never CSS `animation-timeline`: it would
    clobber the appear/loop `animation` shorthand, and unsupported browsers would jump to the
    end state.
  - Scroll-to easing reads eased progress from a target-less `KeyframeEffect`'s
    `getComputedTiming().progress`, so any CSS easing string works in JS.
- **M2 done.**
  - `packages/runtime/src/motion.tsx` (`@codeframe/runtime`), covering:
    - `MotionRouter` with hash or memory history.
    - View Transitions for screen changes, with a 300 ms capture watchdog that skips the
      animation when no frame paints.
    - Smart Animate via `data-cf-match`.
    - Overlays, scroll-to, clips (WAAPI) and scroll effects.
    - In-view appears, plus `useMotion`, `useAfterDelay`, `useKey` and `useInView`.
  - Scene: `interactionBindings`, `resolveActions`, `scrollTargets` (interactions.ts) and
    `scrollPlayback` (timeline.ts).
  - Codegen:
    - `scripts/sync-runtime.mjs` writes `runtime.generated.ts`; a test fails on drift.
    - `page.ts` emits handlers, hooks and `data-cf*`.
    - `project.ts` builds App `screens` for `MotionRouter`, writes
      `src/pages/<Page>.motion.ts` (clips and effects) and vendors `src/motion.tsx`.
      `ROUTER_TSX` is gone.
  - Web: Preview runs `MotionRouter` (memory history, stage scroller, fit-to-width frames).
    `DomTree live` binds every trigger through the runtime.
  - Verified:
    - Tests: runtime 7, scene 41, codegen 8, library 7. Web typecheck and oxlint are clean.
    - The smoke export (3 routes, every trigger and action, clip, scroll transform,
      parallax, Smart Animate) passes `npm install && npm run build`.
    - Browser, on the migrated seed doc: push navigation and back, an overlay opening at
      top-right and closing on backdrop click, clip playback running. Undo restores.
  - **Not visually verified:** the browser pane was hidden, so View Transitions fell back
    through the watchdog. Smart Animate and push visuals need a check in a visible browser.
- **M3 plan (Prototype UX), split in two:**
  - **M3a:**
    - Animate tab: an interaction list replaces "On click". Each interaction is a trigger
      editor (type, delay, key) with an action list, and every action type has an editor:
      destination, transition, overlay settings, scroll target and offset, URL, clip and mode.
    - Curve editor popover: draggable bézier handles, and spring stiffness / damping / mass
      with a live graph.
    - Custom appear from-state fields, plus Scroll transform and Parallax sections.
  - **M3b:**
    - Timeline panel above the colophon: clip picker (new, rename, duration, repeat,
      autoplay, delete), layer and property tracks, keyframe diamonds (drag in time, select,
      curve, delete), ruler, playhead scrub, play and pause.
    - "Add keyframe at playhead". Record mode turns Design-panel edits at playhead > 0 into
      keyframes.
    - The canvas renders `applyClipFrame` while the timeline is open.
  - Flows / starting points can follow as M3c.
- **M3a done.** Web `chrome/`:
  - `InteractionsSection.tsx`: an interaction list with every trigger (key capture field,
    delay) and every action editor (destination, transition, overlay position / offset /
    click outside / dim, scroll target / offset / animate / timing, link and new tab, clip and
    playback mode). Switching the trigger to while-hovering makes its overlays non-blocking.
  - `CurveEditor.tsx`: bézier plate with draggable handles and numeric fields; spring
    stiffness / damping / mass with a response graph and settle time.
  - `motion-fields.tsx`: `CurveField` (presets plus a popover editor), `TimingFields`,
    `TransitionFields`, `MotionStateFields`.
  - `AnimatePanel.tsx`: Interactions first, then Hover / Press (with blur) / State
    transition, Appear (custom start state, in-view amount, replay), Scroll transform
    (source and keyframe list), Parallax (speed), Loop. `Popover` takes a `height` prop.
  - Browser-checked: the migrated seed link shows as On click → Navigate to Article card,
    Push, Toward the left, Ease in and out. The curve popover renders with 2 handles.
    Typecheck is clean.
- **M3b implemented** (web `editor/timeline/`):
  - `timeline-store.ts`: open clip, playhead, playing, recording, selected keyframe, and
    animated patches for the canvas.
  - `record.ts`: `withKeyframe` (a new track also keys the base value at 0) and
    `recordPatches` (splits Design-tab patches into keyframes plus base edits).
  - `TimelinePanel.tsx`, above the colophon and aligned to the 248/272 columns:
    - Clip picker, New, name, length, repeat, autoplay, play/pause, time readout, Record,
      delete, close.
    - Layer and property rows showing values at the playhead; ruler ticks; pencil playhead
      with scrub; draggable keyframe diamonds (10 ms snap, Shift for free).
    - Keyframe inspector (time, value, easing to the next key via `CurveField`, delete) or
      "Add keyframe" (property plus Key at playhead). Delete/Backspace removes the selected
      keyframe.
  - Wiring:
    - Masthead "Timeline" toggle.
    - `useNode` merges playhead patches, so the canvas draws animated values.
    - The Inspector `commit` routes through `recordPatches` when recording.
    - The Overlay hides the transformer while the playhead is off 0 or playing.
  - Known limits:
    - Scale and blur tracks don't draw on the canvas (they play in Preview and export).
    - Selection outlines stay at base geometry while scrubbing.
    - Canvas drags don't record; only Design-tab edits do.
    - Rotation recorded from the Design tab also keys x/y, because `setRotation` pivots on
      the center.
  - Browser notes: the hidden pane throttles timers to 1 s, and zustand-driven React renders
    need a timer tick before DOM checks. Clean up any test clips from the user's draft.
  - **Verified in the browser:** New clip, Key at playhead, scrub to 0.60 s, Record, then
    Opacity 30% in the Design tab. Result: opacity track 0 ms → 1 and 600 ms → 0.3, the
    layer's base opacity still 1, two diamonds. Test data was removed from the draft.
    Typecheck and oxlint are clean.
- **M4 plan (page structure), split in three:**
  - **M4a, auto layout (Figma auto layout / Framer stacks):**
    - `FrameNode.layout` holds direction, wrap, gap (fixed or auto = space-between), row gap,
      padding ×4, and main- and cross-axis alignment.
    - Every node gets `sizeX`/`sizeY` (`fixed` | `hug` | `fill`), min/max width and height,
      and `absolute` (ignore auto layout).
    - **Layout is derived in `buildSnapshot`**, like groups: conflict-free, with no layout
      writes. Hug is bottom-up, fill and positions top-down. Stored x/y of flow children are
      ignored, and removing layout bakes the computed positions.
    - CSS/codegen emit flexbox (children lose left/top; fill → flex-1 / self-stretch; hug →
      auto).
    - Inspector: Auto layout section (Shift+A), direction, gap, padding, 3×3 alignment grid,
      child resizing and absolute toggle. Dragging a child on the canvas reorders it.
  - **M4b, pages:**
    - `FrameNode.page` holds path, title, description, noindex, and `route: false` for
      overlay-only frames. Doc meta has `home`.
    - Pages tab in the left panel (list, home marker, new page) and a Page section in the
      Inspector.
    - Export uses those paths and sets per-page title/meta through the runtime, plus
      `htmlTag` semantic tag overrides (section, header, nav, footer, a, h1–h6…).
  - **M4c, breakpoints:** frames linked to a page as tablet/phone variants
    (`page.breakpointOf`, `minWidth`). The runtime picks the variant with `matchMedia`, and
    Preview gets a width switcher. Linked content with overrides is P1.
  - Multiple design canvases per file (Figma "pages") stay P1 in the parity matrix.

### 2026-09-12

- **M4a auto layout done** (export smoke build verified; interactive browser check still to do, because
  the browser tools were unavailable this session):
  - Scene model: `FrameNode.layout` (`FrameLayout`: direction, wrap, gap, crossGap, padding,
    justify start/center/end/space-between, align start/center/end). Every node has `sizeX`/`sizeY`
    (`fixed` | `hug` | `fill`), `minWidth`/`maxWidth`/`minHeight`/`maxHeight` and `absolute`. All
    normalized in `COMPOSITE_PROPS`.
  - `layout.ts`: `applyAutoLayout` runs at the end of `buildSnapshot`. Snapshots carry *computed*
    x/y/width/height for stacked children and hug frames; the doc keeps the stored values. Hidden,
    absolute and group children don't flow. `stackedSize` gives a leaving child its computed size.
  - `layout-ops.ts`: `inferLayout` (direction/gap/padding/align/order from current positions),
    `addAutoLayout`, `wrapInAutoLayout` (one undo step), `removeAutoLayout` and `setAbsolute` (both
    bake computed geometry), `pinSizing` (hand-set size → fixed), `flowPosition` + `atPosition`
    (drop slot in a stack), `isStacked`. `moveNodes`/`unwrapNodes` keep a child's size when it
    leaves a stack.
  - CSS (`css.ts`): stacks → `display:flex` + direction/wrap/gap/padding/justify/align; stacked
    children → `position:relative; flex-shrink:0`, fill → `flex:1 1 0px` / `align-self:stretch`,
    hug → size omitted. Codegen maps these to Tailwind (`flex-col`, `gap-4`, `px-8`, `flex-1`,
    `self-stretch`, `shrink-0`, `min-w-*`…). Test "auto layout export" covers it.
  - Web:
    - `chrome/LayoutSection.tsx`: Auto layout section (add/remove; Vertical/Horizontal/Wrap;
      3×3 alignment pad; gap with Auto gap = space-between; row gap when wrapping; padding H/V or
      per side) and Resizing section (Fixed/Hug contents/Fill container per axis, min/max, Ignore
      auto layout).
    - Inspector: X/Y read-only for stacked layers; W/H edits and transformer resizes pin sizing.
      `NumberField` gained `disabled`, `placeholder`, `onClear`.
    - Shortcuts: Shift+A adds auto layout to a lone plain frame or wraps the selection in a hugging
      stack; Alt+Shift+A removes it. Arrow keys along a stack's direction reorder stacked layers.
    - Canvas drag: over a stack, layers join its flow at the pointer and reorder live; dragged out,
      they pop out under the pointer. Absolute children move freely in their own stack.
    - Layers panel shows Rows/Columns glyphs for stacks.
  - Checks: all workspace tests (scene 57, codegen 9, library 7, runtime 7), scene/codegen
    typecheck, web `tsc -b` and oxlint clean. `export-smoke.ts` gained a "Pricing" page (nested
    stacks: space-between header, wrapping plans with min/max, fill dividers, absolute badge);
    it exports `flex flex-col gap-6 px-16 py-12 items-center`, `self-stretch`, `flex-wrap`,
    `min-w-50 max-w-80`, and `npm run build` passes. Vite serves every changed module.
  - **To verify in a browser next session:** Shift+A on a frame with children (positions
    unchanged), alignment pad, gap/padding scrubs, Fill container, drag-reorder in a stack and
    drag out, arrow-key reorder, Alt+Shift+A (nothing moves), Preview of a stack.
  - Known limits: text with `fill` width doesn't re-measure its height on the canvas (export is
    right); groups don't take part in a flow; align/distribute on stacked layers write ignored x/y.

---

## Gotchas

- The browser automation pane pauses rendering when hidden: `canvasSize` stays 0×0 and the
  Konva stage never mounts, CSS transitions freeze, and screenshots time out. Drive checks
  through `window.codeframe` (`{ store, ui }`) and synthetic events instead.
- Injected key events may lack `e.code`, and Alt chords can be dropped. Shortcuts match on
  `e.code` or `e.key` for this reason.
- Vite sometimes keeps a stale module after a rename; restart the dev server.
- If the browser tools are unavailable (e.g. an MCP name conflict), fall back to: unit tests,
  the export smoke build, and `curl http://localhost:5173/src/<module>` to prove Vite compiles
  each changed module. Log what still needs an interactive check.
- Yjs rejects plain objects with a `constructor` key.
- `scripts/sync-shadcn.mjs` regenerates `packages/library/src/shadcn/registry.generated.ts`.
  Never hand-edit the generated file.
