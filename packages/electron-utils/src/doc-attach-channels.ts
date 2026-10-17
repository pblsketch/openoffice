/// The two channels an editor uses to ask the shell for the documents it
/// already knows: whether the shell answers at all, and the picker itself.
export const DOC_ATTACH_CHANNELS = {
  available: 'doc:attach-available',
  pick: 'doc:pick-attachments',
} as const

/** the renderer-exposed bridge name every editor shares */
export const DOC_ATTACH_BRIDGE_KEY = 'aiOfficeDocs'
