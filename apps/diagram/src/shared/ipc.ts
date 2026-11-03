/**
 * The contract between the diagram renderer, its preload and the main process.
 * Every channel of this editor starts with `diagram:`; the main processes of all
 * editors run in one process, so a name may be registered only once.
 */
export const DIAGRAM_CHANNELS = {} as const
