import type { Color } from '@codeframe/scene'

/**
 * shadcn/ui design tokens (the "neutral" base, Tailwind v4 flavour) in hex so
 * they can be edited in the UI, drawn on the canvas and written to the exported
 * project's CSS variables unchanged.
 */
export interface LibraryTheme {
  font: string
  /** `--radius` in px. rounded-md is radius − 2, rounded-xl is radius + 4. */
  radius: number
  background: Color
  foreground: Color
  card: Color
  cardForeground: Color
  primary: Color
  primaryForeground: Color
  secondary: Color
  secondaryForeground: Color
  muted: Color
  mutedForeground: Color
  accent: Color
  accentForeground: Color
  destructive: Color
  border: Color
  input: Color
  ring: Color
}

export const DEFAULT_THEME: LibraryTheme = {
  font: 'Inter',
  radius: 10,
  background: '#FFFFFF',
  foreground: '#0A0A0A',
  card: '#FFFFFF',
  cardForeground: '#0A0A0A',
  primary: '#171717',
  primaryForeground: '#FAFAFA',
  secondary: '#F5F5F5',
  secondaryForeground: '#171717',
  muted: '#F5F5F5',
  mutedForeground: '#737373',
  accent: '#F5F5F5',
  accentForeground: '#171717',
  destructive: '#E7000B',
  border: '#E5E5E5',
  input: '#E5E5E5',
  ring: '#A1A1A1',
}

/** Document meta key the theme is stored under. */
export const THEME_META_KEY = 'libraryTheme'

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i

export function normalizeTheme(value: unknown): LibraryTheme {
  const theme = { ...DEFAULT_THEME }
  if (typeof value !== 'object' || value === null) return theme
  const raw = value as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_THEME) as (keyof LibraryTheme)[]) {
    const v = raw[key]
    if (key === 'radius') {
      if (typeof v === 'number' && Number.isFinite(v)) theme.radius = Math.min(40, Math.max(0, v))
    } else if (key === 'font') {
      if (typeof v === 'string' && v.trim()) theme.font = v.trim()
    } else if (typeof v === 'string' && HEX.test(v)) {
      theme[key] = v
    }
  }
  return theme
}

function luminance(color: Color): number {
  const channel = (i: number) => {
    const c = Number.parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Near-white or near-black, whichever reads better on `color`. */
export function readableOn(color: Color): Color {
  return luminance(color) > 0.4 ? '#171717' : '#FAFAFA'
}

/** `#RRGGBB` at an opacity, like Tailwind's `bg-primary/90`. */
export function withAlpha(color: Color, alpha: number): Color {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${color.slice(0, 7)}${a}`.toUpperCase()
}

/** Changing the primary color keeps its foreground legible. */
export function withPrimary(theme: LibraryTheme, primary: Color): LibraryTheme {
  return { ...theme, primary, primaryForeground: readableOn(primary) }
}

export function radii(theme: LibraryTheme) {
  return {
    sm: Math.max(0, theme.radius - 4),
    md: Math.max(0, theme.radius - 2),
    lg: theme.radius,
    xl: theme.radius + 4,
  }
}

const CSS_VARS: [keyof LibraryTheme, string][] = [
  ['background', 'background'],
  ['foreground', 'foreground'],
  ['card', 'card'],
  ['cardForeground', 'card-foreground'],
  ['card', 'popover'],
  ['cardForeground', 'popover-foreground'],
  ['primary', 'primary'],
  ['primaryForeground', 'primary-foreground'],
  ['secondary', 'secondary'],
  ['secondaryForeground', 'secondary-foreground'],
  ['muted', 'muted'],
  ['mutedForeground', 'muted-foreground'],
  ['accent', 'accent'],
  ['accentForeground', 'accent-foreground'],
  ['destructive', 'destructive'],
  ['border', 'border'],
  ['input', 'input'],
  ['ring', 'ring'],
]

/** The `:root` variable block shadcn components read. */
export function themeVariables(theme: LibraryTheme): string[] {
  return [`--radius: ${theme.radius}px;`, ...CSS_VARS.map(([key, name]) => `--${name}: ${String(theme[key]).toLowerCase()};`)]
}

/** Token names mapped into Tailwind's theme (`bg-primary`, `rounded-md`, …). */
export const THEME_TOKEN_NAMES = [...new Set(CSS_VARS.map(([, name]) => name))]
