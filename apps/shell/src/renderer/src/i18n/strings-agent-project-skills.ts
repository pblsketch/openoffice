import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'

/**
 * The agent window's start screen: a project folder's own skills and the
 * person's choice for them (decision 0064). Kept apart from the window's other
 * strings; `zh` defines the key set.
 */
const zh = {
  label: '此文件夹中的技能',
  note: '此文件夹自带 {count} 个技能。开启后，智能体会直接读取并遵循这些技能，不再询问。如果文件夹来自他人，请先查看内容。',
  on: '开启',
  off: '不开启',
  changed: '开启之后这些技能有了变化，在你重新选择之前保持关闭。',
  remember: '你的选择会记在这个文件夹上。技能有变化时会再次询问。',
}

type Keys = Record<keyof typeof zh, string>

export const agentProjectSkillsStrings = defineStrings({
  zh,
  en: {
    label: 'Skills in this folder',
    note: 'This folder has {count} skills of its own. Turned on, the agent reads and follows them without asking. If someone else gave you this folder, look at them first.',
    on: 'Turn on',
    off: 'Leave off',
    changed:
      'These skills changed after you turned them on, so they stay off until you choose again.',
    remember: 'Your choice is kept for this folder. If the skills change, you are asked again.',
  } satisfies Keys,
  vi: {
    label: 'Kỹ năng trong thư mục này',
    note: 'Thư mục này có {count} kỹ năng riêng. Khi bật, tác tử sẽ đọc và làm theo chúng mà không hỏi. Nếu thư mục do người khác gửi, hãy xem chúng trước.',
    on: 'Bật',
    off: 'Không bật',
    changed: 'Các kỹ năng này đã thay đổi sau khi bạn bật, nên chúng tắt cho đến khi bạn chọn lại.',
    remember: 'Lựa chọn được ghi nhớ cho thư mục này. Nếu kỹ năng thay đổi, bạn sẽ được hỏi lại.',
  } satisfies Keys,
  ja: {
    label: 'このフォルダーのスキル',
    note: 'このフォルダーには独自のスキルが {count} 個あります。オンにすると、エージェントは確認せずにそれを読んで従います。他の人から受け取ったフォルダーなら、先に中身を確認してください。',
    on: 'オンにする',
    off: 'オフのまま',
    changed: 'オンにした後でスキルが変わったため、選び直すまでオフです。',
    remember: '選択はこのフォルダーに記憶されます。スキルが変わると、もう一度確認します。',
  } satisfies Keys,
  ko: {
    label: '이 폴더의 스킬',
    note: '이 폴더에는 자체 스킬이 {count}개 있습니다. 켜면 에이전트가 묻지 않고 이 스킬을 읽고 따릅니다. 남에게 받은 폴더라면 먼저 내용을 확인하세요.',
    on: '켜기',
    off: '켜지 않기',
    changed: '켠 뒤로 스킬이 바뀌어서, 다시 고를 때까지 꺼 둡니다.',
    remember: '고른 값은 이 폴더에 기억됩니다. 스킬이 바뀌면 다시 묻습니다.',
  } satisfies Keys,
  fr: {
    label: 'Compétences de ce dossier',
    note: 'Ce dossier contient {count} compétences propres. Activées, l’agent les lit et les suit sans demander. Si quelqu’un d’autre vous a donné ce dossier, examinez-les d’abord.',
    on: 'Activer',
    off: 'Laisser désactivé',
    changed:
      'Ces compétences ont changé depuis que vous les avez activées ; elles restent désactivées jusqu’à un nouveau choix.',
    remember:
      'Votre choix est retenu pour ce dossier. Si les compétences changent, la question revient.',
  } satisfies Keys,
  de: {
    label: 'Skills in diesem Ordner',
    note: 'Dieser Ordner bringt {count} eigene Skills mit. Eingeschaltet liest und befolgt der Agent sie ohne Nachfrage. Haben Sie den Ordner von jemand anderem, sehen Sie sie zuerst an.',
    on: 'Einschalten',
    off: 'Aus lassen',
    changed:
      'Diese Skills haben sich seit dem Einschalten geändert und bleiben aus, bis Sie neu wählen.',
    remember:
      'Ihre Wahl wird für diesen Ordner gespeichert. Ändern sich die Skills, werden Sie erneut gefragt.',
  } satisfies Keys,
  es: {
    label: 'Habilidades de esta carpeta',
    note: 'Esta carpeta trae {count} habilidades propias. Si las activa, el agente las lee y las sigue sin preguntar. Si la carpeta se la dio otra persona, revíselas primero.',
    on: 'Activar',
    off: 'Dejar desactivadas',
    changed:
      'Estas habilidades cambiaron después de activarlas, así que quedan desactivadas hasta que vuelva a elegir.',
    remember:
      'Su elección se guarda para esta carpeta. Si las habilidades cambian, se le volverá a preguntar.',
  } satisfies Keys,
  th: {
    label: 'สกิลในโฟลเดอร์นี้',
    note: 'โฟลเดอร์นี้มีสกิลของตัวเอง {count} รายการ เมื่อเปิด เอเจนต์จะอ่านและทำตามโดยไม่ถาม หากได้รับโฟลเดอร์นี้จากผู้อื่น ให้ตรวจดูก่อน',
    on: 'เปิด',
    off: 'ไม่เปิด',
    changed: 'สกิลเหล่านี้เปลี่ยนไปหลังจากที่คุณเปิด จึงปิดไว้จนกว่าคุณจะเลือกใหม่',
    remember: 'ตัวเลือกจะถูกจำไว้สำหรับโฟลเดอร์นี้ หากสกิลเปลี่ยน ระบบจะถามอีกครั้ง',
  } satisfies Keys,
  id: {
    label: 'Skill di folder ini',
    note: 'Folder ini membawa {count} skill sendiri. Jika diaktifkan, agen membaca dan mengikutinya tanpa bertanya. Jika folder ini dari orang lain, periksa dulu isinya.',
    on: 'Aktifkan',
    off: 'Biarkan mati',
    changed:
      'Skill ini berubah setelah Anda mengaktifkannya, jadi tetap mati sampai Anda memilih lagi.',
    remember: 'Pilihan Anda disimpan untuk folder ini. Jika skill berubah, Anda akan ditanya lagi.',
  } satisfies Keys,
  ru: {
    label: 'Навыки этой папки',
    note: 'В этой папке есть собственные навыки: {count}. Если их включить, агент будет читать их и следовать им без вопросов. Если папку вам дал кто-то другой, сначала посмотрите их.',
    on: 'Включить',
    off: 'Не включать',
    changed: 'Навыки изменились после включения, поэтому они выключены, пока вы не выберете снова.',
    remember: 'Выбор запоминается для этой папки. Если навыки изменятся, вас спросят снова.',
  } satisfies Keys,
  ar: {
    label: 'مهارات هذا المجلد',
    note: 'يحتوي هذا المجلد على {count} من المهارات الخاصة به. عند تشغيلها يقرؤها الوكيل ويتبعها دون أن يسأل. إذا أعطاك شخص آخر هذا المجلد فراجعها أولًا.',
    on: 'تشغيل',
    off: 'إبقاؤها متوقفة',
    changed: 'تغيّرت هذه المهارات بعد تشغيلها، لذا تبقى متوقفة حتى تختار من جديد.',
    remember: 'يُحفظ اختيارك لهذا المجلد. إذا تغيّرت المهارات فسيُطرح السؤال مرة أخرى.',
  } satisfies Keys,
  pt: {
    label: 'Habilidades desta pasta',
    note: 'Esta pasta traz {count} habilidades próprias. Ativadas, o agente as lê e segue sem perguntar. Se outra pessoa lhe deu esta pasta, confira-as antes.',
    on: 'Ativar',
    off: 'Deixar desativadas',
    changed:
      'Estas habilidades mudaram depois que você as ativou, então ficam desativadas até você escolher de novo.',
    remember:
      'Sua escolha fica guardada para esta pasta. Se as habilidades mudarem, você será perguntado de novo.',
  } satisfies Keys,
  it: {
    label: 'Skill di questa cartella',
    note: 'Questa cartella contiene {count} skill proprie. Se le attivi, l’agente le legge e le segue senza chiedere. Se la cartella ti è stata data da altri, controllale prima.',
    on: 'Attiva',
    off: 'Lascia disattivate',
    changed:
      'Queste skill sono cambiate dopo che le hai attivate, quindi restano disattivate finché non scegli di nuovo.',
    remember:
      'La scelta viene ricordata per questa cartella. Se le skill cambiano, ti verrà chiesto di nuovo.',
  } satisfies Keys,
  pl: {
    label: 'Umiejętności w tym folderze',
    note: 'Ten folder ma własne umiejętności: {count}. Po włączeniu agent czyta je i stosuje się do nich bez pytania. Jeśli folder dostałeś od kogoś innego, najpierw je przejrzyj.',
    on: 'Włącz',
    off: 'Nie włączaj',
    changed:
      'Te umiejętności zmieniły się po włączeniu, więc pozostają wyłączone, dopóki nie wybierzesz ponownie.',
    remember:
      'Wybór jest zapamiętywany dla tego folderu. Jeśli umiejętności się zmienią, pytanie wróci.',
  } satisfies Keys,
  cs: {
    label: 'Dovednosti v této složce',
    note: 'Tato složka má {count} vlastních dovedností. Po zapnutí je agent čte a řídí se jimi bez ptaní. Pokud vám složku dal někdo jiný, nejprve si je prohlédněte.',
    on: 'Zapnout',
    off: 'Nechat vypnuté',
    changed:
      'Tyto dovednosti se po zapnutí změnily, proto zůstanou vypnuté, dokud nevyberete znovu.',
    remember: 'Volba se pamatuje pro tuto složku. Když se dovednosti změní, zeptáme se znovu.',
  } satisfies Keys,
  nl: {
    label: 'Vaardigheden in deze map',
    note: 'Deze map heeft {count} eigen vaardigheden. Staan ze aan, dan leest en volgt de agent ze zonder te vragen. Kreeg je deze map van iemand anders, bekijk ze dan eerst.',
    on: 'Aanzetten',
    off: 'Uit laten',
    changed:
      'Deze vaardigheden zijn veranderd nadat je ze aanzette, dus ze blijven uit tot je opnieuw kiest.',
    remember:
      'Je keuze wordt voor deze map onthouden. Als de vaardigheden veranderen, wordt het opnieuw gevraagd.',
  } satisfies Keys,
  ms: {
    label: 'Kemahiran dalam folder ini',
    note: 'Folder ini membawa {count} kemahiran sendiri. Jika dihidupkan, ejen membaca dan mengikutinya tanpa bertanya. Jika folder ini daripada orang lain, semak dahulu.',
    on: 'Hidupkan',
    off: 'Biarkan mati',
    changed:
      'Kemahiran ini berubah selepas anda menghidupkannya, jadi ia kekal mati sehingga anda memilih semula.',
    remember:
      'Pilihan anda disimpan untuk folder ini. Jika kemahiran berubah, anda akan ditanya semula.',
  } satisfies Keys,
  he: {
    label: 'מיומנויות בתיקייה הזו',
    note: 'בתיקייה הזו יש {count} מיומנויות משלה. כשהן מופעלות, הסוכן קורא אותן ופועל לפיהן בלי לשאול. אם קיבלתם את התיקייה ממישהו אחר, בדקו אותן קודם.',
    on: 'להפעיל',
    off: 'להשאיר כבויות',
    changed: 'המיומנויות השתנו אחרי שהפעלתם אותן, ולכן הן כבויות עד שתבחרו שוב.',
    remember: 'הבחירה נשמרת לתיקייה הזו. אם המיומנויות ישתנו, תישאלו שוב.',
  } satisfies Keys,
  hi: {
    label: 'इस फ़ोल्डर के स्किल',
    note: 'इस फ़ोल्डर में अपने {count} स्किल हैं। चालू करने पर एजेंट बिना पूछे उन्हें पढ़ता और उनका पालन करता है। अगर यह फ़ोल्डर किसी और ने दिया है, तो पहले उन्हें देख लें।',
    on: 'चालू करें',
    off: 'बंद रहने दें',
    changed: 'चालू करने के बाद ये स्किल बदल गए, इसलिए दोबारा चुनने तक ये बंद रहेंगे।',
    remember: 'आपकी पसंद इस फ़ोल्डर के लिए याद रखी जाती है। स्किल बदलने पर फिर से पूछा जाएगा।',
  } satisfies Keys,
  'zh-TW': {
    label: '此資料夾中的技能',
    note: '此資料夾自帶 {count} 個技能。開啟後，代理程式會直接讀取並遵循這些技能，不再詢問。如果資料夾來自他人，請先檢視內容。',
    on: '開啟',
    off: '不開啟',
    changed: '開啟之後這些技能有了變化，在你重新選擇之前保持關閉。',
    remember: '你的選擇會記在這個資料夾上。技能有變化時會再次詢問。',
  } satisfies Keys,
})

export type AgentProjectSkillsStringKey = keyof typeof zh

const translate = createI18n(agentProjectSkillsStrings)

export function agentProjectSkillsText(
  lang: Lang,
  key: AgentProjectSkillsStringKey,
  params?: Params,
): string {
  return translate(lang, key, params)
}
