import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  ON_PC_SCHEMES,
  answerMessageBoxes,
  applyOps,
  clickMenu,
  contentsIdOf,
  copyAsset,
  darkViewOn,
  diagramRequests,
  drawioFrame,
  exportFromMenu,
  fileText,
  liveText,
  openDiagramPage,
  openPath,
  schemeOf,
  scratchDir,
  setAppTheme,
  statusText,
  watchDiagramRequests,
} from './diagram-lib'

/**
 * A diagram tab sends nothing off this PC (spec 6, spec 13). A whole working
 * session in the built app (open, edit, Mermaid, draw.io's own dialogs and
 * panels, the shape search, the dark view, save, PNG / SVG / PDF export) and
 * every request the diagram session was asked about stays on the PC: nothing
 * was refused because nothing tried to leave.
 */

/** draw.io actions that open its own dialogs and panels, each closed again after it ran */
const DRAWIO_ACTIONS = [
  'shapes',
  'insertTemplate',
  'fromText',
  'formatSql',
  'findReplace',
  'layers',
  'outline',
  'editStyle',
  'pageSetup',
  'insertImage',
  'insertLink',
  'mermaid',
  'editDiagram',
  'format',
]

test.describe('diagram editor offline', () => {
  test('open, edit, Mermaid, draw.io features, save and export: no request leaves the PC', async () => {
    test.setTimeout(300_000)
    const dir = await scratchDir('offline')
    const path = await copyAsset('sample.drawio', dir)
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'diagram-offline' })
    const { app, page: shell } = launched
    try {
      await watchDiagramRequests(app)
      await answerMessageBoxes(app, 1)
      const page = await openDiagramPage(app, () => openPath(shell, path))
      const contents = await contentsIdOf(app, page)

      // ── edits through the editor's executor, Mermaid drawn by draw.io's own converter
      const edited = await applyOps(app, contents, [
        { op: 'add_shape', id: 'off-1', label: 'Offline shape', x: 40, y: 200 },
        { op: 'add_edge', source: 'b', target: 'off-1', label: 'next' },
        {
          op: 'insert_mermaid',
          text: 'graph TD\n  A[시작] --> B{판단}\n  B -->|예| C[끝]\n  B -->|아니오| A',
        },
      ])
      expect(edited.ok, edited.error).toBe(true)
      expect(edited.result?.status).toBe('ok')
      const sequence = await applyOps(app, contents, [
        { op: 'add_page', id: 'seq-page', name: 'Sequence' },
        {
          op: 'insert_mermaid',
          page: 'seq-page',
          text: 'sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Hello',
        },
      ])
      expect(sequence.ok, sequence.error).toBe(true)
      expect(sequence.result?.status).toBe('ok')
      const drawn = await liveText(page)
      expect(drawn).toContain('Offline shape')
      expect(drawn).toContain('판단')
      expect(drawn).toContain('Alice')

      // ── draw.io's own features: dialogs, panels, the shape search, zoom and find
      const frame = drawioFrame(page)
      await frame.evaluate(() => {
        const proto = (
          window as unknown as {
            EditorUi: { prototype: { getXmlFileData: (...args: unknown[]) => unknown } }
          }
        ).EditorUi.prototype
        const original = proto.getXmlFileData
        proto.getXmlFileData = function (this: unknown, ...args: unknown[]) {
          ;(window as unknown as { __ui?: unknown }).__ui = this
          return original.apply(this, args)
        }
      })
      await liveText(page)
      const ran: Record<string, string> = {}
      for (const name of DRAWIO_ACTIONS) {
        ran[name] = await frame.evaluate((action) => {
          const ui = (
            window as unknown as {
              __ui: {
                actions: {
                  get(name: string): { funct(): void; visible?: boolean } | null
                }
              }
            }
          ).__ui
          const entry = ui.actions.get(action)
          if (!entry) return 'missing'
          try {
            entry.funct()
            return 'ran'
          } catch (err) {
            return `threw ${err instanceof Error ? err.message : String(err)}`
          }
        }, name)
        await page.waitForTimeout(700)
        await frame.evaluate(() => {
          const ui = (window as unknown as { __ui: { hideDialog?: (cancel: boolean) => void } })
            .__ui
          ui.hideDialog?.(true)
        })
        await page.waitForTimeout(150)
      }
      for (const name of DRAWIO_ACTIONS) expect.soft(ran[name], name).toBe('ran')
      const found = await frame.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const ui = (
              window as unknown as {
                __ui: {
                  sidebar: {
                    searchEntries(
                      term: string,
                      count: number,
                      page: number,
                      success: (results: unknown[] | null) => void,
                      error: () => void,
                    ): void
                  }
                }
              }
            ).__ui
            ui.sidebar.searchEntries(
              'cloud',
              10,
              0,
              (results) => resolve(results?.length ?? 0),
              () => resolve(-1),
            )
            setTimeout(() => resolve(-2), 10_000)
          }),
      )
      expect(found, 'the shape search finds shapes on this PC').toBeGreaterThan(0)
      for (const label of ['^Zoom In', '^Zoom Out', '^Fit']) await clickMenu(app, 'View', label)
      await clickMenu(app, 'Edit', '^Find')
      await page.waitForTimeout(500)

      // ── the dark view and back
      await setAppTheme(shell, 'dark')
      await expect.poll(() => darkViewOn(page)).toBe(true)
      await page.screenshot({ path: screenshotPath('diagram-offline-dark') })
      await setAppTheme(shell, 'light')
      await expect.poll(() => darkViewOn(page)).toBe(false)

      // ── save and the three exports
      await clickMenu(app, 'File', '^Save$')
      await expect.poll(() => statusText(page), { timeout: 30_000 }).toBe('Saved')
      expect(await fileText(path)).toBe(await liveText(page))
      // two pages: the pictures land as <name>-p1 and -p2, the PDF as one file
      for (const format of ['png', 'svg', 'pdf'] as const) {
        const written = await exportFromMenu(app, page, format, join(dir, `exported.${format}`))
        expect(written.endsWith(format === 'pdf' ? 'exported.pdf' : `exported-p1.${format}`)).toBe(
          true,
        )
      }
      await page.screenshot({ path: screenshotPath('diagram-offline') })

      // ── every request stayed on this PC; none had to be refused
      const requests = await diagramRequests(app)
      expect(requests.length, 'the request screen saw the session').toBeGreaterThan(20)
      expect(requests.filter((request) => request.refused)).toEqual([])
      const schemes = [...new Set(requests.map((request) => schemeOf(request.url)))].sort()
      for (const scheme of schemes) expect(ON_PC_SCHEMES).toContain(scheme)
      expect(schemes).toContain('drawio-app:')
    } finally {
      await closeAndSaveVideo(launched, 'diagram-offline')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
