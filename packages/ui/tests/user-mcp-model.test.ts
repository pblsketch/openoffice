import { describe, expect, it } from 'vitest'
import type { McpServerView } from '@genoffice/agent-core'
import {
  MCP_DESCRIPTION_PREVIEW_CHARS,
  MCP_INPUT_PREVIEW_CHARS,
  mcpDescriptionPreview,
  mcpInputPreview,
  mcpInputText,
  mcpServerAction,
  mcpServerButtonVisible,
  mcpServerStatusText,
} from '../src/user-mcp-model'

const server = (over: Partial<McpServerView> & { name: string }): McpServerView => ({
  status: 'connected',
  newToolCount: 0,
  keepResultsInside: true,
  instructions: null,
  tools: [],
  ...over,
})

describe('mcpInputText', () => {
  it('shows the input as indented JSON, and nothing for an empty input', () => {
    expect(mcpInputText({ q: 'cats', n: 2 })).toBe('{\n  "q": "cats",\n  "n": 2\n}')
    expect(mcpInputText({})).toBe('')
  })

  it('does not throw on an input JSON cannot write', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(typeof mcpInputText(loop)).toBe('string')
  })
})

describe('mcpInputPreview', () => {
  it('keeps a short input whole', () => {
    expect(mcpInputPreview('abc', false)).toEqual({ text: 'abc', more: false })
  })

  it('cuts at 2,000 characters until the person asks for more', () => {
    const long = 'x'.repeat(MCP_INPUT_PREVIEW_CHARS + 5)
    const cut = mcpInputPreview(long, false)
    expect(MCP_INPUT_PREVIEW_CHARS).toBe(2000)
    expect(cut.more).toBe(true)
    expect(cut.text.startsWith('x'.repeat(MCP_INPUT_PREVIEW_CHARS))).toBe(true)
    expect([...cut.text.replace(/…$/, '')].length).toBe(MCP_INPUT_PREVIEW_CHARS)
    expect(mcpInputPreview(long, true)).toEqual({ text: long, more: false })
  })

  it('counts characters, not halves of one', () => {
    const long = '😀'.repeat(MCP_INPUT_PREVIEW_CHARS + 1)
    const cut = mcpInputPreview(long, false)
    expect([...cut.text.replace(/…$/, '')]).toHaveLength(MCP_INPUT_PREVIEW_CHARS)
    expect(cut.text).not.toMatch(/[\uD800-\uDBFF]…?$/)
  })
})

describe('mcpServerStatusText', () => {
  it('says each status in plain words (spec 12.2)', () => {
    const ko = (over: Partial<McpServerView>) =>
      mcpServerStatusText('ko', server({ name: 's', ...over }))
    expect(ko({ status: 'connected' })).toBe('연결됨')
    expect(ko({ status: 'connecting' })).toBe('연결 중')
    expect(ko({ status: 'failed' })).toBe('연결 못 함')
    expect(ko({ status: 'login-required' })).toBe('다시 로그인 필요')
    expect(ko({ status: 'review-required' })).toBe('확인 필요')
    expect(ko({ status: 'disabled' })).toBe('꺼짐')
    // never "connected" before the app reached it (B1)
    expect(ko({ status: 'unchecked' })).toBe('확인 전')
    expect(ko({ status: 'ready' })).toBe('준비됨')
  })

  it('says a server turned off for this conversation is off here, not connected (P8)', () => {
    expect(mcpServerStatusText('ko', server({ name: 's' }), true)).toBe('이 대화에서 끔')
    // off in Settings stays "off"
    expect(mcpServerStatusText('ko', server({ name: 's', status: 'disabled' }), true)).toBe('꺼짐')
  })

  it('adds the reason of a failure', () => {
    const reason = (failReason: McpServerView['failReason']) =>
      mcpServerStatusText('ko', server({ name: 's', status: 'failed', failReason }))
    expect(reason('unreachable')).toBe('연결 못 함 · 서버에 닿지 못함')
    expect(reason('runtime-missing')).toBe('연결 못 함 · 실행 환경 없음')
    expect(reason('start-failed')).toBe('연결 못 함 · 시작 실패')
    expect(reason('refused-redirect')).toBe('연결 못 함 · 다른 주소로 넘기려 해 막음')
    expect(reason('insecure-address')).toBe('연결 못 함 · 안전하지 않은 주소')
    expect(reason('http-error')).toBe('연결 못 함 · 서버가 오류로 답함')
  })
})

describe('mcpServerAction', () => {
  it('offers the action that fits the status', () => {
    const action = (status: McpServerView['status']) =>
      mcpServerAction(server({ name: 's', status }))
    expect(action('login-required')).toBe('login')
    expect(action('review-required')).toBe('review')
    expect(action('failed')).toBe('retry')
    expect(action('connected')).toBeNull()
    expect(action('connecting')).toBeNull()
    expect(action('ready')).toBeNull()
    // never checked: go check it in Settings (B1); off in Settings: turn it on there (P8)
    expect(action('unchecked')).toBe('check')
    expect(action('disabled')).toBe('enable')
  })
})

describe('mcpDescriptionPreview', () => {
  it('shows the start of a long description until the person asks for more (P10)', () => {
    expect(mcpDescriptionPreview('  Saves a note.  ', false)).toEqual({
      text: 'Saves a note.',
      more: false,
    })
    const long = 'y'.repeat(MCP_DESCRIPTION_PREVIEW_CHARS + 3)
    const cut = mcpDescriptionPreview(long, false)
    expect(cut.more).toBe(true)
    expect([...cut.text.replace(/…$/, '')]).toHaveLength(MCP_DESCRIPTION_PREVIEW_CHARS)
    expect(mcpDescriptionPreview(long, true)).toEqual({ text: long, more: false })
  })
})

describe('mcpServerButtonVisible', () => {
  it('shows the button only when a server is on in Settings', () => {
    expect(mcpServerButtonVisible([])).toBe(false)
    expect(mcpServerButtonVisible([server({ name: 'a', status: 'disabled' })])).toBe(false)
    expect(
      mcpServerButtonVisible([
        server({ name: 'a', status: 'disabled' }),
        server({ name: 'b', status: 'failed' }),
      ]),
    ).toBe(true)
  })
})
