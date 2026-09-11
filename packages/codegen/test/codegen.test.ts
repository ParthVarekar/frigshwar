import { DEFAULT_THEME } from '@codeframe/library'
import {
  createNode,
  CURVE_PRESETS,
  DEFAULT_OVERLAY,
  putAnimation,
  SceneStore,
  type Action,
  type Direction,
  type Interaction,
  type NodeId,
  type NodePatch,
  type NodeType,
  type TransitionType,
  type TriggerType,
} from '@codeframe/scene'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { declarationsToClasses, exportProject, jsxText, spacing } from '../src'
import { jsLiteral } from '../src/literal'
import { MOTION_RUNTIME } from '../src/runtime.generated'

function add(store: SceneStore, type: NodeType, props: NodePatch, parentId: NodeId | null = null) {
  return createNode(store, { type, parentId, props })
}

function onClick(target: NodeId | 'back', type: TransitionType, direction: Direction, duration: number, curve: keyof typeof CURVE_PRESETS): Interaction[] {
  const transition = { type, direction, timing: { duration, delay: 0, curve: CURVE_PRESETS[curve] } }
  return [{ id: 'go', trigger: { type: 'click', delay: 0, key: 'Enter' }, actions: [target === 'back' ? { type: 'back', transition } : { type: 'navigate', target, transition }] }]
}

function text(files: { path: string; contents: string | Uint8Array }[], path: string): string {
  const file = files.find((f) => f.path === path)
  if (!file) throw new Error(`missing ${path}`)
  return typeof file.contents === 'string' ? file.contents : new TextDecoder().decode(file.contents)
}

describe('tailwind mapping', () => {
  it('uses the spacing scale for 2px steps and brackets everything else', () => {
    expect(spacing('left', 48)).toBe('left-12')
    expect(spacing('top', 6)).toBe('top-1.5')
    expect(spacing('top', 13)).toBe('top-[13px]')
    expect(spacing('translate-y', -2)).toBe('-translate-y-0.5')
    expect(spacing('w', 1280, 96)).toBe('w-[1280px]')
  })

  it('maps type, color, radius, shadow and motion declarations', () => {
    expect(
      declarationsToClasses({
        'font-size': '16px',
        'font-weight': '600',
        'line-height': '1.5',
        color: '#FFFFFF',
        'background-color': '#D4441C',
        'border-radius': '8px',
        'box-shadow': '0px 4px 12px #1A181433, inset 0 0 0 2px #000000',
        'transition-timing-function': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        animation: 'cf-appear-fade 600ms cubic-bezier(0, 0, 0.2, 1) 0ms backwards',
      }),
    ).toEqual([
      'text-base',
      'font-semibold',
      'leading-normal',
      'text-white',
      'bg-[#d4441c]',
      'rounded-lg',
      'shadow-[0px_4px_12px_#1A181433,inset_0_0_0_2px_#000000]',
      'ease-[cubic-bezier(0.34,1.56,0.64,1)]',
      'animate-[cf-appear-fade_600ms_cubic-bezier(0,0,0.2,1)_0ms_backwards]',
    ])
    expect(declarationsToClasses({ translate: '0px -2px', scale: '1.04' }, 'hover:')).toEqual(['hover:-translate-y-0.5', 'hover:scale-104'])
  })

  it('escapes JSX text only when needed', () => {
    expect(jsxText('Sign in')).toBe('Sign in')
    expect(jsxText('Tools for teams\nwho ship.')).toBe('{"Tools for teams\\nwho ship."}')
    expect(jsxText('a {b}')).toBe('{"a {b}"}')
  })
})

describe('project export', () => {
  async function site() {
    const store = new SceneStore()
    const home = add(store, 'frame', { name: 'Landing', width: 1280, height: 800, fill: '#FFFFFF' })
    const about = add(store, 'frame', { name: 'About us', x: 1400, width: 400, height: 300, fill: '#FFFFFF' })
    add(store, 'text', { name: 'Headline', x: 48, y: 176, width: 600, height: 72, text: 'Hello\nthere', fontSize: 64, fontFamily: 'Fraunces' }, home)
    add(
      store,
      'rect',
      {
        name: 'CTA',
        x: 48,
        y: 486,
        width: 188,
        height: 52,
        fill: '#D4441C',
        cornerRadius: 8,
        hover: { scale: 1.04, y: -2 },
        interactions: onClick(about, 'push', 'left', 520, 'ease-in-out'),
      },
      home,
    )
    add(
      store,
      'component',
      { name: 'Back', x: 24, y: 24, width: 80, height: 36, component: 'shadcn/button', props: { label: 'Back', variant: 'outline' }, interactions: onClick('back', 'dissolve', 'left', 300, 'ease-out') },
      about,
    )
    add(store, 'component', { name: 'Terms', x: 24, y: 80, width: 200, height: 16, component: 'shadcn/checkbox', props: { label: 'I agree', checked: true } }, about)
    return exportProject({ snapshot: store.getSnapshot(), title: 'Northwind Site', theme: DEFAULT_THEME })
  }

  it('writes a runnable project with one page per frame', async () => {
    const project = await site()
    const paths = project.files.map((f) => f.path)
    expect(project.name).toBe('northwind-site')
    expect(paths).toEqual(
      expect.arrayContaining([
        'package.json',
        'index.html',
        'vite.config.ts',
        'tsconfig.app.json',
        'src/main.tsx',
        'src/App.tsx',
        'src/motion.tsx',
        'src/index.css',
        'src/lib/utils.ts',
        'src/pages/LandingPage.tsx',
        'src/pages/AboutUsPage.tsx',
        'src/components/ui/button.tsx',
        'src/components/ui/checkbox.tsx',
        'src/components/ui/label.tsx',
      ]),
    )
    expect(project.pages).toEqual([
      { name: 'LandingPage', path: '/', file: 'src/pages/LandingPage.tsx' },
      { name: 'AboutUsPage', path: '/about-us', file: 'src/pages/AboutUsPage.tsx' },
    ])
    const pkg = JSON.parse(text(project.files, 'package.json'))
    expect(Object.keys(pkg.dependencies)).toEqual(
      expect.arrayContaining(['react', 'radix-ui', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react', '@fontsource-variable/fraunces', '@fontsource-variable/inter']),
    )
    expect(text(project.files, 'src/App.tsx')).toContain(`'/about-us': { component: AboutUsPage, width: 400, height: 300 },`)
    expect(text(project.files, 'src/motion.tsx')).toBe(readFileSync(new URL('../../runtime/src/motion.tsx', import.meta.url), 'utf8'))
  })

  it('emits semantic elements, links and interaction classes', async () => {
    const project = await site()
    const landing = text(project.files, 'src/pages/LandingPage.tsx')
    expect(landing).toContain(`import { useMotion } from '@/motion'`)
    expect(landing).toContain('const motion = useMotion()')
    expect(landing).toContain('<main className="relative mx-auto w-[1280px] h-[800px] bg-white overflow-hidden">')
    expect(landing).toContain('<h1 className="absolute left-12 top-44')
    expect(landing).toContain('{"Hello\\nthere"}')
    expect(landing).toContain(
      `<button type="button" className="absolute left-12 top-[486px] w-47 h-13 bg-[#d4441c] rounded-md transition duration-200 ease-out cursor-pointer hover:-translate-y-0.5 hover:scale-104" onClick={() => motion.navigate('/about-us', { type: 'push', direction: 'left', duration: 520, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })} />`,
    )

    const about = text(project.files, 'src/pages/AboutUsPage.tsx')
    expect(about).toContain(`import { Button } from '@/components/ui/button'`)
    expect(about).toContain(`import { Checkbox } from '@/components/ui/checkbox'`)
    expect(about).toContain(`<Button variant="outline" className="absolute left-6 top-6 w-20 cursor-pointer" onClick={() => motion.back({ type: 'dissolve', direction: 'left', duration: 300, easing: 'cubic-bezier(0, 0, 0.2, 1)' })}>Back</Button>`)
    expect(about).toContain('<Checkbox id="i-agree" defaultChecked /><Label htmlFor="i-agree">I agree</Label>')

    const css = text(project.files, 'src/index.css')
    expect(css).toContain('--primary: #171717;')
    expect(css).toContain('--font-fraunces: "Fraunces Variable", Georgia, serif;')
  })
})

describe('auto layout export', () => {
  it('writes flex utilities for stacks and their children', async () => {
    const store = new SceneStore()
    const none = { top: 0, right: 0, bottom: 0, left: 0 }
    const page = add(store, 'frame', {
      name: 'Stack',
      width: 600,
      height: 400,
      fill: '#FFFFFF',
      layout: { direction: 'vertical', wrap: false, gap: 16, crossGap: 16, padding: { top: 24, right: 32, bottom: 24, left: 32 }, justify: 'start', align: 'center' },
    })
    const row = add(
      store,
      'frame',
      { name: 'Row', sizeX: 'fill', sizeY: 'hug', fill: null, layout: { direction: 'horizontal', wrap: false, gap: 8, crossGap: 8, padding: none, justify: 'space-between', align: 'start' } },
      page,
    )
    add(store, 'rect', { name: 'A', width: 48, height: 48, fill: '#D4441C' }, row)
    add(store, 'rect', { name: 'B', width: 48, height: 48, sizeX: 'fill', fill: '#1A1814' }, row)
    const project = await exportProject({ snapshot: store.getSnapshot(), title: 'Stack', theme: DEFAULT_THEME })
    const source = text(project.files, 'src/pages/StackPage.tsx')
    expect(source).toContain('<main className="relative mx-auto w-[600px] h-[400px] flex flex-col gap-4 px-8 py-6 items-center bg-white overflow-hidden">')
    expect(source).toContain('<div className="relative shrink-0 self-stretch flex justify-between items-start overflow-hidden">')
    expect(source).toContain('<div className="relative shrink-0 w-12 h-12 bg-[#d4441c]" />')
    expect(source).toContain('<div className="relative shrink-0 flex-1 min-w-0 h-12 bg-[#1a1814]" />')
  })
})

describe('interactions export', () => {
  const on = (type: TriggerType, actions: Action[], extra: { delay?: number; key?: string } = {}): Interaction[] => [
    { id: type, trigger: { type, delay: extra.delay ?? 0, key: extra.key ?? 'Enter' }, actions },
  ]
  const ease = { duration: 300, delay: 0, curve: CURVE_PRESETS['ease-out'] }

  async function site() {
    const store = new SceneStore()
    const home = add(store, 'frame', { name: 'Home', width: 800, height: 1600, fill: '#FFFFFF' })
    const about = add(store, 'frame', { name: 'About', x: 900, width: 800, height: 600, fill: '#FFFFFF' })
    const menu = add(store, 'frame', { name: 'Menu', x: 1800, width: 240, height: 320, fill: '#FFFFFF' })
    const overlay = { type: 'overlay' as const, target: menu, overlay: { ...DEFAULT_OVERLAY, position: 'top-right' as const, background: null }, transition: { type: 'instant' as const, direction: 'left' as const, timing: ease } }
    store.transact(() => {
      store.nodes.get(home)!.set('interactions', [
        ...on('after-delay', [{ type: 'navigate', target: about, transition: { type: 'dissolve', direction: 'left', timing: ease } }], { delay: 1500 }),
        ...on('key', [overlay], { key: 'm' }),
      ])
    })
    const faq = add(store, 'text', { name: 'FAQ', x: 40, y: 1400, width: 60, height: 24, text: 'FAQ', appear: { from: { opacity: 0 }, trigger: 'in-view', once: false, amount: 0.3, timing: ease } }, home)
    add(store, 'rect', { name: 'Menu button', x: 700, y: 20, width: 40, height: 40, interactions: on('while-hovering', [overlay]) }, home)
    add(store, 'rect', {
      name: 'Hero',
      x: 0,
      y: 100,
      width: 800,
      height: 400,
      parallax: { speed: 0.5 },
      interactions: [
        ...on('in-view', [{ type: 'play-animation', animation: 'intro', mode: 'restart' }]),
        ...on('click', [{ type: 'scroll-to', target: faq, offset: 24, animate: true, timing: { duration: 500, delay: 0, curve: CURVE_PRESETS['ease-in-out'] } }]),
      ],
    }, home)
    for (const frame of [home, about]) {
      add(store, 'rect', { name: 'Card', x: 40, y: 540, width: 200, height: 120, interactions: frame === home ? on('click', [{ type: 'navigate', target: about, transition: { type: 'smart-animate', direction: 'left', timing: ease } }]) : [] }, frame)
    }
    const hero = [...store.getSnapshot().nodes.values()].find((n) => n.name === 'Hero')!.id
    putAnimation(store, {
      id: 'intro',
      name: 'Intro',
      frameId: home,
      duration: 1000,
      repeat: 'once',
      autoplay: false,
      tracks: [{ nodeId: hero, property: 'opacity', keyframes: [{ time: 0, value: 0, curve: CURVE_PRESETS.linear }, { time: 1000, value: 1, curve: CURVE_PRESETS.linear }] }],
    })
    return exportProject({ snapshot: store.getSnapshot(), title: 'Motion', theme: DEFAULT_THEME })
  }

  it('wires triggers to the motion runtime', async () => {
    const project = await site()
    const home = text(project.files, 'src/pages/HomePage.tsx')
    expect(home).toContain(`import { useAfterDelay, useInView, useKey, useMotion } from '@/motion'`)
    expect(home).toContain(`useAfterDelay(1500, () => motion.navigate('/about', { type: 'dissolve', direction: 'left', duration: 300, easing: 'cubic-bezier(0, 0, 0.2, 1)' }))`)
    const openMenu = `motion.openOverlay('/menu', { position: 'top-right', offset: { x: 0, y: 0 }, closeOnOutside: true, background: null })`
    expect(home).toContain(`useKey('m', () => ${openMenu})`)
    expect(home).toContain(`onMouseEnter={() => ${openMenu}} onMouseLeave={() => motion.closeOverlay()}`)
    expect(home).toContain(`const heroInView = useInView<HTMLButtonElement>(() => motion.play('intro', 'restart'))`)
    expect(home).toContain(`data-cf="hero"`)
    expect(home).toContain(`onClick={() => motion.scrollTo('faq', { offset: 24, duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })} ref={heroInView}`)
    expect(home).toContain(`data-cf="faq" data-cf-match="FAQ" data-cf-appear="in-view" data-cf-once="false"`)
    expect(home).toContain('data-cf-match="Card"')
    expect(text(project.files, 'src/pages/AboutPage.tsx')).toContain('data-cf-match="Card"')
    expect(text(project.files, 'src/pages/MenuPage.tsx')).not.toContain('data-cf-match')
  })

  it('writes clips and scroll effects next to the page and registers screens', async () => {
    const project = await site()
    const motion = text(project.files, 'src/pages/HomePage.motion.ts')
    expect(motion).toContain(`import type { Clip, ScrollEffect } from '@/motion'`)
    expect(motion).toContain(
      `export const clips: Clip[] = [{ id: 'intro', duration: 1000, repeat: 'once', autoplay: false, tracks: [{ target: 'hero', property: 'opacity', composite: 'replace', keyframes: [{ offset: 0, value: '0', easing: 'linear' }, { offset: 1, value: '1', easing: 'linear' }] }] }]`,
    )
    expect(motion).toContain(`export const effects: ScrollEffect[] = [{ target: 'hero', source: 'in-view', parallax: 0.5, tracks: [] }]`)
    const app = text(project.files, 'src/App.tsx')
    expect(app).toContain(`import { clips as homePageClips, effects as homePageEffects } from './pages/HomePage.motion'`)
    expect(app).toContain(`'/': { component: HomePage, width: 800, height: 1600, clips: homePageClips, effects: homePageEffects },`)
    expect(app).toContain('<MotionRouter screens={screens} home="/" />')
    expect(MOTION_RUNTIME).toBe(readFileSync(new URL('../../runtime/src/motion.tsx', import.meta.url), 'utf8'))
  })

  it('prints JS literals safely', () => {
    expect(jsLiteral({ a: "it's", b: 'say "hi"\\', c: undefined, 'd-e': [1, true, null] })).toBe(`{ a: 'it\\'s', b: 'say "hi"\\\\', 'd-e': [1, true, null] }`)
  })
})
