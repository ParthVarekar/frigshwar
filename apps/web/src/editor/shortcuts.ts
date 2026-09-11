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

/** Figma's alignment keys: Alt + A/H/D (left, center, right) and W/V/S (top, middle, bottom). */
const ALIGN_KEYS: Record<string, AlignEdge> = {
  a: 'left',
  h: 'center',
  d: 'right',
  w: 'top',
  v: 'middle',
  s: 'bottom',
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
  )
}

/**
 * The letter a shortcut refers to. The physical key wins when it's reported,
 * so macOS Option characters (Option+A = "å") and other layouts still match;
 * otherwise fall back to the character produced.
 */
function shortcutLetter(e: KeyboardEvent): string {
  return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
}

export function useShortcuts(store: SceneStore) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      const ui = useUI.getState()
      // Preview, menus and dialogs own the keyboard while open.
      if (ui.preview || ui.contextMenu || ui.exportOpen) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        if (!e.repeat) ui.setSpaceHeld(true)
        return
      }
      if (ui.editing) return

      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      const letter = shortcutLetter(e)

      if (e.ctrlKey || e.metaKey) {
        if (e.altKey && e.key === 'Enter') return run(() => cmd.openPreview(store))
        if (e.shiftKey && letter === 'e') return run(() => cmd.openExport())
        if (e.shiftKey && letter === 'h') return run(() => cmd.toggleVisibility(store, ui.selection))
        if (e.shiftKey && letter === 'l') return run(() => cmd.toggleLock(store, ui.selection))
        if (e.code === 'BracketRight' || e.key === ']' || e.key === '}') {
          return run(() => cmd.reorderSelection(store, e.shiftKey ? 'front' : 'forward'))
        }
        if (e.code === 'BracketLeft' || e.key === '[' || e.key === '{') {
          return run(() => cmd.reorderSelection(store, e.shiftKey ? 'back' : 'backward'))
        }
        if (!e.shiftKey && !e.altKey) {
          // Copy/cut/paste: native clipboard events do the work when the browser sends
          // them; these keep an in-app copy so pasting works even when it doesn't.
          if (letter === 'c') {
            cmd.copyToClipboard(store)
            return
          }
          if (letter === 'x') {
            if (cmd.copyToClipboard(store)) run(() => cmd.deleteSelection(store))
            return
          }
          if (letter === 'v') {
            cmd.armPasteFallback(store)
            return
          }
        }
        switch (letter) {
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

      if (e.shiftKey && (e.code === 'Digit0' || e.key === ')')) return run(() => cmd.zoomTo(1))
      if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) return run(() => cmd.zoomToFit(store))
      if (e.shiftKey && (e.code === 'Digit2' || e.key === '@')) return run(() => cmd.zoomToSelection(store))

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

      if (e.shiftKey && letter === 'a') {
        return run(() => (e.altKey ? cmd.removeAutoLayoutFromSelection(store) : cmd.addAutoLayoutToSelection(store)))
      }
      if (e.altKey) {
        if (e.shiftKey && letter === 'h') return run(() => cmd.distributeSelection(store, 'horizontal'))
        if (e.shiftKey && letter === 'v') return run(() => cmd.distributeSelection(store, 'vertical'))
        const edge = e.shiftKey ? undefined : ALIGN_KEYS[letter]
        if (edge) run(() => cmd.alignSelection(store, edge))
        return
      }
      if (e.shiftKey) return
      if (letter === 'i') return run(() => cmd.pickImages(store))
      const tool = TOOL_KEYS[letter]
      if (tool) run(() => ui.setTool(tool))
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') useUI.getState().setSpaceHeld(false)
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
