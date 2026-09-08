import { useUIContext, useLayoutDispatch } from '../../context/AppContext'
import type { ActivityType } from '../../types'
import { Files, ListTree, Settings, MessageSquare } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const activities: { id: ActivityType; label: string; icon: LucideIcon }[] = [
  { id: 'files', label: 'Explorer', icon: Files },
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function ActivityBar() {
  const { state, dispatch } = useUIContext()
  const layoutDispatch = useLayoutDispatch()

  return (
    <div className="w-activity min-w-activity flex flex-col items-center py-3 bg-activity text-white select-none">
      {activities.map((activity) => (
        <button
          key={activity.id}
          onClick={() => dispatch({ type: 'SET_ACTIVITY', payload: activity.id })}
          className={`
            w-10 h-10 flex items-center justify-center rounded-xl mb-1
            transition-colors duration-100 relative
            ${state.activeActivity === activity.id
              ? 'text-activity-active bg-white/10'
              : 'text-activity-inactive hover:text-white hover:bg-white/5'
            }
          `}
          title={activity.label}
        >
          <activity.icon size={20} />
          {/* Active indicator */}
          {state.activeActivity === activity.id && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-full" />
          )}
        </button>
      ))}

      {/* AI 按钮：不是侧栏活动 —— 点击新建独立 AI 窗口，分屏在焦点分屏下方 */}
      <div className="border-t border-white/15 my-2 w-8" />
      <button
        onClick={() => layoutDispatch({ type: 'OPEN_AI_WINDOW_BELOW_FOCUS' })}
        className="w-10 h-10 flex items-center justify-center rounded-xl mb-1 transition-colors duration-100 text-activity-inactive hover:text-white hover:bg-white/5"
        title="New AI Chat"
      >
        <MessageSquare size={20} />
      </button>
    </div>
  )
}
