/** The Node implementation of the page codec (`@genoffice/drawio-model/node`). */
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import type { PageCodec } from './codec'

export const nodePageCodec: PageCodec = {
  inflateRaw: (data) => new Uint8Array(inflateRawSync(data)),
  deflateRaw: (data) => new Uint8Array(deflateRawSync(data)),
}
