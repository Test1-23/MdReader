import { useUIContext, useLayoutDispatch } from '../../context/AppContext'
import type { ActivityType } from '../../types'

const activities: { id: ActivityType; label: string; icon: string }[] = [
  { id: 'files', label: 'Explorer', icon: '📁' },
  { id: 'outline', label: 'Outline', icon: '📑' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function ActivityBar() {
  const { state, dispatch } = useUIContext()
  const layoutDispatch = useLayoutDispatch()

  return (
    <div className="w-activity min-w-activity flex flex-col items-center py-2 bg-[#333333] dark:bg-gray-900 text-white select-none">
      {activities.map((activity) => (
        <button
          key={activity.id}
          onClick={() => dispatch({ type: 'SET_ACTIVITY', payload: activity.id })}
          className={`
            w-12 h-12 flex items-center justify-center rounded-lg mb-1
            transition-colors duration-100 relative
            ${state.activeActivity === activity.id
              ? 'text-activity-active'
              : 'text-activity-inactive hover:text-white'
            }
          `}
          title={activity.label}
        >
          <span className="text-xl">{activity.icon}</span>
          {/* Active indicator */}
          {state.activeActivity === activity.id && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white rounded-r" />
          )}
        </button>
      ))}

      {/* AI 按钮：不是侧栏活动 —— 点击新建独立 AI 窗口，分屏在焦点分屏下方 */}
      <div className="border-t border-white/20 my-2 w-8" />
      <button
        onClick={() => layoutDispatch({ type: 'OPEN_AI_WINDOW_BELOW_FOCUS' })}
        className="w-12 h-12 flex items-center justify-center rounded-lg mb-1 transition-colors duration-100 text-activity-inactive hover:text-white"
        title="New AI Chat"
      >
        <span className="text-xl">💬</span>
      </button>
    </div>
  )
}
