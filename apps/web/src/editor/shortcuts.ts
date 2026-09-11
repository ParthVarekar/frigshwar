import type { AlignEdge, SceneStore } from '@codeframe/scene'
import { useEffect } from 'react'
import * as cmd from './commands'
import { useUI, type Tool } from './ui-store'

const TOOL_KEYS: Record<string, Tool> = { v: 'select', h: 'hand', f: 'frame', r: 'rect', o: 'ellipse', t: 'text' }

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Figma's alignment keys (Alt + A/H/D, W/V/S), matched by physical key so macOS Option chars don't matter. */
const ALIGN_KEYS: Record<string, AlignEdge> = {
  KeyA: 'left',
  KeyH: 'center',
  KeyD: 'right',
  KeyW: 'top',
  KeyV: 'middle',
  KeyS: 'bottom',
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
  )
}

export function useShortcuts(store: SceneStore) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      const ui = useUI.getState()
      // Preview and menus own the keyboard while open.
      if (ui.preview || ui.contextMenu) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) ui.setSpaceHeld(true)
        return
      }
      if (ui.editing) return

      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      const key = e.key.toLowerCase()

      if (e.ctrlKey || e.metaKey) {
        if (e.altKey && e.key === 'Enter') return run(() => cmd.openPreview(store))
        if (e.shiftKey && e.code === 'KeyH') return run(() => cmd.toggleVisibility(store, ui.selection))
        if (e.shiftKey && e.code === 'KeyL') return run(() => cmd.toggleLock(store, ui.selection))
        if (e.code === 'BracketRight') return run(() => cmd.reorderSelection(store, e.shiftKey ? 'front' : 'forward'))
        if (e.code === 'BracketLeft') return run(() => cmd.reorderSelection(store, e.shiftKey ? 'back' : 'backward'))
        switch (key) {
          case 'z':
            return run(() => (e.shiftKey ? cmd.redo(store) : cmd.undo(store)))
          case 'y':
            return run(() => cmd.redo(store))
          case 'd':
            return run(() => cmd.duplicateSelection(store))
          case 'a':
            return run(() => cmd.selectAll(store))
          case 'g':
            return run(() =>
              e.altKey ? cmd.frameSelection(store) : e.shiftKey ? cmd.ungroupSelection(store) : cmd.groupSelection(store),
            )
          case '=':
          case '+':
            return run(() => cmd.zoomStep(1))
          case '-':
            return run(() => cmd.zoomStep(-1))
          case '0':
            return run(() => cmd.zoomTo(1))
        }
        return
      }

      if (e.shiftKey && e.code === 'Digit0') return run(() => cmd.zoomTo(1))
      if (e.shiftKey && e.code === 'Digit1') return run(() => cmd.zoomToFit(store))
      if (e.shiftKey && e.code === 'Digit2') return run(() => cmd.zoomToSelection(store))

      const arrow = ARROWS[e.key]
      if (arrow) {
        const step = e.shiftKey ? 10 : 1
        return run(() => cmd.nudgeSelection(store, arrow[0] * step, arrow[1] * step))
      }
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          return run(() => cmd.deleteSelection(store))
        case 'Escape':
          return run(() => (ui.tool !== 'select' ? ui.setTool('select') : cmd.selectParent(store)))
        case 'Enter':
          return run(() => (e.shiftKey ? cmd.selectParent(store) : cmd.enterSelection(store)))
        case '+':
        case '=':
          return run(() => cmd.zoomStep(1))
        case '-':
        case '_':
          return run(() => cmd.zoomStep(-1))
      }

      if (e.altKey) {
        if (e.shiftKey && e.code === 'KeyH') return run(() => cmd.distributeSelection(store, 'horizontal'))
        if (e.shiftKey && e.code === 'KeyV') return run(() => cmd.distributeSelection(store, 'vertical'))
        const edge = e.shiftKey ? undefined : ALIGN_KEYS[e.code]
        if (edge) run(() => cmd.alignSelection(store, edge))
        return
      }
      if (e.shiftKey) return
      if (key === 'i') return run(() => cmd.pickImages(store))
      const tool = TOOL_KEYS[key]
      if (tool) run(() => ui.setTool(tool))
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useUI.getState().setSpaceHeld(false)
    }
    const onBlur = () => useUI.getState().setSpaceHeld(false)

    const onCopy = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !e.clipboardData) return
      if (cmd.copySelection(store, e.clipboardData)) e.preventDefault()
    }
    const onCut = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !e.clipboardData) return
      if (cmd.copySelection(store, e.clipboardData)) {
        e.preventDefault()
        cmd.deleteSelection(store)
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !e.clipboardData) return
      e.preventDefault()
      cmd.pasteData(store, e.clipboardData)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [store])
}
