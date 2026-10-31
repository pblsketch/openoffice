// The shared fake `window.projectFolderApi` (packages/ui/tests/support), with
// this editor's name on the messages it records.
import {
  fakeProjectFolder as sharedFakeProjectFolder,
  type FakeProjectFolder,
} from '../../../packages/ui/tests/support/fake-project-folder'

export type { FakeProjectFolder }

/** `selected`: the project the window starts with (null: "no project") */
export function fakeProjectFolder(selected: string | null): FakeProjectFolder {
  return sharedFakeProjectFolder(selected, 'hwp')
}
