import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface PanelHeaderProps {
  icon?: LucideIcon
  title: string
  actions?: ReactNode
}

// 统一的面板头部（此前两套排版收敛于此）
export function PanelHeader({ icon: Icon, title, actions }: PanelHeaderProps) {
  return (
    <div className="h-10 px-3 flex items-center gap-2 border-b border-chrome-border shrink-0">
      {Icon && <Icon size={16} className="text-chrome-text-muted shrink-0" />}
      <h3 className="text-[13px] font-semibold text-chrome-text-muted flex-1 truncate">{title}</h3>
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}
