import type { EllipseNode, FrameNode, ImageNode, NodeId, RectNode, Shadow, TextNode } from '@codeframe/scene'
import { memo } from 'react'
import { Ellipse, Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import { useAssetImage } from '../images'
import { useAsset, useChildren, useNode } from '../scene-context'
import { konvaFontStyle } from '../text'
import { IMAGE_PLACEHOLDER } from '../theme'
import { useUI } from '../ui-store'
import { konvaRef } from './registry'

/**
 * Renders the scene graph 1:1 into Konva. Each view subscribes to its own node,
 * so an edit re-renders only the nodes it touched.
 *
 * Strokes are drawn *inside* the box and shadows sit under the fill, matching
 * how the CSS mapping emits them (inset rings, box-shadow), so the canvas and
 * the generated code agree.
 */
export const NodeList = memo(function NodeList({ parentId }: { parentId: NodeId | null }) {
  const ids = useChildren(parentId)
  return ids.map((id) => <NodeView key={id} id={id} />)
})

const NodeView = memo(function NodeView({ id }: { id: NodeId }) {
  const node = useNode(id)
  if (!node || !node.visible) return null
  switch (node.type) {
    case 'frame':
      return <FrameView node={node} />
    case 'rect':
      return <RectView node={node} />
    case 'ellipse':
      return <EllipseView node={node} />
    case 'text':
      return <TextView node={node} />
    case 'image':
      return <ImageView node={node} />
    case 'group':
      return (
        <Group ref={konvaRef(node.id)} opacity={node.opacity}>
          <NodeList parentId={node.id} />
        </Group>
      )
  }
})

function toRgba(hex: string): string {
  const h = hex.slice(1)
  const channel = (i: number) => Number.parseInt(h.slice(i, i + 2), 16)
  const alpha = h.length === 8 ? Math.round((channel(6) / 255) * 1000) / 1000 : 1
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${alpha})`
}

function shadowProps(shadow: Shadow | null) {
  if (!shadow) return {}
  return {
    shadowColor: toRgba(shadow.color),
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.x,
    shadowOffsetY: shadow.y,
    shadowOpacity: 1,
    shadowForStrokeEnabled: false,
  }
}

function InsideStroke(props: {
  width: number
  height: number
  stroke: string | null
  strokeWidth: number
  cornerRadius?: number
  ellipse?: boolean
}) {
  const { width, height, stroke, strokeWidth, cornerRadius = 0, ellipse } = props
  if (!stroke || strokeWidth <= 0) return null
  const inset = Math.min(strokeWidth, width, height) / 2
  if (ellipse) {
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={Math.max(0, width / 2 - inset)}
        radiusY={Math.max(0, height / 2 - inset)}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    )
  }
  return (
    <Rect
      x={inset}
      y={inset}
      width={Math.max(0, width - inset * 2)}
      height={Math.max(0, height - inset * 2)}
      cornerRadius={Math.max(0, cornerRadius - inset)}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  )
}

function FrameView({ node }: { node: FrameNode }) {
  const { width: w, height: h } = node
  const r = Math.min(node.cornerRadius, w / 2, h / 2)
  const clip = !node.clip
    ? {}
    : r > 0
      ? {
          clipFunc: (ctx: { beginPath(): void; roundRect(...a: [number, number, number, number, number]): void }) => {
            ctx.beginPath()
            ctx.roundRect(0, 0, w, h, r)
          },
        }
      : { clipX: 0, clipY: 0, clipWidth: w, clipHeight: h }
  return (
    <Group ref={konvaRef(node.id)} x={node.x} y={node.y} rotation={node.rotation} opacity={node.opacity}>
      <Rect width={w} height={h} fill={node.fill ?? undefined} cornerRadius={r} {...shadowProps(node.shadow)} />
      <InsideStroke width={w} height={h} stroke={node.stroke} strokeWidth={node.strokeWidth} cornerRadius={r} />
      <Group {...clip}>
        <NodeList parentId={node.id} />
      </Group>
    </Group>
  )
}

function RectView({ node }: { node: RectNode }) {
  return (
    <Group ref={konvaRef(node.id)} x={node.x} y={node.y} rotation={node.rotation} opacity={node.opacity}>
      <Rect
        width={node.width}
        height={node.height}
        fill={node.fill ?? undefined}
        cornerRadius={node.cornerRadius}
        {...shadowProps(node.shadow)}
      />
      <InsideStroke
        width={node.width}
        height={node.height}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        cornerRadius={node.cornerRadius}
      />
    </Group>
  )
}

function EllipseView({ node }: { node: EllipseNode }) {
  return (
    <Group ref={konvaRef(node.id)} x={node.x} y={node.y} rotation={node.rotation} opacity={node.opacity}>
      <Ellipse
        x={node.width / 2}
        y={node.height / 2}
        radiusX={node.width / 2}
        radiusY={node.height / 2}
        fill={node.fill ?? undefined}
        {...shadowProps(node.shadow)}
      />
      <InsideStroke width={node.width} height={node.height} stroke={node.stroke} strokeWidth={node.strokeWidth} ellipse />
    </Group>
  )
}

function TextView({ node }: { node: TextNode }) {
  const editing = useUI((s) => s.editing?.id === node.id)
  const autoWidth = node.autoResize === 'width'
  return (
    <Text
      ref={konvaRef(node.id)}
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      visible={!editing}
      text={node.text}
      fill={node.fill}
      fontFamily={node.fontFamily}
      fontSize={node.fontSize}
      fontStyle={konvaFontStyle(node)}
      lineHeight={node.lineHeight}
      letterSpacing={node.letterSpacing}
      align={node.textAlign}
      wrap={autoWidth ? 'none' : 'word'}
      width={autoWidth ? undefined : node.width}
      height={node.autoResize === 'none' ? node.height : undefined}
      {...shadowProps(node.shadow)}
    />
  )
}

function ImageView({ node }: { node: ImageNode }) {
  const asset = useAsset(node.assetId)
  const img = useAssetImage(asset?.src)
  const { width: w, height: h, cornerRadius } = node
  const shadow = shadowProps(node.shadow)
  let content
  if (!img) {
    content = <Rect width={w} height={h} fill={IMAGE_PLACEHOLDER} cornerRadius={cornerRadius} {...shadow} />
  } else {
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (node.fit === 'cover') {
      const scale = Math.max(w / iw, h / ih)
      const cw = w / scale
      const ch = h / scale
      const crop = { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch }
      content = <KonvaImage image={img} width={w} height={h} crop={crop} cornerRadius={cornerRadius} {...shadow} />
    } else if (node.fit === 'contain') {
      const scale = Math.min(w / iw, h / ih)
      const dw = iw * scale
      const dh = ih * scale
      content = (
        <KonvaImage image={img} x={(w - dw) / 2} y={(h - dh) / 2} width={dw} height={dh} cornerRadius={cornerRadius} {...shadow} />
      )
    } else {
      content = <KonvaImage image={img} width={w} height={h} cornerRadius={cornerRadius} {...shadow} />
    }
  }
  return (
    <Group ref={konvaRef(node.id)} x={node.x} y={node.y} rotation={node.rotation} opacity={node.opacity}>
      {content}
    </Group>
  )
}
