import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'

vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {}, ipcMain: {} }))

const { OUTBOUND_CONFIRM_STRINGS, confirmDialogOptions } =
  await import('../src/main/outbound-confirm')

describe('outbound confirm dialog', () => {
  it('has every string in every language', () => {
    const keys = Object.keys(OUTBOUND_CONFIRM_STRINGS.zh).sort()
    for (const lang of LANGS) {
      const table = (OUTBOUND_CONFIRM_STRINGS as Record<string, Record<string, string>>)[lang]
      expect(table, lang).toBeDefined()
      expect(Object.keys(table!).sort(), lang).toEqual(keys)
      for (const key of keys) expect(table![key], `${lang}.${key}`).not.toBe('')
    }
  })

  it('blocks by default and when closed; "Allow" is the second button', () => {
    const o = confirmDialogOptions('ko', 'read_url', ['https://evil.example/?d=1'])
    expect(o.buttons).toEqual(['막기', '허용'])
    expect(o.defaultId).toBe(0)
    expect(o.cancelId).toBe(0)
    expect(o.detail).toContain('https://evil.example/?d=1')
    expect(o.detail).toContain('read_url')
  })

  it('cuts a very long address so the dialog stays readable', () => {
    const long = `https://evil.example/?d=${'x'.repeat(1000)}`
    const o = confirmDialogOptions('en', 'read_url', [long])
    expect(o.detail).toContain('…')
    expect(o.detail!.length).toBeLessThan(800)
  })
})

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('outbound wiring', () => {
  it('the shell registers the handlers, reading only an explicit false as off', () => {
    const index = src('../src/main/index.ts')
    expect(index).toContain('registerOutboundIpc({')
    expect(index).toContain('internetToolsOn: () => readStoredAiSettings().internetTools !== false')
  })

  it('every editor with an AI panel exposes the outbound bridge', () => {
    for (const app of ['docs', 'html', 'hwp', 'markdown', 'mindmap', 'pdf', 'sheets', 'slides']) {
      expect(src(`../../${app}/src/preload/index.ts`), app).toContain(
        "contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())",
      )
    }
  })
})
