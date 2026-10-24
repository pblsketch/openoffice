import type { zh } from './zh'

export const en = {
  aiAssistant: 'AI Assistant',
  cardChecking: 'Checking…',
  cardNotInstalled: 'Not installed',
  cardSignedOut: 'Not signed in',
  cardSigningIn: 'Signing in…',
  cardReady: 'Connected',
  cardReadyPlan: 'Connected · {plan}',
  cardMetered: 'Signed in, but not with a subscription',
  cardMeteredAccepted: 'In use · charged by usage',
  cardError: 'The connection could not be checked',
  cardErrNeedsUpdate: 'The {provider} program on this PC is too old. Update it, then check again.',
  cardErrNeedsUpdateVersion:
    'The {provider} program on this PC ({version}) is too old; {minimum} or newer is needed. Run {command} in a terminal, then check again.',
  cardErrNeedsUpdatePath: 'The file this app runs:',
  cardErrNeedsUpdateWindows:
    'Updating {provider} inside WSL (Ubuntu) or in another folder does not change this file. Run {command} in Windows PowerShell.',
  cardErrTimeout: 'The {provider} program did not answer in time. Check again in a moment.',
  cardErrFailed: 'Something went wrong while checking {provider}. Check again.',
  actionInstall: 'Install',
  actionLogin: 'Sign in',
  actionLoginWindow: 'Browser did not open?',
  actionRecheck: 'Check again',
  actionAcceptMetered: 'Use anyway',
  actionInstallHelp: 'Official install guide',
  actionOpenSettings: 'Open settings',
  actionDismiss: 'Dismiss',
  actionSwitchAccount: 'Sign in with another account',
  actionLogout: 'Sign out',
  installNote: "{vendor}'s official install command runs in a new terminal window.",
  loginNote: "The sign-in page that opens is {vendor}'s own.",
  signingInBrowserNote:
    'Sign in to your {vendor} account in the browser that opened and allow access. It connects by itself when you are done.',
  signingInWindowNote:
    'Follow the guide at the top of the sign-in window that just opened. Sign in on the {vendor} page that opened in your browser: the window then closes and you are connected. A sign-in page that was open before no longer works; close it.',
  meteredWarning: 'This is not a subscription: you are charged for what you use.',
  meteredMeaning:
    'This login is an API key or a pay-as-you-go account, or its type could not be confirmed. "Use anyway" lets AI run on this connection, and every request is billed to that account.',
  connectTitle: 'Connect an AI to get started',
  connectBody:
    'AI runs on the Claude or Codex subscription you already have. No API key is needed.',
  connectProviderTitle: 'The {provider} connection cannot be used right now',
  connectKeyBody:
    'The {provider} setup is not finished. Complete it in Settings, or choose another AI.',
  errNotConnected:
    'No AI is connected. Connect a Claude or Codex subscription, or a free AI, first.',
  errNotInstalled: 'The {provider} program was not found on this PC.',
  errSignedOut: 'The {provider} sign-in has expired. Sign in again to continue.',
  errRateLimit: 'The {provider} subscription limit has been used up.',
  errRateLimitReset: 'The {provider} subscription limit has been used up. It resets at {time}.',
  errUnsafeTools:
    'The {provider} program started with its own tools turned on, so the run was stopped for safety.',
  errMeteredNotAccepted:
    'The {provider} connection is a pay-as-you-go login that you have not allowed yet. Choose "Use anyway" in the connection settings to use it.',
  errNeedsUpdate: 'The {provider} program is too old for this feature. Update it and try again.',
  errHeadlessLimit: 'The hourly limit for automatic requests has been reached.',
  errHeadlessLimitReset:
    'The hourly limit for automatic requests has been reached. Requests are possible again at {time}.',
  connectFreeHint: 'No subscription? You can connect a free AI in Settings in about a minute.',
  actionConnectFree: 'Connect a free AI',
  errFreeLimit:
    "Today's free allowance is used up. Try again tomorrow, or choose another AI in Settings.",
  errFreeLimitReset: "Today's free allowance is used up. You can use it again at {time}.",
  continueWith: 'Continue with {provider}',
  continueMeteredNote:
    'The {provider} connection is not a subscription: continuing is charged by usage.',
  usageLine: '{percent}% used · resets at {time}',
  usageWindowFiveHour: '5-hour limit',
  usageWindowSevenDay: '7-day limit',
  noticeTitle: 'Before you use AI with your subscription',
  noticeSend:
    'Document content and your conversation are sent to Anthropic or OpenAI under your own account. Each request also carries the name, title and description of every skill set to “AI decides”; skills in use, and skill files the AI reads, go along with them.',
  noticeTraining:
    'Whether that content is used to train AI is decided by your own account settings at that company.',
  noticeCodexHistory:
    'This app turns off conversation history saving in Codex, but Codex may still keep its own diagnostic logs on this PC.',
  noticePdfWholeDocument:
    'In the PDF editor, AI page reading and document translation may send page images and the whole text of the document.',
  noticeAck: 'Got it',
  codexNotice:
    'Using a Codex subscription inside an app is not a method officially recommended by OpenAI.',
  truncatedNotice: 'The input was too long, so part of it was cut off before sending.',
  pickerAuto: 'Automatic',
  pickerAutoUsing: 'Automatic · {provider}',
  pickerAutoUsingModel: 'Automatic · {provider} · {model}',
  pickerDefaultModel: 'Default model',
  pickerDefaultModelNamed: 'Default model · {model}',
  pickerSubscription: 'Subscription',
  pickerPaid: 'Paid',
  pickerPaidTitle: 'Charged by usage, not covered by a subscription',
  pickerNotConnected: 'Connect AI',
  guideQuestion: 'Which AI do you already use?',
  guidePathClaudeTitle: 'I pay for Claude',
  guidePathClaudeBody: 'Needs a Pro or Max plan. A free Claude account cannot connect.',
  guidePathCodexTitle: 'I use ChatGPT',
  guidePathCodexBody:
    "Sign in to OpenAI's Codex program with your ChatGPT account. The free plan allows only a little use.",
  guidePathFreeTitle: 'Neither yet',
  guidePathFreeBody:
    "Connect a free AI in about a minute. While you use it for free, what you send may be used to improve that company's AI.",
  guideBack: 'Choose another way',
  guideBadgeReady: 'Connected',
  guideBadgeInstalled: 'Installed',
  guideBadgeCheck: 'Needs attention',
  guideStepsLabel: 'Connection steps',
  stepInstall: 'Install the program',
  stepLogin: 'Sign in',
  stepReady: 'Connected',
  installReturnNote:
    'When the install has finished in that window, come back here. The app checks again by itself.',
  loginHowNote:
    'A browser opens when you press it. Sign in with your {vendor} account and press Allow; the connection finishes by itself.',
  signingInStalledNote:
    'If no sign-in page opened in your browser, open the sign-in window with the button below. If you are still signing in in the browser, finish there instead: the button stops that sign-in and starts over.',
  actionLoginWindowOpen: 'Open the sign-in window',
  loginWindowTitle: '{provider} sign-in',
  loginWindowIntro:
    'This is the sign-in window of the {provider} program. The English text below comes from the {provider} program.',
  loginWindowStepBrowser:
    'When the {vendor} sign-in page opens in your browser, sign in and allow access. This window then closes by itself.',
  loginWindowStepAddress:
    "If no browser opened, drag over the address below that starts with https:// to select it, then right-click to copy it. Paste it into your browser's address bar to open the sign-in page.",
  loginWindowStepCode:
    'If the browser shows a code after you sign in, copy the whole code (use its copy button if there is one). Right-click once inside this window to paste it, then press Enter. It is normal that the pasted code does not appear.',
  loginWindowStepInvalid:
    'If you see "Invalid code", the code was not copied in full. Keep this window open, copy the code again, and paste it.',
  loginWindowClosing:
    'The sign-in did not finish. When you have read the messages above, press Enter to close this window. To try again, press the sign-in button again.',
  actionCancelLogin: 'Cancel sign-in',
  actionUpdate: 'Update',
  updateNote:
    "{vendor}'s official update runs in a new window when you press it. When it has finished there, come back here.",
  guideInfoHint:
    'Still stuck? Copy the connection details and send them to whoever is helping you. They contain no account and no file paths.',
  actionCopyInfo: 'Copy details for help',
  copyInfoDone: 'Copied',
  actionConnectHelp: 'See each step on screen (page in Korean)',
} satisfies Record<keyof typeof zh, string>
