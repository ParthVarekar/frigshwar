# Codeframe

A multiplayer design canvas whose frames export as clean, editable React + Tailwind.

**Status:** step 1 of 7 (the single-player canvas editor), plus motion and
prototyping. See [what's in the editor](#whats-in-the-editor) and
[the roadmap](#roadmap).

## Run it

```bash
npm install
npm run dev        # web editor on :5173 + sync server on :1234
npm test           # scene-graph test suite
```

`npm run dev:web` starts only the editor. The draft is saved to IndexedDB, so
clear site data to get the seed document back.

## What's in the editor

- **Drawing:** frames, rectangles, ellipses, text, images and groups, with
  fills, inside strokes, corner radius and drop shadows.
- **Layout help:** smart guides with snapping while moving, resizing and
  drawing (hold Ctrl/Cmd to move freely), align and distribute, and Alt+drag
  to duplicate.
- **Motion** (Animate tab): hover and press states with a transition, appear
  animations (fade, slide, scale, blur) and loops (pulse, spin, bounce, float,
  wiggle).
- **Prototyping:** on click, go to a frame or back, with dissolve, slide or
  push transitions. With the Animate tab open, drag the ⊕ handle beside the
  selected layer onto another frame to connect them.
- **Component library** (Library tab): shadcn/ui components (button, badge,
  input, textarea, checkbox, switch, label, avatar, card, alert, progress,
  separator), drawn live on the canvas. Click a tile to place one or drag it
  onto a frame; edit its variant, size and text in the Design tab. Theme
  primary color, radius and font apply to every instance.
- **Export code** (`Ctrl+Shift+E`): the whole site as a Vite + React + Tailwind
  project, one page per top-level frame, with a hash router for prototype
  links, the vendored shadcn/ui components it uses, and fonts and images.
  Browse files in the dialog, copy one, or download a zip, then
  `npm install && npm run dev`.
- **Preview** (`Ctrl+Alt+Enter`): runs the prototype as real HTML/CSS produced by
  the same scene→CSS mapping the code exporter uses
  ([packages/scene/src/css.ts](packages/scene/src/css.ts)).
- **Everyday:** layers tree with drag to reorder, right-click menu, copy, cut
  and paste (`Ctrl+C` / `Ctrl+X` / `Ctrl+V`; repeated pastes step down-right,
  and copies paste between tabs), undo/redo, PNG export at 2x, and local autosave.

## Docs

- [docs/PROGRESS.md](docs/PROGRESS.md): progress log and handoff (start here when resuming work)
- [docs/feature-parity.md](docs/feature-parity.md): every Figma/Framer feature vs Codeframe, with priorities
- [docs/motion.md](docs/motion.md): interaction and animation spec
- [docs/architecture.md](docs/architecture.md): packages, data model, editor, export pipeline
- [docs/design-language.md](docs/design-language.md): the "Broadsheet" visual identity

## Layout

```
apps/web          Vite + React + TS + Tailwind v4 editor (Konva canvas)
apps/server       Hocuspocus (Yjs over WebSocket), document state in SQLite
packages/scene    The scene graph: types, Yjs schema, geometry, operations, tests
packages/library  shadcn/ui component specs: canvas drawing, props, theme, JSX
packages/codegen  Scene → Vite + React + Tailwind project (golden tests)
scripts/          sync-shadcn.mjs (re-vendor shadcn sources), export-smoke.ts
docs/             Design language ("Broadsheet") and its Figma/Framer overlap check
```

## Decisions so far

- **Konva, not tldraw.** tldraw's SDK needs a license key for production use,
  it renders through the DOM/SVG rather than WebGL, and its shape model would
  sit between us and the compiler. The scene graph is the product, so we own it
  and use Konva (MIT) purely as the renderer.
- **The Yjs document is the editor state, even single-player.** `SceneStore`
  turns Yjs events into immutable snapshots for React. Undo is `Y.UndoManager`
  (it only tracks this client's edits), persistence is `y-indexeddb`, and
  multiplayer (step 3) means adding a provider, not rewriting state.
- **The scene graph mirrors the DOM box model.** Every node has a box relative
  to its parent, so each maps to one element in generated code. Children are
  ordered by fractional index (no CRDT array moves). Groups are *transparent*:
  they have no geometry, so they never need conflict-prone normalization writes.
- **Deterministic repair of merged states.** Concurrent edits can produce
  orphans or parent cycles. Every client lifts them to the canvas using rules
  that depend only on the merged document, so all clients render the same tree.
- **Screen-space overlay.** Selection marks render unscaled on their own layer.
  Konva's Transformer drives invisible proxy rects, and each transform frame is
  mapped back to document patches computed from the gesture's starting snapshot,
  so no rounding error accumulates.
- **shadcn/ui for the library.** It's copy-in source, not a dependency, so the
  exported project owns editable component files. The editor draws each
  component from a spec measured against the shadcn sources, and the exporter
  vendors the real source verbatim (`scripts/sync-shadcn.mjs` refreshes it).
  One set of theme tokens drives both.

## Roadmap

1. ✅ Single-user canvas editor (Konva): shapes, text, frames, layers
2. Auto-layout node + ✅ React/Tailwind compiler, ✅ golden-file tests
3. Yjs sync + awareness (cursors, presence)
4. Multi-client convergence suite with offline/partition simulation
5. ✅ Project export (zip); GitHub push and a live read-only code panel still to come
6. Auth, dashboard, sharing
7. Design-language pass across the whole UI
