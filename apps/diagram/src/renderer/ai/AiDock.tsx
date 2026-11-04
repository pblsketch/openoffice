/**
 * Where the AI panel meets the editor: the dock at the right end of draw.io
 * (the rail while it is collapsed), its open state, and the `DiagramAiHost`
 * the panel's tools work through.
 *
 * The host reaches the diagram only through what the app already has: the
 * draw.io frame client and whether draw.io is up. Reading and changing go
 * through `document/live-ops.ts`, the same executor the in-app MCP server uses.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import {
  AiMark,
  aiPanelInitiallyOpen,
  applyAiPanelPrefs,
  effectiveAiPanelOpen,
  onAiRailClick,
  rememberAiPanelOpen,
  useSplitPaneRole,
} from '@genoffice/ui'
import '@genoffice/ui/ai-model-picker.css'
import '@genoffice/ui/ai-queue-strip.css'
import '@genoffice/ui/ai-usage.css'
import '@genoffice/ui/ai-panel-prefs.css'
import './ai-panel.css'
import type { DiagramAiApi } from '../../shared/ipc'
import type { DrawioFrame } from '../drawio/frame-client'
import { applyLiveOps, liveDiagramRead, undoLiveBatches } from '../document/live-ops'
import { useI18n } from '../i18n/locale'
import { AiPanel } from './AiPanel'
import type { DiagramAiHost } from './diagram-tools'

/** Remembers whether the panel was open, like the other editors (`<app>.showAi`). */
const OPEN_KEY = 'diagramapp.showAi'

export interface DiagramAiWiring {
  /** the draw.io frame client; null before the frame exists */
  client(): DrawioFrame | null
  /** draw.io is up with the diagram (not loading, not failed) */
  ready(): boolean
}

export interface DiagramAi {
  host: DiagramAiHost
  open: boolean
  setOpen(open: boolean): void
}

/** The tools' way into a frame: the one executor of reads and op lists for an open tab. */
export function diagramAiHost(wiring: DiagramAiWiring): DiagramAiHost {
  const frame = (): DrawioFrame => {
    const client = wiring.client()
    if (!client || !wiring.ready()) throw new Error('the diagram editor is not ready')
    return client
  }
  return {
    ready: () => wiring.client() !== null && wiring.ready(),
    read: (page) => liveDiagramRead(frame(), page),
    apply: (ops) => applyLiveOps(frame(), ops),
    undo: (tokens) => undoLiveBatches(frame(), tokens),
  }
}

/** The AI's view of the editor, and whether its panel is open. */
export function useDiagramAi(wiring: DiagramAiWiring): DiagramAi {
  const [open, setOpen] = useState(() => aiPanelInitiallyOpen(OPEN_KEY))
  useEffect(() => rememberAiPanelOpen(OPEN_KEY, open), [open])

  // the shell's AI panel preferences (text size): read once, then followed
  useEffect(() => {
    const api = window.diagramApi as Partial<DiagramAiApi> | undefined
    void api
      ?.getAiPanelPrefs?.()
      .then(applyAiPanelPrefs)
      .catch(() => {})
    return api?.onAiPanelPrefsChanged?.(applyAiPanelPrefs)
  }, [])

  // the wiring reads refs, so one host serves the whole life of the tab
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const host = useMemo(() => diagramAiHost(wiring), [])
  return { host, open, setOpen }
}

export interface DiagramAiDockProps {
  ai: DiagramAi
  /** the diagram's file; null for a diagram never saved */
  filePath: string | null
}

/**
 * The panel at the right end of draw.io, or its rail while collapsed; the
 * panel stays mounted either way, so a run and its chat survive. In a split
 * (decision 0036) a secondary pane keeps its panel at the rail, and a click
 * on the rail asks the shell to focus this pane first.
 */
export function DiagramAiDock({ ai, filePath }: DiagramAiDockProps): ReactElement {
  const { t } = useI18n()
  const { role, requestFocus } = useSplitPaneRole()
  const open = effectiveAiPanelOpen(ai.open, role)
  return (
    <div className={`ai-dock${open ? '' : ' collapsed'}`} data-ai-open={open}>
      {!open && (
        <button
          type="button"
          className="ai-rail"
          data-tip={t('aiOpenAssistant')}
          aria-label={t('aiOpenAssistant')}
          onClick={() => onAiRailClick(role, ai.open, ai.setOpen, requestFocus)}
        >
          <AiMark size={18} />
        </button>
      )}
      <AiPanel host={ai.host} filePath={filePath} onCollapse={() => ai.setOpen(false)} />
    </div>
  )
}
