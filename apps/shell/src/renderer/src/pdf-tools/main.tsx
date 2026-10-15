import React from 'react'
import { createRoot } from 'react-dom/client'
import { htmlDir, htmlLang } from '@genoffice/i18n'
import '@genoffice/ui/tokens.css'
import './pdf-tools.css'
import './globals'
import { PdfToolsWindow } from './PdfToolsWindow'
import type { PdfToolsTheme } from '../../../shared/pdf-tools-api'

function applyTheme(theme: PdfToolsTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

const api = window.aiOfficePdfTools
// language and theme land before first paint so the window never flashes the other one
void api.getInit().then(({ lang, theme }) => {
  applyTheme(theme)
  api.onThemeChanged(applyTheme)
  document.documentElement.lang = htmlLang(lang)
  document.documentElement.dir = htmlDir(lang)
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PdfToolsWindow lang={lang} />
    </React.StrictMode>,
  )
})
