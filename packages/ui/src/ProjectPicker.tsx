import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { ProjectId, ProjectListItem } from '@genoffice/project-store'
import { aiModelPopoverStyle } from './AiModelPicker'
import { revealInList, useDismissablePopover } from './popover-dismiss'
import {
  projectChipText,
  projectCreateLocation,
  projectPickerAction,
  projectPickerInitialIndex,
  projectPickerItems,
  stepIndex,
  type ProjectPickerAction,
  type ProjectPickerItem,
} from './project-panel-model'
import {
  IconCaretDown,
  IconCheck,
  IconFolderAdd,
  IconFolderOpen,
  IconNoProject,
  IconPin,
  IconPlus,
  IconProjectFolder,
  IconRemoveFromList,
  IconUnpin,
} from './project-icons'
import { projectPanelText } from './strings-project-panel'
import './project-panel.css'

/** Width of the project list popover */
const POPOVER_WIDTH = 320
/** Tallest the project list grows before it scrolls */
const POPOVER_MAX_HEIGHT = 440

export interface ProjectPickerProps {
  readonly lang: Lang
  /** Pinned and recent projects (`ProjectFolderApi.listProjects`); order does not matter */
  readonly projects: readonly ProjectListItem[]
  /** The chosen project, or null for "No project" */
  readonly selectedId: ProjectId | null
  /** Locks the chip (for example while a reply runs) */
  readonly disabled?: boolean | undefined
  /** The list opened; a good moment for the caller to refresh `projects` */
  readonly onOpen?: (() => void) | undefined
  /**
   * The default save folder (`ProjectFolderApi.getDefaultParentFolder`), shown
   * as where "'<name>' new project" creates the folder; absent while unknown
   */
  readonly defaultParentFolder?: string | undefined
  /** A project row, or "No project" (null) */
  readonly onSelect: (projectId: ProjectId | null) => void
  /**
   * A new project named as typed in the search field: under the default save
   * folder, or with `otherPlace` ("Create somewhere else…") under a folder main
   * asks for. Pass both to `ProjectFolderApi.createProject`; never a path.
   */
  readonly onCreate: (name: string, options: { readonly otherPlace: boolean }) => void
  readonly onAddFolder: () => void
  /** A "folder missing" row: the caller opens a folder picker to relocate it */
  readonly onRelocate: (projectId: ProjectId) => void
  readonly onSetPinned: (projectId: ProjectId, pinned: boolean) => void
  readonly onOpenInFileManager: (projectId: ProjectId) => void
  /** Drops the list entry only; the folder and its files stay */
  readonly onRemoveFromList: (projectId: ProjectId) => void
}

/** DOM id of a row, for the search field's aria-activedescendant */
export function projectPickerOptionId(listId: string, index: number): string {
  return `${listId}-opt-${index}`
}

/**
 * The project chip on the row under the AI input (`[folder name ▾]`, or "No
 * project") and its list: a search field that also names a new project,
 * "Pinned" and "Recent" rows (icon, name, folder), "+ New project", "Add
 * folder" and "No project". A name that matches no project offers "'<name>'
 * new project" (with where it goes) and "Create somewhere else…"; "+ New
 * project" with nothing typed asks for the name in the search field. Hovering a
 * row shows pin/unpin, open folder and remove from list. A missing folder is
 * dimmed with "Folder missing" and asks the caller to relocate it. The search
 * field drives ↑/↓/Home/End/Enter/Esc. Every action is a callback; nothing
 * here reads or writes projects.
 */
export function ProjectPicker(props: ProjectPickerProps): React.JSX.Element {
  const { lang, projects, selectedId, disabled = false } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  /** "+ New project" was chosen with nothing typed: the field asks for the name */
  const [askName, setAskName] = useState(false)
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = `ai-project-list-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`

  const items = useMemo(() => projectPickerItems(projects, query, lang), [projects, query, lang])
  const close = useCallback(() => setOpen(false), [])
  useDismissablePopover(open, close, { inside: () => [chipRef.current, popRef.current] })

  // keep the highlight on a real row when the list shrinks under it
  const current = Math.min(active, items.length - 1)

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    revealInList(
      document.getElementById(projectPickerOptionId(listId, current)),
      '.ai-project-list',
    )
  }, [open, listId, current])

  const openList = () => {
    const rect = chipRef.current?.getBoundingClientRect()
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
    setAskName(false)
    setActive(projectPickerInitialIndex(projectPickerItems(projects, '', lang), selectedId))
    setOpen(true)
    props.onOpen?.()
  }

  const finish = () => {
    setOpen(false)
    chipRef.current?.focus({ preventScroll: true })
  }

  const run = (action: ProjectPickerAction) => {
    if (action.type === 'ask-name') {
      // nothing is created without a name: keep the list open and ask for one
      setAskName(true)
      inputRef.current?.focus({ preventScroll: true })
      return
    }
    finish()
    switch (action.type) {
      case 'select':
        props.onSelect(action.projectId)
        break
      case 'relocate':
        props.onRelocate(action.projectId)
        break
      case 'create':
        props.onCreate(action.name, { otherPlace: action.otherPlace })
        break
      case 'add-folder':
        props.onAddFolder()
        break
    }
  }

  const activate = (item: ProjectPickerItem | undefined) => {
    if (item) run(projectPickerAction(item, query))
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
        // Home/End move the caret while there is text to move in
        if (query) return
        e.preventDefault()
        setActive(stepIndex(current, items.length, e.key))
        break
      case 'Enter':
        e.preventDefault()
        activate(items[current])
        break
      case 'Escape':
        // the panel's Esc stops a run; closing the list must not reach it
        e.preventDefault()
        e.stopPropagation()
        finish()
        break
    }
  }

  const chipText = projectChipText(lang, projects, selectedId)
  const optionProps = (index: number) => ({
    id: projectPickerOptionId(listId, index),
    role: 'option' as const,
    'aria-selected': index === current,
    onMouseEnter: () => setActive(index),
    // keep the focus in the search field while a row is clicked
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  })

  const rowAction = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    className = '',
  ): React.ReactNode => (
    <button
      type="button"
      className={`ai-project-row-action${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {icon}
    </button>
  )

  const projectRow = (project: ProjectListItem, index: number) => {
    const chosen = project.id === selectedId
    const classes = [
      'ai-project-row',
      'ai-project-row-project',
      index === current ? 'is-active' : '',
      project.missing ? 'is-missing' : '',
      chosen ? 'is-chosen' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <div
        key={project.id}
        {...optionProps(index)}
        className={classes}
        title={
          project.missing ? projectPanelText(lang, 'folderMissingTitle') : project.path || undefined
        }
        onClick={() => activate(items[index])}
      >
        <span className="ai-project-row-icon">
          <IconProjectFolder />
        </span>
        <span className="ai-project-row-main">
          <span className="ai-project-row-name" dir="auto">
            {project.name}
          </span>
          <span className="ai-project-row-path" dir="auto">
            {project.path}
          </span>
        </span>
        {project.missing && (
          <span className="ai-project-badge">{projectPanelText(lang, 'folderMissing')}</span>
        )}
        {!project.missing && project.unwritable && (
          <span className="ai-project-badge">{projectPanelText(lang, 'unwritableMark')}</span>
        )}
        {chosen && (
          <span className="ai-project-row-check">
            <IconCheck />
          </span>
        )}
        <span className="ai-project-row-actions">
          {rowAction(
            projectPanelText(lang, project.pinned ? 'unpin' : 'pin'),
            project.pinned ? <IconUnpin /> : <IconPin />,
            () => props.onSetPinned(project.id, !project.pinned),
          )}
          {!project.missing &&
            rowAction(projectPanelText(lang, 'openFolder'), <IconFolderOpen />, () =>
              props.onOpenInFileManager(project.id),
            )}
          {rowAction(
            projectPanelText(lang, 'removeFromList'),
            <IconRemoveFromList />,
            () => props.onRemoveFromList(project.id),
            'ai-project-row-remove',
          )}
        </span>
      </div>
    )
  }

  const group = (kind: 'pinned' | 'recent') => {
    const rows = items
      .map((item, index) => ({ item, index }))
      .filter(
        (r): r is { item: Extract<ProjectPickerItem, { kind: 'project' }>; index: number } =>
          r.item.kind === 'project' && r.item.group === kind,
      )
    if (rows.length === 0) return null
    const label = projectPanelText(lang, kind === 'pinned' ? 'groupPinned' : 'groupRecent')
    return (
      <div role="group" aria-label={label} className="ai-project-group">
        <div className="ai-project-group-label" aria-hidden="true">
          {label}
        </div>
        {rows.map(({ item, index }) => projectRow(item.project, index))}
      </div>
    )
  }

  const fixedRow = (kind: 'create' | 'create-elsewhere' | 'new' | 'add-folder' | 'none') => {
    const index = items.findIndex((item) => item.kind === kind)
    if (index < 0) return null
    const item = items[index]!
    const chosenNone = kind === 'none' && selectedId === null
    const text =
      item.kind === 'create'
        ? projectPanelText(lang, 'createNamed', { name: item.name })
        : projectPanelText(
            lang,
            kind === 'create-elsewhere'
              ? 'createElsewhere'
              : kind === 'new'
                ? 'newProject'
                : kind === 'add-folder'
                  ? 'addFolder'
                  : 'noProject',
          )
    // where "'<name>' new project" puts the folder, written out
    const location =
      item.kind === 'create' ? projectCreateLocation(props.defaultParentFolder, item.name) : ''
    const icon =
      kind === 'add-folder' ? (
        <IconFolderAdd />
      ) : kind === 'create-elsewhere' ? (
        <IconFolderOpen />
      ) : kind === 'none' ? (
        <IconNoProject />
      ) : (
        <IconPlus />
      )
    return (
      <div
        {...optionProps(index)}
        className={`ai-project-row ai-project-row-${kind}${index === current ? ' is-active' : ''}${
          chosenNone ? ' is-chosen' : ''
        }`}
        onClick={() => activate(item)}
      >
        <span className="ai-project-row-icon">{icon}</span>
        <span className="ai-project-row-main">
          <span className="ai-project-row-name" dir="auto">
            {text}
          </span>
          {location && (
            <span className="ai-project-row-path" dir="auto" title={location}>
              {projectPanelText(lang, 'createLocation', { path: location })}
            </span>
          )}
        </span>
        {chosenNone && (
          <span className="ai-project-row-check">
            <IconCheck />
          </span>
        )}
      </div>
    )
  }

  const hasProjects = items.some((item) => item.kind === 'project')
  // the name hint stays until something is typed
  const showNameHint = askName && !query.trim()
  const hintId = `${listId}-hint`
  const ariaLabel = projectPanelText(lang, 'chipAria', { name: chipText })

  return (
    <div className="ai-project-picker">
      <button
        ref={chipRef}
        type="button"
        className={`ai-project-chip${open ? ' open' : ''}${selectedId === null ? ' is-none' : ''}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-tip={ariaLabel}
        onClick={() => (open ? finish() : openList())}
      >
        <span className="ai-project-chip-icon">
          {selectedId === null ? <IconNoProject size={13} /> : <IconProjectFolder size={13} />}
        </span>
        <span className="ai-project-chip-text" dir="auto">
          {chipText}
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
          aria-label={projectPanelText(lang, 'pickerLabel')}
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
            aria-activedescendant={projectPickerOptionId(listId, current)}
            aria-label={projectPanelText(lang, 'searchPlaceholder')}
            aria-describedby={showNameHint ? hintId : undefined}
            placeholder={projectPanelText(
              lang,
              showNameHint ? 'newProjectNameHint' : 'searchPlaceholder',
            )}
            value={query}
            dir="auto"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onSearchKeyDown}
          />
          {showNameHint && (
            <div id={hintId} className="ai-project-hint" role="status">
              {projectPanelText(lang, 'newProjectNameHint')}
            </div>
          )}
          <div
            className="ai-project-list"
            role="listbox"
            id={listId}
            aria-label={projectPanelText(lang, 'pickerLabel')}
          >
            {fixedRow('create')}
            {fixedRow('create-elsewhere')}
            {group('pinned')}
            {group('recent')}
            {!hasProjects && !query.trim() && (
              <div className="ai-project-empty">{projectPanelText(lang, 'emptyList')}</div>
            )}
            <div className="ai-project-sep" aria-hidden="true" />
            {fixedRow('new')}
            {fixedRow('add-folder')}
            <div className="ai-project-sep" aria-hidden="true" />
            {fixedRow('none')}
          </div>
        </div>
      )}
    </div>
  )
}
