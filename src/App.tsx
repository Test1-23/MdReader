import { useEffect } from 'react'
import { AppProvider, useAppContext } from './context/AppContext'
import { useDragDrop } from './hooks/useDragDrop'
import { usePasteHandler } from './hooks/usePasteHandler'
import { AppShell } from './components/AppShell'
import { ActivityBar } from './components/ActivityBar/ActivityBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MainArea } from './components/MainArea'
import { EmptyState } from './components/EmptyState'
import { ErrorBanner } from './components/ErrorBanner'
import { DragDropOverlay } from './components/DragDropOverlay'
import { AIChatPanel } from './components/AIChat/AIChatPanel'

function AppContent() {
  const { state } = useAppContext()

  // Register global event listeners
  useDragDrop()
  usePasteHandler()

  // Apply dark mode class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.darkMode)
  }, [state.darkMode])

  const hasOpenFiles = state.layoutRoot !== null && state.openFiles && Object.keys(state.openFiles).length > 0

  return (
    <div className="h-full w-full flex flex-col overflow-hidden relative bg-white dark:bg-gray-900">
      <AppShell>
        <ActivityBar />
        {state.sidebarVisible && <Sidebar />}
        {hasOpenFiles ? <MainArea /> : <EmptyState />}
        {state.showChatPanel && state.chatPosition !== 'bottom' && <AIChatPanel />}
      </AppShell>

      {/* Bottom-positioned chat panel */}
      {state.showChatPanel && state.chatPosition === 'bottom' && (
        <div className="absolute bottom-0 left-0 right-0 h-60 z-20 flex">
          <AIChatPanel />
        </div>
      )}

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
