import { useEffect, useState } from 'react'
import type { UiTheme } from '../shared/ipc'

/** Whether the app shows dark: its own setting, or the system's when it follows the system. */
export function resolveDark(theme: UiTheme, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark)
}

const darkQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** The page's own colors follow the app theme (tokens in @genoffice/ui). */
export function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

/** Whether draw.io should show its dark view now; follows the app and, for `system`, the OS. */
export function useDarkView(initial: UiTheme): boolean {
  const [theme, setTheme] = useState<UiTheme>(initial)
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false)
  useEffect(() => window.diagramApi.onThemeChanged(setTheme), [])
  useEffect(() => {
    const query = darkQuery()
    if (!query) return
    const onChange = (): void => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return resolveDark(theme, systemDark)
}
