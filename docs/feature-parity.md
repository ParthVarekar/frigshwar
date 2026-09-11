# Feature parity: Figma & Framer vs Codeframe

The functional analysis and the backlog. Every feature Figma (Design, Sites, Motion, Dev Mode)
or Framer offers is listed here, so nothing gets missed. Update the **Codeframe** column as work
lands, and link the milestone in [PROGRESS.md](PROGRESS.md).

Researched 2026-09-11, against Figma after Config 2026 (Figma Motion, Code Layers, shaders) and
Framer 3.0 plus its September 2026 updates.

**Legend.** Figma / Framer: ✓ has it, ~ limited or partial, — doesn't.
Codeframe: ✅ done, 🟡 partial, ❌ missing, ⛔ deliberately out of scope for now.
**Pri:** P0 is the current effort (M1–M4), P1 next, P2 later, P3 nice to have.

Codeframe's position: a design canvas whose output is **real, editable React code**. Where Figma
and Framer publish a hosted artifact, we export a project. Features that only exist to serve
hosting (analytics, custom domains) are ⛔ unless they affect exported code.

---

## 1. Canvas & navigation

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Infinite canvas, pan, zoom (wheel, pinch, keys) | ✓ | ✓ | ✅ | | |
| Zoom to fit / to selection / 100% | ✓ | ✓ | ✅ | | Shift+1 / Shift+2 / Shift+0 |
| Multiple pages in a file | ✓ | ✓ | ❌ | P0 | M4. Design pages vs site pages |
| Sections (canvas grouping with titles) | ✓ | — | ❌ | P2 | |
| Rulers and draggable ruler guides | ✓ | ~ | ❌ | P1 | |
| Layout grids (columns, rows, grid) on frames | ✓ | ~ | ❌ | P1 | |
| Pixel grid and snap to pixel | ✓ | ✓ | ❌ | P2 | |
| Smart guides and snapping | ✓ | ✓ | ✅ | | Moving, resizing, drawing |
| Measure distances (Alt+hover) | ✓ | ✓ | ❌ | P1 | |
| Outline/wireframe view | ✓ | — | ❌ | P3 | |
| Canvas background color | ✓ | ✓ | ❌ | P3 | |
| Minimap / page overview | — | ~ | ❌ | P3 | |
| Device preview frames (phone bezels) | ✓ | ~ | ❌ | P3 | |

## 2. Selection, layers & arrangement

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Layers tree: rename, reorder by drag, collapse | ✓ | ✓ | ✅ | | |
| Hide / lock | ✓ | ✓ | ✅ | | |
| Group / ungroup, frame selection, unwrap | ✓ | ✓ | ✅ | | |
| Deep select (Ctrl+click), select parent / children | ✓ | ✓ | 🟡 | P1 | Enter / Shift+Enter exist; Ctrl+click deep select missing |
| Select all matching layers / same properties | ✓ | — | ❌ | P2 | |
| Layer search / filter | ✓ | ✓ | ❌ | P2 | |
| Align, distribute, tidy up | ✓ | ✓ | 🟡 | P1 | Tidy up missing |
| Bring forward / to front / backward / to back | ✓ | ✓ | ✅ | | |
| Duplicate, Alt+drag duplicate, repeat last duplicate offset | ✓ | ✓ | 🟡 | P2 | Smart repeat offset missing |
| Copy / cut / paste, paste here, paste in place, paste to replace | ✓ | ✓ | 🟡 | P1 | Paste to replace missing |
| Copy/paste properties (styles) | ✓ | ~ | ❌ | P2 | |
| Copy as PNG / SVG / CSS / code | ✓ | ✓ | ❌ | P2 | |
| Nudge (1px / 10px), rotate, flip horizontal/vertical | ✓ | ✓ | 🟡 | P1 | Flip missing |
| Masks (use as mask) | ✓ | ~ | ❌ | P2 | |
| Undo/redo, per-user | ✓ | ✓ | ✅ | | Y.UndoManager |

## 3. Shapes & vectors

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Rectangle, ellipse | ✓ | ✓ | ✅ | | |
| Line, arrow, polygon, star | ✓ | ~ | ❌ | P1 | Export as SVG elements |
| Pen tool, vector networks, path editing | ✓ | ✓ | ❌ | P1 | Vector node → inline `<svg>` |
| Pencil / brushes / variable-width strokes (Figma Draw) | ✓ | — | ❌ | P3 | |
| Boolean operations (union, subtract, intersect, exclude), flatten | ✓ | ✓ | ❌ | P2 | |
| Outline stroke | ✓ | — | ❌ | P3 | |
| Per-corner radius | ✓ | ✓ | ❌ | P1 | |
| Corner smoothing (squircle) | ✓ | — | ❌ | P3 | |
| Arc / ratio on ellipses | ✓ | — | ❌ | P3 | |
| SVG import (paste/drop) as editable vectors | ✓ | ✓ | ❌ | P1 | |
| Icon sets (insert icons) | ~ | ✓ | ❌ | P1 | lucide-react, already a shadcn dependency |

## 4. Fills, strokes & effects

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Solid fill | ✓ | ✓ | ✅ | | Single fill only |
| Multiple fills per layer | ✓ | ~ | ❌ | P2 | |
| Linear / radial / angular / diamond gradients | ✓ | ✓ | ❌ | P1 | CSS gradients; angular → conic |
| Image fill (fill / fit / crop / tile) | ✓ | ✓ | 🟡 | P1 | Image node with cover / contain / fill. No crop or tile |
| Video fill / video layer | ✓ | ✓ | ❌ | P2 | |
| Layer and fill blend modes | ✓ | ✓ | ❌ | P2 | `mix-blend-mode` |
| Strokes: inside / center / outside | ✓ | ✓ | 🟡 | P1 | Inside only |
| Per-side stroke widths, dashes, caps, joins | ✓ | ~ | ❌ | P2 | |
| Drop shadow: multiple, spread | ✓ | ✓ | 🟡 | P1 | One shadow, no spread |
| Inner shadow | ✓ | ✓ | ❌ | P1 | |
| Layer blur, background blur (glass) | ✓ | ✓ | ❌ | P1 | `filter` / `backdrop-filter` |
| Noise, texture, glass effects | ✓ | ~ | ❌ | P3 | |
| Shaders (custom fills/effects) | ✓ | ✓ | ⛔ | P3 | |
| Opacity | ✓ | ✓ | ✅ | | |
| Color picker with eyedropper, hex/RGB/HSL, recent colors | ✓ | ✓ | 🟡 | P2 | Hex field + native picker |
| Image adjustments (exposure, contrast, saturation…) | ✓ | ~ | ❌ | P3 | |
| Overflow: clip content | ✓ | ✓ | ✅ | | Frames |

## 5. Text

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Font family, size, weight, italic | ✓ | ✓ | ✅ | | Curated Google fonts |
| Line height, letter spacing | ✓ | ✓ | ✅ | | |
| Horizontal align | ✓ | ✓ | ✅ | | |
| Vertical align (top / middle / bottom) | ✓ | ~ | ❌ | P1 | |
| Auto width / auto height / fixed | ✓ | ✓ | ✅ | | |
| Truncation, max lines | ✓ | ✓ | ❌ | P2 | `line-clamp` |
| Paragraph spacing, indent | ✓ | ~ | ❌ | P2 | |
| Underline, strikethrough, case transforms | ✓ | ✓ | ❌ | P1 | |
| Bulleted / numbered lists | ✓ | ✓ | ❌ | P2 | |
| Mixed styles within one text layer (ranges) | ✓ | ✓ | ❌ | P1 | Needs a rich text model (Y.Text with formats) |
| Links inside text | ✓ | ✓ | ❌ | P1 | |
| Text styles (typography tokens) | ✓ | ✓ | ❌ | P1 | See §7 |
| Any Google font, custom font upload | ✓ | ✓ | 🟡 | P2 | Curated list |
| Variable font axes, OpenType features | ✓ | ~ | ❌ | P3 | |
| Semantic tag (h1–h6, p, span, label) | — | ✓ | 🟡 | P0 | Inferred from size today; M4 makes it explicit |
| Text effects (typewriter, scramble, per-letter/word reveal) | ✓ | ✓ | ❌ | P2 | Sites / Framer |

## 6. Layout & responsiveness

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Constraints (left, right, left+right, center, scale) | ✓ | ✓ | ❌ | P1 | Framer pins |
| **Auto layout / stacks**: direction, gap, padding, alignment | ✓ | ✓ | ✅ | **P0** | M4a. Shift+A infers from positions; exports as flex |
| Wrap, space-between (auto gap) | ✓ | ✓ | ✅ | P0 | M4a. Row gap when wrapping |
| Sizing: hug / fill / fixed, min / max width & height | ✓ | ✓ | ✅ | P0 | M4a. Hand resizing pins to fixed. Fill-width text doesn't re-measure height on canvas |
| Absolute position inside auto layout | ✓ | ✓ | ✅ | P0 | M4a. "Ignore auto layout" |
| Drag to reorder in a stack, arrow keys reorder | ✓ | ✓ | ✅ | P0 | M4a. Live reorder, pop out when dragged away |
| Auto layout on groups, baseline alignment, reversed z-order | ✓ | ~ | ❌ | P2 | Groups keep their own geometry in a stack |
| Grid layout (rows / columns, spans) | ✓ | ✓ | ❌ | P1 | CSS grid |
| Relative units (%, fr, vw) | ~ | ✓ | ❌ | P1 | |
| **Breakpoints** (desktop / tablet / phone variants per page) | ✓ | ✓ | ❌ | P0 | M4. Sites / Framer. Media queries |
| Position sticky / fixed | ✓ | ✓ | ❌ | P0 | M4 (scroll behavior) |
| Overflow scrolling (horizontal / vertical / both) | ✓ | ✓ | ❌ | P0 | M4 |
| Semantic HTML tags per layer (section, header, nav, footer, a…) | — | ✓ | 🟡 | P0 | M4 |
| Z-index / stacking in auto layout | ✓ | ✓ | ❌ | P1 | |
| Aspect ratio lock | ✓ | ✓ | ❌ | P1 | |

## 7. Components, styles & variables

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Own main components and instances | ✓ | ✓ | ❌ | P1 | Export as React components with props |
| Instance overrides, reset overrides, detach | ✓ | ✓ | ❌ | P1 | |
| Variants (variant sets) | ✓ | ✓ | ❌ | P1 | Also drives "change to" interactions |
| Component properties (text, boolean, instance swap, variant) | ✓ | ✓ | 🟡 | P1 | Library components have props; own components don't |
| Interactive components (variant-to-variant interactions) | ✓ | ✓ | ❌ | P1 | |
| Premade component library | ~ | ✓ | ✅ | | shadcn/ui ×12, exported as real source |
| More library components (dialog, tabs, select, accordion, nav menu…) | — | ✓ | ❌ | P1 | Extend the shadcn sync |
| Color / text / effect / grid styles | ✓ | ✓ | ❌ | P1 | |
| Variables: color / number / string / boolean, collections, modes | ✓ | ~ | ❌ | P1 | Export as CSS custom properties; modes → `[data-theme]` |
| Theme tokens for the library | — | ✓ | 🟡 | | Primary, radius, font; the full token set is stored |
| Team libraries (publish / subscribe / update) | ✓ | ✓ | ❌ | P2 | Needs accounts (step 6) |
| Code components / code overrides | ~ | ✓ | ❌ | P2 | Figma Code Layers (beta) / Framer code components |

## 8. Prototyping, interactions & motion (spec: [motion.md](motion.md))

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Click → navigate / back | ✓ | ✓ | ✅ | | v1 link, one per layer |
| Drag a noodle to connect | ✓ | — | ✅ | | ⊕ handle |
| Multiple interactions per layer | ✓ | ✓ | ✅ | | Interaction list in the Animate tab (M3a) |
| Triggers: while hovering / pressing, mouse enter / leave / down / up | ✓ | ✓ | ✅ | | |
| Trigger: after delay | ✓ | ~ | ✅ | | |
| Trigger: key / gamepad | ✓ | — | 🟡 | P2 | Keyboard with a key-capture field; gamepad missing |
| Trigger: in view / page load / other layer in view | ✓ | ✓ | 🟡 | P0 | In-view trigger and in-view appear (M2). "Other layer in view" missing |
| Trigger: on drag (swipe) | ✓ | ✓ | ❌ | P1 | |
| Trigger: video ends / hits time | ✓ | — | ❌ | P3 | Needs video |
| Multiple actions per trigger | ✓ | ~ | ✅ | | |
| Action: open / swap / close overlay (position, click outside, dim) | ✓ | ✓ | ✅ | | 7 positions plus manual, click outside, dim color, enter/exit animation |
| Action: scroll to (with offset, animated) | ✓ | ✓ | ✅ | | Any easing, springs included |
| Action: open URL (new tab) | ✓ | ✓ | ✅ | | Sanitized URLs |
| Action: change to variant | ✓ | ✓ | ❌ | P1 | Needs variants (§7) |
| Action: set variable, conditional (if / else) | ✓ | ~ | ❌ | P2 | Needs variables |
| Action: play / pause video | ✓ | — | ❌ | P3 | |
| Transitions: instant, dissolve | ✓ | ✓ | ✅ | | |
| Transitions: move in / out, push, slide in / out ×4 directions | ✓ | ✓ | 🟡 | P0 | All types × 4 directions in the model and Preview (M1); export router is approximate until M2 |
| **Smart Animate** (match layers by name) / Magic Motion | ✓ | ✓ | 🟡 | P0 | View Transitions with `data-cf-match` name paths, in Preview and export (M2). Needs a visible-browser visual check |
| Easing presets incl. back curves, custom bezier | ✓ | ✓ | ✅ | | 8 bézier presets plus a draggable bézier editor |
| Physics springs (stiffness / damping / mass), presets | ✓ | ✓ | ✅ | | 4 presets plus a custom spring editor with response graph, as CSS `linear()` |
| Hover / press effects | ✓ | ✓ | ✅ | | Scale, opacity, move, rotate, fill, lift shadow |
| Appear / reveal (load, in view, once / replay, amount) | ✓ | ✓ | ✅ | | From-state model, load or in view, replay, amount (M1–M2). Custom from-state editor is M3 |
| Loop effects | ✓ | ✓ | ✅ | | Pulse, spin, bounce, float, wiggle |
| Scroll transform (keyframes on scroll progress) | ✓ | ✓ | ✅ | | Layer in view or page scroll, keyframe list (M3a) |
| Scroll parallax / scroll speed | ✓ | ✓ | ✅ | | Speed % (M3a) |
| Mouse parallax | ✓ | ~ | ❌ | P2 | |
| Custom cursor | ✓ | ✓ | ❌ | P2 | |
| Marquee / ticker | ✓ | ✓ | ❌ | P1 | |
| Draggable layers (constraints, momentum) | ✓ | ✓ | ❌ | P2 | |
| Lightbox | ✓ | ~ | ❌ | P2 | Overlay preset |
| **Keyframe timeline** (tracks, keyframes, playhead, auto-key) | ✓ | — | ✅ | | Timeline panel, keyframe diamonds, scrub, Record (auto-key), per-key easing; plays in Preview and export (M1–M3b). Limits: scale and blur don't draw on the canvas; canvas drags don't record |
| Animation presets on the timeline | ✓ | — | ❌ | P1 | |
| Timing / easing variables, animated components | ✓ | ✓ | ❌ | P2 | |
| 3D transforms (rotate XYZ, perspective, backface) | — | ✓ | ❌ | P2 | |
| Flows / starting points, prototype settings | ✓ | — | ❌ | P1 | Moved to the backlog; Preview's "Start at" picks any frame |
| Preview / present mode | ✓ | ✓ | ✅ | | DOM preview matching the export |
| Reset scroll position / preserve state on navigate | ✓ | ~ | ❌ | P1 | |
| Export animation as MP4 / GIF / WEBM / Lottie | ✓ | — | ❌ | P3 | |
| Animation code export (CSS / React) | ✓ | — | ✅ | | CSS effects plus the vendored React motion runtime; the exported smoke project builds (M2) |

## 9. Pages, site & publishing

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Site pages with paths / slugs | ✓ | ✓ | 🟡 | P0 | Top-level frame = page, slug from name. M4 makes pages explicit |
| Home page, 404 page | ✓ | ✓ | 🟡 | P0 | First frame is `/` |
| Nested routes / folders | ~ | ✓ | ❌ | P1 | |
| Shared layout (header / footer across pages) | ✓ | ✓ | ❌ | P1 | Needs own components |
| SEO: title, description, OG image, favicon, noindex | ✓ | ✓ | ❌ | P0 | M4. Per-page meta in export |
| Sitemap, robots.txt | ✓ | ✓ | ❌ | P2 | |
| Page transitions per link | ✓ | ✓ | ✅ | | |
| Custom code (head / body) | ✓ | ✓ | ❌ | P2 | |
| CMS collections, fields, lists, detail pages | ~ | ✓ | ❌ | P2 | Could export as JSON + typed loaders |
| Forms (fields, submit, validation) | ~ | ✓ | 🟡 | P2 | shadcn inputs exist; no submit handling |
| Localization (locales, translated content) | — | ✓ | ❌ | P3 | |
| Site search | — | ✓ | ❌ | P3 | |
| Publish to hosting, custom domains, staging | ✓ | ✓ | ⛔ | | We export code. GitHub push is P1 |
| Branching of the live site | — | ✓ | ❌ | P3 | Framer 3.0 |
| Analytics, A/B testing | ~ | ✓ | ⛔ | | |
| Password protection, cookie banner | ~ | ✓ | ⛔ | | |

## 10. Collaboration & files

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Real-time multiplayer editing | ✓ | ✓ | 🟡 | P1 | Hocuspocus server exists; client provider not wired (roadmap step 3) |
| Live cursors, presence avatars, follow / spotlight | ✓ | ✓ | ❌ | P1 | Awareness |
| Multi-client convergence test suite | — | — | ❌ | P1 | Roadmap step 4 |
| Comments: pins, threads, mentions, resolve | ✓ | ✓ | ❌ | P1 | |
| Cursor chat, audio | ✓ | — | ❌ | P3 | |
| Version history: named versions, restore | ✓ | ✓ | ❌ | P1 | Yjs snapshots |
| Branching and merging | ✓ | ✓ | ❌ | P3 | |
| Auth, teams, projects, file browser / dashboard | ✓ | ✓ | ❌ | P1 | Roadmap step 6 |
| Share links with view / edit permissions | ✓ | ✓ | ❌ | P1 | |
| Offline editing, local autosave | ~ | — | ✅ | | y-indexeddb |

## 11. Handoff, code & export

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Whole-site React + Tailwind project export | — | — | ✅ | | Our core. Zip with file browser |
| Live read-only code panel for the selection | ✓ | ~ | ❌ | P1 | Dev Mode-like |
| Inspect: CSS for a layer, redlines, spacing | ✓ | ~ | ❌ | P1 | |
| Export assets PNG / JPG / SVG / PDF at scales, export presets | ✓ | ~ | 🟡 | P1 | PNG 2x of selection only |
| Push to GitHub | — | — | ❌ | P1 | Roadmap |
| MCP server / agent access to the file | ✓ | ✓ | ❌ | P2 | |
| Import Figma files / paste from Figma | — | ✓ | ❌ | P2 | Framer's "copy from Figma" |
| Golden-file codegen tests | — | — | ✅ | | |

## 12. Editor UX & extensibility

| Feature | Figma | Framer | Codeframe | Pri | Notes |
|---|---|---|---|---|---|
| Right-click context menu | ✓ | ✓ | ✅ | | |
| Keyboard shortcuts | ✓ | ✓ | ✅ | | |
| Shortcut reference panel | ✓ | ✓ | ❌ | P2 | |
| Command palette / quick actions | ✓ | ✓ | ❌ | P1 | |
| Preferences (nudge amount, snapping toggles, units) | ✓ | ✓ | ❌ | P2 | |
| Insert panel (shapes, components, sections, templates) | ✓ | ✓ | 🟡 | P1 | Library tab |
| Section / page templates (hero, pricing, footer…) | ~ | ✓ | ❌ | P1 | |
| Plugins / widgets API | ✓ | ✓ | ❌ | P3 | |
| AI: generate designs, rename layers, images, agents | ✓ | ✓ | ⛔ | P3 | Out of scope until the core is complete |
| Touch / tablet support | ~ | ~ | ❌ | P3 | |

---

## Summary of gaps by priority

- **P0 (current effort):** interactions v2 (triggers, actions, overlays, scroll-to, URL), Smart
  Animate, springs and curves, in-view / scroll transform / parallax effects, keyframe timeline,
  explicit pages with SEO, auto layout, sizing, sticky / fixed / overflow scroll, semantic tags,
  breakpoints.
- **P1:** vectors and pen, lines / arrows / polygons, SVG import, gradients, blurs, inner and
  multiple shadows, strokes, per-corner radius, text ranges, decorations, vertical align, links,
  constraints, grid layout, own components with variants and props, styles and variables, more
  shadcn components, rulers and guides, layout grids, measure, flows, multiplayer and presence,
  comments, version history, auth, sharing, code panel, inspect, SVG / PDF export, GitHub push,
  command palette, templates.
- **P2 / P3:** everything else in the tables.
