import * as fs from 'fs'
import * as path from 'path'
import type { PdfMergeOptions, PdfMergeProgress } from '../../ipc/types'

/**
 * PDF合并核心服务
 * 使用 pdf-lib 将多个PDF文件合并为一个
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
 * 合并多个PDF文件
 */
export async function mergePdfs(
  options: PdfMergeOptions,
  onProgress: (progress: PdfMergeProgress) => void
): Promise<{ outputPath: string; totalPages: number }> {
  isCancelled = false
  const { filePaths, outputPath } = options

  if (filePaths.length === 0) {
    throw new Error('没有选择PDF文件')
  }

  if (filePaths.length === 1) {
    throw new Error('至少需要选择两个PDF文件进行合并')
  }

  // 验证输出目录
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const { PDFDocument, PDFName } = await getPdfLib()
  let mergedPdf: any = null
  let totalPages = 0

  for (let i = 0; i < filePaths.length; i++) {
    if (isCancelled) {
      throw new Error('合并已取消')
    }

    const filePath = filePaths[i]
    const fileName = path.basename(filePath)

    onProgress({
      currentFile: fileName,
      currentFileIndex: i + 1,
      totalFiles: filePaths.length,
      overallProgress: Math.round((i / filePaths.length) * 100),
      status: 'merging',
      message: `正在合并: ${fileName}（${i + 1}/${filePaths.length}）`
    })

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    const fileBuffer = fs.readFileSync(filePath)
    if (fileBuffer.length < 5 || fileBuffer.slice(0, 5).toString() !== '%PDF-') {
      throw new Error(`文件不是有效的PDF格式: ${fileName}`)
    }

    try {
      const sourcePdf = await PDFDocument.load(new Uint8Array(fileBuffer), { ignoreEncryption: true })
      const pageIndices = sourcePdf.getPageIndices()
      
      const isEncrypted = sourcePdf.context.trailer.get(PDFName.of('Encrypt')) !== undefined
      if (isEncrypted) {
        throw new Error('PDF文件已加密，需要使用图片模式处理')
      }

      if (i === 0) {
        try {
          const catalog = sourcePdf.catalog
          if (catalog.get(PDFName.of('CreationDate'))) {
            catalog.delete(PDFName.of('CreationDate'))
          }
          if (catalog.get(PDFName.of('ModDate'))) {
            catalog.delete(PDFName.of('ModDate'))
          }
          mergedPdf = await sourcePdf.copy()
        } catch (copyError) {
          mergedPdf = await PDFDocument.create()
          const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices)
          copiedPages.forEach((page: any) => mergedPdf.addPage(page))
        }
      } else {
        const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices)
        copiedPages.forEach((page: any) => mergedPdf.addPage(page))
      }

      totalPages += pageIndices.length
    } catch (error: any) {
      throw new Error(`读取PDF失败: ${fileName} - ${error.message}`)
    }
  }

  mergedPdf.setTitle('合并PDF')
  mergedPdf.setCreator('离线办公工具')
  mergedPdf.setProducer('离线办公工具')

  const pdfBytes = await mergedPdf.save()
  fs.writeFileSync(outputPath, pdfBytes)

  onProgress({
    currentFile: '',
    currentFileIndex: filePaths.length,
    totalFiles: filePaths.length,
    overallProgress: 100,
    status: 'completed',
    message: `合并完成，共 ${totalPages} 页`
  })

  return { outputPath, totalPages }
}

export interface PdfPageImageData {
  imageData: string       // base64编码的PNG图片
  width: number
  height: number
}

export async function mergePdfsFromImages(
  pagesData: PdfPageImageData[][],
  outputPath: string,
  fileNames: string[],
  onProgress: (progress: PdfMergeProgress) => void
): Promise<{ outputPath: string; totalPages: number }> {
  isCancelled = false

  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const { PDFDocument } = await getPdfLib()
  const mergedPdf = await PDFDocument.create()
  let totalPages = 0

  for (let i = 0; i < pagesData.length; i++) {
    if (isCancelled) {
      throw new Error('合并已取消')
    }

    const fileName = fileNames[i] || `文件${i + 1}`
    const pages = pagesData[i]

    onProgress({
      currentFile: fileName,
      currentFileIndex: i + 1,
      totalFiles: pagesData.length,
      overallProgress: Math.round((i / pagesData.length) * 100),
      status: 'merging',
      message: `正在合并: ${fileName}（${pages.length}页）`
    })

    for (const pageData of pages) {
      const imageBytes = Buffer.from(pageData.imageData.split(',')[1], 'base64')
      const image = await mergedPdf.embedPng(imageBytes)
      
      const page = mergedPdf.addPage([pageData.width, pageData.height])
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageData.width,
        height: pageData.height
      })
      
      totalPages++
    }
  }

  mergedPdf.setTitle('合并PDF')
  mergedPdf.setCreator('离线办公工具')
  mergedPdf.setProducer('离线办公工具')

  const pdfBytes = await mergedPdf.save()
  fs.writeFileSync(outputPath, pdfBytes)

  onProgress({
    currentFile: '',
    currentFileIndex: pagesData.length,
    totalFiles: pagesData.length,
    overallProgress: 100,
    status: 'completed',
    message: `合并完成，共 ${totalPages} 页（图片模式）`
  })

  return { outputPath, totalPages }
}

/**
 * 取消合并
 */
export function cancelMerge() {
  isCancelled = true
}
