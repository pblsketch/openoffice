/**
 * draw.io's live obstacle-avoiding routing without its core.
 *
 * The bundle leaves libavoid and its routing core (`AvoidRouting`, LGPL-2.1)
 * out of `extensions.min.js` (`vendor/drawio`), but keeps draw.io's own
 * integration (`LibavoidRouting`). draw.io installs that integration's
 * listeners when the editor starts; they call the missing core on every
 * shape move or resize, so moving a shape, importing cells (Insert › Mermaid,
 * the AI's Mermaid drawing) and every layout threw "AvoidRouting is not
 * defined". While the core is absent the integration is not installed: edges
 * keep the points they have, as they do in every other draw.io without the
 * libavoid bundle.
 */

/**
 * Watches `name` on `target` (draw.io's page global) and, once the
 * integration object is assigned there, keeps its `installAutoRouting` empty
 * for as long as `hasCore()` says the routing core is missing. Assignments
 * draw.io makes later go through (and come back once the core exists).
 */
export function guardAutoRouting(
  target: Record<string, unknown>,
  hasCore: () => boolean,
  name = 'LibavoidRouting',
): void {
  let integration: unknown
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    get: () => integration,
    set: (value: unknown) => {
      integration = value
      if (value === null || typeof value !== 'object') return
      let install: unknown = (value as Record<string, unknown>).installAutoRouting
      Object.defineProperty(value, 'installAutoRouting', {
        configurable: true,
        enumerable: true,
        get: () => (hasCore() ? install : null),
        set: (next: unknown) => {
          install = next
        },
      })
    },
  })
}
