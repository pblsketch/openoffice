/** P29 A: only 1-/3-component JPEGs may embed raw — Word paints CMYK/YCCK black. */
import { describe, expect, it } from 'vitest'
import { jpegSofComponents } from '../src/extract'

function jpeg(components: number, sofMarker = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]
  const sof = [0xff, sofMarker, 0x00, 0x08, 8, 0x00, 0x10, 0x00, 0x10, components]
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof])
}

describe('jpegSofComponents', () => {
  it('reads the component count from SOF0', () => {
    expect(jpegSofComponents(jpeg(3))).toBe(3)
  })
  it('reads progressive SOF2 too', () => {
    expect(jpegSofComponents(jpeg(4, 0xc2))).toBe(4)
  })
  it('skips 0xFF fill bytes before APP0, before SOF, and several in a row', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]
    const sof = [0xff, 0xc0, 0x00, 0x08, 8, 0x00, 0x10, 0x00, 0x10, 3]
    expect(jpegSofComponents(Uint8Array.from([0xff, 0xd8, 0xff, ...app0, ...sof]))).toBe(3)
    expect(jpegSofComponents(Uint8Array.from([0xff, 0xd8, ...app0, 0xff, ...sof]))).toBe(3)
    expect(
      jpegSofComponents(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xff, ...app0, 0xff, 0xff, ...sof]),
      ),
    ).toBe(3)
  })
  it('recognises every SOF kind and rejects DHT, JPG and DAC', () => {
    for (const marker of [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]) {
      expect(jpegSofComponents(jpeg(3, marker))).toBe(3)
    }
    for (const marker of [0xc4, 0xc8, 0xcc]) expect(jpegSofComponents(jpeg(3, marker))).toBe(0)
  })
  it('steps over standalone markers (RSTn, TEM) without a length field', () => {
    const sof = [0xff, 0xc0, 0x00, 0x08, 8, 0x00, 0x10, 0x00, 0x10, 1]
    expect(jpegSofComponents(Uint8Array.from([0xff, 0xd8, 0xff, 0xd0, 0xff, 0x01, ...sof]))).toBe(1)
  })
  it('returns 0 for truncated streams and scan data without a SOF', () => {
    const full = jpeg(3)
    expect(jpegSofComponents(full.subarray(0, full.length - 1))).toBe(0)
    expect(jpegSofComponents(Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xff]))).toBe(0)
    expect(jpegSofComponents(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBe(0)
  })
  it('returns 0 for non-JPEG bytes', () => {
    expect(jpegSofComponents(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(0)
  })
})
