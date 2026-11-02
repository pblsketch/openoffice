// "My PC" test server: stdio. Args: <stateFile> <logFile>
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { makeServer, watchState } from './tools.mjs'

const [stateFile, logFile] = process.argv.slice(2)
const { server, log } = makeServer({ label: 'stdio', stateFile, logFile })
log(`start pid=${process.pid} env TEST_TOKEN=${process.env.TEST_TOKEN ? 'set' : 'unset'}`)
watchState(stateFile, () => {
  log('state changed: sending tools/list_changed')
  void server.sendToolListChanged().catch(() => {})
})
process.stderr.write('stdio test server ready\n')
await server.connect(new StdioServerTransport())
process.stdin.on('end', () => {
  log('stdin closed, exiting')
  process.exit(0)
})
