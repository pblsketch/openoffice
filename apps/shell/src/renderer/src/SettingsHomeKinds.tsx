import { useEffect, useState } from 'react'
import {
  HOME_KINDS,
  defaultHomeKinds,
  moveHomeKind,
  setHomeKindHidden,
  type HomeKind,
  type HomeKindsApi,
  type HomeKindsSettings,
} from '../../shared/home-kinds'
import { homeKindsText } from './i18n/strings-home-kinds'
import { useI18n, type StringKey } from './locale'

declare global {
  interface Window {
    /** which new-document entries home lists (src/preload/index.ts) */
    aiOfficeHomeKinds?: HomeKindsApi
  }
}

/** the name home's card shows, and the extension under it */
export const HOME_KIND_LABEL: Record<HomeKind, { title: StringKey; sub?: string }> = {
  docx: { title: 'newDoc', sub: '.docx' },
  xlsx: { title: 'newSheet', sub: '.xlsx' },
  pptx: { title: 'newSlide', sub: '.pptx' },
  md: { title: 'newMarkdown', sub: '.md' },
  html: { title: 'newHtml', sub: '.html' },
  xmind: { title: 'newMindmap', sub: '.xmind' },
  drawio: { title: 'newDiagram', sub: '.drawio' },
  hwp: { title: 'newHwp', sub: '.hwp' },
  pdf: { title: 'newPdf', sub: '.pdf' },
  pdfTools: { title: 'pdfToolsCard' },
}

/** the stored value, kept current when Settings (or another window) changes it */
export function useHomeKinds(): [HomeKindsSettings, (next: HomeKindsSettings) => void] {
  const [settings, setSettings] = useState<HomeKindsSettings>(defaultHomeKinds)

  useEffect(() => {
    const api = window.aiOfficeHomeKinds
    if (!api) return
    let alive = true
    const off = api.onChanged((next) => {
      if (alive) setSettings(next)
    })
    void api
      .get()
      .then((next) => {
        if (alive) setSettings(next)
      })
      .catch(() => undefined)
    return () => {
      alive = false
      off()
    }
  }, [])

  const update = (next: HomeKindsSettings) => {
    setSettings(next)
    void window.aiOfficeHomeKinds
      ?.set(next)
      .then(setSettings)
      .catch(() => undefined)
  }
  return [settings, update]
}

export function HomeKindsField() {
  const { lang, t } = useI18n()
  const [settings, update] = useHomeKinds()
  const isFirstOrder = settings.order.every((kind, index) => kind === HOME_KINDS[index])

  return (
    <div className="set-field set-field-top set-home-kinds" data-testid="home-kinds">
      <div className="set-field-stack set-home-kinds-body">
        <div className="set-home-kinds-head">
          <div className="set-field-stack">
            <div className="set-field-label">{homeKindsText(lang, 'setHomeKinds')}</div>
            <div className="set-field-desc">{homeKindsText(lang, 'setHomeKindsDesc')}</div>
          </div>
          <button
            className="set-btn"
            disabled={isFirstOrder}
            onClick={() => update({ order: [...HOME_KINDS], hidden: [...settings.hidden] })}
          >
            {homeKindsText(lang, 'homeKindsReset')}
          </button>
        </div>
        <ul className="set-home-kinds-list">
          {settings.order.map((kind, index) => {
            const label = HOME_KIND_LABEL[kind]
            const name = t(label.title)
            const shown = !settings.hidden.includes(kind)
            return (
              <li key={kind} className="set-home-kind" data-kind={kind}>
                <span className={`set-home-kind-name${shown ? '' : ' off'}`}>
                  {name}
                  {label.sub && <span className="set-home-kind-sub">{label.sub}</span>}
                </span>
                <button
                  className="set-home-kind-move"
                  disabled={index === 0}
                  aria-label={homeKindsText(lang, 'homeKindUp', { name })}
                  data-tip={homeKindsText(lang, 'homeKindUp', { name })}
                  onClick={() => update(moveHomeKind(settings, kind, -1))}
                >
                  ↑
                </button>
                <button
                  className="set-home-kind-move"
                  disabled={index === settings.order.length - 1}
                  aria-label={homeKindsText(lang, 'homeKindDown', { name })}
                  data-tip={homeKindsText(lang, 'homeKindDown', { name })}
                  onClick={() => update(moveHomeKind(settings, kind, 1))}
                >
                  ↓
                </button>
                <button
                  className="set-switch"
                  role="switch"
                  aria-checked={shown}
                  aria-label={name}
                  onClick={() => update(setHomeKindHidden(settings, kind, shown))}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
