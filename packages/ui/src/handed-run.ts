/**
 * The run a create flow handed to a new tab (spec 6): the create window's
 * request or a skill template copy's request. Once that run ends well, the
 * editor saves the new document into its panel's project (the main process
 * decides whether there is one and where it goes). This keeps track of that
 * one run in a panel: armed when the handed-over request goes to the panel's
 * send, settled by the end of the next run.
 *
 * A run that is stopped or fails disarms it: the document stays untitled, as
 * a failed make writes nothing. A run the send gate held is still armed, so the
 * request sent later from the composer counts in its place.
 */
export interface HandedRun {
  /** the handed-over request is going to the panel's send */
  arm(): void
  /** a run ended (`ok`: not stopped, no error); true once, for the armed run that ended well */
  settle(ok: boolean): boolean
  /** whether a handed-over request waits for its run to end */
  readonly armed: boolean
}

export function createHandedRun(): HandedRun {
  let armed = false
  return {
    arm() {
      armed = true
    },
    settle(ok) {
      if (!armed) return false
      armed = false
      return ok
    },
    get armed() {
      return armed
    },
  }
}
