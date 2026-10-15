#!/usr/bin/env node
// Build the xlsx-sidecar as a macOS universal (fat) binary for the opt-in
// dual-arch package (GENOFFICE_MAC_X64=1): compile both Apple targets and
// lipo-merge them into native/xlsx-engine/target/release/xlsx-sidecar, which
// is the path electron-builder reads only for that package. The default
// arm64 dmg reads target/aarch64-apple-darwin/release/xlsx-sidecar instead.
//
// Dev builds stay on plain `native:build` (host arch only, no extra rustup
// targets required). The default mac package is arm64-only
// (`native:build:darwin-arm64`); this script is the GENOFFICE_MAC_X64 opt-in.
// It needs both targets installed:
//   rustup target add x86_64-apple-darwin aarch64-apple-darwin

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function fatal(msg) {
  console.error(`[sidecar-universal] ERROR: ${msg}`)
  process.exit(1)
}

if (process.platform !== 'darwin') fatal('macOS only (needs lipo)')

// cargo resolves --config relative to the cwd, not --manifest-path (see the
// note in native/xlsx-engine/.cargo/config.toml), so run from apps/sheets
// exactly like the native:build script does.
const sheetsDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['x86_64-apple-darwin', 'aarch64-apple-darwin']

for (const target of TARGETS) {
  console.log(`[sidecar-universal] cargo build --target ${target}`)
  execFileSync(
    'cargo',
    [
      'build',
      '--release',
      '--manifest-path',
      'native/xlsx-engine/Cargo.toml',
      '--config',
      'native/xlsx-engine/.cargo/config.toml',
      '--target',
      target,
    ],
    { cwd: sheetsDir, stdio: 'inherit' },
  )
}

const outDir = join(sheetsDir, 'native/xlsx-engine/target/release')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, 'xlsx-sidecar')
execFileSync(
  'lipo',
  [
    '-create',
    ...TARGETS.map((t) => join(sheetsDir, 'native/xlsx-engine/target', t, 'release/xlsx-sidecar')),
    '-output',
    out,
  ],
  { stdio: 'inherit' },
)

const archs = execFileSync('lipo', ['-archs', out], { encoding: 'utf8' }).trim()
if (!archs.includes('x86_64') || !archs.includes('arm64')) {
  fatal(`merge produced "${archs}" — expected x86_64 + arm64`)
}
console.log(`[sidecar-universal] ${out} (${archs})`)
