import { describe, expect, it, vi } from 'vitest'
import { RECOVERY_LIST_CHANNELS, type RecoveryListApi } from '../src/shared/recovery-list-api'

/**
 * The launch recovery list's bridge (crash recovery spec 6): Home reaches the
 * main process only through window.aiOfficeRecovery, on the two list channels.
 */

const electronMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => electronMocks.exposed.set(name, api),
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  webUtils: { getPathForFile: () => '' },
}))

import '../src/preload/index'

describe('launch recovery list preload API', () => {
  const api = electronMocks.exposed.get('aiOfficeRecovery') as RecoveryListApi

  it('is exposed as window.aiOfficeRecovery', () => {
    expect(api).toBeTruthy()
  })

  it('asks for the rows and hands back the choices on the list channels', async () => {
    electronMocks.invoke.mockResolvedValueOnce(null)
    await expect(api.getLaunchRecoveryList()).resolves.toBeNull()
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(RECOVERY_LIST_CHANNELS.get)

    electronMocks.invoke.mockResolvedValueOnce(undefined)
    await api.submitLaunchRecovery({ dismissed: true })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(RECOVERY_LIST_CHANNELS.submit, {
      dismissed: true,
    })
  })
})
