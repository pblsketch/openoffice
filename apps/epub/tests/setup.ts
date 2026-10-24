/**
 * Test environment fixes for jsdom.
 *
 * jsdom brings its own typed arrays, while Node's TextEncoder and streams hand
 * back Node's. The zip library tells bytes from other values with `instanceof`,
 * so bytes of the "other" kind are refused. One kind for everything: Node's.
 */
const sample = new TextEncoder().encode('')
globalThis.Uint8Array = sample.constructor as Uint8ArrayConstructor
globalThis.ArrayBuffer = sample.buffer.constructor as ArrayBufferConstructor
