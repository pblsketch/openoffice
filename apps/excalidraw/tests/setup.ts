/**
 * Test environment fixes for jsdom: jsdom brings its own typed arrays, while
 * Node's TextEncoder hands back Node's. One kind for everything: Node's.
 */
const sample = new TextEncoder().encode('')
globalThis.Uint8Array = sample.constructor as Uint8ArrayConstructor
globalThis.ArrayBuffer = sample.buffer.constructor as ArrayBufferConstructor
