import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'

/**
 * The home ask panel's own wording for project folders (decision 0088). The
 * picker, the chat menu and the notice lines bring theirs from @genoffice/ui;
 * this is what the home ask says about the chosen project: its head, input
 * hint and first line, a document saved into its folder, and why a question
 * could not use it. `zh` defines the key set.
 */
const zh = {
  askProjectMissing: '找不到所选项目的文件夹，因此没有发送。请在下方重新选择项目。',
  askProjectTitle: '向项目“{name}”提问',
  askProjectPlaceholder: '就项目“{name}”中的文件提问…',
  askProjectStarsPlaceholder: '就项目“{name}”中的文件和收藏的文件提问…',
  askProjectIntro: '会查找并阅读项目“{name}”文件夹中的文件来回答。',
  askHeroProjectHint: '或者在下方选择一个项目。',
  askSavedToProject: '已保存到项目文件夹：{name}',
  askOpenCreated: '打开',
}

export const kbAskProjectStrings = defineStrings({
  zh,
  en: {
    askProjectMissing:
      'The chosen project’s folder could not be found, so nothing was sent. Choose the project again below.',
    askProjectTitle: 'Ask the project “{name}”',
    askProjectPlaceholder: 'Ask about the files in the project “{name}”…',
    askProjectStarsPlaceholder:
      'Ask about the files in the project “{name}” and your starred files…',
    askProjectIntro:
      'Answers come from the files in the “{name}” project folder, found and read as needed.',
    askHeroProjectHint: 'Or choose a project below.',
    askSavedToProject: 'Saved in the project folder: {name}',
    askOpenCreated: 'Open',
  },
  ja: {
    askProjectMissing:
      '選んだプロジェクトのフォルダーが見つからないため、送信しませんでした。下でプロジェクトを選び直してください。',
    askProjectTitle: 'プロジェクト「{name}」に質問',
    askProjectPlaceholder: 'プロジェクト「{name}」のファイルについて質問…',
    askProjectStarsPlaceholder: 'プロジェクト「{name}」のファイルとスター付きファイルについて質問…',
    askProjectIntro: 'プロジェクト「{name}」のフォルダーにあるファイルを探して読み、回答します。',
    askHeroProjectHint: 'または下でプロジェクトを選んでください。',
    askSavedToProject: 'プロジェクトフォルダーに保存しました: {name}',
    askOpenCreated: '開く',
  },
  ko: {
    askProjectMissing:
      '고른 프로젝트의 폴더를 찾을 수 없어 보내지 않았습니다. 아래에서 프로젝트를 다시 고르세요.',
    askProjectTitle: '프로젝트 ‘{name}’에 질문',
    askProjectPlaceholder: '‘{name}’ 프로젝트의 파일에 대해 질문…',
    askProjectStarsPlaceholder: '‘{name}’ 프로젝트의 파일과 즐겨찾기한 파일에 대해 질문…',
    askProjectIntro: '‘{name}’ 프로젝트 폴더의 파일을 찾아 읽고 답합니다.',
    askHeroProjectHint: '또는 아래에서 프로젝트를 고르세요.',
    askSavedToProject: '프로젝트 폴더에 저장함: {name}',
    askOpenCreated: '열기',
  },
  fr: {
    askProjectMissing:
      'Le dossier du projet choisi est introuvable : rien n’a été envoyé. Choisissez de nouveau le projet ci-dessous.',
    askProjectTitle: 'Interroger le projet « {name} »',
    askProjectPlaceholder: 'Posez une question sur les fichiers du projet « {name} »…',
    askProjectStarsPlaceholder:
      'Posez une question sur les fichiers du projet « {name} » et vos fichiers favoris…',
    askProjectIntro:
      'Les réponses s’appuient sur les fichiers du dossier du projet « {name} », trouvés et lus au besoin.',
    askHeroProjectHint: 'Ou choisissez un projet ci-dessous.',
    askSavedToProject: 'Enregistré dans le dossier du projet : {name}',
    askOpenCreated: 'Ouvrir',
  },
  de: {
    askProjectMissing:
      'Der Ordner des gewählten Projekts wurde nicht gefunden, daher wurde nichts gesendet. Wählen Sie das Projekt unten erneut.',
    askProjectTitle: 'Fragen an das Projekt „{name}“',
    askProjectPlaceholder: 'Fragen Sie zu den Dateien im Projekt „{name}“…',
    askProjectStarsPlaceholder:
      'Fragen Sie zu den Dateien im Projekt „{name}“ und Ihren Favoriten…',
    askProjectIntro:
      'Die Antworten stammen aus den Dateien im Projektordner „{name}“, die bei Bedarf gesucht und gelesen werden.',
    askHeroProjectHint: 'Oder wählen Sie unten ein Projekt.',
    askSavedToProject: 'Im Projektordner gespeichert: {name}',
    askOpenCreated: 'Öffnen',
  },
  es: {
    askProjectMissing:
      'No se encontró la carpeta del proyecto elegido, así que no se envió nada. Vuelve a elegir el proyecto abajo.',
    askProjectTitle: 'Preguntar al proyecto «{name}»',
    askProjectPlaceholder: 'Pregunta sobre los archivos del proyecto «{name}»…',
    askProjectStarsPlaceholder:
      'Pregunta sobre los archivos del proyecto «{name}» y tus archivos favoritos…',
    askProjectIntro:
      'Responde buscando y leyendo los archivos de la carpeta del proyecto «{name}».',
    askHeroProjectHint: 'O elige un proyecto abajo.',
    askSavedToProject: 'Guardado en la carpeta del proyecto: {name}',
    askOpenCreated: 'Abrir',
  },
  th: {
    askProjectMissing:
      'ไม่พบโฟลเดอร์ของโปรเจกต์ที่เลือก จึงไม่ได้ส่งคำถาม โปรดเลือกโปรเจกต์อีกครั้งด้านล่าง',
    askProjectTitle: 'ถามโปรเจกต์ “{name}”',
    askProjectPlaceholder: 'ถามเกี่ยวกับไฟล์ในโปรเจกต์ “{name}”…',
    askProjectStarsPlaceholder: 'ถามเกี่ยวกับไฟล์ในโปรเจกต์ “{name}” และไฟล์ที่ติดดาว…',
    askProjectIntro: 'จะค้นหาและอ่านไฟล์ในโฟลเดอร์ของโปรเจกต์ “{name}” เพื่อตอบ',
    askHeroProjectHint: 'หรือเลือกโปรเจกต์ด้านล่าง',
    askSavedToProject: 'บันทึกในโฟลเดอร์โปรเจกต์แล้ว: {name}',
    askOpenCreated: 'เปิด',
  },
  id: {
    askProjectMissing:
      'Folder proyek yang dipilih tidak ditemukan, jadi tidak ada yang dikirim. Pilih proyek lagi di bawah.',
    askProjectTitle: 'Tanya proyek “{name}”',
    askProjectPlaceholder: 'Tanya tentang file di proyek “{name}”…',
    askProjectStarsPlaceholder: 'Tanya tentang file di proyek “{name}” dan file berbintang…',
    askProjectIntro:
      'Jawaban diambil dari file di folder proyek “{name}”, yang dicari dan dibaca sesuai kebutuhan.',
    askHeroProjectHint: 'Atau pilih proyek di bawah.',
    askSavedToProject: 'Disimpan di folder proyek: {name}',
    askOpenCreated: 'Buka',
  },
  ru: {
    askProjectMissing:
      'Папка выбранного проекта не найдена, поэтому ничего не отправлено. Выберите проект ниже ещё раз.',
    askProjectTitle: 'Вопрос к проекту «{name}»',
    askProjectPlaceholder: 'Спросите о файлах проекта «{name}»…',
    askProjectStarsPlaceholder: 'Спросите о файлах проекта «{name}» и избранных файлах…',
    askProjectIntro:
      'Ответы берутся из файлов в папке проекта «{name}»: нужные файлы находятся и читаются по ходу.',
    askHeroProjectHint: 'Или выберите проект ниже.',
    askSavedToProject: 'Сохранено в папке проекта: {name}',
    askOpenCreated: 'Открыть',
  },
  ar: {
    askProjectMissing:
      'تعذّر العثور على مجلد المشروع المختار، لذا لم يُرسَل شيء. اختر المشروع مرة أخرى في الأسفل.',
    askProjectTitle: 'اسأل المشروع «{name}»',
    askProjectPlaceholder: 'اسأل عن الملفات في المشروع «{name}»…',
    askProjectStarsPlaceholder: 'اسأل عن الملفات في المشروع «{name}» وعن ملفاتك المفضلة…',
    askProjectIntro:
      'تأتي الإجابات من ملفات مجلد المشروع «{name}»، إذ يُبحث فيها وتُقرأ عند الحاجة.',
    askHeroProjectHint: 'أو اختر مشروعًا في الأسفل.',
    askSavedToProject: 'حُفظ في مجلد المشروع: {name}',
    askOpenCreated: 'فتح',
  },
  pt: {
    askProjectMissing:
      'A pasta do projeto escolhido não foi encontrada, por isso nada foi enviado. Escolha o projeto novamente abaixo.',
    askProjectTitle: 'Perguntar ao projeto “{name}”',
    askProjectPlaceholder: 'Pergunte sobre os arquivos do projeto “{name}”…',
    askProjectStarsPlaceholder:
      'Pergunte sobre os arquivos do projeto “{name}” e seus arquivos favoritos…',
    askProjectIntro:
      'As respostas vêm dos arquivos da pasta do projeto “{name}”, procurados e lidos conforme necessário.',
    askHeroProjectHint: 'Ou escolha um projeto abaixo.',
    askSavedToProject: 'Salvo na pasta do projeto: {name}',
    askOpenCreated: 'Abrir',
  },
  it: {
    askProjectMissing:
      'La cartella del progetto scelto non è stata trovata, quindi non è stato inviato nulla. Scegli di nuovo il progetto qui sotto.',
    askProjectTitle: 'Chiedi al progetto “{name}”',
    askProjectPlaceholder: 'Chiedi qualcosa sui file del progetto “{name}”…',
    askProjectStarsPlaceholder:
      'Chiedi qualcosa sui file del progetto “{name}” e sui tuoi file preferiti…',
    askProjectIntro:
      'Le risposte vengono dai file della cartella del progetto “{name}”, cercati e letti quando serve.',
    askHeroProjectHint: 'Oppure scegli un progetto qui sotto.',
    askSavedToProject: 'Salvato nella cartella del progetto: {name}',
    askOpenCreated: 'Apri',
  },
  pl: {
    askProjectMissing:
      'Nie znaleziono folderu wybranego projektu, więc nic nie wysłano. Wybierz projekt ponownie poniżej.',
    askProjectTitle: 'Zapytaj projekt „{name}”',
    askProjectPlaceholder: 'Zapytaj o pliki w projekcie „{name}”…',
    askProjectStarsPlaceholder: 'Zapytaj o pliki w projekcie „{name}” i ulubione pliki…',
    askProjectIntro:
      'Odpowiedzi opierają się na plikach z folderu projektu „{name}”, wyszukiwanych i czytanych w razie potrzeby.',
    askHeroProjectHint: 'Albo wybierz projekt poniżej.',
    askSavedToProject: 'Zapisano w folderze projektu: {name}',
    askOpenCreated: 'Otwórz',
  },
  cs: {
    askProjectMissing:
      'Složka vybraného projektu nebyla nalezena, proto se nic neodeslalo. Vyberte projekt níže znovu.',
    askProjectTitle: 'Zeptat se projektu „{name}“',
    askProjectPlaceholder: 'Zeptejte se na soubory v projektu „{name}“…',
    askProjectStarsPlaceholder: 'Zeptejte se na soubory v projektu „{name}“ a na oblíbené soubory…',
    askProjectIntro:
      'Odpovědi vycházejí ze souborů ve složce projektu „{name}“, které se podle potřeby vyhledají a přečtou.',
    askHeroProjectHint: 'Nebo vyberte projekt níže.',
    askSavedToProject: 'Uloženo do složky projektu: {name}',
    askOpenCreated: 'Otevřít',
  },
  nl: {
    askProjectMissing:
      'De map van het gekozen project is niet gevonden, dus er is niets verstuurd. Kies het project hieronder opnieuw.',
    askProjectTitle: 'Vraag het project ‘{name}’',
    askProjectPlaceholder: 'Vraag naar de bestanden in project ‘{name}’…',
    askProjectStarsPlaceholder:
      'Vraag naar de bestanden in project ‘{name}’ en je favoriete bestanden…',
    askProjectIntro:
      'Antwoorden komen uit de bestanden in de projectmap ‘{name}’, die waar nodig worden gezocht en gelezen.',
    askHeroProjectHint: 'Of kies hieronder een project.',
    askSavedToProject: 'Opgeslagen in de projectmap: {name}',
    askOpenCreated: 'Openen',
  },
  ms: {
    askProjectMissing:
      'Folder projek yang dipilih tidak ditemui, jadi tiada apa-apa dihantar. Pilih projek sekali lagi di bawah.',
    askProjectTitle: 'Tanya projek “{name}”',
    askProjectPlaceholder: 'Tanya tentang fail dalam projek “{name}”…',
    askProjectStarsPlaceholder: 'Tanya tentang fail dalam projek “{name}” dan fail kegemaran anda…',
    askProjectIntro:
      'Jawapan diambil daripada fail dalam folder projek “{name}”, yang dicari dan dibaca apabila perlu.',
    askHeroProjectHint: 'Atau pilih projek di bawah.',
    askSavedToProject: 'Disimpan dalam folder projek: {name}',
    askOpenCreated: 'Buka',
  },
  he: {
    askProjectMissing:
      'התיקייה של הפרויקט שנבחר לא נמצאה, ולכן לא נשלח דבר. בחרו שוב את הפרויקט למטה.',
    askProjectTitle: 'שאלה לפרויקט ״{name}״',
    askProjectPlaceholder: 'שאלו על הקבצים בפרויקט ״{name}״…',
    askProjectStarsPlaceholder: 'שאלו על הקבצים בפרויקט ״{name}״ ועל הקבצים המסומנים…',
    askProjectIntro:
      'התשובות מבוססות על הקבצים בתיקיית הפרויקט ״{name}״, שנמצאים ונקראים לפי הצורך.',
    askHeroProjectHint: 'או בחרו פרויקט למטה.',
    askSavedToProject: 'נשמר בתיקיית הפרויקט: {name}',
    askOpenCreated: 'פתיחה',
  },
  hi: {
    askProjectMissing:
      'चुने गए प्रोजेक्ट का फ़ोल्डर नहीं मिला, इसलिए कुछ नहीं भेजा गया। नीचे प्रोजेक्ट फिर से चुनें।',
    askProjectTitle: 'प्रोजेक्ट “{name}” से पूछें',
    askProjectPlaceholder: 'प्रोजेक्ट “{name}” की फ़ाइलों के बारे में पूछें…',
    askProjectStarsPlaceholder:
      'प्रोजेक्ट “{name}” की फ़ाइलों और स्टार की गई फ़ाइलों के बारे में पूछें…',
    askProjectIntro:
      'जवाब “{name}” प्रोजेक्ट फ़ोल्डर की फ़ाइलों से आते हैं, जिन्हें ज़रूरत के अनुसार खोजा और पढ़ा जाता है।',
    askHeroProjectHint: 'या नीचे कोई प्रोजेक्ट चुनें।',
    askSavedToProject: 'प्रोजेक्ट फ़ोल्डर में सहेजा गया: {name}',
    askOpenCreated: 'खोलें',
  },
  'zh-TW': {
    askProjectMissing: '找不到所選專案的資料夾，因此沒有送出。請在下方重新選擇專案。',
    askProjectTitle: '向專案「{name}」提問',
    askProjectPlaceholder: '就專案「{name}」中的檔案提問…',
    askProjectStarsPlaceholder: '就專案「{name}」中的檔案和收藏的檔案提問…',
    askProjectIntro: '會尋找並閱讀專案「{name}」資料夾中的檔案來回答。',
    askHeroProjectHint: '或者在下方選擇一個專案。',
    askSavedToProject: '已儲存到專案資料夾：{name}',
    askOpenCreated: '開啟',
  },
  vi: {
    askProjectMissing:
      'Không tìm thấy thư mục của dự án đã chọn nên chưa gửi gì. Hãy chọn lại dự án ở bên dưới.',
    askProjectTitle: 'Hỏi dự án “{name}”',
    askProjectPlaceholder: 'Hỏi về các tệp trong dự án “{name}”…',
    askProjectStarsPlaceholder: 'Hỏi về các tệp trong dự án “{name}” và các tệp đã đánh dấu…',
    askProjectIntro:
      'Câu trả lời lấy từ các tệp trong thư mục dự án “{name}”, được tìm và đọc khi cần.',
    askHeroProjectHint: 'Hoặc chọn một dự án bên dưới.',
    askSavedToProject: 'Đã lưu vào thư mục dự án: {name}',
    askOpenCreated: 'Mở',
  },
})

export type KbAskProjectStringKey = keyof typeof zh

const translate = createI18n(kbAskProjectStrings)

export function kbAskProjectText(lang: Lang, key: KbAskProjectStringKey, params?: Params): string {
  return translate(lang, key, params)
}
