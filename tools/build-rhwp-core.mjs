/**
 * Rebuilds vendor/rhwp-core: the rhwp engine (`@rhwp/core`) at the pinned tag
 * with the layout patches in vendor/rhwp-core/patches (decision 0050).
 *
 *   node tools/build-rhwp-core.mjs [--keep]
 *
 * Fetches the tag into node_modules/.cache/rhwp-core (without the multi-GB
 * sample documents), checks the commit, applies the patches in order, builds
 * with `wasm-pack build --target web --release` and copies the package files
 * into vendor/rhwp-core, recording the WASM hash in its package.json.
 *
 * Needs git, rustup (the tag's rust-toolchain.toml selects the toolchain and
 * the wasm32 target) and wasm-pack. The app build itself never runs this.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR = join(ROOT, 'vendor', 'rhwp-core')
const MANIFEST = join(VENDOR, 'package.json')
const REPO = 'https://github.com/edwardkim/rhwp.git'
const PACKAGE_FILES = ['rhwp.js', 'rhwp.d.ts', 'rhwp_bg.wasm', 'rhwp_bg.wasm.d.ts']
const LICENSE_FILES = ['LICENSE', 'THIRD_PARTY_LICENSES.md']

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
// `branch` is set when the engine is pinned to a commit on an upstream branch
// ahead of a release; `tag` then only names that pin (the cache folder).
// `features`, when set, replaces the crate's default features (decision 0107: the PDF
// import upstream builds in by default stays out until upstream releases it).
const { tag, branch, commit, patches, features } = manifest.rhwp
const work = join(ROOT, 'node_modules', '.cache', 'rhwp-core', tag)

function run(command, args, cwd, env = process.env) {
  console.log(`> ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, env, stdio: 'inherit' })
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim()
}

// A fresh checkout every time: patches apply to the pristine tag only.
rmSync(work, { recursive: true, force: true })
mkdirSync(dirname(work), { recursive: true })
// LF checkout so the patches (and rustfmt-formatted sources) apply verbatim on Windows.
run(
  'git',
  [
    '-c',
    'core.autocrlf=false',
    'clone',
    '--filter=blob:none',
    '--no-checkout',
    '--branch',
    branch ?? tag,
    REPO,
    work,
  ],
  dirname(work),
)
git(['config', 'core.autocrlf', 'false'], work)
// mydocs holds upstream's review records, some with paths past the Windows limit
git(['sparse-checkout', 'set', '--no-cone', '/*', '!/samples/', '!/mydocs/'], work)
git(['checkout', '--quiet', branch ? commit : tag], work)
const head = git(['rev-parse', 'HEAD'], work)
if (head !== commit) {
  throw new Error(`rhwp ${tag} resolved to ${head}, expected ${commit}`)
}
for (const patch of patches) {
  run('git', ['apply', '--whitespace=nowarn', join(VENDOR, 'patches', patch)], work)
}

// Local paths would otherwise end up in the WASM (panic locations of the
// registry crates); map them to neutral prefixes as a CI build would have.
const cargoHome = process.env.CARGO_HOME ?? join(homedir(), '.cargo')
const env = {
  ...process.env,
  RUSTFLAGS: [
    process.env.RUSTFLAGS ?? '',
    `--remap-path-prefix=${cargoHome}=/cargo`,
    `--remap-path-prefix=${work}=/rhwp`,
  ]
    .join(' ')
    .trim(),
}
const cargoFeatures = features
  ? ['--', '--no-default-features', '--features', features.join(',')]
  : []
run('wasm-pack', ['build', '--target', 'web', '--release', ...cargoFeatures], work, env)

for (const file of PACKAGE_FILES) copyFileSync(join(work, 'pkg', file), join(VENDOR, file))
for (const file of LICENSE_FILES) copyFileSync(join(work, file), join(VENDOR, file))
const wasm = readFileSync(join(VENDOR, 'rhwp_bg.wasm'))
for (const leak of [homedir(), work]) {
  if (wasm.includes(Buffer.from(leak))) {
    throw new Error(`rhwp_bg.wasm still contains the local path ${leak}`)
  }
}
manifest.rhwp.wasmSha256 = createHash('sha256').update(wasm).digest('hex')
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`vendor/rhwp-core: built ${tag} + ${patches.length} patches (${wasm.length} bytes)`)

if (!process.argv.includes('--keep') && existsSync(work)) {
  rmSync(work, { recursive: true, force: true })
}
