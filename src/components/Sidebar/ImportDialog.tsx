import { useEffect, useRef, useState } from 'react'

export interface ImportSeed {
  text: string
  sourceName: string | null
}

interface ImportDialogProps {
  seed: ImportSeed | null
  busy: boolean
  onClose: () => void
  onConfirm: (text: string) => void
  onPickFile: () => void
}

// 文本片段导入对话框（展示型）：textarea 来源文本 → 「转换为 .md」→ onConfirm
export function ImportDialog({ seed, busy, onClose, onConfirm, onPickFile }: ImportDialogProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 新种子（选择文件/拖拽）→ 填充并聚焦
  useEffect(() => {
    if (seed) {
      setText(seed.text)
      textareaRef.current?.focus()
    }
  }, [seed])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const canConfirm = text.trim().length > 0 && !busy

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center" data-import-dialog>
      <div
        className="absolute inset-0"
        onClick={onClose}
        title="关闭"
      />
      <div className="relative w-[480px] max-w-[calc(100vw-32px)] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl p-3 flex flex-col gap-2 select-text">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">📥 导入文本片段</h3>
          <button
            onClick={onClose}
            data-import-close
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition-colors"
            title="关闭 (Esc)"
          >
            ×
          </button>
        </div>

        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          粘贴或输入文本、选择 .txt/.md 文件、或直接拖拽文件到左侧面板。保存时自动轻量整理（首行转标题、规整空行）。
        </p>

        <textarea
          ref={textareaRef}
          data-import-textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="在此粘贴文本片段…"
          className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40 select-text"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onPickFile}
            className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            title="选择 .txt/.md 文件导入"
          >
            选择文件
          </button>
          <button
            onClick={() => onConfirm(text)}
            data-import-confirm
            disabled={!canConfirm}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              canConfirm
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-blue-200 text-blue-400 cursor-not-allowed'
            }`}
            title="保存为 .md 并在编辑器中打开"
          >
            {busy ? '保存中…' : '转换为 .md'}
          </button>
        </div>
      </div>
    </div>
  )
}
