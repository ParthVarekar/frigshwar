import type { AnimatableProperty, NodeId, NodePatch } from '@codeframe/scene'
import { create } from 'zustand'

/** Per-client timeline state: the open clip, the playhead, playback and recording. Not part of the document. */

export interface KeyframeRef {
  nodeId: NodeId
  property: AnimatableProperty
  index: number
}

interface TimelineState {
  open: boolean
  clipId: string | null
  /** Playhead, ms. */
  time: number
  playing: boolean
  /** Auto-key: Design-tab edits at the playhead write keyframes instead of base values. */
  recording: boolean
  selected: KeyframeRef | null
  /** Animated values at the playhead, drawn on the canvas. */
  patches: ReadonlyMap<NodeId, NodePatch>

  setOpen: (open: boolean) => void
  setClip: (clipId: string | null) => void
  setTime: (time: number) => void
  setPlaying: (playing: boolean) => void
  setRecording: (recording: boolean) => void
  setSelected: (selected: KeyframeRef | null) => void
  setPatches: (patches: ReadonlyMap<NodeId, NodePatch>) => void
}

const NONE: ReadonlyMap<NodeId, NodePatch> = new Map()

export const useTimeline = create<TimelineState>()((set) => ({
  open: false,
  clipId: null,
  time: 0,
  playing: false,
  recording: false,
  selected: null,
  patches: NONE,

  setOpen: (open) => set(open ? { open } : { open, playing: false, recording: false, selected: null, patches: NONE }),
  setClip: (clipId) => set({ clipId, time: 0, playing: false, selected: null }),
  setTime: (time) => set((s) => (s.time === time ? s : { time })),
  setPlaying: (playing) => set({ playing }),
  setRecording: (recording) => set({ recording }),
  setSelected: (selected) => set({ selected }),
  setPatches: (patches) => set((s) => (s.patches.size === 0 && patches.size === 0 ? s : { patches })),
}))

/** The clip and playhead that Design-tab edits should key, when recording. */
export function recordTarget(): { clipId: string; time: number } | null {
  const { open, recording, clipId, time } = useTimeline.getState()
  return open && recording && clipId ? { clipId, time } : null
}
