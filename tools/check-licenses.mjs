/**
 * Dependency license gate: every production npm dependency must
 * carry a license from the permissive allowlist, so a copyleft dependency
 * cannot slip into a release. Reads license fields from package-lock.json
 * (no install needed); the Rust sidecar equivalent is cargo-deny
 * (apps/sheets/native/xlsx-engine/deny.toml).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAllowed } from './license-allowlist.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Packages whose published package.json lacks a license field; license
 * verified manually against the LICENSE file shipped in the package. */
const EXCEPTIONS = {
  '@univerjs/telemetry': 'Apache-2.0',
  // mermaid dependency; ships an MIT `license` file but no package.json field
  khroma: 'MIT',
}

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))
const violations = []

for (const [path, info] of Object.entries(lock.packages)) {
  const idx = path.lastIndexOf('node_modules/')
  if (idx === -1) continue // workspace roots
  if (info.dev || info.link) continue
  const name = path.slice(idx + 'node_modules/'.length)
  const license = info.license || EXCEPTIONS[name]
  if (!license) {
    violations.push(`${name}: no license field in lockfile (add to EXCEPTIONS after verifying)`)
  } else if (!isAllowed(license)) {
    violations.push(`${name}: ${license}`)
  }
}

if (violations.length > 0) {
  console.error('Disallowed or unknown licenses in production dependencies:\n')
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nAllowlist lives in tools/license-allowlist.mjs.')
  process.exit(1)
}

console.log('All production npm dependency licenses are within the allowlist.')
