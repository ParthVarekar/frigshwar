import { useScene } from '../scene-context'
import { useUI } from '../ui-store'

/** The footer strip: where this draft lives, layer count, pointer position. */
export function Colophon() {
  const layers = useScene().nodes.size
  const selected = useUI((s) => s.selection.length)
  const pointer = useUI((s) => s.pointerWorld)

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-4 border-t border-ink bg-paper px-3 text-caption text-ink-2">
      <span className="font-display text-[12px] text-ink italic">Set in Codeframe</span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 bg-moss" aria-hidden />
        Local draft, saved in this browser
      </span>
      <span className="ml-auto font-mono">
        {layers} layers{selected ? ` · ${selected} selected` : ''}
      </span>
      <span className="w-28 text-right font-mono">
        {pointer ? `x ${Math.round(pointer.x)}  y ${Math.round(pointer.y)}` : '·'}
      </span>
    </footer>
  )
}
