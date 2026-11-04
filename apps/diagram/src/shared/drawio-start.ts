/**
 * How draw.io is started in the diagram tab (spec 4, 6): the start arguments,
 * the configuration the bridge hands it, and what is taken off its screen.
 * Data only; the bridge applies it inside the frame and the tests read it.
 */
import type { Lang } from '@genoffice/i18n'
import { DRAWIO_ORIGIN } from './bridge-protocol'

/** draw.io's language code for each app language (draw.io ships all 21). */
export function drawioLang(lang: Lang): string {
  if (lang === 'zh-TW') return 'zh-tw'
  return lang
}

/**
 * The editor page's address. Embed mode with the JSON protocol, offline,
 * stealth (no outside services), lockdown (no outside data), no exit button,
 * no "save and exit", no "browser" storage (its Import from › Browser is an
 * empty dialog here), draw.io's own spinner while it loads, and the dark view
 * when the app is dark.
 */
export function drawioStartUrl(options: { lang: Lang; dark: boolean }): string {
  const params: [string, string][] = [
    ['embed', '1'],
    ['proto', 'json'],
    ['offline', '1'],
    ['stealth', '1'],
    ['lockdown', '1'],
    ['lang', drawioLang(options.lang)],
    ['noExitBtn', '1'],
    ['saveAndExit', '0'],
    ['browser', '0'],
    ['spin', '1'],
  ]
  if (options.dark) params.push(['dark', '1'])
  return `${DRAWIO_ORIGIN}/index.html?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
}

/**
 * draw.io's export targets the app does not carry out (only PNG, SVG and PDF
 * go through the app's export). Each of these would open draw.io's own
 * "save as" dialog, whose places (this device, download, a new window) all
 * end nowhere in the app.
 */
export const HIDDEN_EXPORTS: readonly string[] = [
  'exportJpg',
  'exportWebp',
  'exportAnimatedGif',
  'exportXml',
  'exportJson',
  'exportHtml',
  'exportUrl',
  'exportVsdx',
  'export',
]

/**
 * draw.io actions taken off the screen: about, help sites and feedback,
 * cloud files and sharing, publishing and embedding, the export targets
 * above, plugins, PlantUML, draw.io's appearance and theme switches (the
 * app's theme decides), its language switch (the app's language decides),
 * collaboration, and leaving the editor. Its keyboard shortcuts stay: the
 * bridge shows them in a draw.io dialog.
 */
export const HIDDEN_ACTIONS: readonly string[] = [
  'about',
  'support',
  'feedback',
  'downloadDesktop',
  'quickStart',
  'plugins',
  'publishLink',
  'share',
  ...HIDDEN_EXPORTS,
  'plantUml',
  'lightMode',
  'darkMode',
  'autoMode',
  'exit',
  'saveAndExit',
  'saveAs',
  'close',
  'myDiagrams',
  'accounts',
  'revisionHistory',
  'createRevision',
  'synchronize',
  'upload',
  'openFolder',
  'openFile',
  'moveToFolder',
  'makeCopy',
  'rename',
  'organizationAdmin',
  'dataSources',
  'refreshDataSources',
  'comments',
  'shareCursor',
  'showRemoteCursors',
  'bringEveryoneToMe',
  'presentToEveryone',
  'presentationMode',
  'googleFonts',
]

/** draw.io submenus taken off the screen. */
export const HIDDEN_SUBMENUS: readonly string[] = [
  'embed',
  'publish',
  'appearance',
  'theme',
  'dynamicAppearance',
  'language',
]

/**
 * draw.io's configuration (`DRAWIO_CONFIG`, read by `Editor.configure`): no
 * draw.io AI and no AI keys, no web fonts, no export server link, pages kept
 * uncompressed unless the file says otherwise (the bridge sets that per file),
 * and the menus below taken out.
 */
export const DRAWIO_CONFIG = {
  enableAi: false,
  enableChatGpt: false,
  gptApiKey: null,
  geminiApiKey: null,
  claudeApiKey: null,
  compressXml: false,
  enableExportUrl: false,
  enableCustomLibraries: true,
  defaultFonts: [
    'Helvetica',
    'Verdana',
    'Times New Roman',
    'Garamond',
    'Comic Sans MS',
    'Courier New',
    'Georgia',
    'Lucida Console',
    'Tahoma',
  ],
  customFonts: [],
  hideMenuItems: [...HIDDEN_ACTIONS, ...HIDDEN_SUBMENUS],
}

/** draw.io actions the app carries out itself (help topic, its own export and print, its save). */
export const REDIRECTED_ACTIONS = {
  help: 'help',
  print: 'print',
  exportPdf: 'exportPdf',
  exportPng: 'exportPng',
  exportSvg: 'exportSvg',
  save: 'save',
} as const

/**
 * Style the bridge adds before draw.io draws anything: no draw.io logo on
 * the start screen (the host shows its own progress), no link to draw.io's
 * code site, no help icons that point at draw.io's web pages.
 */
export const HIDE_CSS = [
  '#geInfo { display: none !important; }',
  '.geSplashLogo { display: none !important; }',
  'a[href*="github.com/jgraph"] { display: none !important; }',
  'a[href*="drawio.com"], a[href*="diagrams.net"] { display: none !important; }',
  '.geHelpIcon { display: none !important; }',
].join('\n')
