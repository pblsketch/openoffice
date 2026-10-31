/**
 * Where the AI panel meets the editor: the dock at the right end of the map
 * (the rail while it is collapsed), its open state, and the `MapAiHost` the
 * panel's tools work through.
 *
 * The host reads and changes the map only through what the app already has:
 * its session, the controllers of the sheets on screen, and its way of showing
 * a sheet. The app passes those in; nothing here keeps a map of its own.
 */
import { useEffect, useMemo, useState } from 'react'
import type { MutableRefObject, ReactElement } from 'react'
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
import type { MindmapAiApi } from '../../shared/ipc'
import type { DocumentSession } from '../document/session'
import type { MapController } from '../map/controller'
import { t as translate, useI18n } from '../i18n/locale'
import type { TemplateDocument } from '@genoffice/ui'
import { AiPanel, type MindmapAiRequest, type MindmapAiRunStart } from './AiPanel'
import type { MapAiHost } from './map-tools'

export type { MindmapAiRequest, MindmapAiRunStart } from './AiPanel'

/** Remembers whether the panel was open, like the other editors (`<app>.showAi`). */
const OPEN_KEY = 'mindmapapp.showAi'

export interface MindmapAiWiring {
  session: DocumentSession | null
  /** the app's controllers, one per sheet that has been shown */
  controllers: MutableRefObject<Map<string, MapController>>
  activeKey: string | null
  setActiveKey(key: string): void
  /** the map's file; null for a map never saved */
  path: string | null
  /** brings the tree in line with every sheet on screen (`flushAll`) */
  flush(): void
}

export interface MindmapAi {
  host: MapAiHost
  open: boolean
  setOpen(open: boolean): void
}

/** The AI's view of the editor, and whether its panel is open. */
export function useMindmapAi(wiring: MindmapAiWiring): MindmapAi {
  const { session, controllers, activeKey, setActiveKey, path, flush } = wiring
  const [open, setOpen] = useState(() => aiPanelInitiallyOpen(OPEN_KEY))
  useEffect(() => rememberAiPanelOpen(OPEN_KEY, open), [open])

  // the shell's AI panel preferences (text size): read once, then followed
  useEffect(() => {
    const api = window.mindmapApi as Partial<MindmapAiApi> | undefined
    void api
      ?.getAiPanelPrefs?.()
      .then(applyAiPanelPrefs)
      .catch(() => {})
    return api?.onAiPanelPrefsChanged?.(applyAiPanelPrefs)
  }, [])

  const host = useMemo<MapAiHost>(
    () => ({
      session: () => session,
      activeSheetKey: () => activeKey,
      controllerOf: (key) => controllers.current.get(key) ?? null,
      showSheet: (key) => {
        // the sheet on screen now: the tree takes what it shows before another one comes up
        controllers.current.get(activeKey ?? '')?.flush()
        setActiveKey(key)
      },
      flush,
      isUntitled: () => path === null,
      newSheetNames: (n) => ({
        title: translate('sheetDefaultName', { n }),
        rootTitle: translate('centralTopic'),
      }),
    }),
    [session, controllers, activeKey, setActiveKey, path, flush],
  )
  return { host, open, setOpen }
}

export interface MindmapAiDockProps {
  ai: MindmapAi
  /** the map's file; null for a map never saved */
  filePath: string | null
  /** a run asked for from outside the panel (a request handed over to this map) */
  request?: MindmapAiRequest | null
  /** a run is starting */
  onRunStart?: (run: MindmapAiRunStart) => void
  /** the map while it can go along as a skill's template (spec 5.7) */
  templateDocument?: TemplateDocument | null
  /** a request handed over by the template flow: show the panel */
  onSkillHandoff?: () => void
  /** the run a create flow handed over ended well: save an untitled map into the project (spec 6) */
  onHandedRunDone?: () => void
}

/**
 * The panel at the right end of the map, or its rail while collapsed; the
 * panel stays mounted either way, so a run and its chat survive. In a split
 * (decision 0036) a secondary pane keeps its panel at the rail, and a click
 * on the rail asks the shell to focus this pane first.
 */
export function MindmapAiDock({
  ai,
  filePath,
  request,
  onRunStart,
  templateDocument,
  onSkillHandoff,
  onHandedRunDone,
}: MindmapAiDockProps): ReactElement {
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
      <AiPanel
        host={ai.host}
        filePath={filePath}
        request={request}
        onRunStart={onRunStart}
        onCollapse={() => ai.setOpen(false)}
        templateDocument={templateDocument}
        onSkillHandoff={onSkillHandoff}
        onHandedRunDone={onHandedRunDone}
      />
    </div>
  )
}
