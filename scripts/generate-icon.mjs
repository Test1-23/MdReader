// 由 assets/icon.svg 生成 assets/icon.png（1024×1024，含透明通道）。
//
//   npm run icon:generate
//
// 用 Electron 无头渲染 SVG 再截图 —— 零新增依赖（复用已有的 electron），
// 抗锯齿由 Chromium 保证。生成结果提交到仓库，日常构建无需重跑。

import { app, BrowserWindow, nativeImage } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 1024
const SVG_PATH = join(root, 'assets', 'icon.svg')
const OUT_PATH = join(root, 'assets', 'icon.png')

function fail(message) {
  console.error(`✗ ${message}`)
  app.exit(1)
}

app.whenReady().then(async () => {
  let svg
  try {
    svg = await readFile(SVG_PATH, 'utf-8')
  } catch (err) {
    return fail(`cannot read ${SVG_PATH}: ${err.message}`)
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
  svg{display:block;width:${SIZE}px;height:${SIZE}px}
</style></head><body>${svg}</body></html>`

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: false },
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // 等待一帧，确保 SVG 已完成光栅化
    await new Promise((r) => setTimeout(r, 400))

    const captured = await win.webContents.capturePage()
    const capturedSize = captured.getSize()
    // capturePage 返回的是物理像素（受 DPI 缩放影响，可能 > SIZE）——
    // 高分辨率下采样到目标尺寸，质量更好
    const image = capturedSize.width === SIZE && capturedSize.height === SIZE
      ? captured
      : captured.resize({ width: SIZE, height: SIZE, quality: 'best' })

    const { width, height } = image.getSize()
    if (width !== SIZE || height !== SIZE) {
      return fail(`unexpected icon size ${width}x${height} (want ${SIZE}x${SIZE})`)
    }

    // 自检：角落像素必须完全透明（圆角外的留白），否则说明透明通道丢失
    const bitmap = image.toBitmap() // BGRA
    const cornerAlpha = bitmap[3]
    const centerAlpha = bitmap[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3]
    console.log(`captured ${capturedSize.width}x${capturedSize.height} → ${width}x${height} — corner alpha=${cornerAlpha}, center alpha=${centerAlpha}`)
    if (cornerAlpha !== 0) {
      return fail('corner is not transparent — alpha channel lost during capture')
    }
    if (centerAlpha !== 255) {
      return fail('center is not opaque — icon did not render')
    }

    const png = image.toPNG()
    await mkdir(dirname(OUT_PATH), { recursive: true })
    await writeFile(OUT_PATH, png)

    // 回读校验：确认写出的 PNG 能被解析且尺寸正确
    const written = nativeImage.createFromPath(OUT_PATH)
    const writtenSize = written.getSize()
    if (writtenSize.width !== SIZE || writtenSize.height !== SIZE) {
      return fail(`written PNG is ${writtenSize.width}x${writtenSize.height}, want ${SIZE}x${SIZE}`)
    }

    console.log(`✓ wrote ${OUT_PATH} (${(png.length / 1024).toFixed(1)} KB, ${SIZE}x${SIZE}, transparent)`)
    win.destroy()
    app.exit(0)
  } catch (err) {
    fail(err?.stack || String(err))
  }
})
