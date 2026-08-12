import { useState, useEffect } from 'react'
import { useUIContext } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'

export function SettingsPanel() {
  const { state, dispatch } = useUIContext()
  const { isElectron } = useElectronAPI()
  const [endpoint, setEndpoint] = useState(state.apiEndpoint)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(state.apiModel)
  const [hasKey, setHasKey] = useState(state.apiKeySaved)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Load saved config on mount — S1: the key itself never comes back to the
    // renderer, only whether one is stored.
    if (isElectron && window.electronAPI) {
      window.electronAPI.loadApiConfig().then((config) => {
        if (config) {
          setEndpoint(config.endpoint)
          setModel(config.model)
          setHasKey(config.hasKey)
          dispatch({ type: 'SETTINGS_UPDATE', payload: { endpoint: config.endpoint, model: config.model, hasKey: config.hasKey } })
        }
      }).catch(() => { /* no config file */ })
    }
  }, [isElectron, dispatch])

  // Clean up the "Saved ✓" timer on unmount
  useEffect(() => {
    const timer = saved ? setTimeout(() => setSaved(false), 2000) : undefined
    return () => { if (timer) clearTimeout(timer) }
  }, [saved])

  const handleSave = async () => {
    // Empty key input = keep the stored key (the renderer can never read it back)
    const config = { endpoint, apiKey, model }
    if (isElectron && window.electronAPI) {
      await window.electronAPI.saveApiConfig(config)
    }
    dispatch({ type: 'SETTINGS_UPDATE', payload: { endpoint, model, hasKey: hasKey || !!apiKey } })
    setHasKey(hasKey || !!apiKey)
    setApiKey('')
    setSaved(true)
  }

  const handleClear = async () => {
    if (isElectron && window.electronAPI) {
      await window.electronAPI.clearApiConfig()
    }
    setEndpoint('')
    setApiKey('')
    setModel('')
    setHasKey(false)
    dispatch({ type: 'SETTINGS_UPDATE', payload: { endpoint: '', model: '', hasKey: false } })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            API Endpoint
          </label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            OpenAI-compatible API base URL (e.g. https://api.openai.com/v1)
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '•••••••• 已保存，留空保持不变' : 'sk-...'}
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            Encrypted via system keychain (Electron safeStorage). The key never leaves the main process.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="px-3 py-2 border-t border-gray-300 dark:border-gray-700 flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
