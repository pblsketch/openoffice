/** Structural subset of Electron's WebContents, so the helper stays Electron-free and unit-testable. */
export interface DestroyableSender {
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
  removeListener(event: 'destroyed', listener: () => void): unknown
}

/** The reload half of WebContents, reached through a cast so the fake in tests stays small */
interface NavigationSender {
  on(event: 'did-start-navigation', listener: (...args: unknown[]) => void): unknown
  removeListener(event: 'did-start-navigation', listener: (...args: unknown[]) => void): unknown
}

/** Both Electron signatures of `did-start-navigation`; a main-frame document load means reload */
function isDocumentNavigation(args: unknown[]): boolean {
  const details = args[1]
  if (details && typeof details === 'object') {
    const { isMainFrame, isSameDocument } = details as {
      isMainFrame?: unknown
      isSameDocument?: unknown
    }
    return isMainFrame !== false && isSameDocument !== true
  }
  // older Electron: (event, url, isInPlace, isMainFrame, …)
  const inPlace = args[2] === true
  const mainFrame = args[3] !== false
  return mainFrame && !inPlace
}

/**
 * Aborts `controller` when the renderer that started a stream goes away
 * (tab or window closed mid-stream) or reloads. A reload keeps the same
 * WebContents but destroys the page that would receive the answer, so the
 * provider request must stop rather than run on for nobody.
 * Returns a disposer; call it when the stream settles so listeners do
 * not accumulate on long-lived senders.
 */
export function abortOnDestroyed(
  sender: DestroyableSender,
  controller: AbortController,
): () => void {
  if (sender.isDestroyed()) {
    controller.abort()
    return () => {}
  }
  const onGone = () => controller.abort()
  sender.once('destroyed', onGone)

  const navigation = sender as unknown as Partial<NavigationSender>
  const onNavigation = (...args: unknown[]) => {
    if (isDocumentNavigation(args)) controller.abort()
  }
  let watchingNavigation = false
  if (typeof navigation.on === 'function') {
    try {
      navigation.on('did-start-navigation', onNavigation)
      watchingNavigation = true
    } catch {
      // an older sender without the event: the destroyed listener still covers closing
    }
  }

  return () => {
    sender.removeListener('destroyed', onGone)
    if (watchingNavigation) {
      try {
        navigation.removeListener?.('did-start-navigation', onNavigation)
      } catch {
        // the sender is already gone; its listeners went with it
      }
    }
  }
}
