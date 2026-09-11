# Codeframe design language — "Broadsheet"

**Direction: warm paper / editorial.** Committed; not blended with the other two.

Why this one: the terminal direction drifts straight back into dark chrome
(i.e. Framer), and the product already *outputs* code, so the chrome doesn't
need to cosplay an IDE. Broadsheet treats the canvas as a page where layouts are
*set*, like type. Monospace shows up only where the content is literally
machine-readable: numbers, hex values, class names, generated source.

---

## 1. Color

Two families with strict jobs. **Ink = committed state. Pencil = transient state.**
An element never shows both at once. **Blue is banned from the chrome.**

| Token            | Hex         | Use |
|------------------|-------------|-----|
| `paper`          | `#F6F1E7`   | Panels, masthead |
| `paper-raised`   | `#FCFAF5`   | Inputs on hover, menus, popovers |
| `paper-sunk`     | `#EDE6D8`   | Hover on rows and buttons |
| `desk`           | `#E7E0D0`   | Canvas background (the table the pages sit on) |
| `desk-dot`       | `#CFC5AF`   | Canvas dot grid |
| `ink`            | `#1A1814`   | Text, rules, selection, primary buttons, active tool |
| `ink-2`          | `#4A453C`   | Secondary text |
| `ink-3`          | `#8A8274`   | Placeholder, disabled (never essential text) |
| `rule`           | `ink @ 14%` | Hairline separators inside panels |
| `pencil`         | `#D4441C`   | Vermilion: canvas hover outline, drop targets, insertion lines, focus underline, guides |
| `pencil-wash`    | `#F4D8CB`   | Pencil at low intensity (drop-target fill) |
| `moss`           | `#3F6B3A`   | Online / success |
| `ochre`          | `#B7861F`   | Offline, pending sync |

Presence palette (multiplayer cursors, step 3). Earthy, all distinguishable on
`desk`, none of them blue: vermilion `#D4441C`, moss `#3F6B3A`, plum `#7A3B69`,
teal `#1F6F6B`, ochre `#B7861F`, umber `#7B4A2A`.

Contrast: ink on paper ≈ 16:1 and ink-2 on paper ≈ 9:1. Pencil on paper is
≈ 4:1, so it's for **lines and marks only, never body text**.

## 2. Type

| Role | Face | Where |
|------|------|-------|
| Display | **Fraunces** (variable, `opsz` tuned, SOFT 0) | Wordmark, document title, panel section heads (italic), dialog titles, empty states, frame captions on canvas |
| UI | **IBM Plex Sans** | Labels, menus, layer names, buttons, tool names |
| Data | **IBM Plex Mono** | Every numeric field (X/Y/W/H/°), hex colors, zoom %, dimension tag, shortcut keys, code panel |

Scale (px): 11 caption/shortcut · 12 mono data · 13 UI body · 14 section head
(Fraunces italic) · 18 document title · 22 wordmark. Small-caps labels are
tracked +0.06em.

## 3. Shape, space, structure

- **Radius:** `0` for panels, inputs, buttons, layer rows, selection.
  `2px` for tags, tooltips and menus. `full` only for avatars and the rotate handle.
- **Rules instead of shadows.** Structure comes from 1px ink rules. The masthead
  sits on a **double rule** (1px, 2px gap, 1px), like a newspaper masthead.
  Things that genuinely float (menus, popovers) get a hard offset shadow
  `2px 2px 0 ink` (letterpress), never a blurred elevation.
- **Spacing:** 4px base. Scale 2 · 4 · 8 · 12 · 16 · 24 · 32. Panel gutter 12,
  layer row 28, property row 32, masthead 52. Columns: layers 248, properties 272.
- **Layout:** masthead across the top; docked columns separated by ink rules;
  full-bleed canvas between them. Only canvas-native marks sit on top of the
  canvas (captions, tags, cursors). No floating toolbars.

## 4. Iconography

- **Words first.** Tools are labeled with words plus a mono shortcut key
  (`Frame F`, `Text T`). Icons appear only where space is tight (layer rows,
  toggles).
- **Drafted glyphs.** Lucide outlines overridden to a 1.5px stroke with
  **square caps and miter joins** at 14px. They read as drafted, not
  rounded-friendly.

## 5. Canvas marks

| Mark | Treatment |
|------|-----------|
| Canvas | `desk` with a 1px `desk-dot` grid every 24 world px (fades out below 40% zoom) |
| Frame caption | Fraunces italic 12px, `ink-2`, turns `ink` when selected |
| Hover | 1px `pencil` outline |
| Selection | 1px `ink` outline. Handles are 7px **solid ink squares** with a 1px paper keyline. The rotate handle is an ink dot |
| Dimension tag | Ink block, paper-colored Plex Mono 11px, 2px radius, centered under the selection: `320 × 200` |
| Marquee | 1px dashed ink (4/3), ink at 4% fill |
| Cursors (step 3) | Nib-shaped pointer filled with the presence color, ink keyline. Name tag in Fraunces italic on a square presence-colored slip |

## 6. Motion: "quiet print"

- 140ms, `cubic-bezier(0.2, 0, 0, 1)`. Opacity plus at most 4px of translate.
  No springs, overshoot, scale bounce, or blur.
- **Canvas marks never animate.** Selection, hover and guides appear
  instantly, the way ink lands on paper.
- `prefers-reduced-motion` sets every duration to 0.

### Content motion is not chrome motion

The rules above govern the *editor*. Animations a designer authors (hover and
press states, appear and loop effects, prototype transitions) are content.
They can be as springy as the design wants, and they only play where content
plays: in Preview, or on demand with "Play on canvas". Tooling around motion
stays in the Broadsheet voice:

- **Preview** is set on the desk with its own masthead (Fraunces italic
  "Preview", double rule). Close is the ink primary button.
- **Prototype connectors** (Animate tab) are pencil curves with a dot at the
  source and a filled arrowhead at the target frame. They're drawn at 55%
  unless their layer is selected.
- **Smart guides** are 1px pencil lines, shown only while snapping.
- The **Design / Animate tabs** are Fraunces italic words over a 2px ink
  underline, like section heads. No pills.

## 7. Voice (applies to exported code too)

- UI copy is plain and editorial: "Untitled page", "Nothing selected".
- Generated files open with a colophon comment:
  `/* Set in Codeframe · frame "Hero" · 1440×900 */`
- Component names come from layer names (PascalCase). Only Tailwind utilities
  are used, never hashed class names. Arbitrary values (`w-[313px]`) appear only
  when a value is off the scale.

---

## Overlap check against Figma and Framer

| Trait | Figma (UI3) | Framer | Codeframe |
|-------|-------------|--------|-----------|
| Chrome tone | Cool white/gray, or `#2C2C2C` dark | Cool near-black | Warm newsprint + warm ink |
| Accent | Blue `#0D99FF` (purple for components) | Blue `#0099FF` | Ink for selection, vermilion pencil for transient states. No blue |
| UI type | Inter | Inter | Fraunces / IBM Plex Sans / IBM Plex Mono |
| Toolbar | Floating icon pill, bottom center | Icon bar, top | Masthead with **word-labeled** tools + mono shortcut keys |
| Panels | Floating, ~13px radius, soft shadow | Docked, dark, rounded controls | Docked columns divided by ink rules, square corners, no blur shadows |
| Selection | Blue outline, white handles with blue stroke | Blue outline, white handles | Ink hairline, solid ink handles, ink dimension tag |
| Hover | Blue outline | Blue outline | Vermilion outline |
| Motion | Instant/snappy | Springy | Quiet 140ms ease-out; canvas marks never animate |
| Layer selection | Light blue row tint | Blue row tint | **Inverted row**: ink fill, paper text |

**Deliberate, acknowledged overlaps** (genre conventions, kept for usability):

1. Layers on the left, properties on the right, canvas in the middle. Sketch,
   Penpot and XD share this, and moving it costs muscle memory for no gain.
   Everything about how it's expressed differs.
2. Square corner/edge handles on the selection box. It's the universally
   understood resize affordance; it's differentiated by fill, color and keyline.
3. A dimension tag under the selection. Useful, so it's kept, restyled as an
   ink slip in mono.
