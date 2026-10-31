import { describe, expect, it } from 'vitest'
import { createHandedRun } from '../src/handed-run'

/**
 * The run a create flow handed to a new tab (spec 6): only that run, ended
 * well, lets the editor save the new document into the panel's project.
 */
describe('createHandedRun', () => {
  it('answers true once for the armed run that ended well', () => {
    const run = createHandedRun()
    expect(run.armed).toBe(false)
    run.arm()
    expect(run.armed).toBe(true)
    expect(run.settle(true)).toBe(true)
    expect(run.armed).toBe(false)
    // later runs in the same tab are the person's own
    expect(run.settle(true)).toBe(false)
  })

  it('a stopped or failed run disarms it: the document stays untitled', () => {
    const run = createHandedRun()
    run.arm()
    expect(run.settle(false)).toBe(false)
    expect(run.armed).toBe(false)
    expect(run.settle(true)).toBe(false)
  })

  it('never fires without a handed-over request', () => {
    const run = createHandedRun()
    expect(run.settle(true)).toBe(false)
    expect(run.settle(false)).toBe(false)
  })
})
