/** Shared shapes of the diagram model: cells, pages, primitive changes and errors. */

export interface DiagramGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** One mxGraph cell as the model sees it (a vertex, an edge, the root or a layer). */
export interface DiagramCell {
  id: string
  /** `null` for the root cell. */
  parent: string | null
  /** The raw label: HTML when the style has `html=1`. */
  value: string
  style: string
  kind: 'vertex' | 'edge' | 'other'
  source?: string
  target?: string
  /** Vertex geometry; edges and layers have none here. */
  geometry?: DiagramGeometry
}

export interface DiagramPageState {
  id: string
  name: string
  /** In document order. */
  cells: DiagramCell[]
}

/** The whole diagram as the planner sees it. Built from a file or from the live editor. */
export interface DiagramState {
  pages: DiagramPageState[]
}

/**
 * The primitive changes ops turn into. The editor applies them to the live
 * draw.io model in one undo step; the CLI writes them into the XML. Values are
 * final (a merged style, an escaped HTML label), so neither side decides anything.
 */
export type DiagramPrimitive =
  | { kind: 'add_cell'; page: string; cell: DiagramCell }
  | {
      kind: 'update_cell'
      page: string
      id: string
      value?: string
      style?: string
      geometry?: Partial<DiagramGeometry>
    }
  /** Every id to remove, children and connected edges already included. */
  | { kind: 'remove_cells'; page: string; ids: string[] }
  /** A new empty page holding draw.io's root cell `0` and layer `1`. */
  | { kind: 'add_page'; id: string; name: string }
  | { kind: 'rename_page'; page: string; name: string }
  | { kind: 'remove_page'; page: string }

/**
 * Why an op was refused. `needs_app` means the op is valid but only the app
 * can carry it out (`insert_mermaid` without a converter).
 */
export type DiagramErrorCode = 'target_not_found' | 'invalid_argument' | 'unknown_op' | 'needs_app'

export interface DiagramOpError {
  code: DiagramErrorCode
  message: string
}
