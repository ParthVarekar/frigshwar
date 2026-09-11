import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { openLocalDocument } from './editor/document'
import { useUI } from './editor/ui-store'
import { loadFonts } from './fonts'
import './index.css'

const root = createRoot(document.getElementById('root')!)

root.render(
  <div className="flex h-full items-center justify-center bg-paper">
    <p className="font-display text-title text-ink-2 italic">Setting type…</p>
  </div>,
)

// Fonts first: text boxes are measured on a canvas and must use the real faces.
await loadFonts()
const { store } = await openLocalDocument()

if (import.meta.env.DEV) Object.assign(window, { codeframe: { store, ui: useUI } })

root.render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)
