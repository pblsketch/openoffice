import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// resolve sibling source packages by path (not via node_modules), so a git
// worktree whose node_modules is linked to another checkout still tests
// against this checkout's edits (same convention as packages/pdf2docx)
const local = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@genoffice/docx-engine/lazy-media': local('../../packages/docx-engine/src/lazy-media.ts'),
      '@genoffice/docx-engine': local('../../packages/docx-engine/src/index.ts'),
      '@genoffice/odt-engine': local('../../packages/odt-engine/src/index.ts'),
      '@genoffice/font-metrics/resolve': local('../../packages/font-metrics/src/resolve.ts'),
      '@genoffice/font-metrics/word-faces.json': local(
        '../../packages/font-metrics/word-faces.json',
      ),
      '@genoffice/font-metrics': local('../../packages/font-metrics/src/index.ts'),
      // subpath before the bare name: string aliases are prefix replacements
      '@genoffice/electron-utils/doc-attach-channels': local(
        '../../packages/electron-utils/src/doc-attach-channels.ts',
      ),
      '@genoffice/electron-utils/headless-export': local(
        '../../packages/electron-utils/src/headless-export.ts',
      ),
      '@genoffice/electron-utils/print-job': local(
        '../../packages/electron-utils/src/print-job.ts',
      ),
      '@genoffice/electron-utils/atomic-write': local(
        '../../packages/electron-utils/src/atomic-write.ts',
      ),
      '@genoffice/electron-utils/safe-external-url': local(
        '../../packages/electron-utils/src/safe-external-url.ts',
      ),
      '@genoffice/electron-utils/renderer-scheme': local(
        '../../packages/electron-utils/src/renderer-scheme.ts',
      ),
      '@genoffice/electron-utils/template-font-response': local(
        '../../packages/electron-utils/src/template-font-response.ts',
      ),
      '@genoffice/electron-utils': local('../../packages/electron-utils/src/index.ts'),
      '@genoffice/ai-provider/browser': local('../../packages/ai-provider/src/browser.ts'),
      '@genoffice/ai-provider/codex-app-server': local(
        '../../packages/ai-provider/src/codex-app-server.ts',
      ),
      '@genoffice/ai-provider/custom-models': local(
        '../../packages/ai-provider/src/custom-models.ts',
      ),
      '@genoffice/ai-provider/free-connect': local(
        '../../packages/ai-provider/src/free-connect.ts',
      ),
      '@genoffice/ai-provider/subscription': local(
        '../../packages/ai-provider/src/subscription.ts',
      ),
      '@genoffice/ai-provider': local('../../packages/ai-provider/src/index.ts'),
      '@genoffice/i18n': local('../../packages/i18n/src/index.ts'),
      '@genoffice/ui/template-fonts': local('../../packages/ui/src/template-fonts.ts'),
      '@genoffice/ui/ai-subscription-login-window': local(
        '../../packages/ui/src/ai-subscription-login-window.ts',
      ),
      '@genoffice/ui': local('../../packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    testTimeout: 20000,
  },
})
