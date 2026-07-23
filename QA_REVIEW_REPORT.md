# QA 审查报告 — Electron 离线办公工具

## 审查摘要

| 指标 | 数值 |
|------|------|
| 审查文件数 | 18（12 指定文件 + 6 关联模块文件） |
| 发现问题数 | 18（P0: 1, P1: 10, P2: 7） |
| 通过检查项 | 16 |
| 风险等级 | **高** |
| 建议是否可发布 | **否** — 存在 P0 阻塞问题 |

---

## 问题列表

---

### [P0] `loadImage()` 未 await — 图片转PDF模块必崩

- **文件**：`src-electron/main/modules/imageToPdf/service.ts`
- **行号**：第 40 行、第 49 行
- **问题描述**：
  `@napi-rs/canvas` 的 `loadImage()` 函数返回 `Promise<Image>`（异步），但代码将其作为同步返回值使用，未使用 `await`。

  ```typescript
  // 第 38-42 行 — getImageSize 函数（死代码，但同样有误）
  function getImageSize(filePath: string): { width: number; height: number } {
    const { loadImage } = getCanvas()
    const img = loadImage(filePath)  // ← 返回 Promise<Image>，不是 Image
    return { width: img.width, height: img.height }  // ← img.width 为 undefined
  }

  // 第 47-59 行 — imageToJpegBuffer 函数（被实际调用，会崩溃）
  function imageToJpegBuffer(filePath: string, quality: number): Buffer {
    const { loadImage, createCanvas } = getCanvas()
    const img = loadImage(filePath)       // ← Promise<Image>，不是 Image
    const canvas = createCanvas(img.width, img.height)  // ← createCanvas(undefined, undefined)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, img.width, img.height)  // ← fillRect(0, 0, undefined, undefined)
    ctx.drawImage(img, 0, 0)  // ← drawImage(Promise, 0, 0) → 崩溃！
    return canvas.toBuffer('image/jpeg', quality)
  }
  ```

- **根因分析**：
  `@napi-rs/canvas` 从 v0.1.40 起，`loadImage` 的类型签名为：
  ```typescript
  export function loadImage(input: string | Buffer, options?: any): Promise<Image>
  ```
  它始终返回 `Promise<Image>`。代码中 `const img = loadImage(filePath)` 得到的是一个 Promise 对象，而非 Image 实例。后续 `img.width` 为 `undefined`，`ctx.drawImage(img, 0, 0)` 因第一个参数不是 Image/Canvas 类型而抛出运行时异常。

  `imageToJpegBuffer` 在 `convertImagesToPdf` 第 118 行被调用，因此**每次使用"图片转PDF"功能时都会崩溃**。

- **修复建议**：
  将 `loadImage` 改为 `await` 调用，并将函数改为 `async`：

  ```typescript
  async function imageToJpegBuffer(filePath: string, quality: number): Promise<Buffer> {
    const { loadImage, createCanvas } = getCanvas()
    const img = await loadImage(filePath)  // ← 添加 await
    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, img.width, img.height)
    ctx.drawImage(img, 0, 0)
    return canvas.toBuffer('image/jpeg', { quality })  // ← 同时修复 quality 参数格式（见 P1-3）
  }
  ```

  同时修改调用处（第 118 行）：
  ```typescript
  const jpegBuffer = await imageToJpegBuffer(filePath, quality)  // ← 添加 await
  ```

  `getImageSize` 函数是死代码（从未被调用），建议直接删除。

- **影响范围**：图片转PDF功能完全不可用，用户点击转换后必定崩溃。崩溃被 IPC handler 的 catch 捕获，返回错误信息给前端，不会导致整个应用退出，但功能不可用。

---

### [P1-1] `pdfDoc.destroy()` 在错误路径不执行 — PDF文档资源泄漏

- **文件**：`src-electron/main/modules/pdfConvert/service.ts`
- **行号**：第 254-296 行
- **问题描述**：
  `pdfDoc.destroy()` 在第 292 行调用，位于 `try` 块的末尾。如果内层循环（逐页转换）中 `renderPageToImage` 抛出异常，错误会直接跳到第 293 行的 `catch` 块，`pdfDoc.destroy()` 永远不会被执行。

  ```typescript
  try {
    // ... 加载 PDF ...
    const pdfDoc = await loadingTask.promise

    for (let idx = 0; idx < pagesToConvert.length; idx++) {
      // ... 渲染页面 ...
      const imageBuffer = await renderPageToImage(...)  // ← 可能抛出异常
      // ...
    }

    pdfDoc.destroy()  // ← 第 292 行：如果上面抛出异常，这行不会执行
  } catch (error: any) {
    throw new Error(`转换失败: ${fileName} - ${error.message}`)
    // ← pdfDoc 未被销毁，资源泄漏
  }
  ```

- **根因分析**：
  缺少 `finally` 块来保证资源清理。pdfjs-dist 的 PDFDocument 持有大量内部资源（页面缓存、字体数据、流处理器等），不调用 `destroy()` 会导致内存泄漏。

- **修复建议**：
  ```typescript
  let pdfDoc: any = null
  try {
    const loadingTask = pdfjs.getDocument({ ... })
    pdfDoc = await loadingTask.promise
    // ... 转换逻辑 ...
  } catch (error: any) {
    throw new Error(`转换失败: ${fileName} - ${error.message}`)
  } finally {
    if (pdfDoc) {
      try { await pdfDoc.destroy() } catch {}
    }
  }
  ```

- **影响范围**：转换失败时（如损坏的PDF、渲染错误），pdfjs-dist 内部资源不会被释放。连续转换多个有问题的PDF文件时，内存使用持续增长。

---

### [P1-2] Canvas 渲染后未显式释放 — 原生内存泄漏

- **文件**：`src-electron/main/modules/pdfConvert/service.ts`
- **行号**：第 327-352 行（`renderPageToImage` 函数）
- **问题描述**：
  每页渲染都会通过 `createCanvas(width, height)` 创建一个原生 Canvas 对象，但渲染完成后没有显式释放。`@napi-rs/canvas` 的 Canvas 底层是 Rust 分配的 Skia 位图内存，不会自动被 V8 GC 回收。

  ```typescript
  async function renderPageToImage(...): Promise<Buffer> {
    const { createCanvas } = getCanvas()
    const canvas = createCanvas(viewport.width, viewport.height)  // ← 创建原生Canvas
    const ctx = canvas.getContext('2d')
    // ... 渲染 ...
    const buffer = canvas.toBuffer(mimeType, ...)
    page.cleanup()
    return buffer
    // ← canvas 未释放！高分辨率（4x）大页面时，单页可能占用数十MB
  }
  ```

- **根因分析**：
  `@napi-rs/canvas` 的 Canvas 对象底层是 Rust 的 `skia_safe::Surface`，分配在堆上。虽然 JS 层的引用被 GC 后 Rust 的 Drop 会触发，但 V8 GC 时机不确定，在高频创建场景下（批量转换100+页PDF），内存压力会导致进程 OOM。

- **修复建议**：
  ```typescript
  async function renderPageToImage(...): Promise<Buffer> {
    const { createCanvas } = getCanvas()
    const canvas = createCanvas(viewport.width, viewport.height)
    try {
      const ctx = canvas.getContext('2d')
      // ... 渲染逻辑 ...
      const buffer = canvas.toBuffer(mimeType, ...)
      page.cleanup()
      return buffer
    } finally {
      // 显式释放原生 Canvas 内存
      canvas.width = 0
      canvas.height = 0
    }
  }
  ```

- **影响范围**：批量转换大PDF文件（100+页，4x缩放）时，内存可能从几百MB飙升到数GB，最终导致进程崩溃。

---

### [P1-3] `canvas.toBuffer()` quality 参数格式错误 — JPEG质量设置无效

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 347 行；`src-electron/main/modules/imageToPdf/service.ts` 第 58 行
- **问题描述**：
  `@napi-rs/canvas` 的 `toBuffer(mime, config)` 第二个参数应为对象 `{ quality: number }`，但代码传入了一个裸数字。

  ```typescript
  // pdfConvert/service.ts 第 347 行
  const buffer = canvas.toBuffer(mimeType, format === 'jpg' ? quality : undefined)
  //                                         ↑ 传入 0.92（number），应为 { quality: 0.92 }

  // imageToPdf/service.ts 第 58 行
  return canvas.toBuffer('image/jpeg', quality)
  //                               ↑ 传入 number，应为 { quality }
  ```

- **根因分析**：
  `@napi-rs/canvas` 的 `toBuffer` 签名：
  ```typescript
  toBuffer(mime?: string, config?: { quality?: number; progressive?: boolean }): Buffer
  ```
  传入裸数字时，`const { quality } = 0.92` 解构结果为 `undefined`，JPEG 使用默认质量（约75%），用户设置的0.92质量被忽略。

- **修复建议**：
  ```typescript
  // pdfConvert/service.ts
  const buffer = canvas.toBuffer(
    mimeType,
    format === 'jpg' ? { quality } : undefined
  )

  // imageToPdf/service.ts
  return canvas.toBuffer('image/jpeg', { quality })
  ```

- **影响范围**：用户选择的JPG质量（30%-100%）不生效，所有JPEG输出使用默认质量。不影响功能，但影响输出质量和文件大小。

---

### [P1-4] 窗口图标路径在打包后不存在 — 应用窗口无自定义图标

- **文件**：`src-electron/main/core/windowManager.ts` 第 15 行；`electron-builder.config.js` 第 11-19 行
- **问题描述**：
  窗口创建时引用 `build/icon.ico` 作为图标，但 `electron-builder.config.js` 的 `files` 列表中未包含 `build/` 目录。

  ```typescript
  // windowManager.ts 第 15 行
  icon: path.join(__dirname, '../../build/icon.ico'),
  ```

  ```javascript
  // electron-builder.config.js — files 列表
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    'extra-resources/**/*',
    'node_modules/pdfjs-dist/**/*',
    // ... 没有 build/ 目录！
  ]
  ```

- **根因分析**：
  `electron-builder` 的 `buildResources`（默认为 `build/`）目录仅在**构建时**使用（如安装程序图标），其内容**不会**自动包含在最终应用的 `app/` 目录中。打包后 `__dirname` 为 `.../app-1.0.0/dist-electron/main/`，向上两级到达 `app-1.0.0/`，`build/icon.ico` 不存在于此路径。

- **修复建议**：
  方案一：将图标文件复制到 `dist` 或 `extra-resources` 目录：
  ```javascript
  // electron-builder.config.js
  extraResources: [
    { from: 'build/icon.ico', to: 'icon.ico' },
    // ...
  ]
  ```
  然后修改引用路径：
  ```typescript
  // 开发环境与生产环境兼容
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../build/icon.ico')
  ```

  方案二：在 `files` 中添加 `'build/icon.ico'`。

- **影响范围**：打包后应用窗口标题栏和任务栏显示默认 Electron 图标，而非自定义品牌图标。开发环境正常（因为 `build/` 目录存在）。

---

### [P1-5] `mainWindow.webContents.send()` 缺少 null 守卫 — 窗口关闭后可能崩溃

- **文件**：`src-electron/main/modules/imageToPdf/index.ts` 第 11 行；`src-electron/main/modules/pdfMerge/index.ts` 第 10 行；`src-electron/main/modules/pdfSplit/index.ts` 第 10 行
- **问题描述**：
  三个模块的进度推送直接使用 `mainWindow.webContents.send()`，没有检查窗口是否仍然存活。对比 `pdfConvert/index.ts` 使用了 `BrowserWindow.fromWebContents(event.sender)` + null 检查的正确模式。

  ```typescript
  // imageToPdf/index.ts 第 9-12 行 — 不安全
  const result = await convertImagesToPdf(options, (progress) => {
    mainWindow.webContents.send('image:convertToPdf:progress', progress)
    // ← 如果 mainWindow 已关闭，webContents 已销毁，此处抛出异常
  })

  // pdfConvert/index.ts 第 10-15 行 — 正确做法
  const result = await pdfConvertService.convertPdfToImages(options, (progress) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.send('pdf:convert:progress', progress)
    }
  })
  ```

- **根因分析**：
  当用户在转换过程中关闭窗口时，`window-all-closed` 事件触发 `app.quit()`，但异步的 IPC handler 可能仍在执行。此时 `mainWindow.webContents` 已被销毁，调用 `.send()` 抛出 `Error: Object has been destroyed`。

- **修复建议**：
  统一使用 `BrowserWindow.fromWebContents` 模式，或添加 `isDestroyed()` 检查：
  ```typescript
  const result = await convertImagesToPdf(options, (progress) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('image:convertToPdf:progress', progress)
    }
  })
  ```

- **影响范围**：用户在转换过程中关闭窗口时，主进程可能抛出未捕获异常。虽然 `uncaughtException` 处理器会捕获它，但可能导致转换中断后的清理逻辑异常。

---

### [P1-6] 缺少 `cMapUrl` 和 `standardFontDataUrl` — CJK文本无法正确渲染

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 229-235 行
- **问题描述**：
  `getDocument` 调用未设置 `cMapUrl` 和 `standardFontDataUrl`，导致包含 CJK（中文/日文/韩文）字符的 PDF 无法正确渲染文本。

  ```typescript
  const loadingTask = pdfjs.getDocument({
    data: pdfData,
    useSystemFonts: false,
    isEvalSupported: false,
    canvasFactory: canvasFactory,
    disableFontFace: true,
    // ← 缺少 cMapUrl
    // ← 缺少 standardFontDataUrl
  })
  ```

- **根因分析**：
  pdfjs-dist 使用 CMap 数据来映射 CJK 字符编码。不设置 `cMapUrl` 时，pdfjs 无法加载 CMap 数据，CJK 文本会渲染为空白或乱码方框。`disableFontFace: true` 虽然避免了字体加载问题，但不影响 CMap 需求。

  pdfjs-dist 的 cMap 和标准字体文件位于：
  - `node_modules/pdfjs-dist/cmaps/`
  - `node_modules/pdfjs-dist/standard_fonts/`

  这些文件已包含在 `electron-builder.config.js` 的 `files` 中（`node_modules/pdfjs-dist/**/*`）。

- **修复建议**：
  ```typescript
  const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json')
  const pdfjsDir = path.dirname(pdfjsPkgPath)

  const loadingTask = pdfjs.getDocument({
    data: pdfData,
    useSystemFonts: false,
    isEvalSupported: false,
    canvasFactory: canvasFactory,
    disableFontFace: true,
    cMapUrl: path.join(pdfjsDir, 'cmaps') + path.sep,  // 注意末尾分隔符
    cMapPacked: true,
    standardFontDataUrl: path.join(pdfjsDir, 'standard_fonts') + path.sep,
  })
  ```

- **影响范围**：作为"离线办公工具"，处理中文 PDF 是核心场景。缺少 CMap 配置会导致中文 PDF 转出的图片中文部分为空白/方框，严重影响用户体验。

---

### [P1-7] `loadingTask` 在错误路径未销毁 — 加载任务资源泄漏

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 229-236 行
- **问题描述**：
  `pdfjs.getDocument()` 返回的 `loadingTask` 在 `promise` reject 时不被清理。`loadingTask` 持有 Worker 线程引用和内部流处理器。

  ```typescript
  const loadingTask = pdfjs.getDocument({ data: pdfData, ... })
  const pdfDoc = await loadingTask.promise  // ← 如果 reject，loadingTask 未销毁
  ```

- **根因分析**：
  如果 PDF 文件损坏或加密导致加载失败，`loadingTask.promise` 会 reject，但 `loadingTask.destroy()` 从未被调用。pdfjs-dist 的 loadingTask 内部可能持有一个 worker_threads Worker 实例，不销毁会导致线程泄漏。

- **修复建议**：
  ```typescript
  const loadingTask = pdfjs.getDocument({ data: pdfData, ... })
  try {
    const pdfDoc = await loadingTask.promise
    // ... 使用 pdfDoc ...
  } catch (error) {
    try { await loadingTask.destroy() } catch {}
    throw error
  }
  ```

- **影响范围**：连续处理多个损坏/加密 PDF 文件时，worker_threads 逐渐累积，最终达到 Node.js 线程上限或内存溢出。

---

### [P1-8] `page.cleanup()` 在渲染错误路径未调用 — 页面资源泄漏

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 339-352 行
- **问题描述**：
  `page.cleanup()` 在第 350 行调用，位于 `page.render().promise` 之后。如果渲染失败（抛出异常），`cleanup()` 不会执行。

  ```typescript
  await page.render({
    canvasContext: ctx,
    viewport: viewport,
    canvasFactory: canvasFactory,
  }).promise  // ← 可能 reject

  const buffer = canvas.toBuffer(mimeType, ...)
  page.cleanup()  // ← 渲染失败时不执行
  ```

- **修复建议**：
  ```typescript
  const page = await pdfDoc.getPage(pageNum)
  try {
    const viewport = page.getViewport({ scale })
    // ... 渲染 ...
    return buffer
  } finally {
    try { page.cleanup() } catch {}
  }
  ```

- **影响范围**：渲染失败时（如复杂矢量图、超大页面），pdfjs 页面内部缓存不被清理，内存泄漏。

---

### [P1-9] 大PDF文件整体读入内存 — 潜在OOM

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 221 行；`src-electron/main/modules/pdfMerge/service.ts` 第 71 行；`src-electron/main/modules/pdfSplit/service.ts` 第 91 行
- **问题描述**：
  使用 `fs.readFileSync(filePath)` 将整个 PDF 文件读入内存。对于大文件（100MB+），同时存在原始 Buffer + Uint8Array + pdfjs 内部副本，内存占用可达文件大小的 3-4 倍。

  ```typescript
  const fileBuffer = fs.readFileSync(filePath)      // ← 原始 Buffer
  const pdfData = new Uint8Array(fileBuffer)         // ← 复制到 Uint8Array
  const loadingTask = pdfjs.getDocument({ data: pdfData })  // ← pdfjs 内部可能再复制
  ```

- **修复建议**：
  1. 添加文件大小检查：
  ```typescript
  const stat = fs.statSync(filePath)
  if (stat.size > 500 * 1024 * 1024) {  // 500MB 限制
    throw new Error(`文件过大（${Math.round(stat.size / 1024 / 1024)}MB），请使用小于500MB的PDF文件`)
  }
  ```
  2. 考虑使用 `fs.createReadStream` + pdfjs 的流式加载（如 `pdfjs.getDocument({ url: fileUrl })`）。

- **影响范围**：用户选择超大PDF文件时，主进程可能因 OOM 崩溃，导致整个应用退出。

---

### [P1-10] `registerPdfConvertHandlers` 函数签名不一致

- **文件**：`src-electron/main/modules/pdfConvert/index.ts` 第 6 行 vs `src-electron/main/ipc/index.ts` 第 13 行
- **问题描述**：
  `registerPdfConvertHandlers` 定义时不接受参数，但调用时传入了 `mainWindow`。其他三个模块（imageToPdf、pdfMerge、pdfSplit）都正确接收 `mainWindow` 参数。

  ```typescript
  // pdfConvert/index.ts 第 6 行 — 无参数
  export function registerPdfConvertHandlers() {

  // ipc/index.ts 第 13 行 — 传入参数（被忽略）
  registerPdfConvertHandlers(mainWindow)
  ```

- **根因分析**：
  pdfConvert 模块使用 `BrowserWindow.fromWebContents(event.sender)` 替代 `mainWindow` 参数来推送进度，因此不需要 `mainWindow`。但签名不一致导致代码可维护性降低，且如果未来需要使用 `mainWindow`，容易遗漏。

- **修复建议**：
  统一签名，要么都接收 `mainWindow`，要么都不接收：
  ```typescript
  // 方案：统一接收 mainWindow 但 pdfConvert 内部不使用
  export function registerPdfConvertHandlers(_mainWindow?: BrowserWindow) {
  ```

- **影响范围**：当前无运行时影响，但代码一致性问题。

---

### [P2-1] `wmic` 命令在 Windows 11 上已弃用 — 磁盘空间检查可能失败

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 136 行
- **问题描述**：
  `getDiskFreeSpaceMB` 使用 `wmic logicaldisk` 查询磁盘空间。`wmic` 在 Windows 11 上已标记为弃用，部分精简版系统可能未安装。

- **影响范围**：磁盘空间检查静默失败（返回 -1），不阻塞流程，但用户在磁盘空间不足时得不到预警。

- **修复建议**：改用 PowerShell 或 Node.js 原生 API：
  ```typescript
  // 使用 PowerShell 替代 wmic
  const output = execSync(
    `powershell -Command "(Get-PSDrive -Name '${drive.replace(':', '')}').Free"`,
    { encoding: 'utf-8', timeout: 5000 }
  )
  ```

---

### [P2-2] `@types/react` 版本与 React 19 不匹配

- **文件**：`package.json` 第 21 行 vs 第 27 行
- **问题描述**：
  `"react": "^19.0.0"` 但 `"@types/react": "^18.2.55"`。React 19 引入了新的类型（如 `use()` hook、新的 JSX 转换等），使用 v18 类型定义可能导致类型错误。

- **修复建议**：升级 `@types/react` 和 `@types/react-dom` 到 v19：
  ```json
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0"
  ```

---

### [P2-3] `isCancelled` 为模块级变量 — 并发转换互相干扰

- **文件**：`pdfConvert/service.ts` 第 92 行、`imageToPdf/service.ts` 第 33 行、`pdfMerge/service.ts` 第 18 行、`pdfSplit/service.ts` 第 18 行
- **问题描述**：
  `isCancelled` 是模块级全局变量。如果（通过IPC）同时发起两个转换任务，取消其中一个会将 `isCancelled` 设为 `true`，影响另一个。第二个任务开始时又会重置为 `false`，可能"取消"前一个任务的取消状态。

- **影响范围**：当前 UI 禁止并发转换（转换时按钮禁用），但 IPC 层无防护。如果渲染进程被篡改或存在 bug 导致并发调用，行为不可预测。

- **修复建议**：使用任务 ID 或 AbortController 跟踪每个转换任务。

---

### [P2-4] `file:readImage` MIME类型检测不完整

- **文件**：`src-electron/main/ipc/index.ts` 第 57 行
- **问题描述**：
  ```typescript
  const ext = filePath.split('.').pop()?.toLowerCase()
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
  ```
  只区分 PNG 和 JPEG，BMP/WEBP 等格式都被当作 JPEG，可能导致前端 `<img>` 标签无法正确显示。

- **修复建议**：添加更多 MIME 类型映射，或使用文件头魔数检测。

---

### [P2-5] `getUniqueOutputDir` 计数器无上限

- **文件**：`src-electron/main/modules/pdfConvert/service.ts` 第 154-164 行
- **问题描述**：
  while 循环查找不冲突的目录名，无上限。极端情况下（如恶意创建了大量同名目录），可能长时间阻塞。

- **修复建议**：添加最大重试次数（如 9999）。

---

### [P2-6] 缺少 IPC 输入参数校验

- **文件**：`src-electron/main/ipc/index.ts`（多个 handler）
- **问题描述**：
  所有 IPC handler 都信任渲染进程传入的参数，不验证类型和范围。虽然当前前端发送正确数据，但 contextBridge 暴露的 API 可被 DevTools 修改。

- **修复建议**：在关键 handler 中添加参数校验（如 `filePaths` 必须是字符串数组，`outputDir` 必须是合法路径等）。

---

### [P2-7] 缺少 `will-quit` 清理钩子

- **文件**：`src-electron/main/index.ts`
- **问题描述**：
  没有 `app.on('before-quit')` 或 `app.on('will-quit')` 处理器来在应用退出时清理资源（如销毁 pdfjs worker、释放 canvas 等）。

- **影响范围**：如果转换过程中用户关闭应用，资源可能不被正确清理。Electron 退出时会强制回收，但可能产生临时文件残留。

---

## 通过的检查项

### Node.js 版本兼容性 (A)
- ✅ `process.getBuiltinModule` polyfill 正确实现（`main/index.ts` 第 33-38 行）
- ✅ `Promise.withResolvers` polyfill 正确实现（`main/index.ts` 第 50-64 行）
- ✅ Polyfill 在 `app.whenReady()` 之前执行，保证 pdfjs-dist 加载前生效
- ✅ `eval('require')` 策略正确绕过 TypeScript/bundler 静态分析

### 打包后路径问题 (B)
- ✅ `__dirname` 在 CJS 输出中正确指向 `dist-electron/main/`
- ✅ `path.join(__dirname, '../../dist/index.html')` 在打包后正确解析
- ✅ `path.join(__dirname, '../preload/index.js')` 在打包后正确解析
- ✅ `require.resolve('pdfjs-dist/package.json')` 在打包后可用（pdfjs-dist 已 external + 已包含在 files 中）
- ✅ pdfjs worker 通过 `pathToFileURL().href` 转换为 `file://` URL，ESM loader 兼容

### 原生模块加载 (C)
- ✅ `@napi-rs/canvas` 及平台包 `@napi-rs/canvas-win32-x64-msvc` 均包含在 `files` 列表中
- ✅ `asar: false` 确保原生 .node 文件可直接文件系统访问
- ✅ `Path2D`、`ImageData`、`Image`、`createCanvas` 正确注入 `globalThis`（`service.ts` 第 56-60 行）

### pdfjs-dist 特定问题 (D)
- ✅ Worker 候选路径包含 4 个备选（min/non-min/legacy），容错性好
- ✅ Worker 未找到时回退到 no-worker 模式（第 39-42 行）
- ✅ `getDocument` 参数合理（`useSystemFonts: false`、`isEvalSupported: false`、`disableFontFace: true`）

### IPC 通信完整性 (E)
- ✅ Preload 暴露的 18 个 IPC 通道与主进程注册的 handler 一一对应
- ✅ `pdfConvert` 模块使用 `BrowserWindow.fromWebContents` + null 检查（正确模式）
- � 所有 IPC handler 有 try-catch 错误处理
- ✅ 前端进度监听器在 `finally` 块中正确清理（`PdfConvertPage.tsx` 第 187-192 行）
- ✅ 组件卸载时清理进度监听器（`PdfConvertPage.tsx` 第 46-52 行）

### 文件系统操作 (F)
- ✅ 所有路径操作使用 `path.join`/`path.sep`，跨平台兼容
- ✅ 中文文件名通过 Node.js 原生 fs API 正确处理
- ✅ 输出目录自动创建（`fs.mkdirSync(dir, { recursive: true })`）
- ✅ PDF 文件头验证（`%PDF-` 魔数检查）

### 前端状态管理 (H)
- ✅ Redux Toolkit slice 结构合理，状态字段完整
- ✅ `addFiles` 正确去重（使用 Set 检查已有路径）
- ✅ `resetState` 保留 `outputDir`（用户选择的目录不丢失）
- ✅ `conversionComplete`/`conversionError` 使用 `{ ...state.progress! }` 展开，即使 progress 为 null 也不会崩溃（`{ ...null }` → `{}`）

### 安全配置
- ✅ `contextIsolation: true` — 上下文隔离启用
- ✅ `nodeIntegration: false` — 渲染进程无 Node.js 访问权限
- ✅ `webSecurity: true` — Web 安全策略启用
- ✅ Preload 使用 `contextBridge.exposeInMainWorld` — 不暴露原始 `ipcRenderer`
- ✅ 外部链接通过 `shell.openExternal` 在系统浏览器打开

---

## 总体评估

| 维度 | 评估 |
|------|------|
| **风险等级** | 高 — 存在 1 个 P0 崩溃问题和多个 P1 资源泄漏 |
| **建议是否可发布** | **否** — P0 问题（imageToPdf 崩溃）必须修复后方可发布 |
| **PDF转图片模块** | 功能可用，存在 P1 质量问题（JPEG质量无效、CJK渲染缺失、内存泄漏） |
| **图片转PDF模块** | **完全不可用**（P0 崩溃） |
| **PDF合并模块** | 功能可用，存在 P1 崩溃风险（窗口关闭时） |
| **PDF拆分模块** | 功能可用，存在 P1 崩溃风险（窗口关闭时） |

### 修复优先级

1. **必须立即修复（阻塞发布）**：
   - P0: `loadImage` 未 await（imageToPdf 模块）

2. **强烈建议修复（影响核心功能）**：
   - P1-6: 缺少 CMap 配置（中文 PDF 渲染）
   - P1-3: JPEG 质量参数格式（输出质量）
   - P1-1/P1-7/P1-8: 资源泄漏三件套（长时间使用稳定性）
   - P1-2: Canvas 内存释放（大文件转换稳定性）

3. **建议修复（提升健壮性）**：
   - P1-4: 窗口图标路径
   - P1-5: webContents null 守卫
   - P1-9: 大文件 OOM 防护
   - P1-10: 函数签名一致性

4. **可后续迭代**：
   - P2-1 ~ P2-7
