/**
 * A file that did not open once its tab was there (a Visio drawing draw.io
 * could not import, a file that broke after the shell looked at it): the tab
 * is not left behind with the reason in it. The editor asks the shell to close
 * the tab and show the reason as an app warning; only when the shell does not
 * (the editor run on its own, an older shell) is the reason shown in the tab.
 */
export async function settleOpenFailure(
  message: string,
  askShell: ((message: string) => Promise<boolean>) | undefined,
  showInTab: (message: string) => void,
): Promise<void> {
  let closed: boolean
  try {
    closed = askShell ? (await askShell(message)) === true : false
  } catch {
    closed = false
  }
  if (!closed) showInTab(message)
}
