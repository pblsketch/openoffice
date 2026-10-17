import React from 'react'
import { createRoot } from 'react-dom/client'
import { htmlDir, htmlLang } from '@genoffice/i18n'
import '@genoffice/ui/tokens.css'
import './doc-picker.css'
import { DocPickerWindow } from './DocPickerWindow'
import type { DocPickerApi, DocPickerTheme } from '../../../shared/doc-picker-api'

declare global {
  interface Window {
    /** the picker window's own preload (src/preload/doc-picker.ts) */
    aiOfficeDocPicker: DocPickerApi
  }
}

function applyTheme(theme: DocPickerTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

const api = window.aiOfficeDocPicker
// language and theme land before first paint so the window never flashes the other one
void api.getInit().then(({ lang, theme }) => {
  applyTheme(theme)
  api.onThemeChanged(applyTheme)
  document.documentElement.lang = htmlLang(lang)
  document.documentElement.dir = htmlDir(lang)
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <DocPickerWindow lang={lang} api={api} />
    </React.StrictMode>,
  )
})
