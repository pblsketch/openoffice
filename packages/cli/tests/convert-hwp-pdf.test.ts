import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeApp, run, tempDir, writeMinimalPdf } from './helpers'

describe('convert a Hangul document to PDF', () => {
  it('lists hwp and hwpx → pdf among the routes and refuses other targets', async () => {
    const dir = tempDir()
    const hwpx = join(dir, 'report.hwpx')
    writeFileSync(hwpx, 'PK')
    const r = await run(['convert', hwpx, '--to', 'docx', '--json'])
    expect(r.code).toBe(1)
    expect(r.json().message).toContain('cannot convert .hwpx to .docx')
    expect(r.json().detail.supported).toMatch(/hwp→pdf/)
    expect(r.json().detail.supported).toMatch(/hwpx→pdf/)
  })

  it('hands .hwp and .hwpx to the app headless export', async () => {
    // the fake app is a shell script
    if (process.platform === 'win32') return
    const dir = tempDir()
    const pdf = writeMinimalPdf(join(dir, 'page.pdf'))
    const env = { ...process.env, GENOFFICE_APP_BIN: fakeApp(dir, pdf) }
    for (const ext of ['hwp', 'hwpx']) {
      const input = join(dir, `form-${ext}.${ext}`)
      writeFileSync(input, 'x')
      const r = await run(['convert', input, '--to', 'pdf', '--json'], { env })
      expect(r.code).toBe(0)
      const out = r.json().output_path as string
      expect(out).toBe(join(dir, `form-${ext}.pdf`))
      expect(r.json().detail.via).toBe('ieumoffice --headless-export')
      expect(readFileSync(out).subarray(0, 5).toString()).toBe('%PDF-')
      // never over an existing file unless asked
      const again = await run(['convert', input, '--to', 'pdf', '--json'], { env })
      expect(again.json().reason).toBe('output_exists')
      expect((await run(['convert', input, '--to', 'pdf', '--force'], { env })).code).toBe(0)
    }
  })
})
