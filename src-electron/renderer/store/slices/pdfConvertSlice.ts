import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { PdfConvertProgress } from '../../main/ipc/types'

export interface PdfFile {
  path: string
  name: string
  size: number
}

export interface PdfConvertState {
  files: PdfFile[]
  outputDir: string
  format: 'png' | 'jpg'
  scale: number
  quality: number               // JPG质量 0.1~1.0
  pageRange: string             // 页码范围，空=全部
  isConverting: boolean
  progress: PdfConvertProgress | null
  results: string[]
  error: string | null
}

const initialState: PdfConvertState = {
  files: [],
  outputDir: '',
  format: 'png',
  scale: 2,
  quality: 0.92,
  pageRange: '',
  isConverting: false,
  progress: null,
  results: [],
  error: null
}

const pdfConvertSlice = createSlice({
  name: 'pdfConvert',
  initialState,
  reducers: {
    addFiles: (state, action: PayloadAction<PdfFile[]>) => {
      // 过滤已存在的文件
      const existingPaths = new Set(state.files.map(f => f.path))
      const newFiles = action.payload.filter(f => !existingPaths.has(f.path))
      state.files.push(...newFiles)
    },
    removeFile: (state, action: PayloadAction<string>) => {
      state.files = state.files.filter(f => f.path !== action.payload)
    },
    clearFiles: (state) => {
      state.files = []
    },
    setOutputDir: (state, action: PayloadAction<string>) => {
      state.outputDir = action.payload
    },
    setFormat: (state, action: PayloadAction<'png' | 'jpg'>) => {
      state.format = action.payload
    },
    setScale: (state, action: PayloadAction<number>) => {
      state.scale = action.payload
    },
    setQuality: (state, action: PayloadAction<number>) => {
      state.quality = action.payload
    },
    setPageRange: (state, action: PayloadAction<string>) => {
      state.pageRange = action.payload
    },
    startConversion: (state) => {
      state.isConverting = true
      state.progress = null
      state.error = null
      state.results = []
    },
    updateProgress: (state, action: PayloadAction<PdfConvertProgress>) => {
      state.progress = action.payload
    },
    conversionComplete: (state, action: PayloadAction<string[]>) => {
      state.isConverting = false
      state.results = action.payload
      state.progress = {
        ...state.progress!,
        status: 'completed',
        overallProgress: 100
      }
    },
    conversionError: (state, action: PayloadAction<string>) => {
      state.isConverting = false
      state.error = action.payload
      state.progress = {
        ...state.progress!,
        status: 'error',
        message: action.payload
      }
    },
    resetState: (state) => {
      return { ...initialState, outputDir: state.outputDir }
    }
  }
})

export const {
  addFiles,
  removeFile,
  clearFiles,
  setOutputDir,
  setFormat,
  setScale,
  setQuality,
  setPageRange,
  startConversion,
  updateProgress,
  conversionComplete,
  conversionError,
  resetState
} = pdfConvertSlice.actions

export default pdfConvertSlice.reducer
