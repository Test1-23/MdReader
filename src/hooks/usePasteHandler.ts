import { useEffect } from 'react'
import { useLayoutDispatch } from '../context/AppContext'
import { generateFileId, extractHeadings } from '../utils/markdown'
import { generateTabId } from '../utils/fileReader'
import type { OpenFile } from '../types'

export function usePasteHandler() {
  const dispatch = useLayoutDispatch()

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste when focus is on an input/textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const text = e.clipboardData?.getData('text/plain')
      if (!text || text.trim().length === 0) return

      const now = Date.now()
      const dateStr = new Date().toLocaleString()
      const fileName = `Pasted - ${dateStr}`
      const fileId = generateFileId(`pasted-${now}`)
      const headings = extractHeadings(text)

      const openFile: OpenFile = {
        fileId,
        filePath: '', // No file path for pasted content
        fileName,
        content: text,
        fileSize: new Blob([text]).size,
        lastModified: now,
        headings,
      }

      dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId() } })
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [dispatch])
}
