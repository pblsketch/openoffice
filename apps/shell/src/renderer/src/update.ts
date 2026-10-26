import type {
  UpdateNoteBlock,
  UpdateNoteRun,
  UpdateUiState,
  UpdateWindowApi,
} from '../../shared/update-api'

// exposed by src/preload/update.ts
const api = (window as unknown as { aiOfficeUpdate: UpdateWindowApi }).aiOfficeUpdate

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement
const headline = el('headline')
const verCurrent = el('ver-current')
const verNew = el('ver-new')
const desc = el('desc')
const progress = el('progress')
const bar = el('bar')
const progressText = el('progress-text')
const percentText = el('percent')
const action = el('action') as HTMLButtonElement
const later = el('later') as HTMLButtonElement
const notes = el('notes')
const notesLabel = el('notes-label')
const notesBox = el('notes-box')
const notesMore = el('notes-more') as HTMLButtonElement

let phase: UpdateUiState['phase'] = 'available'

/** draws the release notes from the pre-converted block tree; text nodes only, never HTML */
function renderNotes(state: UpdateUiState): void {
  const releaseNotes = state.releaseNotes
  const present = releaseNotes !== null && releaseNotes.sections.length > 0
  notes.style.display = present ? 'flex' : 'none'
  notesBox.replaceChildren()
  if (releaseNotes === null || !present) return

  notesLabel.textContent = state.strings.notesLabel
  notesBox.setAttribute('aria-label', state.strings.notesLabel)
  notesMore.textContent = state.strings.notesOnGitHub

  const showVersions = releaseNotes.sections.length > 1
  for (const section of releaseNotes.sections) {
    if (showVersions && section.version !== null) {
      const version = document.createElement('div')
      version.className = 'nl-ver'
      version.textContent = `v${section.version}`
      notesBox.appendChild(version)
    }
    for (const block of section.blocks) notesBox.appendChild(blockNode(block))
  }
  if (releaseNotes.truncated) {
    const truncated = document.createElement('div')
    truncated.className = 'nl-trunc'
    truncated.textContent = state.strings.notesTruncated
    notesBox.appendChild(truncated)
  }
}

function blockNode(block: UpdateNoteBlock): HTMLElement {
  if (block.kind === 'list') {
    const list = document.createElement(block.ordered ? 'ol' : 'ul')
    for (const item of block.items) {
      const li = document.createElement('li')
      appendRuns(li, item)
      list.appendChild(li)
    }
    return list
  }
  const node = document.createElement(block.kind === 'heading' ? 'div' : 'p')
  if (block.kind === 'heading') node.className = 'nl-h'
  appendRuns(node, block.runs)
  return node
}

function appendRuns(parent: HTMLElement, runs: UpdateNoteRun[]): void {
  for (const run of runs) {
    let node: Node = document.createTextNode(run.text)
    if (run.code === true) {
      const code = document.createElement('code')
      code.appendChild(node)
      node = code
    }
    if (run.strong === true) {
      const strong = document.createElement('strong')
      strong.appendChild(node)
      node = strong
    }
    parent.appendChild(node)
  }
}

function render(state: UpdateUiState): void {
  phase = state.phase
  const s = state.strings

  document.documentElement.lang = state.lang
  document.title = s.title
  headline.textContent = s.headline
  verCurrent.textContent = `v${state.currentVersion}`
  verNew.textContent = `v${state.version}`
  later.textContent = s.later

  const hasNotes = state.releaseNotes !== null && state.releaseNotes.sections.length > 0
  renderNotes(state)
  // the notes take the generic line's place; failure and manual guidance
  // always stay (their text explains what to do)
  desc.style.display = hasNotes ? 'none' : ''
  desc.classList.toggle(
    'error',
    state.phase === 'error' || state.phase === 'manual' || state.phase === 'install-failed',
  )
  // in the manual phase the main button already opens the same release page
  notesMore.style.display = state.phase === 'manual' ? 'none' : ''

  switch (state.phase) {
    case 'available':
      desc.textContent = s.desc
      progress.style.display = 'none'
      action.style.display = ''
      action.textContent = s.download
      break
    case 'downloading': {
      desc.textContent = s.desc
      progress.style.display = 'flex'
      action.style.display = 'none'
      const pct = Math.max(0, Math.min(100, Math.round(state.percent)))
      bar.style.width = `${pct}%`
      progressText.textContent = s.downloading
      percentText.textContent = `${pct}%`
      break
    }
    case 'downloaded':
      // the installer will open its own window: say so before the restart
      desc.textContent = state.visibleInstall ? s.visibleInstallDesc : s.desc
      if (state.visibleInstall) desc.style.display = ''
      progress.style.display = 'none'
      action.style.display = ''
      action.textContent = s.install
      break
    case 'install-failed':
      desc.textContent = s.installFailedDesc
      desc.style.display = ''
      progress.style.display = 'none'
      action.style.display = ''
      action.textContent = s.download
      break
    case 'error':
      desc.textContent = s.failed
      desc.style.display = ''
      progress.style.display = 'none'
      action.style.display = ''
      action.textContent = s.retry
      break
    case 'manual':
      desc.textContent = s.manualDesc
      desc.style.display = ''
      progress.style.display = 'none'
      action.style.display = ''
      action.textContent = s.openDownload
      break
  }
}

action.addEventListener('click', () => {
  if (phase === 'downloaded') api.install()
  else if (phase === 'manual') api.openDownload()
  else api.download()
})
later.addEventListener('click', () => api.later())
notesMore.addEventListener('click', () => api.openDownload())

api.onState(render)
void api.getState().then((state) => {
  if (state) render(state)
})
