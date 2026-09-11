import type { TextNode } from '@codeframe/scene'
import Konva from 'konva'

export type TextMetricsInput = Pick<
  TextNode,
  'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'lineHeight' | 'letterSpacing' | 'autoResize' | 'width' | 'height'
>

/** Konva's `fontStyle` carries both style and weight, e.g. "italic 600". */
export function konvaFontStyle(n: Pick<TextNode, 'italic' | 'fontWeight'>): string {
  return `${n.italic ? 'italic ' : ''}${n.fontWeight}`
}

export function cssFontStack(family: string): string {
  return `"${family}", ui-sans-serif, system-ui, sans-serif`
}

let probe: Konva.Text | null = null

/**
 * The text box the canvas will draw. Stored in the document so hit-testing,
 * selection and code export don't depend on the viewer's font rendering.
 */
export function measureText(n: TextMetricsInput): { width: number; height: number } {
  probe ??= new Konva.Text()
  const autoWidth = n.autoResize === 'width'
  probe.setAttrs({
    text: n.text.length ? n.text : ' ',
    fontFamily: n.fontFamily,
    fontSize: n.fontSize,
    fontStyle: konvaFontStyle(n),
    lineHeight: n.lineHeight,
    letterSpacing: n.letterSpacing,
    wrap: autoWidth ? 'none' : 'word',
    width: autoWidth ? undefined : Math.max(1, n.width),
    height: undefined,
    padding: 0,
  })
  return {
    width: autoWidth ? Math.ceil(probe.width()) : n.width,
    height: n.autoResize === 'none' ? n.height : Math.ceil(probe.height()),
  }
}
