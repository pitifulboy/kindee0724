import { configureStore } from '@reduxjs/toolkit'
import pdfConvertReducer from './slices/pdfConvertSlice'

export const store = configureStore({
  reducer: {
    pdfConvert: pdfConvertReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch