/** remove remote carets and selection tints from a copy of an editor's DOM (print, export) */
export function stripCollabMarks(root: ParentNode): void {
  root.querySelectorAll('.collab-caret').forEach((caret) => caret.remove())
  root.querySelectorAll<HTMLElement>('.collab-selection').forEach((node) => {
    node.classList.remove('collab-selection')
    node.style.removeProperty('--collab-c')
  })
}
