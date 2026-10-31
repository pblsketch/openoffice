import { describe, expect, it, vi } from 'vitest'
import {
  CLOUD_ONLY_ATTRIBUTES,
  FILE_ATTRIBUTE_OFFLINE,
  FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS,
  FILE_ATTRIBUTE_RECALL_ON_OPEN,
  POWERSHELL_LISTING_SCRIPT,
  createPowerShellAttributeReader,
  detectCloudOnlyFiles,
  isCloudOnlyAttributes,
  isUnderKnownSyncFolder,
  knownSyncFolders,
  parseAttributeListing,
  resolveCloudOnly,
} from '../src/main/projects/cloud-files'
import type { AttributeReader, ListingRun } from '../src/main/projects/cloud-files'

const ARCHIVE = 0x20
const SPARSE = 0x200
const REPARSE = 0x400
const UNPINNED = 0x100000
/** What OneDrive reports for an online-only picture on this kind of PC */
const ONEDRIVE_ONLINE_ONLY = 0x501620

function listing(entries: Record<string, number>): ReadonlyMap<string, number> {
  return new Map(Object.entries(entries))
}

function fakeReader(
  dirs: Record<string, ReadonlyMap<string, number> | null>,
): AttributeReader & { calls: string[][] } {
  const calls: string[][] = []
  const reader = (async (asked: readonly string[]) => {
    calls.push([...asked])
    const out = new Map<string, ReadonlyMap<string, number> | null>()
    for (const dir of asked) out.set(dir, dir in dirs ? dirs[dir] : null)
    return out
  }) as AttributeReader & { calls: string[][] }
  reader.calls = calls
  return reader
}

describe('attribute bits', () => {
  it('uses the documented Windows values', () => {
    expect(FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS).toBe(0x400000)
    expect(FILE_ATTRIBUTE_RECALL_ON_OPEN).toBe(0x40000)
    expect(FILE_ATTRIBUTE_OFFLINE).toBe(0x1000)
    expect(CLOUD_ONLY_ATTRIBUTES).toBe(0x441000)
  })

  it('treats any one of the three bits as not on this PC', () => {
    expect(isCloudOnlyAttributes(FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS)).toBe(true)
    expect(isCloudOnlyAttributes(FILE_ATTRIBUTE_RECALL_ON_OPEN)).toBe(true)
    expect(isCloudOnlyAttributes(FILE_ATTRIBUTE_OFFLINE)).toBe(true)
    expect(isCloudOnlyAttributes(ONEDRIVE_ONLINE_ONLY)).toBe(true)
  })

  it('keeps local files, including pinned or hydrated placeholders', () => {
    expect(isCloudOnlyAttributes(0)).toBe(false)
    expect(isCloudOnlyAttributes(ARCHIVE)).toBe(false)
    expect(isCloudOnlyAttributes(ARCHIVE | SPARSE | REPARSE)).toBe(false)
    expect(isCloudOnlyAttributes(ARCHIVE | REPARSE | UNPINNED)).toBe(false)
  })

  it('rejects values that are not attribute words', () => {
    expect(isCloudOnlyAttributes(Number.NaN)).toBe(false)
    expect(isCloudOnlyAttributes(-1)).toBe(false)
    expect(isCloudOnlyAttributes(1.5)).toBe(false)
  })
})

describe('parseAttributeListing', () => {
  const dirs = ['C:\\A', 'C:\\B']

  it('maps every listed directory to its entries', () => {
    const out = parseAttributeListing(
      ['D\t0', 'F\t32\ta.docx', `F\t${0x401620}\t사진 1.jpg`, 'D\t1', 'END', ''].join('\r\n'),
      dirs,
    )
    expect(out.get('C:\\A')).toEqual(listing({ 'a.docx': 32, '사진 1.jpg': 0x401620 }))
    expect(out.get('C:\\B')).toEqual(new Map())
  })

  it('marks a directory that could not be listed as unknown', () => {
    const out = parseAttributeListing(['E\t0', 'D\t1', 'F\t32\tb.txt', 'END'].join('\n'), dirs)
    expect(out.get('C:\\A')).toBeNull()
    expect(out.get('C:\\B')).toEqual(listing({ 'b.txt': 32 }))
  })

  it('refuses a listing that did not finish', () => {
    expect(() => parseAttributeListing(['D\t0', 'F\t32\ta.docx'].join('\n'), dirs)).toThrow()
  })

  it('refuses lines it does not understand', () => {
    expect(() => parseAttributeListing(['D\t0', 'F\tx\ta', 'END'].join('\n'), dirs)).toThrow()
    expect(() => parseAttributeListing(['D\t7', 'END'].join('\n'), dirs)).toThrow()
    expect(() => parseAttributeListing(['F\t32\ta', 'END'].join('\n'), dirs)).toThrow()
  })

  it('leaves directories the listing never mentioned as unknown', () => {
    const out = parseAttributeListing(['D\t0', 'END'].join('\n'), dirs)
    expect(out.get('C:\\B')).toBeNull()
  })
})

describe('detectCloudOnlyFiles', () => {
  it('lists each directory once for many files and maps the verdicts', async () => {
    const reader = fakeReader({
      'C:\\P': listing({ 'a.docx': ARCHIVE, 'b.jpg': ONEDRIVE_ONLINE_ONLY }),
      'C:\\P\\sub': listing({ 'c.hwp': ARCHIVE | FILE_ATTRIBUTE_OFFLINE }),
    })
    const out = await detectCloudOnlyFiles(
      ['C:\\P\\a.docx', 'C:\\P\\b.jpg', 'C:\\P\\sub\\c.hwp', 'C:\\P\\gone.txt'],
      { platform: 'win32', reader },
    )
    expect(reader.calls).toEqual([['C:\\P', 'C:\\P\\sub']])
    expect(out.get('C:\\P\\a.docx')).toBe('local')
    expect(out.get('C:\\P\\b.jpg')).toBe('cloud-only')
    expect(out.get('C:\\P\\sub\\c.hwp')).toBe('cloud-only')
    expect(out.get('C:\\P\\gone.txt')).toBe('unknown')
  })

  it('groups directories case-insensitively and matches names without case', async () => {
    const reader = fakeReader({ 'C:\\Proj': listing({ 'Report.DOCX': ONEDRIVE_ONLINE_ONLY }) })
    const out = await detectCloudOnlyFiles(['C:\\Proj\\report.docx', 'c:\\proj\\Report.DOCX'], {
      platform: 'win32',
      reader,
    })
    expect(reader.calls).toEqual([['C:\\Proj']])
    expect(out.get('C:\\Proj\\report.docx')).toBe('cloud-only')
    expect(out.get('c:\\proj\\Report.DOCX')).toBe('cloud-only')
  })

  it('does not guess when two entries differ only by case', async () => {
    const reader = fakeReader({
      'C:\\P': listing({ 'A.txt': ARCHIVE, 'a.TXT': FILE_ATTRIBUTE_OFFLINE }),
    })
    const out = await detectCloudOnlyFiles(['C:\\P\\a.txt', 'C:\\P\\A.txt'], {
      platform: 'win32',
      reader,
    })
    expect(out.get('C:\\P\\a.txt')).toBe('unknown')
    expect(out.get('C:\\P\\A.txt')).toBe('local')
  })

  it('answers unknown for a directory the reader could not list', async () => {
    const reader = fakeReader({ 'C:\\ok': listing({ 'a.txt': ARCHIVE }), 'C:\\bad': null })
    const out = await detectCloudOnlyFiles(['C:\\ok\\a.txt', 'C:\\bad\\b.txt'], {
      platform: 'win32',
      reader,
    })
    expect(out.get('C:\\ok\\a.txt')).toBe('local')
    expect(out.get('C:\\bad\\b.txt')).toBe('unknown')
  })

  it('answers unknown for every path when the reader fails', async () => {
    const reader: AttributeReader = async () => {
      throw new Error('powershell is blocked')
    }
    const out = await detectCloudOnlyFiles(['C:\\P\\a.txt', 'D:\\Q\\b.txt'], {
      platform: 'win32',
      reader,
    })
    expect([...out.values()]).toEqual(['unknown', 'unknown'])
  })

  it('answers unknown for relative paths and paths a listing line cannot carry', async () => {
    const reader = fakeReader({})
    const out = await detectCloudOnlyFiles(['notes\\a.txt', 'C:\\P\\x\ny.txt'], {
      platform: 'win32',
      reader,
    })
    expect(reader.calls).toEqual([])
    expect([...out.values()]).toEqual(['unknown', 'unknown'])
  })

  it('answers unknown off Windows without listing anything', async () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const reader = fakeReader({ '/Users/me/OneDrive': listing({ 'a.txt': ARCHIVE }) })
      const out = await detectCloudOnlyFiles(['/Users/me/OneDrive/a.txt'], { platform, reader })
      expect(reader.calls).toEqual([])
      expect(out.get('/Users/me/OneDrive/a.txt')).toBe('unknown')
    }
  })

  it('does not start anything for an empty request', async () => {
    const reader = fakeReader({})
    const out = await detectCloudOnlyFiles([], { platform: 'win32', reader })
    expect(out.size).toBe(0)
    expect(reader.calls).toEqual([])
  })
})

describe('createPowerShellAttributeReader', () => {
  const env = { SystemRoot: 'C:\\Windows' } as NodeJS.ProcessEnv

  it('starts the system PowerShell by full path with a constant command and paths on stdin', async () => {
    const run = vi.fn<ListingRun>(async () => ['D\t0', 'F\t32\ta.txt', 'D\t1', 'END'].join('\n'))
    const reader = createPowerShellAttributeReader({ env, run })
    const dirs = ['C:\\Users\\me\\OneDrive\\문서', 'E:\\it"s; & $(calc)']
    const out = await reader(dirs, { timeoutMs: 1234 })

    expect(run).toHaveBeenCalledTimes(1)
    const [file, args, options] = run.mock.calls[0]
    expect(file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(options.cwd).toBe('C:\\Windows\\System32')
    expect(options.timeoutMs).toBe(1234)
    expect(options.input).toBe(`${dirs.join('\n')}\n`)
    const encoded = args[args.indexOf('-EncodedCommand') + 1]
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe(POWERSHELL_LISTING_SCRIPT)
    for (const arg of args) {
      for (const dir of dirs) expect(arg).not.toContain(dir)
    }
    expect(args).toContain('-NoProfile')
    expect(args).toContain('-NonInteractive')
    expect(out.get(dirs[0])).toEqual(listing({ 'a.txt': 32 }))
    expect(out.get(dirs[1])).toEqual(new Map())
  })

  it('lists entries from the directory, never by opening a file', () => {
    expect(POWERSHELL_LISTING_SCRIPT).toContain('GetFileSystemInfos')
    expect(POWERSHELL_LISTING_SCRIPT).not.toMatch(/Get-Content|OpenRead|ReadAllBytes|Open\(/i)
    expect(POWERSHELL_LISTING_SCRIPT).not.toMatch(/Refresh\(/)
  })

  it('rejects when the program fails, so detection answers unknown', async () => {
    const run: ListingRun = async () => {
      throw new Error('timed out')
    }
    const reader = createPowerShellAttributeReader({ env, run })
    await expect(reader(['C:\\P'], { timeoutMs: 10 })).rejects.toThrow('timed out')
    const out = await detectCloudOnlyFiles(['C:\\P\\a.txt'], { platform: 'win32', reader })
    expect(out.get('C:\\P\\a.txt')).toBe('unknown')
  })
})

describe('knownSyncFolders and isUnderKnownSyncFolder', () => {
  const winEnv = {
    OneDrive: 'C:\\Users\\me\\OneDrive - School',
    OneDriveConsumer: 'C:\\Users\\me\\OneDrive',
    OneDriveCommercial: 'C:\\Users\\me\\OneDrive - School',
    USERPROFILE: 'C:\\Users\\me',
  } as NodeJS.ProcessEnv
  const win = { platform: 'win32' as const }

  it('collects the OneDrive folders from the environment once each', () => {
    const roots = knownSyncFolders(winEnv, win)
    expect(roots).toContain('C:\\Users\\me\\OneDrive')
    expect(roots).toContain('C:\\Users\\me\\OneDrive - School')
    expect(roots.filter((r) => r === 'C:\\Users\\me\\OneDrive - School')).toHaveLength(1)
  })

  it('ignores relative or empty environment values', () => {
    const roots = knownSyncFolders(
      { OneDrive: 'OneDrive', OneDriveConsumer: '', USERPROFILE: 'C:\\Users\\me' },
      win,
    )
    expect(roots).not.toContain('OneDrive')
    expect(isUnderKnownSyncFolder('C:\\work\\OneDrive\\a.txt', { OneDrive: 'OneDrive' }, win)).toBe(
      false,
    )
  })

  it('matches files under a OneDrive folder without regard to case on Windows', () => {
    expect(isUnderKnownSyncFolder('C:\\Users\\me\\OneDrive\\문서\\a.hwp', winEnv, win)).toBe(true)
    expect(isUnderKnownSyncFolder('c:\\users\\ME\\onedrive\\a.hwp', winEnv, win)).toBe(true)
    expect(isUnderKnownSyncFolder('C:/Users/me/OneDrive - School/x/y.docx', winEnv, win)).toBe(true)
    expect(isUnderKnownSyncFolder('C:\\Users\\me\\OneDrive', winEnv, win)).toBe(true)
  })

  it('does not match a sibling whose name only starts the same', () => {
    expect(isUnderKnownSyncFolder('C:\\Users\\me\\OneDrive2\\a.txt', winEnv, win)).toBe(false)
    expect(isUnderKnownSyncFolder('C:\\Users\\me\\Documents\\a.txt', winEnv, win)).toBe(false)
    expect(isUnderKnownSyncFolder('relative\\a.txt', winEnv, win)).toBe(false)
  })

  it('matches the Google Drive for desktop folders under the user profile', () => {
    expect(isUnderKnownSyncFolder('C:\\Users\\me\\My Drive\\a.docx', winEnv, win)).toBe(true)
    expect(isUnderKnownSyncFolder('C:\\Users\\me\\Google Drive\\a.docx', winEnv, win)).toBe(true)
  })

  it('matches the Google Drive for desktop drive by its top-level folders', () => {
    const env = {} as NodeJS.ProcessEnv
    expect(isUnderKnownSyncFolder('G:\\My Drive\\수업\\a.hwp', env, win)).toBe(true)
    expect(isUnderKnownSyncFolder('H:\\내 드라이브\\a.hwp', env, win)).toBe(true)
    expect(isUnderKnownSyncFolder('G:\\Shared drives\\Team\\a.xlsx', env, win)).toBe(true)
    expect(isUnderKnownSyncFolder('G:\\공유 드라이브\\팀\\a.xlsx', env, win)).toBe(true)
    expect(isUnderKnownSyncFolder('G:\\.shortcut-targets-by-id\\1x\\a.pdf', env, win)).toBe(true)
    expect(isUnderKnownSyncFolder('g:\\my drive\\a.pdf', env, win)).toBe(true)
    expect(isUnderKnownSyncFolder('G:\\Projects\\My Drive\\a.pdf', env, win)).toBe(false)
    expect(isUnderKnownSyncFolder('G:\\Backup\\a.pdf', env, win)).toBe(false)
  })

  it('accepts extra roots found elsewhere, such as a drive found by its volume label', () => {
    expect(
      isUnderKnownSyncFolder('K:\\Work\\a.docx', {}, { platform: 'win32', extraRoots: ['k:\\'] }),
    ).toBe(true)
  })

  it('matches the macOS cloud storage folders of Google Drive and OneDrive', () => {
    const mac = { platform: 'darwin' as const, homeDir: '/Users/me' }
    const env = {} as NodeJS.ProcessEnv
    expect(
      isUnderKnownSyncFolder(
        '/Users/me/Library/CloudStorage/GoogleDrive-me@example.com/My Drive/a.docx',
        env,
        mac,
      ),
    ).toBe(true)
    expect(
      isUnderKnownSyncFolder('/Users/me/Library/CloudStorage/OneDrive-Personal/a.docx', env, mac),
    ).toBe(true)
    expect(isUnderKnownSyncFolder('/Volumes/GoogleDrive/My Drive/a.docx', env, mac)).toBe(true)
    expect(isUnderKnownSyncFolder('/Volumes/GoogleDrive-1234/My Drive/a.docx', env, mac)).toBe(true)
    expect(isUnderKnownSyncFolder('/Users/me/Library/CloudStorage/Dropbox/a.docx', env, mac)).toBe(
      false,
    )
    expect(isUnderKnownSyncFolder('/Users/me/Documents/a.docx', env, mac)).toBe(false)
  })

  it('compares case-sensitively on Linux', () => {
    const linux = { platform: 'linux' as const, homeDir: '/home/me' }
    const env = { OneDrive: '/home/me/OneDrive' } as NodeJS.ProcessEnv
    expect(isUnderKnownSyncFolder('/home/me/OneDrive/a.txt', env, linux)).toBe(true)
    expect(isUnderKnownSyncFolder('/home/me/onedrive/a.txt', env, linux)).toBe(false)
  })
})

describe('resolveCloudOnly', () => {
  const env = { OneDrive: 'C:\\Users\\me\\OneDrive', USERPROFILE: 'C:\\Users\\me' }

  it('follows the attributes where they could be read', async () => {
    const reader = fakeReader({
      'C:\\Users\\me\\OneDrive\\P': listing({ 'a.docx': ARCHIVE, 'b.jpg': ONEDRIVE_ONLINE_ONLY }),
      'D:\\Work': listing({ 'c.txt': FILE_ATTRIBUTE_OFFLINE }),
    })
    const out = await resolveCloudOnly(
      [
        'C:\\Users\\me\\OneDrive\\P\\a.docx',
        'C:\\Users\\me\\OneDrive\\P\\b.jpg',
        'D:\\Work\\c.txt',
      ],
      { platform: 'win32', reader, env },
    )
    expect(out.get('C:\\Users\\me\\OneDrive\\P\\a.docx')).toBe(false)
    expect(out.get('C:\\Users\\me\\OneDrive\\P\\b.jpg')).toBe(true)
    expect(out.get('D:\\Work\\c.txt')).toBe(true)
  })

  it('falls back to the sync-folder rule when the attributes are unknown', async () => {
    const reader: AttributeReader = async () => {
      throw new Error('no powershell')
    }
    const out = await resolveCloudOnly(['C:\\Users\\me\\OneDrive\\a.docx', 'D:\\Work\\b.docx'], {
      platform: 'win32',
      reader,
      env,
    })
    expect(out.get('C:\\Users\\me\\OneDrive\\a.docx')).toBe(true)
    expect(out.get('D:\\Work\\b.docx')).toBe(false)
  })

  it('uses only the sync-folder rule off Windows', async () => {
    const out = await resolveCloudOnly(
      ['/Users/me/Library/CloudStorage/OneDrive-Personal/a.docx', '/Users/me/Documents/b.docx'],
      { platform: 'darwin', env: {}, homeDir: '/Users/me' },
    )
    expect(out.get('/Users/me/Library/CloudStorage/OneDrive-Personal/a.docx')).toBe(true)
    expect(out.get('/Users/me/Documents/b.docx')).toBe(false)
  })

  it('does not trust a local answer on the Google Drive streaming drive', async () => {
    const reader = fakeReader({ 'G:\\My Drive\\P': listing({ 'a.docx': ARCHIVE }) })
    const out = await resolveCloudOnly(['G:\\My Drive\\P\\a.docx'], {
      platform: 'win32',
      reader,
      env: {},
    })
    expect(out.get('G:\\My Drive\\P\\a.docx')).toBe(true)
  })
})
