/**
 * Builds the rhwp-studio editor that the HWP renderer hosts in an iframe.
 *
 * rhwp publishes its engine (`@rhwp/core`, prebuilt WASM) and its embed SDK
 * (`@rhwp/editor`) on npm, but not the studio itself, and the SDK's default is
 * to load the studio from the project's public website. The app must work
 * offline and send nothing out, so the studio is built here from the pinned
 * upstream tag and shipped inside the renderer.
 *
 * Output: public/studio (git-ignored; the renderer's vite publicDir, so it is
 * copied into the renderer build and served by the dev server). It stays out of
 * src/ so the tools that walk the source tree never read a generated bundle. The source checkout is cached under node_modules/.cache, and
 * the build is skipped when the stamp matches.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import {
  AGENT_PLUGIN_MODULE,
  HANCOM_KEYS_MODULE,
  STUDIO_PATCHES,
  missingHancomCommands,
  missingPluginHooks,
  rhwpPatches,
} from './rhwp-patches.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const APP = resolve(SCRIPTS, '..')
const require = createRequire(join(APP, 'package.json'))

const REPO = 'https://github.com/edwardkim/rhwp.git'
/**
 * The studio is built from the tag the engine was built from. The engine is the
 * patched build in vendor/rhwp-core (decision 0050), which names its tag.
 */
const CORE_DIR = dirname(require.resolve('@rhwp/core'))
const core = JSON.parse(readFileSync(join(CORE_DIR, 'package.json'), 'utf8'))
const VERSION = core.version
const TAG = core.rhwp.tag
/** Commit each supported tag must resolve to; a moved tag stops the build. */
const PINNED_COMMITS = {
  'v0.8.7': '1a76570e833917d15817415a53c09ad61ab3203f',
}
/**
 * Only what the build reads. The repository also carries gigabytes of sample
 * documents; `public/fonts` is a symlink into a font set whose licenses are not
 * all on this project's allowlist, and `public/samples` is demo content.
 */
const SPARSE_PATTERNS = [
  '/LICENSE',
  '/THIRD_PARTY_LICENSES.md',
  '/rhwp-studio/index.html',
  '/rhwp-studio/src/',
  '/rhwp-studio/public/',
  '!/rhwp-studio/public/fonts',
  '!/rhwp-studio/public/samples',
  '/npm/hwpctrl-ocx/src/',
]

const CACHE = join(APP, 'node_modules', '.cache', 'rhwp-studio', TAG)
const OUT = join(APP, 'public', 'studio')
const AGENT_PLUGIN = join(APP, 'studio-plugin', 'agent-plugin.mjs')
const HANCOM_KEYS = join(APP, 'studio-plugin', 'hancom-keys.mjs')
const STAMP = join(OUT, '.stamp')

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim()
}

function stampValue() {
  const hash = createHash('sha256')
  hash.update(TAG)
  for (const file of ['build-studio.mjs', 'rhwp-patches.mjs']) {
    hash.update(readFileSync(join(SCRIPTS, file)))
  }
  // the app's own plugin and the Hangul keys are compiled into the studio
  hash.update(readFileSync(AGENT_PLUGIN))
  hash.update(readFileSync(HANCOM_KEYS))
  // and so is the engine: a rebuilt WASM must reach the studio
  hash.update(readFileSync(join(CORE_DIR, 'rhwp_bg.wasm')))
  return hash.digest('hex')
}

function fetchSource() {
  const pinned = PINNED_COMMITS[TAG]
  if (!pinned) {
    throw new Error(
      `rhwp-studio: no pinned commit for ${TAG}; add it to PINNED_COMMITS after reviewing the release`,
    )
  }
  if (existsSync(join(CACHE, '.git')) && git(['rev-parse', 'HEAD'], CACHE) === pinned) {
    // same commit; re-apply the patterns in case this script widened them since the checkout
    git(['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS], CACHE)
    return
  }
  rmSync(CACHE, { recursive: true, force: true })
  mkdirSync(dirname(CACHE), { recursive: true })
  console.log(`rhwp-studio: fetching ${TAG} from ${REPO}`)
  git(
    ['clone', '--depth', '1', '--branch', TAG, '--filter=blob:none', '--no-checkout', REPO, CACHE],
    dirname(CACHE),
  )
  git(['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS], CACHE)
  git(['checkout', '--quiet', TAG], CACHE)
  const head = git(['rev-parse', 'HEAD'], CACHE)
  if (head !== pinned) {
    rmSync(CACHE, { recursive: true, force: true })
    throw new Error(`rhwp-studio: ${TAG} resolved to ${head}, expected ${pinned}`)
  }
}

/** Stop the build when the fetched studio no longer has what the app's plugin reaches into. */
function checkPluginHooks() {
  const missing = missingPluginHooks((file) => {
    try {
      return readFileSync(join(CACHE, 'rhwp-studio', file), 'utf8')
    } catch {
      return null
    }
  })
  if (missing.length > 0) {
    throw new Error(
      `rhwp-studio ${TAG}: the editor no longer has what the app's plugin uses to show a change, ` +
        `read the selection, select a word and mark its changes, or what the Hangul keys use ` +
        `(see pluginHooks and hancomHooks in rhwp-patches.mjs):\n  ` +
        missing.join('\n  '),
    )
  }
  const commands = join(CACHE, 'rhwp-studio', 'src', 'command', 'commands')
  const sources = readdirSync(commands)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => readFileSync(join(commands, file), 'utf8'))
    .join('\n')
  const gone = missingHancomCommands(sources)
  if (gone.length > 0) {
    throw new Error(
      `rhwp-studio ${TAG}: the editor no longer has the commands the Hangul keys run ` +
        `(studio-plugin/hancom-keys.mjs): ${gone.join(', ')}`,
    )
  }
}

async function buildStudio() {
  const studio = join(CACHE, 'rhwp-studio')
  const wasmPkg = dirname(require.resolve('@rhwp/core'))
  await build({
    configFile: false,
    root: studio,
    base: './',
    logLevel: 'warn',
    define: {
      __APP_VERSION__: JSON.stringify(VERSION),
      // no CDN web fonts: the app makes no request the user did not ask for
      __RHWP_DISABLE_EXTERNAL_WEBFONTS__: 'true',
      __RHWP_HWPCTRL__: 'true',
    },
    resolve: {
      alias: {
        '@': join(studio, 'src'),
        '@wasm': wasmPkg,
        '@rhwp/hwpctrl/studio-plugin': join(
          CACHE,
          'npm',
          'hwpctrl-ocx',
          'src',
          'studio-plugin.mjs',
        ),
        [AGENT_PLUGIN_MODULE]: AGENT_PLUGIN,
        [HANCOM_KEYS_MODULE]: HANCOM_KEYS,
      },
    },
    // upstream registers a service worker for its website build; this build
    // leaves that plugin out, a custom scheme cannot register one
    plugins: [rhwpPatches(...STUDIO_PATCHES)],
    build: { outDir: OUT, emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  })
  // the licenses travel with the build: rhwp's own, and the list of what its WASM links in
  copyFileSync(join(CACHE, 'LICENSE'), join(OUT, 'LICENSE-rhwp.txt'))
  copyFileSync(join(CACHE, 'THIRD_PARTY_LICENSES.md'), join(OUT, 'THIRD-PARTY-LICENSES-rhwp.md'))
}

const force = process.argv.includes('--force')
const stamp = stampValue()
if (
  !force &&
  existsSync(join(OUT, 'index.html')) &&
  existsSync(STAMP) &&
  readFileSync(STAMP, 'utf8') === stamp
) {
  console.log(`rhwp-studio: ${TAG} is up to date`)
} else {
  fetchSource()
  checkPluginHooks()
  await buildStudio()
  writeFileSync(STAMP, stamp)
  console.log(`rhwp-studio: built ${TAG} into ${OUT}`)
}
