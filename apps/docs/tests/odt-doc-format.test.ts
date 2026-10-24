import { describe, expect, it, vi } from 'vitest'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { docxToOdt } from '@genoffice/odt-engine'
import {
  docFormatOfPath,
  isOdtPackage,
  prepareRecoveryBytes,
  prepareSaveBytes,
  recoveryExtFor,
  withDocExtension,
  zipEntryNames,
} from '../src/main/doc-format'
import { findDocxPath } from '../src/shared/open-file'

async function fixtures(): Promise<{ docx: Buffer; odt: Buffer }> {
  const docx = await buildBlankDocx({})
  const { odtBytes } = await docxToOdt(docx)
  return { docx: Buffer.from(docx), odt: Buffer.from(odtBytes) }
}

describe('main open/save format rules', () => {
  it('open paths accept .docx and .odt by extension', () => {
    expect(docFormatOfPath('C:\\Docs\\Plan.DOCX')).toBe('docx')
    expect(docFormatOfPath('/tmp/공문.odt')).toBe('odt')
    expect(docFormatOfPath('/tmp/notes.ott')).toBeNull()
    expect(docFormatOfPath('/tmp/notes.txt')).toBeNull()
    expect(findDocxPath(['GenOffice.exe', 'C:\\Users\\Me\\FORM.ODT'])).toBe(
      'C:\\Users\\Me\\FORM.ODT',
    )
    expect(findDocxPath(['GenOffice.exe', '--x=a.odt', '/tmp/a.ods'])).toBeNull()
  })

  it('reads zip entry names and tells an ODT package from a docx', async () => {
    const { docx, odt } = await fixtures()
    expect(zipEntryNames(odt)).toEqual(expect.arrayContaining(['mimetype', 'content.xml']))
    expect(zipEntryNames(docx)).toContain('[Content_Types].xml')
    expect(isOdtPackage(odt)).toBe(true)
    expect(isOdtPackage(docx)).toBe(false)
    expect(isOdtPackage(Buffer.from('not a zip at all, just some text'))).toBe(false)
    expect(zipEntryNames(Buffer.alloc(10))).toBeNull()
  })

  it('an ODT save skips lazy-media materialisation and the docx password', async () => {
    const { odt } = await fixtures()
    const materialize = vi.fn(async (b: Buffer) => ({ bytes: b, hashes: new Set<string>() }))
    const encrypt = vi.fn((b: Buffer) => b)
    const out = await prepareSaveBytes('odt', odt, { materialize, encrypt, password: 'secret' })
    expect(materialize).not.toHaveBeenCalled()
    expect(encrypt).not.toHaveBeenCalled()
    expect(out.bytes).toBe(odt)
    expect(out.encrypted).toBe(false)
    expect(out.hashes.size).toBe(0)
  })

  it('a docx save still materialises and encrypts', async () => {
    const { docx } = await fixtures()
    const sealed = Buffer.from('sealed')
    const materialize = vi.fn(async (b: Buffer) => ({ bytes: b, hashes: new Set(['h']) }))
    const encrypt = vi.fn(() => sealed)
    const out = await prepareSaveBytes('docx', docx, { materialize, encrypt, password: 'pw' })
    expect(materialize).toHaveBeenCalledTimes(1)
    expect(encrypt).toHaveBeenCalledWith(docx, 'pw')
    expect(out.bytes).toBe(sealed)
    expect(out.plain).toBe(docx)
    expect(out.encrypted).toBe(true)
    const plain = await prepareSaveBytes('docx', docx, { materialize, encrypt, password: null })
    expect(plain.bytes).toBe(docx)
    expect(plain.encrypted).toBe(false)
  })

  it('never writes docx bytes to an .odt path or ODT bytes to a .docx path', async () => {
    const { docx, odt } = await fixtures()
    const deps = {
      materialize: async (b: Buffer) => ({ bytes: b, hashes: new Set<string>() }),
      encrypt: (b: Buffer) => b,
      password: null,
    }
    await expect(prepareSaveBytes('odt', docx, deps)).rejects.toThrow(/not an ODT/)
    await expect(prepareSaveBytes('docx', odt, deps)).rejects.toThrow(/not a docx/)
  })

  it('recovery copies and Save As names keep the document format', () => {
    expect(recoveryExtFor('/tmp/a.odt')).toBe('.odt')
    expect(recoveryExtFor('/tmp/a.docx')).toBe('.docx')
    expect(withDocExtension('/tmp/report', 'odt')).toBe('/tmp/report.odt')
    expect(withDocExtension('/tmp/report.docx', 'odt')).toBe('/tmp/report.docx')
    expect(withDocExtension('/tmp/report.ODT', 'docx')).toBe('/tmp/report.ODT')
  })
})

describe('crash-recovery copy bytes', () => {
  it('a docx copy gets its lazily served pictures back before it is protected, like a save', async () => {
    const { docx } = await fixtures()
    const full = Buffer.from('docx with every picture inlined')
    const order: string[] = []
    const materialize = vi.fn(async () => {
      order.push('materialize')
      return { bytes: full, hashes: new Set(['h']) }
    })
    const protect = vi.fn((plain: Buffer) => {
      order.push('protect')
      return plain
    })
    const out = await prepareRecoveryBytes('docx', docx, { materialize, protect })
    expect(out).toBe(full)
    expect(protect).toHaveBeenCalledWith(full)
    expect(order).toEqual(['materialize', 'protect'])
  })

  it('protection may skip the tick (an encrypted file whose password is unknown)', async () => {
    const { docx } = await fixtures()
    const materialize = async (b: Buffer) => ({ bytes: b, hashes: new Set<string>() })
    expect(await prepareRecoveryBytes('docx', docx, { materialize, protect: () => null })).toBe(
      null,
    )
  })

  it('pictures that cannot be inlined still leave a copy of the text', async () => {
    const { docx } = await fixtures()
    const materialize = vi.fn(async () => {
      throw new Error('picture source gone')
    })
    const out = await prepareRecoveryBytes('docx', docx, { materialize, protect: (b) => b })
    expect(out).toBe(docx)
  })

  it('an ODT copy is the ODT itself; bytes of the other format are refused', async () => {
    const { docx, odt } = await fixtures()
    const materialize = vi.fn(async (b: Buffer) => ({ bytes: b, hashes: new Set<string>() }))
    const protect = vi.fn((b: Buffer) => b)
    expect(await prepareRecoveryBytes('odt', odt, { materialize, protect })).toBe(odt)
    expect(await prepareRecoveryBytes('odt', docx, { materialize, protect })).toBeNull()
    expect(await prepareRecoveryBytes('docx', odt, { materialize, protect })).toBeNull()
    expect(materialize).not.toHaveBeenCalled()
    expect(protect).not.toHaveBeenCalled()
  })
})
