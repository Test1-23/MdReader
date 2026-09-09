import { useState, useEffect } from 'react'
import { useUIContext } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { Check } from 'lucide-react'

export function SettingsPanel() {
  const { state, dispatch } = useUIContext()
  const { isElectron } = useElectronAPI()
  const [endpoint, setEndpoint] = useState(state.apiEndpoint)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(state.apiModel)
  const [hasKey, setHasKey] = useState(state.apiKeySaved)
  const [saved, setSaved] = useState(false)

  // 配置由 AppProvider 在启动时统一加载到 context（单一数据源）——这里只做同步，
  // 不再重复请求一次 loadApiConfig
  useEffect(() => {
    setEndpoint(state.apiEndpoint)
    setModel(state.apiModel)
    setHasKey(state.apiKeySaved)
  }, [state.apiEndpoint, state.apiModel, state.apiKeySaved])

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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="block text-[13px] font-semibold text-chrome-text-muted mb-1">
            API Endpoint
          </label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-2 text-[13px] border border-chrome-border rounded-lg bg-chrome-surface text-chrome-text focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <p className="text-[10px] text-chrome-text-faint mt-1">
            OpenAI-compatible API base URL (e.g. https://api.openai.com/v1)
          </p>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-chrome-text-muted mb-1">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '•••••••• 已保存，留空保持不变' : 'sk-...'}
            className="w-full px-3 py-2 text-[13px] border border-chrome-border rounded-lg bg-chrome-surface text-chrome-text focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <p className="text-[10px] text-chrome-text-faint mt-1">
            Encrypted via system keychain (Electron safeStorage). The key never leaves the main process.
          </p>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-chrome-text-muted mb-1">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o"
            className="w-full px-3 py-2 text-[13px] border border-chrome-border rounded-lg bg-chrome-surface text-chrome-text focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      <div className="px-3 py-2 border-t border-chrome-border flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {saved && <Check size={14} />}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 text-xs border border-chrome-border bg-chrome-surface hover:bg-chrome-hover text-chrome-text rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
