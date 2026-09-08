import { useEffect, useRef, useState } from 'react'
import { Import, X } from 'lucide-react'
import { IconButton } from '../shared/IconButton'
import { PRIMARY_BTN } from '../shared/classes'

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
      <div className="relative w-[480px] max-w-[calc(100vw-32px)] bg-chrome-raised border border-chrome-border rounded-xl shadow-2xl p-4 flex flex-col gap-2 select-text">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-chrome-text flex items-center gap-1.5">
            <Import size={14} className="text-chrome-text-muted" />
            导入文本片段
          </h3>
          <IconButton icon={X} title="关闭 (Esc)" onClick={onClose} data-import-close="" />
        </div>

        <p className="text-[10px] text-chrome-text-faint">
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
          className="w-full px-3 py-2 text-[13px] border border-chrome-border rounded-lg bg-chrome-surface text-chrome-text resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40 select-text"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onPickFile}
            className="px-3 py-1.5 text-xs border border-chrome-border bg-chrome-surface hover:bg-chrome-hover text-chrome-text rounded-lg transition-colors"
            title="选择 .txt/.md 文件导入"
          >
            选择文件
          </button>
          <button
            onClick={() => onConfirm(text)}
            data-import-confirm
            disabled={!canConfirm}
            className={PRIMARY_BTN}
            title="保存为 .md 并在编辑器中打开"
          >
            {busy ? '保存中…' : '转换为 .md'}
          </button>
        </div>
      </div>
    </div>
  )
}
