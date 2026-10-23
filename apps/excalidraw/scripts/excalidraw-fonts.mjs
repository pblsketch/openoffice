/**
 * The drawing library loads its fonts at run time from
 * `window.EXCALIDRAW_ASSET_PATH`, falling back to a public CDN. The app never
 * reaches the network for them: this plugin copies the fonts the package
 * ships into the renderer's public folder (`public/fonts`, not tracked), and
 * `public/asset-path.js` points the library at that folder. It is a classic
 * script the page loads before its modules: the library registers some fonts
 * while its own module is evaluated, before any code of the entry runs.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** The package's production build folder (its `exports` hide package.json). */
function packageBuildDir() {
  return dirname(require.resolve('@excalidraw/excalidraw'))
}

/** The folder the package keeps its fonts in. */
export function packageFontsDir() {
  return join(packageBuildDir(), 'fonts')
}

const ASSET_PATH_SCRIPT = [
  '// written by scripts/excalidraw-fonts.mjs: the drawing library loads its fonts from this folder',
  "window.EXCALIDRAW_ASSET_PATH = new URL('./', window.location.href).href",
  '',
].join('\n')

/** Copy the fonts once per package version, and write the script that points at them. */
export function copyExcalidrawFonts(publicDir) {
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(join(publicDir, 'asset-path.js'), ASSET_PATH_SCRIPT)
  const version = JSON.parse(
    readFileSync(join(packageBuildDir(), '..', '..', 'package.json'), 'utf8'),
  ).version
  const stamp = join(publicDir, 'fonts', '.version')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return
  cpSync(packageFontsDir(), join(publicDir, 'fonts'), { recursive: true })
  writeFileSync(stamp, version)
}

/**
 * The library lists a public CDN after the app's own folder for every font.
 * Chromium asks that address as well even when the first one loads (the page's
 * CSP blocks it, but the request is still made), so the build drops the CDN
 * entry. The pattern is the library's minified build at the pinned version; a
 * build that does not find it fails, so a library upgrade has to look again.
 */
const CDN_FALLBACK = /(\w+)\.push\(new URL\((\w+),(\w+)\.ASSETS_FALLBACK_URL\)\),/

export function dropCdnFallback(code) {
  if (!CDN_FALLBACK.test(code)) return null
  return code.replace(CDN_FALLBACK, '')
}

/** @param {string} publicDir */
export function excalidrawFonts(publicDir) {
  let patched = false
  return {
    name: 'excalidraw-fonts',
    buildStart() {
      copyExcalidrawFonts(publicDir)
      patched = false
    },
    transform(code, id) {
      if (!/[\\/]@excalidraw[\\/]excalidraw[\\/]dist[\\/]/.test(id)) return null
      if (!code.includes('ASSETS_FALLBACK_URL')) return null
      const out = dropCdnFallback(code)
      if (out === null) {
        this.error(`excalidraw-fonts: the font CDN fallback was not found in ${id}`)
      }
      patched = true
      return { code: out, map: null }
    },
    buildEnd(error) {
      // a production build must have removed the fallback (the dev server pre-bundles the library instead)
      if (!error && this.meta.watchMode === false && !patched) {
        this.error(
          'excalidraw-fonts: the drawing library was bundled without dropping its font CDN',
        )
      }
    },
  }
}
