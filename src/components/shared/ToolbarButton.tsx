import type { LucideIcon } from 'lucide-react'

interface ToolbarButtonProps {
  icon?: LucideIcon
  label?: string
  title: string
  onClick: () => void
  className?: string
  disabled?: boolean
}

// 统一的次级工具栏按钮（此前两种工具栏风格收敛于此）
export function ToolbarButton({ icon: Icon, label, title, onClick, className = '', disabled = false }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]
        rounded-lg border border-chrome-border bg-chrome-surface
        hover:bg-chrome-hover text-chrome-text transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {Icon && <Icon size={14} className="text-chrome-text-muted shrink-0" />}
      {label && <span className="truncate">{label}</span>}
    </button>
  )
}
