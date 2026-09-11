/**
 * Auto layout, computed when snapshots are built, the same way group bounds are
 * derived: the document stores each frame's layout settings and each child's
 * sizing, never the positions they produce, so concurrent edits can't conflict
 * over them. Mirrors flexbox, which is what the CSS mapping exports:
 *
 *  - hug sizes are measured bottom-up from content, fill sizes and positions
 *    are resolved top-down;
 *  - items don't shrink; `fill` items share the free space on the main axis,
 *    and stretch on the cross axis;
 *  - hidden, absolute and group children keep their own geometry (groups have
 *    none of their own to flow).
 */
import { round2 } from './matrix'
import type { FrameLayout, FrameNode, NodeId, NodePatch, SceneNode } from './types'

interface Size {
  width: number
  height: number
}

export type AutoLayoutFrame = FrameNode & { layout: FrameLayout }

export function isAutoLayout(node: SceneNode | undefined): node is AutoLayoutFrame {
  return node?.type === 'frame' && node.layout !== null
}

/** Whether a child of an auto-layout frame takes part in its flow. */
export function inFlow(node: SceneNode): boolean {
  return node.visible && !node.absolute && node.type !== 'group'
}

/**
 * A child leaving its stack keeps the size the stack gave it. `fill` means
 * nothing outside a stack, so it becomes fixed; `hug` stays for nested stacks.
 */
export function stackedSize(node: SceneNode): NodePatch {
  return {
    width: node.width,
    height: node.height,
    ...(node.sizeX === 'fill' ? { sizeX: 'fixed' as const } : {}),
    ...(node.sizeY === 'fill' ? { sizeY: 'fixed' as const } : {}),
  }
}

const clamp = (value: number, min: number | null, max: number | null) => Math.max(min ?? 0, max === null ? value : Math.min(max, value))

function clampAxis(node: SceneNode, value: number, horizontal: boolean): number {
  return horizontal ? clamp(value, node.minWidth, node.maxWidth) : clamp(value, node.minHeight, node.maxHeight)
}

/** Last computed version per stored node, so unchanged layouts keep object identity across snapshots. */
const computed = new WeakMap<SceneNode, SceneNode>()

export function applyAutoLayout(
  nodes: ReadonlyMap<NodeId, SceneNode>,
  childrenOf: (id: NodeId) => readonly NodeId[],
  parentOf: (id: NodeId) => NodeId | null,
): ReadonlyMap<NodeId, SceneNode> {
  let any = false
  for (const node of nodes.values()) {
    if (isAutoLayout(node)) {
      any = true
      break
    }
  }
  if (!any) return nodes

  const out = new Map(nodes)
  const measured = new Map<NodeId, Size>()
  const flow = (id: NodeId) => childrenOf(id).filter((child) => inFlow(nodes.get(child)!))

  /** Size before the parent resolves fill: hug axes from content, the rest as stored. */
  const measure = (id: NodeId): Size => {
    const hit = measured.get(id)
    if (hit) return hit
    const node = nodes.get(id)!
    let { width, height } = node
    if (isAutoLayout(node)) {
      const { layout } = node
      const horizontal = layout.direction === 'horizontal'
      const sizes = flow(id).map(measure)
      const between = layout.justify === 'space-between' ? 0 : layout.gap
      const main = sizes.reduce((sum, s) => sum + (horizontal ? s.width : s.height), 0) + between * Math.max(0, sizes.length - 1)
      const cross = sizes.reduce((max, s) => Math.max(max, horizontal ? s.height : s.width), 0)
      const { top, right, bottom, left } = layout.padding
      if (node.sizeX === 'hug') width = (horizontal ? main : cross) + left + right
      if (node.sizeY === 'hug') height = (horizontal ? cross : main) + top + bottom
    }
    const size = { width: clamp(width, node.minWidth, node.maxWidth), height: clamp(height, node.minHeight, node.maxHeight) }
    measured.set(id, size)
    return size
  }

  const setBox = (id: NodeId, x: number, y: number, width: number, height: number) => {
    const node = nodes.get(id)!
    if (node.x === x && node.y === y && node.width === width && node.height === height) return
    const previous = computed.get(node)
    if (previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height) {
      out.set(id, previous)
      return
    }
    const next = { ...node, x, y, width, height } as SceneNode
    computed.set(node, next)
    out.set(id, next)
  }

  /** Positions an auto-layout frame's flow children inside its final size, then theirs. */
  const place = (id: NodeId, width: number, height: number) => {
    const node = nodes.get(id)
    if (!isAutoLayout(node)) return
    const { layout } = node
    const horizontal = layout.direction === 'horizontal'
    const { padding } = layout
    const innerMain = Math.max(0, horizontal ? width - padding.left - padding.right : height - padding.top - padding.bottom)
    const innerCross = Math.max(0, horizontal ? height - padding.top - padding.bottom : width - padding.left - padding.right)
    const items = flow(id).map((childId) => {
      const child = nodes.get(childId)!
      const size = measure(childId)
      return {
        id: childId,
        child,
        main: horizontal ? size.width : size.height,
        cross: horizontal ? size.height : size.width,
        fillMain: (horizontal ? child.sizeX : child.sizeY) === 'fill',
        fillCross: (horizontal ? child.sizeY : child.sizeX) === 'fill',
      }
    })

    const between = layout.justify === 'space-between' ? 0 : layout.gap
    const lines: (typeof items)[] = []
    if (layout.wrap) {
      let line: typeof items = []
      let used = 0
      for (const item of items) {
        const length = item.fillMain ? 0 : item.main
        if (line.length > 0 && used + between + length > innerMain) {
          lines.push(line)
          line = []
          used = 0
        }
        used += (line.length > 0 ? between : 0) + length
        line.push(item)
      }
      if (line.length > 0) lines.push(line)
    } else {
      lines.push(items)
    }

    let crossOffset = 0
    for (const line of lines) {
      const lineCross = layout.wrap ? line.reduce((max, it) => Math.max(max, it.fillCross ? 0 : it.cross), 0) : innerCross
      const fills = line.filter((it) => it.fillMain).length
      const fixed = line.reduce((sum, it) => sum + (it.fillMain ? 0 : it.main), 0)
      const free = innerMain - fixed - between * Math.max(0, line.length - 1)
      const share = fills > 0 ? Math.max(0, free / fills) : 0
      const mains = line.map((it) => (it.fillMain ? clampAxis(it.child, share, horizontal) : it.main))
      const used = mains.reduce((sum, m) => sum + m, 0) + between * Math.max(0, line.length - 1)
      const leftover = innerMain - used
      let cursor = layout.justify === 'center' ? leftover / 2 : layout.justify === 'end' ? leftover : 0
      const gap = layout.justify === 'space-between' && line.length > 1 ? Math.max(0, leftover / (line.length - 1)) : between

      line.forEach((it, i) => {
        const main = mains[i]
        const cross = it.fillCross ? clampAxis(it.child, lineCross, !horizontal) : it.cross
        const offset = layout.align === 'center' ? (lineCross - cross) / 2 : layout.align === 'end' ? lineCross - cross : 0
        const w = round2(horizontal ? main : cross)
        const h = round2(horizontal ? cross : main)
        const x = round2(padding.left + (horizontal ? cursor : crossOffset + offset))
        const y = round2(padding.top + (horizontal ? crossOffset + offset : cursor))
        setBox(it.id, x, y, w, h)
        place(it.id, w, h)
        cursor += main + gap
      })
      crossOffset += lineCross + layout.crossGap
    }
  }

  for (const node of nodes.values()) {
    if (!isAutoLayout(node)) continue
    const parentId = parentOf(node.id)
    if (parentId !== null && isAutoLayout(nodes.get(parentId)) && inFlow(node)) continue // its parent places it
    const size = measure(node.id)
    setBox(node.id, node.x, node.y, round2(size.width), round2(size.height))
    place(node.id, round2(size.width), round2(size.height))
  }
  return out
}
