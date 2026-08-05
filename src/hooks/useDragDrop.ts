import { useEffect, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { useElectronAPI } from './useElectronAPI'
import { generateFileId, getFileName } from '../utils/markdown'
import { extractHeadings } from '../utils/markdown'
import type { OpenFile } from '../types'

export function useDragDrop() {
  const { dispatch } = useAppContext()
  const { readFile, isElectron } = useElectronAPI()
  const dragCounter = useRef(0)

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      if (dragCounter.current === 1) {
        dispatch({ type: 'SET_DRAG_OVER', payload: true })
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        dispatch({ type: 'SET_DRAG_OVER', payload: false })
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      dispatch({ type: 'SET_DRAG_OVER', payload: false })

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      // Find the first markdown file
      const file = Array.from(files).find((f) => {
        const name = f.name.toLowerCase()
        return name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.mdown') || name.endsWith('.mkd') || name.endsWith('.txt')
      })

      if (!file) {
        dispatch({ type: 'SET_ERROR', payload: 'No markdown file found in the dropped items.' })
        return
      }

      try {
        let content: string
        let filePath: string
        let size: number
        let lastModified: number

        if (isElectron && (file as any).path) {
          // In Electron, File objects expose the real path
          filePath = (file as any).path
          const result = await readFile(filePath)
          content = result.content
          size = result.size
          lastModified = result.lastModified
        } else {
          // Fallback for browser: use FileReader
          filePath = ''
          const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            const timeout = setTimeout(() => reject(new Error('File read timed out')), 30000)
            reader.onload = () => { clearTimeout(timeout); resolve(reader.result as string) }
            reader.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to read file')) }
            reader.readAsText(file)
          })
          content = text
          size = file.size
          lastModified = file.lastModified
        }

        const fileName = getFileName(filePath || file.name)
        const fileId = generateFileId(filePath || file.name)
        const headings = extractHeadings(content)

        const openFile: OpenFile = {
          fileId,
          filePath,
          fileName,
          content,
          fileSize: size,
          lastModified,
          headings,
        }

        dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } })
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to read the dropped file.' })
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
  }, [dispatch, readFile, isElectron])
}
