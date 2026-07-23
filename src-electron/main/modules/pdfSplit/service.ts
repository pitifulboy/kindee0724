import * as fs from 'fs'
import * as path from 'path'
import type { PdfSplitOptions, PdfSplitProgress, PdfSplitResult } from '../../ipc/types'

/**
 * PDF拆分核心服务
 * 使用 pdf-lib 按页码范围拆分PDF
 */

let _pdfLib: any = null
async function getPdfLib(): Promise<any> {
  if (!_pdfLib) {
    _pdfLib = await import('pdf-lib')
  }
  return _pdfLib
}

let isCancelled = false

/**
 * 解析页码范围字符串为数组，每个元素是一组页码
 * 如 "1-3,4-6,7-9" → [[1,2,3], [4,5,6], [7,8,9]]
 * 如 "1-3,5,7-9" → [[1,2,3], [5], [7,8,9]]
 */
function parseSplitRanges(rangeStr: string, totalPages: number): number[][] {
  if (!rangeStr || !rangeStr.trim()) {
    throw new Error('页码范围不能为空')
  }

  const result: number[][] = []
  const parts = rangeStr.split(',').map((s) => s.trim()).filter(Boolean)

  for (const part of parts) {
    const pages: number[] = []
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim())
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        throw new Error(`页码范围无效: ${part}（文档共${totalPages}页）`)
      }
      for (let i = start; i <= end; i++) {
        pages.push(i - 1) // 转为0-based索引
      }
    } else {
      const page = parseInt(part, 10)
      if (isNaN(page) || page < 1 || page > totalPages) {
        throw new Error(`页码无效: ${part}（文档共${totalPages}页）`)
      }
      pages.push(page - 1)
    }
    result.push(pages)
  }

  if (result.length === 0) {
    throw new Error('未解析到有效页码范围')
  }

  return result
}

/**
 * 生成不冲突的输出文件名
 */
function getUniqueFilePath(dir: string, baseName: string, ext: string): string {
  let filePath = path.join(dir, `${baseName}.${ext}`)
  if (!fs.existsSync(filePath)) return filePath

  let counter = 2
  while (fs.existsSync(path.join(dir, `${baseName}(${counter}).${ext}`))) {
    counter++
  }
  return path.join(dir, `${baseName}(${counter}).${ext}`)
}

/**
 * 拆分PDF
 */
export async function splitPdf(
  options: PdfSplitOptions,
  onProgress: (progress: PdfSplitProgress) => void
): Promise<PdfSplitResult> {
  isCancelled = false
  const { filePath, outputDir, mode, pageRanges, pagesPerFile, filePrefix } = options

  // 验证源文件
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }

  const fileBuffer = fs.readFileSync(filePath)
  if (fileBuffer.length < 5 || fileBuffer.slice(0, 5).toString() !== '%PDF-') {
    throw new Error('文件不是有效的PDF格式')
  }

  // 验证输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const { PDFDocument, PDFName } = await getPdfLib()
  const sourcePdf = await PDFDocument.load(new Uint8Array(fileBuffer), { ignoreEncryption: true })
  const totalPages = sourcePdf.getPageCount()
  
  const isEncrypted = sourcePdf.context.trailer.get(PDFName.of('Encrypt')) !== undefined
  console.log(`PDF加密状态: ${isEncrypted}, 页数: ${totalPages}`)
  
  if (isEncrypted) {
    throw new Error('PDF文件已加密，需要使用图片模式处理')
  }

  const sourceFileName = filePrefix || path.basename(filePath, path.extname(filePath))
  const outputFiles: string[] = []

  // 根据模式计算拆分方案
  let splitGroups: number[][] = []

  if (mode === 'range') {
    splitGroups = parseSplitRanges(pageRanges || '', totalPages)
  } else if (mode === 'eachPage') {
    for (let i = 0; i < totalPages; i++) {
      splitGroups.push([i])
    }
  } else if (mode === 'everyN') {
    const n = pagesPerFile || 1
    if (n < 1) throw new Error('每文件页数必须大于0')
    for (let i = 0; i < totalPages; i += n) {
      const group: number[] = []
      for (let j = i; j < Math.min(i + n, totalPages); j++) {
        group.push(j)
      }
      splitGroups.push(group)
    }
  }

  onProgress({
    currentPart: 0,
    totalParts: splitGroups.length,
    overallProgress: 0,
    status: 'splitting',
    message: `开始拆分，共 ${splitGroups.length} 个文件`
  })

  for (let i = 0; i < splitGroups.length; i++) {
    if (isCancelled) {
      throw new Error('拆分已取消')
    }

    const pageIndices = splitGroups[i]

    onProgress({
      currentPart: i + 1,
      totalParts: splitGroups.length,
      overallProgress: Math.round(((i + 1) / splitGroups.length) * 100),
      status: 'splitting',
      message: `正在生成第 ${i + 1}/${splitGroups.length} 个文件（页码: ${pageIndices.map(p => p + 1).join(',')}）`
    })

    const tempPdf = await PDFDocument.load(new Uint8Array(fileBuffer), { ignoreEncryption: true })
    const allPages = tempPdf.getPageCount()
    const pagesToKeep = new Set(pageIndices)
    
    for (let j = allPages - 1; j >= 0; j--) {
      if (!pagesToKeep.has(j)) {
        tempPdf.removePage(j)
      }
    }

    const partName = pageIndices.length === 1
      ? `${sourceFileName}_第${pageIndices[0] + 1}页`
      : `${sourceFileName}_第${pageIndices[0] + 1}-${pageIndices[pageIndices.length - 1] + 1}页`

    const outputPath = getUniqueFilePath(outputDir, partName, 'pdf')
    const pdfBytes = await tempPdf.save()
    fs.writeFileSync(outputPath, pdfBytes)
    outputFiles.push(outputPath)
  }

  onProgress({
    currentPart: splitGroups.length,
    totalParts: splitGroups.length,
    overallProgress: 100,
    status: 'completed',
    message: `拆分完成，共生成 ${outputFiles.length} 个文件`
  })

  return {
    success: true,
    outputFiles,
  }
}

export interface PdfPageImageData {
  imageData: string
  width: number
  height: number
}

export async function splitPdfFromImages(
  allPagesData: PdfPageImageData[],
  options: PdfSplitOptions,
  onProgress: (progress: PdfSplitProgress) => void
): Promise<PdfSplitResult> {
  isCancelled = false
  const { outputDir, mode, pageRanges, pagesPerFile, filePrefix } = options

  const { PDFDocument } = await getPdfLib()
  
  const sourceFileName = filePrefix || '拆分文档'
  const outputFiles: string[] = []

  let splitGroups: number[][] = []
  const totalPages = allPagesData.length

  if (mode === 'range') {
    splitGroups = parseSplitRanges(pageRanges || '', totalPages)
  } else if (mode === 'eachPage') {
    for (let i = 0; i < totalPages; i++) {
      splitGroups.push([i])
    }
  } else if (mode === 'everyN') {
    const n = pagesPerFile || 1
    if (n < 1) throw new Error('每文件页数必须大于0')
    for (let i = 0; i < totalPages; i += n) {
      const group: number[] = []
      for (let j = i; j < Math.min(i + n, totalPages); j++) {
        group.push(j)
      }
      splitGroups.push(group)
    }
  }

  onProgress({
    currentPart: 0,
    totalParts: splitGroups.length,
    overallProgress: 0,
    status: 'splitting',
    message: `开始拆分（图片模式），共 ${splitGroups.length} 个文件`
  })

  for (let i = 0; i < splitGroups.length; i++) {
    if (isCancelled) {
      throw new Error('拆分已取消')
    }

    const pageIndices = splitGroups[i]

    onProgress({
      currentPart: i + 1,
      totalParts: splitGroups.length,
      overallProgress: Math.round(((i + 1) / splitGroups.length) * 100),
      status: 'splitting',
      message: `正在生成第 ${i + 1}/${splitGroups.length} 个文件（页码: ${pageIndices.map(p => p + 1).join(',')}）`
    })

    const newPdf = await PDFDocument.create()
    
    for (const pageIndex of pageIndices) {
      const pageData = allPagesData[pageIndex]
      const imageBytes = Buffer.from(pageData.imageData.split(',')[1], 'base64')
      const image = await newPdf.embedPng(imageBytes)
      
      const page = newPdf.addPage([pageData.width, pageData.height])
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageData.width,
        height: pageData.height
      })
    }

    const partName = pageIndices.length === 1
      ? `${sourceFileName}_第${pageIndices[0] + 1}页`
      : `${sourceFileName}_第${pageIndices[0] + 1}-${pageIndices[pageIndices.length - 1] + 1}页`

    const outputPath = getUniqueFilePath(outputDir, partName, 'pdf')
    const pdfBytes = await newPdf.save()
    fs.writeFileSync(outputPath, pdfBytes)
    outputFiles.push(outputPath)
  }

  onProgress({
    currentPart: splitGroups.length,
    totalParts: splitGroups.length,
    overallProgress: 100,
    status: 'completed',
    message: `拆分完成（图片模式），共生成 ${outputFiles.length} 个文件`
  })

  return {
    success: true,
    outputFiles,
  }
}

/**
 * 取消拆分
 */
export function cancelSplit() {
  isCancelled = true
}
