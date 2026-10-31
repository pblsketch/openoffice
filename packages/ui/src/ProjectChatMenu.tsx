import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { LegacyDocumentChat, ProjectChatListItem, ProjectId } from '@genoffice/project-store'
import { aiModelPopoverStyle } from './AiModelPicker'
import { IconPencil, IconTrash } from './icons'
import { revealInList, useDismissablePopover } from './popover-dismiss'
import {
  projectChatMenuItems,
  projectChatTitle,
  projectEditorLabel,
  projectFullTime,
  projectRelativeTime,
  stepIndex,
  type ProjectChatMenuItem,
} from './project-panel-model'
import { IconCaretDown, IconCheck, IconPlus, IconProjectEditor } from './project-icons'
import { projectPanelText } from './strings-project-panel'
import './project-panel.css'

/** Width of the chat menu popover */
const POPOVER_WIDTH = 320
/** Tallest the chat menu grows before it scrolls */
const POPOVER_MAX_HEIGHT = 460

export interface ProjectChatMenuProps {
  readonly lang: Lang
  /** This project's chats (`ProjectChatListResult.chats`); shown newest first whatever the order */
  readonly chats: readonly ProjectChatListItem[]
  /** The chat open in this panel; null for a new chat not written yet */
  readonly currentChatId: ProjectId | null
  /** The button's text when the open chat is not in `chats` yet (first message sent, list not refreshed) */
  readonly currentTitle?: string | undefined
  /** "Earlier chat of this document" (`ProjectChatListResult.legacy`) */
  readonly legacy?: LegacyDocumentChat | null | undefined
  /** The panel is continuing the earlier document chat */
  readonly legacyActive?: boolean | undefined
  /** Clock for the relative times (tests); defaults to `Date.now()` when the menu opens */
  readonly now?: number | undefined
  readonly disabled?: boolean | undefined
  /** The menu opened; a good moment for the caller to refresh `chats` */
  readonly onOpen?: (() => void) | undefined
  readonly onSelect: (chatId: ProjectId) => void
  readonly onNewChat: () => void
  /** A non-empty, changed title */
  readonly onRename: (chatId: ProjectId, title: string) => void
  /** Moves the chat's files to the OS trash; called only after the row's confirm step */
  readonly onDelete: (chatId: ProjectId) => void
  readonly onSelectLegacy?: (() => void) | undefined
}

/** DOM id of a row, for the search field's aria-activedescendant */
export function projectChatOptionId(listId: string, index: number): string {
  return `${listId}-opt-${index}`
}

function initialIndex(
  items: readonly ProjectChatMenuItem[],
  currentChatId: ProjectId | null,
  legacyActive: boolean,
): number {
  const index = items.findIndex((item) =>
    legacyActive
      ? item.kind === 'legacy'
      : item.kind === 'chat' && currentChatId !== null && item.chat.id === currentChatId,
  )
  return index >= 0 ? index : 0
}

/**
 * The panel header's `[chat title ▾]` for a panel with a project chosen, and
 * its menu: a search field, [New chat], this project's chats newest first
 * (title, when, the last editor's icon, an "Other PC" mark) with rename and
 * delete per row (delete asks once in the row first), and "Earlier chat of
 * this document" at the bottom when the
 * document has one. The search field drives ↑/↓/Home/End/Enter/Esc. Every
 * action is a callback; nothing here reads or writes chats.
 */
export function ProjectChatMenu(props: ProjectChatMenuProps): React.JSX.Element {
  const { lang, chats, currentChatId, legacy, legacyActive = false, disabled = false } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [renaming, setRenaming] = useState<{ id: ProjectId; draft: string } | null>(null)
  /** the row asking "move this chat to the trash?" */
  const [confirming, setConfirming] = useState<ProjectId | null>(null)
  const [openedAt, setOpenedAt] = useState(() => Date.now())
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const renameRef = useRef<HTMLInputElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const listId = `ai-project-chats-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`

  const items = useMemo(() => projectChatMenuItems(chats, query, legacy), [chats, query, legacy])
  const close = useCallback(() => {
    setOpen(false)
    setRenaming(null)
    setConfirming(null)
  }, [])
  useDismissablePopover(open, close, { inside: () => [buttonRef.current, popRef.current] })

  const current = Math.min(active, items.length - 1)
  const now = props.now ?? openedAt

  useEffect(() => {
    if (open && !renaming && !confirming) inputRef.current?.focus({ preventScroll: true })
  }, [open, renaming, confirming])
  useEffect(() => {
    if (confirming) confirmRef.current?.focus({ preventScroll: true })
  }, [confirming])
  const renamingId = renaming?.id
  useEffect(() => {
    if (renamingId) renameRef.current?.select()
  }, [renamingId])
  useEffect(() => {
    if (!open) return
    revealInList(document.getElementById(projectChatOptionId(listId, current)), '.ai-project-list')
  }, [open, listId, current])

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setPopStyle(
        aiModelPopoverStyle(
          rect,
          { width: window.innerWidth, height: window.innerHeight },
          POPOVER_WIDTH,
          POPOVER_MAX_HEIGHT,
        ),
      )
    }
    setQuery('')
    setRenaming(null)
    setConfirming(null)
    setOpenedAt(Date.now())
    setActive(initialIndex(projectChatMenuItems(chats, '', legacy), currentChatId, legacyActive))
    setOpen(true)
    props.onOpen?.()
  }

  const finish = () => {
    close()
    buttonRef.current?.focus({ preventScroll: true })
  }

  const activate = (item: ProjectChatMenuItem | undefined) => {
    if (!item) return
    finish()
    if (item.kind === 'new') props.onNewChat()
    else if (item.kind === 'chat') props.onSelect(item.chat.id)
    else props.onSelectLegacy?.()
  }

  const commitRename = () => {
    if (!renaming) return
    const chat = chats.find((c) => c.id === renaming.id)
    const title = renaming.draft.trim()
    setRenaming(null)
    if (chat && title && title !== chat.title) props.onRename(chat.id, title)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        setActive(stepIndex(current, items.length, e.key))
        break
      case 'Home':
      case 'End':
        if (query) return
        e.preventDefault()
        setActive(stepIndex(current, items.length, e.key))
        break
      case 'Enter':
        e.preventDefault()
        activate(items[current])
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        finish()
        break
    }
  }

  const optionProps = (index: number) => ({
    id: projectChatOptionId(listId, index),
    role: 'option' as const,
    'aria-selected': index === current,
    onMouseEnter: () => setActive(index),
  })

  const confirmRow = (chat: ProjectChatListItem, index: number, title: string) => (
    <div
      key={chat.id}
      {...optionProps(index)}
      className={`ai-project-row ai-project-chat-row is-confirming${
        index === current ? ' is-active' : ''
      }`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        setConfirming(null)
      }}
    >
      <span className="ai-project-row-main">
        <span className="ai-project-confirm-text" dir="auto">
          {projectPanelText(lang, 'deleteConfirm', { title })}
        </span>
        <span className="ai-project-confirm-actions">
          <button
            ref={confirmRef}
            type="button"
            className="ai-project-link ai-project-confirm-delete"
            onClick={(e) => {
              e.stopPropagation()
              setConfirming(null)
              props.onDelete(chat.id)
            }}
          >
            {projectPanelText(lang, 'deleteChat')}
          </button>
          <button
            type="button"
            className="ai-project-link"
            onClick={(e) => {
              e.stopPropagation()
              setConfirming(null)
            }}
          >
            {projectPanelText(lang, 'cancel')}
          </button>
        </span>
      </span>
    </div>
  )

  const chatRow = (chat: ProjectChatListItem, index: number) => {
    const chosen = !legacyActive && chat.id === currentChatId
    const editing = renaming?.id === chat.id
    const title = chat.title.trim() || projectPanelText(lang, 'untitledChat')
    if (confirming === chat.id) return confirmRow(chat, index, title)
    const editorLabel = projectEditorLabel(lang, chat.lastEditor)
    const classes = [
      'ai-project-row',
      'ai-project-chat-row',
      index === current ? 'is-active' : '',
      chosen ? 'is-chosen' : '',
      editing ? 'is-editing' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <div
        key={chat.id}
        {...optionProps(index)}
        className={classes}
        onMouseDown={(e) => {
          if (!editing) e.preventDefault()
        }}
        onClick={() => {
          if (!editing) activate(items[index])
        }}
      >
        <span
          className="ai-project-row-icon"
          title={projectPanelText(lang, 'lastEditorTitle', { editor: editorLabel })}
        >
          <IconProjectEditor editor={chat.lastEditor} />
        </span>
        <span className="ai-project-row-main">
          {editing ? (
            <input
              ref={renameRef}
              className="ai-project-rename"
              type="text"
              aria-label={projectPanelText(lang, 'renameInputAria')}
              value={renaming.draft}
              dir="auto"
              onChange={(e) => setRenaming({ id: chat.id, draft: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  setRenaming(null)
                }
              }}
            />
          ) : (
            <span className="ai-project-row-name" dir="auto">
              {title}
            </span>
          )}
          <span className="ai-project-row-meta">
            <span className="ai-project-row-time" title={projectFullTime(chat.updatedAt, lang)}>
              {projectRelativeTime(chat.updatedAt, now, lang)}
            </span>
            <span className="ai-project-visually-hidden">{editorLabel}</span>
            {chat.foreign && (
              <span className="ai-project-badge" title={projectPanelText(lang, 'otherPcTitle')}>
                {projectPanelText(lang, 'otherPc')}
              </span>
            )}
          </span>
        </span>
        {chosen && !editing && (
          <span className="ai-project-row-check">
            <IconCheck />
          </span>
        )}
        {!editing && (
          <span className="ai-project-row-actions">
            <button
              type="button"
              className="ai-project-row-action"
              aria-label={projectPanelText(lang, 'renameChat')}
              title={projectPanelText(lang, 'renameChat')}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(null)
                setRenaming({ id: chat.id, draft: chat.title })
              }}
            >
              <IconPencil size={14} />
            </button>
            <button
              type="button"
              className="ai-project-row-action ai-project-row-remove"
              aria-label={projectPanelText(lang, 'deleteChat')}
              title={projectPanelText(lang, 'deleteChatTitle')}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(null)
                setConfirming(chat.id)
              }}
            >
              <IconTrash size={14} />
            </button>
          </span>
        )}
      </div>
    )
  }

  const buttonText = projectChatTitle(lang, chats, currentChatId, {
    legacyActive,
    ...(props.currentTitle !== undefined ? { currentTitle: props.currentTitle } : {}),
  })
  const ariaLabel = projectPanelText(lang, 'chatButtonAria', { title: buttonText })
  const chatCount = items.filter((item) => item.kind === 'chat').length

  return (
    <div className="ai-project-chat-menu">
      <button
        ref={buttonRef}
        type="button"
        className={`ai-project-chat-button${open ? ' open' : ''}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-tip={ariaLabel}
        onClick={() => (open ? finish() : openMenu())}
      >
        <span className="ai-project-chip-text" dir="auto">
          {buttonText}
        </span>
        <span className="ai-project-chip-caret">
          <IconCaretDown />
        </span>
      </button>
      {open && (
        <div
          ref={popRef}
          className="ai-project-pop"
          role="dialog"
          aria-label={projectPanelText(lang, 'chatMenuLabel')}
          style={{ ...popStyle, width: POPOVER_WIDTH }}
        >
          <input
            ref={inputRef}
            className="ai-project-search"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={projectChatOptionId(listId, current)}
            aria-label={projectPanelText(lang, 'chatSearchPlaceholder')}
            placeholder={projectPanelText(lang, 'chatSearchPlaceholder')}
            value={query}
            dir="auto"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onSearchKeyDown}
          />
          <div
            className="ai-project-list"
            role="listbox"
            id={listId}
            aria-label={projectPanelText(lang, 'chatMenuLabel')}
          >
            {items.map((item, index) => {
              if (item.kind === 'chat') return chatRow(item.chat, index)
              if (item.kind === 'new') {
                return (
                  <React.Fragment key="new">
                    <div
                      {...optionProps(index)}
                      className={`ai-project-row ai-project-row-new${
                        index === current ? ' is-active' : ''
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => activate(item)}
                    >
                      <span className="ai-project-row-icon">
                        <IconPlus />
                      </span>
                      <span className="ai-project-row-main">
                        <span className="ai-project-row-name">
                          {projectPanelText(lang, 'newChat')}
                        </span>
                      </span>
                    </div>
                    {chatCount === 0 && (
                      <div className="ai-project-empty">
                        {projectPanelText(lang, query.trim() ? 'noChatMatches' : 'noChats')}
                      </div>
                    )}
                  </React.Fragment>
                )
              }
              return (
                <React.Fragment key="legacy">
                  <div className="ai-project-sep" aria-hidden="true" />
                  <div
                    {...optionProps(index)}
                    className={`ai-project-row ai-project-row-legacy${
                      index === current ? ' is-active' : ''
                    }${legacyActive ? ' is-chosen' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activate(item)}
                  >
                    <span className="ai-project-row-icon">
                      <IconProjectEditor editor="docs" />
                    </span>
                    <span className="ai-project-row-main">
                      <span className="ai-project-row-name">
                        {projectPanelText(lang, 'legacyChat')}
                      </span>
                      <span className="ai-project-row-meta">
                        <span
                          className="ai-project-row-time"
                          title={projectFullTime(item.legacy.updatedAt, lang)}
                        >
                          {projectRelativeTime(item.legacy.updatedAt, now, lang)}
                        </span>
                      </span>
                    </span>
                    {legacyActive && (
                      <span className="ai-project-row-check">
                        <IconCheck />
                      </span>
                    )}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
