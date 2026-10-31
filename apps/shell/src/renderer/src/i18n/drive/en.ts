import type { zh } from './zh'

export const en = {
  driveNav: 'Google Drive',
  driveDesc:
    'Choose files in Google Drive, then open and edit them in GenOffice; saving puts them back in Drive. GenOffice can open only the files you choose.',
  driveConnect: 'Connect Google Drive',
  driveConnecting: 'Sign in with your Google account in the browser and allow access…',
  driveCancel: 'Cancel',
  driveConnectedAs: 'Connected as {email}',
  driveDisconnect: 'Disconnect',
  driveDisconnectConfirm:
    'This removes the Drive sign-in from this PC and asks Google to revoke GenOffice’s access. Copies already on this PC stay.',
  driveDisconnectYes: 'Disconnect',
  driveNotPersisted:
    'This PC can’t keep the sign-in encrypted, so the connection ends when you close the app.',
  driveExpired:
    'Google ended the connection: access was removed or the sign-in expired. Connect again.',
  driveAiAccess: 'Let the AI find and read files in Drive',
  driveAiAccessDesc:
    'When on, the AI in the editors can search and read the Drive files you chose here. What it reads goes to the AI provider you use. The AI cannot change, delete or share Drive files.',
  drivePrivacy:
    'File lists and contents travel only between this PC and Google. They never pass through a server of GenOffice’s makers.',
  driveFailDenied: 'The connection was not made because Google did not allow it.',
  driveFailScope:
    'The connection was not made because Drive access was not ticked. Connect again and tick the Drive item.',
  driveFailTimeout: 'The sign-in did not finish within 10 minutes. Try again.',
  driveFailNetwork: 'Google could not be reached. Check your internet connection and try again.',
  driveRecent: 'Files you chose',
  driveSearchPlaceholder: 'Search the files you chose',
  driveSearchResults: 'Results for “{q}”',
  driveRefresh: 'Refresh',
  driveNotConnectedTitle: 'Google Drive is not connected',
  driveNotConnectedBody:
    'Once connected, you can choose Drive files, open and edit them here, and saving puts them back in Drive.',
  driveOpenSettings: 'Connect in Settings',
  driveEmpty: 'No files yet. Press “Choose from Google Drive” to pick some.',
  driveLoading: 'Loading…',
  driveLoadMore: 'Show more',
  driveOpening: 'Opening…',
  driveGoogleBadge: 'Google format',
  driveGoogleNote:
    'A Google document opens as an Office file. Saving leaves the original as it is and saves an Office file beside it, or in My Drive.',
  driveReadOnly: 'View only',
  driveReadOnlyNote:
    'You can’t edit this file. When you save, you’ll be asked whether to save a copy to Drive.',
  driveUnsupported: 'This app can’t open this kind of file.',
  driveErrNotConnected: 'Google Drive is disconnected. Connect again in Settings.',
  driveErrNotFound: 'The file was not found. It was deleted, or this account can’t see it.',
  driveErrForbidden: 'This account may not download this file.',
  driveErrTooLarge: 'The file is too large to open.',
  driveErrRateLimit: 'Google is holding back requests for a moment. Try again shortly.',
  driveErrNetwork: 'Google Drive could not be reached. Check your internet connection.',
  driveErrDisk: 'The file could not be saved on this PC.',
  drivePick: 'Choose from Google Drive',
  drivePicking: 'Choose files in the Google window that opened in your browser…',
  drivePickNote:
    'GenOffice can open only the Drive files you choose in Google’s window. Files you chose once stay in this list.',
  driveTrainingTitle: 'Before using Drive files with AI',
  driveTrainingBody:
    'Google does not allow Drive files to go to an AI service that uses them to train its models. Personal Claude, ChatGPT and Codex plans may use your chats for training unless you turn it off: in Claude under Settings → Privacy, in ChatGPT under Settings → Data controls → “Improve the model for everyone”. API key providers do not train on API data by default. Free AI connections are never given Drive files.',
  driveTrainingAck: 'Model training is off in the AI accounts I use with Drive files',
  driveFailTraining: 'First tick the item about model training above.',
} satisfies Record<keyof typeof zh, string>
