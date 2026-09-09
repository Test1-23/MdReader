import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'

/**
 * CSP 兜底：`index.html` 里的 `%VITE_CSP%` 由 Vite 用环境变量替换。若变量缺失
 * （例如用了非 production 的自定义 mode），Vite 会原样留下占位符 —— 浏览器会
 * 直接丢弃这条无法解析的策略，等于**没有任何 CSP**。这里让构建失败而不是
 * 静默产出一个无 CSP 的包。
 */
function cspGuard(): Plugin {
  return {
    name: 'mdreader-csp-guard',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (html.includes('%VITE_CSP%')) {
          throw new Error(
            'VITE_CSP is not defined — set it in .env.production (or the active mode env file). ' +
            'Refusing to emit a build without a Content-Security-Policy.',
          )
        }
        return html
      },
    },
  }
}

export default defineConfig({
  // B5: absolute "/assets/..." paths break under loadFile (file:// protocol)
  base: './',
  plugins: [
    cspGuard(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    electronRenderer()
  ],
  build: {
    outDir: 'dist'
  }
})
