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
// Effects & motion. Every field maps to plain CSS (box-shadow, transitions,
// :hover/:active rules, @keyframes), so what animates in Preview is what ships.
// ---------------------------------------------------------------------------

export type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring'

export interface Shadow {
  x: number
  y: number
  blur: number
  color: Color
}

/** Durations in milliseconds. */
export interface Transition {
  duration: number
  delay: number
  easing: Easing
}

/** Property overrides applied while hovered or pressed. Transforms pivot on the center. */
export interface StateStyle {
  opacity?: number
  scale?: number
  /** Degrees added to the node's rotation. */
  rotate?: number
  x?: number
  y?: number
  fill?: Color
  shadow?: Shadow
}

export type AppearPreset = 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'scale' | 'blur'

export interface AppearAnimation {
  preset: AppearPreset
  duration: number
  delay: number
  easing: Easing
  /** Travel for slide presets, px. */
  distance: number
}

export type LoopPreset = 'pulse' | 'spin' | 'bounce' | 'float' | 'wiggle'

export interface LoopAnimation {
  preset: LoopPreset
  duration: number
  easing: Easing
}

export type LinkTransition =
  | 'instant'
  | 'dissolve'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'push-left'
  | 'push-right'

/** A prototype connection: on click, go to a canvas-level frame (or back). */
export interface PrototypeLink {
  target: NodeId | 'back'
  transition: LinkTransition
  duration: number
  easing: Easing
}

export const DEFAULT_TRANSITION: Transition = { duration: 200, delay: 0, easing: 'ease-out' }

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
  transition: Transition
  appear: AppearAnimation | null
  loop: LoopAnimation | null
  link: PrototypeLink | null
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

const base = {
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
  link: null,
} as const

export const NODE_DEFAULTS: { [K in NodeType]: Defaults<NodeOfType<K>> } = {
  frame: { ...base, type: 'frame', width: 400, height: 300, fill: '#FFFFFF', stroke: null, strokeWidth: 1, cornerRadius: 0, clip: true },
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
