import { describe, expect, it } from 'vitest'
import { relativeInside } from '../src/main/projects/paths'

describe('relativeInside', () => {
  it('keeps names that only start with dots inside the folder (win32)', () => {
    const root = 'C:\\Work\\Project'
    expect(relativeInside(root, 'C:\\Work\\Project\\..x\\a.docx', 'win32')).toBe('..x/a.docx')
    expect(relativeInside(root, 'C:\\Work\\Project\\...', 'win32')).toBe('...')
    expect(relativeInside(root, 'C:\\Work\\Project\\..config', 'win32')).toBe('..config')
  })

  it('keeps names that only start with dots inside the folder (posix)', () => {
    const root = '/home/me/project'
    expect(relativeInside(root, '/home/me/project/..x/a.docx', 'linux')).toBe('..x/a.docx')
    expect(relativeInside(root, '/home/me/project/...', 'linux')).toBe('...')
    expect(relativeInside(root, '/home/me/project/..config', 'darwin')).toBe('..config')
  })

  it('still refuses the folder itself, its parent, siblings and other drives', () => {
    const root = 'C:\\Work\\Project'
    expect(relativeInside(root, root, 'win32')).toBeNull()
    expect(relativeInside(root, 'C:\\Work', 'win32')).toBeNull()
    expect(relativeInside(root, 'C:\\Work\\Project2\\a.docx', 'win32')).toBeNull()
    expect(relativeInside(root, 'C:\\Work\\..x\\a.docx', 'win32')).toBeNull()
    expect(relativeInside(root, 'D:\\Work\\Project\\a.docx', 'win32')).toBeNull()
    expect(relativeInside(root, '\\\\server\\share\\Project\\a.docx', 'win32')).toBeNull()
    expect(relativeInside('/home/me/project', '/home/me/..x/a.docx', 'linux')).toBeNull()
  })
})
