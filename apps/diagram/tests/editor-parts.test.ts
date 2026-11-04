// @vitest-environment node
// The open notice, the print sheets, draw.io's start arguments and
// configuration, recovery copies, and the 21 languages.
import { describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { hasNotices, scanDiagramNotices } from '../src/shared/notices'
import { buildPrintHtml, inertSvg, isPrintCancel, isPrintPage } from '../src/main/print-document'
import {
  DRAWIO_CONFIG,
  HIDDEN_ACTIONS,
  HIDDEN_EXPORTS,
  HIDDEN_SUBMENUS,
  REDIRECTED_ACTIONS,
  drawioLang,
  drawioStartUrl,
} from '../src/shared/drawio-start'
import { DiagramCopier } from '../src/renderer/document/recovery-copies'
import { appStrings } from '../src/renderer/i18n/strings-app'
import { DIAGRAM_CHANNELS } from '../src/shared/ipc'

describe('scanDiagramNotices', () => {
  it('counts remote pictures, remote fonts, PlantUML, libavoid and ELK', () => {
    const page = [
      '<mxGraphModel backgroundImage="{&quot;src&quot;:&quot;https://x.example/bg.png&quot;}"><root>',
      '<mxCell id="0"/><mxCell id="1" parent="0"/>',
      '<mxCell id="a" style="shape=image;image=https://x.example/a.png;" vertex="1" parent="1"/>',
      '<mxCell id="b" style="shape=image;image=data:image/png,AAAA;" vertex="1" parent="1"/>',
      '<mxCell id="c" value="&lt;img src=&quot;http://x.example/c.png&quot;&gt;" style="html=1;" vertex="1" parent="1"/>',
      '<mxCell id="d" style="fontFamily=Roboto;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DRoboto;" vertex="1" parent="1"/>',
      '<UserObject id="e" label="" plantUmlData="{}"><mxCell style="shape=image;image=data:image/svg+xml,x;" vertex="1" parent="1"/></UserObject>',
      '<mxCell id="f" style="edgeStyle=orthogonalEdgeStyle;libavoidRouting=1;" edge="1" parent="1"/>',
      '<mxCell id="g" style="swimlane;childLayout=elkLayered;" vertex="1" parent="1"/>',
      '</root></mxGraphModel>',
    ].join('')
    expect(scanDiagramNotices([page])).toEqual({
      remotePictures: 3,
      remoteFonts: 1,
      plantUml: 1,
      libavoid: 1,
      elk: 1,
    })
  })

  it('finds nothing in an ordinary diagram', () => {
    const notices = scanDiagramNotices([
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="a" style="rounded=1;libavoidRouting=0;childLayout=stackLayout;" value="text"/></root></mxGraphModel>',
    ])
    expect(hasNotices(notices)).toBe(false)
    expect(hasNotices({ ...notices, visioPictures: 2 })).toBe(true)
  })
})

describe('print sheets', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200px" height="100px" viewBox="0 0 200 100"></svg>'

  it('gives each page its own sheet at the page format, in light colors', () => {
    const html = buildPrintHtml(
      [
        { svg, width: 200, height: 100, pageWidth: 827, pageHeight: 1169 },
        { svg, width: 200, height: 100, pageWidth: 1169, pageHeight: 827 },
      ],
      'Flow <1>',
    )
    expect(html).toContain('@page p1 { size: 8.27in 11.69in; margin: 0; }')
    expect(html).toContain('@page p2 { size: 11.69in 8.27in; margin: 0; }')
    expect(html).toContain('color-scheme: light')
    expect(html).toContain('<title>Flow &lt;1&gt;</title>')
    expect(html.match(/class="sheet p\d"/g)).toHaveLength(2)
  })

  it('takes scripts and event attributes out of a picture', () => {
    expect(inertSvg('<svg onload="x()"><script>alert(1)</script><g onclick=\'y\'/></svg>')).toBe(
      '<svg><g/></svg>',
    )
  })

  it('treats a closed print dialog as a cancel, not a failure', () => {
    expect(isPrintCancel('cancelled')).toBe(true)
    expect(isPrintCancel('Print job canceled')).toBe(true)
    expect(isPrintCancel('failed')).toBe(false)
    expect(isPrintCancel('')).toBe(false)
    expect(isPrintCancel(undefined)).toBe(false)
  })

  it('accepts only SVG pages with sizes', () => {
    expect(isPrintPage({ svg, width: 1, height: 1, pageWidth: 1, pageHeight: 1 })).toBe(true)
    expect(isPrintPage({ svg: '<div/>', width: 1, height: 1, pageWidth: 1, pageHeight: 1 })).toBe(
      false,
    )
    expect(isPrintPage({ svg, width: '1' })).toBe(false)
  })
})

describe('draw.io start', () => {
  it('starts embedded, offline, stealth, locked down, in the app language', () => {
    const url = new URL(drawioStartUrl({ lang: 'zh-TW', dark: false }))
    expect(url.protocol).toBe('drawio-app:')
    expect(url.pathname).toBe('/index.html')
    const params = Object.fromEntries(url.searchParams)
    expect(params).toEqual({
      embed: '1',
      proto: 'json',
      offline: '1',
      stealth: '1',
      lockdown: '1',
      lang: 'zh-tw',
      noExitBtn: '1',
      saveAndExit: '0',
      browser: '0',
      spin: '1',
    })
    expect(new URL(drawioStartUrl({ lang: 'ko', dark: true })).searchParams.get('dark')).toBe('1')
  })

  it('maps every app language to one draw.io has', () => {
    for (const lang of LANGS) expect(drawioLang(lang)).toMatch(/^[a-z]{2}(-tw)?$/)
  })

  it('turns draw.io’s AI, web fonts and export links off', () => {
    expect(DRAWIO_CONFIG.enableAi).toBe(false)
    expect(DRAWIO_CONFIG.enableChatGpt).toBe(false)
    expect(DRAWIO_CONFIG.enableExportUrl).toBe(false)
    expect(DRAWIO_CONFIG.gptApiKey).toBeNull()
    expect(DRAWIO_CONFIG.customFonts).toEqual([])
  })

  it('takes draw.io’s outside services and switches off the screen', () => {
    for (const name of [
      'about',
      'support',
      'plugins',
      'plantUml',
      'exit',
      'share',
      'publishLink',
    ]) {
      expect(HIDDEN_ACTIONS).toContain(name)
      expect(DRAWIO_CONFIG.hideMenuItems).toContain(name)
    }
    for (const name of ['embed', 'publish', 'appearance', 'theme', 'language']) {
      expect(HIDDEN_SUBMENUS).toContain(name)
    }
    expect(Object.keys(REDIRECTED_ACTIONS).sort()).toEqual(
      ['exportPdf', 'exportPng', 'exportSvg', 'help', 'print', 'save'].sort(),
    )
  })

  it('hides every export target the app does not carry out; keeps the keyboard shortcuts', () => {
    for (const name of [
      'exportJpg',
      'exportWebp',
      'exportAnimatedGif',
      'exportXml',
      'exportJson',
      'exportHtml',
      'exportUrl',
      'exportVsdx',
      'export',
    ]) {
      expect(HIDDEN_EXPORTS).toContain(name)
      expect(HIDDEN_ACTIONS).toContain(name)
      expect(DRAWIO_CONFIG.hideMenuItems).toContain(name)
    }
    for (const name of Object.keys(REDIRECTED_ACTIONS)) expect(HIDDEN_ACTIONS).not.toContain(name)
    expect(HIDDEN_ACTIONS).not.toContain('keyboardShortcuts')
  })
})

describe('DiagramCopier', () => {
  const host = (overrides: Partial<Parameters<typeof DiagramCopier>[0]> = {}) => {
    const state = { dirty: true, revision: 1, saving: false }
    const write = vi.fn(async () => 'written' as const)
    const copier = new DiagramCopier({
      dirty: () => state.dirty,
      revision: () => state.revision,
      saving: () => state.saving,
      bytes: async () => new Uint8Array([1]),
      write,
      ...overrides,
    })
    return { copier, state, write }
  }

  it('copies a changed diagram once per change', async () => {
    const { copier, state, write } = host()
    expect(await copier.tick()).toBe('written')
    expect(await copier.tick()).toBe('unchanged')
    state.revision = 2
    expect(await copier.tick()).toBe('written')
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('copies nothing clean, and copies again after a reset', async () => {
    const { copier, state } = host()
    state.dirty = false
    expect(await copier.tick()).toBe('clean')
    state.dirty = true
    expect(await copier.tick()).toBe('written')
    copier.reset()
    expect(await copier.tick()).toBe('written')
  })

  it('drops a copy a save overtook', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { copier, write } = host({
      bytes: async () => {
        await gate
        return new Uint8Array([1])
      },
    })
    const tick = copier.tick()
    copier.noteSave()
    release()
    expect(await tick).toBe('dropped')
    expect(write).not.toHaveBeenCalled()
  })

  it('backs off after a failed copy', async () => {
    const { copier } = host({ write: async () => Promise.reject(new Error('disk')) })
    expect(await copier.tick()).toBe('failed')
    expect(await copier.tick()).toBe('backoff')
  })
})

describe('languages and channels', () => {
  it('has the same keys in all 21 languages, translated', () => {
    const keys = Object.keys(appStrings.zh).sort()
    expect(Object.keys(appStrings)).toHaveLength(21)
    for (const lang of LANGS) {
      expect(Object.keys(appStrings[lang]).sort(), lang).toEqual(keys)
      for (const key of keys)
        expect(appStrings[lang][key as keyof typeof appStrings.zh], `${lang}.${key}`).not.toBe('')
    }
    // not English copies: the editor's name differs from English where the language has its own word
    for (const lang of [
      'ko',
      'ja',
      'zh',
      'zh-TW',
      'ru',
      'ar',
      'he',
      'hi',
      'th',
      'de',
      'fr',
      'es',
      'vi',
    ] as const) {
      expect(appStrings[lang].untitled, lang).not.toBe(appStrings.en.untitled)
    }
  })

  it('starts every channel with diagram: and never repeats one', () => {
    const names = Object.values(DIAGRAM_CHANNELS)
    for (const name of names) expect(name).toMatch(/^diagram:[a-z-]+$/)
    expect(new Set(names).size).toBe(names.length)
  })
})
