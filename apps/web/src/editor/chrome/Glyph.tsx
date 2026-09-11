import type { LucideIcon } from 'lucide-react'

/** Lucide outlines, redrawn as drafted glyphs: 1.5px, square caps, miter joins. */
export function Glyph({ icon: Icon, size = 14, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      absoluteStrokeWidth
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      className={className}
    />
  )
}
