import { applyPatches, deleteNodes, multiply, worldMatrix } from '@codeframe/scene'
import { useEffect, useRef, type CSSProperties } from 'react'
import { useNode, useScene, useSceneStore } from '../scene-context'
import { cssFontStack, measureText } from '../text'
import { PENCIL } from '../theme'
import { useUI } from '../ui-store'
import { viewportMatrix } from '../viewport'

/**
 * In-place text editing: a transparent textarea laid exactly over the Konva
 * text (same font, size, line height, transform). Every keystroke writes to the
 * document, so the text box re-measures live and collaborators see typing.
 */
export function TextEditor() {
  const store = useSceneStore()
  const snap = useScene()
  const editing = useUI((s) => s.editing)
  const viewport = useUI((s) => s.viewport)
  const node = useNode(editing?.id ?? null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const update = useRef<((fn: () => void) => void) | null>(null)

  const editingId = editing?.id
  const isNew = editing?.isNew ?? false
  useEffect(() => {
    if (!editingId) return
    // New text folds into its creation step; existing text gets one step per edit session.
    update.current = isNew ? (fn) => store.transact(fn, { merge: true }) : store.beginGesture()
    const el = textarea.current
    if (el) {
      el.focus()
      if (isNew) el.setSelectionRange(el.value.length, el.value.length)
      else el.select()
    }
  }, [editingId, isNew, store])

  if (!editing || node?.type !== 'text') return null

  const commit = () => {
    if (useUI.getState().editing?.id !== node.id) return
    const current = store.getNode(node.id)
    if (current?.type === 'text' && current.text.trim() === '') {
      update.current?.(() => deleteNodes(store, [node.id]))
      if (editing.isNew) store.dropLastUndoStep()
      useUI.getState().setSelection([])
    }
    useUI.getState().setEditing(null)
  }

  const m = multiply(viewportMatrix(viewport), worldMatrix(snap, node.id))
  const style: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: '0 0',
    transform: `matrix(${m.join(',')})`,
    width: node.autoResize === 'width' ? node.width + 2 : node.width,
    height: node.height,
    font: `${node.italic ? 'italic ' : ''}${node.fontWeight} ${node.fontSize}px ${cssFontStack(node.fontFamily)}`,
    lineHeight: node.lineHeight,
    letterSpacing: `${node.letterSpacing}px`,
    color: node.fill,
    opacity: node.opacity,
    textAlign: node.textAlign,
    whiteSpace: node.autoResize === 'width' ? 'pre' : 'pre-wrap',
    overflowWrap: 'break-word',
    background: 'transparent',
    border: 0,
    outline: 'none',
    padding: 0,
    margin: 0,
    resize: 'none',
    overflow: 'hidden',
    caretColor: PENCIL,
  }

  return (
    <textarea
      ref={textarea}
      aria-label="Edit text"
      spellCheck={false}
      value={node.text}
      style={style}
      onChange={(e) => {
        const text = e.target.value
        const size = measureText({ ...node, text })
        update.current?.(() => applyPatches(store, [[node.id, { text, ...size }]]))
      }}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          textarea.current?.blur()
        }
      }}
    />
  )
}
