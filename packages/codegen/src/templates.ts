/** Static files of an exported project (Vite + React + TypeScript + Tailwind v4 conventions). */

export const ROUTER_TSX = `import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'

export type Transition = 'instant' | 'dissolve' | 'smart-animate' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out'

/** The way the moving screen travels: \`left\` enters from the right edge. */
export type Direction = 'left' | 'right' | 'up' | 'down'

export interface NavigateOptions {
  transition?: Transition
  direction?: Direction
  /** Milliseconds. */
  duration?: number
  /** Any CSS easing, including \`linear()\` springs. */
  easing?: string
}

export type Navigate = (to: string | -1, options?: NavigateOptions) => void

const NavigateContext = createContext<Navigate>(() => {})

export function useNavigate(): Navigate {
  return useContext(NavigateContext)
}

const OFFSETS: Record<Direction, [string, string]> = {
  left: ['100vw', '0px'],
  right: ['-100vw', '0px'],
  up: ['0px', '100vh'],
  down: ['0px', '-100vh'],
}

function enterKeyframes({ transition = 'instant', direction = 'left' }: NavigateOptions): Keyframe[] | null {
  const [x, y] = OFFSETS[direction]
  switch (transition) {
    case 'dissolve':
    case 'smart-animate':
    case 'move-out':
    case 'slide-out':
      return [{ opacity: 0 }, { opacity: 1 }]
    case 'move-in':
    case 'push':
    case 'slide-in':
      return [{ translate: \`\${x} \${y}\` }, { translate: '0px 0px' }]
    default:
      return null
  }
}

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

/** Hash routing between pages, replaying each prototype link's transition. */
export function Router({ routes }: { routes: Record<string, ComponentType> }) {
  const [path, setPath] = useState(currentPath)
  const pending = useRef<NavigateOptions | null>(null)
  const page = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  useLayoutEffect(() => {
    const options = pending.current
    pending.current = null
    if (!options?.transition || !page.current) return
    window.scrollTo(0, 0)
    const keyframes = enterKeyframes(options)
    if (!keyframes) return
    page.current.animate(keyframes, { duration: options.duration ?? 300, easing: options.easing ?? 'ease-out' })
  }, [path])

  const navigate: Navigate = (to, options = {}) => {
    pending.current = options
    if (to === -1) window.history.back()
    else window.location.hash = to
  }

  const Page = routes[path] ?? routes['/']
  return (
    <NavigateContext.Provider value={navigate}>
      <div ref={page} key={path}>
        <Page />
      </div>
    </NavigateContext.Provider>
  )
}
`

export const UTILS_TS = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

export const VITE_CONFIG = `import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
`

export const TSCONFIG = {
  files: [],
  references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
}

export const TSCONFIG_APP = {
  compilerOptions: {
    tsBuildInfoFile: './node_modules/.tmp/tsconfig.app.tsbuildinfo',
    target: 'es2023',
    lib: ['ES2023', 'DOM'],
    module: 'esnext',
    types: ['vite/client'],
    skipLibCheck: true,
    moduleResolution: 'bundler',
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    moduleDetection: 'force',
    noEmit: true,
    jsx: 'react-jsx',
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    erasableSyntaxOnly: true,
    noFallthroughCasesInSwitch: true,
    paths: { '@/*': ['./src/*'] },
  },
  include: ['src'],
}

export const TSCONFIG_NODE = {
  compilerOptions: {
    tsBuildInfoFile: './node_modules/.tmp/tsconfig.node.tsbuildinfo',
    target: 'es2023',
    lib: ['ES2023'],
    types: ['node'],
    skipLibCheck: true,
    module: 'nodenext',
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    moduleDetection: 'force',
    noEmit: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    erasableSyntaxOnly: true,
    noFallthroughCasesInSwitch: true,
  },
  include: ['vite.config.ts'],
}

export const GITIGNORE = `node_modules
dist
*.local
.DS_Store
`
