const sharp = require('sharp')
const pngToIco = require('png-to-ico').default
const fs = require('fs')
const path = require('path')

/** 生成单个尺寸的圆形图标 Buffer */
async function createCircularIcon(src, size) {
  const circleR = size * 0.42
  const imageSize = Math.round(size * 0.78)
  const offset = Math.round((size - imageSize) / 2)

  // ── 1) 直接渲染白色圆形 SVG → PNG（必须带 xmlns，否则 sharp 渲染异常）──
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${circleR}" fill="white"/>
  </svg>`
  const circlePng = await sharp(Buffer.from(svg)).png().toBuffer()

  // ── 2) 缩放源图（白底 contain）──
  const logoBuf = await sharp(src)
    .resize(imageSize, imageSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer()

  // ── 3) 圆形 Png 做底 + logo 叠在上面 + 圆形 Png 做 dest-in 裁剪 ──
  return await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: circlePng, blend: 'over' },
      { input: logoBuf, top: offset, left: offset, blend: 'over' },
      { input: circlePng, blend: 'dest-in' },
    ])
    .png()
    .toBuffer()
}

async function main() {
  const src = path.resolve(__dirname, '../icons/myicons.jpg')
  const buildIco = path.resolve(__dirname, '../build/icon.ico')
  const publicIco = path.resolve(__dirname, '../public/icon.ico')
  const publicPng = path.resolve(__dirname, '../public/icon.png')

  // 图标源缺失时兜底：若仓库中已有提交的 icon.ico，则沿用现有图标（构建可复现）；否则报错。
  if (!fs.existsSync(src)) {
    const existing = [buildIco, publicIco].filter(p => fs.existsSync(p))
    if (existing.length > 0) {
      console.warn(`⚠ 未找到图标源 ${src}`)
      console.warn(`  已存在 ${existing.length} 个生成好的图标，跳过生成，沿用仓库现有图标。`)
      console.warn('  如需重新生成，请把源图放到 icons/myicons.jpg 后再执行 npm run generate-icon。')
      return
    }
    throw new Error(
      `未找到图标源 ${src}，且仓库中没有可用的 icon.ico。\n` +
      '请把源图放到 icons/myicons.jpg（或提交 build/icon.ico）后再构建。'
    )
  }

  const sizes = [16, 32, 48, 64, 128, 256]

  const pngBuffers = await Promise.all(sizes.map(s => createCircularIcon(src, s)))

  const icoBuf = await pngToIco(pngBuffers)
  // 输出到 build/（electron-builder 打包用，嵌入 exe 图标）
  fs.writeFileSync(buildIco, icoBuf)
  console.log(`✓ build/icon.ico (exe 图标)`)
  // 同时输出到 public/（渲染器通过 <img src="icon.ico"> 引用）
  fs.writeFileSync(publicIco, icoBuf)
  console.log(`✓ public/icon.ico (渲染器引用)`)

  // 同时生成 256px PNG 备用
  const png256 = await createCircularIcon(src, 256)
  fs.writeFileSync(publicPng, png256)
  console.log(`✓ public/icon.png`)

  // 同时输出到 extra-resources/icons/（electron-builder extraResources 配置，
  // 打包后会在 resources/icons/icon.ico，主进程 BrowserWindow.icon 显式引用此文件）
  const extraIco = path.resolve(__dirname, '../extra-resources/icons/icon.ico')
  fs.writeFileSync(extraIco, icoBuf)
  console.log(`✓ extra-resources/icons/icon.ico (BrowserWindow 显式图标)`)

  console.log('图标生成完成，共输出到 4 个位置')
}

main().catch(err => {
  console.error('生成图标失败:', err)
  process.exit(1)
})
