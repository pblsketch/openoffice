import type { Lang } from '@genoffice/i18n'

/** "Attach from documents" in every editor's AI panel */
export interface DocAttachStrings {
  label: string
  busy: string
}

export const DOC_ATTACH_STRINGS: Record<Lang, DocAttachStrings> = {
  zh: {
    label: '从 GenOffice 文档附加',
    busy: '文档列表窗口已经打开',
  },
  en: {
    label: 'Attach from GenOffice documents',
    busy: 'The document list window is already open',
  },
  ja: {
    label: 'GenOffice の文書から添付',
    busy: '文書一覧ウィンドウはすでに開いています',
  },
  ko: {
    label: 'GenOffice 문서에서 첨부',
    busy: '목록 창이 이미 열려 있습니다',
  },
  fr: {
    label: 'Joindre depuis les documents GenOffice',
    busy: 'La fenêtre de liste de documents est déjà ouverte',
  },
  de: {
    label: 'Aus GenOffice-Dokumenten anhängen',
    busy: 'Das Dokumentenlisten-Fenster ist bereits geöffnet',
  },
  es: {
    label: 'Adjuntar desde documentos de GenOffice',
    busy: 'La ventana de lista de documentos ya está abierta',
  },
  th: {
    label: 'แนบจากเอกสาร GenOffice',
    busy: 'หน้าต่างรายการเอกสารเปิดอยู่แล้ว',
  },
  id: {
    label: 'Lampirkan dari dokumen GenOffice',
    busy: 'Jendela daftar dokumen sudah terbuka',
  },
  ru: {
    label: 'Прикрепить из документов GenOffice',
    busy: 'Окно списка документов уже открыто',
  },
  ar: {
    label: 'إرفاق من مستندات GenOffice',
    busy: 'نافذة قائمة المستندات مفتوحة بالفعل',
  },
  pt: {
    label: 'Anexar de documentos do GenOffice',
    busy: 'A janela de lista de documentos já está aberta',
  },
  it: {
    label: 'Allega da documenti GenOffice',
    busy: 'La finestra dell’elenco documenti è già aperta',
  },
  pl: {
    label: 'Załącz z dokumentów GenOffice',
    busy: 'Okno listy dokumentów jest już otwarte',
  },
  cs: {
    label: 'Připojit z dokumentů GenOffice',
    busy: 'Okno seznamu dokumentů je už otevřené',
  },
  nl: {
    label: 'Bijvoegen uit GenOffice-documenten',
    busy: 'Het venster met de documentenlijst is al open',
  },
  ms: {
    label: 'Lampirkan daripada dokumen GenOffice',
    busy: 'Tetingkap senarai dokumen sudah dibuka',
  },
  he: {
    label: 'צירוף ממסמכי GenOffice',
    busy: 'חלון רשימת המסמכים כבר פתוח',
  },
  hi: {
    label: 'GenOffice दस्तावेज़ों से संलग्न करें',
    busy: 'दस्तावेज़ सूची विंडो पहले से खुली है',
  },
  'zh-TW': {
    label: '從 GenOffice 文件附加',
    busy: '文件清單視窗已開啟',
  },
  vi: {
    label: 'Đính kèm từ tài liệu GenOffice',
    busy: 'Cửa sổ danh sách tài liệu đã mở',
  },
}
