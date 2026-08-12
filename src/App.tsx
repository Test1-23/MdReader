import { useEffect } from 'react'
import { AppProvider, useLayoutContext, useUIContext } from './context/AppContext'
import { collectAllTabs } from './utils/layout'
import { useDragDrop } from './hooks/useDragDrop'
import { usePasteHandler } from './hooks/usePasteHandler'
import { AppShell } from './components/AppShell'
import { ActivityBar } from './components/ActivityBar/ActivityBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MainArea } from './components/MainArea'
import { EmptyState } from './components/EmptyState'
import { ErrorBanner } from './components/ErrorBanner'
import { DragDropOverlay } from './components/DragDropOverlay'

function AppContent() {
  const { state: layoutState } = useLayoutContext()
  const { state } = useUIContext()

  // Register global event listeners
  useDragDrop()
  usePasteHandler()

  // Apply dark mode class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.darkMode)
  }, [state.darkMode])

  // 布局树中存在任何 tab（.md 或 AI 窗口）即视为有内容
  const hasOpenFiles = layoutState.layoutRoot !== null
    && collectAllTabs(layoutState.layoutRoot).length > 0

  return (
    <div className="h-full w-full flex flex-col overflow-hidden relative bg-white dark:bg-gray-900">
      <AppShell>
        <ActivityBar />
        {state.sidebarVisible && <Sidebar />}
        {hasOpenFiles ? <MainArea /> : <EmptyState />}
      </AppShell>

      {/* Overlays */}
      {state.isDragOver && <DragDropOverlay />}
      {state.error && <ErrorBanner />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
