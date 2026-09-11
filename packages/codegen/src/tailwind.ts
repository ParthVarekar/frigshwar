/**
 * CSS declarations (from @codeframe/scene's css mapping) → Tailwind v4 utilities.
 * Values on Tailwind's scales use the scale; anything else becomes a bracketed
 * arbitrary value, so every class is exact and nothing is approximated.
 */
import { EASING_CSS, type CssDeclarations } from '@codeframe/scene'
import { FONTS } from './versions'

export interface TailwindOptions {
  /** Radius scale in px. Defaults to Tailwind's; a shadcn theme redefines sm–xl. */
  radii?: Record<string, number>
}

export const DEFAULT_RADII: Record<string, number> = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, '4xl': 32 }

const FONT_SIZES: Record<number, string> = { 12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl', 96: '8xl', 128: '9xl' }
const WEIGHTS: Record<string, string> = { '100': 'thin', '200': 'extralight', '300': 'light', '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black' }
const LEADING: Record<string, string> = { '1': 'none', '1.25': 'tight', '1.375': 'snug', '1.5': 'normal', '1.625': 'relaxed', '2': 'loose' }
const EASE_CLASSES: Record<string, string> = {
  [EASING_CSS.linear]: 'ease-linear',
  [EASING_CSS['ease-in']]: 'ease-in',
  [EASING_CSS['ease-out']]: 'ease-out',
  [EASING_CSS['ease-in-out']]: 'ease-in-out',
}

const round = (n: number) => Math.round(n * 100) / 100
const pxValue = (v: string) => Number.parseFloat(v)
/** Arbitrary values can't contain spaces; Tailwind reads `_` as a space. */
const arbitrary = (v: string) => v.trim().replace(/\(\s+/g, '(').replace(/\s*,\s*/g, ',').replace(/\s+/g, '_')

/** `left-12` for scale values (multiples of 2px), `left-[13px]` otherwise. */
export function spacing(prefix: string, px: number, maxScale = Infinity): string {
  const value = round(px)
  const steps = Math.abs(value) / 4
  const onScale = Number.isInteger(steps * 2) && steps <= maxScale
  if (value === 0) return `${prefix}-0`
  if (!onScale) return `${prefix}-[${value}px]`
  return `${value < 0 ? '-' : ''}${prefix}-${steps}`
}

function color(prefix: string, value: string): string {
  const hex = value.toLowerCase()
  if (hex === '#ffffff' || hex === '#ffffffff') return `${prefix}-white`
  if (hex === '#000000' || hex === '#000000ff') return `${prefix}-black`
  return `${prefix}-[${hex}]`
}

function radius(value: string, radii: Record<string, number>): string {
  if (value === '50%') return 'rounded-full'
  const px = round(pxValue(value))
  const name = Object.entries(radii).find(([, r]) => r === px)?.[0]
  return name ? `rounded-${name}` : `rounded-[${px}px]`
}

function degrees(prefix: string, value: string): string {
  const deg = round(Number.parseFloat(value))
  if (Number.isInteger(deg)) return `${deg < 0 ? '-' : ''}${prefix}-${Math.abs(deg)}`
  return `${prefix}-[${deg}deg]`
}

function ms(prefix: string, value: string): string {
  return `${prefix}-${Math.round(Number.parseFloat(value))}`
}

function fontToken(stack: string): string | null {
  const family = /"([^"]+)"/.exec(stack)?.[1]
  const font = family ? FONTS[family] : undefined
  return font ? `font-${font.token}` : family ? `font-['${family.replace(/\s+/g, '_')}']` : null
}

/** Converts declarations to utilities, each prefixed with `variant` (e.g. `hover:`). */
export function declarationsToClasses(css: CssDeclarations, variant = '', options: TailwindOptions = {}): string[] {
  const radii = options.radii ?? DEFAULT_RADII
  const out: string[] = []
  const add = (...classes: (string | null | false)[]) => {
    for (const c of classes) if (c) out.push(variant + c)
  }

  for (const [property, value] of Object.entries(css)) {
    switch (property) {
      case 'position':
        add(value)
        break
      case 'left':
      case 'top':
        add(spacing(property, pxValue(value)))
        break
      case 'width':
        add(spacing('w', pxValue(value), 96))
        break
      case 'height':
        add(spacing('h', pxValue(value), 96))
        break
      case 'rotate':
        add(degrees('rotate', value))
        break
      case 'opacity':
        add(`opacity-${Math.round(Number.parseFloat(value) * 100)}`)
        break
      case 'background-color':
        add(color('bg', value))
        break
      case 'color':
        add(color('text', value))
        break
      case 'border-radius':
        add(radius(value, radii))
        break
      case 'overflow':
        add(`overflow-${value}`)
        break
      case 'box-shadow':
        add(`shadow-[${arbitrary(value)}]`)
        break
      case 'text-shadow':
        add(`text-shadow-[${arbitrary(value)}]`)
        break
      case 'font-family':
        add(fontToken(value))
        break
      case 'font-size': {
        const px = round(pxValue(value))
        add(FONT_SIZES[px] ? `text-${FONT_SIZES[px]}` : `text-[${px}px]`)
        break
      }
      case 'font-weight':
        add(WEIGHTS[value] ? `font-${WEIGHTS[value]}` : value !== '400' && `font-[${value}]`)
        break
      case 'font-style':
        add(value === 'italic' && 'italic')
        break
      case 'line-height':
        add(LEADING[String(round(Number.parseFloat(value)))] ? `leading-${LEADING[String(round(Number.parseFloat(value)))]}` : `leading-[${round(Number.parseFloat(value))}]`)
        break
      case 'letter-spacing':
        add(`tracking-[${round(pxValue(value))}px]`)
        break
      case 'text-align':
        add(value !== 'left' && `text-${value}`)
        break
      case 'white-space':
        add(value === 'pre' ? 'whitespace-pre' : value === 'pre-wrap' ? 'whitespace-pre-wrap' : `whitespace-${value}`)
        break
      case 'overflow-wrap':
        add(value === 'break-word' && 'break-words')
        break
      case 'translate': {
        const [x = '0px', y = '0px'] = value.split(/\s+/)
        add(pxValue(x) !== 0 && spacing('translate-x', pxValue(x)), pxValue(y) !== 0 && spacing('translate-y', pxValue(y)))
        break
      }
      case 'scale': {
        const percent = round(Number.parseFloat(value) * 100)
        add(Number.isInteger(percent) ? `scale-${percent}` : `scale-[${value}]`)
        break
      }
      case 'transition-property':
        add('transition')
        break
      case 'transition-duration':
        add(ms('duration', value))
        break
      case 'transition-delay':
        add(ms('delay', value))
        break
      case 'transition-timing-function':
        add(EASE_CLASSES[value] ?? `ease-[${arbitrary(value)}]`)
        break
      case 'animation':
        add(`animate-[${arbitrary(value)}]`)
        break
      case 'margin':
      case 'box-sizing':
        break
      default:
        add(property.startsWith('--') ? `[${property}:${arbitrary(value)}]` : `[${property}:${arbitrary(value)}]`)
    }
  }
  return out
}
