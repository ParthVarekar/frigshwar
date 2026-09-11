import { exportProject, type ExportedProject, type Formatter, type ProjectFile } from '@codeframe/codegen'
import { strToU8, zipSync } from 'fflate'
import { Check, Copy, Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IconButton } from '../chrome/fields'
import { Glyph } from '../chrome/Glyph'
import { readTheme } from '../library'
import { useSceneStore } from '../scene-context'
import { useUI } from '../ui-store'

/**
 * Export: the whole canvas as a Vite + React + Tailwind project. Every frame is
 * a page, prototype links are navigation, library components are shadcn/ui.
 */
export function ExportDialog() {
  const open = useUI((s) => s.exportOpen)
  return open ? <Export /> : null
}

/** Prettier runs in the browser, loaded only when someone exports. */
async function loadFormatter(): Promise<Formatter> {
  const [prettier, babel, estree, postcss] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/postcss'),
  ])
  const plugins = [babel, estree, postcss]
  return async (source, parser) => {
    try {
      return await prettier.format(source, { parser, plugins, semi: false, singleQuote: true, printWidth: 100, trailingComma: 'all' })
    } catch {
      return source
    }
  }
}

function isText(file: ProjectFile): file is ProjectFile & { contents: string } {
  return typeof file.contents === 'string'
}

function download(project: ExportedProject) {
  const entries: Record<string, Uint8Array> = {}
  for (const f of project.files) {
    entries[`${project.name}/${f.path}`] = typeof f.contents === 'string' ? strToU8(f.contents) : f.contents
  }
  const blob = new Blob([zipSync(entries, { level: 6 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.name}.zip`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function Export() {
  const store = useSceneStore()
  const [project, setProject] = useState<ExportedProject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const close = () => useUI.getState().setExportOpen(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const format = await loadFormatter()
        const title = String(store.meta.get('title') || 'Codeframe site')
        const result = await exportProject({ snapshot: store.getSnapshot(), title, theme: readTheme(store) }, format)
        if (cancelled) return
        setProject(result)
        setSelected(result.pages[0]?.file ?? result.files[0]?.path ?? null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      useUI.getState().setExportOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const file = project?.files.find((f) => f.path === selected)
  const directories = useMemo(() => {
    const groups = new Map<string, ProjectFile[]>()
    for (const f of project?.files ?? []) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      groups.set(dir, [...(groups.get(dir) ?? []), f])
    }
    return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  }, [project])

  const copyFile = async () => {
    if (!file || !isText(file)) return
    await navigator.clipboard.writeText(file.contents)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-6" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Export site code" className="flex h-[min(780px,92vh)] w-[min(1180px,96vw)] animate-print-in flex-col border border-ink bg-paper shadow-press">
        <header className="rule-double flex h-14 shrink-0 items-center gap-4 px-4">
          <span className="font-display text-mark leading-none font-semibold italic" style={{ fontVariationSettings: '"opsz" 72' }}>
            Export
          </span>
          <span className="truncate text-ui text-ink-2">
            {project
              ? `${project.pages.length} ${project.pages.length === 1 ? 'page' : 'pages'} · ${project.files.length} files · Vite + React + Tailwind`
              : error
                ? 'Nothing to export'
                : 'Setting the code…'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!file || !isText(file)}
              onClick={copyFile}
              className="flex h-8 items-center gap-1.5 border border-ink px-2.5 text-ui transition-colors hover:bg-paper-sunk disabled:border-rule disabled:text-ink-3"
            >
              <Glyph icon={copied ? Check : Copy} size={13} />
              {copied ? 'Copied' : 'Copy file'}
            </button>
            <button
              type="button"
              disabled={!project}
              onClick={() => project && download(project)}
              className="flex h-8 items-center gap-1.5 bg-ink px-3 text-ui text-paper transition-colors hover:bg-ink-2 disabled:bg-ink-3"
            >
              <Glyph icon={Download} size={13} />
              Download .zip
            </button>
            <IconButton size="md" label="Close (Esc)" onClick={close}>
              <Glyph icon={X} size={16} />
            </IconButton>
          </div>
        </header>

        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-title italic">{error}</p>
            <p className="text-ink-2">Each canvas-level frame becomes a page of the site.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <nav aria-label="Files" className="w-72 shrink-0 overflow-y-auto border-r border-ink py-2">
              {directories.map(([dir, files]) => (
                <div key={dir || '.'} className="mb-2">
                  {dir && <div className="px-3 py-1 font-mono text-caption text-ink-3">{dir}/</div>}
                  {files.map((f) => {
                    const name = f.path.slice(f.path.lastIndexOf('/') + 1)
                    const active = f.path === selected
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => setSelected(f.path)}
                        className={`block w-full truncate py-0.5 pr-3 text-left font-mono text-data ${dir ? 'pl-6' : 'pl-3'} ${
                          active ? 'bg-ink text-paper' : 'hover:bg-paper-sunk'
                        }`}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-9 shrink-0 items-center border-b border-rule px-4 font-mono text-data text-ink-2">{selected ?? ''}</div>
              <div className="min-h-0 flex-1 overflow-auto bg-paper-raised">
                {file && isText(file) ? (
                  <pre className="py-3 font-mono text-[12px] leading-5 text-ink">
                    {file.contents.split('\n').map((line, i) => (
                      <div key={i} className="flex">
                        <span className="w-12 shrink-0 pr-4 text-right text-ink-3 select-none">{i + 1}</span>
                        <code className="whitespace-pre">{line || ' '}</code>
                      </div>
                    ))}
                  </pre>
                ) : file ? (
                  <p className="p-4 font-mono text-data text-ink-2">Binary file · {Math.ceil(file.contents.length / 1024)} KB</p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-ink px-4 text-caption text-ink-2">
          Unzip, then run <code className="font-mono text-ink">npm install &amp;&amp; npm run dev</code>
        </footer>
      </div>
    </div>
  )
}
