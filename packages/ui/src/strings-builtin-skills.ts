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
] as const

export type BuiltinSkillName = (typeof BUILTIN_SKILL_NAMES)[number]

const zh = {
  'builtinSkillDesc.meeting-minutes': '把会议记录整理成列明决定事项和待办事项的会议纪要。',
  'builtinSkillDesc.internal-comms': '撰写公告、内部简报、进展汇报、常见问题解答等组织内部的文字。',
  'builtinSkillDesc.humanizer': '找出文本中带有 AI 痕迹的表达，在不改变内容的前提下改得更自然。',
  'builtinSkillDesc.copy-editing': '把已经写好的英文文本逐遍检查，改得更清楚、更简洁。',
  'builtinSkillDesc.find-skills': '仅在智能体窗口中可用，需要联网，用来查找所需技能并建议安装。',
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
  },
  'zh-TW': {
    'builtinSkillDesc.meeting-minutes': '把會議筆記整理成列明決議事項和待辦事項的會議紀錄。',
    'builtinSkillDesc.internal-comms': '撰寫公告、內部電子報、進度報告、常見問題等組織內部的文字。',
    'builtinSkillDesc.humanizer': '找出文字中帶有 AI 痕跡的說法，在不改變內容的前提下改得更自然。',
    'builtinSkillDesc.copy-editing': '把已經寫好的英文文字逐次檢查，改得更清楚、更簡潔。',
    'builtinSkillDesc.find-skills':
      '僅能在代理程式視窗中使用，需要連網，用來尋找所需技能並建議安裝。',
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
