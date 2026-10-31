/**
 * The AI panel's dock at the right end of the editor: the panel, or its rail
 * while collapsed. This editor has no ribbon, so the rail is the only way in.
 *
 * In a split the shell gives this view's pane a role (decision 0036): only the
 * focus pane shows the panel, while a secondary pane keeps it folded to the
 * rail. A click on the rail asks the shell to focus this pane and remembers
 * the panel as open, so it appears once focus arrives. The panel itself stays
 * mounted while collapsed, so a run and its chat survive.
 *
 * The memo panel is not in this dock: it has its own column beside the document
 * (MemoSide.tsx), so the two can be out at once, as the PDF editor's notes are.
 */
import type { ReactElement } from 'react'
import {
  AiMark,
  aiSubscriptionText,
  effectiveAiPanelOpen,
  onAiRailClick,
  useSplitPaneRole,
} from '@genoffice/ui'
import type { TemplateDocument } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import type { AgentBridge } from './agent-bridge'
import { AiPanel } from './AiPanel'

export interface HwpAiDockProps {
  /** whether the user wants the panel out (a secondary pane still folds it) */
  open: boolean
  setOpen(open: boolean): void
  /** the document operations of the open editor */
  bridge: AgentBridge
  /** the file of the open document: the conversation is kept with it */
  filePath: string | null
  /** the document while it can go along as a skill's template (spec 5.7) */
  templateDocument?: TemplateDocument | null
  /** a request handed over by the check panel: fills the input box, not sent */
  prefill?: { text: string; nonce: number } | null
}

/** The panel at the right end, or its rail while collapsed; the panel stays mounted either way. */
export function HwpAiDock({
  open,
  setOpen,
  bridge,
  filePath,
  templateDocument,
  prefill,
}: HwpAiDockProps): ReactElement {
  const { lang, t } = useI18n()
  const { role, requestFocus } = useSplitPaneRole()
  const shown = effectiveAiPanelOpen(open, role)
  return (
    <div className={`ai-dock${shown ? '' : ' collapsed'}`}>
      {!shown && (
        <button
          type="button"
          className="ai-rail ai-entry"
          data-tip={t('aiOpenAssistant')}
          aria-label={aiSubscriptionText(lang, 'aiAssistant')}
          onClick={() => onAiRailClick(role, open, setOpen, requestFocus)}
        >
          <AiMark size={22} />
        </button>
      )}
      <AiPanel
        bridge={bridge}
        filePath={filePath}
        onCollapse={() => setOpen(false)}
        templateDocument={templateDocument}
        prefill={prefill ?? null}
        onSkillHandoff={() => setOpen(true)}
      />
    </div>
  )
}
