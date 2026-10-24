import { createI18n, defineStrings, normalizeLang } from '@genoffice/i18n'

/**
 * Wording for the per-file recovery prompt (recovery-prompt.ts) and the notice
 * an editor shows once for a document that cannot get a recovery copy.
 *
 * `message` names the document through the `{name}` placeholder: when several
 * restored tabs ask in turn, the user must see which document each is about.
 * `fileChanged` is appended when the file on disk is newer than the copy.
 *
 * `zh` defines the key set; every other language must cover exactly the same
 * keys (compile-time checked). Korean and English are written directly, the
 * other languages are translations.
 */
const zh = {
  message: '“{name}”中有未保存的内容。',
  detail: '上次未保存的更改已保留在恢复副本中。要恢复这些更改吗？选择“放弃”将打开最后保存的文件。',
  fileChanged: '创建副本之后，此文件已被修改（可能是其他程序或同步服务修改的）。',
  restore: '恢复',
  discard: '放弃',
  unprotectable:
    '此文档受密码保护，无法保留恢复副本。如果应用意外关闭，未保存的更改将无法恢复。请经常保存。',
}

type Keys = Record<keyof typeof zh, string>

export const RECOVERY_PROMPT_STRINGS = defineStrings({
  zh,
  en: {
    message: '“{name}” has unsaved changes.',
    detail:
      'Changes that were not saved last time were kept in a recovery copy. Restore them? Discard opens the file as it was last saved.',
    fileChanged:
      'The file has changed since the copy was made. Another program or a sync service may have edited it.',
    restore: 'Restore',
    discard: 'Discard',
    unprotectable:
      'This document is password-protected, so no recovery copy can be kept. If the app closes unexpectedly, unsaved changes cannot be recovered. Save often.',
  } satisfies Keys,
  ja: {
    message: '「{name}」に保存されていない内容があります。',
    detail:
      '前回保存されなかった変更が回復用コピーに残っています。復元しますか？「破棄」を選ぶと、最後に保存したファイルを開きます。',
    fileChanged:
      'コピーの作成後にファイルが変更されています。別のプログラムや同期サービスが編集した可能性があります。',
    restore: '復元',
    discard: '破棄',
    unprotectable:
      'このドキュメントはパスワードで保護されているため、回復用コピーを保存できません。アプリが予期せず終了すると、保存していない変更は復元できません。こまめに保存してください。',
  } satisfies Keys,
  ko: {
    message: '“{name}”에 저장하지 않은 내용이 남아 있습니다.',
    detail:
      '지난번에 저장하지 않은 내용이 복구 사본에 남아 있습니다. 되살릴까요? 버리면 마지막으로 저장한 파일 내용으로 엽니다.',
    fileChanged:
      '사본을 만든 뒤에 파일이 바뀌었습니다. 다른 프로그램이나 동기화 서비스가 고쳤을 수 있습니다.',
    restore: '되살리기',
    discard: '버리기',
    unprotectable:
      '암호가 걸린 문서라 복구 사본을 만들 수 없습니다. 앱이 갑자기 꺼지면 저장하지 않은 내용을 되살릴 수 없으니 자주 저장하세요.',
  } satisfies Keys,
  fr: {
    message: '« {name} » contient des modifications non enregistrées.',
    detail:
      'Les modifications non enregistrées la dernière fois ont été conservées dans une copie de récupération. Les restaurer ? « Ignorer » ouvre le fichier tel qu’il a été enregistré pour la dernière fois.',
    fileChanged:
      'Le fichier a été modifié depuis la création de la copie. Un autre programme ou un service de synchronisation l’a peut-être modifié.',
    restore: 'Restaurer',
    discard: 'Ignorer',
    unprotectable:
      'Ce document est protégé par un mot de passe : aucune copie de récupération ne peut être conservée. Si l’application se ferme de manière inattendue, les modifications non enregistrées seront perdues. Enregistrez souvent.',
  } satisfies Keys,
  de: {
    message: '„{name}“ enthält nicht gespeicherte Änderungen.',
    detail:
      'Änderungen, die zuletzt nicht gespeichert wurden, sind in einer Wiederherstellungskopie erhalten. Wiederherstellen? „Verwerfen“ öffnet die Datei im zuletzt gespeicherten Zustand.',
    fileChanged:
      'Die Datei wurde nach dem Erstellen der Kopie geändert. Möglicherweise hat ein anderes Programm oder ein Synchronisierungsdienst sie bearbeitet.',
    restore: 'Wiederherstellen',
    discard: 'Verwerfen',
    unprotectable:
      'Dieses Dokument ist kennwortgeschützt, daher kann keine Wiederherstellungskopie angelegt werden. Wird die App unerwartet beendet, lassen sich nicht gespeicherte Änderungen nicht wiederherstellen. Speichern Sie häufig.',
  } satisfies Keys,
  es: {
    message: '«{name}» tiene cambios sin guardar.',
    detail:
      'Los cambios que no se guardaron la última vez se conservaron en una copia de recuperación. ¿Restaurarlos? «Descartar» abre el archivo tal como se guardó por última vez.',
    fileChanged:
      'El archivo ha cambiado desde que se creó la copia. Es posible que otro programa o un servicio de sincronización lo haya modificado.',
    restore: 'Restaurar',
    discard: 'Descartar',
    unprotectable:
      'Este documento está protegido con contraseña, así que no se puede guardar una copia de recuperación. Si la aplicación se cierra de forma inesperada, los cambios sin guardar no se podrán recuperar. Guarde a menudo.',
  } satisfies Keys,
  th: {
    message: '“{name}” มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก',
    detail:
      'การเปลี่ยนแปลงที่ไม่ได้บันทึกครั้งก่อนถูกเก็บไว้ในสำเนากู้คืน ต้องการกู้คืนหรือไม่? “ละทิ้ง” จะเปิดไฟล์ตามที่บันทึกไว้ล่าสุด',
    fileChanged: 'ไฟล์ถูกเปลี่ยนแปลงหลังจากสร้างสำเนา โปรแกรมอื่นหรือบริการซิงค์อาจแก้ไขไฟล์นี้',
    restore: 'กู้คืน',
    discard: 'ละทิ้ง',
    unprotectable:
      'เอกสารนี้ป้องกันด้วยรหัสผ่าน จึงเก็บสำเนากู้คืนไม่ได้ หากแอปปิดลงโดยไม่คาดคิด จะกู้คืนการเปลี่ยนแปลงที่ยังไม่ได้บันทึกไม่ได้ โปรดบันทึกบ่อย ๆ',
  } satisfies Keys,
  id: {
    message: '“{name}” memiliki perubahan yang belum disimpan.',
    detail:
      'Perubahan yang tidak disimpan terakhir kali disimpan dalam salinan pemulihan. Pulihkan? “Buang” membuka file seperti saat terakhir disimpan.',
    fileChanged:
      'File telah berubah sejak salinan dibuat. Program lain atau layanan sinkronisasi mungkin telah mengeditnya.',
    restore: 'Pulihkan',
    discard: 'Buang',
    unprotectable:
      'Dokumen ini dilindungi kata sandi, jadi salinan pemulihan tidak dapat disimpan. Jika aplikasi tertutup secara tiba-tiba, perubahan yang belum disimpan tidak dapat dipulihkan. Sering-seringlah menyimpan.',
  } satisfies Keys,
  ru: {
    message: 'В «{name}» есть несохранённые изменения.',
    detail:
      'Изменения, не сохранённые в прошлый раз, остались в копии для восстановления. Восстановить их? «Отклонить» откроет файл в последнем сохранённом виде.',
    fileChanged:
      'Файл изменился после создания копии. Возможно, его изменила другая программа или служба синхронизации.',
    restore: 'Восстановить',
    discard: 'Отклонить',
    unprotectable:
      'Этот документ защищён паролем, поэтому копию для восстановления сохранить нельзя. Если приложение неожиданно закроется, несохранённые изменения восстановить не удастся. Сохраняйте почаще.',
  } satisfies Keys,
  ar: {
    message: 'يحتوي “{name}” على تغييرات غير محفوظة.',
    detail:
      'احتُفظ بالتغييرات التي لم تُحفظ في المرة السابقة في نسخة استرداد. هل تريد استعادتها؟ يؤدي “تجاهل” إلى فتح الملف كما حُفظ آخر مرة.',
    fileChanged: 'تغيّر الملف بعد إنشاء النسخة. ربما عدّله برنامج آخر أو خدمة مزامنة.',
    restore: 'استعادة',
    discard: 'تجاهل',
    unprotectable:
      'هذا المستند محمي بكلمة مرور، لذا لا يمكن الاحتفاظ بنسخة استرداد له. إذا أُغلق التطبيق بشكل غير متوقع فلن يمكن استرداد التغييرات غير المحفوظة. احفظ كثيرًا.',
  } satisfies Keys,
  pt: {
    message: '“{name}” tem alterações não salvas.',
    detail:
      'As alterações não salvas da última vez foram mantidas em uma cópia de recuperação. Restaurá-las? “Descartar” abre o arquivo como foi salvo pela última vez.',
    fileChanged:
      'O arquivo foi alterado depois que a cópia foi criada. Outro programa ou um serviço de sincronização pode tê-lo editado.',
    restore: 'Restaurar',
    discard: 'Descartar',
    unprotectable:
      'Este documento é protegido por senha, então não é possível manter uma cópia de recuperação. Se o aplicativo fechar inesperadamente, as alterações não salvas não poderão ser recuperadas. Salve com frequência.',
  } satisfies Keys,
  it: {
    message: '“{name}” contiene modifiche non salvate.',
    detail:
      'Le modifiche non salvate l’ultima volta sono state conservate in una copia di recupero. Ripristinarle? “Scarta” apre il file com’era all’ultimo salvataggio.',
    fileChanged:
      'Il file è stato modificato dopo la creazione della copia. Potrebbe averlo modificato un altro programma o un servizio di sincronizzazione.',
    restore: 'Ripristina',
    discard: 'Scarta',
    unprotectable:
      'Questo documento è protetto da password, quindi non è possibile conservare una copia di recupero. Se l’app si chiude in modo imprevisto, le modifiche non salvate non potranno essere recuperate. Salva spesso.',
  } satisfies Keys,
  pl: {
    message: '„{name}” zawiera niezapisane zmiany.',
    detail:
      'Zmiany, których ostatnio nie zapisano, zostały zachowane w kopii odzyskiwania. Przywrócić je? „Odrzuć” otwiera plik w ostatnio zapisanej postaci.',
    fileChanged:
      'Plik zmienił się po utworzeniu kopii. Mógł go edytować inny program lub usługa synchronizacji.',
    restore: 'Przywróć',
    discard: 'Odrzuć',
    unprotectable:
      'Ten dokument jest chroniony hasłem, więc nie można przechowywać jego kopii odzyskiwania. Jeśli aplikacja nieoczekiwanie się zamknie, niezapisanych zmian nie da się odzyskać. Zapisuj często.',
  } satisfies Keys,
  cs: {
    message: '„{name}“ obsahuje neuložené změny.',
    detail:
      'Změny, které se minule neuložily, zůstaly v kopii pro obnovení. Obnovit je? „Zahodit“ otevře soubor ve stavu, v jakém byl naposledy uložen.',
    fileChanged:
      'Soubor se od vytvoření kopie změnil. Mohl ho upravit jiný program nebo synchronizační služba.',
    restore: 'Obnovit',
    discard: 'Zahodit',
    unprotectable:
      'Tento dokument je chráněn heslem, proto pro něj nelze uchovávat kopii pro obnovení. Pokud se aplikace nečekaně zavře, neuložené změny nepůjde obnovit. Ukládejte často.',
  } satisfies Keys,
  nl: {
    message: '“{name}” bevat niet-opgeslagen wijzigingen.',
    detail:
      'Wijzigingen die de vorige keer niet zijn opgeslagen, zijn bewaard in een herstelkopie. Herstellen? “Weggooien” opent het bestand zoals het voor het laatst is opgeslagen.',
    fileChanged:
      'Het bestand is gewijzigd nadat de kopie is gemaakt. Mogelijk heeft een ander programma of een synchronisatiedienst het bewerkt.',
    restore: 'Herstellen',
    discard: 'Weggooien',
    unprotectable:
      'Dit document is met een wachtwoord beveiligd, dus er kan geen herstelkopie worden bewaard. Als de app onverwacht sluit, kunnen niet-opgeslagen wijzigingen niet worden hersteld. Sla vaak op.',
  } satisfies Keys,
  ms: {
    message: '“{name}” mempunyai perubahan yang belum disimpan.',
    detail:
      'Perubahan yang tidak disimpan kali terakhir telah dikekalkan dalam salinan pemulihan. Pulihkan? “Buang” membuka fail seperti yang terakhir disimpan.',
    fileChanged:
      'Fail telah berubah sejak salinan dibuat. Program lain atau perkhidmatan penyegerakan mungkin telah menyuntingnya.',
    restore: 'Pulihkan',
    discard: 'Buang',
    unprotectable:
      'Dokumen ini dilindungi kata laluan, jadi salinan pemulihan tidak dapat disimpan. Jika aplikasi tertutup tanpa dijangka, perubahan yang belum disimpan tidak dapat dipulihkan. Simpan dengan kerap.',
  } satisfies Keys,
  he: {
    message: 'ב“{name}” יש שינויים שלא נשמרו.',
    detail:
      'שינויים שלא נשמרו בפעם הקודמת נשמרו בעותק שחזור. לשחזר אותם? “התעלם” יפתח את הקובץ כפי שנשמר לאחרונה.',
    fileChanged: 'הקובץ השתנה מאז שנוצר העותק. ייתכן שתוכנה אחרת או שירות סנכרון ערכו אותו.',
    restore: 'שחזר',
    discard: 'התעלם',
    unprotectable:
      'המסמך מוגן בסיסמה, ולכן לא ניתן לשמור עבורו עותק שחזור. אם היישום ייסגר באופן בלתי צפוי, לא ניתן יהיה לשחזר שינויים שלא נשמרו. שמור לעתים קרובות.',
  } satisfies Keys,
  hi: {
    message: '“{name}” में बिना सहेजे गए बदलाव हैं।',
    detail:
      'पिछली बार जो बदलाव सहेजे नहीं गए थे, वे एक रिकवरी कॉपी में रखे गए हैं। क्या उन्हें पुनर्स्थापित करें? “छोड़ें” चुनने पर फ़ाइल अंतिम बार सहेजी गई स्थिति में खुलेगी।',
    fileChanged:
      'कॉपी बनने के बाद फ़ाइल बदल गई है। हो सकता है किसी दूसरे प्रोग्राम या सिंक सेवा ने इसे संपादित किया हो।',
    restore: 'पुनर्स्थापित करें',
    discard: 'छोड़ें',
    unprotectable:
      'यह दस्तावेज़ पासवर्ड से सुरक्षित है, इसलिए इसकी रिकवरी कॉपी नहीं रखी जा सकती। अगर ऐप अचानक बंद हो जाए तो बिना सहेजे गए बदलाव वापस नहीं मिलेंगे। बार-बार सहेजें।',
  } satisfies Keys,
  'zh-TW': {
    message: '「{name}」中有未儲存的內容。',
    detail:
      '上次未儲存的變更已保留在復原副本中。要復原這些變更嗎？選擇「捨棄」將開啟最後儲存的檔案。',
    fileChanged: '建立副本之後，此檔案已被修改（可能是其他程式或同步服務修改的）。',
    restore: '復原',
    discard: '捨棄',
    unprotectable:
      '此文件受密碼保護，無法保留復原副本。如果應用程式意外關閉，未儲存的變更將無法復原。請經常儲存。',
  } satisfies Keys,
  vi: {
    message: '“{name}” có thay đổi chưa lưu.',
    detail:
      'Những thay đổi chưa được lưu lần trước đã được giữ trong một bản sao khôi phục. Khôi phục chúng? “Loại bỏ” sẽ mở tệp như lần lưu gần nhất.',
    fileChanged:
      'Tệp đã thay đổi kể từ khi tạo bản sao. Có thể một chương trình khác hoặc dịch vụ đồng bộ đã chỉnh sửa tệp.',
    restore: 'Khôi phục',
    discard: 'Loại bỏ',
    unprotectable:
      'Tài liệu này được bảo vệ bằng mật khẩu nên không thể giữ bản sao khôi phục. Nếu ứng dụng đóng đột ngột, những thay đổi chưa lưu sẽ không thể khôi phục. Hãy lưu thường xuyên.',
  } satisfies Keys,
})

const t = createI18n(RECOVERY_PROMPT_STRINGS)

export interface RecoveryPromptLabels {
  /** names the document */
  message: string
  detail: string
  /** extra line when the file on disk is newer than the copy */
  fileChanged: string
  restore: string
  discard: string
}

/** the prompt's strings in the given UI language (raw locale tags accepted) */
export function recoveryPromptLabels(lang: string, documentName: string): RecoveryPromptLabels {
  const loc = normalizeLang(lang)
  return {
    message: t(loc, 'message', { name: documentName }),
    detail: t(loc, 'detail'),
    fileChanged: t(loc, 'fileChanged'),
    restore: t(loc, 'restore'),
    discard: t(loc, 'discard'),
  }
}

/**
 * The notice an editor shows once, when a tab first opens a document that
 * cannot get a recovery copy (password Excel, HWP or PDF).
 */
export function unprotectableNoticeText(lang: string): string {
  return t(normalizeLang(lang), 'unprotectable')
}
