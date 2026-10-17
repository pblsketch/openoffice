/**
 * The AI panel's attachments and the untitled map's provisional name, on the
 * main-process side. The same contract as the other editors' attachment
 * readers (`apps/slides/src/main/attachments-ipc.ts`, the html main):
 *
 * - A file is accepted by extension and size; pictures (5 MB at most) go to
 *   the model as pictures with the user message, every other kind is read as
 *   text. A mind map (`.xmind`) is read as its outline.
 * - Text comes from `parseFileToText` and nowhere else, so what a reader
 *   withholds from a model (a withholding mark in a Word, PowerPoint or HTML
 *   file) is withheld here as well, and a file it cannot read safely is not
 *   read at all.
 * - A file open in a tab with unsaved changes is not read (`assertFileSaved`):
 *   a withholding mark only reaches the file on save.
 * - One read hands back at most 48,000 characters; the panel asks for 24,000
 *   at a time, like the other editors.
 *
 * The channels are this editor's own (`mindmap:`); the shared `ai:*` and
 * subscription channels belong to the docs main and are never registered here.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { assertFileSaved, showOpenDialogWithMemory } from '@genoffice/electron-utils'
import {
  parseFileToText,
  ATTACHABLE_EXTS,
  ATTACHABLE_IMAGE_EXTS,
  ATTACHABLE_MAX_BYTES,
  ATTACHABLE_IMAGE_MAX_BYTES,
} from '@genoffice/file-parse'
import { createI18n, getUiLang } from '@genoffice/i18n'
import { MINDMAP_CHANNELS } from '../shared/ipc'
import type {
  AttachmentAddResult,
  AttachmentImageResult,
  AttachmentMeta,
  AttachmentReadResult,
} from '../shared/ipc'

const ATTACH_STRINGS = {
  zh: {
    dlgAddAttachment: '添加附件',
    filterSupported: '支持的文件',
    filterAll: '所有文件',
    errUnsupportedExt: '暂不支持 .{ext} 类型',
    errNotFile: '不是文件',
    errTooLarge: '超过 {mb}MB 上限',
    errImageTooLarge: '图片超过 5MB 上限',
    errUnreadable: '无法读取',
    errFileTooLarge: '文件超过大小上限',
    errParseFailed: '文件解析失败',
    errImageNoText: '图片附件不提供文本,已作为图像随用户消息发送,直接看图即可',
    errNotImage: '不是支持的图片类型',
  },
  en: {
    dlgAddAttachment: 'Add Attachments',
    filterSupported: 'Supported Files',
    filterAll: 'All Files',
    errUnsupportedExt: '.{ext} files are not supported',
    errNotFile: 'not a file',
    errTooLarge: 'exceeds the {mb}MB limit',
    errImageTooLarge: 'image exceeds the 5MB limit',
    errUnreadable: 'cannot be read',
    errFileTooLarge: 'File exceeds the size limit',
    errParseFailed: 'Failed to parse file',
    errImageNoText: 'Image attachments have no text; the image is sent along with the user message',
    errNotImage: 'not a supported image type',
  },
  vi: {
    dlgAddAttachment: 'Thêm tệp đính kèm',
    filterSupported: 'Các tệp được hỗ trợ',
    filterAll: 'Tất cả các tệp',
    errUnsupportedExt: 'Tệp .{ext} không được hỗ trợ',
    errNotFile: 'không phải là tệp',
    errTooLarge: 'vượt quá giới hạn {mb}MB',
    errImageTooLarge: 'hình ảnh vượt quá giới hạn 5MB',
    errUnreadable: 'không thể đọc được',
    errFileTooLarge: 'Tệp vượt quá giới hạn kích thước',
    errParseFailed: 'Không thể phân tích tệp',
    errImageNoText:
      'Tệp đính kèm hình ảnh không có văn bản; hình ảnh được gửi cùng với tin nhắn của người dùng',
    errNotImage: 'loại hình ảnh không được hỗ trợ',
  },
  ja: {
    dlgAddAttachment: '添付ファイルの追加',
    filterSupported: 'サポートされているファイル',
    filterAll: 'すべてのファイル',
    errUnsupportedExt: '.{ext} 形式には対応していません',
    errNotFile: 'ファイルではありません',
    errTooLarge: '{mb}MB の上限を超えています',
    errImageTooLarge: '画像が 5MB の上限を超えています',
    errUnreadable: '読み取れません',
    errFileTooLarge: 'ファイルがサイズ上限を超えています',
    errParseFailed: 'ファイルの解析に失敗しました',
    errImageNoText:
      '画像の添付ファイルはテキストを提供しません。画像としてユーザーメッセージと一緒に送信されるため、そのまま画像をご確認ください',
    errNotImage: 'サポートされていない画像形式です',
  },
  ko: {
    dlgAddAttachment: '첨부 파일 추가',
    filterSupported: '지원되는 파일',
    filterAll: '모든 파일',
    errUnsupportedExt: '.{ext} 형식은 지원되지 않습니다',
    errNotFile: '파일이 아닙니다',
    errTooLarge: '{mb}MB 제한을 초과했습니다',
    errImageTooLarge: '이미지가 5MB 제한을 초과했습니다',
    errUnreadable: '읽을 수 없습니다',
    errFileTooLarge: '파일이 크기 제한을 초과했습니다',
    errParseFailed: '파일을 분석하지 못했습니다',
    errImageNoText:
      '이미지 첨부 파일은 텍스트를 제공하지 않으며, 이미지 형태로 사용자 메시지와 함께 전송되므로 이미지를 직접 확인하면 됩니다',
    errNotImage: '지원되지 않는 이미지 형식입니다',
  },
  fr: {
    dlgAddAttachment: 'Ajouter des pièces jointes',
    filterSupported: 'Fichiers pris en charge',
    filterAll: 'Tous les fichiers',
    errUnsupportedExt: 'les fichiers .{ext} ne sont pas pris en charge',
    errNotFile: "n'est pas un fichier",
    errTooLarge: 'dépasse la limite de {mb} Mo',
    errImageTooLarge: "l'image dépasse la limite de 5 Mo",
    errUnreadable: 'lecture impossible',
    errFileTooLarge: 'Le fichier dépasse la taille maximale',
    errParseFailed: "Échec de l'analyse du fichier",
    errImageNoText:
      "Les pièces jointes image ne fournissent pas de texte ; l'image est envoyée avec le message de l'utilisateur, consultez-la directement",
    errNotImage: "type d'image non pris en charge",
  },
  de: {
    dlgAddAttachment: 'Anlagen hinzufügen',
    filterSupported: 'Unterstützte Dateien',
    filterAll: 'Alle Dateien',
    errUnsupportedExt: '.{ext}-Dateien werden nicht unterstützt',
    errNotFile: 'keine Datei',
    errTooLarge: 'überschreitet das Limit von {mb} MB',
    errImageTooLarge: 'Bild überschreitet das Limit von 5 MB',
    errUnreadable: 'kann nicht gelesen werden',
    errFileTooLarge: 'Datei überschreitet die maximale Größe',
    errParseFailed: 'Datei konnte nicht analysiert werden',
    errImageNoText:
      'Bildanlagen liefern keinen Text; das Bild wird mit der Benutzernachricht gesendet und kann direkt betrachtet werden',
    errNotImage: 'kein unterstütztes Bildformat',
  },
  es: {
    dlgAddAttachment: 'Agregar datos adjuntos',
    filterSupported: 'Archivos compatibles',
    filterAll: 'Todos los archivos',
    errUnsupportedExt: 'los archivos .{ext} no son compatibles',
    errNotFile: 'no es un archivo',
    errTooLarge: 'supera el límite de {mb} MB',
    errImageTooLarge: 'la imagen supera el límite de 5 MB',
    errUnreadable: 'no se puede leer',
    errFileTooLarge: 'El archivo supera el tamaño máximo',
    errParseFailed: 'No se pudo analizar el archivo',
    errImageNoText:
      'Las imágenes adjuntas no proporcionan texto; la imagen se envía junto con el mensaje del usuario, puedes verla directamente',
    errNotImage: 'no es un tipo de imagen compatible',
  },
  th: {
    dlgAddAttachment: 'เพิ่มสิ่งที่แนบ',
    filterSupported: 'ไฟล์ที่รองรับ',
    filterAll: 'ไฟล์ทั้งหมด',
    errUnsupportedExt: 'ไม่รองรับไฟล์ .{ext}',
    errNotFile: 'ไม่ใช่ไฟล์',
    errTooLarge: 'เกินขีดจำกัด {mb}MB',
    errImageTooLarge: 'รูปภาพเกินขีดจำกัด 5MB',
    errUnreadable: 'ไม่สามารถอ่านได้',
    errFileTooLarge: 'ไฟล์เกินขนาดสูงสุด',
    errParseFailed: 'แยกวิเคราะห์ไฟล์ไม่สำเร็จ',
    errImageNoText:
      'สิ่งที่แนบเป็นรูปภาพไม่มีข้อความ รูปจะถูกส่งไปพร้อมข้อความของผู้ใช้ ดูรูปได้โดยตรง',
    errNotImage: 'ไม่ใช่ชนิดรูปภาพที่รองรับ',
  },
  id: {
    dlgAddAttachment: 'Tambahkan Lampiran',
    filterSupported: 'File yang Didukung',
    filterAll: 'Semua File',
    errUnsupportedExt: 'file .{ext} tidak didukung',
    errNotFile: 'bukan file',
    errTooLarge: 'melebihi batas {mb}MB',
    errImageTooLarge: 'gambar melebihi batas 5MB',
    errUnreadable: 'tidak dapat dibaca',
    errFileTooLarge: 'File melebihi batas ukuran',
    errParseFailed: 'Gagal mengurai file',
    errImageNoText:
      'Lampiran gambar tidak menyediakan teks; gambar dikirim bersama pesan pengguna dan dapat dilihat langsung',
    errNotImage: 'bukan jenis gambar yang didukung',
  },
  ru: {
    dlgAddAttachment: 'Добавить вложения',
    filterSupported: 'Поддерживаемые файлы',
    filterAll: 'Все файлы',
    errUnsupportedExt: 'файлы .{ext} не поддерживаются',
    errNotFile: 'не является файлом',
    errTooLarge: 'превышает лимит {mb} МБ',
    errImageTooLarge: 'изображение превышает лимит 5 МБ',
    errUnreadable: 'не удается прочитать',
    errFileTooLarge: 'Файл превышает максимальный размер',
    errParseFailed: 'Не удалось разобрать файл',
    errImageNoText:
      'Вложенные изображения не содержат текста; изображение отправляется вместе с сообщением пользователя, смотрите его напрямую',
    errNotImage: 'неподдерживаемый тип изображения',
  },
  ar: {
    dlgAddAttachment: 'إضافة مرفقات',
    filterSupported: 'الملفات المدعومة',
    filterAll: 'كل الملفات',
    errUnsupportedExt: 'ملفات .{ext} غير مدعومة',
    errNotFile: 'ليس ملفًا',
    errTooLarge: 'يتجاوز الحد {mb}MB',
    errImageTooLarge: 'الصورة تتجاوز حد 5MB',
    errUnreadable: 'تعذرت القراءة',
    errFileTooLarge: 'الملف يتجاوز الحد الأقصى للحجم',
    errParseFailed: 'فشل تحليل الملف',
    errImageNoText:
      'مرفقات الصور لا توفر نصًا؛ تُرسل الصورة مع رسالة المستخدم ويمكن الاطلاع عليها مباشرة',
    errNotImage: 'ليس نوع صورة مدعومًا',
  },
  pt: {
    dlgAddAttachment: 'Adicionar Anexos',
    filterSupported: 'Arquivos Compatíveis',
    filterAll: 'Todos os Arquivos',
    errUnsupportedExt: 'arquivos .{ext} não são suportados',
    errNotFile: 'não é um arquivo',
    errTooLarge: 'excede o limite de {mb}MB',
    errImageTooLarge: 'a imagem excede o limite de 5MB',
    errUnreadable: 'não é possível ler',
    errFileTooLarge: 'O arquivo excede o limite de tamanho',
    errParseFailed: 'Falha ao analisar o arquivo',
    errImageNoText:
      'Anexos de imagem não fornecem texto; a imagem é enviada junto com a mensagem do usuário, basta vê-la diretamente',
    errNotImage: 'não é um tipo de imagem suportado',
  },
  it: {
    dlgAddAttachment: 'Aggiungi allegati',
    filterSupported: 'File supportati',
    filterAll: 'Tutti i file',
    errUnsupportedExt: 'i file .{ext} non sono supportati',
    errNotFile: 'non è un file',
    errTooLarge: 'supera il limite di {mb} MB',
    errImageTooLarge: "l'immagine supera il limite di 5 MB",
    errUnreadable: 'impossibile leggere',
    errFileTooLarge: 'Il file supera il limite di dimensione',
    errParseFailed: 'Impossibile analizzare il file',
    errImageNoText:
      "Gli allegati immagine non forniscono testo; l'immagine viene inviata insieme al messaggio dell'utente, basta guardarla direttamente",
    errNotImage: 'tipo di immagine non supportato',
  },
  pl: {
    dlgAddAttachment: 'Dodaj załączniki',
    filterSupported: 'Obsługiwane pliki',
    filterAll: 'Wszystkie pliki',
    errUnsupportedExt: 'pliki .{ext} nie są obsługiwane',
    errNotFile: 'to nie jest plik',
    errTooLarge: 'przekracza limit {mb} MB',
    errImageTooLarge: 'obraz przekracza limit 5 MB',
    errUnreadable: 'nie można odczytać',
    errFileTooLarge: 'Plik przekracza limit rozmiaru',
    errParseFailed: 'Nie udało się przeanalizować pliku',
    errImageNoText:
      'Załączniki graficzne nie zawierają tekstu; obraz jest wysyłany razem z wiadomością użytkownika, wystarczy na niego spojrzeć',
    errNotImage: 'nieobsługiwany typ obrazu',
  },
  cs: {
    dlgAddAttachment: 'Přidat přílohy',
    filterSupported: 'Podporované soubory',
    filterAll: 'Všechny soubory',
    errUnsupportedExt: 'soubory .{ext} nejsou podporovány',
    errNotFile: 'není soubor',
    errTooLarge: 'překračuje limit {mb} MB',
    errImageTooLarge: 'obrázek překračuje limit 5 MB',
    errUnreadable: 'nelze přečíst',
    errFileTooLarge: 'Soubor překračuje limit velikosti',
    errParseFailed: 'Soubor se nepodařilo zpracovat',
    errImageNoText:
      'Obrázkové přílohy neobsahují text; obrázek se odesílá spolu se zprávou uživatele',
    errNotImage: 'nepodporovaný typ obrázku',
  },
  nl: {
    dlgAddAttachment: 'Bijlagen toevoegen',
    filterSupported: 'Ondersteunde bestanden',
    filterAll: 'Alle bestanden',
    errUnsupportedExt: '.{ext}-bestanden worden niet ondersteund',
    errNotFile: 'geen bestand',
    errTooLarge: 'overschrijdt de limiet van {mb} MB',
    errImageTooLarge: 'afbeelding overschrijdt de limiet van 5 MB',
    errUnreadable: 'kan niet worden gelezen',
    errFileTooLarge: 'Bestand overschrijdt de maximale grootte',
    errParseFailed: 'Kan bestand niet parseren',
    errImageNoText:
      'Afbeeldingsbijlagen bevatten geen tekst; de afbeelding wordt samen met het gebruikersbericht verzonden en kan direct worden bekeken',
    errNotImage: 'geen ondersteund afbeeldingstype',
  },
  ms: {
    dlgAddAttachment: 'Tambah Lampiran',
    filterSupported: 'Fail yang Disokong',
    filterAll: 'Semua Fail',
    errUnsupportedExt: 'fail .{ext} tidak disokong',
    errNotFile: 'bukan fail',
    errTooLarge: 'melebihi had {mb}MB',
    errImageTooLarge: 'imej melebihi had 5MB',
    errUnreadable: 'tidak dapat dibaca',
    errFileTooLarge: 'Fail melebihi had saiz',
    errParseFailed: 'Gagal menghurai fail',
    errImageNoText:
      'Lampiran imej tidak menyediakan teks; imej dihantar bersama mesej pengguna dan boleh dilihat terus',
    errNotImage: 'bukan jenis imej yang disokong',
  },
  he: {
    dlgAddAttachment: 'הוספת קבצים מצורפים',
    filterSupported: 'קבצים נתמכים',
    filterAll: 'כל הקבצים',
    errUnsupportedExt: 'קובצי .{ext} אינם נתמכים',
    errNotFile: 'אינו קובץ',
    errTooLarge: 'חורג מהמגבלה של {mb}MB',
    errImageTooLarge: 'התמונה חורגת מהמגבלה של 5MB',
    errUnreadable: 'לא ניתן לקרוא',
    errFileTooLarge: 'הקובץ חורג ממגבלת הגודל',
    errParseFailed: 'ניתוח הקובץ נכשל',
    errImageNoText:
      'קבצים מצורפים מסוג תמונה אינם מספקים טקסט; התמונה נשלחת יחד עם הודעת המשתמש וניתן לצפות בה ישירות',
    errNotImage: 'סוג תמונה שאינו נתמך',
  },
  hi: {
    dlgAddAttachment: 'अनुलग्नक जोड़ें',
    filterSupported: 'समर्थित फ़ाइलें',
    filterAll: 'सभी फ़ाइलें',
    errUnsupportedExt: '.{ext} फ़ाइलें समर्थित नहीं हैं',
    errNotFile: 'फ़ाइल नहीं है',
    errTooLarge: '{mb}MB की सीमा से अधिक है',
    errImageTooLarge: 'छवि 5MB की सीमा से अधिक है',
    errUnreadable: 'पढ़ा नहीं जा सकता',
    errFileTooLarge: 'फ़ाइल आकार सीमा से अधिक है',
    errParseFailed: 'फ़ाइल पार्स करने में विफल',
    errImageNoText:
      'छवि अनुलग्नक टेक्स्ट प्रदान नहीं करते; छवि उपयोगकर्ता संदेश के साथ भेजी जाती है, उसे सीधे देखें',
    errNotImage: 'समर्थित छवि प्रकार नहीं है',
  },
  'zh-TW': {
    dlgAddAttachment: '新增附件',
    filterSupported: '支援的檔案',
    filterAll: '所有檔案',
    errUnsupportedExt: '暫不支援 .{ext} 類型',
    errNotFile: '不是檔案',
    errTooLarge: '超過 {mb}MB 上限',
    errImageTooLarge: '圖片超過 5MB 上限',
    errUnreadable: '無法讀取',
    errFileTooLarge: '檔案超過大小上限',
    errParseFailed: '檔案解析失敗',
    errImageNoText: '圖片附件不提供文字,已作為影像隨使用者訊息傳送,直接看圖即可',
    errNotImage: '不是支援的圖片類型',
  },
}

const tAttach = createI18n(ATTACH_STRINGS)
type AttachKey = keyof (typeof ATTACH_STRINGS)['zh']
const tm = (key: AttachKey, vars?: Record<string, string | number>): string =>
  tAttach(getUiLang(), key, vars)

/** The largest file read as an attachment. */
export const ATTACHMENT_MAX_BYTES = ATTACHABLE_MAX_BYTES
/** The largest picture sent to the model with a message. */
export const ATTACHMENT_IMAGE_MAX_BYTES = ATTACHABLE_IMAGE_MAX_BYTES
/** The most characters one read hands back; the panel asks for less. */
export const ATTACHMENT_READ_MAX_CHARS = 48_000

/** What an attachment may be: text, office and PDF files read as text, mind maps as their outline, and pictures. */
export const ATTACHMENT_EXTS: ReadonlySet<string> = ATTACHABLE_EXTS

const ATTACHMENT_IMAGE_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

function extOf(name: string): string {
  return name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''
}

function statAttachment(filePath: string): { meta?: AttachmentMeta; error?: string } {
  const name = basename(filePath)
  const ext = extOf(name)
  if (!ATTACHABLE_EXTS.has(ext)) return { error: `${name}: ${tm('errUnsupportedExt', { ext })}` }
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return { error: `${name}: ${tm('errNotFile')}` }
    if (stat.size > ATTACHABLE_MAX_BYTES) {
      return {
        error: `${name}: ${tm('errTooLarge', { mb: Math.round(ATTACHABLE_MAX_BYTES / 1024 / 1024) })}`,
      }
    }
    if (ATTACHABLE_IMAGE_EXTS.has(ext) && stat.size > ATTACHABLE_IMAGE_MAX_BYTES) {
      return { error: `${name}: ${tm('errImageTooLarge')}` }
    }
    return { meta: { path: filePath, name, ext, sizeBytes: stat.size } }
  } catch {
    return { error: `${name}: ${tm('errUnreadable')}` }
  }
}

/** The files that may be attached, with a reason for each one that may not. */
export function collectAttachments(paths: readonly unknown[]): AttachmentAddResult {
  const accepted: AttachmentMeta[] = []
  const rejected: string[] = []
  for (const path of paths) {
    if (typeof path !== 'string' || path === '') continue
    const { meta, error } = statAttachment(path)
    if (meta) accepted.push(meta)
    else if (error) rejected.push(error)
  }
  return { accepted, rejected }
}

let pastedImageSeq = 0
let pastedDirPruned = false

/** Pasted pictures older than a week are removed, once per run of the app. */
function prunePastedImages(dir: string): void {
  if (pastedDirPruned) return
  pastedDirPruned = true
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  try {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      try {
        if (statSync(path).mtimeMs < cutoff) unlinkSync(path)
      } catch {
        // another tab may have removed it already
      }
    }
  } catch {
    // the folder may not exist yet
  }
}

/** A picture pasted from the clipboard (no file of its own) goes to a temporary file, then the usual way. */
function savePastedImage(data: unknown, ext: unknown): string | 'too-large' | null {
  const cleanExt = typeof ext === 'string' ? ext.toLowerCase() : ''
  if (!ATTACHABLE_IMAGE_EXTS.has(cleanExt)) return null
  const bytes =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : null
  if (!bytes || bytes.byteLength === 0) return null
  // the renderer decides what lands on disk here: the picture limit applies before anything is written
  if (bytes.byteLength > ATTACHABLE_IMAGE_MAX_BYTES) return 'too-large'
  const dir = join(app.getPath('temp'), 'genoffice-pasted')
  mkdirSync(dir, { recursive: true })
  prunePastedImages(dir)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const path = join(dir, `pasted-${stamp}-${++pastedImageSeq}.${cleanExt}`)
  writeFileSync(path, bytes)
  return path
}

/** Text already read, by path; a changed file (time or size) is read again. */
const textCache = new Map<string, { stamp: string; text: string }>()

async function attachmentText(filePath: string): Promise<string> {
  // a file open with unsaved changes is not read (before the cache): a
  // withholding mark only reaches the file on save
  await assertFileSaved(filePath)
  const stat = statSync(filePath)
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const cached = textCache.get(filePath)
  if (cached && cached.stamp === stamp) return cached.text
  if (stat.size > ATTACHABLE_MAX_BYTES) throw new Error(tm('errFileTooLarge'))
  const parsed = await parseFileToText(filePath)
  if (!parsed.ok || parsed.kind !== 'text' || parsed.text == null) {
    throw new Error(parsed.error ?? tm('errParseFailed'))
  }
  textCache.set(filePath, { stamp, text: parsed.text })
  if (textCache.size > 8) {
    const oldest = textCache.keys().next().value
    if (oldest !== undefined) textCache.delete(oldest)
  }
  return parsed.text
}

/** One page of an attachment's text: from `offset`, at most `maxChars` (and never more than 48,000). */
export async function readAttachmentPage(
  filePath: unknown,
  offset: unknown,
  maxChars: unknown,
): Promise<AttachmentReadResult> {
  if (typeof filePath !== 'string' || filePath === '') {
    return { ok: false, error: tm('errUnreadable') }
  }
  const name = basename(filePath)
  const ext = extOf(name)
  if (!ATTACHABLE_EXTS.has(ext)) return { ok: false, error: tm('errUnsupportedExt', { ext }) }
  if (ATTACHABLE_IMAGE_EXTS.has(ext)) return { ok: false, error: tm('errImageNoText') }
  try {
    const text = await attachmentText(filePath)
    const start = Math.max(0, Math.floor(Number(offset)) || 0)
    const size = Math.min(Math.max(1, Math.floor(Number(maxChars)) || 1), ATTACHMENT_READ_MAX_CHARS)
    return {
      ok: true,
      name,
      totalChars: text.length,
      offset: start,
      text: text.slice(start, start + size),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** A picture attachment as base64, for the user message. */
export function readAttachmentImage(filePath: unknown): AttachmentImageResult {
  const path = typeof filePath === 'string' ? filePath : ''
  const name = basename(path)
  const mime = ATTACHMENT_IMAGE_MIME[extOf(name)]
  if (!path || !mime) return { ok: false, error: `${name}: ${tm('errNotImage')}` }
  try {
    const stat = statSync(path)
    if (stat.size > ATTACHABLE_IMAGE_MAX_BYTES) {
      return { ok: false, error: `${name}: ${tm('errImageTooLarge')}` }
    }
    return { ok: true, base64: readFileSync(path).toString('base64'), mime }
  } catch {
    return { ok: false, error: `${name}: ${tm('errUnreadable')}` }
  }
}

/** An untitled map got a provisional name from the user's first AI request: the shell titles its tab. */
let provisionalTitleHook: ((wc: WebContents, title: string) => void) | null = null

export function setMindmapProvisionalTitleHook(
  hook: ((wc: WebContents, title: string) => void) | null,
): void {
  provisionalTitleHook = hook
}

export interface MindmapAiIpcOptions {
  /** whether the view already has a file of its own (then its tab keeps the file's name) */
  hasFile(webContentsId: number): boolean
}

/** Registers the attachment channels and the provisional name. Called once, with the editor's other channels. */
export function registerMindmapAiIpc(options: MindmapAiIpcOptions): void {
  ipcMain.handle(MINDMAP_CHANNELS.filesPick, async (e): Promise<AttachmentAddResult | null> => {
    const win =
      BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
    const picked = await showOpenDialogWithMemory(dialog, win, {
      title: tm('dlgAddAttachment'),
      filters: [
        { name: tm('filterSupported'), extensions: [...ATTACHABLE_EXTS] },
        { name: tm('filterAll'), extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    return collectAttachments(picked.filePaths)
  })

  ipcMain.handle(MINDMAP_CHANNELS.filesAdd, (_e, paths: unknown) =>
    collectAttachments(Array.isArray(paths) ? paths : []),
  )

  ipcMain.handle(
    MINDMAP_CHANNELS.filesAddPastedImage,
    (_e, data: unknown, ext: unknown): AttachmentAddResult => {
      const saved = savePastedImage(data, ext)
      if (saved === 'too-large') return { accepted: [], rejected: [tm('errImageTooLarge')] }
      return saved ? collectAttachments([saved]) : { accepted: [], rejected: [tm('errNotImage')] }
    },
  )

  ipcMain.handle(
    MINDMAP_CHANNELS.filesRead,
    (_e, filePath: unknown, offset: unknown, maxChars: unknown) =>
      readAttachmentPage(filePath, offset, maxChars),
  )

  ipcMain.handle(MINDMAP_CHANNELS.filesReadImage, (_e, filePath: unknown) =>
    readAttachmentImage(filePath),
  )

  ipcMain.on(MINDMAP_CHANNELS.provisionalTitle, (e, title: unknown) => {
    if (typeof title !== 'string' || options.hasFile(e.sender.id)) return
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (clean) provisionalTitleHook?.(e.sender, clean)
  })
}
