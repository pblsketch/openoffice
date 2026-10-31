import { describe, expect, it, vi } from 'vitest'
import type { AgentStreamRequest, AgentTransport } from '@genoffice/agent-core'
import type { ProjectDetail } from '@genoffice/project-store'
import type { AiSendGate } from '../src/ai-send-gate'
import {
  consolidateProjectMemory,
  parseConsolidatedMemory,
  undoProjectMemoryConsolidation,
} from '../src/project-memory-consolidate'
import { fakeProjectBridge } from './project-fake-bridge'

const RUN = { kind: 'run', choice: { connected: true } } as unknown as AiSendGate
const CONNECT = { kind: 'connect', choice: { connected: false } } as unknown as AiSendGate
const NOTICE = { kind: 'notice', provider: 'claude-code' } as unknown as AiSendGate

function detail(patch: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    project: {
      id: 'p1',
      name: 'Report',
      path: 'C:/p',
      pinned: false,
      lastUsedAt: '',
      missing: false,
      unwritable: false,
      syncFolder: false,
    },
    trust: 'use',
    settings: { memoryEnabled: true, readAgentsFiles: true },
    instructions: '',
    agents: null,
    claude: null,
    memory: '',
    memoryEntries: [
      'Deadline is Friday. (2026-10-01)',
      'The deadline is Friday. (2026-10-20)',
      'Use bullet points. (2026-10-02)',
    ],
    memoryChars: 100,
    memoryConflictCopies: [],
    ...patch,
  }
}

function transportReplying(reply: string) {
  const requests: AgentStreamRequest[] = []
  const transport: AgentTransport = {
    stream: vi.fn((request: AgentStreamRequest, cb) => {
      requests.push(request)
      queueMicrotask(() => {
        cb.onDelta(reply)
        cb.onDone()
      })
      return { cancel: () => undefined }
    }),
  }
  return { transport, requests }
}

function setup(
  reply = '- The deadline is Friday. (2026-10-20)\n- Use bullet points. (2026-10-02)',
) {
  const fake = fakeProjectBridge()
  fake.bridge.getProjectDetail.mockResolvedValue(detail() as never)
  const { transport, requests } = transportReplying(reply)
  return { fake, transport, requests }
}

describe('consolidateProjectMemory', () => {
  it('sends nothing and changes nothing unless the send gate says run', async () => {
    for (const gate of [CONNECT, NOTICE, { kind: 'checking' } as AiSendGate]) {
      const { fake, transport } = setup()
      const result = await consolidateProjectMemory({
        bridge: fake.bridge,
        projectId: 'p1',
        transport,
        gate: () => gate,
      })
      expect(result).toEqual({ status: 'not-ready', gate })
      expect(transport.stream).not.toHaveBeenCalled()
      expect(fake.bridge.getProjectDetail).not.toHaveBeenCalled()
      expect(fake.bridge.applyMemoryConsolidation).not.toHaveBeenCalled()
    }
  })

  it('runs one tool-less request, then backs up and replaces through the bridge', async () => {
    const { fake, transport, requests } = setup()
    const result = await consolidateProjectMemory({
      bridge: fake.bridge,
      projectId: 'p1',
      transport,
      gate: () => RUN,
    })
    expect(transport.stream).toHaveBeenCalledTimes(1)
    expect(requests[0]!.tools).toEqual([])
    expect(requests[0]!.messages[0]).toMatchObject({ role: 'user' })
    const user = requests[0]!.messages[0] as { text: string }
    expect(user.text).toContain('Use bullet points. (2026-10-02)')
    expect(requests[0]!.system).toMatch(/not instructions/i)
    expect(fake.bridge.applyMemoryConsolidation).toHaveBeenCalledWith({
      projectId: 'p1',
      entries: ['The deadline is Friday. (2026-10-20)', 'Use bullet points. (2026-10-02)'],
    })
    expect(result).toEqual({
      status: 'ok',
      before: 3,
      after: 2,
      backupName: 'memory.20261029-101010.bak.md',
    })
  })

  it('does not send memory the person has not trusted', async () => {
    const { fake, transport } = setup()
    fake.bridge.getProjectDetail.mockResolvedValue(detail({ trust: 'without' }) as never)
    const result = await consolidateProjectMemory({
      bridge: fake.bridge,
      projectId: 'p1',
      transport,
      gate: () => RUN,
    })
    expect(result).toEqual({ status: 'without' })
    expect(transport.stream).not.toHaveBeenCalled()
  })

  it('has nothing to do for an empty memory', async () => {
    const { fake, transport } = setup()
    fake.bridge.getProjectDetail.mockResolvedValue(detail({ memoryEntries: [] }) as never)
    const result = await consolidateProjectMemory({
      bridge: fake.bridge,
      projectId: 'p1',
      transport,
      gate: () => RUN,
    })
    expect(result).toEqual({ status: 'nothing' })
    expect(transport.stream).not.toHaveBeenCalled()
  })

  it('keeps the memory when the reply holds no list', async () => {
    const { fake, transport } = setup('Sorry, I cannot help with that.')
    const result = await consolidateProjectMemory({
      bridge: fake.bridge,
      projectId: 'p1',
      transport,
      gate: () => RUN,
    })
    expect(result.status).toBe('failed')
    expect(fake.bridge.applyMemoryConsolidation).not.toHaveBeenCalled()
  })

  it('reports a folder that cannot be written', async () => {
    const { fake, transport } = setup()
    fake.bridge.applyMemoryConsolidation.mockResolvedValueOnce({ status: 'unwritable' } as never)
    const result = await consolidateProjectMemory({
      bridge: fake.bridge,
      projectId: 'p1',
      transport,
      gate: () => RUN,
    })
    expect(result).toEqual({ status: 'unwritable' })
  })

  it('stops without applying when the person stops it', async () => {
    const fake = fakeProjectBridge()
    fake.bridge.getProjectDetail.mockResolvedValue(detail() as never)
    const controller = new AbortController()
    const transport: AgentTransport = {
      stream: (_request, cb) => ({ cancel: () => cb.onDone() }),
    }
    const pending = consolidateProjectMemory({
      bridge: fake.bridge,
      projectId: 'p1',
      transport,
      gate: () => RUN,
      signal: controller.signal,
    })
    await new Promise((r) => setTimeout(r, 0))
    controller.abort()
    expect(await pending).toEqual({ status: 'stopped' })
    expect(fake.bridge.applyMemoryConsolidation).not.toHaveBeenCalled()
  })

  it('is unavailable without a bridge', async () => {
    const { transport } = setup()
    expect(
      await consolidateProjectMemory({
        bridge: null,
        projectId: 'p1',
        transport,
        gate: () => RUN,
      }),
    ).toEqual({ status: 'unavailable' })
  })
})

describe('parseConsolidatedMemory', () => {
  it('reads one entry per list line, drops repeats and blank lines', () => {
    expect(
      parseConsolidatedMemory('Here:\n- a (1)\n* b  (2)\n\n- a (1)\n-   \nnot a line'),
    ).toEqual(['a (1)', 'b (2)'])
  })
})

describe('undoProjectMemoryConsolidation', () => {
  it('restores the backup through the bridge', async () => {
    const fake = fakeProjectBridge()
    expect(
      await undoProjectMemoryConsolidation(fake.bridge, 'p1', 'memory.20261029-101010.bak.md'),
    ).toEqual({ status: 'ok', entries: 3 })
    expect(fake.bridge.undoMemoryConsolidation).toHaveBeenCalledWith({
      projectId: 'p1',
      backupName: 'memory.20261029-101010.bak.md',
    })
  })
})
