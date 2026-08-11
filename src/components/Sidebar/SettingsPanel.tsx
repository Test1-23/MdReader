import { useState, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'

export function SettingsPanel() {
  const { state, dispatch } = useAppContext()
  const { isElectron } = useElectronAPI()
  const [endpoint, setEndpoint] = useState(state.apiEndpoint)
  const [apiKey, setApiKey] = useState(state.apiKey)
  const [model, setModel] = useState(state.apiModel)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Load saved config on mount
    if (isElectron && window.electronAPI) {
      window.electronAPI.loadApiConfig().then((config) => {
        if (config) {
          setEndpoint(config.endpoint)
          setApiKey(config.apiKey)
          setModel(config.model)
          dispatch({ type: 'SETTINGS_UPDATE', payload: config })
        }
      })
    }
  }, [isElectron, dispatch])

  const handleSave = async () => {
    const config = { endpoint, apiKey, model }
    if (isElectron && window.electronAPI) {
      await window.electronAPI.saveApiConfig(config)
    }
    dispatch({ type: 'SETTINGS_UPDATE', payload: config })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = async () => {
    if (isElectron && window.electronAPI) {
      await window.electronAPI.clearApiConfig()
    }
    setEndpoint('')
    setApiKey('')
    setModel('')
    dispatch({ type: 'SETTINGS_UPDATE', payload: { endpoint: '', apiKey: '', model: '' } })
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
            placeholder="sk-..."
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            Encrypted via system keychain (Electron safeStorage)
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
