/** Font look-alike classification shared by the save side (which embeds a
 * stand-in when the document's face is neither embedded with the new glyphs
 * nor installed) and the on-screen draft (which previews with a CSS stack).
 * Both read the same table so the face the user sees while typing is the face
 * the save embeds. Pure: no Node or DOM APIs beyond TextDecoder. */

export type FontScript = 'ko' | 'ja' | 'zh' | 'latin'
export type FontStyleClass = 'serif' | 'sans' | 'mono' | 'brush'

export interface FontClass {
  script?: FontScript
  style?: FontStyleClass
  bold: boolean
  italic: boolean
}

/**
 * Font names arrive as raw bytes: a PDF name is a byte string, and Korean
 * producers write the face name in CP949 (`/#B9#D9#C5#C1` is Batang's Korean
 * name). UTF-8
 * first, then CP949 (WHATWG `euc-kr` is the CP949 superset), else Latin-1 —
 * both decoders strict, so a Latin-1 name never turns into Hangul noise.
 */
export function decodeFontName(bytes: Uint8Array): string {
  for (const label of ['utf-8', 'euc-kr']) {
    try {
      return new TextDecoder(label, { fatal: true }).decode(bytes)
    } catch {
      /* not this encoding (or the runtime lacks it) */
    }
  }
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('')
}

/** A name read as one char per byte (pdf.js names) back through decodeFontName */
export function redecodeByteString(name: string): string {
  if (!/[\u0080-ÿ]/.test(name) || /[Ā-￿]/.test(name)) return name
  return decodeFontName(Uint8Array.from(name, (c) => c.charCodeAt(0)))
}

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/
const KANA = /[぀-ヿｦ-ﾟ]/
const HAN = /[㐀-鿿豈-﫿]/

// Keys are NFKC, lowercased, with spaces/-/_/, removed
const KO_BRUSH = /궁서|궁체|gungsuh|gungseo|gungso|gungche/
const KO_SERIF =
  /명조|바탕|myeongjo|myungjo|batang|serif(cjk)?kr|sourcehanserifk|unbatang|applemyungjo/
const KO_SANS =
  /고딕|돋움|굴림|헤드라인|dotum|dodum|gulim|malgun|gothic|headline|sans(cjk)?kr|sourcehansansk|pretendard|spoqa|undotum|nanumsquare|nanumbarun/
/** Korean by name alone even without a style word (HY/HCR/KoPub/Nanum families) */
const KO_NAME =
  /^hy[a-z]|^hcr|^han(batang|dotum)|kopub|nanum|gowun|malgun|batang|dotum|dodum|gulim|gungsuh|myeongjo|myungjo|applesdgothic|applemyungjo|(serif|sans)(cjk)?kr|sourcehan(sans|serif)k/

const JA_SERIF = /明朝|mincho|ryumin|kozmin/
const JA_NAME =
  /明朝|ゴシック|mincho|yugothic|msgothic|mspgothic|msuigothic|meiryo|hiragino(?!sansgb)|kozuka|kozmin|kozgo|ryumin|gothicbbb|ipa(ex|p)?(gothic|mincho)|(serif|sans)(cjk)?jp|takao|osaka/

const ZH_BRUSH = /kai|楷/
const ZH_SERIF = /song|sung|ming|simsun|宋|明|serif|仿宋/
// Whole-name families and anchored stems only: a bare "sung"/"ming" would claim
// Latin names such as Samsung Sans or Gaming
const ZH_NAME =
  /simsun|simhei|songti|stsong|stheiti|stkaiti|stfangsong|heiti|kaiti|fangsong|yahei|jhenghei|pingfang|dengxian|mingliu|^ming|^song|^fz|adobe(song|ming|heiti|kaiti|fangsong)|hiraginosansgb|sourcehan(sans|serif)(sc|tc|cn|tw|hk)|(serif|sans)cjk(sc|tc|hk)|(serif|sans)(sc|tc|hk)$|[㐀-鿿]/

const LATIN_MONO = /courier|mono|consolas|menlo|lucidaconsole|typewriter/
const LATIN_SANS =
  /sans|arial|helvetica|verdana|tahoma|segoe|calibri|futura|frutiger|myriad|univers|gill|franklin|trebuchet|lato|roboto|opensans|gothic/
const LATIN_SERIF =
  /serif|times|georgia|garamond|palatino|baskerville|caslon|charter|bookman|bookantiqua|century|cambria|roman|minion|didot|bodoni|constantia|tinos/

const BOLD = /bold|black|heavy/
const ITALIC = /italic|oblique/

/** Classify by the face name (subset tag stripped). Unknown parts stay undefined
    so other evidence (PANOSE, PDF flags) can fill them. */
export function classifyFontName(name: string): FontClass {
  const key = name
    .replace(/^[A-Z]{6}\+/, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_,]/g, '')
  const bold = BOLD.test(key)
  const italic = ITALIC.test(key)
  if (HANGUL.test(key) || KO_NAME.test(key)) {
    const style = KO_BRUSH.test(key)
      ? 'brush'
      : KO_SERIF.test(key)
        ? 'serif'
        : KO_SANS.test(key)
          ? 'sans'
          : undefined
    return { script: 'ko', style, bold, italic }
  }
  if (KANA.test(key) || JA_NAME.test(key)) {
    return { script: 'ja', style: JA_SERIF.test(key) ? 'serif' : 'sans', bold, italic }
  }
  if (ZH_NAME.test(key)) {
    const style = ZH_BRUSH.test(key) ? 'brush' : ZH_SERIF.test(key) ? 'serif' : 'sans'
    return { script: 'zh', style, bold, italic }
  }
  if (!/[a-z]/.test(key)) return { bold, italic }
  // A latin name: sans before serif ("Microsoft Sans Serif"), mono first of all
  const style = LATIN_MONO.test(key)
    ? 'mono'
    : LATIN_SANS.test(key)
      ? 'sans'
      : LATIN_SERIF.test(key)
        ? 'serif'
        : undefined
  return { script: style ? 'latin' : undefined, style, bold, italic }
}

/** Script the stand-in must belong to: the text forces it when the document's
    face cannot be from a script that draws it (Hangul needs a Korean face,
    kana a Japanese one); otherwise the document face's script wins, so Latin
    typed into a Korean-font run stays in a Korean face's Latin glyphs. */
export function standInScript(faceScript: FontScript | undefined, drawn: string): FontScript {
  if (HANGUL.test(drawn)) return 'ko'
  if (KANA.test(drawn)) return faceScript === 'ko' ? 'ko' : 'ja'
  if (faceScript) return faceScript
  return HAN.test(drawn) ? 'zh' : 'latin'
}

/** Installed look-alikes by script and style, most faithful first; the first
    installed one that covers the text wins. Families match the installed
    index by any of their names (English or localized). */
export const LOOKALIKE_FAMILIES: Record<FontScript, Record<FontStyleClass, readonly string[]>> = {
  ko: {
    serif: [
      'HCR Batang',
      'Batang',
      'AppleMyungjo',
      'Noto Serif CJK KR',
      'Noto Serif KR',
      'Source Han Serif K',
      'NanumMyeongjo',
      'UnBatang',
    ],
    sans: [
      'HCR Dotum',
      'Malgun Gothic',
      'Dotum',
      'Gulim',
      'Apple SD Gothic Neo',
      'Noto Sans CJK KR',
      'Noto Sans KR',
      'Source Han Sans K',
      'NanumGothic',
      'UnDotum',
    ],
    brush: ['Gungsuh', 'HCR Batang', 'Batang', 'AppleMyungjo', 'Noto Serif CJK KR'],
    mono: ['GulimChe', 'DotumChe', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR'],
  },
  ja: {
    serif: ['Yu Mincho', 'MS Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', 'Noto Serif JP'],
    sans: [
      'Yu Gothic',
      'Meiryo',
      'MS Gothic',
      'Hiragino Sans',
      'Hiragino Kaku Gothic ProN',
      'Noto Sans CJK JP',
      'Noto Sans JP',
    ],
    brush: ['Yu Mincho', 'MS Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP'],
    mono: ['MS Gothic', 'Yu Gothic', 'Noto Sans CJK JP'],
  },
  zh: {
    serif: ['SimSun', 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Noto Serif SC'],
    sans: ['Microsoft YaHei', 'PingFang SC', 'SimHei', 'Noto Sans CJK SC', 'Noto Sans SC'],
    brush: ['KaiTi', 'Kaiti SC', 'STKaiti', 'SimSun', 'Songti SC'],
    mono: ['SimSun', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC'],
  },
  latin: {
    serif: [
      'Times New Roman',
      'Liberation Serif',
      'Tinos',
      'Nimbus Roman',
      'Times',
      'Georgia',
      'DejaVu Serif',
    ],
    sans: [
      'Arial',
      'Helvetica',
      'Liberation Sans',
      'Arimo',
      'Nimbus Sans',
      'Segoe UI',
      'DejaVu Sans',
    ],
    mono: [
      'Courier New',
      'Liberation Mono',
      'Cousine',
      'Nimbus Mono PS',
      'Courier',
      'Consolas',
      'Menlo',
      'DejaVu Sans Mono',
    ],
    brush: ['Times New Roman', 'Liberation Serif', 'Times', 'Georgia'],
  },
}
