import { createRoot } from 'react-dom/client'
import { htmlDir, htmlLang, type Lang } from '@genoffice/i18n'
import App from './App'
import { startHeadlessPage } from './headless'
import { LocaleProvider } from './i18n/locale'
import { applyTheme } from './theme'
import { registerVisioImporter } from './document/visio-import'
import type { UiTheme } from '../shared/ipc'
import '@genoffice/ui/tokens.css'
import './styles.css'

registerVisioImporter()

void (async () => {
  const [lang, theme] = await Promise.all([
    window.diagramApi.getLanguage().catch(() => 'zh' as const),
    window.diagramApi.getTheme().catch(() => 'system' as const),
  ])
  // a windowless job's hidden window runs the job, not the editor (src/main/headless-main.ts)
  if (new URLSearchParams(window.location.search).has('headless')) {
    await startHeadlessPage(lang as Lang)
    return
  }
  document.documentElement.lang = htmlLang(lang as Lang)
  document.documentElement.dir = htmlDir(lang)
  applyTheme(theme as UiTheme)
  window.diagramApi.onThemeChanged(applyTheme)
  createRoot(document.getElementById('root')!).render(
    <LocaleProvider initial={lang}>
      <App initialTheme={theme as UiTheme} />
    </LocaleProvider>,
  )
})()
