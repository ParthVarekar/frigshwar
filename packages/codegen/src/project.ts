/**
 * The whole canvas → a runnable Vite + React + Tailwind project:
 * `npm install && npm run dev`, no manual fixes.
 */
import { LIBRARY_NAME, npmDependencies, radii, registryClosure, SHADCN_REGISTRY, THEME_TOKEN_NAMES, themeVariables, type LibraryTheme } from '@codeframe/library'
import {
  childrenOf,
  clipPlayback,
  descendantsOf,
  MOTION_KEYFRAMES,
  scrollPlayback,
  scrollTargets,
  type FrameNode,
  type NodeId,
  type SceneNode,
  type SceneSnapshot,
} from '@codeframe/scene'
import { camelCase, jsLiteral } from './literal'
import { escapeHtml, kebabCase, pascalCase, unique } from './naming'
import { renderPage, type SiteContext } from './page'
import { MOTION_RUNTIME } from './runtime.generated'
import { DEFAULT_RADII } from './tailwind'
import { GITIGNORE, TSCONFIG, TSCONFIG_APP, TSCONFIG_NODE, UTILS_TS, VITE_CONFIG } from './templates'
import { FONTS, VERSIONS } from './versions'

export interface ExportInput {
  snapshot: SceneSnapshot
  title: string
  theme: LibraryTheme
  /** Export only these canvas-level frames (default: all). */
  frameIds?: NodeId[]
}

export type Parser = 'babel-ts' | 'css' | 'json'
export type Formatter = (source: string, parser: Parser) => Promise<string>

export interface ProjectFile {
  path: string
  contents: string | Uint8Array
}

export interface ExportedProject {
  name: string
  files: ProjectFile[]
  pages: { name: string; path: string; file: string }[]
}

const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg' }

function decodeDataUrl(src: string): Uint8Array | null {
  const match = /^data:[^;,]+;base64,(.*)$/.exec(src)
  if (!match) return null
  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sortedObject(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Frames whose layers need `data-cf-match`: both ends of every Smart Animate
 * navigation, and for a Smart Animate "back", every frame that leads to it.
 */
function smartAnimateFrames(snap: SceneSnapshot, frames: readonly NodeId[]): Set<NodeId> {
  const smart = new Set<NodeId>()
  const arrivals = new Map<NodeId, Set<NodeId>>()
  const backs = new Set<NodeId>()
  for (const frame of frames) {
    for (const id of [frame, ...descendantsOf(snap, frame)]) {
      for (const ix of snap.nodes.get(id)!.interactions) {
        for (const action of ix.actions) {
          if ('target' in action && action.target) {
            const from = arrivals.get(action.target) ?? new Set()
            arrivals.set(action.target, from.add(frame))
          }
          if (!('transition' in action) || action.transition.type !== 'smart-animate') continue
          if (action.type === 'back') backs.add(frame)
          else if ('target' in action && action.target) smart.add(frame).add(action.target)
        }
      }
    }
  }
  for (const frame of backs) {
    smart.add(frame)
    for (const from of arrivals.get(frame) ?? []) smart.add(from)
  }
  return smart
}

export async function exportProject(input: ExportInput, format: Formatter = async (source) => source): Promise<ExportedProject> {
  const snap = input.snapshot
  const frames = childrenOf(snap, null).filter((id) => {
    const node = snap.nodes.get(id)
    return node?.type === 'frame' && node.visible && (!input.frameIds || input.frameIds.includes(id))
  })
  if (frames.length === 0) throw new Error('Nothing to export yet: add a frame to the canvas.')

  const name = kebabCase(input.title) || 'codeframe-site'
  const layersOf = (frame: NodeId): SceneNode[] => [frame, ...descendantsOf(snap, frame)].map((id) => snap.nodes.get(id)!)

  // Pages and routes. The first frame is the home page.
  const componentNames = new Set<string>()
  const paths = new Set<string>()
  const routes = new Map<NodeId, string>()
  const pageNames = new Map<NodeId, string>()
  frames.forEach((id, i) => {
    const frameName = snap.nodes.get(id)!.name
    pageNames.set(id, unique(`${pascalCase(frameName, 'Frame')}Page`, componentNames))
    routes.set(id, i === 0 ? unique('/', paths) : unique(`/${kebabCase(frameName) || 'page'}`, paths, '-'))
  })

  // Layers the runtime looks up by `data-cf`: scroll-to targets, clip tracks, scroll effects.
  const clipsByFrame = new Map(frames.map((f) => [f, [...snap.animations.values()].filter((clip) => clip.frameId === f)]))
  const targeted = scrollTargets(frames.flatMap(layersOf))
  for (const clips of clipsByFrame.values()) for (const clip of clips) for (const track of clip.tracks) targeted.add(track.nodeId)
  for (const node of frames.flatMap(layersOf)) if (node.scroll || node.parallax) targeted.add(node.id)
  const elementIds = new Map<NodeId, string>()
  const usedIds = new Set<string>()
  for (const node of frames.flatMap(layersOf)) {
    if (targeted.has(node.id)) elementIds.set(node.id, unique(kebabCase(node.name) || 'layer', usedIds, '-'))
  }

  // Images become files under public/.
  const files: ProjectFile[] = []
  const assets = new Map<string, string>()
  const assetNames = new Set<string>()
  for (const node of frames.flatMap(layersOf)) {
    if (node.type !== 'image' || !node.assetId || assets.has(node.assetId)) continue
    const asset = snap.assets.get(node.assetId)
    const bytes = asset ? decodeDataUrl(asset.src) : null
    if (!asset || !bytes) continue
    const file = unique(`${kebabCase(node.name) || 'image'}-${asset.id.slice(0, 6)}`, assetNames, '-')
    const path = `images/${file}.${EXTENSIONS[asset.mime] ?? 'bin'}`
    assets.set(node.assetId, `/${path}`)
    files.push({ path: `public/${path}`, contents: bytes })
  }

  // Probe for library use first: a shadcn theme redefines the radius scale.
  const usesLibrary = frames.some((f) => descendantsOf(snap, f).some((id) => snap.nodes.get(id)?.type === 'component'))
  const r = radii(input.theme)
  const site: SiteContext = {
    snap,
    routes,
    assets,
    tailwind: { radii: usesLibrary ? { ...DEFAULT_RADII, sm: r.sm, md: r.md, lg: r.lg, xl: r.xl } : DEFAULT_RADII },
    elementIds,
    smartFrames: smartAnimateFrames(snap, frames),
    registry: new Set(),
    fonts: new Set(),
    usesMotion: false,
  }

  const pages = frames.map((id) => {
    const page = renderPage(id, pageNames.get(id)!, site)
    const clips = clipsByFrame.get(id)!.map((clip) => {
      const playback = clipPlayback(snap, clip)
      return {
        id: playback.id,
        duration: playback.duration,
        repeat: playback.repeat,
        autoplay: playback.autoplay,
        tracks: playback.tracks.flatMap((t) => {
          const target = elementIds.get(t.nodeId)
          return target ? [{ target, property: t.property, composite: t.composite, keyframes: t.keyframes }] : []
        }),
      }
    })
    const effects = layersOf(id).flatMap((node) => {
      const target = elementIds.get(node.id)
      return target ? scrollPlayback(node).map((effect) => ({ target, ...effect })) : []
    })
    const motion = clips.length || effects.length ? { clips, effects, alias: camelCase(page.componentName, 'page') } : null
    return { id, ...page, file: `src/pages/${page.componentName}.tsx`, motion }
  })
  if (usesLibrary) site.fonts.add(input.theme.font)

  const registry = registryClosure(site.registry)
  const fonts = [...site.fonts].filter((f) => FONTS[f])

  // package.json
  const dependencies: Record<string, string> = { react: VERSIONS.react, 'react-dom': VERSIONS['react-dom'] }
  if (registry.length) {
    for (const pkg of [...npmDependencies(registry), 'clsx', 'tailwind-merge']) dependencies[pkg] = VERSIONS[pkg] ?? 'latest'
  }
  for (const font of fonts) dependencies[FONTS[font].package] = VERSIONS[FONTS[font].package]
  const packageJson = {
    name,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
    dependencies: sortedObject(dependencies),
    devDependencies: sortedObject(
      Object.fromEntries(
        ['@tailwindcss/vite', '@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react', 'tailwindcss', 'typescript', 'vite'].map((p) => [p, VERSIONS[p]]),
      ),
    ),
  }

  // index.css
  const sansFont = usesLibrary ? input.theme.font : fonts[0]
  const css: string[] = ['@import "tailwindcss";', '']
  if (usesLibrary) css.push('@custom-variant dark (&:is(.dark *));', '')
  const themeLines = [
    ...(sansFont && FONTS[sansFont] ? [`--font-sans: ${FONTS[sansFont].stack};`] : []),
    ...fonts.map((f) => `--font-${FONTS[f].token}: ${FONTS[f].stack};`),
  ]
  if (themeLines.length) css.push('@theme {', ...themeLines.map((l) => `  ${l}`), '}', '')
  if (usesLibrary) {
    css.push(
      `/* ${LIBRARY_NAME} tokens: edit these to re-theme every component. */`,
      '@theme inline {',
      '  --radius-sm: calc(var(--radius) - 4px);',
      '  --radius-md: calc(var(--radius) - 2px);',
      '  --radius-lg: var(--radius);',
      '  --radius-xl: calc(var(--radius) + 4px);',
      ...THEME_TOKEN_NAMES.map((token) => `  --color-${token}: var(--${token});`),
      '}',
      '',
      ':root {',
      ...themeVariables(input.theme).map((l) => `  ${l}`),
      '}',
      '',
      '@layer base {',
      '  * {',
      '    @apply border-border outline-ring/50;',
      '  }',
      '  body {',
      '    @apply bg-background text-foreground;',
      '  }',
      '}',
      '',
    )
  }
  if (site.usesMotion) css.push('/* Appear and loop animations authored in Codeframe. */', MOTION_KEYFRAMES, '')

  const sortedPages = [...pages].sort((a, b) => a.componentName.localeCompare(b.componentName))
  const app = [
    `import { MotionRouter, type Screen } from './motion'`,
    ...sortedPages.map((p) => `import ${p.componentName} from './pages/${p.componentName}'`),
    ...sortedPages.flatMap((p) => {
      if (!p.motion) return []
      const names = [...(p.motion.clips.length ? [`clips as ${p.motion.alias}Clips`] : []), ...(p.motion.effects.length ? [`effects as ${p.motion.alias}Effects`] : [])]
      return [`import { ${names.join(', ')} } from './pages/${p.componentName}.motion'`]
    }),
    '',
    'const screens: Record<string, Screen> = {',
    ...pages.map((p) => {
      const frame = snap.nodes.get(p.id) as FrameNode
      const fields = [`component: ${p.componentName}`, `width: ${Math.round(frame.width)}`, `height: ${Math.round(frame.height)}`]
      if (p.motion?.clips.length) fields.push(`clips: ${p.motion.alias}Clips`)
      if (p.motion?.effects.length) fields.push(`effects: ${p.motion.alias}Effects`)
      return `  '${routes.get(p.id)}': { ${fields.join(', ')} },`
    }),
    '}',
    '',
    'export default function App() {',
    '  return (',
    '    <div className="min-h-screen overflow-x-clip bg-neutral-100 py-12">',
    `      <MotionRouter screens={screens} home="/" />`,
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n')

  const main = [
    `import { StrictMode } from 'react'`,
    `import { createRoot } from 'react-dom/client'`,
    ...fonts.flatMap((f) => FONTS[f].imports.map((i) => `import '${i}'`)),
    `import './index.css'`,
    `import App from './App'`,
    '',
    `createRoot(document.getElementById('root')!).render(`,
    '  <StrictMode>',
    '    <App />',
    '  </StrictMode>,',
    ')',
    '',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title || 'Codeframe site')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

  const readme = [
    `# ${input.title || name}`,
    '',
    'Exported from Codeframe as a Vite + React + TypeScript + Tailwind CSS v4 project.',
    '',
    '```bash',
    'npm install',
    'npm run dev',
    '```',
    '',
    '## Pages',
    '',
    ...pages.map((p) => `- \`${routes.get(p.id)}\` → [${p.file}](${p.file})`),
    '',
    '## Motion',
    '',
    'Interactions call `useMotion()` from [src/motion.tsx](src/motion.tsx), the Codeframe motion runtime: hash routing,',
    'screen transitions (View Transitions API, including Smart Animate), overlays, scroll-to, timeline clips and',
    'scroll effects. It depends only on React.',
    ...(registry.length
      ? ['', `## Components`, '', `\`src/components/ui\` holds ${LIBRARY_NAME} components (MIT). Re-theme them with the variables in \`src/index.css\`.`]
      : []),
    '',
  ].join('\n')

  const json = (value: unknown) => format(`${JSON.stringify(value, null, 2)}\n`, 'json')
  files.push(
    { path: 'package.json', contents: await json(packageJson) },
    { path: 'index.html', contents: html },
    { path: 'vite.config.ts', contents: await format(VITE_CONFIG, 'babel-ts') },
    { path: 'tsconfig.json', contents: await json(TSCONFIG) },
    { path: 'tsconfig.app.json', contents: await json(TSCONFIG_APP) },
    { path: 'tsconfig.node.json', contents: await json(TSCONFIG_NODE) },
    { path: '.gitignore', contents: GITIGNORE },
    { path: 'README.md', contents: readme },
    { path: 'src/main.tsx', contents: await format(main, 'babel-ts') },
    { path: 'src/App.tsx', contents: await format(app, 'babel-ts') },
    // Vendored verbatim, like the shadcn sources.
    { path: 'src/motion.tsx', contents: MOTION_RUNTIME },
    { path: 'src/index.css', contents: await format(css.join('\n'), 'css') },
  )
  for (const page of pages) {
    files.push({ path: page.file, contents: await format(page.source, 'babel-ts') })
    if (!page.motion) continue
    const module = [
      `import type { ${[...(page.motion.clips.length ? ['Clip'] : []), ...(page.motion.effects.length ? ['ScrollEffect'] : [])].join(', ')} } from '@/motion'`,
      '',
      ...(page.motion.clips.length ? [`/** Timeline animations on "${page.componentName}". */`, `export const clips: Clip[] = ${jsLiteral(page.motion.clips)}`, ''] : []),
      ...(page.motion.effects.length ? [`/** Scroll transforms and parallax. */`, `export const effects: ScrollEffect[] = ${jsLiteral(page.motion.effects)}`, ''] : []),
    ].join('\n')
    files.push({ path: `src/pages/${page.componentName}.motion.ts`, contents: await format(module, 'babel-ts') })
  }
  if (registry.length) {
    files.push({ path: 'src/lib/utils.ts', contents: await format(UTILS_TS, 'babel-ts') })
    // Vendored as published upstream, formatting untouched.
    for (const item of registry) for (const file of SHADCN_REGISTRY[item].files) files.push({ path: file.path, contents: file.content })
  }

  files.sort((a, b) => a.path.localeCompare(b.path))
  return {
    name,
    files,
    pages: pages.map((p) => ({ name: p.componentName, path: routes.get(p.id)!, file: p.file })),
  }
}
