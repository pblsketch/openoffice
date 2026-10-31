import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every AI window reaches the project folders through the same bridge
 * (decision 0088): the nine editors' preloads and the shell preload (home ask,
 * home project screen) expose `window.projectFolderApi` built by the shared
 * factory, and each renderer declares the global. The bridge's own shape is
 * tested in packages/electron-utils/tests/project-folder-bridge.test.ts.
 */

const APPS = join(__dirname, '..', '..')
const EDITORS = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html', 'mindmap', 'hwp', 'epub']

const read = (...parts: string[]) => readFileSync(join(APPS, ...parts), 'utf8')

describe('project folder bridge in every preload', () => {
  for (const app of [...EDITORS, 'shell']) {
    it(`${app} exposes the shared bridge`, () => {
      const source = read(app, 'src', 'preload', 'index.ts')
      expect(source).toContain("from '@genoffice/electron-utils/project-folder-bridge'")
      expect(source).toContain(
        'contextBridge.exposeInMainWorld(PROJECT_FOLDER_BRIDGE_KEY, projectFolderBridge(ipcRenderer))',
      )
      // the preload never imports the project-store root (it carries Node's fs)
      expect(source).not.toMatch(/^import \{[^}]*\} from '@genoffice\/project-store'/m)
    })
  }

  for (const app of EDITORS) {
    it(`${app} declares window.projectFolderApi`, () => {
      expect(read(app, 'src', 'renderer', 'env.d.ts')).toContain(
        'projectFolderApi?: ProjectFolderApi',
      )
    })
  }

  it('the shell renderer declares window.projectFolderApi', () => {
    expect(read('shell', 'src', 'renderer', 'src', 'project-folder-global.ts')).toContain(
      'projectFolderApi?: ProjectFolderApi',
    )
  })
})
