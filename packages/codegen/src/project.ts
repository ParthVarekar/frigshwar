/**
 * The whole canvas → a runnable Vite + React + Tailwind project:
 * `npm install && npm run dev`, no manual fixes.
 */
import { LIBRARY_NAME, npmDependencies, radii, registryClosure, SHADCN_REGISTRY, THEME_TOKEN_NAMES, themeVariables, type LibraryTheme } from '@codeframe/library'
import { childrenOf, descendantsOf, MOTION_KEYFRAMES, type NodeId, type SceneSnapshot } from '@codeframe/scene'
import { escapeHtml, kebabCase, pascalCase, unique } from './naming'
import { renderPage, type SiteContext } from './page'
import { DEFAULT_RADII } from './tailwind'
import { GITIGNORE, ROUTER_TSX, TSCONFIG, TSCONFIG_APP, TSCONFIG_NODE, UTILS_TS, VITE_CONFIG } from './templates'
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

export async function exportProject(input: ExportInput, format: Formatter = async (source) => source): Promise<ExportedProject> {
  const snap = input.snapshot
  const frames = childrenOf(snap, null).filter((id) => {
    const node = snap.nodes.get(id)
    return node?.type === 'frame' && node.visible && (!input.frameIds || input.frameIds.includes(id))
  })
  if (frames.length === 0) throw new Error('Nothing to export yet: add a frame to the canvas.')

  const name = kebabCase(input.title) || 'codeframe-site'

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

  // Images become files under public/.
  const files: ProjectFile[] = []
  const assets = new Map<string, string>()
  const assetNames = new Set<string>()
  for (const id of frames.flatMap((f) => [f, ...descendantsOf(snap, f)])) {
    const node = snap.nodes.get(id)
    if (node?.type !== 'image' || !node.assetId || assets.has(node.assetId)) continue
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
    registry: new Set(),
    fonts: new Set(),
    usesMotion: false,
  }

  const pages = frames.map((id) => {
    const page = renderPage(id, pageNames.get(id)!, site)
    return { id, ...page, file: `src/pages/${page.componentName}.tsx` }
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

  const app = [
    `import { Router } from './router'`,
    ...[...pages].sort((a, b) => a.componentName.localeCompare(b.componentName)).map((p) => `import ${p.componentName} from './pages/${p.componentName}'`),
    '',
    'const routes = {',
    ...pages.map((p) => `  '${routes.get(p.id)}': ${p.componentName},`),
    '}',
    '',
    'export default function App() {',
    '  return (',
    '    <div className="min-h-screen overflow-x-clip bg-neutral-100 py-12">',
    '      <Router routes={routes} />',
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
    'Prototype links navigate with `useNavigate()` from `src/router.tsx` (hash routing).',
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
    { path: 'src/router.tsx', contents: await format(ROUTER_TSX, 'babel-ts') },
    { path: 'src/index.css', contents: await format(css.join('\n'), 'css') },
  )
  for (const page of pages) files.push({ path: page.file, contents: await format(page.source, 'babel-ts') })
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
