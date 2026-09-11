/**
 * The Codeframe scene graph.
 *
 * Every node maps to exactly one element in generated code, so the model is kept
 * deliberately close to the DOM box model: a node has a box (x, y, width, height)
 * relative to its parent, an optional rotation about its top-left origin, and
 * paint. Children are ordered by a fractional index so concurrent reorders merge
 * in the CRDT without array-move conflicts.
 *
 * Groups are *transparent*: they carry no geometry of their own. Their children
 * live in the group's parent coordinate space and a group's box is always derived.
 * That keeps groups conflict-free under concurrent edits (no normalisation writes).
 */

export type NodeId = string

export type NodeType = 'frame' | 'rect' | 'ellipse' | 'text' | 'image' | 'group' | 'component'

export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set(['frame', 'group'])

export function isContainerType(type: NodeType): boolean {
  return CONTAINER_TYPES.has(type)
}

/** A color as `#RRGGBB` or `#RRGGBBAA`. */
export type Color = string

// ---------------------------------------------------------------------------
// Effects, interactions & motion (spec: docs/motion.md). Effects map to plain
// CSS; interactions, scroll effects and timeline clips run on the small motion
// runtime shared by Preview and exported code, so what plays is what ships.
// ---------------------------------------------------------------------------

export interface BezierCurve {
  type: 'bezier'
  x1: number
  y1: number
  x2: number
  y2: number
}

/** A physical spring. Its duration is derived from the parameters (`springDuration`). */
export interface SpringCurve {
  type: 'spring'
  stiffness: number
  damping: number
  mass: number
}

export type Curve = BezierCurve | SpringCurve

/** Milliseconds. `duration` is ignored when the curve is a spring. */
export interface Timing {
  duration: number
  delay: number
  curve: Curve
}

export interface Shadow {
  x: number
  y: number
  blur: number
  color: Color
}

/** Values an effect animates from or to. Transforms pivot on the layer's center. */
export interface MotionState {
  opacity?: number
  scale?: number
  /** Degrees added to the layer's rotation. */
  rotate?: number
  x?: number
  y?: number
  /** Layer blur radius, px. */
  blur?: number
}

/** Property overrides applied while hovered or pressed. */
export interface StateStyle extends MotionState {
  fill?: Color
  shadow?: Shadow
}

export type AppearTrigger = 'load' | 'in-view'

/** Enters from `from` to the layer's own style, on page load or when scrolled into view. */
export interface AppearEffect {
  from: MotionState
  trigger: AppearTrigger
  /** In view: play the first time only, instead of every time it re-enters. */
  once: boolean
  /** In view: fraction of the layer that must be visible, 0–1. */
  amount: number
  timing: Timing
}

export type LoopPreset = 'pulse' | 'spin' | 'bounce' | 'float' | 'wiggle'

export interface LoopEffect {
  preset: LoopPreset
  /** One cycle, ms. */
  duration: number
  curve: Curve
}

export type ScrollSource = 'page' | 'in-view'

export interface ScrollKeyframe {
  /** Scroll progress, 0–1. */
  at: number
  state: MotionState
}

/**
 * Scroll transform: scroll progress drives the layer through keyframes.
 * `page` progress is the page's scroll position; `in-view` runs from the layer
 * entering the viewport (0) to leaving it (1).
 */
export interface ScrollEffect {
  source: ScrollSource
  keyframes: ScrollKeyframe[]
}

/** Scroll speed relative to the page: 1 moves with the page, 0.5 at half speed, 0 stays put. */
export interface ParallaxEffect {
  speed: number
}

export type TriggerType =
  | 'click'
  | 'while-hovering'
  | 'while-pressing'
  | 'mouse-enter'
  | 'mouse-leave'
  | 'mouse-down'
  | 'mouse-up'
  | 'after-delay'
  | 'key'
  | 'in-view'

export interface Trigger {
  type: TriggerType
  /** `after-delay`: ms after the screen appears. */
  delay: number
  /** `key`: a `KeyboardEvent.key` value such as `Enter`, `ArrowRight` or `k`. */
  key: string
}

export type TransitionType = 'instant' | 'dissolve' | 'smart-animate' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out'

/** The way the moving screen travels: `left` enters from the right edge. */
export type Direction = 'left' | 'right' | 'up' | 'down'

export interface ScreenTransition {
  type: TransitionType
  direction: Direction
  timing: Timing
}

export type OverlayPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'manual'

export interface OverlaySettings {
  position: OverlayPosition
  /** `manual`: offset from the screen's top-left corner, px. */
  offset: { x: number; y: number }
  closeOnOutside: boolean
  /** Dims the screen behind the overlay; `null` for none. */
  background: Color | null
}

export type PlayMode = 'play' | 'restart' | 'reverse' | 'toggle' | 'pause'

/** Targets are `''` while unset, so a half-configured action survives normalization. */
export type Action =
  | { type: 'navigate'; target: NodeId; transition: ScreenTransition }
  | { type: 'back'; transition: ScreenTransition }
  | { type: 'overlay'; target: NodeId; overlay: OverlaySettings; transition: ScreenTransition }
  | { type: 'swap-overlay'; target: NodeId; transition: ScreenTransition }
  | { type: 'close-overlay' }
  | { type: 'scroll-to'; target: NodeId; offset: number; animate: boolean; timing: Timing }
  | { type: 'open-url'; url: string; newTab: boolean }
  | { type: 'play-animation'; animation: AnimationId; mode: PlayMode }

export type ActionType = Action['type']
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>

/** One trigger running its actions in order (Figma's "multiple actions"). */
export interface Interaction {
  id: string
  trigger: Trigger
  actions: Action[]
}

// ---------------------------------------------------------------------------
// Timeline animations (keyframes), stored doc-level, one entry per clip.
// ---------------------------------------------------------------------------

export type AnimationId = string

export type AnimatableProperty = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'scale' | 'opacity' | 'fill' | 'cornerRadius' | 'blur'

export interface Keyframe {
  /** ms from the clip start. */
  time: number
  /** A number for geometry and opacity, `#RRGGBB(AA)` for fill. */
  value: number | Color
  /** Easing from this keyframe to the next. */
  curve: Curve
}

export interface Track {
  nodeId: NodeId
  property: AnimatableProperty
  keyframes: Keyframe[]
}

export type ClipRepeat = 'once' | 'loop' | 'alternate'

/** A keyframe animation on one screen, Figma Motion style. */
export interface AnimationClip {
  id: AnimationId
  name: string
  /** Canvas-level frame the clip belongs to; its tracks target layers inside it. */
  frameId: NodeId
  duration: number
  repeat: ClipRepeat
  /** Play when the screen appears. */
  autoplay: boolean
  tracks: Track[]
}

export const DEFAULT_TRANSITION: Timing = { duration: 200, delay: 0, curve: { type: 'bezier', x1: 0, y1: 0, x2: 0.2, y2: 1 } }

interface BaseNode {
  id: NodeId
  type: NodeType
  name: string
  /** `null` means the node sits directly on the canvas. */
  parentId: NodeId | null
  /** Fractional index; siblings sort by (index, id). */
  index: string
  x: number
  y: number
  width: number
  height: number
  /** Degrees, clockwise, about the node's top-left corner. */
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  shadow: Shadow | null
  hover: StateStyle | null
  press: StateStyle | null
  /** Timing for hover/press state changes. */
  transition: Timing
  appear: AppearEffect | null
  loop: LoopEffect | null
  scroll: ScrollEffect | null
  parallax: ParallaxEffect | null
  interactions: Interaction[]
  /**
   * Sizing on each axis. `hug` fits the content (auto-layout frames; text sizes
   * itself), `fill` takes the free space in an auto-layout parent, `fixed` keeps
   * width/height.
   */
  sizeX: SizingMode
  sizeY: SizingMode
  minWidth: number | null
  maxWidth: number | null
  minHeight: number | null
  maxHeight: number | null
  /** Inside an auto-layout frame: keep its own x/y instead of flowing with the others. */
  absolute: boolean
}

export type SizingMode = 'fixed' | 'hug' | 'fill'
export type LayoutDirection = 'horizontal' | 'vertical'
export type LayoutAlign = 'start' | 'center' | 'end'
export type LayoutJustify = 'start' | 'center' | 'end' | 'space-between'

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Auto layout (Figma) / stack (Framer): children flow along one axis. Computed
 * when snapshots are built and exported as flexbox.
 */
export interface FrameLayout {
  direction: LayoutDirection
  wrap: boolean
  /** Between items along the direction. Unused by `space-between`, which spreads them. */
  gap: number
  /** Between wrapped lines. */
  crossGap: number
  padding: Padding
  /** Distribution along the direction. */
  justify: LayoutJustify
  /** Alignment across the direction. */
  align: LayoutAlign
}

interface Paint {
  fill: Color | null
  stroke: Color | null
  strokeWidth: number
}

export interface FrameNode extends BaseNode, Paint {
  type: 'frame'
  cornerRadius: number
  clip: boolean
  layout: FrameLayout | null
}

export interface RectNode extends BaseNode, Paint {
  type: 'rect'
  cornerRadius: number
}

export interface EllipseNode extends BaseNode, Paint {
  type: 'ellipse'
}

export type TextAlign = 'left' | 'center' | 'right'
/** `width`: grows horizontally, no wrapping. `height`: fixed width, wraps. `none`: fixed box. */
export type TextAutoResize = 'width' | 'height' | 'none'

export interface TextNode extends BaseNode {
  type: 'text'
  text: string
  fill: Color
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  /** Multiplier of fontSize, like unitless CSS line-height. */
  lineHeight: number
  /** Pixels. */
  letterSpacing: number
  textAlign: TextAlign
  autoResize: TextAutoResize
}

export type ImageFit = 'cover' | 'contain' | 'fill'

export interface ImageNode extends BaseNode {
  type: 'image'
  assetId: string | null
  fit: ImageFit
  cornerRadius: number
}

export interface GroupNode extends BaseNode {
  type: 'group'
}

export type ComponentPropValue = string | number | boolean

/**
 * An instance of a library component (e.g. shadcn/ui Button). The canvas draws
 * it from the library's spec; code export emits the real component.
 */
export interface ComponentNode extends BaseNode {
  type: 'component'
  /** Library key, e.g. `shadcn/button`. */
  component: string
  props: Record<string, ComponentPropValue>
}

export type SceneNode = FrameNode | RectNode | EllipseNode | TextNode | ImageNode | GroupNode | ComponentNode

export type NodeOfType<T extends NodeType> = Extract<SceneNode, { type: T }>

type KeysOfUnion<U> = U extends unknown ? keyof U : never
type ValueOfUnion<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? U[K] : never) : never

/** Any property of any node type, minus identity. Used for partial updates. */
export type NodePatch = {
  [K in Exclude<KeysOfUnion<SceneNode>, 'id' | 'type'>]?: ValueOfUnion<SceneNode, K>
}

/** Image bytes are content-addressed and stored once per document. */
export interface AssetRecord {
  id: string
  mime: string
  /** Data URL for now; moves to server-side asset storage in the multiplayer step. */
  src: string
  width: number
  height: number
}

export const DEFAULT_CONTENT_FONT = 'IBM Plex Sans'

type Defaults<T extends SceneNode> = Omit<T, 'id' | 'parentId' | 'index' | 'name'>

const base: Omit<BaseNode, 'id' | 'type' | 'name' | 'parentId' | 'index'> = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  shadow: null,
  hover: null,
  press: null,
  transition: DEFAULT_TRANSITION,
  appear: null,
  loop: null,
  scroll: null,
  parallax: null,
  interactions: [],
  sizeX: 'fixed',
  sizeY: 'fixed',
  minWidth: null,
  maxWidth: null,
  minHeight: null,
  maxHeight: null,
  absolute: false,
}

export const NODE_DEFAULTS: { [K in NodeType]: Defaults<NodeOfType<K>> } = {
  frame: { ...base, type: 'frame', width: 400, height: 300, fill: '#FFFFFF', stroke: null, strokeWidth: 1, cornerRadius: 0, clip: true, layout: null },
  rect: { ...base, type: 'rect', fill: '#D9D3C7', stroke: null, strokeWidth: 1, cornerRadius: 0 },
  ellipse: { ...base, type: 'ellipse', fill: '#D9D3C7', stroke: null, strokeWidth: 1 },
  text: {
    ...base,
    type: 'text',
    width: 0,
    height: 0,
    text: '',
    fill: '#1A1814',
    fontFamily: DEFAULT_CONTENT_FONT,
    fontSize: 16,
    fontWeight: 400,
    italic: false,
    lineHeight: 1.4,
    letterSpacing: 0,
    textAlign: 'left',
    autoResize: 'width',
  },
  image: { ...base, type: 'image', assetId: null, fit: 'cover', cornerRadius: 0 },
  group: { ...base, type: 'group', width: 0, height: 0 },
  component: { ...base, type: 'component', width: 120, height: 36, component: 'shadcn/button', props: {} },
}

export const TYPE_LABELS: Record<NodeType, string> = {
  frame: 'Frame',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  image: 'Image',
  group: 'Group',
  component: 'Component',
}

export function isNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && value in NODE_DEFAULTS
}
