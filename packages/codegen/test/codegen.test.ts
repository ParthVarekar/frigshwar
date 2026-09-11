import { DEFAULT_THEME } from '@codeframe/library'
import { createNode, SceneStore, type NodeId, type NodePatch, type NodeType } from '@codeframe/scene'
import { describe, expect, it } from 'vitest'
import { declarationsToClasses, exportProject, jsxText, spacing } from '../src'

function add(store: SceneStore, type: NodeType, props: NodePatch, parentId: NodeId | null = null) {
  return createNode(store, { type, parentId, props })
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
        link: { target: about, transition: 'push-left', duration: 520, easing: 'ease-in-out' },
      },
      home,
    )
    add(
      store,
      'component',
      { name: 'Back', x: 24, y: 24, width: 80, height: 36, component: 'shadcn/button', props: { label: 'Back', variant: 'outline' }, link: { target: 'back', transition: 'dissolve', duration: 300, easing: 'ease-out' } },
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
        'src/router.tsx',
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
    expect(text(project.files, 'src/App.tsx')).toContain(`'/about-us': AboutUsPage,`)
  })

  it('emits semantic elements, links and interaction classes', async () => {
    const project = await site()
    const landing = text(project.files, 'src/pages/LandingPage.tsx')
    expect(landing).toContain(`import { useNavigate } from '@/router'`)
    expect(landing).toContain('<main className="relative mx-auto h-[800px] w-[1280px] bg-white">')
    expect(landing).toContain('<h1 className="absolute left-12 top-44')
    expect(landing).toContain('{"Hello\\nthere"}')
    expect(landing).toContain(
      `<button type="button" className="absolute left-12 top-[486px] w-47 h-13 bg-[#d4441c] rounded-lg transition duration-200 ease-out cursor-pointer hover:-translate-y-0.5 hover:scale-104" onClick={() => navigate('/about-us', { transition: 'push-left', duration: 520, easing: 'ease-in-out' })} />`,
    )

    const about = text(project.files, 'src/pages/AboutUsPage.tsx')
    expect(about).toContain(`import { Button } from '@/components/ui/button'`)
    expect(about).toContain(`import { Checkbox } from '@/components/ui/checkbox'`)
    expect(about).toContain(`<Button variant="outline" className="absolute left-6 top-6 w-20 cursor-pointer" onClick={() => navigate(-1, { transition: 'dissolve', duration: 300, easing: 'ease-out' })}>Back</Button>`)
    expect(about).toContain('<Checkbox id="i-agree" defaultChecked /><Label htmlFor="i-agree">I agree</Label>')

    const css = text(project.files, 'src/index.css')
    expect(css).toContain('--primary: #171717;')
    expect(css).toContain('--font-fraunces: "Fraunces Variable", Georgia, serif;')
  })
})
