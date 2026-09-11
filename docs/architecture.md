# Architecture

## Workspaces

```
apps/web          Editor: Vite 8 + React 19 + TS + Tailwind v4, canvas on Konva/react-konva
apps/server       Hocuspocus 4 (Yjs over WebSocket); document metadata and state in node:sqlite
packages/scene    Scene graph: types, Yjs schema, store, geometry, ops, normalizers, scene→CSS
packages/library  Component library specs (shadcn/ui): canvas drawing, props, theme, JSX, registry
packages/runtime  Motion runtime (one React file) shared by Preview and exported sites
packages/codegen  Scene → exported Vite + React + Tailwind project (pages, motion wiring, css, components)
scripts/          sync-shadcn.mjs, sync-runtime.mjs (vendoring), export-smoke.ts (end-to-end export check)
docs/             PROGRESS (handoff log), feature-parity, motion spec, design-language, this file
```

Workspaces are npm workspaces; packages are consumed as TypeScript source (no build step).

## Data model (`packages/scene`)

- **The Yjs document is the state.** `doc.ts` defines the schema: a `nodes` Y.Map of per-node
  Y.Maps, an `assets` Y.Map (content-addressed images), and a `meta` Y.Map (title,
  `libraryTheme`, …).
- `SceneStore` (`store.ts`) turns Yjs updates into immutable `SceneSnapshot`s for React
  (`useSyncExternalStore`). It owns a `Y.UndoManager` for this client's edits and exposes
  `transact(fn, { merge })`. Merged transactions coalesce a drag into one undo step.
- **Nodes** (`types.ts`): frame, rect, ellipse, text, image, group, component. Boxes are
  relative to the parent, with rotation about the top-left. Children are ordered by a
  fractional `index`.
  - **Groups** are transparent: their box is derived and children live in the group's parent
    space.
  - **Auto layout** (`layout.ts`): a frame's `layout` (direction, wrap, gap, padding,
    justify, align) and each node's `sizeX`/`sizeY` (fixed, hug, fill), min/max and
    `absolute` are stored; the positions they produce are not. `buildSnapshot` ends with
    `applyAutoLayout`, so snapshots carry computed boxes for stacked children and hug frames,
    the same way group bounds are derived. Concurrent edits can't conflict over layout.
    Editing helpers are in `layout-ops.ts`: infer/add/remove (removal bakes geometry),
    `setAbsolute`, `pinSizing`, and `flowPosition` for drag reordering.
  - **Composite props** (shadow, hover, press, transition, appear, loop, scroll, parallax,
    interactions, props, layout) are whole JSON values, each validated by a normalizer in
    `normalize.ts` and registered in `COMPOSITE_PROPS`. Motion v1 values (easing names,
    appear presets, `link`) are migrated on read.
  - **Timeline clips** live in a doc-level `animations` Y.Map. See `timeline.ts` for
    evaluation and WAAPI playback data. Curves and springs live in `curves.ts`.
- **Repair** (`tree.ts`): orphans and parent cycles from concurrent edits are lifted to the
  canvas deterministically, so every client renders the same tree.
- **Ops** (`ops.ts`): all mutations go through ops: create, delete, move, reorder, group,
  frame, unwrap, align, distribute, duplicate, serialize/paste (with id and link remapping),
  addAsset, applyPatches.
- **Geometry** (`geometry.ts`, `matrix.ts`, `transform.ts`, `snapping.ts`): world transforms,
  bounds, `hitTest` (returns the root → deepest chain), transform gestures, smart guides.
- **Scene → CSS** (`css.ts`): `domLayout` converts the model's top-left rotation pivot to CSS
  center rotation; `nodeCss`, `stateCss`, `motionCss`, `MOTION_KEYFRAMES`,
  `subtreeStylesheet`. Preview and codegen share this mapping, which keeps them in lockstep.
  Stacks become flexbox (`flexCss`); stacked children drop `left`/`top` and get
  `position:relative; flex-shrink:0`, with fill as `flex:1 1 0px` or `align-self:stretch`
  (`sizeCss`). `nodeCss` takes the parent's layout for this.

## Editor (`apps/web/src/editor`)

- `scene-context.tsx` provides the store; `ui-store.ts` (zustand) holds ephemeral UI state:
  tool, selection, viewport, panels, preview, link draft, export dialog, context menu.
- `canvas/`
  - `Canvas.tsx` handles pointer routing: select, marquee, create, pan, link-drag, and
    drops of images and components.
  - `NodeView.tsx` holds the Konva views per node type; component instances render virtual
    nodes from `expandInstance`.
  - `Overlay.tsx` draws selection, the transformer, hover outlines, guides, link noodles and
    the ⊕ handle, all in screen space.
  - `TextEditor.tsx` is the in-place text editing overlay.
- `chrome/`: Masthead (tools, export, preview), LayersPanel (Layers | Library tabs),
  PropertiesPanel (Design tab), LayoutSection (Auto layout and Resizing sections),
  AnimatePanel (Animate tab), fields, context menu.
- `timeline/`: TimelinePanel, the playhead store, and recording of Design-tab edits as keyframes.
- `preview/`: `DomTree` renders a subtree as DOM using `treeStylesheet`, and `PreviewOverlay`
  runs prototypes.
- `export/ExportDialog.tsx`: runs codegen in the browser, formats with Prettier (standalone,
  lazy), browses files, and zips with fflate.
- `commands.ts` holds the user-level commands shared by shortcuts, menus and panels.
  `shortcuts.ts` holds the keyboard map, matching on `e.code` or `e.key`.
- Persistence: `y-indexeddb` (`codeframe:draft:v2`). `window.codeframe = { store, ui }` is
  exposed for debugging and automation.

## Component library (`packages/library`)

- `spec.ts` defines `ComponentSpec`: `size`, `draw` (virtual scene nodes for canvas and
  preview), `jsx` (exported markup), `imports`, `registry` (shadcn items to vendor), prop
  controls and resize mode.
- `shadcn/components.ts` holds 12 specs with metrics taken from the shadcn new-york-v4
  sources. `registry.generated.ts` is the vendored source (via `scripts/sync-shadcn.mjs`).
- `theme.ts` defines `LibraryTheme` tokens (stored in doc meta), which drive both canvas drawing
  and exported `index.css`.

## Code export (`packages/codegen`)

`exportProject({ snapshot, title, theme }, format)` produces
`package.json`, `index.html`, `vite.config.ts`, tsconfigs, `src/main.tsx` (font imports),
`src/App.tsx` (routes), `src/router.tsx` (hash router + transitions), `src/index.css`
(Tailwind v4, shadcn tokens, motion keyframes), `src/lib/utils.ts`, the vendored
`src/components/ui/*`, `src/pages/*` (one per top-level frame, via `page.ts`),
`public/images/*` and a README.

- `tailwind.ts` maps CSS declarations to idiomatic Tailwind v4 classes (spacing scale when
  exact, arbitrary values otherwise).
- `format` is injected: Prettier in Node for tests, `prettier/standalone` in the browser.
- Tests: golden expectations in `packages/codegen/test`. `scripts/export-smoke.ts` exports
  every feature and the result is built with `npm run build`.

## Server (`apps/server`)

Hocuspocus 4 with SQLite persistence via `node:sqlite`. It isn't wired into the editor yet
(roadmap step 3). The editor is single-player with local persistence today.

## Motion runtime (`packages/runtime/src/motion.tsx`)

One self-contained React file (react and react-dom only), used twice:

- **Preview** imports it from `@codeframe/runtime`. `PreviewOverlay` builds a `screens` map
  keyed by frame id, where each screen renders `DomTree` with `live`, and runs
  `<MotionRouter history="memory" scroller={stage}>`.
- **Exports** vendor the same text as `src/motion.tsx`. `App.tsx` builds `screens` keyed by
  route and runs `<MotionRouter screens home="/">` (hash history).

What it does:

- Screen transitions use the View Transitions API. The screen container is
  `view-transition-name: cf-screen`; move/push/slide are WAAPI animations on the
  `::view-transition-old/new(cf-screen)` pseudo-elements. Smart Animate names
  `[data-cf-match]` elements (layer-name paths) on both screens so the browser morphs them.
- Overlays: position, backdrop, click outside and enter/exit animations. Also scroll-to (any
  CSS easing, via a target-less `KeyframeEffect` clock) and open-URL (`javascript:` refused).
- Timeline clips run with WAAPI on `[data-cf]`. Scroll transforms and parallax are WAAPI
  animations whose `currentTime` follows scroll progress. In-view appears flip
  `data-cf-inview`.
- Hooks for generated code: `useMotion`, `useAfterDelay`, `useKey`, `useInView`.

Shared semantics live in `packages/scene/src/interactions.ts`: `interactionBindings` (which
events and hooks a layer needs) and `resolveActions` (scene actions → runtime actions, curves
→ CSS easings). `DomTree` and `codegen/src/page.ts` both use them. After editing the runtime,
run `npm run sync:runtime`; a codegen test fails if the vendored copy is stale.

## Planned

- Pages entity (routes, SEO, semantic tags): milestone M4b in [PROGRESS.md](PROGRESS.md).
- Breakpoints: milestone M4c.
