/**
 * License gate for the draw.io bundle the diagram editor ships
 * (vendor/drawio). Opens the pinned, hash-verified release (downloading it
 * once into vendor/drawio/.cache), applies the removal list and the approved
 * cut, and fails when
 *   - a file on the removal list would ship,
 *   - a shipped file is not covered by vendor/drawio/inventory.json,
 *   - an inventory component's license is off the allowlist
 *     (tools/license-allowlist.mjs) or picks a branch its dual license does
 *     not offer,
 *   - an inventory or removal pattern no longer matches anything.
 * When apps/diagram/out/drawio exists it must hold exactly the shipped files,
 * byte for byte (release bytes, or the pinned derived file).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DRAWIO_OUT,
  checkInventory,
  listTree,
  loadDrawio,
  loadInventory,
} from '../vendor/drawio/bundle.mjs'
import { isAllowed } from './license-allowlist.mjs'

let drawio
try {
  drawio = await loadDrawio()
} catch (err) {
  console.error(`draw.io bundle: ${err.message}`)
  process.exit(1)
}

const problems = checkInventory({
  releaseFiles: drawio.releaseFiles,
  shippedFiles: drawio.shippedFiles,
  inventory: loadInventory(),
  config: drawio.config,
  isAllowed,
})

const built = listTree(DRAWIO_OUT)
if (built.length > 0) {
  const expected = new Set(drawio.shippedFiles)
  for (const f of built) {
    if (!expected.has(f)) problems.push(`build output has a file that must not ship: ${f}`)
  }
  const present = new Set(built)
  for (const f of drawio.shippedFiles) {
    if (!present.has(f)) {
      problems.push(`build output lacks ${f}`)
      continue
    }
    const actual = readFileSync(join(DRAWIO_OUT, ...f.split('/')))
    if (!actual.equals(await drawio.read(f))) {
      problems.push(`build output differs from the release: ${f}`)
    }
  }
}

if (problems.length > 0) {
  console.error('draw.io bundle license check failed:\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nSee vendor/drawio/README.md.')
  process.exit(1)
}

console.log(
  `draw.io ${drawio.config.version}: ${drawio.shippedFiles.length} shipped files covered by ` +
    `vendor/drawio/inventory.json, all licenses within the allowlist` +
    (built.length > 0 ? '; build output matches.' : '; no build output to compare.'),
)
