#!/usr/bin/env node
// Host-arch release build of xlsx-sidecar, unless the macOS arm64 package
// already compiled the explicit aarch64-apple-darwin target. That package
// reads target/aarch64-apple-darwin/release/xlsx-sidecar, so a second host
// build would only repeat the same compile.

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.GENOFFICE_MAC_ARM64_SIDECAR === '1') {
  console.log('[sheets] skipping host sidecar; darwin-arm64 target is packaged instead')
  process.exit(0)
}

const sheetsDir = join(dirname(fileURLToPath(import.meta.url)), '..')
execFileSync(
  'cargo',
  [
    'build',
    '--release',
    '--manifest-path',
    'native/xlsx-engine/Cargo.toml',
    '--config',
    'native/xlsx-engine/.cargo/config.toml',
  ],
  { cwd: sheetsDir, stdio: 'inherit' },
)
