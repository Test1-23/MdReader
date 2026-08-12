// E20: shared empty state for chat & tree views
export function EmptyChat() {
  return (
    <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
      No messages yet. Select text in the document to start.
    </div>
  )
}
