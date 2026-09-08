import type { LucideIcon } from 'lucide-react'

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<IconButtonSize, { box: string; icon: number }> = {
  xs: { box: 'w-4 h-4', icon: 12 },
  sm: { box: 'w-5 h-5', icon: 14 },
  md: { box: 'w-7 h-7', icon: 16 },
  lg: { box: 'w-9 h-9', icon: 18 },
}

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'title' | 'className'> {
  icon: LucideIcon
  title: string
  onClick: () => void
  size?: IconButtonSize
  round?: boolean
  className?: string
  disabled?: boolean
}

// 统一的图标按钮（此前 5 种 × 变体收敛于此）
export function IconButton({ icon: Icon, title, onClick, size = 'md', round = false, className = '', disabled = false, ...rest }: IconButtonProps) {
  const { box, icon: iconSize } = SIZE_CLASS[size]
  return (
    <button
      {...rest}
      onClick={(e) => {
        e.stopPropagation() // 图标按钮常嵌在可点击行内（tab/列表项）——不冒泡
        onClick()
      }}
      title={title}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center ${box}
        ${round ? 'rounded-full' : 'rounded-md'}
        text-chrome-text-faint hover:text-chrome-text hover:bg-chrome-hover
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <Icon size={iconSize} />
    </button>
  )
}
