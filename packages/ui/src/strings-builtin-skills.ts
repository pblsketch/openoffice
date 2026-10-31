import { createI18n, defineStrings, type Lang } from '@genoffice/i18n'

/**
 * Names of the skills shipped with the app (apps/shell/resources/builtin-skills).
 * Must match the "name" entries of builtin-skills.json there.
 */
export const BUILTIN_SKILL_NAMES = [
  'meeting-minutes',
  'internal-comms',
  'humanizer',
  'copy-editing',
  'find-skills',
  'administration-report',
  'administration-report-draft',
] as const

export type BuiltinSkillName = (typeof BUILTIN_SKILL_NAMES)[number]

const zh = {
  'builtinSkillDesc.meeting-minutes': '把会议记录整理成列明决定事项和待办事项的会议纪要。',
  'builtinSkillDesc.internal-comms': '撰写公告、内部简报、进展汇报、常见问题解答等组织内部的文字。',
  'builtinSkillDesc.humanizer': '找出文本中带有 AI 痕迹的表达，在不改变内容的前提下改得更自然。',
  'builtinSkillDesc.copy-editing': '把已经写好的英文文本逐遍检查，改得更清楚、更简洁。',
  'builtinSkillDesc.find-skills': '仅在智能体窗口中可用，需要联网，用来查找所需技能并建议安装。',
  'builtinSkillDesc.administration-report':
    '按照韩国行政安全部的指南整理报告：叙述式语句、标准编号、通用字体、简洁的表格。',
  'builtinSkillDesc.administration-report-draft':
    '按行政安全部格式从头撰写行政文书：章节结构、Ⅰ·1·가 编号、叙述式语句、表题与通用字体。',
}

/**
 * One-line description of each built-in skill, shared by the shell (Settings →
 * Skills) and the editors' AI panel skill list; lists show the skill's name
 * itself. Keys are `builtinSkillDesc.<name>`; `zh` defines the key set.
 */
export const BUILTIN_SKILL_STRINGS = defineStrings({
  zh,
  en: {
    'builtinSkillDesc.meeting-minutes':
      'Turns meeting notes into minutes that show the decisions and action items.',
    'builtinSkillDesc.internal-comms':
      'Writes announcements, newsletters, progress updates, FAQs and other internal messages.',
    'builtinSkillDesc.humanizer':
      'Finds phrasing that sounds AI-written and makes it natural without changing what it says.',
    'builtinSkillDesc.copy-editing':
      'Goes over English text you have already written and makes it clearer and tighter.',
    'builtinSkillDesc.find-skills':
      'Works only in the agent window and needs internet access to find skills and suggest installing them.',
    'builtinSkillDesc.administration-report':
      'Brings a report in line with the Ministry of the Interior and Safety guideline: prose, standard numbering, fonts that open anywhere, simple tables.',
    'builtinSkillDesc.administration-report-draft':
      'Writes an administrative report from scratch in the ministry format: sections, the Ⅰ·1·가 numbering, prose, table titles and compatible fonts.',
  },
  ja: {
    'builtinSkillDesc.meeting-minutes':
      '会議のメモを、決定事項とやることが分かる議事録にまとめます。',
    'builtinSkillDesc.internal-comms':
      'お知らせ、社内報、進捗報告、よくある質問など、組織内の文章を書きます。',
    'builtinSkillDesc.humanizer':
      '文章から AI が書いたように見える表現を探し、内容を変えずに自然に直します。',
    'builtinSkillDesc.copy-editing': '書き上げた英語の文章を何度か見直し、より明確で簡潔にします。',
    'builtinSkillDesc.find-skills':
      'エージェントのウィンドウでのみ使え、インターネットにつないで必要なスキルを探し、インストールを提案します。',
    'builtinSkillDesc.administration-report':
      '行政安全部のガイドラインに合わせて報告書を整えます。叙述式の文章、標準の番号、どの環境でも開けるフォント、単純な表。',
    'builtinSkillDesc.administration-report-draft':
      '行政文書を最初から行政安全部の形式で書きます。節構成、Ⅰ・1・가の番号、叙述式の文章、表の題名と通用するフォント。',
  },
  ko: {
    'builtinSkillDesc.meeting-minutes':
      '회의 메모를 결정 사항과 할 일이 보이는 회의록으로 정리합니다.',
    'builtinSkillDesc.internal-comms':
      '공지, 소식지, 진행 보고, 자주 묻는 질문 같은 조직 안의 글을 씁니다.',
    'builtinSkillDesc.humanizer':
      '글에서 AI가 쓴 티가 나는 표현을 찾아 내용은 그대로 두고 자연스럽게 고칩니다.',
    'builtinSkillDesc.copy-editing':
      '이미 쓴 영어 글을 여러 번 훑으며 더 분명하고 간결하게 다듬습니다.',
    'builtinSkillDesc.find-skills':
      '에이전트 창에서만 쓸 수 있으며, 인터넷에 연결해 필요한 스킬을 찾고 설치를 제안합니다.',
    'builtinSkillDesc.administration-report':
      '행안부 가이드라인에 맞게 보고서를 다듬습니다. 서술식 문장, 표준 번호, 호환 글꼴, 단순한 표.',
    'builtinSkillDesc.administration-report-draft':
      '행안부 형식으로 행정문서를 처음부터 씁니다. 절 구성, Ⅰ·1·가 번호, 서술식 문장, 표 제목과 호환 글꼴.',
  },
  fr: {
    'builtinSkillDesc.meeting-minutes':
      'Transforme les notes de réunion en compte rendu qui fait ressortir les décisions et les actions.',
    'builtinSkillDesc.internal-comms':
      'Rédige annonces, lettres d’information, points d’avancement, FAQ et autres messages internes.',
    'builtinSkillDesc.humanizer':
      'Repère les tournures qui sonnent écrites par une IA et les rend naturelles sans changer le sens.',
    'builtinSkillDesc.copy-editing':
      'Relit en plusieurs passes un texte anglais déjà écrit pour le rendre plus clair et plus concis.',
    'builtinSkillDesc.find-skills':
      'Fonctionne uniquement dans la fenêtre Agent et demande une connexion Internet pour trouver des compétences et proposer de les installer.',
    'builtinSkillDesc.administration-report':
      "Aligne un rapport sur la directive du ministère coréen de l'Intérieur : phrases rédigées, numérotation normalisée, polices disponibles partout, tableaux simples.",
    'builtinSkillDesc.administration-report-draft':
      'Rédige un rapport administratif de zéro au format du ministère : sections, numérotation Ⅰ·1·가, phrases rédigées, titres de tableaux et polices disponibles partout.',
  },
  de: {
    'builtinSkillDesc.meeting-minutes':
      'Macht aus Besprechungsnotizen ein Protokoll, das Beschlüsse und Aufgaben zeigt.',
    'builtinSkillDesc.internal-comms':
      'Schreibt Mitteilungen, Newsletter, Statusberichte, FAQs und andere interne Texte.',
    'builtinSkillDesc.humanizer':
      'Findet Formulierungen, die nach KI klingen, und macht sie natürlich, ohne den Inhalt zu ändern.',
    'builtinSkillDesc.copy-editing':
      'Geht einen fertigen englischen Text in mehreren Durchgängen durch und macht ihn klarer und knapper.',
    'builtinSkillDesc.find-skills':
      'Funktioniert nur im Agent-Fenster und braucht Internet, um Skills zu finden und ihre Installation vorzuschlagen.',
    'builtinSkillDesc.administration-report':
      'Bringt einen Bericht auf die Linie der Richtlinie des koreanischen Innenministeriums: Fließtext, einheitliche Nummerierung, überall verfügbare Schriften, einfache Tabellen.',
    'builtinSkillDesc.administration-report-draft':
      'Schreibt einen Verwaltungsbericht von Grund auf im Format des Ministeriums: Abschnitte, Nummerierung Ⅰ·1·가, Fließtext, Tabellenüberschriften und verfügbare Schriften.',
  },
  es: {
    'builtinSkillDesc.meeting-minutes':
      'Convierte las notas de una reunión en un acta que muestra las decisiones y las tareas.',
    'builtinSkillDesc.internal-comms':
      'Redacta avisos, boletines, informes de avance, preguntas frecuentes y otros textos internos.',
    'builtinSkillDesc.humanizer':
      'Busca las expresiones que suenan escritas por una IA y las vuelve naturales sin cambiar lo que dicen.',
    'builtinSkillDesc.copy-editing':
      'Repasa varias veces un texto en inglés ya escrito para hacerlo más claro y conciso.',
    'builtinSkillDesc.find-skills':
      'Solo funciona en la ventana del agente y necesita internet para buscar habilidades y proponer su instalación.',
    'builtinSkillDesc.administration-report':
      'Ajusta un informe a la guía del Ministerio del Interior y Seguridad de Corea: frases redactadas, numeración estándar, fuentes disponibles en cualquier equipo, tablas sencillas.',
    'builtinSkillDesc.administration-report-draft':
      'Escribe un informe administrativo desde cero con el formato del ministerio: secciones, numeración Ⅰ·1·가, frases redactadas, títulos de tablas y fuentes disponibles.',
  },
  th: {
    'builtinSkillDesc.meeting-minutes':
      'เรียบเรียงโน้ตการประชุมเป็นบันทึกการประชุมที่เห็นข้อตัดสินใจและงานที่ต้องทำ',
    'builtinSkillDesc.internal-comms':
      'เขียนประกาศ จดหมายข่าว รายงานความคืบหน้า คำถามที่พบบ่อย และข้อความภายในองค์กรอื่น ๆ',
    'builtinSkillDesc.humanizer':
      'หาสำนวนที่ฟังเหมือน AI เขียน แล้วปรับให้เป็นธรรมชาติโดยไม่เปลี่ยนเนื้อหา',
    'builtinSkillDesc.copy-editing':
      'อ่านทวนข้อความภาษาอังกฤษที่เขียนไว้แล้วหลายรอบ ให้ชัดเจนและกระชับขึ้น',
    'builtinSkillDesc.find-skills':
      'ใช้ได้เฉพาะในหน้าต่างเอเจนต์และต้องต่ออินเทอร์เน็ต เพื่อค้นหาสกิลและเสนอให้ติดตั้ง',
    'builtinSkillDesc.administration-report':
      'ปรับรายงานให้ตรงแนวทางของกระทรวงมหาดไทยและความมั่นคงเกาหลี: ประโยคบรรยาย ลำดับเลขมาตรฐาน ฟอนต์ที่เปิดได้ทุกเครื่อง และตารางเรียบง่าย',
    'builtinSkillDesc.administration-report-draft':
      'เขียนรายงานราชการตั้งแต่ต้นตามรูปแบบกระทรวง: โครง sections ลำดับเลข Ⅰ·1·가 ประโยคบรรยาย หัวตาราง และฟอนต์ที่ใช้ได้ทั่วไป',
  },
  id: {
    'builtinSkillDesc.meeting-minutes':
      'Mengubah catatan rapat menjadi notulen yang menampilkan keputusan dan tugas tindak lanjut.',
    'builtinSkillDesc.internal-comms':
      'Menulis pengumuman, buletin, laporan kemajuan, FAQ, dan pesan internal lainnya.',
    'builtinSkillDesc.humanizer':
      'Mencari ungkapan yang terdengar ditulis AI dan membuatnya wajar tanpa mengubah isinya.',
    'builtinSkillDesc.copy-editing':
      'Memeriksa ulang teks bahasa Inggris yang sudah ditulis beberapa kali agar lebih jelas dan ringkas.',
    'builtinSkillDesc.find-skills':
      'Hanya berfungsi di jendela agen dan memerlukan internet untuk mencari skill serta mengusulkan pemasangannya.',
    'builtinSkillDesc.administration-report':
      'Menyesuaikan laporan dengan pedoman Kementerian Dalam Negeri dan Keamanan Korea: kalimat naratif, penomoran baku, font yang tersedia di mana saja, tabel sederhana.',
    'builtinSkillDesc.administration-report-draft':
      'Menulis laporan administrasi dari nol dengan format kementerian: bagian, penomoran Ⅰ·1·가, kalimat naratif, judul tabel, dan font yang tersedia.',
  },
  ru: {
    'builtinSkillDesc.meeting-minutes':
      'Превращает заметки со встречи в протокол, где видны решения и задачи.',
    'builtinSkillDesc.internal-comms':
      'Пишет объявления, рассылки, отчёты о ходе работ, ответы на частые вопросы и другие внутренние тексты.',
    'builtinSkillDesc.humanizer':
      'Находит обороты, похожие на написанные ИИ, и делает их естественными, не меняя смысла.',
    'builtinSkillDesc.copy-editing':
      'Несколько раз проходит по готовому английскому тексту и делает его яснее и короче.',
    'builtinSkillDesc.find-skills':
      'Работает только в окне агента и требует интернета, чтобы найти навыки и предложить их установить.',
    'builtinSkillDesc.administration-report':
      'Приводит отчёт в соответствие с руководством Министерства внутренних дел Кореи: связные предложения, единая нумерация, доступные шрифты, простые таблицы.',
    'builtinSkillDesc.administration-report-draft':
      'Пишет административный отчёт с нуля в формате министерства: разделы, нумерация Ⅰ·1·가, связные предложения, заголовки таблиц и доступные шрифты.',
  },
  ar: {
    'builtinSkillDesc.meeting-minutes':
      'يحوّل ملاحظات الاجتماع إلى محضر يبيّن القرارات والمهام المطلوبة.',
    'builtinSkillDesc.internal-comms':
      'يكتب الإعلانات والنشرات وتقارير التقدّم والأسئلة الشائعة وغيرها من الرسائل الداخلية.',
    'builtinSkillDesc.humanizer':
      'يبحث عن العبارات التي تبدو مكتوبة بالذكاء الاصطناعي ويجعلها طبيعية دون تغيير معناها.',
    'builtinSkillDesc.copy-editing': 'يراجع نصًا إنجليزيًا مكتوبًا عدة مرات ليجعله أوضح وأوجز.',
    'builtinSkillDesc.find-skills':
      'يعمل في نافذة الوكيل فقط ويحتاج إلى الإنترنت للبحث عن المهارات واقتراح تثبيتها.',
    'builtinSkillDesc.administration-report':
      'يضبط التقرير وفق إرشادات وزارة الداخلية والسلامة الكورية: جمل سردية، ترقيم موحد، خطوط متوفرة في أي جهاز، وجداول بسيطة.',
    'builtinSkillDesc.administration-report-draft':
      'يكتب تقريراً إدارياً من الصفر بصيغة الوزارة: الأقسام، ترقيم Ⅰ·1·가، جمل سردية، عناوين الجداول وخطوط متوفرة.',
  },
  pt: {
    'builtinSkillDesc.meeting-minutes':
      'Transforma anotações de reunião em uma ata que mostra as decisões e as tarefas.',
    'builtinSkillDesc.internal-comms':
      'Escreve avisos, boletins, relatórios de andamento, perguntas frequentes e outros textos internos.',
    'builtinSkillDesc.humanizer':
      'Encontra as expressões que parecem escritas por IA e as deixa naturais sem mudar o que dizem.',
    'builtinSkillDesc.copy-editing':
      'Revê em várias passadas um texto em inglês já escrito para deixá-lo mais claro e conciso.',
    'builtinSkillDesc.find-skills':
      'Funciona só na janela do agente e precisa de internet para encontrar habilidades e sugerir a instalação.',
    'builtinSkillDesc.administration-report':
      'Alinha um relatório à diretriz do Ministério do Interior e Segurança da Coreia: frases corridas, numeração padrão, fontes disponíveis em qualquer PC, tabelas simples.',
    'builtinSkillDesc.administration-report-draft':
      'Escreve um relatório administrativo do zero no formato do ministério: seções, numeração Ⅰ·1·가, frases corridas, títulos de tabelas e fontes disponíveis.',
  },
  it: {
    'builtinSkillDesc.meeting-minutes':
      'Trasforma gli appunti di una riunione in un verbale che mostra decisioni e attività.',
    'builtinSkillDesc.internal-comms':
      'Scrive avvisi, newsletter, aggiornamenti sull’avanzamento, FAQ e altri testi interni.',
    'builtinSkillDesc.humanizer':
      'Trova le espressioni che sembrano scritte da un’IA e le rende naturali senza cambiarne il senso.',
    'builtinSkillDesc.copy-editing':
      'Rilegge più volte un testo in inglese già scritto per renderlo più chiaro e conciso.',
    'builtinSkillDesc.find-skills':
      'Funziona solo nella finestra dell’agente e richiede internet per trovare abilità e proporne l’installazione.',
    'builtinSkillDesc.administration-report':
      "Allinea una relazione alle linee guida del Ministero dell'Interno coreano: frasi discorsive, numerazione standard, caratteri disponibili ovunque, tabelle semplici.",
    'builtinSkillDesc.administration-report-draft':
      'Scrive una relazione amministrativa da zero nel formato del ministero: sezioni, numerazione Ⅰ·1·가, frasi discorsive, titoli delle tabelle e caratteri disponibili.',
  },
  pl: {
    'builtinSkillDesc.meeting-minutes':
      'Zamienia notatki ze spotkania w protokół, w którym widać decyzje i zadania.',
    'builtinSkillDesc.internal-comms':
      'Pisze ogłoszenia, biuletyny, raporty z postępów, FAQ i inne teksty wewnętrzne.',
    'builtinSkillDesc.humanizer':
      'Wyszukuje sformułowania brzmiące jak pisane przez AI i czyni je naturalnymi bez zmiany treści.',
    'builtinSkillDesc.copy-editing':
      'Kilka razy przechodzi przez gotowy tekst angielski, by był jaśniejszy i zwięźlejszy.',
    'builtinSkillDesc.find-skills':
      'Działa tylko w oknie agenta i wymaga internetu, aby znaleźć umiejętności i zaproponować ich instalację.',
    'builtinSkillDesc.administration-report':
      'Dopasowuje raport do wytycznych koreańskiego ministerstwa spraw wewnętrznych: zdania opisowe, stała numeracja, czcionki dostępne wszędzie, proste tabele.',
    'builtinSkillDesc.administration-report-draft':
      'Pisze raport administracyjny od zera w formacie ministerstwa: sekcje, numeracja Ⅰ·1·가, zdania opisowe, tytuły tabel i dostępne czcionki.',
  },
  cs: {
    'builtinSkillDesc.meeting-minutes':
      'Udělá z poznámek z porady zápis, ve kterém jsou vidět rozhodnutí a úkoly.',
    'builtinSkillDesc.internal-comms':
      'Píše oznámení, zpravodaje, zprávy o postupu, časté dotazy a další interní texty.',
    'builtinSkillDesc.humanizer':
      'Najde obraty, které působí jako psané AI, a upraví je přirozeně bez změny obsahu.',
    'builtinSkillDesc.copy-editing':
      'Projde hotový anglický text v několika krocích a udělá ho jasnějším a stručnějším.',
    'builtinSkillDesc.find-skills':
      'Funguje jen v okně agenta a potřebuje internet, aby našel dovednosti a navrhl jejich instalaci.',
    'builtinSkillDesc.administration-report':
      'Uvede zprávu do souladu se směrnicí korejského ministerstva vnitra: souvislé věty, jednotné číslování, dostupné písmo, jednoduché tabulky.',
    'builtinSkillDesc.administration-report-draft':
      'Píše správní zprávu od začátku ve formátu ministerstva: oddíly, číslování Ⅰ·1·가, souvislé věty, názvy tabulek a dostupné písmo.',
  },
  nl: {
    'builtinSkillDesc.meeting-minutes':
      'Maakt van vergaderaantekeningen notulen waarin besluiten en actiepunten zichtbaar zijn.',
    'builtinSkillDesc.internal-comms':
      'Schrijft mededelingen, nieuwsbrieven, voortgangsrapporten, veelgestelde vragen en andere interne berichten.',
    'builtinSkillDesc.humanizer':
      'Zoekt formuleringen die naar AI klinken en maakt ze natuurlijk zonder de inhoud te veranderen.',
    'builtinSkillDesc.copy-editing':
      'Loopt een geschreven Engelse tekst een paar keer na en maakt hem duidelijker en bondiger.',
    'builtinSkillDesc.find-skills':
      'Werkt alleen in het agentvenster en heeft internet nodig om vaardigheden te vinden en installatie voor te stellen.',
    'builtinSkillDesc.administration-report':
      'Brengt een rapport in lijn met de richtlijn van het Koreaanse ministerie van Binnenlandse Zaken: lopende tekst, vaste nummering, overal beschikbare lettertypen, eenvoudige tabellen.',
    'builtinSkillDesc.administration-report-draft':
      'Schrijft een bestuurlijk rapport vanaf nul in het formaat van het ministerie: secties, nummering Ⅰ·1·가, lopende tekst, tabelkoppen en overal beschikbare lettertypen.',
  },
  ms: {
    'builtinSkillDesc.meeting-minutes':
      'Menyusun nota mesyuarat menjadi minit yang menunjukkan keputusan dan tindakan susulan.',
    'builtinSkillDesc.internal-comms':
      'Menulis pengumuman, buletin, laporan kemajuan, soalan lazim dan mesej dalaman lain.',
    'builtinSkillDesc.humanizer':
      'Mencari ungkapan yang berbunyi seperti ditulis AI dan menjadikannya semula jadi tanpa mengubah maksud.',
    'builtinSkillDesc.copy-editing':
      'Menyemak teks bahasa Inggeris yang sudah ditulis beberapa kali supaya lebih jelas dan ringkas.',
    'builtinSkillDesc.find-skills':
      'Hanya berfungsi dalam tetingkap ejen dan memerlukan internet untuk mencari kemahiran serta mencadangkan pemasangannya.',
    'builtinSkillDesc.administration-report':
      'Menyesuaikan laporan dengan garis panduan Kementerian Dalam Negeri dan Keselamatan Korea: ayat naratif, penomboran piawai, fon yang ada di mana-mana, jadual ringkas.',
    'builtinSkillDesc.administration-report-draft':
      'Menulis laporan pentadbiran dari awal mengikut format kementerian: bahagian, penomboran Ⅰ·1·가, ayat naratif, tajuk jadual dan fon yang tersedia.',
  },
  he: {
    'builtinSkillDesc.meeting-minutes': 'הופך רשימות מפגישה לסיכום שמציג את ההחלטות ואת המשימות.',
    'builtinSkillDesc.internal-comms':
      'כותב הודעות, עלוני מידע, דיווחי התקדמות, שאלות נפוצות ושאר טקסטים פנימיים.',
    'builtinSkillDesc.humanizer':
      'מאתר ניסוחים שנשמעים כאילו AI כתב אותם והופך אותם לטבעיים בלי לשנות את התוכן.',
    'builtinSkillDesc.copy-editing':
      'עובר כמה פעמים על טקסט באנגלית שכבר נכתב והופך אותו לבהיר ולתמציתי יותר.',
    'builtinSkillDesc.find-skills':
      'פועל רק בחלון הסוכן ודורש אינטרנט כדי למצוא מיומנויות ולהציע להתקין אותן.',
    'builtinSkillDesc.administration-report':
      'מתאים דוח להנחיות משרד הפנים והביטחון של קוריאה: משפטים רצופים, מספור אחיד, גופנים זמינים בכל מחשב וטבלאות פשוטות.',
    'builtinSkillDesc.administration-report-draft':
      'כותב דוח מנהלי מאפס בפורמט של המשרד: סעיפים, מספור Ⅰ·1·가, משפטים רצופים, כותרות טבלאות וגופנים זמינים.',
  },
  hi: {
    'builtinSkillDesc.meeting-minutes':
      'बैठक के नोट्स को ऐसे कार्यवृत्त में बदलता है जिसमें निर्णय और करने के काम साफ़ दिखें।',
    'builtinSkillDesc.internal-comms':
      'सूचनाएँ, न्यूज़लेटर, प्रगति रिपोर्ट, सामान्य प्रश्न और दूसरे आंतरिक संदेश लिखता है।',
    'builtinSkillDesc.humanizer':
      'AI के लिखे जैसे लगने वाले वाक्यांश ढूँढता है और अर्थ बदले बिना उन्हें स्वाभाविक बनाता है।',
    'builtinSkillDesc.copy-editing':
      'पहले से लिखे अंग्रेज़ी पाठ को कई बार जाँचकर उसे ज़्यादा साफ़ और संक्षिप्त बनाता है।',
    'builtinSkillDesc.find-skills':
      'केवल एजेंट विंडो में काम करता है और कौशल खोजने व उन्हें इंस्टॉल करने का सुझाव देने के लिए इंटरनेट चाहिए।',
    'builtinSkillDesc.administration-report':
      'रिपोर्ट को कोरिया के आंतरिक एवं सुरक्षा मंत्रालय के दिशानिर्देश के अनुसार ढालता है: वर्णनात्मक वाक्य, मानक क्रमांकन, हर जगह उपलब्ध फ़ॉन्ट, सरल तालिकाएँ।',
    'builtinSkillDesc.administration-report-draft':
      'मंत्रालय के प्रारूप में प्रशासनिक रिपोर्ट शुरू से लिखता है: अनुभाग, Ⅰ·1·가 क्रमांकन, वर्णनात्मक वाक्य, तालिका शीर्षक और उपलब्ध फ़ॉन्ट।',
  },
  'zh-TW': {
    'builtinSkillDesc.meeting-minutes': '把會議筆記整理成列明決議事項和待辦事項的會議紀錄。',
    'builtinSkillDesc.internal-comms': '撰寫公告、內部電子報、進度報告、常見問題等組織內部的文字。',
    'builtinSkillDesc.humanizer': '找出文字中帶有 AI 痕跡的說法，在不改變內容的前提下改得更自然。',
    'builtinSkillDesc.copy-editing': '把已經寫好的英文文字逐次檢查，改得更清楚、更簡潔。',
    'builtinSkillDesc.find-skills':
      '僅能在代理程式視窗中使用，需要連網，用來尋找所需技能並建議安裝。',
    'builtinSkillDesc.administration-report':
      '依照韓國行政安全部的指南整理報告：敘述式語句、標準編號、通用字體、簡潔的表格。',
    'builtinSkillDesc.administration-report-draft':
      '依行政安全部格式從頭撰寫行政文書：章節結構、Ⅰ·1·가 編號、敘述式語句、表題與通用字體。',
  },
  vi: {
    'builtinSkillDesc.meeting-minutes':
      'Biến ghi chú cuộc họp thành biên bản nêu rõ các quyết định và việc cần làm.',
    'builtinSkillDesc.internal-comms':
      'Viết thông báo, bản tin, báo cáo tiến độ, câu hỏi thường gặp và các văn bản nội bộ khác.',
    'builtinSkillDesc.humanizer':
      'Tìm những cách diễn đạt nghe như AI viết và sửa cho tự nhiên mà không đổi nội dung.',
    'builtinSkillDesc.copy-editing':
      'Rà lại nhiều lượt một văn bản tiếng Anh đã viết để nó rõ ràng và gọn hơn.',
    'builtinSkillDesc.find-skills':
      'Chỉ dùng được trong cửa sổ tác tử và cần internet để tìm kỹ năng và đề xuất cài đặt.',
    'builtinSkillDesc.administration-report':
      'Đưa báo cáo về đúng hướng dẫn của Bộ Nội vụ và An toàn Hàn Quốc: câu diễn đạt, đánh số chuẩn, phông chữ mở được mọi nơi, bảng đơn giản.',
    'builtinSkillDesc.administration-report-draft':
      'Viết báo cáo hành chính từ đầu theo định dạng của bộ: các phần, đánh số Ⅰ·1·가, câu diễn đạt, tiêu đề bảng và phông chữ phổ dụng.',
  },
})

export type BuiltinSkillStringKey = keyof typeof zh

/** `builtinSkillText(lang, key)`: one built-in skill string in that language */
export const builtinSkillText: (lang: Lang, key: BuiltinSkillStringKey) => string =
  createI18n(BUILTIN_SKILL_STRINGS)

/** One-line description of a built-in skill in `lang` (key `builtinSkillDesc.<name>`) */
export function builtinSkillDesc(lang: Lang, name: BuiltinSkillName): string {
  return builtinSkillText(lang, `builtinSkillDesc.${name}`)
}

/** Narrows a skill name read from disk or settings to a built-in skill name */
export function isBuiltinSkillName(name: string): name is BuiltinSkillName {
  return (BUILTIN_SKILL_NAMES as readonly string[]).includes(name)
}
