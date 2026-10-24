import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions } from 'electron'
import { createI18n, defineStrings, type Lang } from '@genoffice/i18n'
import { OUTBOUND_CHANNELS, confirmRequestOf } from '@genoffice/electron-utils/outbound-channels'

/**
 * The main-process side of the editors' outbound guard (decision 0062):
 * whether "Let AI use internet tools" is on, and the question put to the
 * person before the AI fetches an address that has not appeared in the
 * conversation. Only the person's click allows; a closed dialog, a bad
 * request or a window gone mid-question all answer no.
 */

const zh = {
  title: 'AI 想要打开一个网址',
  body: 'AI 想要获取下面的地址。此前对话中从未出现过这个地址。',
  warn: '文档或网页中隐藏的文字可能让 AI 这样做。如果地址中带有文档内容，或者你不认识该网站，请阻止。',
  allow: '允许',
  block: '阻止',
}

type Keys = Record<keyof typeof zh, string>

export const OUTBOUND_CONFIRM_STRINGS = defineStrings({
  zh,
  en: {
    title: 'AI wants to open a web address',
    body: 'The AI wants to fetch the address below. It has not appeared in this conversation before.',
    warn: 'Hidden text in a document or web page may have told the AI to do this. Block it if the address carries document content or you do not know the site.',
    allow: 'Allow',
    block: 'Block',
  } satisfies Keys,
  vi: {
    title: 'AI muốn mở một địa chỉ web',
    body: 'AI muốn tải địa chỉ dưới đây. Địa chỉ này chưa từng xuất hiện trong cuộc trò chuyện.',
    warn: 'Văn bản ẩn trong tài liệu hoặc trang web có thể đã khiến AI làm việc này. Hãy chặn nếu địa chỉ chứa nội dung tài liệu hoặc bạn không biết trang web đó.',
    allow: 'Cho phép',
    block: 'Chặn',
  } satisfies Keys,
  ja: {
    title: 'AI が Web アドレスを開こうとしています',
    body: 'AI が次のアドレスを取得しようとしています。これまでの会話に出てきたことのないアドレスです。',
    warn: '文書や Web ページに隠された文が AI にこれをさせた可能性があります。アドレスに文書の内容が含まれている場合や、知らないサイトの場合はブロックしてください。',
    allow: '許可',
    block: 'ブロック',
  } satisfies Keys,
  ko: {
    title: 'AI가 웹 주소에 접속하려고 합니다',
    body: 'AI가 아래 주소를 가져오려고 합니다. 지금까지 대화에 나온 적 없는 주소입니다.',
    warn: '문서나 웹 페이지에 숨은 글이 AI에게 이 일을 시켰을 수 있습니다. 주소에 문서 내용이 담겨 있거나 모르는 사이트라면 막으세요.',
    allow: '허용',
    block: '막기',
  } satisfies Keys,
  fr: {
    title: 'L’IA veut ouvrir une adresse web',
    body: 'L’IA veut récupérer l’adresse ci-dessous. Elle n’est encore jamais apparue dans cette conversation.',
    warn: 'Un texte caché dans un document ou une page web a pu pousser l’IA à le faire. Bloquez si l’adresse contient du contenu du document ou si vous ne connaissez pas le site.',
    allow: 'Autoriser',
    block: 'Bloquer',
  } satisfies Keys,
  de: {
    title: 'Die KI möchte eine Webadresse öffnen',
    body: 'Die KI möchte die folgende Adresse abrufen. Sie kam in diesem Gespräch bisher nicht vor.',
    warn: 'Versteckter Text in einem Dokument oder einer Webseite könnte die KI dazu gebracht haben. Blockieren Sie, wenn die Adresse Dokumentinhalt enthält oder Sie die Website nicht kennen.',
    allow: 'Zulassen',
    block: 'Blockieren',
  } satisfies Keys,
  es: {
    title: 'La IA quiere abrir una dirección web',
    body: 'La IA quiere obtener la dirección de abajo. No ha aparecido antes en esta conversación.',
    warn: 'Un texto oculto en un documento o una página web pudo haber llevado a la IA a hacerlo. Bloquéela si la dirección lleva contenido del documento o no conoce el sitio.',
    allow: 'Permitir',
    block: 'Bloquear',
  } satisfies Keys,
  th: {
    title: 'AI ต้องการเปิดที่อยู่เว็บ',
    body: 'AI ต้องการดึงที่อยู่ด้านล่าง ที่อยู่นี้ไม่เคยปรากฏในบทสนทนานี้มาก่อน',
    warn: 'ข้อความที่ซ่อนอยู่ในเอกสารหรือหน้าเว็บอาจสั่งให้ AI ทำเช่นนี้ หากที่อยู่มีเนื้อหาของเอกสารหรือคุณไม่รู้จักเว็บไซต์นั้น ให้บล็อก',
    allow: 'อนุญาต',
    block: 'บล็อก',
  } satisfies Keys,
  id: {
    title: 'AI ingin membuka alamat web',
    body: 'AI ingin mengambil alamat di bawah. Alamat ini belum pernah muncul dalam percakapan ini.',
    warn: 'Teks tersembunyi di dokumen atau halaman web mungkin menyuruh AI melakukannya. Blokir jika alamat memuat isi dokumen atau Anda tidak mengenal situsnya.',
    allow: 'Izinkan',
    block: 'Blokir',
  } satisfies Keys,
  ru: {
    title: 'ИИ хочет открыть веб-адрес',
    body: 'ИИ хочет загрузить адрес ниже. Он ещё не встречался в этом разговоре.',
    warn: 'Скрытый текст в документе или на веб-странице мог заставить ИИ сделать это. Заблокируйте, если адрес содержит текст документа или вы не знаете этот сайт.',
    allow: 'Разрешить',
    block: 'Заблокировать',
  } satisfies Keys,
  ar: {
    title: 'يريد الذكاء الاصطناعي فتح عنوان ويب',
    body: 'يريد الذكاء الاصطناعي جلب العنوان أدناه. لم يظهر هذا العنوان في المحادثة من قبل.',
    warn: 'ربما دفع نص مخفي في مستند أو صفحة ويب الذكاء الاصطناعي إلى ذلك. احظره إذا كان العنوان يحمل محتوى من المستند أو كنت لا تعرف الموقع.',
    allow: 'سماح',
    block: 'حظر',
  } satisfies Keys,
  pt: {
    title: 'A IA quer abrir um endereço da web',
    body: 'A IA quer buscar o endereço abaixo. Ele ainda não apareceu nesta conversa.',
    warn: 'Um texto oculto em um documento ou página da web pode ter levado a IA a fazer isso. Bloqueie se o endereço trouxer conteúdo do documento ou se você não conhecer o site.',
    allow: 'Permitir',
    block: 'Bloquear',
  } satisfies Keys,
  it: {
    title: 'L’IA vuole aprire un indirizzo web',
    body: 'L’IA vuole recuperare l’indirizzo qui sotto. Non è mai comparso prima in questa conversazione.',
    warn: 'Un testo nascosto in un documento o in una pagina web potrebbe aver spinto l’IA a farlo. Bloccalo se l’indirizzo contiene contenuto del documento o se non conosci il sito.',
    allow: 'Consenti',
    block: 'Blocca',
  } satisfies Keys,
  pl: {
    title: 'AI chce otworzyć adres internetowy',
    body: 'AI chce pobrać poniższy adres. Nie pojawił się on wcześniej w tej rozmowie.',
    warn: 'Ukryty tekst w dokumencie lub na stronie mógł skłonić AI do tego. Zablokuj, jeśli adres zawiera treść dokumentu lub nie znasz tej witryny.',
    allow: 'Zezwól',
    block: 'Zablokuj',
  } satisfies Keys,
  cs: {
    title: 'AI chce otevřít webovou adresu',
    body: 'AI chce načíst adresu níže. V tomto rozhovoru se dosud neobjevila.',
    warn: 'K tomu mohl AI přimět skrytý text v dokumentu nebo na webové stránce. Zablokujte ji, pokud adresa obsahuje obsah dokumentu nebo web neznáte.',
    allow: 'Povolit',
    block: 'Zablokovat',
  } satisfies Keys,
  nl: {
    title: 'De AI wil een webadres openen',
    body: 'De AI wil het adres hieronder ophalen. Het kwam nog niet eerder in dit gesprek voor.',
    warn: 'Verborgen tekst in een document of webpagina kan de AI hiertoe hebben aangezet. Blokkeer het als het adres documentinhoud bevat of als je de site niet kent.',
    allow: 'Toestaan',
    block: 'Blokkeren',
  } satisfies Keys,
  ms: {
    title: 'AI mahu membuka alamat web',
    body: 'AI mahu mengambil alamat di bawah. Alamat ini belum pernah muncul dalam perbualan ini.',
    warn: 'Teks tersembunyi dalam dokumen atau halaman web mungkin menyuruh AI berbuat begini. Sekat jika alamat itu membawa kandungan dokumen atau anda tidak mengenali laman itu.',
    allow: 'Benarkan',
    block: 'Sekat',
  } satisfies Keys,
  he: {
    title: 'ה-AI רוצה לפתוח כתובת אינטרנט',
    body: 'ה-AI רוצה להביא את הכתובת שלמטה. היא לא הופיעה עד עכשיו בשיחה הזו.',
    warn: 'ייתכן שטקסט מוסתר במסמך או בדף אינטרנט גרם ל-AI לעשות זאת. חסמו אם הכתובת נושאת תוכן מהמסמך או אם אינכם מכירים את האתר.',
    allow: 'אפשר',
    block: 'חסום',
  } satisfies Keys,
  hi: {
    title: 'AI एक वेब पता खोलना चाहता है',
    body: 'AI नीचे दिया गया पता लाना चाहता है। यह पता इस बातचीत में पहले कभी नहीं आया।',
    warn: 'किसी दस्तावेज़ या वेब पेज में छिपे पाठ ने AI से ऐसा करवाया हो सकता है। अगर पते में दस्तावेज़ की सामग्री है या आप साइट को नहीं जानते, तो इसे रोकें।',
    allow: 'अनुमति दें',
    block: 'रोकें',
  } satisfies Keys,
  'zh-TW': {
    title: 'AI 想要開啟一個網址',
    body: 'AI 想要取得下面的位址。先前的對話中從未出現過這個位址。',
    warn: '文件或網頁中隱藏的文字可能讓 AI 這樣做。如果位址中帶有文件內容，或者你不認識該網站，請封鎖。',
    allow: '允許',
    block: '封鎖',
  } satisfies Keys,
})

export const outboundConfirmText = createI18n(OUTBOUND_CONFIRM_STRINGS)

/** Characters of one address the dialog shows; the rest is cut with an ellipsis */
const SHOWN_ADDRESS_CHARS = 300

/** The dialog for one question: "Block" is the default and what closing the dialog means */
export function confirmDialogOptions(
  lang: Lang,
  tool: string,
  addresses: string[],
): MessageBoxOptions {
  const t = (key: keyof typeof zh) => outboundConfirmText(lang, key)
  const shown = addresses
    .map((a) => (a.length > SHOWN_ADDRESS_CHARS ? `${a.slice(0, SHOWN_ADDRESS_CHARS)}…` : a))
    .join('\n')
  return {
    type: 'warning',
    title: t('title'),
    message: t('body'),
    detail: `${shown}\n\n(${tool})\n\n${t('warn')}`,
    buttons: [t('block'), t('allow')],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  }
}

export interface OutboundIpcDeps {
  /** ai-settings.json's switch: only an explicit false turns the tools off */
  internetToolsOn(): boolean
  lang(): Lang
  /** the window to put the question over when the caller's own cannot be found */
  window(): BrowserWindow | null
}

export function registerOutboundIpc(deps: OutboundIpcDeps): void {
  ipcMain.handle(OUTBOUND_CHANNELS.internetTools, (): boolean => deps.internetToolsOn())
  ipcMain.handle(OUTBOUND_CHANNELS.confirmAddresses, async (event, raw: unknown) => {
    const request = confirmRequestOf(raw)
    if (!request || !deps.internetToolsOn()) return false
    const parent = BrowserWindow.fromWebContents(event.sender) ?? deps.window()
    const options = confirmDialogOptions(deps.lang(), request.tool, request.addresses)
    try {
      const { response } =
        parent && !parent.isDestroyed()
          ? await dialog.showMessageBox(parent, options)
          : await dialog.showMessageBox(options)
      return response === 1
    } catch {
      return false
    }
  })
}
