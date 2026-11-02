// Shared tool table for the exploratory user-MCP test servers.
// The table is read from a state file on every tools/list, so a spec can
// change a description or add a tool while the server runs; the server then
// sends notifications/tools/list_changed like a real server would.
import { readFileSync, existsSync, appendFileSync, watchFile } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

export function readState(stateFile) {
  if (!stateFile || !existsSync(stateFile)) return {}
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    return {}
  }
}

export function toolsOf(state) {
  const tools = [
    {
      name: 'lookup_word',
      description: `Look up a word in the test dictionary.${state.descSuffix ?? ''}`,
      inputSchema: {
        type: 'object',
        properties: { word: { type: 'string', description: 'The word to look up' } },
        required: ['word'],
      },
      annotations: { readOnlyHint: true, title: 'Look up a word' },
    },
    {
      name: 'save_note',
      description: 'Save a short note on the test server.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
  ]
  if (state.extraTool) {
    tools.push({
      name: 'count_letters',
      description: 'Count the letters in a text.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      annotations: { readOnlyHint: true },
    })
  }
  if (state.longTool) {
    tools.push({
      name: 'a_tool_name_that_is_far_too_long_to_fit_the_sixty_four_limit',
      description: 'A tool with a very long name.',
      inputSchema: { type: 'object', properties: {} },
    })
  }
  return tools
}

export function makeServer({ label, stateFile, logFile }) {
  const log = (line) => {
    if (logFile) appendFileSync(logFile, `${new Date().toISOString()} [${label}] ${line}\n`)
  }
  const state = readState(stateFile)
  const server = new Server(
    { name: `${label}-test-server`, version: '1.0.0' },
    {
      capabilities: { tools: { listChanged: true } },
      instructions:
        state.instructions ??
        `This is the ${label} test server. Use lookup_word for word meanings.`,
    },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('tools/list')
    return { tools: toolsOf(readState(stateFile)) }
  })
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    log(`tools/call ${request.params.name} ${JSON.stringify(request.params.arguments ?? {})}`)
    const args = request.params.arguments ?? {}
    switch (request.params.name) {
      case 'lookup_word':
        return { content: [{ type: 'text', text: `${args.word}: a word in the test dictionary.` }] }
      case 'save_note':
        return { content: [{ type: 'text', text: `Saved: ${args.text}` }] }
      case 'count_letters':
        return { content: [{ type: 'text', text: String(String(args.text ?? '').length) }] }
      default:
        return { content: [{ type: 'text', text: 'unknown tool' }], isError: true }
    }
  })
  return { server, log }
}

/** Call `onChange` whenever the state file changes (polling: works on every disk). */
export function watchState(stateFile, onChange) {
  if (!stateFile) return
  watchFile(stateFile, { interval: 300 }, () => onChange())
}
