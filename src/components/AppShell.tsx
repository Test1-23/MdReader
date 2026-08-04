import React from 'react'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-full w-full flex overflow-hidden">
      {children}
    </div>
  )
}
