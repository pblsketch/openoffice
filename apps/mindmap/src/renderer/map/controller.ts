/**
 * One sheet on screen: one instance of the drawing library, and the link
 * between it and the sheet's source tree.
 *
 * The rule: the source tree is the authority. After everything the user does
 * the controller takes the state the screen now shows and hands it to
 * reconciling (`#sync`). When reconciling refuses the state, or the tree then
 * shows something else than the screen, the screen is drawn again from the
 * tree. Undo and redo move the library's history and put the matching copy of
 * the source tree back (`DocumentSession`), then check the two against each
 * other the same way.
 *
 * The public methods are the edit functions of the editor: the toolbar, the
 * shortcuts, the menu and the AI all change the map through them (or through
 * the library's own editing, which ends in the same `#sync`). Nothing writes
 * to the source tree past this class except the sheet tabs.
 *
 * What the library must never be given is described in `text-guard.ts` and
 * `convert.ts`. What the editor draws on the library's topics itself (the
 * branch colours, markers, pictures and a topic's own style) is in
 * `decorate.ts`, and runs every time the library is about to draw the lines.
 */
import MindElixir, {
  type ArrowSvg,
  type MindElixirInstance,
  type NodeObj,
  type Operation,
  type Options,
  type SummarySvg,
  type Topic,
} from 'mind-elixir'
import {
  BOUNDARY_STYLE_PROPERTIES,
  type BoundaryStyleKey,
  type BranchLineKey,
  isShownLink,
  isWritableBoundaryStyle,
  isWritableRelationshipStyle,
  isWritableSummaryStyle,
  newXmindId,
  RELATIONSHIP_STYLE_PROPERTIES,
  type RelationshipStyleKey,
  SUMMARY_STYLE_PROPERTIES,
  type SummaryStyleKey,
  type ThemeId,
  themeLook,
  type ThemeLook,
  type ViewBoundary,
  type ViewBoundaryStyle,
  type ViewBranchLine,
  type ViewCurve,
  type ViewLayout,
  type ViewRelationshipStyle,
  type ViewSheet,
  type ViewSummaryStyle,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import {
  type Arrow,
  boundariesOf,
  boxWidth,
  cleanPastedNode,
  directionOfLayout,
  emptyMeta,
  layoutOfDirection,
  type MapArrow,
  type MapNode,
  type MapStructure,
  type MapNodeMeta,
  type MapSummary,
  mindToState,
  nodePatch,
  normaliseTree,
  structureOfLayout,
  type Summary,
  topicIdsOf,
  viewToMind,
  withBoundaries,
  XMIND_ID,
} from '../document/convert'
import type { DocumentSession } from '../document/session'
import { type BoundaryRefusal, boundaryPlaceFor } from './boundary-edit'
import { BoundaryRoom } from './boundary-room'
import { oneLineTitle, openBoundaryTitleBox } from './boundary-title'
import { type DecorationStrings, TopicDecorator } from './decorate'
import {
  type FormatKind,
  PAINTER_OFF,
  type PainterState,
  paintedTopicStyle,
  stylePaintOf,
  themeColorsAt,
  type TopicPaint,
  topicPaintOf,
} from './format-painter'
import {
  type BoundaryStyleChange,
  boundaryStyleEdits,
  branchLineEdits,
  type BranchLineChange,
  branchNodes,
  CLEAR_BOUNDARY_STYLE,
  CLEAR_BRANCH_LINE,
  CLEAR_RELATIONSHIP_STYLE,
  CLEAR_SUMMARY_STYLE,
  editBranchLine,
  editOwnLine,
  inheritArrivals,
  inheritBranchLine,
  type LineEditsById,
  noteBranchLineEdits,
  ownLineOf,
  parentsOf,
  type RelationshipStyleChange,
  relationshipStyleEdits,
  restyleArrowRecord,
  restyleSummaryRecord,
  sameCurve,
  sameValues,
  type StyleEdits,
  type SummaryStyleChange,
  summaryStyleEdits,
  withEdits,
  writableLineOf,
} from './line-format'
import { branchIndexOf, type MapLineSettings, type ResolvedBranchLine } from './line-resolve'
import { boundaryOf, boundaryUnder, type MapTarget, targetOf } from './map-targets'
import {
  BOUNDARY_ID_ATTRIBUTE,
  BOUNDARY_SHAPE_CLASS,
  BOUNDARY_TITLE_CLASS,
  RelationDrawer,
} from './relations'
import { deltasToCurve } from './relationship-shapes'
import { PictureStore } from './images'
import { libraryTheme, lineSettingsOfSheet, lookOfSheet } from './look'
import { installMultiSelect } from './multi-select'
import { escapeMapText } from './text-guard'
import {
  type FormatToggle,
  formatParts,
  formatShortcut,
  formatTopic,
  isRunFormat,
  normaliseRuns,
  partsShow,
  type RunFormat,
  type ShownFormat,
  shownFormat,
  type TextBase,
  type TextFormat,
  trimRuns,
} from './text-format'
import { drawnRuns, fillBox, readBox, selectIn, selectionIn } from './title-runs'
import { isArrowKey, timelineArrowTarget } from './timeline-keys'
import { installTopicResize } from './topic-resize'

type MenuOption = Exclude<NonNullable<Options['contextMenu']>, boolean>
/** The library's context menu texts. All twelve are passed in the user's language. */
export type MenuTexts = NonNullable<MenuOption['locale']>

/** Texts the map itself shows. They come from the app's dictionaries, already translated. */
export interface MapStrings {
  /** the title a new topic starts with */
  newTopic: string
  /** the title a new summary starts with */
  summary: string
  menu: MenuTexts
  /** the editor's own entries at the end of the context menu */
  menuRelationship: string
  menuLabel: string
  menuNote: string
  menuLink: string
  menuInsertPicture: string
  menuRemovePicture: string
  /** "put a boundary around these": an entry of the topic menu when given */
  menuAddBoundary?: string
  /** names of the markers and of a picture that is not shown, for assistive technology */
  decoration: DecorationStrings
}

export type TopicRequest = 'label' | 'note' | 'link' | 'picture'

/**
 * Something the screen tells the user about in its own words: an edit that
 * was turned down, and why.
 */
export type MapNotice =
  /** a boundary could not be made around the selected topics */
  | { code: 'boundary-refused'; reason: BoundaryRefusal }
  /** the format painter holds the format of one kind of item, and another kind was pressed */
  | { code: 'painter-wrong-kind'; held: FormatKind; pressed: FormatKind }
  /** the format painter was asked for with nothing selected to take a format from */
  | { code: 'painter-nothing-selected' }

/** What is selected on the map. A boundary is never selected together with anything else. */
export type MapSelection =
  | { kind: 'none' }
  | { kind: 'topics'; ids: string[] }
  | { kind: 'relationship'; id: string }
  | { kind: 'summary'; id: string }
  | { kind: 'boundary'; id: string }

/**
 * What `edit` hands its change besides the topics: the sheet's relationships,
 * summaries and boundaries, as the library holds them, to change in place
 * (or to replace the contents of).
 */
export interface MapParts {
  arrows: MapArrow[]
  summaries: MapSummary[]
  boundaries: ViewBoundary[]
}

/**
 * What an edit changed that the engine writes only when it is named: ids of
 * what the user (or the AI) changed the format of, and of what it removed.
 * A relationship or summary taken out of `MapParts` is removed only when it is
 * named here; a boundary taken out stays in the file unless it is named.
 */
export interface EditOptions {
  /** topics whose text format changed */
  restyled?: readonly string[]
  /** topics whose line format changed */
  restyledLines?: readonly string[]
  /**
   * the line keys the edit set itself, by topic id: on a topic that stands
   * under a new parent afterwards they win over that parent's values, key by key
   */
  lineEdits?: ReadonlyMap<string, StyleEdits<BranchLineKey>>
  /** topics whose fill changed */
  refilled?: readonly string[]
  /** relationships whose format or curve changed */
  restyledRelationships?: readonly string[]
  /** summaries (by summary topic id) whose bracket changed */
  restyledSummaries?: readonly string[]
  /** boundaries whose format changed (a new title is written anyway) */
  restyledBoundaries?: readonly string[]
  removedRelationships?: readonly string[]
  /** by summary topic id */
  removedSummaries?: readonly string[]
  removedBoundaries?: readonly string[]
}

/** How a change of format ended. `unchanged`: everything already had those values, and no step was made. */
export type FormatOutcome =
  { ok: true } | { ok: false; reason: 'nothing' | 'invalid-value' | 'unchanged' }

export type BoundaryOutcome = { ok: true; id: string } | { ok: false; reason: BoundaryRefusal }

export type PainterOutcome =
  { ok: true } | { ok: false; reason: 'nothing-selected' | 'inactive' | 'wrong-kind' | 'nothing' }

/** What the controller needs from the screen around it. */
export interface MapHost {
  /** "N elements you cannot see will be deleted too": true to go on */
  confirmDelete(count: number): Promise<boolean>
  /** open a topic's web link; the main process checks the address and opens it */
  openLink(url: string): void
  /** the user asked to edit the labels, the note or the link of a topic, or to put a picture on it */
  onRequest(kind: TopicRequest, topicId: string): void
  /** the selection, the history, the zoom or the layout changed */
  onStateChange(): void
  /** an edit was turned down or needs a word to the user (the status line) */
  onNotice?(notice: MapNotice): void
  /** the map's menu was asked for on a boundary (it is selected now); `at` is where, in page pixels */
  onBoundaryMenu?(boundaryId: string, at: { x: number; y: number }): void
}

export interface MapControllerOptions {
  el: HTMLDivElement
  session: DocumentSession
  sheetKey: string
  strings: MapStrings
  host: MapHost
}

/** `ask`: the user is asked before hidden elements go. `refuse`: the deletion is turned down instead (callers that cannot ask). */
export type DeleteMode = 'ask' | 'refuse'

export type RemoveOutcome =
  | { ok: true }
  | { ok: false; reason: 'preserved' | 'cancelled'; preserved: number }
  | { ok: false; reason: 'nothing' }

export interface TopicInfo {
  id: string
  title: string
  labels: string[]
  note: string | null
  link: string | null
  /** the topic shows a picture */
  hasPicture: boolean
  /** the width the user gave the box; null when it takes the width of its text */
  width: number | null
  isRoot: boolean
}

const ZOOM_MIN = 0.2
const ZOOM_MAX = 3
const ZOOM_STEP = 0.1
/** How long the map is left alone before a change nobody reported is looked for. */
const QUIET_SYNC_DELAY_MS = 300

export class MapController {
  readonly mind: MindElixirInstance
  readonly #session: DocumentSession
  readonly #key: string
  readonly #host: MapHost
  #strings: MapStrings
  /** the view the screen was last brought in line with */
  #lastView: ViewSheet
  /** the library's data as it was then, to tell at a glance whether anything moved */
  #syncedData = ''
  #layoutPicked = false
  /** how the library's direction is drawn: as it is, as a tree or as a timeline */
  #structure: MapStructure = 'map'
  readonly #removedSummaries = new Set<string>()
  readonly #removedRelationships = new Set<string>()
  /** topics whose picture the user took off since the last reconcile (the engine deletes only these) */
  readonly #removedPictures = new Set<string>()
  /** topics whose text format the user changed since the last reconcile (the engine writes it only for these) */
  readonly #restyled = new Set<string>()
  /** the same for the line format of topics, their fill, and the format of relationships, summaries and boundaries */
  readonly #relined = new Set<string>()
  readonly #refilled = new Set<string>()
  readonly #restyledRelationships = new Set<string>()
  readonly #restyledSummaries = new Set<string>()
  readonly #restyledBoundaries = new Set<string>()
  /** boundaries the user removed since the last reconcile (the engine removes only these) */
  readonly #removedBoundaries = new Set<string>()
  /** the boundary selected; never together with topics, a relationship or a summary */
  #selectedBoundary: string | null = null
  /** the format painter, while it holds a format */
  #painter: HeldFormat | null = null
  /** a press the painter or a boundary took: its release is not the library's either */
  #takenPress: number | null = null
  /** set while the controller puts a selection back after drawing again */
  #reselecting = false
  /** the topic title being typed, while it is */
  #editing: TitleEdit | null = null
  readonly #libraryUndo: () => void
  readonly #libraryRedo: () => void
  readonly #libraryRemoveSummary: (id: string) => void
  #quietTimer: ReturnType<typeof setTimeout> | null = null
  /** the topic a relationship is being drawn from, while the user picks its other end */
  #pickingFrom: string | null = null
  /** topics a cut is about to take out, kept until the library reports that it removed them */
  #cutPending: CutStash | null = null
  /** topics a cut took out of this sheet: pasted back here, they return as they were */
  #cutStash: CutStash | null = null
  /** set while a step the session already recorded is announced to the library's history */
  #recordedBySession = false
  /** an input method is composing in the edit box */
  #composing = false
  /** the look the sheet is drawn with */
  #look: ThemeLook
  readonly #pictures: PictureStore
  readonly #decorator: TopicDecorator
  /** the format of relationships, summary brackets and boundaries, drawn over the library's */
  readonly #relations: RelationDrawer
  #relinkTimer: ReturnType<typeof setTimeout> | null = null
  /** the lines have to be drawn again, but the sheet was not on screen to be measured */
  #relinkWhenShown = false
  #destroyed = false
  readonly #dispose: Array<() => void> = []

  constructor(options: MapControllerOptions) {
    this.#session = options.session
    this.#key = options.sheetKey
    this.#host = options.host
    this.#strings = options.strings
    this.#lastView = this.#session.view(this.#key)
    this.#look = lookOfSheet(this.#session.sheet(this.#key))
    // Pictures come out of the archive through the engine, and from nowhere else.
    this.#pictures = new PictureStore((name) => this.#session.document.readEntry(name))

    const mind = new MindElixir({
      el: options.el,
      direction: directionOfLayout(this.#lastView.layout),
      editable: true,
      toolBar: false,
      allowUndo: true,
      newTopicName: this.#strings.newTopic,
      theme: libraryTheme(this.#look),
      scaleMin: ZOOM_MIN,
      scaleMax: ZOOM_MAX,
      // The one switch on the paths that put text into markup: see text-guard.ts.
      markdown: (text) => escapeMapText(text),
      contextMenu: {
        focus: false,
        // the library's own link entries make lines in two directions and with an English title
        link: false,
        locale: this.#strings.menu,
        extend: this.#menuEntries(),
      },
      before: {
        removeNodes: (topics) => this.#beforeRemove(topics),
        // Pasted nodes come from the clipboard: cleaned before the library draws them.
        // Unless they are the topics just cut from this sheet: those come back whole.
        copyNodes: (topics, to) => {
          if (this.#moveBack(topics, to)) return false
          topics.forEach((topic) => this.#cleanIfPasted(topic))
          return true
        },
        copyNode: (topic) => {
          this.#cleanIfPasted(topic)
          return true
        },
      },
      // Text from the clipboard that is not a copied topic is not pasted into the map.
      pasteHandler: () => {},
    })
    this.mind = mind
    this.#decorator = new TopicDecorator({
      mind,
      pictures: this.#pictures,
      look: this.#look,
      strings: this.#strings.decoration,
      onResize: this.#relink,
    })
    this.#relations = new RelationDrawer(mind)
    const room = new BoundaryRoom(mind)
    // The library draws the lines from what it measures. The editor's own
    // drawing goes in right before that, so it is measured too, and so does
    // the room the boundaries take (when that room changed, every branch is
    // measured again, not only the one asked for); the branch colours of the
    // lines follow right after.
    const libraryLinkDiv = mind.linkDiv.bind(mind)
    mind.linkDiv = (mainNode) => {
      this.#decorator.before()
      libraryLinkDiv(room.make() ? undefined : mainNode)
      this.#decorator.after(mainNode)
      this.#relations.drawAll()
      this.#markBoundary()
    }
    mind.keypress = {
      // Space edits, like F2: a summary or a relationship when one is selected, else the topic
      ' ': () => {
        if (this.#selectedBoundary !== null) this.editBoundaryTitle()
        else if (mind.currentSummary) mind.editSummary(mind.currentSummary)
        else if (mind.currentArrow) mind.editArrowLabel(mind.currentArrow)
        else void mind.beginEdit()
      },
    }
    // New topics get an id the file keeps, so reconciling has nothing to rename.
    mind.generateNewObj = () => ({
      id: newXmindId(),
      topic: mind.newTopicName,
      metadata: emptyMeta(),
    })

    const started = performance.now()
    this.#setStructure(structureOfLayout(this.#lastView.layout))
    const problem = mind.init(viewToMind(this.#lastView))
    if (problem) throw problem
    this.#syncedData = mind.getDataString()
    measure(DRAW_MEASURE, started)

    // The library's history listens since init(). `#prepare` goes in front of it, so
    // the history records the ids the file will hold; `#onOperation` comes after.
    mind.bus.handlers.operation ??= []
    mind.bus.handlers.operation.unshift(this.#prepare)
    mind.bus.addListener('operation', this.#onOperation)
    mind.bus.addListener('showContextMenu', this.#onContextMenu)
    mind.bus.addListener('expandNode', this.#onQuietChange)
    mind.bus.addListener('changeDirection', this.#onLayoutPicked)
    mind.bus.addListener('linkDiv', this.#scheduleQuietSync)
    // the ends of a curve being dragged follow it; a relationship of another shape shows no handles
    mind.bus.addListener('updateArrowDelta', this.#onArrowMoved)
    mind.bus.addListener('selectArrow', this.#onArrowSelected)
    for (const event of ['selectNodes', 'selectNewNode', 'selectArrow', 'selectSummary'] as const) {
      mind.bus.addListener(event, this.#onOtherSelected)
    }
    for (const event of [
      'selectNodes',
      'unselectNodes',
      'selectNewNode',
      'selectArrow',
      'unselectArrow',
      'selectSummary',
      'unselectSummary',
      'scale',
    ] as const) {
      mind.bus.addListener(event, this.#onState)
    }

    this.#libraryUndo = mind.undo.bind(mind)
    this.#libraryRedo = mind.redo.bind(mind)
    this.#libraryRemoveSummary = mind.removeSummary.bind(mind)
    // The library calls these by name (Ctrl+Z, Delete, its menu): they now go through the controller.
    mind.undo = () => void this.undo()
    mind.redo = () => void this.redo()
    mind.removeSummary = (id) => void this.removeSummary(id)
    mind.createSummary = () => void this.addSummary()

    const container = mind.container
    const onKeyDownFirst = (event: KeyboardEvent): void => this.#guardKeys(event)
    const onClick = (event: MouseEvent): void => this.#onClick(event)
    const onCut = (event: Event): void => this.#onCut(event)
    const onCopy = (): void => this.#forgetCut()
    const onComposition = (event: Event): void => {
      this.#composing = event.type === 'compositionstart'
    }
    const onPointerDown = (event: PointerEvent): void => this.#onPointerDown(event)
    const onPointerUp = (event: PointerEvent): void => {
      if (this.#takenPress === null || event.pointerId !== this.#takenPress) return
      this.#takenPress = null
      event.stopPropagation()
    }
    const onDoubleClick = (event: MouseEvent): void => {
      const id = boundaryOf(event.target instanceof Element ? event.target : null)
      if (id === null) return
      event.stopPropagation()
      this.selectBoundary(id)
      this.editBoundaryTitle(id)
    }
    const onMenu = (event: MouseEvent): void => this.#onBoundaryMenu(event)
    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('pointerup', onPointerUp, true)
    container.addEventListener('dblclick', onDoubleClick, true)
    container.addEventListener('contextmenu', onMenu, true)
    container.addEventListener('keydown', onKeyDownFirst, true)
    container.addEventListener('click', onClick, true)
    container.addEventListener('cut', onCut, true)
    container.addEventListener('copy', onCopy, true)
    container.addEventListener('compositionstart', onComposition)
    container.addEventListener('compositionend', onComposition)
    this.#dispose.push(
      installMultiSelect({ mind, addChild: () => this.addChild() }),
      installTopicResize({ mind, setWidth: (id, width) => this.setWidth(id, width) }),
    )
    this.#dispose.push(() => {
      container.removeEventListener('keydown', onKeyDownFirst, true)
      container.removeEventListener('click', onClick, true)
      container.removeEventListener('cut', onCut, true)
      container.removeEventListener('copy', onCopy, true)
      container.removeEventListener('compositionstart', onComposition)
      container.removeEventListener('compositionend', onComposition)
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointerup', onPointerUp, true)
      container.removeEventListener('dblclick', onDoubleClick, true)
      container.removeEventListener('contextmenu', onMenu, true)
    })
  }

  // ---- reading ----

  get layout(): ViewLayout {
    return layoutOfDirection(this.mind.direction, this.#structure)
  }

  /** false while the layout shown only stands in for one the editor cannot draw */
  get layoutExact(): boolean {
    return this.#lastView.layoutExact
  }

  get zoom(): number {
    return this.mind.scaleVal
  }

  get canUndo(): boolean {
    return this.#session.canUndo(this.#key)
  }

  get canRedo(): boolean {
    return this.#session.canRedo(this.#key)
  }

  /** true while the user is picking the other end of a new relationship */
  get pickingRelationship(): boolean {
    return this.#pickingFrom !== null
  }

  /** The theme the sheet is drawn with: its own when this app wrote it, the default one otherwise. */
  get themeId(): ThemeId {
    return this.#look.id
  }

  /** false while the sheet is drawn with the default look because its theme is not one of this app's */
  get themeWritten(): boolean {
    return this.#session.themeOf(this.#key) !== null
  }

  selectedTopicIds(): string[] {
    return (this.mind.currentNodes ?? []).map((topic) => topic.nodeObj.id)
  }

  /** true while a topic, summary or relationship title is being typed */
  get editingText(): boolean {
    return this.mind.nodes.querySelector('#input-box') !== null
  }

  topic(id: string): TopicInfo | null {
    const node = this.#node(id)
    if (!node) return null
    const meta = this.#meta(node)
    return {
      id: node.id,
      title: node.topic,
      labels: [...meta.labels],
      note: meta.note,
      link: meta.link,
      hasPicture: meta.image !== null,
      width: meta.width,
      isRoot: !node.parent,
    }
  }

  // ---- editing: the same functions for the toolbar, the shortcuts, the menu and the AI ----

  /** A new topic under the given one (the selected one when left out). Starts editing its title. */
  addChild(parentId?: string): void {
    const parent = parentId ? this.#element(parentId) : this.mind.currentNode
    if (parent) void this.mind.addChild(parent)
  }

  /** A new topic after the given one (the selected one when left out). */
  addSibling(topicId?: string): void {
    const topic = topicId ? this.#element(topicId) : this.mind.currentNode
    if (topic) void this.mind.insertSibling('after', topic)
  }

  /** Starts typing in the selected topic. */
  beginEdit(): void {
    if (this.mind.currentNode) void this.mind.beginEdit(this.mind.currentNode)
  }

  setTitle(topicId: string, title: string): boolean {
    return this.#patch(topicId, { topic: title })
  }

  setLabels(topicId: string, labels: readonly string[]): boolean {
    const clean = labels.map((label) => label.trim()).filter((label) => label !== '')
    return this.#patchMeta(topicId, { labels: clean })
  }

  setNote(topicId: string, note: string | null): boolean {
    return this.#patchMeta(topicId, { note: note && note.trim() !== '' ? note : null })
  }

  /**
   * Sets or removes a topic's link. Any address is taken and shown as text,
   * also one nothing will ever open: taking it is not opening it. False only
   * for an address in the form of a reference into the file (a link to
   * another topic or to an attachment), which would become a link the editor
   * no longer shows.
   */
  setLink(topicId: string, link: string | null): boolean {
    const address = link?.trim() ?? ''
    if (address === '') return this.#patchMeta(topicId, { link: null })
    if (!isShownLink(address)) return false
    return this.#patchMeta(topicId, { link: address })
  }

  // ---- text format ----

  /** What the topic in hand shows: the one whose title is typed, else the first selected. */
  textFormat(): ShownFormat | null {
    const id = this.#editing?.id ?? this.selectedTopicIds()[0]
    const node = id === undefined ? null : this.#node(id)
    if (!node) return null
    const meta = this.#meta(node)
    return shownFormat(meta.style, meta.titleRuns, this.#textBase(node))
  }

  /**
   * Turns bold, italic, underline or strike on or off. While a title is typed
   * it is the selected part of it (all of it when nothing is selected); else
   * it is every selected topic as a whole, on unless all of them show it.
   */
  toggleTextFormat(key: FormatToggle): boolean {
    const editing = this.#editing
    if (editing) {
      const node = editing.node
      const range = selectionIn(editing.box) ?? { start: 0, end: 0 }
      const shows = partsShow(
        readBox(editing.box),
        range.start,
        range.end,
        key,
        this.#meta(node).style,
        this.#textBase(node),
      )
      return this.#formatTyped({ [key]: !shows })
    }
    const ids = this.selectedTopicIds()
    const nodes = ids.map((id) => this.#node(id)).filter((node) => node !== null)
    if (nodes.length === 0) return false
    const all = nodes.every((node) => {
      const meta = this.#meta(node)
      return shownFormat(meta.style, meta.titleRuns, this.#textBase(node))[key]
    })
    return this.formatTopics(ids, { [key]: !all })
  }

  /**
   * A change of format from the format panel. While a title is typed, what a
   * part can carry goes to the selected part; anything else ends the typing
   * and goes to that topic as a whole. Otherwise it goes to every selected
   * topic as a whole.
   */
  formatText(format: TextFormat): boolean {
    const editing = this.#editing
    if (editing) {
      if (isRunFormat(format)) return this.#formatTyped(format)
      this.commitEdit()
      return this.formatTopics([editing.id], format)
    }
    return this.formatTopics(this.selectedTopicIds(), format)
  }

  /**
   * Gives topics a format as a whole, as one step. The keys the change sets are
   * taken off the parts of their titles, so the whole title shows it. False
   * when none of the topics is there.
   */
  formatTopics(ids: readonly string[], format: TextFormat): boolean {
    const found = ids.filter((id) => this.#node(id))
    if (found.length === 0) return false
    for (const id of found) this.#restyled.add(id)
    this.edit((root) => {
      for (const id of found) {
        const node = this.mind.getObjById(id, root) as MapNode | null
        if (!node) continue
        const meta = this.#meta(node)
        const next = formatTopic(meta.style, meta.titleRuns, format, this.#textBase(node))
        node.metadata = { ...meta, style: next.style, titleRuns: next.titleRuns }
      }
    })
    return true
  }

  /** What a topic shows without a format of its own: the size and weight its theme gives its level. */
  #textBase(node: NodeObj): TextBase {
    let depth = 1
    for (let up = node.parent; up; up = up.parent) depth++
    return this.textBaseAt(depth)
  }

  /** What a topic this deep (1: the central topic) shows without a format of its own. */
  textBaseAt(depth: number): TextBase {
    const { shapes, deepSizes } = this.#look
    const shape = depth === 1 ? shapes.central : depth === 2 ? shapes.main : shapes.sub
    const deep = depth > 3 ? deepSizes[Math.min(depth - 4, deepSizes.length - 1)] : undefined
    return { fontWeight: shape.fontWeight, fontSize: deep ?? shape.fontSize }
  }

  /**
   * The edit box of a topic title opened. A title with parts is put into it as
   * parts, and the box takes the format keys (`#onTitleKey`). The listeners go
   * on before the library's own (it adds them after it reports the opening), so
   * the parts are read off the box before the library takes its text.
   */
  #beginTitleEdit(node: NodeObj): void {
    const box = this.mind.nodes.querySelector<HTMLElement>('#input-box')
    if (!box) return
    const meta = this.#meta(node)
    const runs = drawnRuns(meta.titleRuns, node.topic) ? meta.titleRuns : null
    const editing: TitleEdit = {
      id: node.id,
      node,
      box,
      before: runs ? normaliseRuns(runs) : null,
      cancelled: false,
    }
    this.#editing = editing
    if (runs) {
      fillBox(box, runs)
      // the library selected the whole title; the parts replaced what it selected
      selectIn(box, 0, node.topic.length)
    }
    box.addEventListener('keydown', (event) => this.#onTitleKey(event, editing))
    box.addEventListener('blur', () => this.#endTitleEdit(editing), { once: true })
    // the format panel says that its toggles now go to the selected characters
    this.#host.onStateChange()
  }

  #onTitleKey(event: KeyboardEvent, editing: TitleEdit): void {
    if (event.isComposing) return
    if (event.key === 'Escape') {
      editing.cancelled = true
      return
    }
    const toggle = formatShortcut(event)
    if (!toggle) return
    event.preventDefault()
    this.toggleTextFormat(toggle)
  }

  /** Gives the selected part of the title being typed a format (all of it when nothing is selected). */
  #formatTyped(format: RunFormat): boolean {
    const editing = this.#editing
    if (!editing) return false
    const { box, node } = editing
    const range = selectionIn(box) ?? { start: 0, end: 0 }
    const runs = formatParts(
      readBox(box),
      range.start,
      range.end,
      format,
      this.#meta(node).style,
      this.#textBase(node),
    )
    fillBox(box, runs)
    selectIn(box, range.start, range.end)
    return true
  }

  /**
   * The edit box is closing. Runs before the library takes the box's text. The
   * parts are read off the box and cut the way the library cuts the text; when
   * they differ from the ones the title had, they go into the node now, so the
   * library's step for a new title carries them, or as a step of their own when
   * the text stayed the same (the library then records nothing).
   */
  #endTitleEdit(editing: TitleEdit): void {
    if (this.#editing === editing) this.#editing = null
    if (this.#destroyed) return
    this.#host.onStateChange()
    if (editing.cancelled) return
    const { box, node } = editing
    // what the library takes: the box's text, cut, and nothing when it is empty
    const text = box.innerText?.trim() || ''
    if (text === '') return
    const read = trimRuns(readBox(box), text)
    const runs = read ? normaliseRuns(read) : null
    if (JSON.stringify(runs) === JSON.stringify(editing.before)) return
    this.#restyled.add(node.id)
    if (text !== node.topic) {
      node.metadata = { ...this.#meta(node), titleRuns: runs }
      return
    }
    queueMicrotask(() => {
      if (!this.#destroyed && this.#node(node.id)) this.#patchMeta(node.id, { titleRuns: runs })
    })
  }

  /**
   * Gives a topic's box a width in pixels, or the width of its text again
   * (null), as one step. False when the box already has that width.
   */
  setWidth(topicId: string, width: number | null): boolean {
    const node = this.#node(topicId)
    const next = boxWidth(width)
    if (!node || (width !== null && next === null)) return false
    if (this.#meta(node).width === next) return false
    return this.#patchMeta(topicId, { width: next })
  }

  /**
   * Takes the picture off a topic, as one step. The engine deletes a picture
   * only for a topic named this way, so a state that merely lacks one never
   * does. The archive entry stays (another topic may show it). False when the
   * topic has no picture.
   */
  removePicture(topicId: string): boolean {
    const node = this.#node(topicId)
    if (!node || !this.#meta(node).image) return false
    this.#removedPictures.add(topicId)
    if (this.#patchMeta(topicId, { image: null })) return true
    this.#removedPictures.delete(topicId)
    return false
  }

  /**
   * Deletes topics with everything below them. When that would take elements
   * the editor does not show, the user is asked first (`ask`) or the deletion
   * is turned down with their number (`refuse`). The user is not asked about a
   * boundary the map draws; a caller that may not ask counts it all the same
   * (`#takenWith`).
   */
  async removeTopics(ids: readonly string[], mode: DeleteMode = 'ask'): Promise<RemoveOutcome> {
    const wanted = new Set(ids)
    wanted.delete(this.mind.nodeData.id)
    const found = [...wanted].filter((id) => this.#node(id))
    if (found.length === 0) return { ok: false, reason: 'nothing' }
    const preserved = this.#takenWith(found, mode)
    if (preserved > 0) {
      if (mode === 'refuse') return { ok: false, reason: 'preserved', preserved }
      if (!(await this.#host.confirmDelete(preserved))) {
        return { ok: false, reason: 'cancelled', preserved }
      }
    }
    this.edit((root) => {
      const strip = (node: NodeObj): void => {
        if (!node.children) return
        node.children = node.children.filter((child) => !wanted.has(child.id))
        node.children.forEach(strip)
      }
      strip(root)
    })
    return { ok: true }
  }

  /**
   * What a deletion takes that stands in its way: for the user (`ask`), the
   * elements they cannot see; for a caller that may not ask (`refuse`), every
   * preserve-only element, boundaries on the map among them.
   */
  #takenWith(ids: readonly string[], mode: DeleteMode): number {
    return mode === 'refuse'
      ? this.#session.preservedWith(this.#key, ids)
      : this.#session.hiddenWith(this.#key, ids)
  }

  /** Removes a summary (by the id of its summary topic), asking first when branches hang under it. */
  async removeSummary(id: string, mode: DeleteMode = 'ask'): Promise<RemoveOutcome> {
    if (!this.mind.summaries.some((summary) => summary.id === id)) {
      return { ok: false, reason: 'nothing' }
    }
    const preserved = this.#takenWith([id], mode)
    if (preserved > 0) {
      if (mode === 'refuse') return { ok: false, reason: 'preserved', preserved }
      if (!(await this.#host.confirmDelete(preserved))) {
        return { ok: false, reason: 'cancelled', preserved }
      }
    }
    this.#libraryRemoveSummary(id)
    return { ok: true }
  }

  /**
   * A summary over the selected topics: the branches of their common parent
   * from the first to the last selected. False when the selection has none
   * (nothing selected, or only the central topic).
   */
  addSummary(): boolean {
    const range = this.#summaryRange()
    if (!range) return false
    const before = new Set(this.mind.summaries.map((summary) => summary.id))
    this.mind.createSummaryFrom({ ...range, label: this.#strings.summary })
    const added = this.mind.summaries.find((summary) => !before.has(summary.id))
    const group = added ? this.mind.container.querySelector(`#s-${added.id}`) : null
    // straight into typing its title, as with a new topic
    if (group) this.mind.editSummary(group as Parameters<MindElixirInstance['editSummary']>[0])
    return true
  }

  /** A relationship between two topics. False when one of them is not drawn (folded away). */
  addRelationship(fromId: string, toId: string, title = ''): boolean {
    const from = this.#element(fromId)
    const to = this.#element(toId)
    if (!from || !to || from === to) return false
    // The library's own default title is English text; a new line starts without one.
    this.mind.createArrow(from, to, { label: title } as Parameters<
      MindElixirInstance['createArrow']
    >[2])
    return true
  }

  /** Starts a relationship from the selected topic; the next topic the user clicks is its other end. */
  pickRelationshipTarget(): boolean {
    const from = this.mind.currentNode
    if (!from) return false
    this.#pickingFrom = from.nodeObj.id
    this.#host.onStateChange()
    return true
  }

  cancelRelationshipPick(): void {
    if (this.#pickingFrom === null) return
    this.#pickingFrom = null
    this.#host.onStateChange()
  }

  /** The user picks a layout. This is what writes a layout to the file. */
  setLayout(layout: ViewLayout): void {
    const mind = this.mind
    // the rules for a tree or a timeline are in place before the library lays the map out again
    this.#setStructure(structureOfLayout(layout))
    if (layout === 'left') mind.initLeft()
    else if (layout === 'right' || layout === 'tree') mind.initRight()
    else if (layout === 'down' || layout === 'timeline') mind.initDown()
    else mind.initSide()
  }

  /** The rules of `map.css` and the branch lines follow this mark on the map's container. */
  #setStructure(structure: MapStructure): void {
    this.#structure = structure
    const { dataset } = this.mind.container
    if (structure === 'map') delete dataset.mmStructure
    else dataset.mmStructure = structure
    // a tree grows from its top left: centring the central topic would leave half the screen empty
    this.mind.alignment = structure === 'tree' ? 'nodes' : 'root'
  }

  /**
   * The user picks a theme for this sheet. This is what writes a theme to the
   * file, and the only thing that does; it is not a step of the history.
   * False, with nothing written, when the sheet already carries that theme.
   */
  setTheme(id: ThemeId): boolean {
    if (this.#session.themeOf(this.#key) === id) return false
    this.commitEdit()
    this.#session.applyTheme(this.#key, id)
    this.#showLook(themeLook(id))
    this.#host.onStateChange()
    return true
  }

  /** Folds or unfolds every branch. Not a step of the history, like folding one branch. */
  setAllFolded(folded: boolean): void {
    const visit = (node: NodeObj, isRoot: boolean): void => {
      if (!isRoot) {
        if (folded && node.children?.length) node.expanded = false
        else delete node.expanded
      }
      node.children?.forEach((child) => visit(child, false))
    }
    visit(this.mind.nodeData, true)
    this.mind.refresh()
    this.#sync({ step: false })
  }

  /**
   * Edits the map as data, as one step: `change` gets the library's live node
   * tree and may add, remove, move and edit nodes (titles, and the labels,
   * note, link, text format and line values in `metadata`), and the sheet's
   * relationships, summaries and boundaries (`MapParts`). The result is drawn,
   * recorded as a single step of the history and reconciled, exactly like
   * something the user did. This is the way in for edits that are not one
   * library call: several at once, topics that are folded away and have no
   * element, and every change of format.
   *
   * What changed a format, or removed a relationship, summary or boundary, is
   * named in `options`: the engine writes those only for what is named.
   * A topic that stands under another parent afterwards (moved, or new) takes
   * the line values its new parent has written on itself, with its branch, in
   * the same step (`line-format.ts`); the keys the same edit set on it
   * (`lineEdits`) are put on top of those, key by key.
   */
  edit(change: (root: MapNode, parts: MapParts) => void, options: EditOptions = {}): void {
    const mind = this.mind
    const selected = this.selectedTopicIds()
    const arrow = this.#currentArrowId()
    const summary = this.#currentSummaryId()
    const parents = parentsOf(mind.nodeData)
    this.#name(options)
    const parts: MapParts = {
      arrows: (mind.arrows ?? []) as MapArrow[],
      summaries: (mind.summaries ?? []) as MapSummary[],
      boundaries: boundariesOf({ meta: mind.meta }),
    }
    change(mind.nodeData as MapNode, parts)
    mind.arrows = parts.arrows
    mind.summaries = parts.summaries
    mind.meta = withBoundaries(mind.meta, parts.boundaries)
    normaliseTree(mind.nodeData, topicIdsOf(this.#lastView))
    this.#keepableRecordIds(parts)
    // the keys this edit set itself win over the line of a new parent
    for (const id of inheritArrivals(mind.nodeData, parents, options.lineEdits)) {
      this.#relined.add(id)
    }
    mind.refresh()
    this.#putSelectionBack(selected, arrow, summary)
    mind.bus.fire('operation', {
      name: 'reshapeNode',
      obj: mind.nodeData,
      origin: mind.nodeData,
    })
  }

  /** Takes the names of what an edit changed into the lists the next reconcile hands the engine. */
  #name(options: EditOptions): void {
    const lists: [readonly string[] | undefined, Set<string>][] = [
      [options.restyled, this.#restyled],
      [options.restyledLines, this.#relined],
      [options.refilled, this.#refilled],
      [options.restyledRelationships, this.#restyledRelationships],
      [options.restyledSummaries, this.#restyledSummaries],
      [options.restyledBoundaries, this.#restyledBoundaries],
      [options.removedRelationships, this.#removedRelationships],
      [options.removedSummaries, this.#removedSummaries],
      [options.removedBoundaries, this.#removedBoundaries],
    ]
    for (const [ids, into] of lists) for (const id of ids ?? []) into.add(id)
  }

  /** New relationships, summaries and boundaries get ids the file can keep, as new topics do. */
  #keepableRecordIds(parts: MapParts): void {
    const known = new Set([
      ...this.#lastView.relationships.map((line) => line.id),
      ...(this.#lastView.boundaries ?? []).map((boundary) => boundary.id),
    ])
    for (const record of [...parts.arrows, ...parts.boundaries]) {
      if (typeof record.id !== 'string' || (!known.has(record.id) && !XMIND_ID.test(record.id))) {
        record.id = newXmindId()
      }
    }
    for (const summary of parts.summaries) {
      if (typeof summary.id !== 'string' || summary.id === '') summary.id = newXmindId()
    }
  }

  /** After the map was drawn again: what was selected and is still there is selected again. */
  #putSelectionBack(topics: readonly string[], arrow: string | null, summary: string | null): void {
    const mind = this.mind
    this.#reselecting = true
    try {
      const again = topics.map((id) => this.#element(id)).filter((topic) => topic !== null)
      if (again.length > 0) mind.selectNodes(again)
      const arrowGroup = arrow === null ? null : this.#arrowGroup(arrow)
      if (arrowGroup) mind.selectArrow(arrowGroup)
      const summaryGroup = summary === null ? null : this.#summaryGroup(summary)
      if (summaryGroup) mind.selectSummary(summaryGroup)
    } finally {
      this.#reselecting = false
    }
    this.#keepBoundarySelection()
  }

  // ---- what is selected, and the format of what is on the map ----

  /** What is selected: topics, one relationship, one summary, one boundary, or nothing. */
  selection(): MapSelection {
    if (this.#selectedBoundary !== null) return { kind: 'boundary', id: this.#selectedBoundary }
    const arrow = this.#currentArrowId()
    if (arrow !== null) return { kind: 'relationship', id: arrow }
    const summary = this.#currentSummaryId()
    if (summary !== null) return { kind: 'summary', id: summary }
    const ids = this.selectedTopicIds()
    return ids.length > 0 ? { kind: 'topics', ids } : { kind: 'none' }
  }

  /** The boundary selected; null when none is. */
  get selectedBoundaryId(): string | null {
    return this.#selectedBoundary
  }

  /**
   * Selects a boundary, which ends every other selection (and a selection of
   * anything else ends the boundary's). Null: no boundary selected. False when
   * the sheet has no such boundary, or nothing changed.
   */
  selectBoundary(id: string | null): boolean {
    if (id === null) {
      if (this.#selectedBoundary === null) return false
      this.#selectedBoundary = null
      this.#markBoundary()
      this.#host.onStateChange()
      return true
    }
    if (!this.boundary(id)) return false
    this.#reselecting = true
    try {
      this.mind.clearSelection()
    } finally {
      this.#reselecting = false
    }
    this.#selectedBoundary = id
    this.#markBoundary()
    this.#host.onStateChange()
    return true
  }

  /** The line into a topic: the values written on it, and the values it is drawn with now. */
  topicLine(id: string): { own: ViewBranchLine; drawn: ResolvedBranchLine } | null {
    const node = this.#node(id)
    return node ? { own: ownLineOf(node), drawn: this.#decorator.lineOf(node) } : null
  }

  /** A relationship's values and its curve (null: drawn on its own); the selected one when no id is given. */
  relationshipFormat(
    id: string | null = this.#currentArrowId(),
  ): { style: ViewRelationshipStyle; curve: ViewCurve | null } | null {
    const arrow = id === null ? undefined : this.#arrows().find((line) => line.id === id)
    if (!arrow) return null
    const curve = arrow.metadata?.curve
    return { style: { ...(arrow.metadata?.style ?? {}) }, curve: curve ? { ...curve } : null }
  }

  /** A summary's bracket values, by its summary topic id; the selected one when no id is given. */
  summaryFormat(id: string | null = this.#currentSummaryId()): ViewSummaryStyle | null {
    const summary = id === null ? undefined : this.#summaries().find((entry) => entry.id === id)
    return summary ? { ...(summary.metadata?.style ?? {}) } : null
  }

  /** Every boundary of the sheet the editor holds, those under folded branches too. */
  boundaries(): ViewBoundary[] {
    return boundariesOf({ meta: this.mind.meta })
  }

  /** A boundary; the selected one when no id is given. */
  boundary(id: string | null = this.#selectedBoundary): ViewBoundary | null {
    return id === null ? null : (this.boundaries().find((boundary) => boundary.id === id) ?? null)
  }

  // ---- the line into a branch ----

  /**
   * Sets values of the line into each of the topics (the selected ones when
   * none are given) and of every line below them, over the values the same
   * keys had there; `null` takes a key off. For the central topic that is the
   * whole map. One step of the history.
   */
  setBranchLine(
    change: BranchLineChange,
    ids: readonly string[] = this.selectedTopicIds(),
  ): FormatOutcome {
    const edits = branchLineEdits(change)
    return edits === null ? refused('invalid-value') : this.#editBranches(ids, edits)
  }

  /**
   * Takes every line value off the topics and every topic below them, so the
   * branch follows the one above it, or the theme. One step of the history.
   */
  clearBranchLine(ids: readonly string[] = this.selectedTopicIds()): FormatOutcome {
    return this.#editBranches(ids, CLEAR_BRANCH_LINE)
  }

  #editBranches(ids: readonly string[], edits: StyleEdits<BranchLineKey>): FormatOutcome {
    const found = ids.filter((id) => this.#node(id))
    if (found.length === 0) return refused('nothing')
    const changes = found.some((id) =>
      branchNodes(this.#node(id)!).some(
        (node) => !sameValues(ownLineOf(node), withEdits(ownLineOf(node), edits)),
      ),
    )
    if (!changes) return refused('unchanged')
    const lineEdits: LineEditsById = new Map()
    for (const id of found) noteBranchLineEdits(lineEdits, this.#node(id)!, edits)
    this.commitEdit()
    this.edit(
      (root) => {
        for (const id of found) {
          const node = this.mind.getObjById(id, root)
          if (node) for (const changed of editBranchLine(node, edits)) this.#relined.add(changed)
        }
      },
      { lineEdits },
    )
    return { ok: true }
  }

  // ---- the map-wide line settings: the theme panel, outside the history ----

  /** The tapered lines and the branch colours the sheet is drawn with. */
  get lineSettings(): MapLineSettings {
    return this.#decorator.lineSettings
  }

  /**
   * The user switches the tapered lines of this sheet. Written into the
   * sheet's theme like a theme the user picks; not a step of the history.
   * False, with nothing written, when the sheet already reads that way.
   */
  setTapered(on: boolean): boolean {
    this.commitEdit()
    if (!this.#session.applyTapered(this.#key, on)) return false
    this.#showLineSettings()
    return true
  }

  /**
   * The user switches the branch colours of this sheet, as `setTapered`.
   * Switched on again, a sheet whose theme is not one of this app's gets back
   * the colour list it had before they were switched off (`session.applyRainbow`).
   */
  setRainbow(on: boolean): boolean {
    this.commitEdit()
    if (!this.#session.applyRainbow(this.#key, on)) return false
    this.#showLineSettings()
    return true
  }

  #showLineSettings(): void {
    this.#decorator.setLineSettings(lineSettingsOfSheet(this.#session.sheet(this.#key)))
    this.mind.linkDiv()
    this.#host.onStateChange()
  }

  // ---- relationships ----

  /** Sets values of relationships (the selected one when none are given); `null` takes a key off. One step. */
  setRelationshipStyle(
    change: RelationshipStyleChange,
    ids: readonly string[] = this.#selectedArrowIds(),
  ): FormatOutcome {
    const edits = relationshipStyleEdits(change)
    return edits === null ? refused('invalid-value') : this.#restyleArrows(ids, edits)
  }

  /** Takes every value off relationships; their curve stays. One step. */
  clearRelationshipStyle(ids: readonly string[] = this.#selectedArrowIds()): FormatOutcome {
    return this.#restyleArrows(ids, CLEAR_RELATIONSHIP_STYLE)
  }

  /**
   * Gives a relationship a curve (its two control points, as the file keeps
   * them), or null: the curve it is drawn with on its own. One step.
   */
  setRelationshipCurve(id: string, curve: ViewCurve | null): FormatOutcome {
    return this.#restyleArrows([id], null, curve)
  }

  /** "Curve on its own": the relationships (the selected one when none are given) lose the curve they were given. One step. */
  resetRelationshipCurve(ids: readonly string[] = this.#selectedArrowIds()): FormatOutcome {
    return this.#restyleArrows(ids, null, null)
  }

  #restyleArrows(
    ids: readonly string[],
    edits: StyleEdits<RelationshipStyleKey> | null,
    curve?: ViewCurve | null,
  ): FormatOutcome {
    const wanted = new Set(ids)
    const found = this.#arrows().filter((arrow) => wanted.has(arrow.id))
    if (found.length === 0) return refused('nothing')
    const changes = found
      .filter((arrow) => {
        const style = arrow.metadata?.style
        const restyled = edits !== null && !sameValues(style, withEdits(style, edits))
        const reshaped = curve !== undefined && !sameCurve(arrow.metadata?.curve, curve)
        return restyled || reshaped
      })
      .map((arrow) => arrow.id)
    if (changes.length === 0) return refused('unchanged')
    this.commitEdit()
    this.edit(
      (_root, parts) => {
        for (const arrow of parts.arrows) {
          if (changes.includes(arrow.id)) restyleArrowRecord(arrow, edits, curve)
        }
      },
      { restyledRelationships: changes },
    )
    return { ok: true }
  }

  // ---- summaries ----

  /** Sets the bracket of summaries (by summary topic id; the selected one when none are given). One step. */
  setSummaryStyle(
    change: SummaryStyleChange,
    ids: readonly string[] = this.#selectedSummaryIds(),
  ): FormatOutcome {
    const edits = summaryStyleEdits(change)
    return edits === null ? refused('invalid-value') : this.#restyleSummaries(ids, edits)
  }

  clearSummaryStyle(ids: readonly string[] = this.#selectedSummaryIds()): FormatOutcome {
    return this.#restyleSummaries(ids, CLEAR_SUMMARY_STYLE)
  }

  #restyleSummaries(ids: readonly string[], edits: StyleEdits<SummaryStyleKey>): FormatOutcome {
    const wanted = new Set(ids)
    const found = this.#summaries().filter((summary) => wanted.has(summary.id))
    if (found.length === 0) return refused('nothing')
    const changes = found
      .filter((summary) => {
        const style = summary.metadata?.style
        return !sameValues(style, withEdits(style, edits))
      })
      .map((summary) => summary.id)
    if (changes.length === 0) return refused('unchanged')
    this.commitEdit()
    this.edit(
      (_root, parts) => {
        for (const summary of parts.summaries) {
          if (changes.includes(summary.id)) restyleSummaryRecord(summary, edits)
        }
      },
      { restyledSummaries: changes },
    )
    return { ok: true }
  }

  // ---- boundaries ----

  /**
   * A boundary around the topics (the selected ones when none are given): the
   * branches of one parent from the first to the last of them, or the whole
   * map for the central topic alone. It carries no values of its own and is
   * selected afterwards. One step. Turned down with the reason
   * (`boundary-edit.ts`), which the host is told as well.
   */
  addBoundary(ids: readonly string[] = this.selectedTopicIds()): BoundaryOutcome {
    const nodes = ids.map((id) => this.#node(id)).filter((node) => node !== null)
    const bothSides = this.mind.direction === 2 && this.#structure === 'map'
    const place = boundaryPlaceFor(nodes, bothSides)
    if (!place.ok) {
      this.#host.onNotice?.({ code: 'boundary-refused', reason: place.reason })
      return place
    }
    this.commitEdit()
    const id = newXmindId()
    this.edit((_root, parts) => {
      parts.boundaries.push({
        id,
        topicId: place.topicId,
        range: place.range,
        title: '',
        style: {},
      })
    })
    this.selectBoundary(id)
    return { ok: true, id }
  }

  /** Removes a boundary (the selected one when none is given); the topics it went around stay. One step. */
  removeBoundary(id: string | null = this.#selectedBoundary): boolean {
    if (id === null || !this.boundary(id)) return false
    this.commitEdit()
    if (this.#selectedBoundary === id) this.#selectedBoundary = null
    this.edit(
      (_root, parts) => {
        parts.boundaries = parts.boundaries.filter((boundary) => boundary.id !== id)
      },
      { removedBoundaries: [id] },
    )
    this.#host.onStateChange()
    return true
  }

  /** Gives a boundary a title, on one line; an empty one takes the title off. Text only. One step; false when it is the same. */
  setBoundaryTitle(id: string, title: string): boolean {
    const boundary = this.boundary(id)
    const next = oneLineTitle(title)
    if (!boundary || boundary.title === next) return false
    this.edit((_root, parts) => {
      const target = parts.boundaries.find((entry) => entry.id === id)
      if (target) target.title = next
    })
    return true
  }

  /** Opens the box a boundary's title is typed in (the selected one when none is given). */
  editBoundaryTitle(id: string | null = this.#selectedBoundary): boolean {
    const boundary = id === null ? null : this.boundary(id)
    if (!boundary || this.editingText) return false
    const at = this.#boundaryTitlePlace(boundary.id)
    if (!at) return false
    openBoundaryTitleBox({
      nodes: this.mind.nodes,
      title: boundary.title,
      x: at.x,
      y: at.y,
      done: (title) => {
        if (this.#destroyed) return
        if (title !== null) this.setBoundaryTitle(boundary.id, title)
        this.mind.container.focus()
        this.#host.onStateChange()
      },
    })
    this.#host.onStateChange()
    return true
  }

  /** Sets values of boundaries (the selected one when none are given); `null` takes a key off. One step. */
  setBoundaryStyle(
    change: BoundaryStyleChange,
    ids: readonly string[] = this.#selectedBoundaryIds(),
  ): FormatOutcome {
    const edits = boundaryStyleEdits(change)
    return edits === null ? refused('invalid-value') : this.#restyleBoundaries(ids, edits)
  }

  clearBoundaryStyle(ids: readonly string[] = this.#selectedBoundaryIds()): FormatOutcome {
    return this.#restyleBoundaries(ids, CLEAR_BOUNDARY_STYLE)
  }

  #restyleBoundaries(ids: readonly string[], edits: StyleEdits<BoundaryStyleKey>): FormatOutcome {
    const wanted = new Set(ids)
    const found = this.boundaries().filter((boundary) => wanted.has(boundary.id))
    if (found.length === 0) return refused('nothing')
    const changes = found
      .filter((boundary) => !sameValues(boundary.style, withEdits(boundary.style, edits)))
      .map((boundary) => boundary.id)
    if (changes.length === 0) return refused('unchanged')
    this.commitEdit()
    this.edit(
      (_root, parts) => {
        for (const boundary of parts.boundaries) {
          if (changes.includes(boundary.id)) {
            boundary.style = withEdits(boundary.style, edits) as ViewBoundaryStyle
          }
        }
      },
      { restyledBoundaries: changes },
    )
    return { ok: true }
  }

  // ---- taking a format off ----

  /**
   * "Clear format" for what is selected. Topics: their text format (as
   * `formatText({ clear: true })`) and the line values of each and of every
   * topic below it, so their branches follow the one above or the theme. A
   * relationship, a summary or a boundary: its values. One step.
   */
  clearFormat(): FormatOutcome {
    const selection = this.selection()
    switch (selection.kind) {
      case 'topics':
        return this.#clearTopics(selection.ids)
      case 'relationship':
        return this.clearRelationshipStyle([selection.id])
      case 'summary':
        return this.clearSummaryStyle([selection.id])
      case 'boundary':
        return this.clearBoundaryStyle([selection.id])
      default:
        return refused('nothing')
    }
  }

  #clearTopics(ids: readonly string[]): FormatOutcome {
    const found = ids.filter((id) => this.#node(id))
    if (found.length === 0) return refused('nothing')
    const cleared = (node: NodeObj) => {
      const meta = this.#meta(node)
      return formatTopic(meta.style, meta.titleRuns, { clear: true }, this.#textBase(node))
    }
    const changes = found.some((id) => {
      const node = this.#node(id)!
      const meta = this.#meta(node)
      const next = cleared(node)
      const lines = branchNodes(node).some((at) => Object.keys(ownLineOf(at)).length > 0)
      return (
        lines ||
        JSON.stringify(next.style) !== JSON.stringify(meta.style) ||
        JSON.stringify(next.titleRuns) !== JSON.stringify(meta.titleRuns)
      )
    })
    if (!changes) return refused('unchanged')
    const lineEdits: LineEditsById = new Map()
    for (const id of found) noteBranchLineEdits(lineEdits, this.#node(id)!, CLEAR_BRANCH_LINE)
    this.commitEdit()
    this.edit(
      (root) => {
        for (const id of found) {
          const node = this.mind.getObjById(id, root) as MapNode | null
          if (!node) continue
          const next = cleared(node)
          node.metadata = { ...this.#meta(node), style: next.style, titleRuns: next.titleRuns }
          for (const changed of editBranchLine(node, CLEAR_BRANCH_LINE)) this.#relined.add(changed)
        }
      },
      { restyled: found, lineEdits },
    )
    return { ok: true }
  }

  // ---- the format painter ----

  /** What the screen shows of the format painter. */
  get formatPainter(): PainterState {
    const held = this.#painter
    return held ? { active: true, sticky: held.sticky, kind: held.kind } : { ...PAINTER_OFF }
  }

  /**
   * Picks up the format of what is selected (the first topic, or the
   * relationship, summary or boundary). `sticky`: it stays held after it went
   * on, until Esc or `endFormatPainter`; else it goes onto the next item of
   * the same kind pressed and is let go.
   */
  startFormatPainter(sticky = false): PainterOutcome {
    this.commitEdit()
    const held = this.#pickUp(sticky)
    if (!held) {
      this.#host.onNotice?.({ code: 'painter-nothing-selected' })
      return refused('nothing-selected')
    }
    this.#painter = held
    this.#markPainter()
    this.#host.onStateChange()
    return { ok: true }
  }

  /**
   * The painter's button: off, it picks up the format for one item; pressed
   * again while holding it for one, it holds it until let go; pressed while
   * holding it so, it lets go.
   */
  toggleFormatPainter(): PainterState {
    const held = this.#painter
    if (!held) this.startFormatPainter(false)
    else if (!held.sticky) {
      held.sticky = true
      this.#host.onStateChange()
    } else this.endFormatPainter()
    return this.formatPainter
  }

  /** Lets go of the format held. False when none was. */
  endFormatPainter(): boolean {
    if (!this.#painter) return false
    this.#painter = null
    this.#markPainter()
    this.#host.onStateChange()
    return true
  }

  /**
   * Puts the format held onto an item, as one step (a press on the map does
   * this). An item of another kind is turned down, and the host is told.
   * Held for one item, the painter lets go once it went on.
   */
  applyFormatTo(target: MapTarget): PainterOutcome {
    const held = this.#painter
    if (!held) return refused('inactive')
    if (target.kind !== held.kind) {
      this.#host.onNotice?.({ code: 'painter-wrong-kind', held: held.kind, pressed: target.kind })
      return refused('wrong-kind')
    }
    let outcome: FormatOutcome
    switch (held.kind) {
      case 'topic':
        outcome = this.#paintTopic(target.id, held.paint)
        break
      case 'relationship':
        outcome = this.#restyleArrows([target.id], held.edits)
        break
      case 'summary':
        outcome = this.#restyleSummaries([target.id], held.edits)
        break
      case 'boundary':
        outcome = this.#restyleBoundaries([target.id], held.edits)
        break
    }
    if (!outcome.ok && outcome.reason === 'nothing') return refused('nothing')
    if (!held.sticky) this.endFormatPainter()
    return { ok: true }
  }

  /** The format of what is selected, as the painter holds it. */
  #pickUp(sticky: boolean): HeldFormat | null {
    const selection = this.selection()
    switch (selection.kind) {
      case 'topics': {
        const node = this.#node(selection.ids[0]!)
        if (!node) return null
        const meta = this.#meta(node)
        let depth = 1
        for (let up = node.parent; up; up = up.parent) depth++
        const theme = themeColorsAt(this.#look, depth, branchIndexOf(node))
        const paint = topicPaintOf({
          style: meta.style,
          line: ownLineOf(node),
          base: this.#textBase(node),
          themeText: theme.text,
          themeFill: theme.fill,
          drawn: this.#decorator.lineOf(node),
        })
        return { kind: 'topic', sticky, paint }
      }
      case 'relationship': {
        const style = this.relationshipFormat(selection.id)?.style
        const edits = stylePaintOf(
          style,
          RELATIONSHIP_STYLE_PROPERTIES,
          isWritableRelationshipStyle,
        )
        return { kind: 'relationship', sticky, edits }
      }
      case 'summary': {
        const style = this.summaryFormat(selection.id)
        const edits = stylePaintOf(style, SUMMARY_STYLE_PROPERTIES, isWritableSummaryStyle)
        return { kind: 'summary', sticky, edits }
      }
      case 'boundary': {
        const style = this.boundary(selection.id)?.style
        const edits = stylePaintOf(style, BOUNDARY_STYLE_PROPERTIES, isWritableBoundaryStyle)
        return { kind: 'boundary', sticky, edits }
      }
      default:
        return null
    }
  }

  /** A topic takes a painter's text format and fill, and its branch the line. One step. */
  #paintTopic(id: string, paint: TopicPaint): FormatOutcome {
    const node = this.#node(id)
    if (!node) return refused('nothing')
    const meta = this.#meta(node)
    const next = paintedTopicStyle(meta.style, meta.titleRuns, paint)
    const restyled =
      JSON.stringify(next.style) !== JSON.stringify(meta.style) ||
      JSON.stringify(next.titleRuns) !== JSON.stringify(meta.titleRuns)
    const relined = branchNodes(node).some(
      (at) => !sameValues(ownLineOf(at), withEdits(ownLineOf(at), paint.line)),
    )
    if (!restyled && !relined) return refused('unchanged')
    const refilled = paint.fill !== undefined && paint.fill !== meta.style.fill
    const lineEdits: LineEditsById = new Map()
    noteBranchLineEdits(lineEdits, node, paint.line)
    this.commitEdit()
    this.edit(
      (root) => {
        const target = this.mind.getObjById(id, root) as MapNode | null
        if (!target) return
        const own = this.#meta(target)
        const painted = paintedTopicStyle(own.style, own.titleRuns, paint)
        target.metadata = { ...own, style: painted.style, titleRuns: painted.titleRuns }
        for (const changed of editBranchLine(target, paint.line)) this.#relined.add(changed)
      },
      { restyled: [id], refilled: refilled ? [id] : [], lineEdits },
    )
    return { ok: true }
  }

  // ---- history ----

  /** One step back. False when there is none. */
  undo(): boolean {
    if (!this.canUndo) return false
    this.#libraryUndo()
    const view = this.#session.undo(this.#key)
    if (view) this.#afterHistoryMove(view)
    return true
  }

  /** One step forward again. False when there is none. */
  redo(): boolean {
    if (!this.canRedo) return false
    this.#libraryRedo()
    const view = this.#session.redo(this.#key)
    if (view) this.#afterHistoryMove(view)
    return true
  }

  // ---- view ----

  zoomIn(): void {
    this.mind.scale(Math.min(ZOOM_MAX, round(this.mind.scaleVal + ZOOM_STEP)))
  }

  zoomOut(): void {
    this.mind.scale(Math.max(ZOOM_MIN, round(this.mind.scaleVal - ZOOM_STEP)))
  }

  zoomReset(): void {
    this.mind.scale(1)
    this.mind.toCenter()
  }

  zoomFit(): void {
    this.mind.scaleFit()
  }

  /** The texts changed (another language): new topics, new summaries and the context menu follow. */
  setStrings(strings: MapStrings): void {
    this.#strings = strings
    this.mind.newTopicName = strings.newTopic
    const items = this.mind.container.querySelectorAll<HTMLElement>('.context-menu .menu-list > li')
    const own = this.#menuEntries().map((entry) => entry.name)
    const builtIn: Readonly<Record<string, string>> = {
      'cm-add_child': strings.menu.addChild,
      'cm-add_parent': strings.menu.addParent,
      'cm-add_sibling': strings.menu.addSibling,
      'cm-remove_child': strings.menu.removeNode,
      'cm-up': strings.menu.moveUp,
      'cm-down': strings.menu.moveDown,
      'cm-summary': strings.menu.summary,
    }
    items.forEach((item, at) => {
      const text = builtIn[item.id] ?? own[at - (items.length - own.length)]
      if (text !== undefined && item.firstElementChild) item.firstElementChild.textContent = text
    })
    this.#decorator.setStrings(strings.decoration)
    this.#decorator.before()
  }

  // ---- keeping the tree and the screen in line ----

  /**
   * Brings the source tree in line with whatever the screen shows right now.
   * Called before the map is saved or read, so a change nobody reported is
   * not lost.
   */
  flush(): void {
    this.#sync({ step: false })
  }

  /** true while an input method is composing in the edit box */
  get composing(): boolean {
    return this.#composing && this.editingText
  }

  /**
   * Takes a title that is still being typed (of a topic, a summary or a
   * relationship) into the map, as leaving the edit box would. Called before
   * the map is saved or read, so the text in the box is not left out. A
   * composition that is open ends with the box losing the focus; the browser
   * keeps its text. False when nothing was being typed.
   */
  commitEdit(): boolean {
    const box = this.mind.nodes.querySelector<HTMLElement>('#input-box')
    if (!box) return false
    // The library takes the text when the box loses the focus, and only then.
    if (document.activeElement === box) box.blur()
    // not focused (or no real focus to lose): tell the library the same way
    if (box.isConnected) box.dispatchEvent(new FocusEvent('blur'))
    this.#composing = false
    return true
  }

  /** Draws the sheet again from the source tree. */
  redraw(): void {
    this.#draw(this.#session.view(this.#key))
  }

  /**
   * The sheet came on screen. Lines can only be drawn around topics that can
   * be measured, so what was put off while the sheet was hidden is done now.
   */
  onShown(): void {
    if (!this.#relinkWhenShown || this.#destroyed) return
    this.#relinkWhenShown = false
    this.mind.linkDiv()
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    if (this.#quietTimer) clearTimeout(this.#quietTimer)
    if (this.#relinkTimer) clearTimeout(this.#relinkTimer)
    this.#dispose.forEach((dispose) => dispose())
    this.mind.destroy()
    this.#pictures.destroy()
  }

  // ---- internals ----

  /** Draws the sheet with another look. The map itself is the same; only how it is drawn changes. */
  #showLook(look: ThemeLook): void {
    this.#look = look
    this.#decorator.setLook(look)
    const selected = this.selectedTopicIds()
    // the library draws every topic again with the new theme
    this.mind.changeTheme(libraryTheme(look))
    const again = selected.map((id) => this.#element(id)).filter((topic) => topic !== null)
    if (again.length > 0) this.mind.selectNodes(again)
  }

  /** A picture arrived or took its size: the lines are drawn again around it, once per turn. */
  #relink = (): void => {
    if (this.#destroyed || this.#relinkTimer) return
    this.#relinkTimer = setTimeout(() => {
      this.#relinkTimer = null
      if (this.#destroyed) return
      // A hidden sheet measures as nothing, and lines drawn from that would all
      // collapse into one point: wait until it is shown.
      if (this.mind.nodes.offsetWidth === 0) this.#relinkWhenShown = true
      else this.mind.linkDiv()
    }, 0)
  }

  /**
   * The library's edit box takes the size, colour, padding and box of the
   * topic it stands in for, but not how heavy and how tall its text is. With
   * those too, a title does not change its look while it is typed.
   *
   * The library pins the box by the topic's left edge, so it grows to the
   * right. Left of the centre a topic's right edge is the one next to its
   * parent, and a title typed there would grow over the parent: there the box
   * is pinned by the right edge and grows to the left, as the topic will.
   */
  #dressEditBox(topicId: string): void {
    const topic = this.#element(topicId)
    const box = this.mind.nodes.querySelector<HTMLElement>('#input-box')
    if (!topic || !box) return
    const drawn = getComputedStyle(topic)
    box.style.fontWeight = drawn.fontWeight
    box.style.lineHeight = drawn.lineHeight
    box.style.letterSpacing = drawn.letterSpacing
    box.style.fontFamily = drawn.fontFamily
    box.style.fontStyle = drawn.fontStyle
    box.style.textDecoration = drawn.textDecoration
    box.style.textAlign = drawn.textAlign
    box.style.textTransform = drawn.textTransform
    if (topic.closest('.lhs')) {
      const right = parseFloat(box.style.left) + topic.offsetWidth
      box.style.left = 'auto'
      box.style.right = `${this.mind.nodes.clientWidth - right}px`
    }
  }

  #menuEntries(): NonNullable<MenuOption['extend']> {
    const ask = (kind: TopicRequest) => () => {
      this.#hideMenu()
      const id = this.mind.currentNode?.nodeObj.id
      if (id) this.#host.onRequest(kind, id)
    }
    return [
      {
        name: this.#strings.menuRelationship,
        onclick: () => {
          this.#hideMenu()
          this.pickRelationshipTarget()
        },
      },
      { name: this.#strings.menuLabel, onclick: ask('label') },
      { name: this.#strings.menuNote, onclick: ask('note') },
      { name: this.#strings.menuLink, onclick: ask('link') },
      { name: this.#strings.menuInsertPicture, onclick: ask('picture') },
      ...(this.#strings.menuAddBoundary
        ? [
            {
              name: this.#strings.menuAddBoundary,
              onclick: () => {
                this.#hideMenu()
                this.addBoundary()
              },
            },
          ]
        : []),
      // the last entry: shown only on a topic with a picture (`#onContextMenu`)
      {
        name: this.#strings.menuRemovePicture,
        onclick: () => {
          this.#hideMenu()
          const id = this.mind.currentNode?.nodeObj.id
          if (id) this.removePicture(id)
        },
      },
    ]
  }

  /** The library opens its menu on a topic: "remove picture" is there only when the topic has one. */
  #onContextMenu = (event: MouseEvent): void => {
    const entry = this.mind.container.querySelector<HTMLElement>(
      '.context-menu .menu-list > li:last-child',
    )
    const topic = event.target instanceof Element ? event.target.closest('me-tpc') : null
    const node = (topic as Topic | null)?.nodeObj
    const hasPicture = node ? this.#meta(node).image !== null : false
    // the library hides an entry by this class (`li.disabled`)
    entry?.classList.toggle('disabled', !hasPicture)
  }

  #hideMenu(): void {
    const menu = this.mind.container.querySelector<HTMLElement>('.context-menu')
    if (menu) menu.hidden = true
  }

  // ---- what is selected, and the lists of the sheet ----

  #arrows(): MapArrow[] {
    return (this.mind.arrows ?? []) as MapArrow[]
  }

  #summaries(): MapSummary[] {
    return (this.mind.summaries ?? []) as MapSummary[]
  }

  #currentArrowId(): string | null {
    const id = (this.mind.currentArrow as (ArrowSvg & { arrowObj?: Arrow }) | null)?.arrowObj?.id
    return typeof id === 'string' ? id : null
  }

  #currentSummaryId(): string | null {
    const id = (this.mind.currentSummary as (SummarySvg & { summaryObj?: Summary }) | null)
      ?.summaryObj?.id
    return typeof id === 'string' ? id : null
  }

  #selectedArrowIds(): string[] {
    const id = this.#currentArrowId()
    return id === null ? [] : [id]
  }

  #selectedSummaryIds(): string[] {
    const id = this.#currentSummaryId()
    return id === null ? [] : [id]
  }

  #selectedBoundaryIds(): string[] {
    return this.#selectedBoundary === null ? [] : [this.#selectedBoundary]
  }

  /** The group the library draws a relationship in; ids are compared as values. */
  #arrowGroup(id: string): ArrowSvg | null {
    const svg = this.mind.arrowSvg as Element | undefined
    if (!svg) return null
    for (const child of svg.children) {
      if (
        child.localName === 'g' &&
        (child as ArrowSvg & { arrowObj?: Arrow }).arrowObj?.id === id
      ) {
        return child as ArrowSvg
      }
    }
    return null
  }

  #summaryGroup(id: string): SummarySvg | null {
    const svg = this.mind.summarySvg as Element | undefined
    if (!svg) return null
    for (const child of svg.children) {
      if ((child as SummarySvg & { summaryObj?: Summary }).summaryObj?.id === id) {
        return child as SummarySvg
      }
    }
    return null
  }

  /** Another item was selected: a boundary's selection ends (they are never selected together). */
  #onOtherSelected = (): void => {
    if (this.#reselecting || this.#selectedBoundary === null) return
    this.#selectedBoundary = null
    this.#markBoundary()
  }

  /** After the map was drawn again: a selected boundary that is gone is no longer selected. */
  #keepBoundarySelection(): void {
    if (this.#selectedBoundary !== null && !this.boundary(this.#selectedBoundary)) {
      this.#selectedBoundary = null
    }
    this.#markBoundary()
  }

  /** The selected boundary's outlines carry the selection's mark (`styles.css`, which an export drops). */
  #markBoundary(): void {
    const nodes = this.mind?.nodes
    if (!nodes) return
    for (const group of nodes.querySelectorAll(`g[${BOUNDARY_ID_ATTRIBUTE}]`)) {
      const selected =
        this.#selectedBoundary !== null &&
        group.getAttribute(BOUNDARY_ID_ATTRIBUTE) === this.#selectedBoundary
      group.classList.toggle('selected', selected)
    }
  }

  /** While the painter holds a format, the map shows it (a cursor of the app's, `styles.css`). */
  #markPainter(): void {
    const { dataset } = this.mind.container
    if (this.#painter) dataset.mmPainter = this.#painter.kind
    else delete dataset.mmPainter
  }

  /** Where a boundary's title box goes: on its title, or at the top of its first outline. */
  #boundaryTitlePlace(id: string): { x: number; y: number } | null {
    const groups = [...this.mind.nodes.querySelectorAll(`g[${BOUNDARY_ID_ATTRIBUTE}]`)].filter(
      (group) => group.getAttribute(BOUNDARY_ID_ATTRIBUTE) === id,
    )
    for (const group of groups) {
      const title = group.querySelector(`.${BOUNDARY_TITLE_CLASS}`)
      if (title) {
        const x = Number(title.getAttribute('x'))
        const y = Number(title.getAttribute('y'))
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y: y - TITLE_BOX_RISE }
      }
    }
    const outline = groups[0]?.querySelector(`.${BOUNDARY_SHAPE_CLASS}`)
    const [x, y] = (outline?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y: y - TITLE_BOX_RISE }
    }
    // not drawn (a hidden sheet, a folded branch): the box goes to the corner of the map
    return groups.length > 0 || this.boundary(id) ? { x: 0, y: 0 } : null
  }

  /**
   * A press on the map, before the library has it. While the painter holds a
   * format, a press on an item puts it on that item; otherwise a press on a
   * boundary's outline or title selects the boundary, and a press on empty
   * space lets a selected boundary go (the library still has that press).
   * The library does not see a press taken here, nor its release.
   */
  #onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const element = event.target instanceof Element ? event.target : null
    if (!element || element.closest(NOT_AN_ITEM)) return
    let target = targetOf(element)
    if (!target && !element.closest(AN_ITEM)) {
      const under = boundaryUnder(element.ownerDocument, event.clientX, event.clientY)
      if (under !== null) target = { kind: 'boundary', id: under }
    }
    if (!target) {
      // empty space ends the other selections (the library's), and the boundary's with them
      if (!element.closest(AN_ITEM)) this.selectBoundary(null)
      return
    }
    if (this.#painter) {
      this.#takePress(event)
      this.applyFormatTo(target)
      return
    }
    if (target.kind !== 'boundary') return
    this.#takePress(event)
    this.selectBoundary(target.id)
  }

  #takePress(event: PointerEvent): void {
    event.preventDefault()
    // nor the other gestures on the map (picking several topics, widening a box)
    event.stopImmediatePropagation()
    this.#takenPress = typeof event.pointerId === 'number' ? event.pointerId : null
  }

  /** The map's menu on a boundary: the boundary is selected and the host shows what can be done with it. */
  #onBoundaryMenu(event: MouseEvent): void {
    const element = event.target instanceof Element ? event.target : null
    if (!element || element.closest(NOT_AN_ITEM)) return
    let id = boundaryOf(element)
    if (id === null && !element.closest(AN_ITEM)) {
      id = boundaryUnder(element.ownerDocument, event.clientX, event.clientY)
    }
    if (id === null) return
    event.preventDefault()
    event.stopPropagation()
    this.selectBoundary(id)
    this.#host.onBoundaryMenu?.(id, { x: event.clientX, y: event.clientY })
  }

  /**
   * Topics the library just put under a parent (new, pasted or moved there)
   * take the line values the parent has written on itself, with their
   * branches, before the library records the step. `ownOnly`: the topic alone
   * (a new topic put between a parent and its branch: that branch stays as it was).
   */
  #arrive(nodes: readonly NodeObj[], ownOnly = false): void {
    let changed = false
    for (const node of nodes) {
      const parent = node.parent
      if (!parent) continue
      if (ownOnly) {
        const line = writableLineOf(parent)
        if (Object.keys(line).length > 0 && editOwnLine(node, line)) {
          this.#relined.add(node.id)
          changed = true
        }
        continue
      }
      for (const id of inheritBranchLine(parent, node)) {
        this.#relined.add(id)
        changed = true
      }
    }
    // the library drew the lines before it reported the change
    if (changed) this.#relink()
  }

  /** Of the topics the library moved, those that now stand under another parent than in the last view. */
  #movedAway(nodes: readonly NodeObj[]): NodeObj[] {
    const before = new Map<string, string | null>()
    const visit = (topic: ViewSheet['root'], parent: string | null): void => {
      before.set(topic.id, parent)
      topic.children.forEach((child) => visit(child, topic.id))
    }
    visit(this.#lastView.root, null)
    return nodes.filter((node) => node.parent && before.get(node.id) !== node.parent.id)
  }

  /** The user let go of a curve's handle: the curve as it is now is what the file is to keep. */
  #keepCurve(arrow: MapArrow): void {
    if (!arrow.delta1 || !arrow.delta2) return
    arrow.metadata = { ...arrow.metadata, curve: deltasToCurve(arrow.delta1, arrow.delta2) }
    this.#restyledRelationships.add(arrow.id)
  }

  #node(id: string): NodeObj | null {
    return this.mind.getObjById(id, this.mind.nodeData)
  }

  /**
   * A node of this map's live tree, by identity. Anything else came out of the
   * clipboard as text any program can write, whatever its fields claim.
   */
  #isLive(node: NodeObj): boolean {
    return typeof node.id === 'string' && this.#node(node.id) === node
  }

  #cleanIfPasted(topic: Topic): void {
    const node = topic.nodeObj as NodeObj | undefined
    if (node && !this.#isLive(node)) cleanPastedNode(node)
  }

  #meta(node: NodeObj): MapNodeMeta {
    return { ...emptyMeta(), ...((node.metadata as Partial<MapNodeMeta> | undefined) ?? {}) }
  }

  /** The element of a topic, or null when it is folded away. */
  #element(id: string): Topic | null {
    try {
      return this.mind.findEle(id)
    } catch {
      return null
    }
  }

  #patchMeta(topicId: string, change: Partial<MapNodeMeta>): boolean {
    const node = this.#node(topicId)
    if (!node) return false
    return this.#patch(topicId, nodePatch({ ...this.#meta(node), ...change }))
  }

  /** Changes fields of one topic as one step: through the library when the topic is drawn, as data when it is folded away. */
  #patch(topicId: string, patch: Partial<MapNode>): boolean {
    const node = this.#node(topicId)
    if (!node) return false
    const element = this.#element(topicId)
    if (element) {
      void this.mind.reshapeNode(element, patch as Partial<NodeObj>)
    } else {
      this.edit((root) => {
        const target = this.mind.getObjById(topicId, root)
        if (target) Object.assign(target, patch)
      })
    }
    return true
  }

  /** The library asks before it removes topics (Delete, cut, its menu). */
  async #beforeRemove(topics: Topic[]): Promise<boolean> {
    const removable = topics.filter((topic) => topic.nodeObj.parent)
    if (removable.length === 0) return false
    if (removable.length !== topics.length) {
      // The central topic stays; the rest of the selection is deleted on its own.
      void this.mind.removeNodes(removable)
      return false
    }
    const preserved = this.#session.hiddenWith(
      this.#key,
      removable.map((topic) => topic.nodeObj.id),
    )
    if (preserved === 0) return true
    return this.#host.confirmDelete(preserved)
  }

  /** Runs in front of the library's history: what an operation just made gets ids the file can keep. */
  #prepare = (operation: Operation): void => {
    // a step the session recorded itself is not the library's change
    if (this.#recordedBySession) return
    switch (operation.name) {
      case 'addChild':
      case 'insertSibling':
      case 'copyNode':
        this.#keepableIds(operation.obj)
        this.#arrive([operation.obj])
        break
      case 'insertParent':
        this.#keepableIds(operation.obj)
        this.#arrive([operation.obj], true)
        break
      case 'copyNodes':
        operation.objs.forEach((node) => this.#keepableIds(node))
        this.#arrive(operation.objs)
        break
      case 'moveNodeIn':
      case 'moveNodeBefore':
      case 'moveNodeAfter':
        this.#arrive(this.#movedAway('objs' in operation ? operation.objs : [operation.obj]))
        break
      case 'reshapeArrow':
        this.#keepCurve(operation.obj as MapArrow)
        break
      case 'createSummary':
        this.#renameSummary(operation.obj)
        break
      case 'createArrow':
        this.#renameArrow(operation.obj)
        break
    }
  }

  #keepableIds(node: NodeObj): void {
    if (!XMIND_ID.test(node.id)) {
      const element = this.#element(node.id)
      node.id = newXmindId()
      if (element) element.dataset.nodeid = `me${node.id}`
    }
    node.children?.forEach((child) => this.#keepableIds(child))
  }

  #renameSummary(summary: Summary): void {
    if (XMIND_ID.test(summary.id)) return
    const container = this.mind.container
    const group = container.querySelector(`#s-${summary.id}`)
    const label = container.querySelector<HTMLElement>(`#label-s-${summary.id}`)
    summary.id = newXmindId()
    if (group) group.id = `s-${summary.id}`
    if (label) {
      label.id = `label-s-${summary.id}`
      label.dataset.svgId = `s-${summary.id}`
    }
  }

  #renameArrow(arrow: Arrow): void {
    if (XMIND_ID.test(arrow.id)) return
    const container = this.mind.container
    const group = container.querySelector<SVGGElement>(`g[data-linkid="${arrow.id}"]`)
    const label = container.querySelector<HTMLElement>(`#label-a-${arrow.id}`)
    arrow.id = newXmindId()
    if (group) {
      group.id = `a-${arrow.id}`
      group.dataset.linkid = arrow.id
    }
    if (label) {
      label.id = `label-a-${arrow.id}`
      label.dataset.svgId = `a-${arrow.id}`
    }
  }

  #onOperation = (operation: Operation): void => {
    // Opening the edit box changes nothing yet, and the library records no step for it.
    if (operation.name === 'beginEdit') {
      this.#dressEditBox(operation.obj.id)
      this.#beginTitleEdit(operation.obj)
      return
    }
    // The session recorded this step and the screen was drawn from it: nothing to reconcile.
    if (this.#recordedBySession) return
    const cut = this.#cutPending
    this.#cutPending = null
    if (operation.name === 'removeSummary') this.#removedSummaries.add(operation.obj.id)
    if (operation.name === 'removeArrow') this.#removedRelationships.add(operation.obj.id)
    // the library drew these on its own, without the editor's drawing of them
    if (operation.name === 'createArrow' || operation.name === 'reshapeArrow') {
      this.#relations.drawRelationships()
    }
    if (operation.name === 'createSummary') this.#relations.drawSummaries()
    this.#sync({ step: true })
    if (cut && operation.name === 'removeNodes') {
      const removed = operation.objs.map((node) => node.id)
      if (sameIds(removed, cut.ids)) {
        // the lines that went with the topics are the ones the sheet no longer has
        const left = new Set(this.#session.relationshipRecords(this.#key).map((line) => line.id))
        this.#cutStash = {
          ...cut,
          relationships: cut.relationships.filter((line) => !left.has(line.id)),
        }
      }
    }
  }

  /**
   * A cut is starting (the library copies the selection to the clipboard and
   * then removes it). The source of the selected topics is copied now, while
   * it is still there: reconciling the removal deletes it with everything the
   * editor never showed.
   */
  #onCut(event: Event): void {
    this.#forgetCut()
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('#input-box')) return
    const selected = (this.mind.currentNodes ?? []).map((topic) => topic.nodeObj)
    const chosen = new Set(selected)
    const ids: string[] = []
    const topics: XmindTopic[] = []
    for (const node of selected) {
      if (!node.parent) return
      let inside = false
      for (let up: NodeObj | undefined = node.parent; up; up = up.parent) inside ||= chosen.has(up)
      if (inside) continue
      const source = this.#session.copyOfTopic(this.#key, node.id)
      if (!source) return
      ids.push(node.id)
      topics.push(source)
    }
    if (ids.length === 0) return
    this.#cutPending = {
      ids,
      topics,
      relationships: this.#session.relationshipRecords(this.#key),
    }
  }

  /** Something else was copied or cut: what an earlier cut took out can no longer be pasted back as itself. */
  #forgetCut(): void {
    this.#cutPending = null
    this.#cutStash = null
  }

  /**
   * The library is about to paste. When the clipboard holds exactly the topics
   * last cut from this sheet, they are put back as the source topics they
   * were (ids, every key, hidden parts), under the target: a move, as the user
   * meant it. True when that was done and the library has nothing left to do.
   * Any other paste, and a second paste of the same clipboard, makes new
   * topics from what the clipboard shows.
   */
  #moveBack(topics: Topic[], to: Topic): boolean {
    const stash = this.#cutStash
    if (!stash || !to?.nodeObj) return false
    const pasted = topics.map((topic) => topic.nodeObj as NodeObj | undefined)
    if (pasted.some((node) => !node || this.#isLive(node))) return false
    if (
      !sameIds(
        pasted.map((node) => String(node!.id)),
        stash.ids,
      )
    ) {
      return false
    }
    this.#cutStash = null
    this.#sync({ step: false })
    const view = this.#session.reinsertTopics(
      this.#key,
      to.nodeObj.id,
      stash.topics,
      stash.relationships,
      { line: writableLineOf(to.nodeObj) },
    )
    if (!view) return false
    this.#draw(view)
    // The session has its step; the library records one for the same change.
    this.#recordedBySession = true
    try {
      this.mind.bus.fire('operation', {
        name: 'reshapeNode',
        obj: this.mind.nodeData,
        origin: this.mind.nodeData,
      })
    } finally {
      this.#recordedBySession = false
    }
    const moved = stash.ids.map((id) => this.#element(id)).filter((topic) => topic !== null)
    this.mind.clearSelection()
    if (moved.length > 0) this.mind.selectNodes(moved)
    this.#host.onStateChange()
    return true
  }

  #onQuietChange = (): void => {
    this.#sync({ step: false })
  }

  #onLayoutPicked = (): void => {
    this.#layoutPicked = true
    this.#sync({ step: false })
  }

  #onArrowMoved = (): void => {
    this.#relations.drawRelationships()
  }

  #onArrowSelected = (): void => {
    this.#relations.fitHandles()
  }

  #onState = (): void => {
    this.#host.onStateChange()
  }

  /** The library drew something. Most of the time that was reported; when it was not (fold levels), this finds it. */
  #scheduleQuietSync = (): void => {
    if (this.#destroyed) return
    if (this.#quietTimer) clearTimeout(this.#quietTimer)
    this.#quietTimer = setTimeout(() => {
      this.#quietTimer = null
      if (!this.#destroyed && !this.editingText) this.#sync({ step: false })
    }, QUIET_SYNC_DELAY_MS)
  }

  #sync(options: { step: boolean }): void {
    if (this.#destroyed) return
    if (this.#quietTimer) {
      clearTimeout(this.#quietTimer)
      this.#quietTimer = null
    }
    const data = this.mind.getDataString()
    if (!options.step && !this.#layoutPicked && data === this.#syncedData) return
    const started = performance.now()
    const state = mindToState(JSON.parse(data), {
      view: this.#lastView,
      layoutPicked: this.#layoutPicked,
      removedSummaries: this.#removedSummaries,
      removedRelationships: this.#removedRelationships,
      structure: this.#structure,
    })
    const result = this.#session.apply(this.#key, state, {
      step: options.step,
      removedPictures: [...this.#removedPictures],
      restyledTopics: [...this.#restyled],
      restyledTopicLines: [...this.#relined],
      refilledTopics: [...this.#refilled],
      restyledRelationships: [...this.#restyledRelationships],
      restyledSummaries: [...this.#restyledSummaries],
      restyledBoundaries: [...this.#restyledBoundaries],
      removedBoundaries: [...this.#removedBoundaries],
    })
    this.#layoutPicked = false
    this.#forgetNamed()
    this.#lastView = result.view
    if (!result.ok) {
      console.warn('[mindmap] the screen could not be applied to the map:', result.problem)
      this.#draw(result.view)
    } else if (
      !result.inSync ||
      result.ids.topics.size > 0 ||
      result.ids.relationships.size > 0 ||
      result.ids.boundaries.size > 0
    ) {
      this.#draw(result.view)
    } else {
      this.#syncedData = data
    }
    measure(RECONCILE_MEASURE, started)
    this.#host.onStateChange()
  }

  /** After an undo or redo: the source tree is back; the screen must show exactly it. */
  #afterHistoryMove(view: ViewSheet): void {
    this.#layoutPicked = false
    this.#forgetNamed()
    this.#lastView = view
    const data = this.mind.getDataString()
    const state = mindToState(JSON.parse(data), {
      view,
      layoutPicked: false,
      removedSummaries: this.#removedSummaries,
      removedRelationships: this.#removedRelationships,
      structure: this.#structure,
    })
    const check = this.#session.apply(this.#key, state, { step: false })
    if (!check.ok || check.changed || !check.inSync) {
      // The library went back to something else than the tree holds: the copy wins.
      this.#draw(this.#session.restoreStep(this.#key))
    } else {
      this.#syncedData = data
    }
    this.#keepBoundarySelection()
    this.#host.onStateChange()
  }

  /** The lists of what the user changed or removed went to the engine, or no longer apply. */
  #forgetNamed(): void {
    for (const list of [
      this.#removedSummaries,
      this.#removedRelationships,
      this.#removedPictures,
      this.#restyled,
      this.#relined,
      this.#refilled,
      this.#restyledRelationships,
      this.#restyledSummaries,
      this.#restyledBoundaries,
      this.#removedBoundaries,
    ]) {
      list.clear()
    }
  }

  #draw(view: ViewSheet): void {
    const mind = this.mind
    const selected = this.selectedTopicIds()
    this.#setStructure(structureOfLayout(view.layout))
    mind.direction = directionOfLayout(view.layout)
    mind.refresh(viewToMind(view))
    this.#lastView = view
    this.#syncedData = mind.getDataString()
    const again = selected.map((id) => this.#element(id)).filter((topic) => topic !== null)
    this.#reselecting = true
    try {
      if (again.length > 0) mind.selectNodes(again)
    } finally {
      this.#reselecting = false
    }
    this.#keepBoundarySelection()
  }

  /** Runs before the library's own key handling. */
  #guardKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.#pickingFrom !== null) {
      this.cancelRelationshipPick()
      return
    }
    // While a title is typed, every key belongs to the text (Ctrl+arrow moves by words).
    // The format keys there are taken by the edit box itself (`#onTitleKey`).
    if (event.target instanceof Element && event.target.closest('#input-box')) return
    if (event.key === 'Escape' && this.#painter) {
      event.stopImmediatePropagation()
      this.endFormatPainter()
      return
    }
    if (this.#boundaryKey(event)) {
      event.stopImmediatePropagation()
      event.preventDefault()
      return
    }
    const toggle = formatShortcut(event)
    if (toggle && this.selectedTopicIds().length > 0) {
      event.stopImmediatePropagation()
      event.preventDefault()
      this.toggleTextFormat(toggle)
      return
    }
    if (this.#timelineArrow(event)) {
      event.stopImmediatePropagation()
      event.preventDefault()
      return
    }
    // The library switches the layout on Ctrl+arrow. A layout is written to the
    // file when it is picked, so it is picked on purpose (the toolbar), not by a key.
    const layoutKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)
    if (layoutKey && (event.ctrlKey || event.metaKey)) {
      event.stopImmediatePropagation()
      event.preventDefault()
    }
  }

  /** The keys of a selected boundary: Delete removes it, Space and F2 edit its title, Esc lets it go. True when taken. */
  #boundaryKey(event: KeyboardEvent): boolean {
    if (this.#selectedBoundary === null) return false
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        this.removeBoundary()
        return true
      case 'F2':
      case ' ':
        this.editBoundaryTitle()
        return true
      case 'Escape':
        this.selectBoundary(null)
        return true
      default:
        return false
    }
  }

  /** In a timeline the plain arrow keys move the way the map looks (`timeline-keys.ts`). True when the key was taken. */
  #timelineArrow(event: KeyboardEvent): boolean {
    if (this.#structure !== 'timeline' || !isArrowKey(event.key)) return false
    // Alt+arrow reorders and Ctrl+arrow is the library's layout switch: those are not moves
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
    const mind = this.mind
    const current = mind.currentNode ?? mind.currentNodes?.[0]
    if (!current?.nodeObj) return false
    const target = timelineArrowTarget(current.nodeObj, event.key)
    const element = target ? this.#element(target.id) : null
    if (element) mind.selectNode(element)
    return true
  }

  #onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const topic = target.closest('me-tpc') as Topic | null
    if (this.#pickingFrom !== null) {
      const from = this.#pickingFrom
      this.#pickingFrom = null
      if (topic) {
        event.stopPropagation()
        this.addRelationship(from, topic.nodeObj.id)
      }
      this.#host.onStateChange()
      return
    }
    if (!topic) return
    if (target.closest('.mm-chip-link')) {
      // The map never opens anything itself. Whatever the address is, it goes to
      // the main process, which opens it only when it is a web or mail address.
      event.preventDefault()
      event.stopPropagation()
      const link = this.#meta(topic.nodeObj).link
      if (link) this.#host.openLink(link)
    } else if (target.closest('.mm-chip-note')) {
      event.stopPropagation()
      this.mind.selectNode(topic)
      this.#host.onRequest('note', topic.nodeObj.id)
    }
  }

  /** The range a summary over the selection covers: positions among the branches of the selection's common parent. */
  #summaryRange(): { parent: string; start: number; end: number } | null {
    const paths = (this.mind.currentNodes ?? []).map((topic) => {
      const path: NodeObj[] = []
      for (let node: NodeObj | undefined = topic.nodeObj; node; node = node.parent) {
        path.unshift(node)
      }
      return path
    })
    if (paths.length === 0) return null
    let shared = Math.min(...paths.map((path) => path.length))
    for (let depth = 0; depth < shared; depth++) {
      if (paths.some((path) => path[depth] !== paths[0]![depth])) {
        shared = depth
        break
      }
    }
    // a selected topic that is an ancestor of the rest (or the only one) is covered itself
    if (paths.some((path) => path.length === shared)) shared--
    const parent = paths[0]![shared - 1]
    if (!parent?.children) return null
    const positions = paths.map((path) => parent.children!.indexOf(path[shared]!))
    if (positions.some((position) => position < 0)) return null
    return { parent: parent.id, start: Math.min(...positions), end: Math.max(...positions) }
  }
}

/** A topic title being typed. */
interface TitleEdit {
  id: string
  node: NodeObj
  box: HTMLElement
  /** the parts the title had when the box opened */
  before: ReturnType<typeof normaliseRuns>
  /** the box was closed with Escape: the library puts the old title back */
  cancelled: boolean
}

/** What a cut took out of the sheet: the source topics, and the relationship records that went with them. */
interface CutStash {
  /** ids of the topics that were cut (not of the topics below them) */
  ids: string[]
  topics: XmindTopic[]
  relationships: Record<string, unknown>[]
}

/** The format the painter holds, taken from an item of one kind. */
type HeldFormat =
  | { kind: 'topic'; sticky: boolean; paint: TopicPaint }
  | { kind: 'relationship'; sticky: boolean; edits: StyleEdits<RelationshipStyleKey> }
  | { kind: 'summary'; sticky: boolean; edits: StyleEdits<SummaryStyleKey> }
  | { kind: 'boundary'; sticky: boolean; edits: StyleEdits<BoundaryStyleKey> }

/** Where a press is never an item: the edit box, the library's menu and the handles of a curve. */
const NOT_AN_ITEM = '#input-box, .context-menu, .circle'
/** What lies on top of a boundary and is an item of its own: a press there is not the boundary's. */
const AN_ITEM = 'me-tpc, me-epd, .svg-label, .topiclinks, .summary, .linkcontroller'
/** How far above its title's baseline a boundary's title box starts. */
const TITLE_BOX_RISE = 16

function refused<R extends string>(reason: R): { ok: false; reason: R } {
  return { ok: false, reason }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const wanted = new Set(b)
  return new Set(a).size === a.length && a.every((id) => wanted.has(id))
}

/**
 * Names of the timings left in the page's performance timeline: drawing a
 * sheet for the first time, and bringing the source tree in line after a
 * change. They are how the speed of large maps is measured.
 */
export const DRAW_MEASURE = 'mindmap:draw'
export const RECONCILE_MEASURE = 'mindmap:reconcile'

function measure(name: string, started: number): void {
  try {
    performance.measure(name, { start: started, end: performance.now() })
  } catch {
    // a timeline that cannot take the entry is no reason to fail an edit
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
