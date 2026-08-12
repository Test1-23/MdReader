import { useEffect, useRef } from 'react'
import { useLayoutDispatch, useUIDispatch } from '../context/AppContext'
import { useElectronAPI } from './useElectronAPI'
import { readDroppedMarkdownFiles, generateTabId } from '../utils/fileReader'

export function useDragDrop() {
  const layoutDispatch = useLayoutDispatch()
  const uiDispatch = useUIDispatch()
  const { readFile, isElectron } = useElectronAPI()
  const dragCounter = useRef(0)

  useEffect(() => {
    // 仅外部文件拖入（dataTransfer 含 Files）才显示全局 overlay —— 内部 tab/文件树拖拽不触发
    const isExternalFileDrag = (e: DragEvent): boolean => {
      return e.dataTransfer?.types?.includes('Files') ?? false
    }

    const resetCounter = () => {
      dragCounter.current = 0
      uiDispatch({ type: 'SET_DRAG_OVER', payload: false })
    }

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isExternalFileDrag(e)) return
      dragCounter.current++
      if (dragCounter.current === 1) {
        uiDispatch({ type: 'SET_DRAG_OVER', payload: true })
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isExternalFileDrag(e)) return
      dragCounter.current--
      if (dragCounter.current <= 0) {
        resetCounter()
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = async (e: DragEvent) => {
      // Skip if already handled by an EditorGroup (propagation was stopped)
      if (e.defaultPrevented) return

      e.preventDefault()
      e.stopPropagation()
      resetCounter()

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const opened = await readDroppedMarkdownFiles(Array.from(files), readFile, isElectron)

      if (opened.length === 0) {
        uiDispatch({ type: 'SET_ERROR', payload: 'No markdown file found in the dropped items.' })
        return
      }

      for (const openFile of opened) {
        layoutDispatch({
          type: 'OPEN_FILE',
          payload: { ...openFile, tabId: generateTabId() },
        })
      }
    }

    // B20h: EditorGroup stops propagation on its own drop, so the bubble-phase
    // handler above never sees it — a capture-phase drop listener and a
    // dragend listener keep the counter consistent (ESC cancel and abnormal
    // drag exits land here too; without this the overlay can stick forever).
    const handleDropCapture = () => resetCounter()
    const handleDragEnd = () => resetCounter()

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('drop', handleDropCapture, true)
    window.addEventListener('dragend', handleDragEnd)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('drop', handleDropCapture, true)
      window.removeEventListener('dragend', handleDragEnd)
    }
  }, [layoutDispatch, uiDispatch, readFile, isElectron])
}
