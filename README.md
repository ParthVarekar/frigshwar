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
  push transitions. Connectors appear on the canvas while the Animate tab is open.
- **Preview** (`Ctrl+Alt+Enter`): runs the prototype as real HTML/CSS produced by
  the same scene→CSS mapping the code exporter will use
  ([packages/scene/src/css.ts](packages/scene/src/css.ts)).
- **Everyday:** layers tree with drag to reorder, right-click menu, copy/paste,
  undo/redo, PNG export at 2x, and local autosave.

## Layout

```
apps/web          Vite + React + TS + Tailwind v4 editor (Konva canvas)
apps/server       Hocuspocus (Yjs over WebSocket), document state in SQLite
packages/scene    The scene graph: types, Yjs schema, geometry, operations, tests
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

## Roadmap

1. ✅ Single-user canvas editor (Konva): shapes, text, frames, layers
2. Auto-layout node + React/Tailwind compiler, golden-file tests
3. Yjs sync + awareness (cursors, presence)
4. Multi-client convergence suite with offline/partition simulation
5. Project export (zip / GitHub push) and a live read-only code panel
6. Auth, dashboard, sharing
7. Design-language pass across the whole UI
