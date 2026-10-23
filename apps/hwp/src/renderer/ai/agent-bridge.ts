import type { RhwpEditor } from '@rhwp/editor'
import { AGENT_PLUGIN_ID } from '../../../studio-plugin/agent-plugin.mjs'
import type { AgentPluginSurface } from '../../../studio-plugin/agent-plugin.mjs'

/**
 * The app's plugin inside the editor (studio-plugin/agent-plugin.mjs), as the
 * AI panel calls it: the same methods, each one a message to the editor frame.
 */
export type AgentBridge = {
  [K in keyof AgentPluginSurface]: (
    ...args: Parameters<AgentPluginSurface[K]>
  ) => Promise<ReturnType<AgentPluginSurface[K]>>
}

/** The part of the editor the bridge needs. */
export type AgentBridgeEditor = Pick<RhwpEditor, 'plugins'>

const METHODS = [
  'foreignChanges',
  'readText',
  'findText',
  'replaceText',
  'replaceAllText',
  'insertParagraphs',
  'deleteParagraph',
  'insertTable',
  'formatText',
  'formatParagraph',
  'listTables',
  'readTable',
  'fillCells',
  'addTableLines',
  'removeTableLines',
  'deleteTable',
  'installFileMenu',
  'reveal',
  'selection',
  'replaceSelection',
  'formatSelection',
  'listFields',
  'fillField',
  'insertToc',
  'refreshToc',
  'listNotes',
  'insertNote',
  'editNote',
  'deleteNote',
  'measureTabs',
  'clearMarks',
  'listStyles',
  'readStyle',
  'createStyle',
  'editStyle',
  'printPages',
  'formatCells',
  'mergeCells',
  'splitCell',
  'undo',
] as const satisfies readonly (keyof AgentPluginSurface)[]

export function createAgentBridge(getEditor: () => AgentBridgeEditor | null): AgentBridge {
  // the plugin is loaded on first use, once per editor
  let loaded: { editor: AgentBridgeEditor; ready: Promise<unknown> } | null = null

  const invoke = async (method: string, args: unknown[]): Promise<unknown> => {
    const editor = getEditor()
    if (!editor) throw new Error('the editor is not ready')
    if (loaded?.editor !== editor) {
      const entry = { editor, ready: editor.plugins.load(AGENT_PLUGIN_ID) }
      loaded = entry
      // a failed load is tried again by the next call
      entry.ready.catch(() => {
        if (loaded === entry) loaded = null
      })
    }
    await loaded.ready
    return editor.plugins.invoke(AGENT_PLUGIN_ID, method, args)
  }

  const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const method of METHODS) bridge[method] = (...args) => invoke(method, args)
  return bridge as AgentBridge
}
