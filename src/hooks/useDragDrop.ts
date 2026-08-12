import { useEffect, useRef } from 'react'
import { useLayoutContext, useUIContext } from '../context/AppContext'
import { useElectronAPI } from './useElectronAPI'
import { readDroppedFile, generateTabId } from '../utils/fileReader'

export function useDragDrop() {
  const { dispatch: layoutDispatch } = useLayoutContext()
  const { dispatch: uiDispatch } = useUIContext()
  const { readFile, isElectron } = useElectronAPI()
  const dragCounter = useRef(0)

  useEffect(() => {
    // 仅外部文件拖入（dataTransfer 含 Files）才显示全局 overlay —— 内部 tab/文件树拖拽不触发
    const isExternalFileDrag = (e: DragEvent): boolean => {
      return e.dataTransfer?.types?.includes('Files') ?? false
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
        dragCounter.current = 0
        uiDispatch({ type: 'SET_DRAG_OVER', payload: false })
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
      dragCounter.current = 0
      uiDispatch({ type: 'SET_DRAG_OVER', payload: false })

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const mdFiles = Array.from(files).filter((f) => {
        const name = f.name.toLowerCase()
        return name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.mdown') || name.endsWith('.mkd') || name.endsWith('.txt')
      })

      if (mdFiles.length === 0) {
        uiDispatch({ type: 'SET_ERROR', payload: 'No markdown file found in the dropped items.' })
        return
      }

      for (const file of mdFiles) {
        try {
          const openFile = await readDroppedFile(file, readFile, isElectron)
          if (openFile) {
            layoutDispatch({
              type: 'OPEN_FILE',
              payload: { ...openFile, tabId: generateTabId() },
            })
          }
        } catch {
          uiDispatch({ type: 'SET_ERROR', payload: 'Failed to read one of the dropped files.' })
        }
      }
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [layoutDispatch, uiDispatch, readFile, isElectron])
}
