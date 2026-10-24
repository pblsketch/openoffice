import { randomBytes } from 'node:crypto'
import {
  AGENT_APP_MCP_TOOLS,
  comparablePath,
  isInsidePath,
} from '@genoffice/ai-provider/agent-session'
import { redactHtmlSource, redactMarkdownSource } from '@genoffice/file-parse'
import { z } from 'zod'
import { McpServerService, type McpToolDefinition } from '../mcp/mcp-server'
import { createDocumentTools, type DocsControl } from '../mcp/tools/document-tools'
import { createHwpTools } from '../mcp/tools/hwp-tools'
import {
  createOpenDocumentTools,
  type OpenDocumentsControl,
} from '../mcp/tools/open-documents-tools'
import { createPdfTools } from '../mcp/tools/pdf-tools'
import { createSessionHost, type TargetResolver } from '../mcp/tools/session-tools'
import { createSheetsTools, type SheetsControl } from '../mcp/tools/sheets-tools'
import { createSlidesTools, type SlidesControl } from '../mcp/tools/slides-tools'
import type { AgentOpenTab } from './agent-skills'

/**
 * The app's own MCP server as an agent session sees it (decision 0032).
 *
 * One server per session: loopback, a port the system picks, and a fresh token
 * the program must send with every request. It is not the server the person
 * turns on under Integrations, and it runs whether or not that one is on.
 *
 * The tools are the existing open-document tools, narrowed:
 * - reading and editing documents open in tabs, through the editors' own
 *   executors, so changes show in the editor and can be undone;
 * - no tab closing, no editing session of its own, no headless file creation
 *   (the program writes files in the project folder itself);
 * - withheld words read as their `{{label}}` (decision 0016's rule, applied to
 *   this path): a deck through the bridge's withholding readout, Markdown and
 *   HTML through the same functions the cross-file reads use. A deck that
 *   withholds anything is not edited here, so a marker can never be written
 *   over the words it stands for. Word documents carry no mark this app
 *   recognises (a known gap, findings);
 * - `read_hwp` and `read_pdf` only inside the project folder;
 * - `propose_skill` and `propose_skill_install` (spec 6.3, 6.4) only show a
 *   card or an install proposal in the agent window: they never write a file
 *   and never install; the person's click in the window does.
 */

/** The 13 tools; the programs' start checks hold a session to the same list */
export const AGENT_MCP_TOOL_NAMES = AGENT_APP_MCP_TOOLS

/** What `propose_skill` hands to the agent window (spec 5.6, 6.3) */
export interface AgentSkillProposalInput {
  title: string
  name: string
  description: string
  body: string
  wantsTemplate: boolean
  targetId: string
  /** a document the model thinks should be the template: a project file or an open tab's path */
  suggestedTemplatePath: string
}

/**
 * The agent window's side of the two skill tools. Each shows something to the
 * person and returns; a refusal throws with words for the model.
 */
export interface AgentSkillToolHooks {
  /** `openTabs`: the documents open in tabs now, the card's first template candidates */
  proposeSkill(
    input: AgentSkillProposalInput,
    context: { openTabs(): Promise<AgentOpenTab[]> },
  ): Promise<void>
  proposeInstall(address: string): Promise<void>
}

const PROPOSE_SKILL_DESCRIPTION =
  'Show the person a card in the agent window with a skill to save: a new skill, or a change ' +
  'to an existing one (give targetId). This tool never saves anything; the person checks the ' +
  'card and presses Save. When you make a skill from the work, keep what would repeat: the ' +
  'order of steps, the rules, the tone and wording, the checks before finishing. Leave out ' +
  'values used only once (names of people, dates, this particular content): list them in the ' +
  'body as values given each time instead. Write the body as instructions to an assistant, in ' +
  'the language of the conversation. Set wantsTemplate when a finished document should be kept ' +
  'as a template to fill in next time, and name it in suggestedTemplatePath (a file of the ' +
  'project folder or a document open in the app); the person picks the template on the card.'

const PROPOSE_INSTALL_DESCRIPTION =
  'Propose installing a skill from GitHub. The app shows the person the address; they open a ' +
  'preview of what the skill holds and decide whether to install it. This tool installs ' +
  'nothing and only reports that the proposal was shown. Never install skills any other way ' +
  '(no `npx skills add`). A skill installed this way is available from the next session.'

const CARD_SHOWN =
  'The skill card is shown to the person in the agent window. Nothing is saved until they ' +
  'press Save on it, so it is not saved yet. Tell them briefly what the card holds and that ' +
  'they can change it before saving.'

const PREVIEW_SHOWN =
  'The install proposal is shown to the person in the agent window. Nothing is installed ' +
  'unless they open the preview and press Install there. A skill installed this way is ' +
  'available from the next session, not in this one.'

const NO_WINDOW: AgentSkillToolHooks = {
  proposeSkill: async () => {
    throw new Error('Skill cards are not available in this session.')
  },
  proposeInstall: async () => {
    throw new Error('Skill install proposals are not available in this session.')
  },
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/** The two skill tools; they show and return, and never write a file */
export function createAgentSkillTools(
  hooks: AgentSkillToolHooks = NO_WINDOW,
  openTabs: () => Promise<AgentOpenTab[]> = async () => [],
): McpToolDefinition[] {
  return [
    {
      name: 'propose_skill',
      description: PROPOSE_SKILL_DESCRIPTION,
      inputSchema: {
        title: z.string().describe('short title shown to the person'),
        name: z
          .string()
          .optional()
          .describe(
            'English name: lowercase letters, digits and hyphens, 1-64 characters, e.g. meeting-minutes',
          ),
        description: z
          .string()
          .describe('one or two sentences: what the skill does and when to use it'),
        body: z.string().describe('the instructions (Markdown)'),
        wantsTemplate: z
          .boolean()
          .optional()
          .describe('keep a finished document as the skill template'),
        targetId: z
          .string()
          .optional()
          .describe(
            'the existing skill to change: its name as listed in this session (e.g. meeting-minutes or meeting-minutes--builtin) or its id (e.g. app:meeting-minutes); leave out for a new skill',
          ),
        suggestedTemplatePath: z
          .string()
          .optional()
          .describe('the document to keep as the template: a project file or an open document'),
      },
      handler: async (args) => {
        const input: AgentSkillProposalInput = {
          title: text(args.title, 500).trim(),
          name: text(args.name, 200).trim(),
          description: text(args.description, 5_000).trim(),
          body: text(args.body, 200_000),
          wantsTemplate: args.wantsTemplate === true,
          targetId: text(args.targetId, 512).trim(),
          suggestedTemplatePath: text(args.suggestedTemplatePath, 4_096).trim(),
        }
        if (!input.title) throw new Error('title must not be empty')
        if (!input.body.trim()) throw new Error('body must not be empty')
        await hooks.proposeSkill(input, { openTabs })
        return `Skill card shown: ${JSON.stringify(input.title)}\n${CARD_SHOWN}`
      },
    },
    {
      name: 'propose_skill_install',
      description: PROPOSE_INSTALL_DESCRIPTION,
      inputSchema: {
        address: z
          .string()
          .describe(
            'a GitHub address of the skill (https://github.com/owner/repo/tree/branch/path) or owner/repo@skill',
          ),
      },
      handler: async (args) => {
        const address = text(args.address, 2_048).trim()
        if (!address) throw new Error('address must not be empty')
        await hooks.proposeInstall(address)
        return PREVIEW_SHOWN
      },
    },
  ]
}

export interface AgentMcpDeps {
  version: string
  defaultSaveDir: () => string
  docsControl?: DocsControl | undefined
  slidesControl?: SlidesControl | undefined
  sheetsControl?: SheetsControl | undefined
  openDocumentsControl?: OpenDocumentsControl | undefined
  resolveTarget?: TargetResolver | undefined
  /** the agent window's skill card and install proposal; absent, the two tools refuse */
  skillTools?: AgentSkillToolHooks | undefined
}

const WITHHELD_DECK =
  'This presentation withholds some of its content from AI. It cannot be edited from an agent session; ask the person to edit it in the app instead.'

/** Slides that read withheld words as labels and are not edited while they withhold anything */
export function withholdingSlides(control: SlidesControl): SlidesControl {
  return {
    ...control,
    readDeck: (wcId) => control.readDeck(wcId, { withhold: true }),
    runTxn: async (wcId, request) => {
      // without a way to tell, the deck is taken to withhold something
      const withholds = control.deckWithholds ? await control.deckWithholds(wcId) : true
      if (withholds) throw new Error(WITHHELD_DECK)
      return control.runTxn(wcId, request)
    },
  }
}

/** Open documents read with their withheld words as labels, and never closed */
export function withholdingOpenDocuments(control: OpenDocumentsControl): OpenDocumentsControl {
  return {
    list: () => control.list(),
    read: async (tab) => {
      if (tab.kind === 'slides') {
        throw new Error('Read a presentation with read_deck, passing its id or path as `document`.')
      }
      const content = await control.read(tab)
      if (tab.kind === 'markdown') return redactMarkdownSource(String(content))
      if (tab.kind === 'html') return redactHtmlSource(String(content))
      return content
    },
    close: async () => {
      throw new Error('Closing documents is not available in an agent session.')
    },
    save: async () => {
      throw new Error('Saving open documents is not available in an agent session.')
    },
  }
}

function insideProject(
  tool: McpToolDefinition,
  projectRoot: string,
  platform: NodeJS.Platform,
): McpToolDefinition {
  return {
    ...tool,
    handler: (args) => {
      const path = typeof args.path === 'string' ? args.path : ''
      const root = comparablePath(projectRoot, projectRoot, platform)
      if (!path || !isInsidePath(comparablePath(path, root, platform), root, platform)) {
        throw new Error('Only files inside the project folder can be read here.')
      }
      return tool.handler(args)
    },
  }
}

export function buildAgentMcpTools(
  deps: AgentMcpDeps,
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
): McpToolDefinition[] {
  const host = createSessionHost()
  const resolveTarget = deps.resolveTarget ? { resolveTarget: deps.resolveTarget } : {}
  const all = [
    ...createDocumentTools(
      {
        version: deps.version,
        defaultSaveDir: deps.defaultSaveDir,
        background: false,
        docs: deps.docsControl,
        ...resolveTarget,
      },
      host,
    ),
    ...createSlidesTools(
      {
        defaultSaveDir: deps.defaultSaveDir,
        background: false,
        slides: deps.slidesControl ? withholdingSlides(deps.slidesControl) : undefined,
        ...resolveTarget,
      },
      host,
    ),
    ...createSheetsTools(
      {
        defaultSaveDir: deps.defaultSaveDir,
        background: false,
        sheets: deps.sheetsControl,
        ...resolveTarget,
      },
      host,
    ),
    ...createHwpTools(),
    ...createPdfTools(),
    ...createOpenDocumentTools({
      defaultSaveDir: deps.defaultSaveDir,
      ...(deps.openDocumentsControl
        ? { control: withholdingOpenDocuments(deps.openDocumentsControl) }
        : {}),
    }),
    ...createAgentSkillTools(deps.skillTools, async () => {
      const control = deps.openDocumentsControl
      return control ? await control.list() : []
    }),
  ]
  const wanted = new Set<string>(AGENT_MCP_TOOL_NAMES)
  return all
    .filter((tool) => wanted.has(tool.name))
    .map((tool) =>
      tool.name === 'read_hwp' || tool.name === 'read_pdf'
        ? insideProject(tool, projectRoot, platform)
        : tool,
    )
}

export interface AgentMcpServer {
  url: string
  token: string
  stop(): Promise<void>
}

/** Start one session's server; the caller stops it when the session ends */
export async function startAgentMcpServer(
  deps: AgentMcpDeps,
  projectRoot: string,
): Promise<AgentMcpServer> {
  const token = randomBytes(24).toString('hex')
  const service = new McpServerService({
    port: 0,
    token,
    version: deps.version,
    maxListenAttempts: 1,
    toolsFactory: () => buildAgentMcpTools(deps, projectRoot),
  })
  await service.start(0)
  return {
    url: `${service.getUrl()}/mcp`,
    token,
    stop: () => service.stop(),
  }
}
