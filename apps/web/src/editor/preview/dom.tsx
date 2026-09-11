import { expandInstance, type LibraryTheme } from '@codeframe/library'
import { useInView, useMotion } from '@codeframe/runtime'
import {
  childrenOf,
  interactionBindings,
  resolveActions,
  type Action,
  type InteractionBindings,
  type NodeId,
  type ResolveContext,
  type SceneNode,
  type SceneSnapshot,
} from '@codeframe/scene'
import { useEffect, useMemo, type MouseEvent, type ReactNode } from 'react'
import { measureLibraryText } from '../library'
import { IMAGE_PLACEHOLDER } from '../theme'
import { domClass } from './styles'

/**
 * Renders scene nodes as nested elements styled by `treeStylesheet`: the same
 * mapping the code exporter uses. With `live`, layers also run their
 * interactions through the motion runtime, with the same bindings and `data-cf*`
 * attributes exported pages get, so Preview plays what ships.
 */
export function DomTree(props: { snap: SceneSnapshot; id: NodeId; theme: LibraryTheme; live?: boolean }) {
  const node = props.snap.nodes.get(props.id)
  if (!node || !node.visible) return null
  return <DomNode snap={props.snap} node={node} theme={props.theme} live={props.live ?? false} matchPath="" insideClickable={false} />
}

const NO_BINDINGS: InteractionBindings = { events: {}, whileHovering: [], whilePressing: [], afterDelay: [], keys: [], inView: [] }

function DomNode(props: { snap: SceneSnapshot; node: SceneNode; theme: LibraryTheme; live: boolean; matchPath: string; insideClickable: boolean }) {
  const { snap, node, theme, live, matchPath } = props
  const motion = useMotion()
  const bindings = useMemo(() => (live ? interactionBindings(node) : NO_BINDINGS), [live, node])
  // Preview screens are canvas-level frames keyed by id; layers are found by id.
  const ctx = useMemo<ResolveContext>(
    () => ({
      screen: (id) => (snap.nodes.get(id)?.type === 'frame' && snap.parents.get(id) === null ? id : null),
      element: (id) => (snap.nodes.has(id) ? id : null),
    }),
    [snap],
  )
  const run = (actions: readonly Action[]) => {
    if (actions.length) motion.run(resolveActions(actions, ctx))
  }
  const revert = (actions: readonly Action[]) => {
    if (actions.length) motion.revert(resolveActions(actions, ctx))
  }
  const inViewRef = useInView<HTMLDivElement>(() => run(bindings.inView))

  useEffect(() => {
    const timers = bindings.afterDelay.map(({ delay, actions }) => window.setTimeout(() => motion.run(resolveActions(actions, ctx)), delay))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [bindings, ctx, motion])

  useEffect(() => {
    if (bindings.keys.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      const matching = bindings.keys.filter((k) => k.key === e.key)
      if (e.repeat || matching.length === 0) return
      e.preventDefault()
      for (const k of matching) motion.run(resolveActions(k.actions, ctx))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings, ctx, motion])

  const { whileHovering, whilePressing } = bindings
  const { click, enter, leave, down, up } = useMemo(() => {
    const { events } = bindings
    return {
      click: events.click ?? [],
      enter: [...(events['mouse-enter'] ?? []), ...bindings.whileHovering],
      leave: events['mouse-leave'] ?? [],
      down: [...(events['mouse-down'] ?? []), ...bindings.whilePressing],
      up: events['mouse-up'] ?? [],
    }
  }, [bindings])
  const clickable = useMemo(() => resolveActions([...click, ...down], ctx).length > 0, [click, down, ctx])

  const handlers = live
    ? {
        onClick: click.length
          ? (e: MouseEvent) => {
              if (props.insideClickable) e.stopPropagation()
              run(click)
            }
          : undefined,
        onMouseEnter: enter.length ? () => run(enter) : undefined,
        onMouseLeave:
          leave.length || whileHovering.length
            ? () => {
                run(leave)
                revert(whileHovering)
              }
            : undefined,
        onMouseDown: down.length ? () => run(down) : undefined,
        onMouseUp:
          up.length || whilePressing.length
            ? () => {
                run(up)
                revert(whilePressing)
              }
            : undefined,
      }
    : {}
  const inView = live && node.appear?.trigger === 'in-view' ? node.appear : null
  const attributes: Record<string, string | undefined> = live
    ? {
        'data-cf': node.id,
        'data-cf-match': matchPath || undefined,
        'data-cf-appear': inView ? 'in-view' : undefined,
        'data-cf-once': inView && !inView.once ? 'false' : undefined,
        'data-cf-amount': inView && inView.amount !== 0.3 ? String(inView.amount) : undefined,
      }
    : {}

  let content: ReactNode = null
  if (node.type === 'text') {
    content = node.text
  } else if (node.type === 'image') {
    const src = node.assetId ? snap.assets.get(node.assetId)?.src : undefined
    content = src ? (
      <img src={src} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: node.fit }} />
    ) : (
      <div style={{ width: '100%', height: '100%', background: IMAGE_PLACEHOLDER }} />
    )
  } else if (node.type === 'component') {
    const scene = expandInstance(node, theme, measureLibraryText)
    content = scene ? <DomTree snap={scene.snapshot} id={scene.rootId} theme={theme} /> : null
  } else {
    content = childrenOf(snap, node.id).map((childId) => {
      const child = snap.nodes.get(childId)
      if (!child || !child.visible) return null
      return (
        <DomNode
          key={childId}
          snap={snap}
          node={child}
          theme={theme}
          live={live}
          matchPath={matchPath ? `${matchPath}/${child.name}` : child.name}
          insideClickable={props.insideClickable || clickable}
        />
      )
    })
  }

  return (
    <div
      ref={bindings.inView.length ? inViewRef : undefined}
      className={domClass(node.id)}
      style={live && clickable ? { cursor: 'pointer' } : undefined}
      {...attributes}
      {...handlers}
    >
      {content}
    </div>
  )
}
