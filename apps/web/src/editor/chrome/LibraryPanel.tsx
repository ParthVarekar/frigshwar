import { COMPONENTS, LIBRARY_NAME, type ComponentSpec, type LibraryTheme } from '@codeframe/library'
import { buildSnapshot, NODE_DEFAULTS, type ComponentNode } from '@codeframe/scene'
import { memo, useMemo } from 'react'
import { CONTENT_FONTS } from '../../fonts'
import { COMPONENT_MIME, insertComponent, measureLibraryText, updateTheme, useLibraryTheme } from '../library'
import { DomTree } from '../preview/dom'
import { treeStylesheet } from '../preview/styles'
import { useSceneStore } from '../scene-context'
import { ColorField, NumberField, SelectField } from './fields'

const CATEGORIES: ComponentSpec['category'][] = ['Actions', 'Forms', 'Display', 'Feedback']

const TILE = { width: 104, height: 52 }

/**
 * The component library: shadcn/ui components drawn live with the document's
 * theme. Click a tile to place it in view, or drag it onto a frame.
 */
export function LibraryPanel() {
  const store = useSceneStore()
  const theme = useLibraryTheme(store)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <section className="border-b border-rule px-3 pt-2.5 pb-3">
        <header className="mb-1 flex h-6 items-center justify-between">
          <h3 className="section-head">Theme</h3>
          <span className="smallcaps text-ink-3">{LIBRARY_NAME}</span>
        </header>
        <ColorField label="Primary" value={theme.primary} onChange={(primary) => updateTheme(store, { primary })} />
        <div className="grid grid-cols-[72px_1fr] gap-x-3">
          <NumberField label="R" title="Corner radius (--radius)" min={0} max={40} value={theme.radius} onChange={(radius) => updateTheme(store, { radius })} />
          <SelectField
            label="Font"
            value={theme.font}
            options={Object.keys(CONTENT_FONTS).map((f) => ({ value: f, label: f }))}
            onChange={(font) => updateTheme(store, { font })}
          />
        </div>
        <p className="mt-2 text-caption leading-snug text-ink-2">Exports as real shadcn/ui components, themed with these tokens.</p>
      </section>

      {CATEGORIES.map((category) => (
        <section key={category} className="px-3 pt-3">
          <h4 className="smallcaps mb-1.5 text-ink-3">{category}</h4>
          <div className="grid grid-cols-2 gap-2">
            {COMPONENTS.filter((spec) => spec.category === category).map((spec) => (
              <LibraryTile key={spec.key} spec={spec} theme={theme} onInsert={() => insertComponent(store, spec.key)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const LibraryTile = memo(function LibraryTile(props: { spec: ComponentSpec; theme: LibraryTheme; onInsert: () => void }) {
  const { spec, theme } = props
  const preview = useMemo(() => {
    const size = spec.size(spec.defaults, theme, measureLibraryText)
    const id = `library-${spec.key.replace(/\W+/g, '-')}`
    const node = {
      ...NODE_DEFAULTS.component,
      id,
      name: spec.name,
      parentId: null,
      index: 'a0',
      component: spec.key,
      props: spec.defaults,
      ...size,
    } as ComponentNode
    const snap = buildSnapshot(new Map([[id, node]]), new Map())
    return { id, snap, size, css: treeStylesheet(snap, id, theme) }
  }, [spec, theme])
  const scale = Math.min(1, TILE.width / preview.size.width, TILE.height / preview.size.height)

  return (
    <>
      <style>{preview.css}</style>
      <button
        type="button"
        draggable
        title={`${spec.name}: ${spec.description} Click to place, or drag onto the canvas.`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={props.onInsert}
        onDragStart={(e) => {
          e.dataTransfer.setData(COMPONENT_MIME, spec.key)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        className="group flex flex-col border border-rule bg-paper-raised text-left transition-colors hover:border-ink"
      >
        <span aria-hidden className="pointer-events-none flex h-[68px] items-center justify-center overflow-hidden bg-white">
          <span
            className="relative block flex-none"
            style={{ width: preview.size.width, height: preview.size.height, scale: String(scale) }}
          >
            <DomTree snap={preview.snap} id={preview.id} theme={theme} />
          </span>
        </span>
        <span className="border-t border-rule px-2 py-1 text-caption group-hover:border-ink">{spec.name}</span>
      </button>
    </>
  )
})
