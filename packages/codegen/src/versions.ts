/** Dependency ranges written into exported projects (kept in step with the editor's own). */
export const VERSIONS: Record<string, string> = {
  react: '^19.2.8',
  'react-dom': '^19.2.8',
  vite: '^8.3.0',
  '@vitejs/plugin-react': '^6.1.1',
  tailwindcss: '^4.3.3',
  '@tailwindcss/vite': '^4.3.3',
  typescript: '~6.0.2',
  '@types/react': '^19.2.18',
  '@types/react-dom': '^19.2.7',
  '@types/node': '^24.13.3',
  'radix-ui': '^1.6.7',
  'class-variance-authority': '^0.7.1',
  clsx: '^2.1.1',
  'tailwind-merge': '^3.6.0',
  'lucide-react': '^1.44.0',
  '@fontsource-variable/inter': '^5.3.0',
  '@fontsource-variable/fraunces': '^5.3.0',
  '@fontsource/ibm-plex-sans': '^5.3.0',
  '@fontsource/ibm-plex-mono': '^5.3.0',
}

export interface FontPackage {
  /** Tailwind token: `font-<token>`. */
  token: string
  package: string
  imports: string[]
  stack: string
}

/** Content fonts the editor ships, and how an exported project loads them. */
export const FONTS: Record<string, FontPackage> = {
  Inter: {
    token: 'inter',
    package: '@fontsource-variable/inter',
    imports: ['@fontsource-variable/inter', '@fontsource-variable/inter/wght-italic.css'],
    stack: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  },
  Fraunces: {
    token: 'fraunces',
    package: '@fontsource-variable/fraunces',
    imports: ['@fontsource-variable/fraunces', '@fontsource-variable/fraunces/wght-italic.css'],
    stack: '"Fraunces Variable", Georgia, serif',
  },
  'IBM Plex Sans': {
    token: 'plex-sans',
    package: '@fontsource/ibm-plex-sans',
    imports: ['400', '400-italic', '500', '600'].map((w) => `@fontsource/ibm-plex-sans/${w}.css`),
    stack: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  },
  'IBM Plex Mono': {
    token: 'plex-mono',
    package: '@fontsource/ibm-plex-mono',
    imports: ['400', '400-italic', '500'].map((w) => `@fontsource/ibm-plex-mono/${w}.css`),
    stack: '"IBM Plex Mono", ui-monospace, monospace',
  },
}
