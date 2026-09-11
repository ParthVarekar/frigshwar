/**
 * Helpers over layer interactions shared by the editor, Preview and codegen,
 * including the resolution of scene actions into motion runtime actions
 * (`@codeframe/runtime`'s `MotionAction`, structurally identical).
 */
import { timingCss } from './curves'
import { newId } from './ids'
import { DEFAULT_SCREEN_TRANSITION, DEFAULT_TRIGGER } from './normalize'
import type { Action, ActionOf, Direction, Interaction, NodeId, OverlaySettings, PlayMode, SceneNode, ScreenTransition, TransitionType } from './types'

export type NavigationAction = ActionOf<'navigate'> | ActionOf<'back'>
export type TargetedAction = Extract<Action, { target: NodeId }>

export function hasTarget(action: Action): action is TargetedAction {
  return 'target' in action && action.target !== ''
}

/** Every action on the layer that points at another layer or frame. */
export function targetedActions(node: SceneNode): TargetedAction[] {
  return node.interactions.flatMap((ix) => ix.actions.filter(hasTarget))
}

/** The first navigate/back action run on click, if any. */
export function clickNavigation(node: SceneNode): NavigationAction | null {
  for (const ix of node.interactions) {
    if (ix.trigger.type !== 'click') continue
    for (const action of ix.actions) if (action.type === 'navigate' || action.type === 'back') return action
  }
  return null
}

function findClickNavigation(interactions: Interaction[]): [number, number] | null {
  for (let i = 0; i < interactions.length; i++) {
    if (interactions[i].trigger.type !== 'click') continue
    const j = interactions[i].actions.findIndex((a) => a.type === 'navigate' || a.type === 'back')
    if (j !== -1) return [i, j]
  }
  return null
}

/** Replaces the click navigation, or adds a click interaction running `action`. */
export function withClickNavigation(interactions: Interaction[], action: NavigationAction): Interaction[] {
  const found = findClickNavigation(interactions)
  if (!found) return [...interactions, { id: newId(), trigger: { ...DEFAULT_TRIGGER }, actions: [action] }]
  const [i, j] = found
  return interactions.map((ix, k) => (k === i ? { ...ix, actions: ix.actions.map((a, m) => (m === j ? action : a)) } : ix))
}

/** Points the click navigation at `target`, keeping its transition (the ⊕ drag onto a frame). */
export function withNavigateTarget(interactions: Interaction[], target: NodeId): Interaction[] {
  const found = findClickNavigation(interactions)
  const transition = found ? (interactions[found[0]].actions[found[1]] as NavigationAction).transition : { ...DEFAULT_SCREEN_TRANSITION }
  return withClickNavigation(interactions, { type: 'navigate', target, transition })
}

/** Removes the click navigation, and its interaction when nothing else is left in it. */
export function withoutClickNavigation(interactions: Interaction[]): Interaction[] {
  const found = findClickNavigation(interactions)
  if (!found) return interactions
  const [i, j] = found
  return interactions
    .map((ix, k) => (k === i ? { ...ix, actions: ix.actions.filter((_, m) => m !== j) } : ix))
    .filter((ix, k) => k !== i || ix.actions.length > 0)
}

// ---------------------------------------------------------------------------
// Bindings: which DOM events, hooks and observers a layer's interactions need.
// ---------------------------------------------------------------------------

export type PointerTrigger = 'click' | 'mouse-enter' | 'mouse-leave' | 'mouse-down' | 'mouse-up'

export interface InteractionBindings {
  /** Actions run on each pointer event. */
  events: Partial<Record<PointerTrigger, Action[]>>
  /** Run on enter, reverted on leave. */
  whileHovering: Action[]
  /** Run on press, reverted on release or leave. */
  whilePressing: Action[]
  afterDelay: { delay: number; actions: Action[] }[]
  keys: { key: string; actions: Action[] }[]
  /** Run once when the layer scrolls into view. */
  inView: Action[]
}

export function interactionBindings(node: SceneNode): InteractionBindings {
  const bindings: InteractionBindings = { events: {}, whileHovering: [], whilePressing: [], afterDelay: [], keys: [], inView: [] }
  for (const { trigger, actions } of node.interactions) {
    if (actions.length === 0) continue
    switch (trigger.type) {
      case 'click':
      case 'mouse-enter':
      case 'mouse-leave':
      case 'mouse-down':
      case 'mouse-up':
        bindings.events[trigger.type] = [...(bindings.events[trigger.type] ?? []), ...actions]
        break
      case 'while-hovering':
        bindings.whileHovering.push(...actions)
        break
      case 'while-pressing':
        bindings.whilePressing.push(...actions)
        break
      case 'after-delay':
        bindings.afterDelay.push({ delay: trigger.delay, actions })
        break
      case 'key':
        bindings.keys.push({ key: trigger.key, actions })
        break
      case 'in-view':
        bindings.inView.push(...actions)
        break
    }
  }
  return bindings
}

// ---------------------------------------------------------------------------
// Resolution into runtime actions
// ---------------------------------------------------------------------------

export interface ResolvedTransition {
  type: TransitionType
  direction: Direction
  duration: number
  easing: string
}

export interface ResolvedOverlay extends OverlaySettings {
  transition?: ResolvedTransition
}

export type ResolvedAction =
  | { type: 'navigate'; to: string; transition?: ResolvedTransition }
  | { type: 'back'; transition?: ResolvedTransition }
  | { type: 'overlay'; to: string; overlay: ResolvedOverlay }
  | { type: 'swap-overlay'; to: string; transition?: ResolvedTransition }
  | { type: 'close-overlay' }
  | { type: 'scroll-to'; to: string; scroll: { offset: number; duration: number; easing: string } }
  | { type: 'open-url'; url: string; newTab: boolean }
  | { type: 'play'; clip: string; mode: PlayMode }

export interface ResolveContext {
  /** Runtime id (route or frame id) of a canvas-level frame, or `null` if it isn't a screen. */
  screen(frameId: NodeId): string | null
  /** `data-cf` id of a layer, or `null` if it can't be targeted. */
  element(nodeId: NodeId): string | null
}

/** Curves become CSS easings (springs with their settling time); `instant` becomes no transition. */
export function resolveTransition(transition: ScreenTransition): ResolvedTransition | undefined {
  if (transition.type === 'instant') return undefined
  const { duration, easing } = timingCss(transition.timing)
  return { type: transition.type, direction: transition.direction, duration, easing }
}

/** `null` for actions that can't run yet (no destination picked, missing frame). */
export function resolveAction(action: Action, ctx: ResolveContext): ResolvedAction | null {
  switch (action.type) {
    case 'navigate': {
      const to = action.target ? ctx.screen(action.target) : null
      return to ? { type: 'navigate', to, transition: resolveTransition(action.transition) } : null
    }
    case 'back':
      return { type: 'back', transition: resolveTransition(action.transition) }
    case 'overlay': {
      const to = action.target ? ctx.screen(action.target) : null
      if (!to) return null
      return { type: 'overlay', to, overlay: { ...action.overlay, offset: { ...action.overlay.offset }, transition: resolveTransition(action.transition) } }
    }
    case 'swap-overlay': {
      const to = action.target ? ctx.screen(action.target) : null
      return to ? { type: 'swap-overlay', to, transition: resolveTransition(action.transition) } : null
    }
    case 'close-overlay':
      return { type: 'close-overlay' }
    case 'scroll-to': {
      const to = action.target ? ctx.element(action.target) : null
      if (!to) return null
      const { duration, easing } = timingCss(action.timing)
      return { type: 'scroll-to', to, scroll: { offset: action.offset, duration: action.animate ? duration : 0, easing } }
    }
    case 'open-url':
      return action.url ? { type: 'open-url', url: action.url, newTab: action.newTab } : null
    case 'play-animation':
      return action.animation ? { type: 'play', clip: action.animation, mode: action.mode } : null
  }
}

export function resolveActions(actions: readonly Action[], ctx: ResolveContext): ResolvedAction[] {
  return actions.flatMap((action) => resolveAction(action, ctx) ?? [])
}

/** Layers a Preview or export must be able to find by `data-cf`: scroll-to targets. */
export function scrollTargets(nodes: Iterable<SceneNode>): Set<NodeId> {
  const out = new Set<NodeId>()
  for (const node of nodes) for (const ix of node.interactions) for (const a of ix.actions) if (a.type === 'scroll-to' && a.target) out.add(a.target)
  return out
}
