/** Static files of an exported project (Vite + React + TypeScript + Tailwind v4 conventions). */

export const ROUTER_TSX = `import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'

export type Transition =
  | 'instant'
  | 'dissolve'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'push-left'
  | 'push-right'

export interface NavigateOptions {
  transition?: Transition
  /** Milliseconds. */
  duration?: number
  easing?: string
}

export type Navigate = (to: string | -1, options?: NavigateOptions) => void

const NavigateContext = createContext<Navigate>(() => {})

export function useNavigate(): Navigate {
  return useContext(NavigateContext)
}

const EASINGS: Record<string, string> = {
  linear: 'linear',
  ease: 'ease',
  'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
  'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
  'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

const ENTER: Partial<Record<Transition, Keyframe[]>> = {
  dissolve: [{ opacity: 0 }, { opacity: 1 }],
  'slide-left': [{ transform: 'translateX(100vw)' }, { transform: 'none' }],
  'slide-right': [{ transform: 'translateX(-100vw)' }, { transform: 'none' }],
  'slide-up': [{ transform: 'translateY(100vh)' }, { transform: 'none' }],
  'slide-down': [{ transform: 'translateY(-100vh)' }, { transform: 'none' }],
  'push-left': [{ transform: 'translateX(100vw)' }, { transform: 'none' }],
  'push-right': [{ transform: 'translateX(-100vw)' }, { transform: 'none' }],
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
    const keyframes = ENTER[options.transition]
    if (!keyframes) return
    page.current.animate(keyframes, {
      duration: options.duration ?? 300,
      easing: EASINGS[options.easing ?? 'ease-out'] ?? options.easing,
    })
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
