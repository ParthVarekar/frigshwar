import {
  childrenOf,
  type AssetRecord,
  type NodeId,
  type SceneNode,
  type SceneSnapshot,
  type SceneStore,
} from '@codeframe/scene'
import { createContext, useContext, useSyncExternalStore } from 'react'

const SceneStoreContext = createContext<SceneStore | null>(null)

export const SceneStoreProvider = SceneStoreContext.Provider

export function useSceneStore(): SceneStore {
  const store = useContext(SceneStoreContext)
  if (!store) throw new Error('useSceneStore must be used inside <SceneStoreProvider>')
  return store
}

/** Whole snapshot; re-renders on every document change. Prefer the narrower hooks. */
export function useScene(): SceneSnapshot {
  const store = useSceneStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

/** Re-renders only when this node changes; unchanged nodes keep their identity. */
export function useNode(id: NodeId | null): SceneNode | undefined {
  const store = useSceneStore()
  return useSyncExternalStore(store.subscribe, () => (id === null ? undefined : store.getSnapshot().nodes.get(id)))
}

/** Re-renders only when this container's child list changes. */
export function useChildren(parentId: NodeId | null): readonly NodeId[] {
  const store = useSceneStore()
  return useSyncExternalStore(store.subscribe, () => childrenOf(store.getSnapshot(), parentId))
}

export function useAsset(assetId: string | null): AssetRecord | undefined {
  const store = useSceneStore()
  return useSyncExternalStore(store.subscribe, () => (assetId ? store.getSnapshot().assets.get(assetId) : undefined))
}

export function useHistoryState(): { canUndo: boolean; canRedo: boolean } {
  const store = useSceneStore()
  const canUndo = useSyncExternalStore(store.subscribe, () => store.canUndo())
  const canRedo = useSyncExternalStore(store.subscribe, () => store.canRedo())
  return { canUndo, canRedo }
}
