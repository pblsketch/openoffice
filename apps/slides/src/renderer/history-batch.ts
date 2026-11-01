/**
 * Run fn as one history batch: every edit inside collapses into a single undo
 * step, so a gesture that spans several IPC calls costs one ⌘Z.
 */
export async function batched<T>(fn: () => Promise<T>): Promise<T> {
  const opened = await window.slidesApi.beginHistoryBatch()
  try {
    return await fn()
  } finally {
    if (opened) await window.slidesApi.endHistoryBatch()
  }
}
