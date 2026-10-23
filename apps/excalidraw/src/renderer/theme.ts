/**
 * The canvas follows the app's light or dark look. The drawing's own colours
 * are document content: the library's dark look only changes how they are
 * shown, never what is saved.
 */
import { useEffect, useState } from 'react'
import type { UiTheme } from '../shared/ipc'

type CanvasTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function resolve(setting: UiTheme): CanvasTheme {
  if (setting !== 'system') return setting
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function useCanvasTheme(): CanvasTheme {
  const [setting, setSetting] = useState<UiTheme>('system')
  const [theme, setTheme] = useState<CanvasTheme>(() => resolve('system'))

  useEffect(() => {
    let alive = true
    window.excalidrawApi
      .getTheme()
      .then((value) => {
        if (alive) setSetting(value)
      })
      .catch(() => {})
    const off = window.excalidrawApi.onThemeChanged(setSetting)
    return () => {
      alive = false
      off()
    }
  }, [])

  useEffect(() => {
    setTheme(resolve(setting))
    if (setting !== 'system') return
    const query = window.matchMedia?.(DARK_QUERY)
    if (!query) return
    const onChange = (): void => setTheme(resolve('system'))
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [setting])

  return theme
}
