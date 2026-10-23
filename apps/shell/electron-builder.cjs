/**
 * electron-builder configuration (kept out of package.json "build" because it
 * computes values and carries the packaging hooks).
 *
 * Auto-update reads the releases of the product's public GitHub repository
 * (see `publish` below): nothing is injected from the environment and no
 * secret is needed to build an installer that updates itself.
 */

const { execFileSync } = require('node:child_process')
const { existsSync, readFileSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

// Product identity of the installed app. PRODUCT_NAME must equal PRODUCT_NAME
// in packages/i18n/src/product.ts and "productName" in ./package.json, and the
// repository must equal the coordinates defined there
// (tests/product-identity.test.ts keeps them in step). Everything registered
// on the machine derives from these: the installer's product id and install
// folder, the executable name, the userData folder and the Windows ProgIds.
// None of them may coincide with the upstream GenOffice app, so both can be
// installed on one machine without touching each other's registration.
const APP_ID = 'io.github.pblsketch.ieumoffice'
const PRODUCT_NAME = 'IeumOffice'
// package.json "name" of the packaged app (the workspace keeps upstream's
// "@genoffice/shell"): electron-builder and electron-updater name the per-user
// folder that caches the installer and downloaded updates after it
// (<local app data>/<name>-updater), so a shared name is a shared folder.
const PACKAGED_APP_NAME = 'ieumoffice'
const REPO_OWNER = 'pblsketch'
const REPO_NAME = 'openoffice'
const MAINTAINER = 'pblsketch <pblsketch@users.noreply.github.com>'

// GENOFFICE_MAC_X64=1 — opt into packaging the Intel (x64) dmg/zip alongside
// arm64. Off by default: Intel packages must only ever ship signed with the
// company certificate (planned dual-track pipeline), so the current release
// pipeline stays arm64-only and never produces a personally-signed Intel
// artifact. The downstream layout (feed archive name, GenOffice-intel.dmg
// alias) keys off which dmgs exist, so flipping this flag is the single
// switch.
const includeMacX64 = process.env.GENOFFICE_MAC_X64 === '1'

// GENOFFICE_WIN_ARM64=1 — package the Windows ARM64 installer instead of x64.
// CI runs it as a second electron-builder pass (own BUILD_DIR) after the
// unchanged x64 pass, so the two never share an output dir or a sidecar path:
// the sidecar comes from the matching cargo target dir and is checked to
// exist at beforePack because electron-builder exits 0 on a missing
// extraResources source (Sheets would ship dead on every ARM install).
const winArm64 = process.env.GENOFFICE_WIN_ARM64 === '1'
// 7-Zip packs ARM64 executables with its ARM64 branch filter, which the NSIS
// install-time extractor (Nsis7z) cannot decode: it silently skips
// the app executable and every dll (electron-builder#9983). BCJ it can decode.
if (winArm64 && !process.env.ELECTRON_BUILDER_7Z_FILTER) {
  process.env.ELECTRON_BUILDER_7Z_FILTER = 'BCJ'
}
const winArch = winArm64 ? 'arm64' : 'x64'
const winSidecarTarget = winArm64 ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-gnu'
const WIN_SIDECAR = `../sheets/native/xlsx-engine/target/${winSidecarTarget}/release/xlsx-sidecar.exe`

function assertExtraResourceSources() {
  for (const rel of [
    '../../LICENSE',
    '../../NOTICE',
    '../../LICENSE-UNICODE.txt',
    '../../node_modules/electron/dist/LICENSES.chromium.html',
    '../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
    '../pdf/node_modules/harfbuzzjs/hb-subset.wasm',
    '../../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm',
    '../../packages/ui/template-fonts/README.md',
    '../../node_modules/@rhwp/core/rhwp_bg.wasm',
    'resources/builtin-skills/builtin-skills.json',
  ]) {
    if (!existsSync(join(__dirname, rel))) {
      throw new Error(
        `electron-builder extraResources source missing: ${rel} (npm hoisting changed?)`,
      )
    }
  }
}

// macOS local-OCR helper (scanned-page text recovery): a swiftc output, not
// an npm artifact — compiled here on demand so CI runners and fresh checkouts
// need no manual step. Universal (arm64 + x86_64) when both targets compile,
// host-arch otherwise; mac installers must not silently ship without it.
const VISION_OCR_HELPER = '../../packages/pdf2docx/ocr-helper/vision-ocr'

// Compile the helper. universalOnly=true has NO host-arch fallback: dual-arch
// packaging must fail loudly rather than ship a host-arch binary to both dmgs.
function compileVisionOcr({ universalOnly } = { universalOnly: false }) {
  const src = join(__dirname, `${VISION_OCR_HELPER}.swift`)
  const out = join(__dirname, VISION_OCR_HELPER)
  try {
    try {
      const slices = ['arm64', 'x86_64'].map((arch) => {
        const slice = `${out}.${arch}`
        execFileSync('swiftc', ['-O', src, '-target', `${arch}-apple-macos12`, '-o', slice], {
          stdio: 'inherit',
        })
        return slice
      })
      execFileSync('lipo', ['-create', ...slices, '-output', out], { stdio: 'inherit' })
      for (const slice of slices) rmSync(slice, { force: true })
    } catch (err) {
      if (universalOnly) throw err
      // cross-target SDK unavailable — a host-arch helper still serves this build
      execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' })
    }
  } catch (err) {
    throw new Error(`vision-ocr helper compile failed: ${err}`, { cause: err })
  }
}

const WIN_OCR_HELPER = '../../packages/pdf2docx/ocr-helper/win-ocr.exe'
const WIN_QUICKLOOK_HELPER = 'src/main/quick-look/win-quicklook.exe'

function ensurePlatformHelpers() {
  if (process.platform === 'darwin' && !existsSync(join(__dirname, VISION_OCR_HELPER))) {
    compileVisionOcr()
  }
  if (process.platform === 'win32' && !existsSync(join(__dirname, WIN_OCR_HELPER))) {
    try {
      execFileSync(
        process.execPath,
        [join(__dirname, '../../packages/pdf2docx/ocr-helper/build-win.mjs')],
        { stdio: 'inherit' },
      )
    } catch (err) {
      throw new Error(`win-ocr helper compile failed: ${err}`, { cause: err })
    }
  }
  if (process.platform === 'win32' && !existsSync(join(__dirname, WIN_QUICKLOOK_HELPER))) {
    try {
      execFileSync(process.execPath, [join(__dirname, 'src/main/quick-look/build-win.mjs')], {
        stdio: 'inherit',
      })
    } catch (err) {
      throw new Error(`win-quicklook helper compile failed: ${err}`, { cause: err })
    }
  }
}

// Dual-arch packs share one extraResources path, so the shipped helper must be
// a lipo fat binary. A stale host-arch build (dev path above) is rebuilt in
// place; if a universal build cannot be produced, packaging aborts — otherwise
// the other arch's OCR silently fails and every scanned page ships as bitmap.
function assertUniversalVisionOcr() {
  const helper = join(__dirname, VISION_OCR_HELPER)
  const wanted = ['x86_64', 'arm64']
  const archsOf = () =>
    existsSync(helper)
      ? execFileSync('lipo', ['-archs', helper], { encoding: 'utf8' }).trim().split(/\s+/)
      : []
  if (!wanted.every((w) => archsOf().includes(w))) {
    rmSync(helper, { force: true })
    compileVisionOcr({ universalOnly: true })
  }
  const archs = archsOf()
  for (const want of wanted) {
    if (!archs.includes(want)) {
      throw new Error(
        `vision-ocr helper is [${archs.join(', ')}] but both mac arch packages ship it`,
      )
    }
  }
}

// The module trees are electron-vite outputs produced by build:all; a missing
// one means that module's build did not run or failed. electron-builder only
// logs "file source doesn't exist" for an absent extraResources source and
// still exits 0, so without this the installer launches normally and is simply
// missing that editor — it surfaces only when a user opens the tab.
//
// Runs from the beforePack hook, not at module load: gen-third-party-notices
// requires this config to read extraResources, and the dist:* scripts run
// notices before build:all, when the out dirs legitimately don't exist yet.
// When the mac build packages BOTH arches (GENOFFICE_MAC_X64=1) its
// extraResources entry is a single path shared by the two packs, so the
// sidecar there must be a lipo fat binary — a host-arch-only build (the plain
// `native:build` dev path) would silently ship an arm64 sidecar inside the
// Intel dmg, where every workbook open fails. Runs from beforePack, dual-arch
// mac packs only.
function assertUniversalSidecar() {
  const sidecar = join(__dirname, '../sheets/native/xlsx-engine/target/release/xlsx-sidecar')
  if (!existsSync(sidecar)) {
    throw new Error(
      `mac extraResources source missing: ${sidecar} (run "npm run native:build:universal -w @genoffice/sheets" first)`,
    )
  }
  const archs = execFileSync('lipo', ['-archs', sidecar], { encoding: 'utf8' }).trim().split(/\s+/)
  for (const want of ['x86_64', 'arm64']) {
    if (!archs.includes(want)) {
      throw new Error(
        `xlsx-sidecar is [${archs.join(', ')}] but both mac arch packages ship it — ` +
          'run "npm run native:build:universal -w @genoffice/sheets" before packaging mac',
      )
    }
  }
}

function assertModuleTreesPresent() {
  for (const rel of [
    '../docs/out',
    '../sheets/out',
    '../slides/out',
    '../pdf/out',
    '../markdown/out',
    '../html/out',
    '../mindmap/out',
    '../hwp/out',
    '../excalidraw/out',
    '../../packages/cli/dist/genoffice.cjs',
    '../../packages/cli/dist/node_modules/jsdom',
  ]) {
    if (!existsSync(join(__dirname, rel))) {
      throw new Error(
        `electron-builder extraResources source missing: ${rel} (run npm run build:all first)`,
      )
    }
  }
}

// The pdf structure-job process (src/main/pdf-structure/pdf-structure-process.ts)
// is its own electron-vite chunk next to the main bundle and ships through
// `files: ['out/**']`. Without it every Markdown / EPUB conversion and image
// extraction fails at run time while the rest of the app works, so a build
// that lost the chunk must not be packaged.
function assertPdfStructureProcessBuilt() {
  const dir = join(__dirname, 'out/main')
  const found =
    existsSync(dir) && readdirSync(dir).some((f) => /^pdf-structure-process-.+\.js$/.test(f))
  if (!found) {
    throw new Error(
      'out/main/pdf-structure-process-*.js missing (run "npm run build -w @genoffice/shell" first)',
    )
  }
}

const CLI_BUNDLE_REL = '../../packages/cli/dist/genoffice.cjs'
const CLI_BUILD_REL = '../../packages/cli/build.mjs'
const CLI_VERSION_ENV = 'GENOFFICE_APP_VERSION'
const CLI_VERSION_BANNER = /^const __cliAppVersion = ("(?:[^"\\]|\\.)*");$/m

/**
 * The version the packaged app reports: CI's -c.extraMetadata.version deep-merges
 * into the block below, and without it electron-builder ships apps/shell/package.json.
 */
function packagedAppVersion() {
  const injected = config.extraMetadata && config.extraMetadata.version
  if (typeof injected === 'string' && injected.trim()) return injected.trim()
  return require('./package.json').version
}

function bundledCliVersion(bundlePath) {
  const baked = CLI_VERSION_BANNER.exec(readFileSync(bundlePath, 'utf-8'))
  if (!baked) return null
  try {
    return JSON.parse(baked[1])
  } catch {
    return null
  }
}

/**
 * `genoffice --version` is baked into the CLI bundle, which is built before
 * electron-builder runs and therefore before a release version is known. Rebuild
 * it here with the app version whenever the two disagree, so the packaged
 * command line can never answer with the workspace CLI version.
 */
function ensureCliBundleCarriesAppVersion() {
  const bundlePath = join(__dirname, CLI_BUNDLE_REL)
  const appVersion = packagedAppVersion()
  if (bundledCliVersion(bundlePath) === appVersion) return
  execFileSync(process.execPath, [join(__dirname, CLI_BUILD_REL)], {
    stdio: 'inherit',
    env: { ...process.env, [CLI_VERSION_ENV]: appVersion },
  })
  const baked = bundledCliVersion(bundlePath)
  if (baked !== appVersion) {
    throw new Error(
      `packaged genoffice CLI reports ${baked ?? 'no version'} but the app ships ${appVersion} ` +
        `(rebuild it with ${CLI_VERSION_ENV}=${appVersion})`,
    )
  }
}

const NOTICE_PATH = join(__dirname, 'build/THIRD-PARTY-NOTICES.txt')
const PDFIUM_NOTICE_TERMS = ['@embedpdf/pdfium', 'Copyright 2014 PDFium Authors', 'Apache License']
// tools/gen-third-party-notices.mjs writes this header after the repo NOTICE,
// and one crate-count line per Rust component (xlsx-sidecar, rhwp_bg.wasm)
const NOTICE_HEADER = `${PRODUCT_NAME} — Third-Party Software Notices`
const RUST_COMPONENTS = 2
const CRATE_COUNT_LINE = /^[1-9]\d* crates, all under permissive terms:$/gm

/**
 * What keeps a generated notice from shipping, or [] when it may ship. A stale
 * file (written before a NOTICE change, or by the upstream generator) or a
 * partial one (cargo was missing, so a Rust section is only a pointer) is
 * regenerated rather than packaged.
 */
function thirdPartyNoticeProblems() {
  let text
  try {
    text = readFileSync(NOTICE_PATH, 'utf8')
  } catch {
    return ['the file is missing']
  }
  const problems = PDFIUM_NOTICE_TERMS.filter((term) => !text.includes(term)).map(
    (term) => `PDFium redistribution term "${term}" is missing`,
  )
  const notice = readFileSync(join(__dirname, '../../NOTICE'), 'utf8').trim()
  if (!text.startsWith(notice)) problems.push('it does not open with the current NOTICE')
  if (!text.includes(NOTICE_HEADER)) problems.push(`the "${NOTICE_HEADER}" header is missing`)
  const rustSections = text.match(CRATE_COUNT_LINE)?.length ?? 0
  if (rustSections < RUST_COMPONENTS) {
    problems.push(`${rustSections} of ${RUST_COMPONENTS} Rust crate sections are listed`)
  }
  return problems
}

function ensureThirdPartyNotices() {
  if (thirdPartyNoticeProblems().length > 0) {
    // IEUM_RELEASE makes the generator fail on a gap instead of degrading
    execFileSync(process.execPath, [join(__dirname, '../../tools/gen-third-party-notices.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, IEUM_RELEASE: '1' },
    })
  }
  const problems = thirdPartyNoticeProblems()
  if (problems.length > 0) {
    throw new Error(`third-party notice cannot ship: ${problems.join('; ')}`)
  }
}

/** @type {import('electron-builder').Configuration} */
// NSIS makes every declared ProgId the extension's default opener; for the
// office types that is the point, for plain text and JSON it would hijack the
// system editor, so Windows leaves those two out (mac/Linux only offer them
// in Open With).
// A mind map file and an Excalidraw drawing keep the program the user already
// opens them with, and HWP and HWPX must not be taken from Hancom Office on a
// PC that has it, so Windows takes none of the four as the extension's
// default. They are still offered in Explorer's "Open with":
// build/installer.nsh writes a product-own ProgId with the per-type document
// icon for each, so choosing this app for them shows the Hangul, mind-map or
// drawing icon instead of the bare app icon (the .ico files ship via
// win.extraResources below).
const WIN_OPEN_WITH_ONLY_EXTS = new Set(['txt', 'json', 'xmind', 'hwp', 'hwpx', 'excalidraw'])
// NSIS registers each association under a ProgId taken from its `name`
// (HKCU\Software\Classes\<name>). The upstream app registers the bare names
// below ("Word Document"), so sharing them would let either install overwrite
// the other's open command and either uninstall delete it: Windows gets
// product-scoped ProgIds instead ("IeumOffice.WordDocument"). The same ids are
// spelled out in src/main/default-app.ts and build/installer.nsh.
const winProgId = (name) => `${PRODUCT_NAME}.${name.replace(/[^A-Za-z0-9]/g, '')}`
const FILE_ASSOCIATIONS = [
  {
    ext: 'docx',
    name: 'Word Document',
    description: 'Word Document',
    role: 'Editor',
    icon: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    ext: 'xlsx',
    name: 'Excel Workbook',
    description: 'Excel Workbook',
    role: 'Editor',
    icon: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    ext: 'xlsm',
    name: 'Excel Macro-Enabled Workbook',
    role: 'Editor',
    icon: 'xlsx',
    mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  },
  {
    ext: 'pptx',
    name: 'PowerPoint Presentation',
    description: 'PowerPoint Presentation',
    role: 'Editor',
    icon: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  {
    ext: 'xls',
    name: 'Excel 97-2003 Workbook',
    role: 'Editor',
    icon: 'xlsx',
    mimeType: 'application/vnd.ms-excel',
  },
  {
    ext: 'csv',
    name: 'CSV Document',
    role: 'Editor',
    icon: 'xlsx',
    mimeType: 'text/csv',
  },
  {
    // opens as a converted copy and saves as .xlsx (genoffice#1146)
    ext: 'tsv',
    name: 'TSV Document',
    role: 'Editor',
    icon: 'xlsx',
    mimeType: 'text/tab-separated-values',
  },
  {
    ext: 'pdf',
    name: 'PDF Document',
    role: 'Editor',
    icon: 'pdf',
    mimeType: 'application/pdf',
  },
  {
    ext: 'md',
    name: 'Markdown Document',
    role: 'Editor',
    icon: 'md',
    mimeType: 'text/markdown',
  },
  {
    ext: 'markdown',
    name: 'Markdown Document',
    role: 'Editor',
    icon: 'md',
    mimeType: 'text/markdown',
  },
  {
    ext: 'txt',
    name: 'Text Document',
    description: 'Text Document',
    role: 'Editor',
    icon: 'txt',
    mimeType: 'text/plain',
  },
  {
    ext: 'json',
    name: 'JSON Document',
    description: 'JSON Document',
    role: 'Editor',
    icon: 'json',
    mimeType: 'application/json',
  },
  {
    ext: 'html',
    name: 'HTML Document',
    role: 'Editor',
    icon: 'html',
    mimeType: 'text/html',
  },
  {
    ext: 'htm',
    name: 'HTML Document',
    role: 'Editor',
    icon: 'html',
    mimeType: 'text/html',
  },
  {
    // Open With only: Windows leaves it out (WIN_OPEN_WITH_ONLY_EXTS) and
    // macOS ranks the app as an alternate, so the file's own program stays
    // the default.
    ext: 'xmind',
    name: 'Mind Map',
    description: 'Mind Map',
    role: 'Editor',
    rank: 'Alternate',
    icon: 'mindmap',
    mimeType: 'application/vnd.xmind.workbook',
  },
  {
    ext: 'hwp',
    name: 'HWP Document',
    role: 'Editor',
    icon: 'hwp',
    mimeType: 'application/x-hwp',
  },
  {
    ext: 'hwpx',
    name: 'HWPX Document',
    role: 'Editor',
    icon: 'hwp',
    mimeType: 'application/hwp+zip',
  },
  {
    // Open With only, like .xmind: the drawing app's own files keep their
    // program. An Obsidian drawing note is a .md file and comes through the
    // Markdown association; the shell routes it to the drawing editor.
    ext: 'excalidraw',
    name: 'Drawing',
    description: 'Drawing',
    role: 'Editor',
    rank: 'Alternate',
    icon: 'excalidraw',
    mimeType: 'application/vnd.excalidraw+json',
  },
]

const config = {
  appId: APP_ID,
  productName: PRODUCT_NAME,
  // Resolved from the installed electron package so dependency bumps can
  // never leave a stale hard-coded pin behind (packaging would silently ship
  // the old runtime).
  electronVersion: require('electron/package.json').version,
  directories: {
    output: process.env.BUILD_DIR || 'release',
  },
  files: ['out/**'],
  extraResources: [
    // Apache-2.0 §4(a)/(d): every copy carries the license and the NOTICE of
    // the work; NOTICE refers to LICENSE-UNICODE.txt for the Unicode data
    {
      from: '../../LICENSE',
      to: 'LICENSE.txt',
    },
    {
      from: '../../NOTICE',
      to: 'NOTICE.txt',
    },
    {
      from: '../../LICENSE-UNICODE.txt',
      to: 'LICENSE-UNICODE.txt',
    },
    {
      from: 'build/THIRD-PARTY-NOTICES.txt',
      to: 'THIRD-PARTY-NOTICES.txt',
    },
    {
      from: '../../node_modules/electron/dist/LICENSES.chromium.html',
      to: 'LICENSES.chromium.html',
    },
    {
      from: '../docs/out',
      to: 'modules/docs',
    },
    {
      from: '../sheets/out',
      to: 'modules/sheets',
    },
    {
      from: '../slides/out',
      to: 'modules/slides',
    },
    {
      from: '../pdf/out',
      to: 'modules/pdf',
    },
    {
      from: '../markdown/out',
      to: 'modules/markdown',
    },
    {
      from: '../html/out',
      to: 'modules/html',
    },
    {
      from: '../mindmap/out',
      to: 'modules/mindmap',
    },
    {
      from: '../hwp/out',
      to: 'modules/hwp',
    },
    {
      from: '../excalidraw/out',
      to: 'modules/excalidraw',
    },
    // PDF text editing engines: the bundled main resolves these under
    // Resources/wasm when node_modules is absent (apps/pdf/src/main/wasm-path.ts)
    {
      from: '../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
      to: 'wasm/pdfium.wasm',
    },
    {
      from: '../pdf/node_modules/harfbuzzjs/hb-subset.wasm',
      to: 'wasm/hb-subset.wasm',
    },
    // qpdf for the PDF tools window's add / remove password, run in the PDF job process
    {
      from: '../../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm',
      to: 'wasm/qpdf.wasm',
    },
    // HWP / HWPX reading outside the editor (file search, knowledge base,
    // attachments, MCP, command line): packages/file-parse/src/hwp.ts
    {
      from: '../../node_modules/@rhwp/core/rhwp_bg.wasm',
      to: 'wasm/rhwp_bg.wasm',
    },
    // platform system-OCR helpers for scanned-page recovery (each exists only
    // on its own build platform; electron-builder skips absent sources and the
    // engine resolver degrades to the bitmap fallback when missing)
    {
      from: '../../packages/pdf2docx/ocr-helper/vision-ocr',
      to: 'ocr/vision-ocr',
    },
    {
      from: '../../packages/pdf2docx/ocr-helper/win-ocr.exe',
      to: 'ocr/win-ocr.exe',
    },
    {
      from: 'src/main/quick-look/win-quicklook.exe',
      to: 'quicklook/win-quicklook.exe',
    },
    // genoffice command line: runs on the app binary with ELECTRON_RUN_AS_NODE,
    // so the RunAsNode fuse must stay enabled.
    // Layout (Resources/cli next to wasm/, native/, ocr/) is what
    // packages/cli/src/resources.ts expects.
    {
      from: '../../packages/cli/dist/genoffice.cjs',
      to: 'cli/genoffice.cjs',
    },
    {
      from: '../../packages/cli/bin/ieumoffice',
      to: 'cli/ieumoffice',
    },
    {
      from: '../../packages/cli/bin/ieumoffice.cmd',
      to: 'cli/ieumoffice.cmd',
    },
    // the CLI's version (Settings → Integrations shows it) and the agent skill
    // the same pane installs into Claude Code / Codex / …; bytes identical to the repo file
    {
      from: '../../packages/cli/package.json',
      to: 'cli/package.json',
    },
    {
      from: '../../skills/ieumoffice/SKILL.md',
      to: 'cli/skills/ieumoffice/SKILL.md',
    },
    // runtime deps the genoffice bundle leaves external (jsdom for the Word/Markdown
    // paths); collected by packages/cli/collect-deps.mjs during its build
    {
      from: '../../packages/cli/dist/node_modules',
      to: 'cli/node_modules',
    },
    // the design templates' shared fonts, shipped once for every editor (an
    // asset import would copy them into each editor's out/); main code finds
    // the folder with templateFontsDir (@genoffice/electron-utils)
    {
      from: '../../packages/ui/template-fonts',
      to: 'template-fonts',
    },
    // the skills shipped with the app (read-only in the install folder): each
    // folder is the upstream skill as fetched, listed with its source, commit
    // and license in builtin-skills.json and NOTICE
    {
      from: 'resources/builtin-skills',
      to: 'builtin-skills',
    },
  ],
  // `mimeType` is read only by the Linux target, where it becomes the
  // desktop entry's MimeType= list; associations without it are dropped
  // there. macOS and Windows ignore the field and key off `ext`.
  //
  // `icon` is extension-less on purpose: electron-builder resolves it against
  // build/ as <icon>.icns for the mac CFBundleDocumentTypes entry and
  // <icon>.ico for the NSIS DefaultIcon registry value. Without it both
  // platforms fall back to the app icon, so every associated file shows the
  // bare GenOffice logo instead of a per-type document icon. The icns/ico
  // pairs are generated from the shell renderer's file-type tiles by
  // tools/gen-file-association-icons.mjs.
  //
  // Declared per platform, never at the top level: electron-builder appends a
  // platform's list to the top-level one, so a shared list would also reach
  // Windows with the unscoped names (and with the two types it must not claim).
  npmRebuild: false,
  mac: {
    // Two separate arch packages (NOT universal): arm64 keeps the exact
    // artifact names and update-feed entries it always had, x64 (opt-in via
    // GENOFFICE_MAC_X64=1, see includeMacX64 above) adds Intel support with
    // electron-builder's default arch-less names (GenOffice-<v>.dmg /
    // GenOffice-<v>-mac.zip). Both zips land in one latest-mac.yml and
    // electron-updater picks by process.arch. Dual-arch packs ship the same
    // lipo fat xlsx-sidecar (see assertUniversalSidecar above).
    target: [
      { target: 'dmg', arch: includeMacX64 ? ['arm64', 'x64'] : ['arm64'] },
      { target: 'zip', arch: includeMacX64 ? ['arm64', 'x64'] : ['arm64'] },
    ],
    category: 'public.app-category.productivity',
    fileAssociations: FILE_ASSOCIATIONS,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: true,
    extraResources: [
      {
        from: '../sheets/native/xlsx-engine/target/release/xlsx-sidecar',
        to: 'native/xlsx-sidecar',
      },
    ],
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: [winArch],
      },
    ],
    fileAssociations: FILE_ASSOCIATIONS.filter((a) => !WIN_OPEN_WITH_ONLY_EXTS.has(a.ext)).map(
      (a) => ({ ...a, name: winProgId(a.name) }),
    ),
    extraResources: [
      {
        from: WIN_SIDECAR,
        to: 'native/xlsx-sidecar.exe',
      },
      {
        from: 'build/shell-new',
        to: 'shell-new',
        filter: ['*.docx', '*.xlsx', '*.pptx'],
      },
      // The Open-With ProgIds build/installer.nsh writes for .hwp/.hwpx/.xmind/.excalidraw
      // point their DefaultIcon at these; without the explicit entries the
      // icons are absent (electron-builder places an icon only for the types
      // in win.fileAssociations, and these three stay off that list).
      {
        from: 'build/hwp.ico',
        to: 'hwp.ico',
      },
      {
        from: 'build/mindmap.ico',
        to: 'mindmap.ico',
      },
      {
        from: 'build/excalidraw.ico',
        to: 'excalidraw.ico',
      },
    ],
  },
  // Unlike win (which cross-compiles the sidecar to an explicit target
  // triple), linux takes it from cargo's host-native target/release/ — the
  // same source mac uses. So no `arch` is pinned here: electron-builder
  // defaults to the build host's architecture, which is the only one the
  // sidecar was actually built for. Packaging arm64 on an x64 host, or the
  // reverse, needs a matching `cargo build --target` first.
  linux: {
    // AppImage (self-contained, any distro) + deb (apt install, pulls in the
    // GTK/NSS runtime deps) + rpm (dnf/zypper install on Fedora / RHEL /
    // openSUSE). Default artifact names are kept on purpose —
    // GenOffice-<v>.AppImage / genoffice_<v>_amd64.deb — because the public
    // README download links and the already-published linux-v0.5.149 release
    // use them.
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
    // deb control metadata; values match the manually published 0.5.149 deb
    // so apt sees the new packages as the same lineage. Homepage comes from
    // package.json "homepage"; the Package field is pinned in the deb block
    // below (packageName is a per-target option, rejected here by the schema).
    maintainer: MAINTAINER,
    vendor: MAINTAINER,
    category: 'Office',
    fileAssociations: FILE_ASSOCIATIONS,
    // Icon SET directory, not the single 1024px png: electron-builder does
    // not resize a lone png, so deb/rpm would install only
    // hicolor/1024x1024/apps/ieumoffice.png — a size absent from the hicolor
    // theme index, leaving GNOME/KDE launchers on the generic fallback icon
    // (upstream issue #90). The set ships every standard raster size.
    icon: 'build/icons',
    // mac and win name the binary from productName; linux instead derives it
    // from package.json "name", and "@genoffice/shell" sanitizes to the
    // invalid "@genofficeshell". Setting it explicitly also makes the
    // generated ieumoffice.desktop match the WM_CLASS Electron reports (it
    // takes that from the executable basename), so the running window links
    // back to its launcher entry.
    executableName: PACKAGED_APP_NAME,
    // Electron takes its X11 app_id from package.json "desktopName"
    // (ieumoffice.desktop); syncDesktopName makes electron-builder name the
    // .desktop file and its StartupWMClass from the same value. Without it
    // StartupWMClass falls back to productName ("IeumOffice"), which does not
    // match the "ieumoffice" WM_CLASS the window actually reports — and X11
    // compares case-sensitively, so the taskbar shows an unlinked window.
    syncDesktopName: true,
    extraResources: [
      {
        from: '../sheets/native/xlsx-engine/target/release/xlsx-sidecar',
        to: 'native/xlsx-sidecar',
      },
    ],
  },
  // Same "@genoffice/shell" problem as executableName above: the default deb
  // artifact name derives from package.json "name", and the scope's "/" makes
  // fpm treat "@genoffice" as a directory. Spell the published name out
  // (ieumoffice_<version>_amd64.deb) and pin the control Package field so apt
  // treats successive releases as upgrades of the same package and never
  // collides with an upstream genoffice deb install.
  deb: {
    artifactName: 'ieumoffice_${version}_${arch}.deb',
    packageName: PACKAGED_APP_NAME,
    // Ubuntu 24.04 (and Debian 13) rebuilt part of the X/GTK stack for 64-bit
    // time_t and renamed those packages with a "t64" suffix: where the old
    // name is gone, apt refuses the deb with "<name> ... is not installable"
    // (gtk3 and atspi resolve today only because the t64 package happens to
    // declare a versioned Provides). "a | b" satisfies on whichever name the
    // distribution carries — the plain name on 22.04 and older, the t64 name
    // on 24.04 and newer. Alternatives are written even for names today's
    // archive still carries plainly: which pages remain is exactly what keeps
    // changing. Setting `depends` replaces electron-builder's default list
    // wholesale (FpmTarget passes it to fpm's -d verbatim, no merge), so every
    // default entry this product wants is spelled out here.
    depends: [
      'libgtk-3-0 | libgtk-3-0t64',
      'libnotify4 | libnotify4t64',
      'libnss3',
      'libxss1',
      'libxtst6 | libxtst6t64',
      'xdg-utils',
      'libatspi2.0-0 | libatspi2.0-0t64',
      'libuuid1',
      'libsecret-1-0 | libsecret-1-0t64',
    ],
    // expose the ieumoffice command line shipped inside the app
    afterInstall: 'build/linux-after-install.sh',
    afterRemove: 'build/linux-after-remove.sh',
  },
  // Same "@genoffice/shell" naming problem as deb: spell the artifact name
  // out (${arch} expands to the rpm arch string, x86_64) and pin the rpm
  // Package name so dnf/zypper treat successive releases as upgrades of the
  // same package. Like deb, rpm installs run no in-app updater — users
  // upgrade with `dnf install ./<new>.rpm`. Packaging needs rpmbuild on the
  // build host (the `rpm` apt package on Ubuntu; CI installs it).
  //
  // publish: null (explicit) keeps the rpm out of the electron-updater feed:
  // the rpm is a GitHub-Release download only, so latest-linux.yml lists
  // AppImage + deb.
  rpm: {
    artifactName: 'ieumoffice-${version}.${arch}.rpm',
    packageName: PACKAGED_APP_NAME,
    publish: null,
    afterInstall: 'build/linux-after-install.sh',
    afterRemove: 'build/linux-after-remove.sh',
    // rpmbuild links every packaged ELF file into /usr/lib/.build-id/<hash>.
    // Two Electron apps built on the same Electron release ship identical
    // binaries, so the links are identical too and dnf refuses the install
    // with a file conflict against the other app (genoffice#1145). The links exist only
    // to locate detached debuginfo, which this package does not ship, so turn
    // them off. rpm-level `fpm` (not linux-level) keeps it away from the deb.
    fpm: ['--rpm-rpmbuild-define=_build_id_links none'],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // no spaces: GitHub Releases rewrites them in asset names, and the update
    // feed must name the file exactly as it is downloaded
    artifactName: winArm64
      ? '${productName}-Setup-${version}-arm64.${ext}'
      : '${productName}-Setup-${version}.${ext}',
  },
  beforePack: async (context) => {
    ensurePlatformHelpers()
    assertExtraResourceSources()
    ensureThirdPartyNotices()
    assertModuleTreesPresent()
    assertPdfStructureProcessBuilt()
    ensureCliBundleCarriesAppVersion()
    if (context.electronPlatformName === 'darwin' && includeMacX64) {
      assertUniversalSidecar()
      assertUniversalVisionOcr()
    }
    if (context.electronPlatformName === 'win32' && !existsSync(join(__dirname, WIN_SIDECAR))) {
      throw new Error(
        `win extraResources source missing: ${WIN_SIDECAR} (cargo build --target ${winSidecarTarget} first)`,
      )
    }
  },
  dmg: {
    sign: true,
  },
  afterAllArtifactBuild: 'build/notarize-dmg.js',
}

// Windows in-package code signing. Security features that judge every PE
// individually (Smart App Control, WDAC/AppLocker, AV heuristics) block
// unsigned child processes — the unsigned xlsx-sidecar.exe died with
// "spawn UNKNOWN" on such machines even though the installer itself was
// signed. When CI exports GENOFFICE_WIN_SIGN_MODE ("test" = alpha
// self-signed PFX, "production" = DigiCert KeyLocker — the two modes of
// scripts/win-sign.cjs, whose env-var contract applies here too), every
// binary electron-builder signs for win (GenOffice.exe, the NSIS
// uninstaller, and the installer) goes through that script. The static
// extraResources binaries (xlsx-sidecar.exe, win-ocr.exe) are signed by the
// workflow before packaging since electron-builder does not sign
// extraResources. Unset (local / fork builds) keeps the old behavior:
// electron-builder has no signing config and packages everything unsigned.
const winSignMode = process.env.GENOFFICE_WIN_SIGN_MODE
if (winSignMode) {
  if (winSignMode !== 'test' && winSignMode !== 'production') {
    throw new Error(`GENOFFICE_WIN_SIGN_MODE must be "test" or "production", got "${winSignMode}"`)
  }
  config.win.signtoolOptions = {
    // Single pass per file: the sha1+sha256 dual-signing default is a
    // pre-Win8 relic and would invoke the hook twice per binary.
    signingHashAlgorithms: ['sha256'],
    sign: (configuration) => {
      execFileSync(
        process.execPath,
        [join(__dirname, '../../scripts/win-sign.cjs'), winSignMode, configuration.path],
        { stdio: 'inherit' },
      )
      return Promise.resolve()
    },
  }
}

// This product's macOS builds carry no Apple Developer ID (docs/tracking/
// decisions/0031-unsigned-mac-beta.md): the app is signed ad hoc, which
// Apple Silicon needs before it runs a binary at all, and nothing is
// notarized. Hardened runtime is off because, signed ad hoc, its library
// validation rejects the Electron frameworks. First launch therefore needs
// the user's explicit "Open Anyway", and Squirrel.Mac cannot install updates
// into such an app (src/main/updater.ts points a Mac install at the release
// page instead).
config.mac.identity = '-'
config.mac.hardenedRuntime = false
config.mac.notarize = false
config.dmg.sign = false

// Auto-update feed: the releases of the public repository. Always configured,
// so every installer carries an app-update.yml and can update itself — the
// repository is public, which is why no token or feed URL has to be injected.
// This only names the feed. Whether a build also uploads is the --publish
// flag's business: pass `--publish never` to package without creating a
// release (electron-builder would otherwise try to on a tagged CI build).
config.publish = [
  {
    provider: 'github',
    owner: REPO_OWNER,
    repo: REPO_NAME,
  },
]

// CI's "-c.extraMetadata.version=..." CLI override deep-merges with this block,
// so the version and the packaged name survive together.
config.extraMetadata = { name: PACKAGED_APP_NAME }

module.exports = config
