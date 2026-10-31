import { describe, expect, it } from 'vitest'
import { driveAiOn } from '../src/drive-ai-channels'

describe('driveAiOn', () => {
  it('needs a connection, the AI switch and the model-training confirmation', () => {
    const on = { state: 'connected', aiAccess: true, trainingAck: true }
    expect(driveAiOn(on)).toBe(true)
    expect(driveAiOn({ ...on, trainingAck: false })).toBe(false)
    expect(driveAiOn({ ...on, aiAccess: false })).toBe(false)
    expect(driveAiOn({ ...on, state: 'disconnected' })).toBe(false)
    expect(driveAiOn(null)).toBe(false)
  })
})
