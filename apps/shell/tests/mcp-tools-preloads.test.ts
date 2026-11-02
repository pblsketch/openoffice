import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every AI window reaches the person's MCP tools and the outbound guard
 * through the shared bridges: the nine editors' preloads and the shell
 * preload (home window) expose `window.aiOfficeMcpTools` and
 * `window.aiOfficeOutbound`. Without the outbound bridge the renderer's
 * guard blocks nothing, so a preload that drops it turns the internet-tools
 * switch off silently. The home window gets no Drive bridge.
 */

const APPS = join(__dirname, '..', '..')
const EDITORS = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html', 'mindmap', 'hwp', 'epub']

const preload = (app: string) => readFileSync(join(APPS, app, 'src', 'preload', 'index.ts'), 'utf8')

describe('MCP tools and outbound bridges in every AI window preload', () => {
  for (const app of [...EDITORS, 'shell']) {
    it(`${app} exposes the MCP tools bridge`, () => {
      const source = preload(app)
      expect(source).toContain(
        "import { mcpToolsBridge } from '@genoffice/electron-utils/mcp-tools-bridge'",
      )
      expect(source).toContain(
        "contextBridge.exposeInMainWorld('aiOfficeMcpTools', mcpToolsBridge())",
      )
    })

    it(`${app} exposes the outbound bridge`, () => {
      const source = preload(app)
      expect(source).toContain(
        "import { outboundBridge } from '@genoffice/electron-utils/outbound-bridge'",
      )
      expect(source).toContain(
        "contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())",
      )
    })
  }

  it('the home window gets no Drive tools', () => {
    const source = preload('shell')
    expect(source).not.toContain('aiOfficeDriveAi')
    expect(source).not.toContain('drive-ai-bridge')
  })
})
