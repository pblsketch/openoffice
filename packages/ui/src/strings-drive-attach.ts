import type { Lang } from '@genoffice/i18n'

/** "Attach from Drive" in every editor's AI panel (decisions 0033, 0085) */
export interface DriveAttachStrings {
  label: string
  /** {n}: files left out (a format no editor reads, or past 20) */
  skipped: string
  /** {n}: files Drive did not hand over */
  failed: string
  disconnected: string
  /** Google's picker is already open in the browser */
  busy: string
  /** the model-training item in Settings is not confirmed yet (decision 0085) */
  training: string
  /** the AI in use is a free connection, which is never given Drive files */
  freeAi: string
  /** Google's picker did not run */
  pickFailed: string
}

export const DRIVE_ATTACH_STRINGS: Record<Lang, DriveAttachStrings> = {
  zh: {
    label: '从 Google 云端硬盘附加',
    skipped: '{n} 个文件未附加（无法读取的格式，或超过 20 个）',
    failed: '{n} 个文件未能从云端硬盘获取',
    disconnected: 'Google 云端硬盘已断开连接',
    training: '请先在 设置 → 集成 → Google 云端硬盘 中确认模型训练项',
    freeAi: '免费 AI 连接可能会用收到的内容进行训练，因此不会向其发送云端硬盘文件。请先选择其他 AI',
    pickFailed: '无法打开 Google 窗口。请重试',
    busy: 'Google 窗口已在浏览器中打开',
  },
  en: {
    label: 'Attach from Google Drive',
    skipped: 'Not attached: {n} (a format that cannot be read, or past 20 files)',
    failed: 'Could not get from Drive: {n}',
    disconnected: 'Google Drive is disconnected',
    training: 'First confirm model training under Settings → Integrations → Google Drive',
    freeAi:
      'Drive files are not given to a free AI connection, which may train on them. Choose another AI first',
    pickFailed: 'Google’s window could not be opened. Try again',
    busy: 'Google’s window is already open in your browser',
  },
  ja: {
    label: 'Google ドライブから添付',
    skipped: '{n} 件は添付しませんでした（読めない形式か、20 件を超えています）',
    failed: '{n} 件はドライブから取得できませんでした',
    disconnected: 'Google ドライブとの接続が切れています',
    training: '先に 設定 → 連携 → Google ドライブ でモデルの学習の項目を確認してください',
    freeAi:
      '無料の AI 接続は受け取った内容を学習に使うことがあるため、ドライブのファイルは送りません。先に別の AI を選んでください',
    pickFailed: 'Google のウィンドウを開けませんでした。もう一度お試しください',
    busy: 'Google のウィンドウはすでにブラウザで開いています',
  },
  ko: {
    label: 'Google 드라이브에서 첨부',
    skipped: '{n}개는 첨부하지 않았습니다(읽을 수 없는 형식이거나 20개를 넘음)',
    failed: '{n}개는 드라이브에서 받지 못했습니다',
    disconnected: 'Google 드라이브 연결이 끊겼습니다',
    training: '설정 → 연동 → Google 드라이브에서 모델 학습 항목을 먼저 확인하세요',
    freeAi:
      '무료 AI 연결은 받은 내용을 학습에 쓸 수 있어 드라이브 파일을 보내지 않습니다. 다른 AI를 먼저 고르세요',
    pickFailed: 'Google 창을 열지 못했습니다. 다시 시도하세요',
    busy: '브라우저에 Google 창이 이미 열려 있습니다',
  },
  fr: {
    label: 'Joindre depuis Google Drive',
    skipped: '{n} fichiers non joints (format illisible, ou plus de 20)',
    failed: '{n} fichiers n’ont pas pu être récupérés depuis Drive',
    disconnected: 'Google Drive est déconnecté',
    training:
      'Confirmez d’abord l’entraînement des modèles dans Paramètres → Intégrations → Google Drive',
    freeAi:
      'Les fichiers Drive ne sont pas transmis à une connexion d’IA gratuite, qui peut s’en servir pour l’entraînement. Choisissez d’abord une autre IA',
    pickFailed: 'La fenêtre de Google n’a pas pu s’ouvrir. Réessayez',
    busy: 'La fenêtre de Google est déjà ouverte dans votre navigateur',
  },
  de: {
    label: 'Aus Google Drive anhängen',
    skipped: '{n} Dateien nicht angehängt (nicht lesbares Format oder mehr als 20)',
    failed: '{n} Dateien konnten nicht aus Drive geholt werden',
    disconnected: 'Google Drive ist getrennt',
    training:
      'Bestätigen Sie zuerst das Modelltraining unter Einstellungen → Integrationen → Google Drive',
    freeAi:
      'Drive-Dateien gehen nicht an eine kostenlose KI-Verbindung, die damit trainieren kann. Wählen Sie zuerst eine andere KI',
    pickFailed: 'Das Google-Fenster konnte nicht geöffnet werden. Versuchen Sie es erneut',
    busy: 'Das Google-Fenster ist bereits im Browser geöffnet',
  },
  es: {
    label: 'Adjuntar desde Google Drive',
    skipped: '{n} archivos no se adjuntaron (formato ilegible o más de 20)',
    failed: 'No se pudieron obtener {n} archivos de Drive',
    disconnected: 'Google Drive está desconectado',
    training:
      'Primero confirma el entrenamiento de modelos en Configuración → Integraciones → Google Drive',
    freeAi:
      'Los archivos de Drive no se envían a una conexión de IA gratuita, que puede entrenar con ellos. Elige otra IA primero',
    pickFailed: 'No se pudo abrir la ventana de Google. Inténtalo de nuevo',
    busy: 'La ventana de Google ya está abierta en tu navegador',
  },
  th: {
    label: 'แนบจาก Google ไดรฟ์',
    skipped: 'ไม่ได้แนบ {n} ไฟล์ (รูปแบบที่อ่านไม่ได้ หรือเกิน 20 ไฟล์)',
    failed: 'ดึง {n} ไฟล์จากไดรฟ์ไม่สำเร็จ',
    disconnected: 'Google ไดรฟ์ถูกตัดการเชื่อมต่อ',
    training: 'โปรดยืนยันเรื่องการฝึกโมเดลที่ การตั้งค่า → การเชื่อมต่อ → Google ไดรฟ์ ก่อน',
    freeAi:
      'จะไม่ส่งไฟล์ในไดรฟ์ไปยังการเชื่อมต่อ AI ฟรี เพราะอาจนำไปฝึกโมเดล โปรดเลือก AI อื่นก่อน',
    pickFailed: 'เปิดหน้าต่างของ Google ไม่ได้ โปรดลองอีกครั้ง',
    busy: 'หน้าต่างของ Google เปิดอยู่ในเบราว์เซอร์แล้ว',
  },
  id: {
    label: 'Lampirkan dari Google Drive',
    skipped: '{n} file tidak dilampirkan (format tidak terbaca, atau lebih dari 20)',
    failed: '{n} file tidak dapat diambil dari Drive',
    disconnected: 'Google Drive terputus',
    training: 'Konfirmasi dulu pelatihan model di Pengaturan → Integrasi → Google Drive',
    freeAi:
      'File Drive tidak diberikan ke koneksi AI gratis, yang dapat memakainya untuk pelatihan. Pilih AI lain dulu',
    pickFailed: 'Jendela Google tidak dapat dibuka. Coba lagi',
    busy: 'Jendela Google sudah terbuka di browser Anda',
  },
  ru: {
    label: 'Прикрепить с Google Диска',
    skipped: 'Не прикреплено файлов: {n} (нечитаемый формат или больше 20)',
    failed: 'Не удалось получить с Диска файлов: {n}',
    disconnected: 'Google Диск отключён',
    training:
      'Сначала подтвердите пункт об обучении моделей в разделе Настройки → Интеграции → Google Диск',
    freeAi:
      'Бесплатному ИИ-подключению файлы с Диска не передаются: оно может обучаться на них. Сначала выберите другой ИИ',
    pickFailed: 'Не удалось открыть окно Google. Попробуйте ещё раз',
    busy: 'Окно Google уже открыто в браузере',
  },
  ar: {
    label: 'إرفاق من Google Drive',
    skipped: 'لم يُرفق {n} من الملفات (تنسيق لا يمكن قراءته، أو أكثر من 20)',
    failed: 'تعذّر جلب {n} من الملفات من Drive',
    disconnected: 'انقطع اتصال Google Drive',
    training: 'أكّد أولًا عنصر تدريب النماذج في الإعدادات → التكاملات → Google Drive',
    freeAi:
      'لا تُعطى ملفات Drive لاتصال ذكاء اصطناعي مجاني، فقد يستخدمها للتدريب. اختر ذكاءً اصطناعيًا آخر أولًا',
    pickFailed: 'تعذّر فتح نافذة Google. حاول مرة أخرى',
    busy: 'نافذة Google مفتوحة بالفعل في المتصفح',
  },
  pt: {
    label: 'Anexar do Google Drive',
    skipped: '{n} arquivos não foram anexados (formato ilegível, ou mais de 20)',
    failed: 'Não foi possível buscar {n} arquivos no Drive',
    disconnected: 'O Google Drive está desconectado',
    training:
      'Primeiro confirme o treinamento de modelos em Configurações → Integrações → Google Drive',
    freeAi:
      'Arquivos do Drive não são enviados a uma conexão de IA gratuita, que pode treinar com eles. Escolha outra IA primeiro',
    pickFailed: 'Não foi possível abrir a janela do Google. Tente novamente',
    busy: 'A janela do Google já está aberta no navegador',
  },
  it: {
    label: 'Allega da Google Drive',
    skipped: '{n} file non allegati (formato non leggibile, o più di 20)',
    failed: 'Impossibile recuperare {n} file da Drive',
    disconnected: 'Google Drive è scollegato',
    training:
      'Prima conferma l’addestramento dei modelli in Impostazioni → Integrazioni → Google Drive',
    freeAi:
      'I file di Drive non vengono dati a una connessione IA gratuita, che può usarli per l’addestramento. Scegli prima un’altra IA',
    pickFailed: 'Impossibile aprire la finestra di Google. Riprova',
    busy: 'La finestra di Google è già aperta nel browser',
  },
  pl: {
    label: 'Załącz z Dysku Google',
    skipped: 'Nie załączono plików: {n} (nieczytelny format lub ponad 20)',
    failed: 'Nie udało się pobrać z Dysku plików: {n}',
    disconnected: 'Dysk Google jest rozłączony',
    training:
      'Najpierw potwierdź pozycję o trenowaniu modeli w Ustawienia → Integracje → Dysk Google',
    freeAi:
      'Pliki z Dysku nie trafiają do darmowego połączenia AI, które może na nich trenować. Najpierw wybierz inne AI',
    pickFailed: 'Nie udało się otworzyć okna Google. Spróbuj ponownie',
    busy: 'Okno Google jest już otwarte w przeglądarce',
  },
  cs: {
    label: 'Připojit z Disku Google',
    skipped: 'Nepřipojeno souborů: {n} (nečitelný formát nebo více než 20)',
    failed: 'Z Disku se nepodařilo získat souborů: {n}',
    disconnected: 'Disk Google je odpojen',
    training: 'Nejdřív potvrďte položku o trénování modelů v Nastavení → Integrace → Disk Google',
    freeAi:
      'Soubory z Disku se bezplatnému připojení AI nedávají, protože na nich může trénovat. Nejdřív vyberte jinou AI',
    pickFailed: 'Okno Google se nepodařilo otevřít. Zkuste to znovu',
    busy: 'Okno Google je už otevřené v prohlížeči',
  },
  nl: {
    label: 'Bijvoegen uit Google Drive',
    skipped: '{n} bestanden niet bijgevoegd (onleesbare indeling, of meer dan 20)',
    failed: '{n} bestanden konden niet uit Drive worden opgehaald',
    disconnected: 'Google Drive is ontkoppeld',
    training: 'Bevestig eerst modeltraining onder Instellingen → Integraties → Google Drive',
    freeAi:
      'Drive-bestanden gaan niet naar een gratis AI-verbinding, die erop kan trainen. Kies eerst een andere AI',
    pickFailed: 'Het venster van Google kon niet worden geopend. Probeer het opnieuw',
    busy: 'Het venster van Google is al open in je browser',
  },
  ms: {
    label: 'Lampirkan daripada Google Drive',
    skipped: '{n} fail tidak dilampirkan (format tidak boleh dibaca, atau lebih daripada 20)',
    failed: '{n} fail tidak dapat diambil daripada Drive',
    disconnected: 'Google Drive telah diputuskan',
    training: 'Sahkan dahulu item latihan model di Tetapan → Integrasi → Google Drive',
    freeAi:
      'Fail Drive tidak diberikan kepada sambungan AI percuma, yang mungkin menggunakannya untuk latihan. Pilih AI lain dahulu',
    pickFailed: 'Tetingkap Google tidak dapat dibuka. Cuba lagi',
    busy: 'Tetingkap Google sudah dibuka dalam pelayar anda',
  },
  he: {
    label: 'צירוף מ-Google Drive',
    skipped: '{n} קבצים לא צורפו (פורמט שלא ניתן לקרוא, או יותר מ-20)',
    failed: 'לא ניתן היה להביא {n} קבצים מ-Drive',
    disconnected: 'Google Drive מנותק',
    training: 'קודם אשרו את פריט אימון המודלים בהגדרות → שילובים → Google Drive',
    freeAi: 'קובצי Drive לא נשלחים לחיבור AI חינמי, שעלול להתאמן עליהם. בחרו קודם AI אחר',
    pickFailed: 'לא ניתן היה לפתוח את החלון של Google. נסו שוב',
    busy: 'החלון של Google כבר פתוח בדפדפן',
  },
  hi: {
    label: 'Google Drive से संलग्न करें',
    skipped: '{n} फ़ाइलें संलग्न नहीं हुईं (न पढ़ा जा सकने वाला फ़ॉर्मेट, या 20 से अधिक)',
    failed: '{n} फ़ाइलें Drive से नहीं लाई जा सकीं',
    disconnected: 'Google Drive डिस्कनेक्ट है',
    training:
      'पहले सेटिंग्स → इंटीग्रेशन → Google Drive में मॉडल प्रशिक्षण वाले विकल्प की पुष्टि करें',
    freeAi:
      'मुफ़्त AI कनेक्शन को Drive फ़ाइलें नहीं दी जातीं, क्योंकि वह उन पर प्रशिक्षण कर सकता है। पहले कोई दूसरा AI चुनें',
    pickFailed: 'Google की विंडो नहीं खुल सकी। फिर से कोशिश करें',
    busy: 'Google की विंडो ब्राउज़र में पहले से खुली है',
  },
  'zh-TW': {
    label: '從 Google 雲端硬碟附加',
    skipped: '{n} 個檔案未附加（無法讀取的格式，或超過 20 個）',
    failed: '{n} 個檔案無法從雲端硬碟取得',
    disconnected: 'Google 雲端硬碟已中斷連結',
    training: '請先在 設定 → 整合 → Google 雲端硬碟 中確認模型訓練項目',
    freeAi: '免費 AI 連結可能會用收到的內容進行訓練，因此不會傳送雲端硬碟檔案。請先選擇其他 AI',
    pickFailed: '無法開啟 Google 視窗。請再試一次',
    busy: 'Google 視窗已在瀏覽器中開啟',
  },
  vi: {
    label: 'Đính kèm từ Google Drive',
    skipped: '{n} tệp không được đính kèm (định dạng không đọc được, hoặc quá 20 tệp)',
    failed: 'Không lấy được {n} tệp từ Drive',
    disconnected: 'Google Drive đã bị ngắt kết nối',
    training: 'Hãy xác nhận mục huấn luyện mô hình trong Cài đặt → Tích hợp → Google Drive trước',
    freeAi:
      'Tệp Drive không được gửi cho kết nối AI miễn phí vì nó có thể dùng chúng để huấn luyện. Hãy chọn AI khác trước',
    pickFailed: 'Không mở được cửa sổ của Google. Hãy thử lại',
    busy: 'Cửa sổ của Google đã mở trên trình duyệt',
  },
}
