/**
 * Export smoke test. Builds a document that exercises everything the exporter
 * handles (frames, type, groups, images, hover/press/appear/loop motion,
 * prototype links and every library component), exports it and writes the
 * project to a directory. The project must then build with no manual fixes:
 *
 *   npx tsx scripts/export-smoke.ts <out-dir>
 *   cd <out-dir> && npm install && npm run build
 */
import { exportProject } from '@codeframe/codegen'
import { COMPONENTS, DEFAULT_THEME, type MeasureText } from '@codeframe/library'
import {
  addAsset,
  appearPresetState,
  createNode,
  CURVE_PRESETS,
  DEFAULT_OVERLAY,
  groupNodes,
  putAnimation,
  SceneStore,
  type Action,
  type FrameLayout,
  type Interaction,
  type NodeId,
  type NodePatch,
  type NodeType,
  type ScreenTransition,
  type TriggerType,
} from '@codeframe/scene'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import * as prettier from 'prettier'

const outDir = resolve(process.argv[2] ?? 'export-smoke')
const store = new SceneStore()
const add = (type: NodeType, props: NodePatch, parentId: NodeId | null = null) => createNode(store, { type, parentId, props })

/** Rough metrics are fine here; the point is that the output compiles and runs. */
const measure: MeasureText = (text, style, maxWidth) => {
  const width = text.length * style.fontSize * 0.55
  const lines = maxWidth ? Math.max(1, Math.ceil(width / maxWidth)) : 1
  return { width: maxWidth ? Math.min(width, maxWidth) : width, height: lines * style.fontSize * style.lineHeight }
}

const onClick = (target: NodeId | 'back', transition: ScreenTransition): Interaction[] => [
  { id: 'click', trigger: { type: 'click', delay: 0, key: 'Enter' }, actions: [target === 'back' ? { type: 'back', transition } : { type: 'navigate', target, transition }] },
]

const home = add('frame', { name: 'Home', width: 1200, height: 1000, fill: '#FFFFFF' })
const about = add('frame', { name: 'About us', x: 1300, width: 800, height: 600, fill: '#FAFAF9', cornerRadius: 12 })

add(
  'text',
  {
    name: 'Title',
    x: 64,
    y: 64,
    width: 560,
    height: 124,
    text: 'Codeframe\nexport smoke',
    fontFamily: 'Fraunces',
    fontSize: 56,
    fontWeight: 600,
    lineHeight: 1.1,
    appear: { from: appearPresetState('slide-up'), trigger: 'load', once: true, amount: 0.3, timing: { duration: 600, delay: 0, curve: CURVE_PRESETS['ease-out'] } },
  },
  home,
)
add(
  'text',
  {
    name: 'Body',
    x: 64,
    y: 208,
    width: 520,
    height: 56,
    autoResize: 'height',
    text: 'Every library component, a link, an image & a group: "quoted" {braces} <angles>.',
    fontSize: 18,
    lineHeight: 1.5,
    italic: true,
  },
  home,
)

const chipA = add('rect', { name: 'Chip A', x: 760, y: 64, width: 80, height: 80, fill: '#D4441C', cornerRadius: 16, hover: { scale: 1.1, rotate: 8 } }, home)
const chipB = add('ellipse', { name: 'Chip B', x: 860, y: 64, width: 80, height: 80, fill: '#F2B64C', press: { scale: 0.9 }, loop: { preset: 'float', duration: 3000, curve: CURVE_PRESETS['ease-in-out'] } }, home)
groupNodes(store, [chipA, chipB])
add('rect', { name: 'Spinner', x: 980, y: 72, width: 48, height: 48, fill: '#1A1814', rotation: 15, loop: { preset: 'spin', duration: 1200, curve: CURVE_PRESETS.linear } }, home)

addAsset(store, {
  id: 'smokepixel0001',
  mime: 'image/png',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  width: 1,
  height: 1,
})
add('image', { name: 'Hero', x: 760, y: 168, width: 376, height: 120, assetId: 'smokepixel0001', fit: 'cover', cornerRadius: 12, shadow: { x: 0, y: 8, blur: 24, color: '#1A181433' } }, home)

COMPONENTS.forEach((spec, i) => {
  const size = spec.size(spec.defaults, DEFAULT_THEME, measure, 300)
  const interactions = spec.key === 'shadcn/button' ? onClick(about, { type: 'push', direction: 'left', timing: { duration: 450, delay: 0, curve: CURVE_PRESETS.gentle } }) : []
  add(
    'component',
    { name: spec.name, component: spec.key, props: { ...spec.defaults }, x: 64 + (i % 3) * 360, y: 320 + Math.floor(i / 3) * 160, ...size, interactions },
    home,
  )
})

add(
  'component',
  {
    name: 'Back',
    component: 'shadcn/button',
    props: { label: '← Back', variant: 'outline', size: 'sm' },
    x: 32,
    y: 32,
    width: 90,
    height: 32,
    interactions: onClick('back', { type: 'dissolve', direction: 'left', timing: { duration: 300, delay: 0, curve: CURVE_PRESETS['ease-out'] } }),
  },
  about,
)

// Motion v2: every trigger and action kind, Smart Animate, a timeline clip and scroll effects.
const on = (type: TriggerType, actions: Action[], extra: { delay?: number; key?: string } = {}): Interaction[] => [
  { id: type, trigger: { type, delay: extra.delay ?? 1000, key: extra.key ?? 'm' }, actions },
]
const eased = (duration: number) => ({ duration, delay: 0, curve: CURVE_PRESETS['ease-out'] })
const menu = add('frame', { name: 'Menu', x: 2200, width: 320, height: 240, fill: '#FFFFFF', cornerRadius: 12 })
add('text', { name: 'Close', x: 24, y: 24, width: 48, height: 20, text: 'Close', fontSize: 14, interactions: on('click', [{ type: 'close-overlay' }]) }, menu)
add('text', { name: 'Docs link', x: 24, y: 64, width: 120, height: 20, text: 'Open the docs', fontSize: 14, interactions: on('click', [{ type: 'open-url', url: 'https://example.com', newTab: true }]) }, menu)
const openMenu: Action = { type: 'overlay', target: menu, overlay: { ...DEFAULT_OVERLAY, position: 'top-right' }, transition: { type: 'move-in', direction: 'down', timing: { duration: 0, delay: 0, curve: CURVE_PRESETS.quick } } }
store.transact(() => {
  store.nodes.get(home)!.set('interactions', [
    ...on('key', [openMenu], { key: 'm' }),
    ...on('after-delay', [{ type: 'play-animation', animation: 'pulse', mode: 'restart' }], { delay: 1500 }),
  ])
})
const faq = add(
  'text',
  { name: 'FAQ', x: 64, y: 940, width: 200, height: 30, text: 'Questions', fontSize: 24, appear: { from: appearPresetState('slide-up'), trigger: 'in-view', once: false, amount: 0.5, timing: eased(500) } },
  home,
)
const cue = add(
  'rect',
  {
    name: 'Scroll cue',
    x: 1100,
    y: 900,
    width: 60,
    height: 60,
    fill: '#D4441C',
    cornerRadius: 30,
    scroll: { source: 'in-view', keyframes: [{ at: 0, state: { y: 40, opacity: 0 } }, { at: 0.5, state: { y: 0, opacity: 1 } }] },
    interactions: [
      ...on('click', [{ type: 'scroll-to', target: faq, offset: 32, animate: true, timing: eased(600) }]),
      ...on('while-hovering', [{ type: 'play-animation', animation: 'pulse', mode: 'play' }]),
      ...on('in-view', [{ type: 'play-animation', animation: 'pulse', mode: 'restart' }]),
    ],
  },
  home,
)
add('rect', { name: 'Backdrop', x: 900, y: 600, width: 260, height: 160, fill: '#EDE6D8', parallax: { speed: 0.6 } }, home)
putAnimation(store, {
  id: 'pulse',
  name: 'Pulse',
  frameId: home,
  duration: 1200,
  repeat: 'alternate',
  autoplay: false,
  tracks: [
    { nodeId: cue, property: 'scale', keyframes: [{ time: 0, value: 1, curve: CURVE_PRESETS.bouncy }, { time: 1200, value: 1.2, curve: CURVE_PRESETS.linear }] },
    { nodeId: cue, property: 'fill', keyframes: [{ time: 0, value: '#D4441C', curve: CURVE_PRESETS['ease-in-out'] }, { time: 1200, value: '#1A1814', curve: CURVE_PRESETS.linear }] },
  ],
})
for (const frame of [home, about]) {
  add(
    'rect',
    {
      name: 'Card',
      x: frame === home ? 760 : 400,
      y: frame === home ? 320 : 120,
      width: frame === home ? 200 : 360,
      height: frame === home ? 120 : 240,
      fill: '#F2B64C',
      cornerRadius: 16,
      interactions:
        frame === home
          ? on('click', [{ type: 'navigate', target: about, transition: { type: 'smart-animate', direction: 'left', timing: { duration: 0, delay: 0, curve: CURVE_PRESETS.gentle } } }])
          : on('mouse-down', [{ type: 'back', transition: { type: 'smart-animate', direction: 'right', timing: eased(400) } }]),
    },
    frame,
  )
}

// Auto layout: nested stacks with hug, fill, space-between, wrap, min/max and an absolute badge.
const none = { top: 0, right: 0, bottom: 0, left: 0 }
const stack = (patch: Partial<FrameLayout>): FrameLayout => ({
  direction: 'vertical',
  wrap: false,
  gap: 24,
  crossGap: 24,
  padding: { top: 48, right: 64, bottom: 48, left: 64 },
  justify: 'start',
  align: 'start',
  ...patch,
})
const pricing = add('frame', { name: 'Pricing', x: 2600, width: 1000, height: 800, fill: '#FFFFFF', sizeY: 'hug', layout: stack({ align: 'center' }) })
const header = add(
  'frame',
  { name: 'Header', width: 100, height: 40, fill: null, sizeX: 'fill', sizeY: 'hug', layout: stack({ direction: 'horizontal', justify: 'space-between', align: 'center', padding: none }) },
  pricing,
)
add('text', { name: 'Heading', width: 140, height: 40, text: 'Pricing', fontSize: 32, fontWeight: 600 }, header)
add('rect', { name: 'Mark', width: 32, height: 32, fill: '#1A1814', cornerRadius: 16 }, header)
const plans = add(
  'frame',
  { name: 'Plans', width: 100, height: 100, fill: null, sizeX: 'fill', sizeY: 'hug', layout: stack({ direction: 'horizontal', wrap: true, gap: 16, crossGap: 16, padding: none }) },
  pricing,
)
for (let i = 0; i < 4; i++) {
  const card = add(
    'frame',
    { name: `Plan ${i + 1}`, width: 260, height: 180, fill: '#FAFAF9', cornerRadius: 12, sizeY: 'hug', minWidth: 200, maxWidth: 320, layout: stack({ gap: 8, padding: { top: 16, right: 16, bottom: 16, left: 16 } }) },
    plans,
  )
  add('text', { name: 'Plan name', width: 120, height: 24, text: `Plan ${i + 1}`, fontSize: 18, fontWeight: 600 }, card)
  add('rect', { name: 'Divider', width: 10, height: 1, fill: '#E7E5E4', sizeX: 'fill' }, card)
}
add('rect', { name: 'Badge', x: 900, y: 16, width: 64, height: 24, fill: '#D4441C', cornerRadius: 12, absolute: true }, pricing)

const format = (source: string, parser: 'babel-ts' | 'css' | 'json') =>
  prettier.format(source, { parser, semi: false, singleQuote: true, printWidth: 100, trailingComma: 'all' })

const project = await exportProject({ snapshot: store.getSnapshot(), title: 'Export Smoke', theme: DEFAULT_THEME }, format)
await rm(outDir, { recursive: true, force: true })
for (const file of project.files) {
  const path = join(outDir, file.path)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, file.contents)
}
console.log(`wrote ${project.files.length} files (${project.pages.map((p) => p.path).join(', ')}) to ${outDir}`)
