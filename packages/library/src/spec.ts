import type { ComponentPropValue, NodePatch } from '@codeframe/scene'
import type { LibraryTheme } from './theme'

export type Props = Record<string, ComponentPropValue>

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  /** Multiplier of fontSize. */
  lineHeight: number
}

/**
 * Text metrics supplied by the host (the editor measures with the same canvas
 * text engine it draws with). With `maxWidth`, text wraps.
 */
export type MeasureText = (text: string, style: TextStyle, maxWidth?: number) => { width: number; height: number }

export type PropControl =
  | { kind: 'text'; label: string; multiline?: boolean }
  | { kind: 'select'; label: string; options: readonly { value: string; label: string }[] }
  | { kind: 'boolean'; label: string }
  | { kind: 'number'; label: string; min?: number; max?: number; step?: number; suffix?: string }

/** A drawn part of an instance: an ordinary scene node in the instance's local space. */
export type VirtualNode = NodePatch & { key: string; type: 'frame' | 'rect' | 'ellipse' | 'text' }

/**
 * How an instance draws: `root` styles the instance's own box (fill, stroke,
 * radius, shadow, hover), `children` sit inside it.
 */
export interface Drawing {
  root: NodePatch
  children: VirtualNode[]
}

export interface JsxContext {
  /** Layout and interaction classes for the instance's outermost element. */
  className: string
  /** Extra JSX attributes for the outermost element, e.g. an onClick. Starts with a space when present. */
  attributes: string
  /** Renders a string as JSX text (or an expression when it needs escaping). */
  text: (value: string) => string
  /** Renders a string as a JSX attribute value, quotes included. */
  attr: (value: string) => string
  /** A page-unique DOM id derived from a label. */
  uniqueId: (hint: string) => string
}

export type ResizeMode = 'both' | 'width' | 'none'

export interface ComponentSpec {
  /** e.g. `shadcn/button` */
  key: string
  name: string
  category: 'Actions' | 'Forms' | 'Display' | 'Feedback'
  description: string
  defaults: Props
  controls: Record<string, PropControl>
  /** Which box dimensions the designer controls; the rest follow the props. */
  resize: ResizeMode
  /** Natural size for these props. `width` is the current width for width-resizable components. */
  size(props: Props, theme: LibraryTheme, measure: MeasureText, width?: number): { width: number; height: number }
  draw(props: Props, theme: LibraryTheme, box: { width: number; height: number }, measure: MeasureText): Drawing
  jsx(props: Props, ctx: JsxContext): string
  /** Named imports per `@/components/ui/<file>`. */
  imports(props: Props): Record<string, string[]>
  /** shadcn registry items whose sources the export must include. */
  registry(props: Props): string[]
}
