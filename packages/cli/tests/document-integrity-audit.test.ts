import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'
import { formOdt } from './odt-fixtures'

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6/yEAAAAASUVORK5CYII='

describe('additional document integrity audit', () => {
  it('preserves untouched complex DOCX content through ten edit/save/reopen cycles', async () => {
    const dir = tempDir()
    const md = join(dir, 'rich.md')
    const path = join(dir, 'rich.docx')
    const ops = join(dir, 'ops.json')
    writeFileSync(join(dir, 'pixel.png'), Buffer.from(PNG, 'base64'))
    writeFileSync(
      md,
      '# Report\n\nRound 0.\n\nReview untouched.\n\n| Name | Qty |\n| --- | --- |\n| Item | 3 |\n\n![Pixel](pixel.png)\n',
    )
    expect((await run(['create', '--type', 'docx', '--from', md, '--out', path])).code).toBe(0)
    writeFileSync(
      ops,
      JSON.stringify([
        { op: 'insert_footnote', blockIndex: 2, text: 'Preserved source note.' },
        { op: 'add_comment', blockIndex: 2, comment: 'Preserved review comment.' },
        { op: 'set_header_footer', kind: 'header', text: 'Preserved header' },
        { op: 'set_header_footer', kind: 'footer', text: 'Page {PAGE}' },
      ]),
    )
    const setup = await run(['docs', 'apply', path, '--ops', ops, '--json'])
    expect(setup.code, setup.stdout).toBe(0)
    writeFileSync(
      ops,
      JSON.stringify([
        { op: 'findReplace', find: 'Review untouched.', replace: 'Reviewed untouched.' },
      ]),
    )
    expect(
      (
        await run([
          'docs',
          'apply',
          path,
          '--ops',
          ops,
          '--track',
          '--author',
          'Reviewer',
          '--json',
        ])
      ).code,
    ).toBe(0)
    const baseline = await JSZip.loadAsync(readFileSync(path))
    const document = await baseline.file('word/document.xml')!.async('string')
    const table = document.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)![0]
    expect(document).toContain('<w:ins')
    for (let round = 1; round <= 10; round++) {
      writeFileSync(
        ops,
        JSON.stringify([
          { op: 'findReplace', find: `Round ${round - 1}.`, replace: `Round ${round}.` },
        ]),
      )
      const edit = await run(['docs', 'apply', path, '--ops', ops, '--json'])
      expect(edit.code, edit.stdout).toBe(0)
      const saved = await JSZip.loadAsync(readFileSync(path))
      expect(Object.keys(saved.files).sort()).toEqual(Object.keys(baseline.files).sort())
      for (const [name, entry] of Object.entries(baseline.files)) {
        if (entry.dir || name === 'word/document.xml') continue
        // a real save stamps dcterms:modified and bumps cp:revision, as Word does
        if (name === 'docProps/core.xml') {
          const revisionOf = (xml: string) => Number(/<cp:revision>(\d+)</.exec(xml)?.[1])
          const before = revisionOf(await entry.async('string'))
          const after = revisionOf(await saved.file(name)!.async('string'))
          expect(after, `${round}: ${name}`).toBe(before + round)
          continue
        }
        expect(await saved.file(name)!.async('nodebuffer'), `${round}: ${name}`).toEqual(
          await entry.async('nodebuffer'),
        )
      }
      const xml = await saved.file('word/document.xml')!.async('string')
      expect(xml).toContain(`Round ${round}.`)
      expect(xml).toContain(table)
      expect(xml).toContain('<w:ins')
      expect(xml).toContain('w:footnoteReference')
      expect(xml).toContain('w:commentReference')
      expect(xml).toContain('w:headerReference')
    }
    const read = await run([
      'docs',
      'read',
      path,
      '--full',
      '--comments',
      '--notes',
      '--revisions',
      '--json',
    ])
    expect(read.code, read.stdout).toBe(0)
    expect(JSON.stringify(read.json().detail)).toContain('Round 10.')
    expect(JSON.stringify(read.json().detail)).toContain('Preserved review comment.')
    expect(JSON.stringify(read.json().detail)).toContain('Preserved source note.')
  })

  for (const ext of ['docx', 'odt']) {
    for (const damage of ['not zip', 'truncated zip', 'missing required XML']) {
      for (const command of ['read', 'apply']) {
        it(`${ext}: ${command} refuses ${damage} without changing the input`, async () => {
          const dir = tempDir()
          const path = join(dir, `broken.${ext}`)
          let bytes: Uint8Array
          if (ext === 'odt') bytes = await formOdt()
          else {
            const md = join(dir, 'source.md')
            writeFileSync(md, '# Source\n\nBody.\n')
            expect(
              (await run(['create', '--type', 'docx', '--from', md, '--out', path])).code,
            ).toBe(0)
            bytes = readFileSync(path)
          }
          if (damage === 'not zip') bytes = Buffer.from('Not an office document')
          else if (damage === 'truncated zip')
            bytes = bytes.subarray(0, Math.floor(bytes.length / 2))
          else {
            const zip = await JSZip.loadAsync(bytes)
            zip.remove(ext === 'docx' ? 'word/document.xml' : 'content.xml')
            bytes = await zip.generateAsync({ type: 'uint8array' })
          }
          writeFileSync(path, bytes)
          const before = readFileSync(path)
          const ops = join(dir, 'ops.json')
          writeFileSync(
            ops,
            JSON.stringify([{ op: 'insert_content', html: '<p>Must not save.</p>' }]),
          )
          const result = await run([
            'docs',
            command,
            path,
            ...(command === 'apply' ? ['--ops', ops] : []),
            '--json',
          ])
          expect(result.code, result.stdout).not.toBe(0)
          expect(result.json().status).toBe('error')
          expect(readFileSync(path)).toEqual(before)
        })
      }
    }
  }
})
