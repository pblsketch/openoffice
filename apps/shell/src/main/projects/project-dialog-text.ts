import type { MessageBoxOptions, OpenDialogOptions } from 'electron'
import { createI18n, defineStrings, type Lang } from '@genoffice/i18n'
import type { ProjectTrustAnswer, ProjectTrustPrompt } from '@genoffice/project-store'

/**
 * The shell main process's project folder dialogs (decision 0088): the
 * first-time trust prompt (spec 5.10), the download question for a file that
 * is not on this PC (spec 5.8), "use this folder as the project?" for a new
 * project and the folder pickers (spec 5.1). Only the texts and the dialog options live here, so they are testable
 * without Electron; `index.ts` shows them parented to the asking window.
 */

const zh = {
  trustTitle: '要使用这个文件夹中的说明吗？',
  trustMessage: '“{name}”文件夹中有并非由这台电脑上的应用写入的说明、记忆或对话。',
  trustHint: '请先阅读再选择。选择“不使用说明”时，AI 只使用文件夹中的文件和这台电脑上的对话。',
  trustInstructions: '说明（instructions.md）',
  trustMemory: '记忆（memory.md）',
  trustForeignChats: '在其他电脑上写的对话',
  trustMoreChats: '……另有 {count} 个',
  chatUntitled: '（无标题）',
  trustUse: '连同说明一起使用',
  trustWithout: '不使用说明',
  cancel: '取消',
  trustViewAll: '查看全部',
  trustViewHint: '点击“查看全部”会在应用中打开这些文件。读完后回到这个窗口，会再次询问。',
  trustMoreChars: '（还有 {count} 个字）',
  downloadTitle: '文件不在这台电脑上',
  downloadMessage: '“{file}”不在这台电脑上，需要先下载。要下载吗？',
  downloadButton: '下载',
  newProjectTitle: '新建项目',
  useExistingMessage: '已有名为“{name}”的文件夹。要把它用作项目吗？',
  useExistingButton: '使用这个文件夹',
  pickFolderTitle: '选择用作项目的文件夹',
  relocateTitle: '重新选择项目文件夹',
  pickParentTitle: '选择新项目的位置',
  pickFolderButton: '选择',
}

type Keys = Record<keyof typeof zh, string>

export const PROJECT_DIALOG_STRINGS = defineStrings({
  zh,
  en: {
    trustTitle: 'Use the instructions in this folder?',
    trustMessage:
      'The folder “{name}” holds instructions, memory or chats that the app on this PC did not write.',
    trustHint:
      'Read them, then choose. With “Use without instructions” the AI uses only the folder’s files and this PC’s chats.',
    trustInstructions: 'Instructions (instructions.md)',
    trustMemory: 'Memory (memory.md)',
    trustForeignChats: 'Chats written on other PCs',
    trustMoreChats: '…and {count} more',
    chatUntitled: '(untitled)',
    trustUse: 'Use with instructions',
    trustWithout: 'Use without instructions',
    cancel: 'Cancel',
    trustViewAll: 'View all',
    trustViewHint:
      '“View all” opens the files in the app. Come back to this window when you have read them and the question appears again.',
    trustMoreChars: '({count} more characters)',
    downloadTitle: 'File not on this PC',
    downloadMessage: '“{file}” is not on this PC and has to be downloaded. Download it?',
    downloadButton: 'Download',
    newProjectTitle: 'New project',
    useExistingMessage: 'A folder named “{name}” already exists. Use that folder as the project?',
    useExistingButton: 'Use this folder',
    pickFolderTitle: 'Choose a folder to use as a project',
    relocateTitle: 'Choose the project folder again',
    pickParentTitle: 'Choose where to create the new project',
    pickFolderButton: 'Choose',
  } satisfies Keys,
  ja: {
    trustTitle: 'このフォルダーの指示を使いますか？',
    trustMessage:
      '「{name}」フォルダーには、この PC のアプリが書いていない指示・記憶・会話があります。',
    trustHint:
      '読んでから選んでください。「指示なしで使う」を選ぶと、AI はフォルダーのファイルとこの PC の会話だけを使います。',
    trustInstructions: '指示（instructions.md）',
    trustMemory: '記憶（memory.md）',
    trustForeignChats: 'ほかの PC で書かれた会話',
    trustMoreChats: '…ほか {count} 件',
    chatUntitled: '（無題）',
    trustUse: '指示も含めて使う',
    trustWithout: '指示なしで使う',
    cancel: 'キャンセル',
    trustViewAll: 'すべて表示',
    trustViewHint:
      '「すべて表示」を押すと、ファイルをアプリで開きます。読み終えてこの画面に戻ると、もう一度確認します。',
    trustMoreChars: '（あと {count} 文字）',
    downloadTitle: 'この PC にないファイル',
    downloadMessage:
      '「{file}」はこの PC にないため、ダウンロードが必要です。ダウンロードしますか？',
    downloadButton: 'ダウンロード',
    newProjectTitle: '新しいプロジェクト',
    useExistingMessage:
      '「{name}」フォルダーはすでにあります。そのフォルダーをプロジェクトとして使いますか？',
    useExistingButton: 'このフォルダーを使う',
    pickFolderTitle: 'プロジェクトとして使うフォルダーを選ぶ',
    relocateTitle: 'プロジェクトフォルダーを選び直す',
    pickParentTitle: '新しいプロジェクトを作る場所を選ぶ',
    pickFolderButton: '選択',
  } satisfies Keys,
  ko: {
    trustTitle: '이 폴더의 지침을 사용할까요?',
    trustMessage: '‘{name}’ 폴더에 이 PC의 앱이 쓰지 않은 지침·기억·대화가 있습니다.',
    trustHint:
      '읽어 보고 고르세요. [지침 없이 사용]을 고르면 AI는 폴더의 파일과 이 PC의 대화만 씁니다.',
    trustInstructions: '지침 (instructions.md)',
    trustMemory: '기억 (memory.md)',
    trustForeignChats: '다른 PC에서 쓴 대화',
    trustMoreChats: '…그 밖에 {count}개',
    chatUntitled: '(제목 없음)',
    trustUse: '지침까지 사용',
    trustWithout: '지침 없이 사용',
    cancel: '취소',
    trustViewAll: '전체 보기',
    trustViewHint:
      '[전체 보기]를 누르면 파일을 앱에서 엽니다. 다 읽고 이 화면으로 돌아오면 다시 묻습니다.',
    trustMoreChars: '({count}자 더 있음)',
    downloadTitle: 'PC에 없는 파일',
    downloadMessage: '‘{file}’은 PC에 없어 내려받아야 합니다. 내려받을까요?',
    downloadButton: '내려받기',
    newProjectTitle: '새 프로젝트',
    useExistingMessage: '‘{name}’ 폴더가 이미 있습니다. 그 폴더를 프로젝트로 사용할까요?',
    useExistingButton: '이 폴더 사용',
    pickFolderTitle: '프로젝트로 쓸 폴더 고르기',
    relocateTitle: '프로젝트 폴더 다시 고르기',
    pickParentTitle: '새 프로젝트를 만들 곳 고르기',
    pickFolderButton: '고르기',
  } satisfies Keys,
  fr: {
    trustTitle: 'Utiliser les consignes de ce dossier ?',
    trustMessage:
      'Le dossier « {name} » contient des consignes, une mémoire ou des conversations que l’application de ce PC n’a pas écrites.',
    trustHint:
      'Lisez-les, puis choisissez. Avec « Utiliser sans les consignes », l’IA n’utilise que les fichiers du dossier et les conversations de ce PC.',
    trustInstructions: 'Consignes (instructions.md)',
    trustMemory: 'Mémoire (memory.md)',
    trustForeignChats: 'Conversations écrites sur d’autres PC',
    trustMoreChats: '…et {count} de plus',
    chatUntitled: '(sans titre)',
    trustUse: 'Utiliser avec les consignes',
    trustWithout: 'Utiliser sans les consignes',
    cancel: 'Annuler',
    trustViewAll: 'Tout afficher',
    trustViewHint:
      '« Tout afficher » ouvre les fichiers dans l’application. Revenez à cette fenêtre après les avoir lus : la question s’affichera de nouveau.',
    trustMoreChars: '({count} caractères de plus)',
    downloadTitle: 'Fichier absent de ce PC',
    downloadMessage: '« {file} » n’est pas sur ce PC et doit être téléchargé. Le télécharger ?',
    downloadButton: 'Télécharger',
    newProjectTitle: 'Nouveau projet',
    useExistingMessage: 'Un dossier nommé « {name} » existe déjà. L’utiliser comme projet ?',
    useExistingButton: 'Utiliser ce dossier',
    pickFolderTitle: 'Choisir un dossier à utiliser comme projet',
    relocateTitle: 'Choisir à nouveau le dossier du projet',
    pickParentTitle: 'Choisir où créer le nouveau projet',
    pickFolderButton: 'Choisir',
  } satisfies Keys,
  de: {
    trustTitle: 'Die Anweisungen in diesem Ordner verwenden?',
    trustMessage:
      'Der Ordner „{name}“ enthält Anweisungen, Erinnerungen oder Chats, die nicht von der App auf diesem PC geschrieben wurden.',
    trustHint:
      'Lesen Sie sie und wählen Sie dann. Mit „Ohne Anweisungen verwenden“ nutzt die KI nur die Dateien des Ordners und die Chats dieses PCs.',
    trustInstructions: 'Anweisungen (instructions.md)',
    trustMemory: 'Erinnerungen (memory.md)',
    trustForeignChats: 'Auf anderen PCs geschriebene Chats',
    trustMoreChats: '…und {count} weitere',
    chatUntitled: '(ohne Titel)',
    trustUse: 'Mit Anweisungen verwenden',
    trustWithout: 'Ohne Anweisungen verwenden',
    cancel: 'Abbrechen',
    trustViewAll: 'Alles anzeigen',
    trustViewHint:
      '„Alles anzeigen“ öffnet die Dateien in der App. Kehren Sie nach dem Lesen zu diesem Fenster zurück, dann erscheint die Frage erneut.',
    trustMoreChars: '({count} weitere Zeichen)',
    downloadTitle: 'Datei nicht auf diesem PC',
    downloadMessage:
      '„{file}“ ist nicht auf diesem PC und muss heruntergeladen werden. Herunterladen?',
    downloadButton: 'Herunterladen',
    newProjectTitle: 'Neues Projekt',
    useExistingMessage:
      'Ein Ordner namens „{name}“ ist bereits vorhanden. Diesen Ordner als Projekt verwenden?',
    useExistingButton: 'Diesen Ordner verwenden',
    pickFolderTitle: 'Ordner als Projekt auswählen',
    relocateTitle: 'Projektordner erneut auswählen',
    pickParentTitle: 'Ort für das neue Projekt auswählen',
    pickFolderButton: 'Auswählen',
  } satisfies Keys,
  es: {
    trustTitle: '¿Usar las instrucciones de esta carpeta?',
    trustMessage:
      'La carpeta «{name}» contiene instrucciones, memoria o conversaciones que la aplicación de este PC no escribió.',
    trustHint:
      'Léalas y luego elija. Con «Usar sin instrucciones», la IA solo usa los archivos de la carpeta y las conversaciones de este PC.',
    trustInstructions: 'Instrucciones (instructions.md)',
    trustMemory: 'Memoria (memory.md)',
    trustForeignChats: 'Conversaciones escritas en otros PC',
    trustMoreChats: '…y {count} más',
    chatUntitled: '(sin título)',
    trustUse: 'Usar con instrucciones',
    trustWithout: 'Usar sin instrucciones',
    cancel: 'Cancelar',
    trustViewAll: 'Ver todo',
    trustViewHint:
      '«Ver todo» abre los archivos en la aplicación. Vuelva a esta ventana después de leerlos y la pregunta aparecerá de nuevo.',
    trustMoreChars: '({count} caracteres más)',
    downloadTitle: 'Archivo que no está en este PC',
    downloadMessage: '«{file}» no está en este PC y hay que descargarlo. ¿Descargarlo?',
    downloadButton: 'Descargar',
    newProjectTitle: 'Nuevo proyecto',
    useExistingMessage: 'Ya existe una carpeta llamada «{name}». ¿Usar esa carpeta como proyecto?',
    useExistingButton: 'Usar esta carpeta',
    pickFolderTitle: 'Elegir una carpeta para usarla como proyecto',
    relocateTitle: 'Volver a elegir la carpeta del proyecto',
    pickParentTitle: 'Elegir dónde crear el nuevo proyecto',
    pickFolderButton: 'Elegir',
  } satisfies Keys,
  th: {
    trustTitle: 'ใช้คำแนะนำในโฟลเดอร์นี้ไหม',
    trustMessage: 'โฟลเดอร์ “{name}” มีคำแนะนำ ความจำ หรือแชตที่แอปบนพีซีเครื่องนี้ไม่ได้เขียน',
    trustHint:
      'อ่านก่อนแล้วจึงเลือก หากเลือก “ใช้โดยไม่มีคำแนะนำ” AI จะใช้เฉพาะไฟล์ในโฟลเดอร์และแชตของพีซีเครื่องนี้',
    trustInstructions: 'คำแนะนำ (instructions.md)',
    trustMemory: 'ความจำ (memory.md)',
    trustForeignChats: 'แชตที่เขียนบนพีซีเครื่องอื่น',
    trustMoreChats: '…และอีก {count} รายการ',
    chatUntitled: '(ไม่มีชื่อ)',
    trustUse: 'ใช้พร้อมคำแนะนำ',
    trustWithout: 'ใช้โดยไม่มีคำแนะนำ',
    cancel: 'ยกเลิก',
    trustViewAll: 'ดูทั้งหมด',
    trustViewHint:
      '“ดูทั้งหมด” จะเปิดไฟล์ในแอป เมื่ออ่านแล้วกลับมาที่หน้าต่างนี้ คำถามจะขึ้นมาอีกครั้ง',
    trustMoreChars: '(ยังมีอีก {count} ตัวอักษร)',
    downloadTitle: 'ไฟล์ไม่อยู่ในพีซีเครื่องนี้',
    downloadMessage: '“{file}” ไม่อยู่ในพีซีเครื่องนี้และต้องดาวน์โหลดก่อน ดาวน์โหลดไหม',
    downloadButton: 'ดาวน์โหลด',
    newProjectTitle: 'โปรเจกต์ใหม่',
    useExistingMessage: 'มีโฟลเดอร์ชื่อ “{name}” อยู่แล้ว ใช้โฟลเดอร์นั้นเป็นโปรเจกต์ไหม',
    useExistingButton: 'ใช้โฟลเดอร์นี้',
    pickFolderTitle: 'เลือกโฟลเดอร์ที่จะใช้เป็นโปรเจกต์',
    relocateTitle: 'เลือกโฟลเดอร์โปรเจกต์อีกครั้ง',
    pickParentTitle: 'เลือกที่สำหรับสร้างโปรเจกต์ใหม่',
    pickFolderButton: 'เลือก',
  } satisfies Keys,
  id: {
    trustTitle: 'Gunakan petunjuk di folder ini?',
    trustMessage:
      'Folder “{name}” berisi petunjuk, memori, atau obrolan yang tidak ditulis oleh aplikasi di PC ini.',
    trustHint:
      'Baca dulu, lalu pilih. Dengan “Gunakan tanpa instruksi”, AI hanya memakai file di folder dan obrolan PC ini.',
    trustInstructions: 'Petunjuk (instructions.md)',
    trustMemory: 'Memori (memory.md)',
    trustForeignChats: 'Obrolan yang ditulis di PC lain',
    trustMoreChats: '…dan {count} lainnya',
    chatUntitled: '(tanpa judul)',
    trustUse: 'Gunakan dengan instruksi',
    trustWithout: 'Gunakan tanpa instruksi',
    cancel: 'Batal',
    trustViewAll: 'Lihat semua',
    trustViewHint:
      '“Lihat semua” membuka file di aplikasi. Kembali ke jendela ini setelah membacanya, lalu pertanyaan ini muncul lagi.',
    trustMoreChars: '({count} karakter lagi)',
    downloadTitle: 'File tidak ada di PC ini',
    downloadMessage: '“{file}” tidak ada di PC ini dan harus diunduh. Unduh sekarang?',
    downloadButton: 'Unduh',
    newProjectTitle: 'Proyek baru',
    useExistingMessage: 'Folder bernama “{name}” sudah ada. Gunakan folder itu sebagai proyek?',
    useExistingButton: 'Gunakan folder ini',
    pickFolderTitle: 'Pilih folder untuk dijadikan proyek',
    relocateTitle: 'Pilih ulang folder proyek',
    pickParentTitle: 'Pilih tempat untuk membuat proyek baru',
    pickFolderButton: 'Pilih',
  } satisfies Keys,
  ru: {
    trustTitle: 'Использовать инструкции из этой папки?',
    trustMessage:
      'В папке «{name}» есть инструкции, память или чаты, которые записало не приложение на этом ПК.',
    trustHint:
      'Прочитайте и выберите. При варианте «Использовать без инструкций» ИИ использует только файлы папки и чаты этого ПК.',
    trustInstructions: 'Инструкции (instructions.md)',
    trustMemory: 'Память (memory.md)',
    trustForeignChats: 'Чаты, написанные на других ПК',
    trustMoreChats: '…и ещё {count}',
    chatUntitled: '(без названия)',
    trustUse: 'Использовать с инструкциями',
    trustWithout: 'Использовать без инструкций',
    cancel: 'Отмена',
    trustViewAll: 'Показать всё',
    trustViewHint:
      '«Показать всё» открывает файлы в приложении. Прочитав их, вернитесь в это окно — вопрос появится снова.',
    trustMoreChars: '(ещё символов: {count})',
    downloadTitle: 'Файла нет на этом ПК',
    downloadMessage: 'Файла «{file}» нет на этом ПК, его нужно скачать. Скачать?',
    downloadButton: 'Скачать',
    newProjectTitle: 'Новый проект',
    useExistingMessage: 'Папка «{name}» уже существует. Использовать эту папку как проект?',
    useExistingButton: 'Использовать эту папку',
    pickFolderTitle: 'Выберите папку для проекта',
    relocateTitle: 'Выберите папку проекта заново',
    pickParentTitle: 'Выберите, где создать новый проект',
    pickFolderButton: 'Выбрать',
  } satisfies Keys,
  ar: {
    trustTitle: 'هل تريد استخدام التعليمات الموجودة في هذا المجلد؟',
    trustMessage:
      'يحتوي المجلد «{name}» على تعليمات أو ذاكرة أو محادثات لم يكتبها التطبيق على هذا الحاسوب.',
    trustHint:
      'اقرأها ثم اختر. عند اختيار «استخدام بلا تعليمات» لا يستخدم الذكاء الاصطناعي إلا ملفات المجلد ومحادثات هذا الحاسوب.',
    trustInstructions: 'التعليمات (instructions.md)',
    trustMemory: 'الذاكرة (memory.md)',
    trustForeignChats: 'محادثات كُتبت على حواسيب أخرى',
    trustMoreChats: '…و{count} أخرى',
    chatUntitled: '(بلا عنوان)',
    trustUse: 'الاستخدام مع التعليمات',
    trustWithout: 'استخدام بلا تعليمات',
    cancel: 'إلغاء',
    trustViewAll: 'عرض الكل',
    trustViewHint:
      '«عرض الكل» يفتح الملفات في التطبيق. بعد قراءتها ارجع إلى هذه النافذة وسيظهر السؤال مرة أخرى.',
    trustMoreChars: '(أحرف إضافية: {count})',
    downloadTitle: 'الملف غير موجود على هذا الحاسوب',
    downloadMessage: 'الملف «{file}» غير موجود على هذا الحاسوب ويجب تنزيله. هل تريد تنزيله؟',
    downloadButton: 'تنزيل',
    newProjectTitle: 'مشروع جديد',
    useExistingMessage: 'يوجد مجلد باسم «{name}» بالفعل. هل تريد استخدام هذا المجلد كمشروع؟',
    useExistingButton: 'استخدام هذا المجلد',
    pickFolderTitle: 'اختر مجلدًا لاستخدامه كمشروع',
    relocateTitle: 'اختر مجلد المشروع من جديد',
    pickParentTitle: 'اختر مكان إنشاء المشروع الجديد',
    pickFolderButton: 'اختيار',
  } satisfies Keys,
  pt: {
    trustTitle: 'Usar as instruções desta pasta?',
    trustMessage:
      'A pasta “{name}” contém instruções, memória ou conversas que o aplicativo deste PC não escreveu.',
    trustHint:
      'Leia e depois escolha. Com “Usar sem instruções”, a IA usa apenas os arquivos da pasta e as conversas deste PC.',
    trustInstructions: 'Instruções (instructions.md)',
    trustMemory: 'Memória (memory.md)',
    trustForeignChats: 'Conversas escritas em outros PCs',
    trustMoreChats: '…e mais {count}',
    chatUntitled: '(sem título)',
    trustUse: 'Usar com instruções',
    trustWithout: 'Usar sem instruções',
    cancel: 'Cancelar',
    trustViewAll: 'Ver tudo',
    trustViewHint:
      '“Ver tudo” abre os arquivos no aplicativo. Depois de lê-los, volte a esta janela e a pergunta aparecerá de novo.',
    trustMoreChars: '(mais {count} caracteres)',
    downloadTitle: 'Arquivo fora deste PC',
    downloadMessage: '“{file}” não está neste PC e precisa ser baixado. Baixar agora?',
    downloadButton: 'Baixar',
    newProjectTitle: 'Novo projeto',
    useExistingMessage: 'Já existe uma pasta chamada “{name}”. Usar essa pasta como projeto?',
    useExistingButton: 'Usar esta pasta',
    pickFolderTitle: 'Escolher uma pasta para usar como projeto',
    relocateTitle: 'Escolher de novo a pasta do projeto',
    pickParentTitle: 'Escolher onde criar o novo projeto',
    pickFolderButton: 'Escolher',
  } satisfies Keys,
  it: {
    trustTitle: 'Usare le istruzioni di questa cartella?',
    trustMessage:
      'La cartella “{name}” contiene istruzioni, memoria o chat che l’app di questo PC non ha scritto.',
    trustHint:
      'Leggile, poi scegli. Con “Usa senza istruzioni” l’IA usa solo i file della cartella e le chat di questo PC.',
    trustInstructions: 'Istruzioni (instructions.md)',
    trustMemory: 'Memoria (memory.md)',
    trustForeignChats: 'Chat scritte su altri PC',
    trustMoreChats: '…e altre {count}',
    chatUntitled: '(senza titolo)',
    trustUse: 'Usa con le istruzioni',
    trustWithout: 'Usa senza istruzioni',
    cancel: 'Annulla',
    trustViewAll: 'Mostra tutto',
    trustViewHint:
      '“Mostra tutto” apre i file nell’app. Dopo averli letti, torna a questa finestra e la domanda comparirà di nuovo.',
    trustMoreChars: '(altri {count} caratteri)',
    downloadTitle: 'File non presente su questo PC',
    downloadMessage: '“{file}” non è su questo PC e va scaricato. Scaricarlo?',
    downloadButton: 'Scarica',
    newProjectTitle: 'Nuovo progetto',
    useExistingMessage: 'Esiste già una cartella chiamata “{name}”. Usarla come progetto?',
    useExistingButton: 'Usa questa cartella',
    pickFolderTitle: 'Scegli una cartella da usare come progetto',
    relocateTitle: 'Scegli di nuovo la cartella del progetto',
    pickParentTitle: 'Scegli dove creare il nuovo progetto',
    pickFolderButton: 'Scegli',
  } satisfies Keys,
  pl: {
    trustTitle: 'Użyć instrukcji z tego folderu?',
    trustMessage:
      'Folder „{name}” zawiera instrukcje, pamięć lub czaty, których nie zapisała aplikacja na tym komputerze.',
    trustHint:
      'Przeczytaj je, a potem wybierz. Przy „Użyj bez instrukcji” AI korzysta tylko z plików folderu i czatów z tego komputera.',
    trustInstructions: 'Instrukcje (instructions.md)',
    trustMemory: 'Pamięć (memory.md)',
    trustForeignChats: 'Czaty napisane na innych komputerach',
    trustMoreChats: '…i jeszcze {count}',
    chatUntitled: '(bez tytułu)',
    trustUse: 'Użyj z instrukcjami',
    trustWithout: 'Użyj bez instrukcji',
    cancel: 'Anuluj',
    trustViewAll: 'Pokaż wszystko',
    trustViewHint:
      '„Pokaż wszystko” otwiera pliki w aplikacji. Po przeczytaniu wróć do tego okna, a pytanie pojawi się ponownie.',
    trustMoreChars: '(pozostało znaków: {count})',
    downloadTitle: 'Pliku nie ma na tym komputerze',
    downloadMessage: 'Pliku „{file}” nie ma na tym komputerze i trzeba go pobrać. Pobrać?',
    downloadButton: 'Pobierz',
    newProjectTitle: 'Nowy projekt',
    useExistingMessage: 'Folder „{name}” już istnieje. Użyć tego folderu jako projektu?',
    useExistingButton: 'Użyj tego folderu',
    pickFolderTitle: 'Wybierz folder na projekt',
    relocateTitle: 'Wybierz ponownie folder projektu',
    pickParentTitle: 'Wybierz, gdzie utworzyć nowy projekt',
    pickFolderButton: 'Wybierz',
  } satisfies Keys,
  cs: {
    trustTitle: 'Použít pokyny z této složky?',
    trustMessage:
      'Složka „{name}“ obsahuje pokyny, paměť nebo konverzace, které nezapsala aplikace na tomto počítači.',
    trustHint:
      'Přečtěte si je a pak vyberte. Při volbě „Použít bez pokynů“ AI použije jen soubory ve složce a konverzace z tohoto počítače.',
    trustInstructions: 'Pokyny (instructions.md)',
    trustMemory: 'Paměť (memory.md)',
    trustForeignChats: 'Konverzace napsané na jiných počítačích',
    trustMoreChats: '…a dalších {count}',
    chatUntitled: '(bez názvu)',
    trustUse: 'Použít i s pokyny',
    trustWithout: 'Použít bez pokynů',
    cancel: 'Zrušit',
    trustViewAll: 'Zobrazit vše',
    trustViewHint:
      '„Zobrazit vše“ otevře soubory v aplikaci. Po přečtení se vraťte do tohoto okna a otázka se zobrazí znovu.',
    trustMoreChars: '(zbývá znaků: {count})',
    downloadTitle: 'Soubor není na tomto počítači',
    downloadMessage: 'Soubor „{file}“ není na tomto počítači a je třeba ho stáhnout. Stáhnout?',
    downloadButton: 'Stáhnout',
    newProjectTitle: 'Nový projekt',
    useExistingMessage: 'Složka „{name}“ už existuje. Použít ji jako projekt?',
    useExistingButton: 'Použít tuto složku',
    pickFolderTitle: 'Vyberte složku pro projekt',
    relocateTitle: 'Znovu vyberte složku projektu',
    pickParentTitle: 'Vyberte, kde vytvořit nový projekt',
    pickFolderButton: 'Vybrat',
  } satisfies Keys,
  nl: {
    trustTitle: 'De instructies in deze map gebruiken?',
    trustMessage:
      'De map ‘{name}’ bevat instructies, geheugen of chats die niet door de app op deze pc zijn geschreven.',
    trustHint:
      'Lees ze en kies dan. Met ‘Gebruiken zonder instructies’ gebruikt de AI alleen de bestanden in de map en de chats van deze pc.',
    trustInstructions: 'Instructies (instructions.md)',
    trustMemory: 'Geheugen (memory.md)',
    trustForeignChats: 'Chats geschreven op andere pc’s',
    trustMoreChats: '…en nog {count}',
    chatUntitled: '(zonder titel)',
    trustUse: 'Gebruiken met instructies',
    trustWithout: 'Gebruiken zonder instructies',
    cancel: 'Annuleren',
    trustViewAll: 'Alles bekijken',
    trustViewHint:
      '‘Alles bekijken’ opent de bestanden in de app. Kom na het lezen terug naar dit venster, dan verschijnt de vraag opnieuw.',
    trustMoreChars: '(nog {count} tekens)',
    downloadTitle: 'Bestand niet op deze pc',
    downloadMessage: '‘{file}’ staat niet op deze pc en moet worden gedownload. Downloaden?',
    downloadButton: 'Downloaden',
    newProjectTitle: 'Nieuw project',
    useExistingMessage:
      'Er bestaat al een map met de naam ‘{name}’. Die map als project gebruiken?',
    useExistingButton: 'Deze map gebruiken',
    pickFolderTitle: 'Kies een map om als project te gebruiken',
    relocateTitle: 'Kies de projectmap opnieuw',
    pickParentTitle: 'Kies waar het nieuwe project komt',
    pickFolderButton: 'Kiezen',
  } satisfies Keys,
  ms: {
    trustTitle: 'Guna arahan dalam folder ini?',
    trustMessage:
      'Folder “{name}” mengandungi arahan, memori atau sembang yang tidak ditulis oleh aplikasi pada PC ini.',
    trustHint:
      'Baca dahulu, kemudian pilih. Dengan “Guna tanpa arahan”, AI hanya menggunakan fail dalam folder dan sembang PC ini.',
    trustInstructions: 'Arahan (instructions.md)',
    trustMemory: 'Memori (memory.md)',
    trustForeignChats: 'Sembang yang ditulis pada PC lain',
    trustMoreChats: '…dan {count} lagi',
    chatUntitled: '(tiada tajuk)',
    trustUse: 'Guna dengan arahan',
    trustWithout: 'Guna tanpa arahan',
    cancel: 'Batal',
    trustViewAll: 'Lihat semua',
    trustViewHint:
      '“Lihat semua” membuka fail dalam aplikasi. Selepas membacanya, kembali ke tetingkap ini dan soalan akan muncul semula.',
    trustMoreChars: '({count} aksara lagi)',
    downloadTitle: 'Fail tiada pada PC ini',
    downloadMessage: '“{file}” tiada pada PC ini dan perlu dimuat turun. Muat turun?',
    downloadButton: 'Muat turun',
    newProjectTitle: 'Projek baharu',
    useExistingMessage: 'Folder bernama “{name}” sudah wujud. Guna folder itu sebagai projek?',
    useExistingButton: 'Guna folder ini',
    pickFolderTitle: 'Pilih folder untuk dijadikan projek',
    relocateTitle: 'Pilih semula folder projek',
    pickParentTitle: 'Pilih tempat untuk mencipta projek baharu',
    pickFolderButton: 'Pilih',
  } satisfies Keys,
  he: {
    trustTitle: 'להשתמש בהנחיות שבתיקייה הזו?',
    trustMessage: 'התיקייה „{name}” מכילה הנחיות, זיכרון או שיחות שהאפליקציה במחשב הזה לא כתבה.',
    trustHint:
      'קראו ואז בחרו. באפשרות „שימוש בלי הוראות” הבינה המלאכותית משתמשת רק בקבצי התיקייה ובשיחות של המחשב הזה.',
    trustInstructions: 'הנחיות (instructions.md)',
    trustMemory: 'זיכרון (memory.md)',
    trustForeignChats: 'שיחות שנכתבו במחשבים אחרים',
    trustMoreChats: '…ועוד {count}',
    chatUntitled: '(ללא כותרת)',
    trustUse: 'שימוש עם ההוראות',
    trustWithout: 'שימוש בלי הוראות',
    cancel: 'ביטול',
    trustViewAll: 'הצגת הכול',
    trustViewHint:
      '„הצגת הכול” פותחת את הקבצים באפליקציה. אחרי הקריאה חזרו לחלון הזה והשאלה תופיע שוב.',
    trustMoreChars: '(עוד {count} תווים)',
    downloadTitle: 'הקובץ לא נמצא במחשב הזה',
    downloadMessage: 'הקובץ „{file}” לא נמצא במחשב הזה וצריך להוריד אותו. להוריד?',
    downloadButton: 'הורדה',
    newProjectTitle: 'פרויקט חדש',
    useExistingMessage: 'כבר קיימת תיקייה בשם „{name}”. להשתמש בה כפרויקט?',
    useExistingButton: 'שימוש בתיקייה הזו',
    pickFolderTitle: 'בחירת תיקייה לשימוש כפרויקט',
    relocateTitle: 'בחירה מחדש של תיקיית הפרויקט',
    pickParentTitle: 'בחירת מקום ליצירת הפרויקט החדש',
    pickFolderButton: 'בחירה',
  } satisfies Keys,
  hi: {
    trustTitle: 'क्या इस फ़ोल्डर के निर्देश इस्तेमाल करें?',
    trustMessage:
      '“{name}” फ़ोल्डर में ऐसे निर्देश, स्मृति या चैट हैं जिन्हें इस PC के ऐप ने नहीं लिखा।',
    trustHint:
      'पहले पढ़ें, फिर चुनें। “निर्देशों के बिना उपयोग करें” चुनने पर AI केवल फ़ोल्डर की फ़ाइलें और इस PC की चैट इस्तेमाल करता है।',
    trustInstructions: 'निर्देश (instructions.md)',
    trustMemory: 'स्मृति (memory.md)',
    trustForeignChats: 'दूसरे PC पर लिखी गई चैट',
    trustMoreChats: '…और {count}',
    chatUntitled: '(बिना शीर्षक)',
    trustUse: 'निर्देशों के साथ इस्तेमाल करें',
    trustWithout: 'निर्देशों के बिना उपयोग करें',
    cancel: 'रद्द करें',
    trustViewAll: 'सब देखें',
    trustViewHint:
      '“सब देखें” फ़ाइलों को ऐप में खोलता है। पढ़ने के बाद इस विंडो पर लौटें, सवाल फिर से दिखेगा।',
    trustMoreChars: '({count} अक्षर और)',
    downloadTitle: 'फ़ाइल इस PC पर नहीं है',
    downloadMessage: '“{file}” इस PC पर नहीं है और इसे डाउनलोड करना होगा। डाउनलोड करें?',
    downloadButton: 'डाउनलोड करें',
    newProjectTitle: 'नया प्रोजेक्ट',
    useExistingMessage:
      '“{name}” नाम का फ़ोल्डर पहले से है। क्या उसी फ़ोल्डर को प्रोजेक्ट के रूप में इस्तेमाल करें?',
    useExistingButton: 'यही फ़ोल्डर इस्तेमाल करें',
    pickFolderTitle: 'प्रोजेक्ट के लिए फ़ोल्डर चुनें',
    relocateTitle: 'प्रोजेक्ट फ़ोल्डर फिर से चुनें',
    pickParentTitle: 'नया प्रोजेक्ट बनाने की जगह चुनें',
    pickFolderButton: 'चुनें',
  } satisfies Keys,
  'zh-TW': {
    trustTitle: '要使用這個資料夾中的說明嗎？',
    trustMessage: '「{name}」資料夾中有並非由這台電腦上的應用程式寫入的說明、記憶或對話。',
    trustHint:
      '請先閱讀再選擇。選擇「使用但不含指示」時，AI 只使用資料夾中的檔案和這台電腦上的對話。',
    trustInstructions: '說明（instructions.md）',
    trustMemory: '記憶（memory.md）',
    trustForeignChats: '在其他電腦上寫的對話',
    trustMoreChats: '……另有 {count} 個',
    chatUntitled: '（無標題）',
    trustUse: '連同指示一起使用',
    trustWithout: '使用但不含指示',
    cancel: '取消',
    trustViewAll: '檢視全部',
    trustViewHint: '按「檢視全部」會在應用程式中開啟這些檔案。讀完後回到這個視窗，就會再次詢問。',
    trustMoreChars: '（還有 {count} 個字）',
    downloadTitle: '檔案不在這台電腦上',
    downloadMessage: '「{file}」不在這台電腦上，需要先下載。要下載嗎？',
    downloadButton: '下載',
    newProjectTitle: '新增專案',
    useExistingMessage: '已有名為「{name}」的資料夾。要把它用作專案嗎？',
    useExistingButton: '使用這個資料夾',
    pickFolderTitle: '選擇用作專案的資料夾',
    relocateTitle: '重新選擇專案資料夾',
    pickParentTitle: '選擇新專案的位置',
    pickFolderButton: '選擇',
  } satisfies Keys,
  vi: {
    trustTitle: 'Dùng hướng dẫn trong thư mục này?',
    trustMessage:
      'Thư mục “{name}” có hướng dẫn, bộ nhớ hoặc cuộc trò chuyện không do ứng dụng trên máy này viết.',
    trustHint:
      'Hãy đọc rồi chọn. Với “Dùng mà không theo chỉ dẫn”, AI chỉ dùng các tệp trong thư mục và cuộc trò chuyện của máy này.',
    trustInstructions: 'Hướng dẫn (instructions.md)',
    trustMemory: 'Bộ nhớ (memory.md)',
    trustForeignChats: 'Cuộc trò chuyện viết trên máy khác',
    trustMoreChats: '…và {count} cuộc khác',
    chatUntitled: '(không có tiêu đề)',
    trustUse: 'Dùng cùng chỉ dẫn',
    trustWithout: 'Dùng mà không theo chỉ dẫn',
    cancel: 'Hủy',
    trustViewAll: 'Xem tất cả',
    trustViewHint:
      '“Xem tất cả” mở các tệp trong ứng dụng. Đọc xong, hãy quay lại cửa sổ này và câu hỏi sẽ hiện lại.',
    trustMoreChars: '(còn {count} ký tự)',
    downloadTitle: 'Tệp không có trên máy này',
    downloadMessage: '“{file}” không có trên máy này và cần được tải xuống. Tải xuống?',
    downloadButton: 'Tải xuống',
    newProjectTitle: 'Dự án mới',
    useExistingMessage: 'Đã có thư mục tên “{name}”. Dùng thư mục đó làm dự án?',
    useExistingButton: 'Dùng thư mục này',
    pickFolderTitle: 'Chọn thư mục để dùng làm dự án',
    relocateTitle: 'Chọn lại thư mục dự án',
    pickParentTitle: 'Chọn nơi tạo dự án mới',
    pickFolderButton: 'Chọn',
  } satisfies Keys,
})

export const projectDialogText = createI18n(PROJECT_DIALOG_STRINGS)

/** Characters of each file the trust prompt shows; the rest is counted ("N more characters") */
export const TRUST_TEXT_SHOWN_CHARS = 1_500

/** Chats from other PCs the trust prompt lists by name; the rest are counted */
export const TRUST_CHATS_SHOWN = 20

/** `text` cut to `max` characters (whole code points) with an ellipsis */
export function shownText(text: string, max = TRUST_TEXT_SHOWN_CHARS): string {
  return shownExcerpt(text, max).text
}

/** `text` trimmed and cut to `max` whole characters, and how many characters were left out */
export function shownExcerpt(
  text: string,
  max = TRUST_TEXT_SHOWN_CHARS,
): { text: string; more: number } {
  const chars = Array.from(text.trim())
  if (chars.length <= max) return { text: chars.join(''), more: 0 }
  return { text: `${chars.slice(0, max).join('')}…`, more: chars.length - max }
}

function shownCount(count: number, lang: Lang): string {
  try {
    return new Intl.NumberFormat(lang).format(count)
  } catch {
    return String(count)
  }
}

function shownDate(iso: string, lang: Lang): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
  } catch {
    return at.toISOString()
  }
}

/**
 * What the person picked in the trust prompt: the answer, or `view` for
 * [view all] (open the files, then ask again). null: closed or cancelled.
 */
export type ProjectTrustChoice = ProjectTrustAnswer | 'view'

/** The response index of each trust prompt button */
const TRUST_USE = 0
const TRUST_WITHOUT = 1
const TRUST_VIEW = 2
const TRUST_CANCEL = 3

/**
 * The first-time trust prompt (spec 5.10): the texts this install did not
 * write (each cut to its first `TRUST_TEXT_SHOWN_CHARS` characters with "N
 * more characters") and the chats from other PCs, with [use] / [use without
 * instructions] / [view all] / [cancel]. Cancel is the default and what closing
 * means.
 */
export function trustPromptOptions(lang: Lang, prompt: ProjectTrustPrompt): MessageBoxOptions {
  const t = (key: keyof typeof zh, params?: Record<string, string | number>) =>
    projectDialogText(lang, key, params)
  const parts: string[] = [t('trustHint'), t('trustViewHint'), prompt.folderPath]
  const section = (label: string, text: string | null) => {
    if (text === null || !text.trim()) return
    const shown = shownExcerpt(text)
    const more =
      shown.more > 0 ? `\n${t('trustMoreChars', { count: shownCount(shown.more, lang) })}` : ''
    parts.push(`— ${label} —\n${shown.text}${more}`)
  }
  section(t('trustInstructions'), prompt.instructions)
  section(t('trustMemory'), prompt.memory)
  section('AGENTS.md', prompt.agents)
  section('CLAUDE.md', prompt.claude)
  if (prompt.foreignChats.length > 0) {
    const lines = prompt.foreignChats
      .slice(0, TRUST_CHATS_SHOWN)
      .map(
        (chat) =>
          `• ${shownText(chat.title, 120) || t('chatUntitled')} (${shownDate(chat.updatedAt, lang)})`,
      )
    const more = prompt.foreignChats.length - TRUST_CHATS_SHOWN
    if (more > 0) lines.push(t('trustMoreChats', { count: more }))
    parts.push(`— ${t('trustForeignChats')} —\n${lines.join('\n')}`)
  }
  return {
    type: 'question',
    title: t('trustTitle'),
    message: t('trustMessage', { name: prompt.name }),
    detail: parts.join('\n\n'),
    buttons: [t('trustUse'), t('trustWithout'), t('trustViewAll'), t('cancel')],
    defaultId: TRUST_CANCEL,
    cancelId: TRUST_CANCEL,
    noLink: true,
  }
}

/** The person's pick from the trust prompt's response; anything but the three choices cancels */
export function trustChoiceOf(response: number): ProjectTrustChoice {
  if (response === TRUST_USE) return 'use'
  if (response === TRUST_WITHOUT) return 'without'
  if (response === TRUST_VIEW) return 'view'
  return null
}

/** "'<file>' is not on this PC ...": [download] is response 0; cancel is the default */
export function downloadPromptOptions(lang: Lang, fileName: string): MessageBoxOptions {
  return {
    type: 'question',
    title: projectDialogText(lang, 'downloadTitle'),
    message: projectDialogText(lang, 'downloadMessage', { file: fileName }),
    buttons: [projectDialogText(lang, 'downloadButton'), projectDialogText(lang, 'cancel')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
}

/** The last part of a folder path, either separator ("D:\docs\Budget" -> "Budget") */
function folderBaseName(folderPath: string): string {
  const parts = folderPath.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? folderPath
}

/**
 * "'<name>' already exists. Use that folder as the project?" for a new project
 * whose folder exists: [use this folder] is response 0
 */
export function useExistingPromptOptions(lang: Lang, folderPath: string): MessageBoxOptions {
  return {
    type: 'question',
    title: projectDialogText(lang, 'newProjectTitle'),
    message: projectDialogText(lang, 'useExistingMessage', { name: folderBaseName(folderPath) }),
    detail: folderPath,
    buttons: [projectDialogText(lang, 'useExistingButton'), projectDialogText(lang, 'cancel')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }
}

export type ProjectFolderPickPurpose = 'add' | 'relocate' | 'parent'

/**
 * The folder picker for "add folder", relocating a missing project, and a new
 * project's parent folder ("create somewhere else…", spec 5.1)
 */
export function folderPickerOptions(
  lang: Lang,
  purpose: ProjectFolderPickPurpose,
): OpenDialogOptions {
  const title =
    purpose === 'add'
      ? 'pickFolderTitle'
      : purpose === 'relocate'
        ? 'relocateTitle'
        : 'pickParentTitle'
  return {
    title: projectDialogText(lang, title),
    buttonLabel: projectDialogText(lang, 'pickFolderButton'),
    properties: ['openDirectory', 'createDirectory'],
  }
}
