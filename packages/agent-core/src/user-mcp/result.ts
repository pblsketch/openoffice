/**
 * What of an MCP tool result reaches the AI (user MCP spec 5.5).
 *
 * Only `content` text blocks and `structuredContent` (as JSON text) go on;
 * every other block (pictures, audio, embedded resources, links) is counted
 * in one line instead. `isError` stays a tool error. A result longer than the
 * limit keeps its start and a note that it was cut.
 *
 * A file with no imports, exported as `@genoffice/agent-core/user-mcp/result`
 * for the main process that makes the calls.
 */

/** Longest result passed to the AI, in characters; a tunable default */
export const MCP_RESULT_MAX_CHARS = 200_000

export interface ShapedMcpResult {
  output: string
  isError: boolean
}

export const MCP_RESULT_UNREADABLE = 'The server returned a result this app could not read.'
export const MCP_RESULT_EMPTY = '(The tool returned no content.)'
export const MCP_ERROR_EMPTY = '(The tool reported an error without a message.)'

const nonTextLine = (n: number) =>
  n === 1 ? '[1 non-text item was not passed on.]' : `[${n} non-text items were not passed on.]`

/** The same JSON value, whatever its spacing; null when the text is not JSON */
function canonicalJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return null
  }
}

function cut(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output
  let end = Math.max(0, maxChars)
  // do not leave half of a surrogate pair at the end
  const last = output.charCodeAt(end - 1)
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1
  return (
    `${output.slice(0, end)}\n\n[The result was cut because it was long: ` +
    `the first ${end} of ${output.length} characters are shown.]`
  )
}

/** Turn an MCP CallToolResult (as received, unchecked) into the tool output the AI gets */
export function shapeMcpResult(
  result: unknown,
  maxChars: number = MCP_RESULT_MAX_CHARS,
): ShapedMcpResult {
  if (result === null || typeof result !== 'object') {
    return { output: MCP_RESULT_UNREADABLE, isError: true }
  }
  const { content, structuredContent, isError } = result as Record<string, unknown>
  if (content !== undefined && !Array.isArray(content)) {
    return { output: MCP_RESULT_UNREADABLE, isError: true }
  }
  const failed = isError === true
  const texts: string[] = []
  let skipped = 0
  for (const block of (content ?? []) as unknown[]) {
    const b = block as { type?: unknown; text?: unknown } | null
    if (b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string') {
      texts.push(b.text)
    } else skipped += 1
  }
  if (structuredContent !== undefined && structuredContent !== null) {
    let json: string | null = null
    try {
      json = JSON.stringify(structuredContent) ?? null
    } catch {
      json = null
    }
    // servers often repeat the structured value as a text block; send it once
    if (json !== null && !texts.some((t) => canonicalJson(t) === json)) texts.push(json)
  }
  const parts = skipped > 0 ? [...texts, nonTextLine(skipped)] : texts
  const output = parts.join('\n\n')
  if (output.length === 0) {
    return { output: failed ? MCP_ERROR_EMPTY : MCP_RESULT_EMPTY, isError: failed }
  }
  return { output: cut(output, maxChars), isError: failed }
}
