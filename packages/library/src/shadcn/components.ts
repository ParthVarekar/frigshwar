/**
 * shadcn/ui (new-york, Tailwind v4) components as Codeframe specs. Metrics mirror
 * the vendored sources in registry.generated.ts: heights, paddings, radii and
 * type sizes are the Tailwind values those classes resolve to.
 */
import type { Color, Shadow } from '@codeframe/scene'
import type { ComponentSpec, Drawing, MeasureText, Props, TextStyle, VirtualNode } from '../spec'
import { radii, withAlpha, type LibraryTheme } from '../theme'

const SHADOW_XS: Shadow = { x: 0, y: 1, blur: 2, color: '#0000000D' }
const SHADOW_SM: Shadow = { x: 0, y: 1, blur: 3, color: '#0000001A' }
/** Tailwind's `transition-all` default: 150ms, ease-in-out. */
const HOVER_TIMING = { duration: 150, delay: 0, curve: { type: 'bezier', x1: 0.4, y1: 0, x2: 0.2, y2: 1 } } as const

// Tailwind v4 type scale: font-size / line-height pairs.
const TEXT_XS = { fontSize: 12, lineHeight: 16 / 12 }
const TEXT_SM = { fontSize: 14, lineHeight: 20 / 14 }
const TEXT_BASE = { fontSize: 16, lineHeight: 24 / 16 }

const str = (props: Props, key: string) => String(props[key] ?? '')
const bool = (props: Props, key: string) => props[key] === true
const num = (props: Props, key: string, fallback: number) => (typeof props[key] === 'number' ? (props[key] as number) : fallback)

function style(theme: LibraryTheme, scale: { fontSize: number; lineHeight: number }, fontWeight = 400): TextStyle {
  return { fontFamily: theme.font, fontSize: scale.fontSize, lineHeight: scale.lineHeight, fontWeight }
}

function text(
  key: string,
  value: string,
  s: TextStyle,
  fill: Color,
  box: { x: number; y: number; width: number; height: number },
  extra: Partial<VirtualNode> = {},
): VirtualNode {
  return { key, type: 'text', text: value, fill, autoResize: 'none', textAlign: 'left', ...s, ...box, ...extra }
}

/** A stroke segment drawn as a thin rotated rect (the model has no paths). */
function segment(key: string, x1: number, y1: number, x2: number, y2: number, thickness: number, fill: Color): VirtualNode {
  const length = Math.hypot(x2 - x1, y2 - y1)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  return {
    key,
    type: 'rect',
    x: x1 + (thickness / 2) * Math.sin(angle),
    y: y1 - (thickness / 2) * Math.cos(angle),
    width: length,
    height: thickness,
    rotation: (angle * 180) / Math.PI,
    fill,
    cornerRadius: thickness / 2,
  }
}

const ceil = (n: number) => Math.ceil(n - 1e-6)
const jsxProp = (name: string, value: string, fallback: string) => (value && value !== fallback ? ` ${name}="${value}"` : '')

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const BUTTON_SIZES = {
  xs: { height: 24, padding: 8, text: TEXT_XS },
  sm: { height: 32, padding: 12, text: TEXT_SM },
  default: { height: 36, padding: 16, text: TEXT_SM },
  lg: { height: 40, padding: 24, text: TEXT_SM },
} as const

function buttonPaint(variant: string, t: LibraryTheme) {
  switch (variant) {
    case 'secondary':
      return { fill: t.secondary, color: t.secondaryForeground, stroke: null, shadow: null, hover: withAlpha(t.secondary, 0.8) }
    case 'destructive':
      return { fill: t.destructive, color: '#FFFFFF', stroke: null, shadow: null, hover: withAlpha(t.destructive, 0.9) }
    case 'outline':
      return { fill: t.background, color: t.foreground, stroke: t.border, shadow: SHADOW_XS, hover: t.accent }
    case 'ghost':
      return { fill: null, color: t.foreground, stroke: null, shadow: null, hover: t.accent }
    case 'link':
      return { fill: null, color: t.primary, stroke: null, shadow: null, hover: null }
    default:
      return { fill: t.primary, color: t.primaryForeground, stroke: null, shadow: null, hover: withAlpha(t.primary, 0.9) }
  }
}

function buttonSize(props: Props) {
  return BUTTON_SIZES[str(props, 'size') as keyof typeof BUTTON_SIZES] ?? BUTTON_SIZES.default
}

/** Shared by Button and Card's footer action. */
function drawButton(
  key: string,
  label: string,
  variant: string,
  size: (typeof BUTTON_SIZES)[keyof typeof BUTTON_SIZES],
  t: LibraryTheme,
  box: { x: number; y: number; width: number },
): VirtualNode[] {
  const paint = buttonPaint(variant, t)
  const lineBox = size.text.fontSize * size.text.lineHeight
  return [
    {
      key: `${key}-bg`,
      type: 'rect',
      ...box,
      height: size.height,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: 1,
      cornerRadius: radii(t).md,
      shadow: paint.shadow,
    },
    text(key, label, style(t, size.text, 500), paint.color, { x: box.x, y: box.y + (size.height - lineBox) / 2, width: box.width, height: lineBox }, { textAlign: 'center' }),
  ]
}

const button: ComponentSpec = {
  key: 'shadcn/button',
  name: 'Button',
  category: 'Actions',
  description: 'Primary, secondary, outline, ghost and link actions.',
  defaults: { label: 'Button', variant: 'default', size: 'default' },
  controls: {
    label: { kind: 'text', label: 'Label' },
    variant: {
      kind: 'select',
      label: 'Variant',
      options: ['default', 'secondary', 'outline', 'destructive', 'ghost', 'link'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
    },
    size: { kind: 'select', label: 'Size', options: ['xs', 'sm', 'default', 'lg'].map((v) => ({ value: v, label: v === 'default' ? 'Default' : v.toUpperCase() })) },
  },
  resize: 'width',
  size(props, t, measure) {
    const s = buttonSize(props)
    return { width: ceil(measure(str(props, 'label'), style(t, s.text, 500)).width + s.padding * 2), height: s.height }
  },
  draw(props, t, box): Drawing {
    const s = buttonSize(props)
    const paint = buttonPaint(str(props, 'variant'), t)
    const lineBox = s.text.fontSize * s.text.lineHeight
    return {
      root: {
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: 1,
        cornerRadius: radii(t).md,
        shadow: paint.shadow,
        hover: paint.hover ? { fill: paint.hover } : null,
        transition: HOVER_TIMING,
      },
      children: [
        text('label', str(props, 'label'), style(t, s.text, 500), paint.color, { x: 0, y: (box.height - lineBox) / 2, width: box.width, height: lineBox }, { textAlign: 'center' }),
      ],
    }
  },
  jsx(props, ctx) {
    return `<Button${jsxProp('variant', str(props, 'variant'), 'default')}${jsxProp('size', str(props, 'size'), 'default')} className=${ctx.attr(ctx.className)}${ctx.attributes}>${ctx.text(str(props, 'label'))}</Button>`
  },
  imports: () => ({ button: ['Button'] }),
  registry: () => ['button'],
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

function badgePaint(variant: string, t: LibraryTheme) {
  switch (variant) {
    case 'secondary':
      return { fill: t.secondary, color: t.secondaryForeground, stroke: null }
    case 'destructive':
      return { fill: t.destructive, color: '#FFFFFF', stroke: null }
    case 'outline':
      return { fill: null, color: t.foreground, stroke: t.border }
    default:
      return { fill: t.primary, color: t.primaryForeground, stroke: null }
  }
}

const badge: ComponentSpec = {
  key: 'shadcn/badge',
  name: 'Badge',
  category: 'Display',
  description: 'Small status or category label.',
  defaults: { label: 'Badge', variant: 'default' },
  controls: {
    label: { kind: 'text', label: 'Label' },
    variant: { kind: 'select', label: 'Variant', options: ['default', 'secondary', 'destructive', 'outline'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
  },
  resize: 'none',
  size(props, t, measure) {
    // px-2 + 1px border each side; text-xs line box + py-0.5 + border.
    return { width: ceil(measure(str(props, 'label'), style(t, TEXT_XS, 500)).width + 18), height: 22 }
  },
  draw(props, t, box) {
    const paint = badgePaint(str(props, 'variant'), t)
    return {
      root: { fill: paint.fill, stroke: paint.stroke, strokeWidth: 1, cornerRadius: box.height / 2 },
      children: [text('label', str(props, 'label'), style(t, TEXT_XS, 500), paint.color, { x: 0, y: 3, width: box.width, height: 16 }, { textAlign: 'center' })],
    }
  },
  jsx(props, ctx) {
    return `<Badge${jsxProp('variant', str(props, 'variant'), 'default')} className=${ctx.attr(ctx.className)}${ctx.attributes}>${ctx.text(str(props, 'label'))}</Badge>`
  },
  imports: () => ({ badge: ['Badge'] }),
  registry: () => ['badge'],
}

// ---------------------------------------------------------------------------
// Input & Textarea
// ---------------------------------------------------------------------------

function fieldRoot(t: LibraryTheme) {
  return { fill: null, stroke: t.input, strokeWidth: 1, cornerRadius: radii(t).md, shadow: SHADOW_XS }
}

function shownValue(props: Props) {
  const value = str(props, 'value')
  return value && str(props, 'type') === 'password' ? '•'.repeat(value.length) : value
}

const input: ComponentSpec = {
  key: 'shadcn/input',
  name: 'Input',
  category: 'Forms',
  description: 'Single-line text field.',
  defaults: { placeholder: 'Email', value: '', type: 'email' },
  controls: {
    placeholder: { kind: 'text', label: 'Placeholder' },
    value: { kind: 'text', label: 'Value' },
    type: { kind: 'select', label: 'Type', options: ['text', 'email', 'password', 'number', 'search'].map((v) => ({ value: v, label: v })) },
  },
  resize: 'width',
  size: (_props, _t, _m, width) => ({ width: width ?? 280, height: 36 }),
  draw(props, t, box) {
    const value = shownValue(props)
    return {
      root: fieldRoot(t),
      children: [
        text('value', value || str(props, 'placeholder'), style(t, TEXT_SM), value ? t.foreground : t.mutedForeground, { x: 12, y: 8, width: Math.max(0, box.width - 24), height: 20 }, { autoResize: 'none' }),
      ],
    }
  },
  jsx(props, ctx) {
    const type = str(props, 'type')
    const value = str(props, 'value')
    return `<Input${type && type !== 'text' ? ` type="${type}"` : ''}${props.placeholder ? ` placeholder=${ctx.attr(str(props, 'placeholder'))}` : ''}${value ? ` defaultValue=${ctx.attr(value)}` : ''} className=${ctx.attr(ctx.className)}${ctx.attributes} />`
  },
  imports: () => ({ input: ['Input'] }),
  registry: () => ['input'],
}

const textarea: ComponentSpec = {
  key: 'shadcn/textarea',
  name: 'Textarea',
  category: 'Forms',
  description: 'Multi-line text field.',
  defaults: { placeholder: 'Type your message here.', value: '' },
  controls: {
    placeholder: { kind: 'text', label: 'Placeholder' },
    value: { kind: 'text', label: 'Value', multiline: true },
  },
  resize: 'both',
  size: (_p, _t, _m, width) => ({ width: width ?? 320, height: 96 }),
  draw(props, t, box) {
    const value = str(props, 'value')
    return {
      root: fieldRoot(t),
      children: [
        text('value', value || str(props, 'placeholder'), style(t, TEXT_SM), value ? t.foreground : t.mutedForeground, {
          x: 12,
          y: 8,
          width: Math.max(0, box.width - 24),
          height: Math.max(0, box.height - 16),
        }),
      ],
    }
  },
  jsx(props, ctx) {
    const value = str(props, 'value')
    return `<Textarea${props.placeholder ? ` placeholder=${ctx.attr(str(props, 'placeholder'))}` : ''}${value ? ` defaultValue=${ctx.attr(value)}` : ''} className=${ctx.attr(ctx.className)}${ctx.attributes} />`
  },
  imports: () => ({ textarea: ['Textarea'] }),
  registry: () => ['textarea'],
}

// ---------------------------------------------------------------------------
// Checkbox, Switch, Label
// ---------------------------------------------------------------------------

const LABEL_STYLE = (t: LibraryTheme): TextStyle => ({ ...style(t, { fontSize: 14, lineHeight: 1 }, 500) })

function labelledSize(control: { width: number; height: number }, props: Props, t: LibraryTheme, measure: MeasureText) {
  const label = str(props, 'label')
  return {
    width: ceil(control.width + (label ? 8 + measure(label, LABEL_STYLE(t)).width : 0)),
    height: control.height,
  }
}

function labelledJsx(control: string, props: Props, ctx: Parameters<ComponentSpec['jsx']>[1]) {
  const label = str(props, 'label')
  const checked = bool(props, 'checked') ? ' defaultChecked' : ''
  if (!label) return `<${control}${checked} className=${ctx.attr(ctx.className)}${ctx.attributes} />`
  const id = ctx.uniqueId(label)
  return `<div className=${ctx.attr(`${ctx.className} flex items-center gap-2`)}${ctx.attributes}><${control} id="${id}"${checked} /><Label htmlFor="${id}">${ctx.text(label)}</Label></div>`
}

const checkbox: ComponentSpec = {
  key: 'shadcn/checkbox',
  name: 'Checkbox',
  category: 'Forms',
  description: 'Checkbox with an optional label.',
  defaults: { label: 'Accept terms and conditions', checked: true },
  controls: { label: { kind: 'text', label: 'Label' }, checked: { kind: 'boolean', label: 'Checked' } },
  resize: 'none',
  size: (props, t, measure) => labelledSize({ width: 16, height: 16 }, props, t, measure),
  draw(props, t, box) {
    const checked = bool(props, 'checked')
    const children: VirtualNode[] = [
      { key: 'box', type: 'rect', x: 0, y: 0, width: 16, height: 16, cornerRadius: 4, fill: checked ? t.primary : null, stroke: checked ? t.primary : t.input, strokeWidth: 1, shadow: SHADOW_XS },
    ]
    if (checked) {
      // lucide CheckIcon ("M20 6 9 17l-5-5") at size-3.5, centered in the box.
      const k = 14 / 24
      const p = (x: number, y: number) => [1 + x * k, 1 + y * k] as const
      const [ax, ay] = p(4, 12)
      const [bx, by] = p(9, 17)
      const [cx, cy] = p(20, 6)
      children.push(segment('check-short', ax, ay, bx, by, 2 * k, t.primaryForeground), segment('check-long', bx, by, cx, cy, 2 * k, t.primaryForeground))
    }
    const label = str(props, 'label')
    if (label) children.push(text('label', label, LABEL_STYLE(t), t.foreground, { x: 24, y: 1, width: Math.max(0, box.width - 24), height: 14 }))
    return { root: { fill: null }, children }
  },
  jsx: (props, ctx) => labelledJsx('Checkbox', props, ctx),
  imports: (props): Record<string, string[]> => (str(props, 'label') ? { checkbox: ['Checkbox'], label: ['Label'] } : { checkbox: ['Checkbox'] }),
  registry: (props) => (str(props, 'label') ? ['checkbox', 'label'] : ['checkbox']),
}

const SWITCH_HEIGHT = 18.4 // h-[1.15rem]

const switchSpec: ComponentSpec = {
  key: 'shadcn/switch',
  name: 'Switch',
  category: 'Forms',
  description: 'On/off toggle with an optional label.',
  defaults: { label: 'Airplane mode', checked: true },
  controls: { label: { kind: 'text', label: 'Label' }, checked: { kind: 'boolean', label: 'On' } },
  resize: 'none',
  size: (props, t, measure) => labelledSize({ width: 32, height: SWITCH_HEIGHT }, props, t, measure),
  draw(props, t, box) {
    const checked = bool(props, 'checked')
    const children: VirtualNode[] = [
      { key: 'track', type: 'rect', x: 0, y: 0, width: 32, height: SWITCH_HEIGHT, cornerRadius: SWITCH_HEIGHT / 2, fill: checked ? t.primary : t.input, shadow: SHADOW_XS },
      // size-4 thumb inside a 1px transparent border; checked moves it by 100% − 2px.
      { key: 'thumb', type: 'ellipse', x: checked ? 15 : 1, y: (SWITCH_HEIGHT - 16) / 2, width: 16, height: 16, fill: t.background },
    ]
    const label = str(props, 'label')
    if (label) children.push(text('label', label, LABEL_STYLE(t), t.foreground, { x: 40, y: (SWITCH_HEIGHT - 14) / 2, width: Math.max(0, box.width - 40), height: 14 }))
    return { root: { fill: null }, children }
  },
  jsx: (props, ctx) => labelledJsx('Switch', props, ctx),
  imports: (props): Record<string, string[]> => (str(props, 'label') ? { switch: ['Switch'], label: ['Label'] } : { switch: ['Switch'] }),
  registry: (props) => (str(props, 'label') ? ['switch', 'label'] : ['switch']),
}

const label: ComponentSpec = {
  key: 'shadcn/label',
  name: 'Label',
  category: 'Forms',
  description: 'Form label.',
  defaults: { text: 'Email address' },
  controls: { text: { kind: 'text', label: 'Text' } },
  resize: 'none',
  size: (props, t, measure) => ({ width: ceil(measure(str(props, 'text'), LABEL_STYLE(t)).width), height: 14 }),
  draw: (props, t, box) => ({
    root: { fill: null },
    children: [text('text', str(props, 'text'), LABEL_STYLE(t), t.foreground, { x: 0, y: 0, width: box.width, height: 14 })],
  }),
  jsx: (props, ctx) => `<Label className=${ctx.attr(ctx.className)}${ctx.attributes}>${ctx.text(str(props, 'text'))}</Label>`,
  imports: () => ({ label: ['Label'] }),
  registry: () => ['label'],
}

// ---------------------------------------------------------------------------
// Avatar, Progress, Separator
// ---------------------------------------------------------------------------

const AVATAR_SIZES = { sm: 24, default: 32, lg: 40 } as const

const avatar: ComponentSpec = {
  key: 'shadcn/avatar',
  name: 'Avatar',
  category: 'Display',
  description: 'Round avatar with initials fallback.',
  defaults: { initials: 'CN', size: 'default' },
  controls: {
    initials: { kind: 'text', label: 'Initials' },
    size: { kind: 'select', label: 'Size', options: [{ value: 'sm', label: 'SM' }, { value: 'default', label: 'Default' }, { value: 'lg', label: 'LG' }] },
  },
  resize: 'none',
  size(props) {
    const d = AVATAR_SIZES[str(props, 'size') as keyof typeof AVATAR_SIZES] ?? 32
    return { width: d, height: d }
  },
  draw(props, t, box) {
    const small = str(props, 'size') === 'sm'
    const scale = small ? TEXT_XS : TEXT_SM
    const lineBox = scale.fontSize * scale.lineHeight
    return {
      root: { fill: t.muted, cornerRadius: box.width / 2, clip: true },
      children: [text('initials', str(props, 'initials'), style(t, scale), t.mutedForeground, { x: 0, y: (box.height - lineBox) / 2, width: box.width, height: lineBox }, { textAlign: 'center' })],
    }
  },
  jsx: (props, ctx) =>
    `<Avatar${jsxProp('size', str(props, 'size'), 'default')} className=${ctx.attr(ctx.className)}${ctx.attributes}><AvatarFallback>${ctx.text(str(props, 'initials'))}</AvatarFallback></Avatar>`,
  imports: () => ({ avatar: ['Avatar', 'AvatarFallback'] }),
  registry: () => ['avatar'],
}

const progress: ComponentSpec = {
  key: 'shadcn/progress',
  name: 'Progress',
  category: 'Feedback',
  description: 'Horizontal progress bar.',
  defaults: { value: 60 },
  controls: { value: { kind: 'number', label: 'Value', min: 0, max: 100, step: 1, suffix: '%' } },
  resize: 'width',
  size: (_p, _t, _m, width) => ({ width: width ?? 280, height: 8 }),
  draw(props, t, box) {
    const value = Math.min(100, Math.max(0, num(props, 'value', 0)))
    return {
      root: { fill: withAlpha(t.primary, 0.2), cornerRadius: box.height / 2, clip: true },
      children: [{ key: 'indicator', type: 'rect', x: 0, y: 0, width: (box.width * value) / 100, height: box.height, fill: t.primary }],
    }
  },
  jsx: (props, ctx) => `<Progress value={${Math.min(100, Math.max(0, num(props, 'value', 0)))}} className=${ctx.attr(ctx.className)}${ctx.attributes} />`,
  imports: () => ({ progress: ['Progress'] }),
  registry: () => ['progress'],
}

const separator: ComponentSpec = {
  key: 'shadcn/separator',
  name: 'Separator',
  category: 'Display',
  description: 'Hairline divider.',
  defaults: {},
  controls: {},
  resize: 'width',
  size: (_p, _t, _m, width) => ({ width: width ?? 280, height: 1 }),
  draw: (_p, t) => ({ root: { fill: t.border }, children: [] }),
  jsx: (_p, ctx) => `<Separator className=${ctx.attr(ctx.className)}${ctx.attributes} />`,
  imports: () => ({ separator: ['Separator'] }),
  registry: () => ['separator'],
}

// ---------------------------------------------------------------------------
// Alert & Card (content-sized)
// ---------------------------------------------------------------------------

function alertLayout(props: Props, t: LibraryTheme, measure: MeasureText, width: number) {
  const inner = Math.max(0, width - 34) // px-4 + 1px border each side
  const description = str(props, 'description')
  const descHeight = description ? measure(description, style(t, TEXT_SM), inner).height : 0
  return { inner, descHeight, height: ceil(1 + 12 + 20 + (description ? 2 + descHeight : 0) + 12 + 1) }
}

const alert: ComponentSpec = {
  key: 'shadcn/alert',
  name: 'Alert',
  category: 'Feedback',
  description: 'Callout with a title and description.',
  defaults: { title: 'Heads up!', description: 'You can add components and dependencies to your app using the CLI.', variant: 'default' },
  controls: {
    title: { kind: 'text', label: 'Title' },
    description: { kind: 'text', label: 'Description', multiline: true },
    variant: { kind: 'select', label: 'Variant', options: [{ value: 'default', label: 'Default' }, { value: 'destructive', label: 'Destructive' }] },
  },
  resize: 'width',
  size: (props, t, measure, width = 420) => ({ width, height: alertLayout(props, t, measure, width).height }),
  draw(props, t, box, measure) {
    const destructive = str(props, 'variant') === 'destructive'
    const { inner, descHeight } = alertLayout(props, t, measure, box.width)
    const children: VirtualNode[] = [
      text('title', str(props, 'title'), style(t, TEXT_SM, 500), destructive ? t.destructive : t.cardForeground, { x: 17, y: 13, width: inner, height: 20 }, { letterSpacing: -0.35 }),
    ]
    const description = str(props, 'description')
    if (description) {
      children.push(text('description', description, style(t, TEXT_SM), destructive ? withAlpha(t.destructive, 0.9) : t.mutedForeground, { x: 17, y: 35, width: inner, height: descHeight }))
    }
    return { root: { fill: t.card, stroke: t.border, strokeWidth: 1, cornerRadius: radii(t).lg }, children }
  },
  jsx(props, ctx) {
    const description = str(props, 'description')
    return `<Alert${jsxProp('variant', str(props, 'variant'), 'default')} className=${ctx.attr(ctx.className)}${ctx.attributes}><AlertTitle>${ctx.text(str(props, 'title'))}</AlertTitle>${description ? `<AlertDescription>${ctx.text(description)}</AlertDescription>` : ''}</Alert>`
  },
  imports: (props) => ({ alert: str(props, 'description') ? ['Alert', 'AlertTitle', 'AlertDescription'] : ['Alert', 'AlertTitle'] }),
  registry: () => ['alert'],
}

function cardLayout(props: Props, t: LibraryTheme, measure: MeasureText, width: number) {
  const inner = Math.max(0, width - 50) // px-6 + 1px border each side
  const description = str(props, 'description')
  const content = str(props, 'content')
  const action = str(props, 'action')
  const descHeight = description ? measure(description, style(t, TEXT_SM), inner).height : 0
  const contentHeight = content ? measure(content, style(t, TEXT_BASE), inner).height : 0
  const titleY = 25
  const descY = titleY + 16 + 8
  // The header grid keeps its row gap even when the description is empty.
  const headerBottom = descY + descHeight
  const contentY = headerBottom + 24
  const footerY = (content ? contentY + contentHeight : headerBottom) + 24
  const bottom = action ? footerY + 36 : content ? contentY + contentHeight : headerBottom
  return { inner, descY, descHeight, contentY, contentHeight, footerY, height: ceil(bottom + 25) }
}

const card: ComponentSpec = {
  key: 'shadcn/card',
  name: 'Card',
  category: 'Display',
  description: 'Title, description, body and an optional action.',
  defaults: {
    title: 'Create project',
    description: 'Deploy your new project in one click.',
    content: 'Your project will be set up with sensible defaults you can change later.',
    action: 'Deploy',
  },
  controls: {
    title: { kind: 'text', label: 'Title' },
    description: { kind: 'text', label: 'Description' },
    content: { kind: 'text', label: 'Content', multiline: true },
    action: { kind: 'text', label: 'Action label' },
  },
  resize: 'width',
  size: (props, t, measure, width = 360) => ({ width, height: cardLayout(props, t, measure, width).height }),
  draw(props, t, box, measure) {
    const layout = cardLayout(props, t, measure, box.width)
    const children: VirtualNode[] = [text('title', str(props, 'title'), style(t, { fontSize: 16, lineHeight: 1 }, 600), t.cardForeground, { x: 25, y: 25, width: layout.inner, height: 16 })]
    const description = str(props, 'description')
    if (description) children.push(text('description', description, style(t, TEXT_SM), t.mutedForeground, { x: 25, y: layout.descY, width: layout.inner, height: layout.descHeight }))
    const content = str(props, 'content')
    if (content) children.push(text('content', content, style(t, TEXT_BASE), t.cardForeground, { x: 25, y: layout.contentY, width: layout.inner, height: layout.contentHeight }))
    const action = str(props, 'action')
    if (action) {
      const s = BUTTON_SIZES.default
      const width = ceil(measure(action, style(t, s.text, 500)).width + s.padding * 2)
      children.push(...drawButton('action', action, 'default', s, t, { x: 25, y: layout.footerY, width }))
    }
    return { root: { fill: t.card, stroke: t.border, strokeWidth: 1, cornerRadius: radii(t).xl, shadow: SHADOW_SM, clip: true }, children }
  },
  jsx(props, ctx) {
    const description = str(props, 'description')
    const content = str(props, 'content')
    const action = str(props, 'action')
    return [
      `<Card className=${ctx.attr(ctx.className)}${ctx.attributes}>`,
      `<CardHeader><CardTitle>${ctx.text(str(props, 'title'))}</CardTitle>${description ? `<CardDescription>${ctx.text(description)}</CardDescription>` : ''}</CardHeader>`,
      content ? `<CardContent><p>${ctx.text(content)}</p></CardContent>` : '',
      action ? `<CardFooter><Button>${ctx.text(action)}</Button></CardFooter>` : '',
      '</Card>',
    ].join('')
  },
  imports(props): Record<string, string[]> {
    const names = ['Card', 'CardHeader', 'CardTitle']
    if (str(props, 'description')) names.push('CardDescription')
    if (str(props, 'content')) names.push('CardContent')
    if (str(props, 'action')) names.push('CardFooter')
    return str(props, 'action') ? { card: names, button: ['Button'] } : { card: names }
  },
  registry: (props) => (str(props, 'action') ? ['card', 'button'] : ['card']),
}

export const SHADCN_COMPONENTS: readonly ComponentSpec[] = [
  button,
  badge,
  input,
  textarea,
  checkbox,
  switchSpec,
  label,
  avatar,
  card,
  alert,
  progress,
  separator,
]
