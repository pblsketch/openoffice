/**
 * A small MCP server over standard input and output, started by the tests of
 * `src/main/mcp-client/local.ts` with this Node binary. Its tools report what
 * the server sees (arguments, environment, working folder, the client's
 * capabilities) and let a test crash it, slow it down, or change its list.
 *
 * `--fail-start` makes it exit before answering anything; `--chatty` makes it
 * write many standard-error lines first.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  CreateMessageResultSchema,
  ElicitResultSchema,
  ListRootsResultSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const argv = process.argv.slice(2)

if (argv.includes('--fail-start')) {
  process.stderr.write('could not start: token=start-secret-value\n')
  process.exit(3)
}
process.stderr.write('booting with stderr-secret-value\n')
if (argv.includes('--chatty')) {
  for (let i = 0; i < 40; i++) process.stderr.write(`chatty line ${i}\n`)
}

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
})

const baseTools = [
  { name: 'echo_args', description: 'The arguments the server was started with' },
  { name: 'env', description: 'The environment the server sees' },
  { name: 'cwd', description: 'The working folder and what is in it' },
  { name: 'pid', description: 'The process id' },
  { name: 'caps', description: 'The capabilities the client declared' },
  { name: 'ask_client', description: 'Ask the client for sampling, roots and elicitation' },
  { name: 'crash', description: 'Exit at once' },
  { name: 'slow', description: 'Answer after a while' },
  { name: 'spawn_grandchild', description: 'Start a process of its own' },
  { name: 'add_tool', description: 'Add a tool and say the list changed' },
]
const tools = baseTools.map((tool) => ({
  ...tool,
  inputSchema: { type: 'object', properties: {} },
  annotations: tool.name === 'pid' ? { readOnlyHint: true } : undefined,
}))

const server = new Server(
  { name: 'fixture', version: '1.0.0' },
  {
    capabilities: { tools: { listChanged: true } },
    instructions: 'Fixture server instructions.',
  },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

async function refusal(request, schema) {
  try {
    await server.request(request, schema, { timeout: 5_000 })
    return 'answered'
  } catch (error) {
    return { code: error?.code ?? null }
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {}
  switch (request.params.name) {
    case 'echo_args':
      return text(argv)
    case 'env':
      return text(process.env)
    case 'cwd':
      return text({ cwd: process.cwd(), entries: readdirSync(process.cwd()) })
    case 'pid':
      return text(String(process.pid))
    case 'caps':
      return text(server.getClientCapabilities() ?? null)
    case 'ask_client':
      return text({
        sampling: await refusal(
          {
            method: 'sampling/createMessage',
            params: { messages: [], maxTokens: 10 },
          },
          CreateMessageResultSchema,
        ),
        roots: await refusal({ method: 'roots/list', params: {} }, ListRootsResultSchema),
        elicitation: await refusal(
          {
            method: 'elicitation/create',
            params: { message: 'name?', requestedSchema: { type: 'object', properties: {} } },
          },
          ElicitResultSchema,
        ),
      })
    case 'crash':
      process.exit(1)
      return text('unreachable')
    case 'slow':
      await new Promise((resolve) => setTimeout(resolve, Number(args.ms ?? 5_000)))
      return text('done')
    case 'spawn_grandchild': {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      })
      return text(String(child.pid))
    }
    case 'add_tool':
      if (!tools.some((tool) => tool.name === 'added')) {
        tools.push({
          name: 'added',
          description: 'Added later',
          inputSchema: { type: 'object', properties: {} },
        })
      }
      await server.sendToolListChanged()
      return text('added')
    default:
      return { content: [{ type: 'text', text: 'no such tool' }], isError: true }
  }
})

await server.connect(new StdioServerTransport())
