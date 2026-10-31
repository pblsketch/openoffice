// The bundled template fonts keep their distributor names, so the family name a document
// stores is the one a machine with the real font installed resolves. This reads each
// file's own name table and holds the data list to it.
import { closeSync, openSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPLATE_FONTS } from '@genoffice/ui/template-fonts'

import { parseFamilyNames } from '../src/family-info'
import { faceOffsets, readTable, readTableDir } from '../src/sfnt'

const FOLDER = resolve(import.meta.dirname, '../../ui/template-fonts')

interface FileFacts {
  /** typographic family (name ID 16), else the family (name ID 1) */
  family?: string
  /** the family (name ID 1) in its non-Korean spelling */
  legacyFamily?: string
  weightClass: number
  variable: boolean
}

function factsOf(path: string): FileFacts {
  const fd = openSync(path, 'r')
  try {
    const offsets = faceOffsets(fd)
    expect(offsets).toEqual([0])
    const tables = readTableDir(fd, 0)
    if (!tables) throw new Error(`${path} is not an sfnt font`)
    const name = readTable(fd, tables, 'name', 1 << 20)
    const os2 = readTable(fd, tables, 'OS/2', 512)
    if (!name || !os2) throw new Error(`${path} lacks a name or OS/2 table`)
    const records = parseFamilyNames(name).filter((r) => !r.korean)
    const legacyFamily = records.find((r) => r.id === 1)?.name
    return {
      family: records.find((r) => r.id === 16)?.name ?? legacyFamily,
      legacyFamily,
      weightClass: os2.readUInt16BE(4),
      variable: tables.has('fvar'),
    }
  } finally {
    closeSync(fd)
  }
}

describe('template font names', () => {
  for (const family of TEMPLATE_FONTS) {
    for (const face of family.faces) {
      it(`${face.file} is the real ${family.family} face it is listed as`, () => {
        const facts = factsOf(join(FOLDER, face.file))
        expect(facts.family).toBe(family.family)
        // Office lists the face under its family (name ID 1): a face that is a family of
        // its own there (a SemiBold, say) would need registering under that name too
        expect(facts.legacyFamily).toBe(family.family)
        expect(facts.weightClass).toBe(face.weight)
        expect(facts.variable).toBe(face.variableWeight !== undefined)
      })
    }
  }
})
