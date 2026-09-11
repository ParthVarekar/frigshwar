import type { SceneStore } from '@codeframe/scene'
import { useEffect } from 'react'
import { Canvas } from './editor/canvas/Canvas'
import { Colophon } from './editor/chrome/Colophon'
import { ContextMenu } from './editor/chrome/ContextMenu'
import { LayersPanel } from './editor/chrome/LayersPanel'
import { Masthead } from './editor/chrome/Masthead'
import { PropertiesPanel } from './editor/chrome/PropertiesPanel'
import { pruneSelection } from './editor/commands'
import { ExportDialog } from './editor/export/ExportDialog'
import { PreviewOverlay } from './editor/preview/PreviewOverlay'
import { SceneStoreProvider } from './editor/scene-context'
import { useShortcuts } from './editor/shortcuts'
import { TimelinePanel } from './editor/timeline/TimelinePanel'

export function App({ store }: { store: SceneStore }) {
  useShortcuts(store)

  // Any change (undo, or later a collaborator's delete) can remove selected nodes.
  useEffect(() => {
    const unsubscribe = store.subscribe(() => pruneSelection(store))
    return () => {
      unsubscribe()
    }
  }, [store])

  return (
    <SceneStoreProvider value={store}>
      <div className="flex h-full flex-col">
        <Masthead />
        <div className="flex min-h-0 flex-1">
          <LayersPanel />
          <Canvas />
          <PropertiesPanel />
        </div>
        <TimelinePanel />
        <Colophon />
      </div>
      <ContextMenu />
      <PreviewOverlay />
      <ExportDialog />
    </SceneStoreProvider>
  )
}
