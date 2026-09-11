import * as Y from 'yjs'
import { getAnimationsMap, getAssetsMap, getMetaMap, getNodesMap, readNode, type YNode } from './doc'
import { normalizeClip } from './normalize'
import { buildSnapshot, type SceneSnapshot } from './tree'
import type { AnimationClip, AssetRecord, NodeId, SceneNode } from './types'

export interface TransactOptions {
  /** Fold into the previous undo step. Used for every frame of a continuous gesture after the first. */
  merge?: boolean
  /** Keep the change off the undo stack (housekeeping writes, not user intent). */
  untracked?: boolean
}

/**
 * The Yjs document *is* the editor's state, even single-player. The store turns
 * Yjs change events into immutable snapshots for React (`useSyncExternalStore`)
 * and owns the undo manager. Unchanged nodes keep their object identity across
 * snapshots so memoised node views skip re-rendering.
 */
export class SceneStore {
  readonly doc: Y.Doc
  readonly nodes: Y.Map<YNode>
  readonly assets: Y.Map<AssetRecord>
  readonly animations: Y.Map<unknown>
  readonly meta: Y.Map<unknown>
  readonly undoManager: Y.UndoManager
  /** Transaction origin for this client's own undoable edits. */
  readonly origin = { source: 'codeframe:local' }
  private readonly untrackedOrigin = { source: 'codeframe:local-untracked' }

  private snapshot: SceneSnapshot
  private readonly nodeCache = new Map<NodeId, SceneNode>()
  private readonly assetCache = new Map<string, AssetRecord>()
  private readonly animationCache = new Map<string, AnimationClip>()
  /** Replaced only when a clip changes, so snapshots share it otherwise. */
  private animationView: ReadonlyMap<string, AnimationClip>
  private readonly listeners = new Set<() => void>()
  private depth = 0

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc
    this.nodes = getNodesMap(doc)
    this.assets = getAssetsMap(doc)
    this.animations = getAnimationsMap(doc)
    this.meta = getMetaMap(doc)
    for (const [id, y] of this.nodes) {
      const node = readNode(y)
      if (node) this.nodeCache.set(id, node)
    }
    for (const [id, asset] of this.assets) this.assetCache.set(id, asset)
    for (const [id, value] of this.animations) this.cacheClip(id, value)
    this.animationView = new Map(this.animationCache)
    this.snapshot = buildSnapshot(new Map(this.nodeCache), new Map(this.assetCache), undefined, this.animationView)

    this.nodes.observeDeep(this.onNodesChanged)
    this.assets.observe(this.onAssetsChanged)
    this.animations.observe(this.onAnimationsChanged)
    this.meta.observe(this.notify)

    // Undo steps are delimited explicitly: every transact() starts a new step
    // unless it asks to merge, so the timeout only needs to never fire on its own.
    this.undoManager = new Y.UndoManager([this.nodes, this.animations], {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: Number.MAX_SAFE_INTEGER,
    })
    this.undoManager.on('stack-item-added', this.notify)
    this.undoManager.on('stack-item-popped', this.notify)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SceneSnapshot => this.snapshot

  getNode(id: NodeId): SceneNode | undefined {
    return this.snapshot.nodes.get(id)
  }

  getAnimation(id: string): AnimationClip | undefined {
    return this.snapshot.animations.get(id)
  }

  transact<T>(fn: () => T, options: TransactOptions = {}): T {
    if (this.depth === 0 && !options.merge && !options.untracked) this.undoManager.stopCapturing()
    let result!: T
    this.depth++
    try {
      this.doc.transact(() => {
        result = fn()
      }, options.untracked ? this.untrackedOrigin : this.origin)
    } finally {
      this.depth--
    }
    return result
  }

  /** Returns an updater whose first call opens an undo step and later calls extend it. */
  beginGesture(): (fn: () => void) => void {
    let first = true
    return (fn) => {
      this.transact(fn, { merge: !first })
      first = false
    }
  }

  undo(): void {
    this.undoManager.undo()
  }

  redo(): void {
    this.undoManager.redo()
  }

  /**
   * Forgets the most recent undo step without reverting it. Used when an edit
   * nets out to nothing, e.g. a text box created and abandoned while empty.
   */
  dropLastUndoStep(): void {
    this.undoManager.undoStack.pop()
    this.undoManager.stopCapturing()
    this.notify()
  }

  canUndo(): boolean {
    return this.undoManager.canUndo()
  }

  canRedo(): boolean {
    return this.undoManager.canRedo()
  }

  destroy(): void {
    this.nodes.unobserveDeep(this.onNodesChanged)
    this.assets.unobserve(this.onAssetsChanged)
    this.animations.unobserve(this.onAnimationsChanged)
    this.meta.unobserve(this.notify)
    this.undoManager.destroy()
    this.listeners.clear()
  }

  private cacheClip(id: string, value: unknown) {
    const clip = normalizeClip(value)
    if (clip) this.animationCache.set(id, { ...clip, id })
    else this.animationCache.delete(id)
  }

  private onNodesChanged = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const changed = new Set<NodeId>()
    for (const event of events) {
      if (event.target === this.nodes) {
        for (const key of (event as Y.YMapEvent<YNode>).keysChanged) changed.add(key)
      } else if (typeof event.path[0] === 'string') {
        changed.add(event.path[0])
      }
    }
    for (const id of changed) {
      const y = this.nodes.get(id)
      const node = y ? readNode(y) : null
      if (node) this.nodeCache.set(id, node)
      else this.nodeCache.delete(id)
    }
    this.rebuild()
  }

  private onAssetsChanged = (event: Y.YMapEvent<AssetRecord>) => {
    for (const key of event.keysChanged) {
      const asset = this.assets.get(key)
      if (asset) this.assetCache.set(key, asset)
      else this.assetCache.delete(key)
    }
    this.rebuild()
  }

  private onAnimationsChanged = (event: Y.YMapEvent<unknown>) => {
    for (const key of event.keysChanged) this.cacheClip(key, this.animations.get(key))
    this.animationView = new Map(this.animationCache)
    this.rebuild()
  }

  private rebuild() {
    this.snapshot = buildSnapshot(new Map(this.nodeCache), new Map(this.assetCache), this.snapshot, this.animationView)
    this.notify()
  }

  private notify = () => {
    for (const listener of this.listeners) listener()
  }
}
