import * as fs from 'fs'
import * as path from 'path'
import type { PdfConvertOptions, PdfConvertProgress } from '../ipc/types'

/**
 * PDF转图片核心服务
 *
 * 架构说明：
 * - pdfjs-dist v4 为纯 ESM 包，使用动态 import() 加载
 * - @napi-rs/canvas 为 CJS 包，提供 Node.js 兼容的 Canvas API
 * - 自定义 CanvasFactory 桥接 pdfjs-dist 的渲染需求与 @napi-rs/canvas
 * - Worker 通过 workerSrc 指定本地文件路径，pdfjs 在 Node.js 中自动使用 worker_threads
 */

// ─── 延迟加载 pdfjs-dist（ESM 模块） ───
let _pdfjsLib: any = null
let _cMapUrl: string | null = null
async function getPdfjs(): Promise<any> {
  if (_pdfjsLib) return _pdfjsLib

  _pdfjsLib = await import('pdfjs-dist')

  // 配置 Worker —— 在 Node.js 中 pdfjs 会自动使用 worker_threads
  const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json')
  const pdfjsDir = path.dirname(pdfjsPkgPath)
  const workerCandidates = [
    path.join(pdfjsDir, 'build', 'pdf.worker.min.mjs'),
    path.join(pdfjsDir, 'build', 'pdf.worker.mjs'),
    path.join(pdfjsDir, 'legacy', 'build', 'pdf.worker.min.mjs'),
    path.join(pdfjsDir, 'legacy', 'build', 'pdf.worker.mjs'),
  ]
  const workerPath = workerCandidates.find((p) => fs.existsSync(p))
  if (workerPath) {
    // pdfjs-dist v4 为纯 ESM，内部使用 import() 加载 worker。
    // Node.js ESM loader 在 Windows 上要求 file:// URL 格式，
    // 不接受原始盘符路径（如 D:\\...），否则会被误判为协议 "d:" 而报错。
    // 因此需用 url.pathToFileURL() 将原生路径转换为 file:///D:/... 格式。
    const { pathToFileURL } = require('url')
    _pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  } else {
    // Worker 文件未找到时回退到禁用 worker 模式
    console.warn('[pdfConvert] Worker not found, falling back to no-worker mode')
  }

  // 修复：配置 cMap 路径 —— 用于渲染 CJK（中日韩）字符
  // pdfjs-dist 自带 cMap 文件，位于 cmaps/ 目录下（169 个 .bcmap 文件）
  const cMapDir = path.join(pdfjsDir, 'cmaps')
  if (fs.existsSync(cMapDir)) {
    _cMapUrl = cMapDir + '/'  // pdfjs 要求 URL 以 / 结尾
  }

  return _pdfjsLib
}

// ─── 延迟加载 @napi-rs/canvas ───
let _canvasLib: any = null
function getCanvas(): any {
  if (!_canvasLib) {
    _canvasLib = require('@napi-rs/canvas')

    // pdfjs-dist v4 渲染引擎内部会使用浏览器全局 API（Path2D, ImageData, Image 等）。
    // @napi-rs/canvas 提供了这些 API 的 Node.js 实现，但不会自动注册为全局变量。
    // 需要手动注入到 globalThis，否则渲染时抛出 "Path2D is not defined" 等错误。
    const g = globalThis as any
    if (!g.Path2D && _canvasLib.Path2D) g.Path2D = _canvasLib.Path2D
    if (!g.ImageData && _canvasLib.ImageData) g.ImageData = _canvasLib.ImageData
    if (!g.Image && _canvasLib.Image) g.Image = _canvasLib.Image
    if (!g.createCanvas && _canvasLib.createCanvas) g.createCanvas = _canvasLib.createCanvas
  }
  return _canvasLib
}

// ─── 自定义 Canvas Factory ───
// pdfjs-dist v4 内部渲染需要创建临时 Canvas（用于图片遮罩等）
// 默认的 DOMCanvasFactory 在 Node.js 中不可用，需用 @napi-rs/canvas 替代
class NodeCanvasFactory {
  create(width: number, height: number) {
    const { createCanvas } = getCanvas()
    const canvas = createCanvas(width, height)
    return {
      canvas,
      context: canvas.getContext('2d'),
    }
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }
}

// 转换取消标志
let isCancelled = false

/**
 * 解析页码范围字符串，如 "1-3,5,7-9" → [1,2,3,5,7,8,9]
 */
function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr || !rangeStr.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: number[] = []
  const parts = rangeStr.split(',').map((s) => s.trim()).filter(Boolean)

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim())
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        throw new Error(`页码范围无效: ${part}（文档共${totalPages}页）`)
      }
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
    } else {
      const page = parseInt(part, 10)
      if (isNaN(page) || page < 1 || page > totalPages) {
        throw new Error(`页码无效: ${part}（文档共${totalPages}页）`)
      }
      pages.push(page)
    }
  }

  // 去重并排序
  return [...new Set(pages)].sort((a, b) => a - b)
}

/**
 * 检查磁盘剩余空间（MB）
 */
function getDiskFreeSpaceMB(dirPath: string): number {
  try {
    const { execSync } = require('child_process')
    const drive = path.resolve(dirPath).split(path.sep)[0] || 'C:'
    const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
    const match = output.match(/FreeSpace=(\d+)/)
    if (match) {
      return Math.floor(parseInt(match[1], 10) / (1024 * 1024))
    }
  } catch {
    // 查询失败，不阻塞流程
  }
  return -1 // 未知
}

/**
 * 生成不冲突的输出目录名
 * 同名PDF文件自动加序号：document → document → document(2) → document(3)
 */
function getUniqueOutputDir(baseDir: string, fileName: string): string {
  let dirPath = path.join(baseDir, fileName)
  if (!fs.existsSync(dirPath)) {
    return dirPath
  }
  let counter = 2
  while (fs.existsSync(path.join(baseDir, `${fileName}(${counter})`))) {
    counter++
  }
  return path.join(baseDir, `${fileName}(${counter})`)
}

/**
 * 批量转换 PDF 为图片
 */
export async function convertPdfToImages(
  options: PdfConvertOptions,
  onProgress: (progress: PdfConvertProgress) => void
): Promise<{ outputImages: string[] }> {
  isCancelled = false
  const { filePaths, outputDir, format, scale, quality, pageRange } = options
  const outputImages: string[] = []

  // 验证输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // 磁盘空间检查（低于 100MB 时警告）
  const freeMB = getDiskFreeSpaceMB(outputDir)
  if (freeMB >= 0 && freeMB < 100) {
    throw new Error(`磁盘空间不足（剩余 ${freeMB}MB），请清理磁盘后重试`)
  }

  // 加载 pdfjs
  const pdfjs = await getPdfjs()
  // 预加载 @napi-rs/canvas，将 Path2D 等浏览器 API 注入 globalThis
  // 必须在渲染前完成，否则 pdfjs 内部渲染时找不到 Path2D
  getCanvas()
  const canvasFactory = new NodeCanvasFactory()

  // 遍历所有 PDF 文件
  for (let fileIndex = 0; fileIndex < filePaths.length; fileIndex++) {
    if (isCancelled) {
      throw new Error('转换已取消')
    }

    const filePath = filePaths[fileIndex]
    const fileName = path.basename(filePath, path.extname(filePath))

    onProgress({
      currentFile: fileName,
      currentFileIndex: fileIndex + 1,
      totalFiles: filePaths.length,
      currentPage: 0,
      totalPages: 0,
      overallProgress: Math.round((fileIndex / filePaths.length) * 100),
      status: 'converting',
      message: `正在处理: ${fileName}`
    })

    // 修复：hoist pdfDoc 声明到 try 外，以便 finally 中释放
    let pdfDoc: any = null
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`)
      }

      // 验证 PDF 文件头
      const fileBuffer = fs.readFileSync(filePath)
      if (fileBuffer.length < 5 || fileBuffer.slice(0, 5).toString() !== '%PDF-') {
        throw new Error(`文件不是有效的PDF格式: ${fileName}`)
      }

      const pdfData = new Uint8Array(fileBuffer)

      // 加载 PDF 文档
      const loadingTask = pdfjs.getDocument({
        data: pdfData,
        useSystemFonts: false,
        isEvalSupported: false,
        canvasFactory: canvasFactory,
        disableFontFace: true,
        // 修复：配置 cMapUrl 以支持 CJK（中日韩）字符渲染
        cMapUrl: _cMapUrl || '',
        cMapPacked: true,
      })
      // 修复：加载失败时销毁 loadingTask，避免资源泄漏
      try {
        pdfDoc = await loadingTask.promise
      } catch (err) {
        try { loadingTask.destroy() } catch {}
        throw err
      }
      const totalPages = pdfDoc.numPages

      // 解析页码范围
      let pagesToConvert: number[]
      try {
        pagesToConvert = parsePageRange(pageRange || '', totalPages)
      } catch (e: any) {
        throw new Error(`文件「${fileName}」${e.message}`)
      }

      // 创建文件专属输出目录（防冲突）
      const fileOutputDir = getUniqueOutputDir(outputDir, fileName)
      if (!fs.existsSync(fileOutputDir)) {
        fs.mkdirSync(fileOutputDir, { recursive: true })
      }

      // 逐页转换
      for (let idx = 0; idx < pagesToConvert.length; idx++) {
        if (isCancelled) {
          throw new Error('转换已取消')
        }

        const pageNum = pagesToConvert[idx]

        onProgress({
          currentFile: fileName,
          currentFileIndex: fileIndex + 1,
          totalFiles: filePaths.length,
          currentPage: pageNum,
          totalPages: pagesToConvert.length,
          overallProgress: Math.round(
            ((fileIndex + idx / pagesToConvert.length) / filePaths.length) * 100
          ),
          status: 'converting',
          message: `正在转换: ${fileName} - 第${pageNum}页（${idx + 1}/${pagesToConvert.length}）`
        })

        // 渲染页面为图片
        const imageBuffer = await renderPageToImage(
          pdfDoc,
          pageNum,
          scale,
          format,
          quality || 0.92,
          canvasFactory
        )

        // 保存图片
        const imageFileName = `${fileName}_${pageNum.toString().padStart(3, '0')}.${format}`
        const imagePath = path.join(fileOutputDir, imageFileName)
        fs.writeFileSync(imagePath, imageBuffer)
        outputImages.push(imagePath)
      }

    } catch (error: any) {
      console.error(`转换PDF失败 [${fileName}]:`, error)
      throw new Error(`转换失败: ${fileName} - ${error.message}`)
    } finally {
      // 修复：确保 pdfDoc.destroy() 在错误路径也执行（返回 Promise，需 await）
      if (pdfDoc) {
        try { await pdfDoc.destroy() } catch {}
      }
    }
  }

  onProgress({
    currentFile: '',
    currentFileIndex: filePaths.length,
    totalFiles: filePaths.length,
    currentPage: 0,
    totalPages: 0,
    overallProgress: 100,
    status: 'completed',
    message: `转换完成，共生成 ${outputImages.length} 张图片`
  })

  return { outputImages }
}

/**
 * 渲染 PDF 单页为图片 Buffer
 */
async function renderPageToImage(
  pdfDoc: any,
  pageNum: number,
  scale: number,
  format: 'png' | 'jpg',
  quality: number,
  canvasFactory: NodeCanvasFactory
): Promise<Buffer> {
  const page = await pdfDoc.getPage(pageNum)
  try {
    const viewport = page.getViewport({ scale })

    // 使用 @napi-rs/canvas 创建画布
    const { createCanvas } = getCanvas()
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')

    // JPEG 不支持透明，设置白色背景
    if (format === 'jpg') {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, viewport.width, viewport.height)
    }

    // 渲染 PDF 页面到 Canvas
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvasFactory: canvasFactory,
    }).promise

    // 转换为 Buffer
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    // 修复：toBuffer 第二个参数应为对象 { quality }，而非裸数字
    const buffer = canvas.toBuffer(mimeType, format === 'jpg' ? { quality } : undefined)

    // 修复：手动释放 Canvas 原生内存（@napi-rs/canvas 底层为 Skia 位图，GC 不会及时释放）
    canvas.width = 0
    canvas.height = 0

    return buffer
  } finally {
    // 修复：确保 page.cleanup() 在错误路径也执行
    try { page.cleanup() } catch {}
  }
}

/**
 * 取消转换
 */
export function cancelConversion() {
  isCancelled = true
}
