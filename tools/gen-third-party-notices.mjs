/**
 * Aggregates licenses of third-party components shipped with the installer
 * into apps/shell/build/THIRD-PARTY-NOTICES.txt.
 *
 * The shipped set is derived from what the source actually imports, then closed
 * over the dependency graph — not from `dependencies` vs `devDependencies`,
 * which in this repo says nothing about what ships: electron-vite bundles the
 * renderer/main graph into out/ and no node_modules directory is packaged, so
 * several genuinely-bundled libraries are declared as devDependencies.
 *
 * The Chromium part is too large (18MB); electron-builder extraResources ships
 * LICENSES.chromium.html separately, referenced from the body text. The repo's
 * own LICENSE (Apache-2.0) ships beside it as LICENSE.txt; the NOTICE that
 * license requires to travel with the work opens the generated file.
 *
 * The two Rust sections need cargo, and the rhwp one a sparse checkout of the
 * rhwp tag (manifests only, cached under node_modules/.cache). Without them a
 * local build degrades to a pointer; with CI or IEUM_RELEASE set the gap is an
 * error, and electron-builder's beforePack rejects a notice that has it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { builtinModules, createRequire } from 'node:module'
import { licenseText } from './license-text.mjs'

const require = createRequire(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILTIN = new Set(builtinModules)

const envFlag = (name) => !['', '0', 'false'].includes((process.env[name] ?? '').toLowerCase())
/**
 * A notice with a missing section must not reach an installer: on CI and in a
 * release build (IEUM_RELEASE=1, which electron-builder's beforePack sets when
 * it has to regenerate) every gap throws instead of degrading.
 */
const STRICT = envFlag('CI') || envFlag('IEUM_RELEASE')

function gap(message) {
  if (STRICT) throw new Error(`third-party notice incomplete: ${message}`)
  console.warn(`warning: ${message}; the notice is incomplete (fine for a dev build only)`)
}

/** the product name, defined once in packages/i18n/src/product.ts (read as text: no TS loader here) */
function productName() {
  const source = readFileSync(join(ROOT, 'packages/i18n/src/product.ts'), 'utf8')
  const name = /^export const PRODUCT_NAME = '([^']+)'$/m.exec(source)?.[1]
  if (!name) throw new Error('PRODUCT_NAME not found in packages/i18n/src/product.ts')
  return name
}
const PRODUCT_NAME = productName()
/** electron-builder.cjs checks for this line before it packages the notice */
const HEADER = `${PRODUCT_NAME} — Third-Party Software Notices`

/**
 * Source trees whose imports end up in a shipped bundle. Deliberately only
 * `src/` — vite configs and scripts pull in the whole build toolchain, which
 * is not distributed.
 */
const SRC_GLOBS = [
  'apps/docs/src',
  'apps/excalidraw/src',
  'apps/html/src',
  'apps/mindmap/src',
  'apps/hwp/src',
  'apps/markdown/src',
  'apps/pdf/src',
  'apps/sheets/src',
  'apps/shell/src',
  'apps/slides/src',
  ...readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `packages/${e.name}/src`),
]
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const SKIP_DIR = /^(node_modules|out|dist|release|tests|__tests__|target)$/

/**
 * Runtime that is always present but never imported by specifier. The three
 * after electron are bundled into the rhwp-studio build the HWP editor hosts
 * (apps/hwp/scripts/build-studio.mjs); the studio's own source is the same
 * MIT-licensed repository as @rhwp/core, and that build also ships rhwp's
 * LICENSE and THIRD_PARTY_LICENSES files beside itself.
 */
const IMPLICIT = ['electron', '@rhwp/core', 'canvaskit-wasm', '@noble/hashes']

/**
 * Packages copied into the installer verbatim by electron-builder rather than
 * bundled — spawned, never imported, so they are invisible to the import scan.
 */
function extraResourceSeeds() {
  // the electron-builder config lives in its own cjs module (not package.json
  // "build") so the publish URL can be injected from the environment
  const build = require(join(ROOT, 'apps/shell/electron-builder.cjs'))
  const entries = [build.extraResources, build.mac?.extraResources, build.win?.extraResources]
  const names = []
  for (const e of entries.flat()) {
    const m = e?.from && /node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(e.from)
    if (m) names.push(m[1])
  }
  return names
}

/** license text is not published to npm; supply the notice by hand */
const NOTE = {
  '@excalidraw/excalidraw':
    'Copyright (c) 2020 Excalidraw. Licensed under the MIT License.\nhttps://github.com/excalidraw/excalidraw\nBundled fonts: Virgil, Excalifont, Xiaolai, Nunito, Lilita One, Liberation Sans, Cascadia Code and Assistant under the SIL Open Font License 1.1; Comic Shanns under the MIT License.',
  '@radix-ui/react-tabs':
    'Copyright (c) 2022 WorkOS. Licensed under the MIT License.\nhttps://github.com/radix-ui/primitives',
  '@fluentui/react-icons':
    'Copyright (c) Microsoft Corporation. Licensed under the MIT License.\nhttps://github.com/microsoft/fluentui-system-icons',
  '@neslinesli93/qpdf-wasm':
    'qpdf: Copyright (c) 2005-2021 Jay Berkenbilt; Copyright (c) 2022-2025 Jay Berkenbilt and Manfred Holger. Licensed under the Apache License, Version 2.0.\nhttps://github.com/qpdf/qpdf\nWebAssembly build and wrapper: ISC License.\nhttps://github.com/neslinesli93/qpdf-wasm',
  '@rhwp/editor':
    'Copyright (c) 2025-2026 Edward Kim. Licensed under the MIT License.\nhttps://github.com/edwardkim/rhwp',
}

/** SPDX strings that need a word on which side of a dual license we take */
const SPDX_NOTE = {
  dompurify: 'Apache-2.0 (dual MPL-2.0/Apache-2.0, used under Apache-2.0)',
  jszip: 'MIT (dual MIT/GPL-3.0-or-later, used under MIT)',
  'r-efi': 'MIT (tri-licensed MIT/Apache-2.0/LGPL-2.1-or-later, used under MIT)',
}

const MIT_PERMISSION = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`

const ZLIB_LICENSE = `This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.`

const ZLIB_NOTICE = `zlib — zlib License
Copyright (C) Jean-loup Gailly and Mark Adler

${ZLIB_LICENSE}`

const LIBPNG_NOTICE = `libpng 1.6.43 — PNG Reference Library License version 2
Copyright (c) 1995-2024 The PNG Reference Library Authors.
Copyright (c) 2018-2024 Cosmin Truta.
Copyright (c) 2000-2002, 2004, 2006-2018 Glenn Randers-Pehrson.
Copyright (c) 1996-1997 Andreas Dilger.
Copyright (c) 1995-1996 Guy Eric Schalnat, Group 42, Inc.

The software is supplied "as is", without warranty of any kind, express or
implied, including, without limitation, the warranties of merchantability,
fitness for a particular purpose, title, and non-infringement. In no event
shall the Copyright owners, or anyone distributing the software, be liable
for any damages or other liability, whether in contract, tort or otherwise,
arising from, out of, or in connection with the software, or the use or
other dealings in the software, even if advised of the possibility of such
damage.

Permission is hereby granted to use, copy, modify, and distribute this
software, or portions hereof, for any purpose, without fee, subject to the
following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software in
   a product, an acknowledgment in the product documentation would be
   appreciated, but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This Copyright notice may not be removed or altered from any source or
   altered source distribution.`

const LIBJPEG_TURBO_NOTICE = `libjpeg-turbo — IJG License, Modified (3-clause) BSD License and zlib License
Copyright (C) 1991-2021 The libjpeg-turbo Project and many others

This software is based in part on the work of the Independent JPEG Group.

Copyright (C)2009-2021 D. R. Commander. All Rights Reserved.
Copyright (C)2015 Viktor Szathmáry. All Rights Reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
- Neither the name of the libjpeg-turbo Project nor the names of its
  contributors may be used to endorse or promote products derived from this
  software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS",
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

The SIMD extensions are covered by the zlib License:

${ZLIB_LICENSE}`

/** the OpenJPEG BSD-2-Clause text with its copyright holders, as pdfjs-dist ships it */
const openJpegNotice = () =>
  `OpenJPEG — BSD-2-Clause\n${readFileSync(join(pkgDir('pdfjs-dist'), 'wasm/LICENSE_OPENJPEG'), 'utf8').trim()}`

/**
 * C libraries compiled into a shipped WebAssembly binary, which the package's
 * own license file does not cover. Each entry was confirmed against strings
 * in the binary (FREETYPE_PROPERTIES, opj_*, "libpng" and its version, the
 * lcms2 VCGT messages and zlib's messages in pdfium.wasm; the libjpeg-turbo
 * copyright and the IJG/zlib messages in qpdf.wasm). pdfium.wasm carries no
 * IJG libjpeg message table, so no libjpeg entry is listed for it. Added after
 * the package's own text.
 */
const EMBEDDED = {
  '@embedpdf/pdfium': () =>
    [
      'Libraries compiled into dist/pdfium.wasm (shipped as resources/wasm/pdfium.wasm):',
      'FreeType — FreeType License (FTL)\n' +
        'Portions of this software are copyright © The FreeType Project\n' +
        '(www.freetype.org). All rights reserved.\n' +
        'https://freetype.org/license.html',
      openJpegNotice(),
      LIBPNG_NOTICE,
      ZLIB_NOTICE,
      `Little CMS (lcms2) — MIT License\nCopyright (c) Marti Maria Saguer\n\n${MIT_PERMISSION}`,
      'Anti-Grain Geometry 2.3 (PDFium third_party/agg23, its default rasterizer)\n' +
        'Copyright (C) 2002-2005 Maxim Shemanarev (http://www.antigrain.com)\n' +
        'Permission to copy, use, modify, sell and distribute this software is\n' +
        'granted provided this copyright notice appears in all copies. This\n' +
        'software is provided "as is" without express or implied warranty, and\n' +
        'with no claim as to its suitability for any purpose.',
    ].join('\n\n'),
  '@neslinesli93/qpdf-wasm': () =>
    [
      'Libraries compiled into dist/qpdf.wasm (shipped as resources/wasm/qpdf.wasm):',
      LIBJPEG_TURBO_NOTICE,
      ZLIB_NOTICE,
    ].join('\n\n'),
  // apps/pdf copies wasm/ and standard_fonts/ verbatim into its renderer output
  'pdfjs-dist': () => {
    const dir = pkgDir('pdfjs-dist')
    const files = ['wasm', 'standard_fonts'].flatMap((sub) =>
      readdirSync(join(dir, sub))
        .filter((f) => f.startsWith('LICENSE'))
        .sort()
        .map((f) => `${sub}/${f}`),
    )
    return [
      'The WebAssembly decoders in wasm/ (jbig2, openjpeg, qcms, quickjs-eval) and the',
      'fonts in standard_fonts/ ship with the PDF editor. Their license files follow.',
      ...files.map((f) => `\n[${f}]\n${readFileSync(join(dir, f), 'utf8').trim()}`),
      '\n[wasm/quickjs-eval.wasm] QuickJS — MIT License',
      `Copyright (c) Fabrice Bellard\nCopyright (c) Charlie Gordon\n\n${MIT_PERMISSION}`,
    ].join('\n')
  },
}

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(e.name)) walk(join(dir, e.name), out)
    } else if (CODE_EXT.test(e.name)) out.push(join(dir, e.name))
  }
  return out
}

// the lookbehind keeps Array.from('x') / obj.import out of the results
const SPECIFIER = /(?<![.\w])(?:from|import|require)\s*\(?\s*['"]([^'"\n]+)['"]/g

const IN_NODE_MODULES = /node_modules\/((?:@[^/]+\/)?[^/?]+)/

/** 'foo/bar' -> 'foo'; '@a/b/c' -> '@a/b'; relative/builtin/workspace -> null */
function bareName(spec) {
  if (!spec || spec.startsWith('node:')) return null
  // a few deep imports reach into node_modules by relative path (harfbuzzjs wasm)
  const viaPath = IN_NODE_MODULES.exec(spec)
  if (viaPath) return viaPath[1]
  if (spec.startsWith('.') || spec.startsWith('/')) return null
  const parts = spec.split('/')
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  if (BUILTIN.has(name) || name.startsWith('@genoffice/')) return null
  // the specifier regex also fires on prose inside string concatenations
  return NPM_NAME.test(name) ? name : null
}

const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

function importedNames() {
  const names = new Set([...IMPLICIT, ...extraResourceSeeds()])
  for (const g of SRC_GLOBS) {
    for (const file of walk(join(ROOT, g))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(SPECIFIER)) {
        const n = bareName(m[1])
        if (n) names.add(n)
      }
    }
  }
  return names
}

const WORKSPACE_MODULES = SRC_GLOBS.map((g) => join(ROOT, g.replace(/\/src$/, ''), 'node_modules'))

/** installed package names, unscoped first so existing resolutions keep winning */
function topLevelPackages() {
  const dirs = (at) => readdirSync(at, { withFileTypes: true }).filter((e) => e.isDirectory())
  const top = dirs(join(ROOT, 'node_modules')).map((e) => e.name)
  const scoped = top.filter((n) => n.startsWith('@'))
  return [
    ...top.filter((n) => !n.startsWith('@')),
    ...scoped.flatMap((s) => dirs(join(ROOT, 'node_modules', s)).map((e) => `${s}/${e.name}`)),
  ]
}

/** npm hoists, so the root copy is the usual answer; fall back to a nested one */
function pkgDir(name) {
  const root = join(ROOT, 'node_modules', name)
  if (existsSync(join(root, 'package.json'))) return root
  for (const owner of topLevelPackages()) {
    const nested = join(ROOT, 'node_modules', owner, 'node_modules', name)
    if (existsSync(join(nested, 'package.json'))) return nested
  }
  for (const modules of WORKSPACE_MODULES) {
    const own = join(modules, name)
    if (existsSync(join(own, 'package.json'))) return own
  }
  return null
}

const manifest = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))

/** transitive closure over runtime deps (build-only devDependencies of a dep never ship) */
function closure(seed) {
  const seen = new Map()
  const queue = [...seed].map((name) => ({ name, optional: false }))
  const missing = new Set()
  while (queue.length > 0) {
    const { name, optional } = queue.shift()
    if (seen.has(name)) continue
    const dir = pkgDir(name)
    if (dir === null) {
      // an uninstalled optional dep is a platform variant for another host, not a gap
      if (!optional) missing.add(name)
      seen.set(name, null)
      continue
    }
    const pkg = manifest(dir)
    seen.set(name, { dir, pkg })
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (!seen.has(dep)) queue.push({ name: dep, optional: false })
    }
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
      if (!seen.has(dep)) queue.push({ name: dep, optional: true })
    }
  }
  return { resolved: [...seen].filter(([, v]) => v !== null), missing }
}

function noticeText(dir) {
  for (const f of ['NOTICE', 'NOTICE.txt', 'NOTICE.md']) {
    if (existsSync(join(dir, f))) return readFileSync(join(dir, f), 'utf8').trim()
  }
  return null
}

function spdxOf(name, pkg) {
  if (SPDX_NOTE[name]) return SPDX_NOTE[name]
  const raw = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
  if (raw) return raw
  // some packages ship the file but omit the field (e.g. @univerjs/telemetry)
  return 'see license text below'
}

function repoOf(pkg) {
  const r = pkg.repository
  const url = typeof r === 'string' ? r : r?.url
  return url ? url.replace(/^git\+/, '').replace(/\.git$/, '') : null
}

/** cargo metadata as JSON, or null when cargo (or the network it may need) is unavailable */
function cargoMetadata(manifest, args = []) {
  try {
    const raw = execFileSync(
      'cargo',
      ['metadata', '--format-version', '1', ...args, '--manifest-path', manifest],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const crateRow = (p) => ({
  name: p.name,
  version: p.version,
  spdx: SPDX_NOTE[p.name] ?? p.license ?? 'see repository',
  url: p.repository ?? `https://crates.io/crates/${p.name}`,
  dir: p.manifest_path ? dirname(p.manifest_path) : null,
})

/** Rust crates statically linked into xlsx-sidecar */
function rustCrates() {
  const meta = cargoMetadata(join(ROOT, 'apps/sheets/native/xlsx-engine/Cargo.toml'))
  if (meta === null) return null
  return meta.packages
    .filter((p) => p.name !== 'xlsx-sidecar')
    .map(crateRow)
    .sort((a, b) => a.name.localeCompare(b.name))
}

const RHWP = JSON.parse(readFileSync(join(ROOT, 'vendor/rhwp-core/package.json'), 'utf8'))
const RHWP_REPO = RHWP.repository.url.replace(/^git\+/, '')
const RHWP_URL = RHWP_REPO.replace(/\.git$/, '')
const RHWP_TARGET = 'wasm32-unknown-unknown'

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/**
 * A checkout of the rhwp tag vendor/rhwp-core was built from, holding what
 * cargo metadata reads: the lockfile, every manifest and the crate roots it
 * checks for. The full checkout tools/build-rhwp-core.mjs leaves behind does
 * as well; otherwise a sparse one is fetched once (a few dozen files; the
 * whole repository is several GB of sample documents).
 */
function rhwpSourceTree() {
  const { tag, commit } = RHWP.rhwp
  const atCommit = (dir) => {
    try {
      return existsSync(join(dir, 'Cargo.toml')) && git(['rev-parse', 'HEAD'], dir) === commit
    } catch {
      return false
    }
  }
  const built = join(ROOT, 'node_modules/.cache/rhwp-core', tag)
  if (atCommit(built)) return built
  const sparse = join(ROOT, 'node_modules/.cache/rhwp-core-manifests', tag)
  if (atCommit(sparse)) return sparse
  try {
    rmSync(sparse, { recursive: true, force: true })
    mkdirSync(dirname(sparse), { recursive: true })
    git(
      ['clone', '--quiet', '--filter=blob:none', '--no-checkout', '--depth', '1'].concat([
        '--branch',
        tag,
        RHWP_REPO,
        sparse,
      ]),
      dirname(sparse),
    )
    git(
      ['sparse-checkout', 'set', '--no-cone', '/Cargo.lock', '**/Cargo.toml'].concat([
        '**/src/lib.rs',
        '**/src/main.rs',
      ]),
      sparse,
    )
    git(['checkout', '--quiet', tag], sparse)
  } catch {
    return null
  }
  return atCommit(sparse) ? sparse : null
}

/**
 * Rust crates compiled into rhwp_bg.wasm (resources/wasm and the HWP editor):
 * the normal dependencies of the rhwp library for the wasm32 target with its
 * default features, i.e. what `wasm-pack build` links. Proc macros run in the
 * compiler and link nothing, so neither they nor their dependencies count.
 */
function rhwpCrates() {
  const tree = rhwpSourceTree()
  if (tree === null) return null
  const meta = cargoMetadata(join(tree, 'Cargo.toml'), [
    '--locked',
    '--filter-platform',
    RHWP_TARGET,
  ])
  if (meta === null) return null
  const byId = new Map(meta.packages.map((p) => [p.id, p]))
  const depsOf = new Map(meta.resolve.nodes.map((n) => [n.id, n.deps]))
  const root = meta.packages.find((p) => p.name === 'rhwp' && p.source === null)
  if (!root) return null
  const isProcMacro = (p) => p.targets.some((t) => t.kind.includes('proc-macro'))
  const seen = new Set([root.id])
  const queue = [root.id]
  while (queue.length > 0) {
    for (const dep of depsOf.get(queue.shift()) ?? []) {
      if (seen.has(dep.pkg) || !dep.dep_kinds.some((k) => k.kind === null)) continue
      if (isProcMacro(byId.get(dep.pkg))) continue
      seen.add(dep.pkg)
      queue.push(dep.pkg)
    }
  }
  seen.delete(root.id)
  return [...seen]
    .map((id) => crateRow(byId.get(id)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

/** the crate list and each distinct license text; the count line is what electron-builder checks */
function crateSection(crates) {
  let text = `\n${crates.length} crates, all under permissive terms:\n\n`
  for (const c of crates) text += `  ${c.name} ${c.version}  —  ${c.spdx}\n    ${c.url}\n`
  const texts = new Map()
  for (const c of crates) {
    if (!c.dir || !existsSync(c.dir)) continue
    const license = licenseText(c.name, c.dir)
    if (license && !texts.has(license)) texts.set(license, c.name)
  }
  text += sub('Crate license texts (deduplicated)')
  for (const [license, first] of texts) text += `\n[first seen in ${first}]\n${license}\n`
  return text
}

const hr = (title) => `\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}\n`
const sub = (title) => `\n${'-'.repeat(72)}\n${title}\n${'-'.repeat(72)}\n`

const seed = importedNames()
const { resolved, missing } = closure(seed)
resolved.sort(([a], [b]) => a.localeCompare(b))

// Apache-2.0 §4(d): the NOTICE of the work travels with every copy; LICENSE.txt is §4(a)
const NOTICE = readFileSync(join(ROOT, 'NOTICE'), 'utf8').trim()

let out = `${NOTICE}

The Apache License, Version 2.0, under which the work above is distributed,
is reproduced in LICENSE.txt next to this file.
`

out += hr(HEADER)
out += `
This application includes third-party software components under the licenses
reproduced below.

Chromium (bundled via Electron) is licensed under BSD-style and other
licenses — see LICENSES.chromium.html next to this file.
`

out += hr(`1. npm packages (${resolved.length})`)
const noText = []
for (const [name, { dir, pkg }] of resolved) {
  out += sub(`${name} v${pkg.version} — ${spdxOf(name, pkg)}`)
  const text = licenseText(name, dir) ?? NOTE[name]
  if (text) {
    out += text + '\n'
  } else {
    noText.push(name)
    const repo = repoOf(pkg)
    out += `Licensed under ${spdxOf(name, pkg)}.${repo ? `\n${repo}` : ''}\n`
  }
  const notice = noticeText(dir)
  if (notice) out += `\nNOTICE:\n${notice}\n`
  if (EMBEDDED[name]) out += `\n${EMBEDDED[name]()}\n`
}

const crates = rustCrates()
out += hr(`2. Rust crates (xlsx-sidecar native component, statically linked)`)
if (crates === null) {
  gap('cargo metadata failed for apps/sheets/native/xlsx-engine (is cargo on PATH?)')
  out += '\ncargo metadata unavailable at generation time; see'
  out += ' apps/sheets/native/xlsx-engine/Cargo.lock for the full crate list.\n'
} else {
  out += crateSection(crates)
}

const wasmCrates = rhwpCrates()
out += hr('3. Rust crates (rhwp HWP engine, compiled into rhwp_bg.wasm)')
out += `
rhwp ${RHWP.rhwp.tag} (${RHWP_URL}, MIT License, listed above as @rhwp/core)
is built for ${RHWP_TARGET} with the patches in vendor/rhwp-core; the
WebAssembly binary ships as resources/wasm/rhwp_bg.wasm and inside the HWP editor.
`
if (wasmCrates === null) {
  gap(`could not list the crates of rhwp ${RHWP.rhwp.tag} (needs git, network once, and cargo)`)
  out += `\ncrate list unavailable at generation time; see Cargo.lock of ${RHWP_URL}`
  out += ` at ${RHWP.rhwp.tag}.\n`
} else {
  out += crateSection(wasmCrates)
}

const GOTHIC_KR_COPYRIGHT = [
  'Copyright (c) 2010, NHN Corporation (http://www.nhncorp.com),',
  'with Reserved Font Name Nanum, Naver Nanum, NanumGothic, Naver ',
  'NanumGothic, NanumMyeongjo, Naver NanumMyeongjo, NanumBrush, Naver',
  'NanumBrush, NanumPen, Naver NanumPen.',
].join('\n')

/**
 * Bundled web/document fonts. KaTeX code remains separately covered by its
 * npm-package MIT notice above; its webfonts carry OFL terms.
 */
const FONTS = [
  [
    'Liberation Sans / Serif / Mono 2.1.5',
    'SIL OFL 1.1',
    'Digitized data © 2010 Google Corporation with Reserved Font Names Arimo, Tinos and Cousine.\n© 2012 Red Hat, Inc. with Reserved Font Name Liberation.',
  ],
  [
    'Carlito',
    'SIL OFL 1.1',
    '© 2010-2013 tyPoland Lukasz Dziedzic with Reserved Font Name "Carlito".',
  ],
  [
    'Caladea',
    'Apache-2.0',
    '© Huerta Tipográfica. Licensed under the Apache License, Version 2.0.',
  ],
  [
    'Noto Sans CJK SC / Noto Serif CJK SC (subset)',
    'SIL OFL 1.1',
    '© Adobe / Google. This bundle ships a subset of the original fonts (reduced glyph coverage for size);\nno other modifications were made.',
  ],
  [
    'GenOffice UI Kana JP (Noto Sans JP derivative)',
    'SIL OFL 1.1',
    'Source: Noto Sans JP from https://github.com/notofonts/noto-cjk. Copyright 2014-2021 Adobe\n(http://www.adobe.com/), with Reserved Font Name "Source". This bundle ships Regular and Bold\ninstances subset to U+3000-30FF, with modified advances and horizontally condensed outlines to\nmatch Meiryo UI metrics and vertical metrics set to the Hiragino class. Renamed to GenOffice UI\nKana JP per OFL 1.1; the upstream Reserved Font Name is not used.',
  ],
  [
    'GenOffice Sans KR (Noto Sans CJK KR derivative)',
    'SIL OFL 1.1',
    'Copyright 2014-2021 Adobe (http://www.adobe.com/), Google LLC, Reserved Font Name "Source".\nSubset with modified advance widths and horizontally transformed Noto CJK outlines to match measured\nKorean Office-family metrics; renamed per OFL 1.1. No Microsoft font outlines are included.',
  ],
  [
    'GenOffice Serif KR (Noto Serif CJK KR derivative)',
    'SIL OFL 1.1',
    'Copyright 2017-2024 Adobe (http://www.adobe.com/), Reserved Font Name "Source".\nSubset with modified advance widths and horizontally transformed Noto CJK outlines to match measured\nKorean Office-family metrics; renamed per OFL 1.1. No Microsoft font outlines are included.',
  ],
  [
    'GenOffice Che Latin KR (Noto Sans CJK KR derivative)',
    'SIL OFL 1.1',
    'Copyright 2014-2021 Adobe (http://www.adobe.com/), Google LLC, Reserved Font Name "Source".\nASCII subset with fixed 0.5em advances and horizontally transformed Noto CJK outlines; Microsoft\nDotumChe is used only as a metric reference. Renamed per OFL 1.1. No Microsoft outlines are included.',
  ],
  [
    'Noto Naskh Arabic / Noto Sans Arabic (subset)',
    'SIL OFL 1.1',
    '© The Noto Project Authors. This bundle ships a subset of the original fonts;\nglyphs and metrics are unmodified.',
  ],
  [
    'GenOffice Gothic KR (NanumGothic derivative)',
    'SIL OFL 1.1',
    `${GOTHIC_KR_COPYRIGHT}\nSubset with unmodified metrics; renamed per OFL 1.1.`,
  ],
  [
    'GenOffice Poppins (Poppins derivative)',
    'SIL OFL 1.1',
    'Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins).\nLatin subset with unmodified metrics and advances; renamed.',
  ],
  [
    'GenOffice DM Sans (DM Sans derivative)',
    'SIL OFL 1.1',
    'Copyright 2014-2017 Indian Type Foundry (info@indiantypefoundry.com). Copyright 2019 Google LLC.\nLatin subset with unmodified metrics and advances; renamed.',
  ],
  [
    'GenOffice Tamil (Noto Sans Tamil derivative)',
    'SIL OFL 1.1',
    '© The Noto Project Authors, original Reserved Font Name "Noto". Modified advance widths;\nrenamed per OFL 1.1.',
  ],
  [
    'KaTeX webfonts',
    'SIL OFL 1.1',
    'Copyright (c) 2009-2010, Design Science, Inc. (<www.mathjax.org>)\n' +
      'Copyright (c) 2014-2018 Khan Academy (<www.khanacademy.org>),\n' +
      'with Reserved Font Names KaTeX_AMS, KaTeX_Caligraphic, KaTeX_Fraktur, ' +
      'KaTeX_Main, KaTeX_Math, KaTeX_SansSerif, KaTeX_Script, KaTeX_Size1, ' +
      'KaTeX_Size2, KaTeX_Size3, KaTeX_Size4, and KaTeX_Typewriter.',
  ],
]

/**
 * The slide design templates' fonts (packages/ui/template-fonts, shipped
 * unmodified as resources/template-fonts): each family's own license file is
 * reproduced, preceded by the copyright the font file states where the
 * license file omits it or names an older holder.
 */
const TEMPLATE_FONTS_DIR = join(ROOT, 'packages/ui/template-fonts')
const TEMPLATE_FONTS = [
  ['Pretendard 1.309', 'Pretendard-OFL.txt'],
  ['Noto Serif KR 2.003', 'NotoSerifKR-OFL.txt', '© 2017-2024 Adobe (http://www.adobe.com/).'],
  ['Black Han Sans 1.001', 'BlackHanSans-OFL.txt'],
  ['Do Hyeon 1.001', 'DoHyeon-OFL.txt'],
  ['Gowun Dodum 2.000', 'GowunDodum-OFL.txt'],
  ['Gowun Batang 2.000', 'GowunBatang-OFL.txt'],
  [
    'Bebas Neue 2.000',
    'BebasNeue-OFL.txt',
    'Copyright 2019 The Bebas Neue Project Authors (https://github.com/dharmatype/Bebas-Neue)',
  ],
  ['Space Grotesk 2.000', 'SpaceGrotesk-OFL.txt'],
  ['Playfair Display 1.203', 'PlayfairDisplay-OFL.txt'],
  ['Archivo Black 1.006', 'ArchivoBlack-OFL.txt'],
]

out += hr('4. Bundled fonts')
for (const [name, spdx, copyright] of FONTS) out += sub(`${name} — ${spdx}`) + copyright + '\n'
for (const [name, file, copyright] of TEMPLATE_FONTS) {
  out += sub(`${name} (slide design templates, resources/template-fonts) — SIL OFL 1.1`)
  if (copyright) out += `${copyright}\n\n`
  out += readFileSync(join(TEMPLATE_FONTS_DIR, file), 'utf8').trim() + '\n'
}
out += sub('SIL Open Font License 1.1 — full text')
out +=
  readFileSync(join(ROOT, 'apps/docs/src/renderer/fonts/LICENSE-OFL.txt'), 'utf8').trim() + '\n'

out += hr('5. Unicode Character Database data')
out += `
apps/pdf/src/shared/radicals.ts contains a generated mapping derived from
Unicode Character Database 17.0.0, EquivalentUnifiedIdeograph.txt
(2025-08-01):
https://www.unicode.org/Public/17.0.0/ucd/EquivalentUnifiedIdeograph.txt

`
out += readFileSync(join(ROOT, 'LICENSE-UNICODE.txt'), 'utf8').trim() + '\n'

// Hancom's condition for using its published HWP format document; the wording is fixed
out += hr('6. Hangul (HWP) document format and trademarks')
out += `
The HWP/HWPX editor is built on rhwp (https://github.com/edwardkim/rhwp,
MIT License, listed above as @rhwp/core and @rhwp/editor).

본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여
개발하였습니다.

(This product was developed with reference to Hancom's published document on
the Hangul document file format (.hwp).)

${PRODUCT_NAME} is not affiliated with, sponsored by or endorsed by Microsoft
Corporation, Hancom Inc. or XMind Ltd. "Microsoft", "Windows", "Word", "Excel"
and "PowerPoint" are trademarks of Microsoft Corporation. "한글" (Hangul),
"한컴" (Hancom), "HWP" and "HWPX" are registered trademarks of Hancom Inc.
"XMind" is a trademark of XMind Ltd. They are used only to say which files
${PRODUCT_NAME} opens.
`

for (const term of ['@embedpdf/pdfium', 'Copyright 2014 PDFium Authors', 'Apache License']) {
  if (!out.includes(term)) {
    throw new Error(`generated third-party notice is missing PDFium term: ${term}`)
  }
}

const dest = join(ROOT, 'apps/shell/build/THIRD-PARTY-NOTICES.txt')
mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, out)
console.log(
  `written: ${relative(ROOT, dest)} (${(out.length / 1024).toFixed(0)} KB) — ` +
    `${resolved.length} npm packages, ${crates?.length ?? 0} xlsx-sidecar crates, ` +
    `${wasmCrates?.length ?? 0} rhwp crates`,
)
if (noText.length > 0) console.warn(`no license file published: ${noText.join(', ')}`)
if (missing.size > 0) console.warn(`not installed, skipped: ${[...missing].join(', ')}`)
