/**
 * Build step of the diagram editor: puts the trimmed draw.io bundle at
 * apps/diagram/out/drawio/ (see bundle.mjs). Runs before every build and dev
 * run of @genoffice/diagram; a cached, verified download and an up-to-date
 * output make it a no-op. Any failure (download, hash, cut) exits non-zero
 * so the build stops.
 *
 *   node vendor/drawio/prepare.mjs [--out <dir>]
 */
import { resolve } from 'node:path'
import { DRAWIO_OUT, prepareDrawio } from './bundle.mjs'

const args = process.argv.slice(2)
let outDir = DRAWIO_OUT
if (args[0] === '--out' && args[1]) outDir = resolve(args[1])
else if (args.length > 0) {
  console.error('Usage: node vendor/drawio/prepare.mjs [--out <dir>]')
  process.exit(2)
}

try {
  await prepareDrawio({ outDir })
} catch (err) {
  console.error(`draw.io bundle: ${err.message}`)
  process.exit(1)
}
