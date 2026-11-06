import { createRoot } from 'react-dom/client'
import { htmlDir, htmlLang, type Lang } from '@genoffice/i18n'
import App from './App'
import { LocaleProvider } from './i18n/locale'
import type { MindmapAiApi, UiTheme } from '../shared/ipc'
import { applyAiPanelPrefs, installScreenTips } from '@genoffice/ui'
import '@genoffice/ui/tokens.css'
import '@genoffice/ui/screentip.css'
import '@genoffice/ui/dropdown.css'
import '@genoffice/ui/color-picker.css'
import 'mind-elixir/style.css'
import './styles.css'
import './map.css'

installScreenTips()

function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

void (async () => {
  const [lang, theme] = await Promise.all([
    window.mindmapApi.getLanguage().catch(() => 'zh' as const),
    window.mindmapApi.getTheme().catch(() => 'system' as const),
  ])
  document.documentElement.lang = htmlLang(lang as Lang)
  document.documentElement.dir = htmlDir(lang)
  applyTheme(theme)
  window.mindmapApi.onThemeChanged(applyTheme)
  // the shell's AI panel preferences (side, text size, start open) before the first render, as
  // the other editors do: the dock is drawn on the chosen side from the start, and the panel's
  // initial open state (aiPanelInitiallyOpen) is read with them in place
  const aiApi = window.mindmapApi as Partial<MindmapAiApi> | undefined
  await aiApi
    ?.getAiPanelPrefs?.()
    .then(applyAiPanelPrefs)
    .catch(() => {})
  aiApi?.onAiPanelPrefsChanged?.(applyAiPanelPrefs)
  createRoot(document.getElementById('root')!).render(
    <LocaleProvider initial={lang}>
      <App />
    </LocaleProvider>,
  )
})()
