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

// Unsigned by default: this product does not ship a signed installer.
// CSC_IDENTITY_AUTO_DISCOVERY=false forces that even when a certificate is
// present (the internal arm64 workflow). A Developer ID build is opt-in via
// CSC_LINK or CSC_NAME with discovery left on.
const macUnsigned =
  process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false' ||
  (!process.env.CSC_LINK && !process.env.CSC_NAME)

// Arm64-only packages read the explicit Apple target. The universal (opt-in)
// package reads the lipo merge in target/release.
const MAC_ARM64_SIDECAR =
  '../sheets/native/xlsx-engine/target/aarch64-apple-darwin/release/xlsx-sidecar'
const MAC_UNIVERSAL_SIDECAR = '../sheets/native/xlsx-engine/target/release/xlsx-sidecar'
const macSidecar = includeMacX64 ? MAC_UNIVERSAL_SIDECAR : MAC_ARM64_SIDECAR

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
    '../../node_modules/electron/dist/LICENSES.chromium.html',
    '../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
    '../pdf/node_modules/harfbuzzjs/hb-subset.wasm',
    '../../packages/ui/template-fonts/README.md',
    '../../node_modules/@rhwp/core/rhwp_bg.wasm',
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
function assertDarwinArm64Sidecar() {
  const sidecar = join(__dirname, MAC_ARM64_SIDECAR)
  if (!existsSync(sidecar)) {
    throw new Error(
      'mac extraResources source missing: ' +
        `${MAC_ARM64_SIDECAR} (run "npm run native:build:darwin-arm64 -w @genoffice/sheets" first)`,
    )
  }
  if (process.platform !== 'darwin') return
  const archs = execFileSync('lipo', ['-archs', sidecar], { encoding: 'utf8' }).trim().split(/\s+/)
  if (!archs.includes('arm64')) {
    throw new Error(
      `xlsx-sidecar is [${archs.join(', ')}] but the arm64 package needs an arm64 slice — ` +
        'run "npm run native:build:darwin-arm64 -w @genoffice/sheets" before packaging mac',
    )
  }
}

function assertUniversalSidecar() {
  const sidecar = join(__dirname, MAC_UNIVERSAL_SIDECAR)
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

function hasValidThirdPartyNotice() {
  if (!existsSync(NOTICE_PATH)) return false
  try {
    const text = readFileSync(NOTICE_PATH, 'utf8')
    return PDFIUM_NOTICE_TERMS.every((term) => text.includes(term))
  } catch {
    return false
  }
}

function ensureThirdPartyNotices() {
  if (!hasValidThirdPartyNotice()) {
    execFileSync(process.execPath, [join(__dirname, '../../tools/gen-third-party-notices.mjs')], {
      stdio: 'inherit',
    })
  }
  if (!hasValidThirdPartyNotice()) {
    throw new Error('third-party notice missing PDFium redistribution terms')
  }
}

/** @type {import('electron-builder').Configuration} */
// NSIS makes every declared ProgId the extension's default opener; for the
// office types that is the point, for plain text and JSON it would hijack the
// system editor, so Windows leaves those two out (mac/Linux only offer them
// in Open With).
// A mind map file keeps the program the user already opens it with: installing
// must not take .xmind over, so Windows registers nothing for it either. HWP
// and HWPX stay out for the same reason: installing this app must not take the
// documents away from Hancom Office on a PC that has it.
const WIN_OPEN_WITH_ONLY_EXTS = new Set(['txt', 'json', 'xmind', 'hwp', 'hwpx'])
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
    // Two separate arch packages (NOT a universal binary): the default
    // pipeline is arm64-only and names the disk image
    // IeumOffice-<version>-arm64.dmg. x64 (opt-in via GENOFFICE_MAC_X64=1,
    // see includeMacX64 above) adds an Intel package beside it. Both zips
    // land in one latest-mac.yml and electron-updater picks by process.arch.
    // Dual-arch packs ship the same lipo fat xlsx-sidecar (see
    // assertUniversalSidecar above). The arm64-only pack ships the
    // aarch64-apple-darwin sidecar.
    target: [
      { target: 'dmg', arch: includeMacX64 ? ['arm64', 'x64'] : ['arm64'] },
      { target: 'zip', arch: includeMacX64 ? ['arm64', 'x64'] : ['arm64'] },
    ],
    artifactName: '${productName}-${version}-${arch}.${ext}',
    category: 'public.app-category.productivity',
    // Finder, the Dock and the menu bar read these. They stay the product
    // name (IeumOffice), not the workspace package name.
    executableName: PRODUCT_NAME,
    extendInfo: {
      CFBundleDisplayName: PRODUCT_NAME,
      CFBundleName: PRODUCT_NAME,
    },
    // identity null skips Developer ID signing (adhoc is not used). The
    // internal workflow also sets CSC_IDENTITY_AUTO_DISCOVERY=false.
    ...(macUnsigned ? { identity: null } : {}),
    fileAssociations: FILE_ASSOCIATIONS,
    hardenedRuntime: !macUnsigned,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: !macUnsigned,
    extraResources: [
      {
        from: macSidecar,
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
    // hicolor/1024x1024/apps/genoffice.png — a size absent from the hicolor
    // theme index, leaving GNOME/KDE launchers on the generic fallback icon
    // (upstream issue #90). The set ships every standard raster size.
    icon: 'build/icons',
    // mac and win name the binary from productName; linux instead derives it
    // from package.json "name", and "@genoffice/shell" sanitizes to the
    // invalid "@genofficeshell". Setting it explicitly also makes the
    // generated genoffice.desktop match the WM_CLASS Electron reports (it
    // takes that from the executable basename), so the running window links
    // back to its launcher entry.
    executableName: 'genoffice',
    // Electron takes its X11 app_id from package.json "desktopName"
    // (genoffice.desktop); syncDesktopName makes electron-builder name the
    // .desktop file and its StartupWMClass from the same value. Without it
    // StartupWMClass falls back to productName ("GenOffice"), which does not
    // match the "genoffice" WM_CLASS the window actually reports — and X11
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
  // (genoffice_<version>_amd64.deb, matching the linux-v0.5.149 release).
  // packageName pins the control Package field to the same value the 0.5.149
  // deb shipped with — apt treats a different Package name as an unrelated
  // install, breaking upgrades. Without it, fpm receives productName
  // "GenOffice" and only happens to downcase it to the right value.
  deb: {
    artifactName: 'genoffice_${version}_${arch}.deb',
    packageName: 'genoffice',
    // expose the genoffice command line shipped inside the app
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
  // publish: null (explicit) keeps the rpm out of the electron-updater feed
  // and off the CDN entirely: the rpm is a GitHub-Release download only, so
  // latest-linux.yml keeps listing exactly what the CDN pipeline uploads
  // (AppImage + deb) and the promote workflow needs no rpm alias.
  rpm: {
    artifactName: 'genoffice-${version}.${arch}.rpm',
    packageName: 'genoffice',
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
    if (context.electronPlatformName === 'darwin') {
      if (includeMacX64) {
        assertUniversalSidecar()
        assertUniversalVisionOcr()
      } else {
        assertDarwinArm64Sidecar()
      }
    }
    if (context.electronPlatformName === 'win32' && !existsSync(join(__dirname, WIN_SIDECAR))) {
      throw new Error(
        `win extraResources source missing: ${WIN_SIDECAR} (cargo build --target ${winSidecarTarget} first)`,
      )
    }
  },
  dmg: {
    sign: !macUnsigned,
  },
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

// Notarize the dmg only for an opt-in Developer ID build. Unsigned internal
// builds leave the hook unset so a missing Apple credential cannot fail them.
if (!macUnsigned) config.afterAllArtifactBuild = 'build/notarize-dmg.js'

module.exports = config
