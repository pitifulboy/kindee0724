import * as fs from 'fs'
import * as path from 'path'
import type { ImageToPdfOptions, ImageToPdfProgress } from '../ipc/types'

/**
 * 图片转PDF核心服务
 *
 * 使用 pdf-lib 嵌入图片到PDF，支持 PNG/JPEG
 * 使用 @napi-rs/canvas 对图片进行预处理（缩放、压缩、格式转换）
 */

// ─── 延迟加载依赖 ───
let _pdfLib: any = null
async function getPdfLib(): Promise<any> {
  if (!_pdfLib) {
    _pdfLib = await import('pdf-lib')
  }
  return _pdfLib
}

let _canvasLib: any = null
function getCanvas(): any {
  if (!_canvasLib) {
    _canvasLib = require('@napi-rs/canvas')
  }
  return _canvasLib
}

// 支持的图片格式
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp']

// 取消标志
let isCancelled = false

/**
 * 获取图片尺寸
 */
async function getImageSize(filePath: string): Promise<{ width: number; height: number }> {
  const { loadImage } = getCanvas()
  // 修复：loadImage() 返回 Promise<Image>，必须 await
  const img = await loadImage(filePath)
  return { width: img.width, height: img.height }
}

/**
 * 将图片转换为 JPEG Buffer（统一格式，减小PDF体积）
 */
async function imageToJpegBuffer(filePath: string, quality: number): Promise<Buffer> {
  const { loadImage, createCanvas } = getCanvas()
  // 修复：loadImage() 返回 Promise<Image>，必须 await
  const img = await loadImage(filePath)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')

  // 白色背景（JPEG不支持透明）
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, img.width, img.height)
  ctx.drawImage(img, 0, 0)

  // 修复：toBuffer 第二个参数应为对象 { quality }，而非裸数字
  const buffer = canvas.toBuffer('image/jpeg', { quality })
  // 修复：手动释放 Canvas 原生内存（@napi-rs/canvas 底层为 Skia 位图，GC 不会及时释放）
  canvas.width = 0
  canvas.height = 0
  return buffer
}

/**
 * 批量图片转PDF
 */
export async function convertImagesToPdf(
  options: ImageToPdfOptions,
  onProgress: (progress: ImageToPdfProgress) => void
): Promise<{ outputPath: string }> {
  isCancelled = false
  const { filePaths, outputPath, pageSize, orientation, margin, quality } = options

  if (filePaths.length === 0) {
    throw new Error('没有选择图片文件')
  }

  // 验证输出目录
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const { PDFDocument } = await getPdfLib()
  const pdfDoc = await PDFDocument.create()

  // A4 和 Letter 尺寸（以像素为单位，1inch=72pt）
  const PAGE_SIZES = {
    a4: { width: 595, height: 842 },
    letter: { width: 612, height: 792 },
  }

  for (let i = 0; i < filePaths.length; i++) {
    if (isCancelled) {
      throw new Error('转换已取消')
    }

    const filePath = filePaths[i]
    const fileName = path.basename(filePath)

    onProgress({
      currentFile: fileName,
      currentFileIndex: i + 1,
      totalFiles: filePaths.length,
      overallProgress: Math.round((i / filePaths.length) * 100),
      status: 'converting',
      message: `正在处理: ${fileName}（${i + 1}/${filePaths.length}）`
    })

    // 验证文件
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    const ext = path.extname(filePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(`不支持的图片格式: ${fileName}（支持 PNG/JPG/BMP/WEBP）`)
    }

    // 将图片转为 JPEG（统一格式，减小体积）
    // 修复：imageToJpegBuffer 现在是 async 函数，需要 await
    const jpegBuffer = await imageToJpegBuffer(filePath, quality)
    const jpegImage = await pdfDoc.embedJpg(jpegBuffer)

    // 计算页面尺寸
    let pageWidth: number
    let pageHeight: number

    if (pageSize === 'fit') {
      // 适应图片尺寸 + 边距
      pageWidth = jpegImage.width + margin * 2
      pageHeight = jpegImage.height + margin * 2
    } else {
      // 标准纸张尺寸
      const size = PAGE_SIZES[pageSize]
      if (orientation === 'landscape') {
        pageWidth = size.height
        pageHeight = size.width
      } else {
        pageWidth = size.width
        pageHeight = size.height
      }
    }

    // 创建页面
    const page = pdfDoc.addPage([pageWidth, pageHeight])

    // 计算图片放置位置（居中）
    const availableWidth = pageWidth - margin * 2
    const availableHeight = pageHeight - margin * 2

    // 等比缩放图片以适应可用区域
    const scale = Math.min(availableWidth / jpegImage.width, availableHeight / jpegImage.height, 1)
    const drawWidth = jpegImage.width * scale
    const drawHeight = jpegImage.height * scale
    const x = (pageWidth - drawWidth) / 2
    const y = (pageHeight - drawHeight) / 2

    page.drawImage(jpegImage, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    })
  }

  // 设置PDF元数据
  pdfDoc.setTitle('图片转PDF')
  pdfDoc.setCreator('离线办公工具')
  pdfDoc.setProducer('离线办公工具')

  // 保存PDF
  const pdfBytes = await pdfDoc.save()
  fs.writeFileSync(outputPath, pdfBytes)

  onProgress({
    currentFile: '',
    currentFileIndex: filePaths.length,
    totalFiles: filePaths.length,
    overallProgress: 100,
    status: 'completed',
    message: `PDF生成完成，共 ${filePaths.length} 页`
  })

  return { outputPath }
}

/**
 * 取消转换
 */
export function cancelConversion() {
  isCancelled = true
}
