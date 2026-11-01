import { createI18n, defineStrings, type Lang } from '@genoffice/i18n'
import type { LoopbackPages } from './oauth-loopback'

/**
 * Text the main process shows people about their MCP servers: the page the
 * browser shows after a server's sign-in, and why a "my PC" server could not
 * start (the reason view of a failed server). What the AI reads is English
 * and lives with the hub. `zh` defines the key set.
 */
const zh = {
  pageDoneTitle: '已登录',
  pageDoneBody: '可以关闭此标签页并返回 GenOffice。',
  pageFailedTitle: '登录未完成',
  pageFailedBody: '请返回 GenOffice 后重试。',
  problemNeedsCommandWindow: '此命令无法在没有命令窗口的情况下运行。',
  problemEmptyCommand: '请输入要运行的命令。',
  problemNotAProgram: '此文件无法作为程序运行。',
  problemRuntimeMissing: '这台电脑上没有此服务器所需的程序。',
  problemDidNotStart: '服务器未能启动。',
}

type Keys = Record<keyof typeof zh, string>

export const MCP_HUB_STRINGS = defineStrings({
  zh,
  en: {
    pageDoneTitle: 'Signed in',
    pageDoneBody: 'You can close this tab and go back to GenOffice.',
    pageFailedTitle: 'Sign-in did not finish',
    pageFailedBody: 'Go back to GenOffice and try again.',
    problemNeedsCommandWindow: 'This command can’t run without a command window.',
    problemEmptyCommand: 'Enter the command to run.',
    problemNotAProgram: 'This file can’t be run as a program.',
    problemRuntimeMissing: 'The program this server needs isn’t on this PC.',
    problemDidNotStart: 'The server didn’t start.',
  } satisfies Keys,
  ja: {
    pageDoneTitle: 'サインインしました',
    pageDoneBody: 'このタブを閉じて GenOffice に戻ってください。',
    pageFailedTitle: 'サインインが完了しませんでした',
    pageFailedBody: 'GenOffice に戻ってもう一度お試しください。',
    problemNeedsCommandWindow: 'このコマンドはコマンド ウィンドウなしでは実行できません。',
    problemEmptyCommand: '実行するコマンドを入力してください。',
    problemNotAProgram: 'このファイルはプログラムとして実行できません。',
    problemRuntimeMissing: 'このサーバーに必要なプログラムがこの PC にありません。',
    problemDidNotStart: 'サーバーを起動できませんでした。',
  } satisfies Keys,
  ko: {
    pageDoneTitle: '로그인했습니다',
    pageDoneBody: '이 탭을 닫고 GenOffice로 돌아가세요.',
    pageFailedTitle: '로그인을 마치지 못했습니다',
    pageFailedBody: 'GenOffice로 돌아가 다시 시도하세요.',
    problemNeedsCommandWindow: '이 명령은 명령 창 없이 실행할 수 없습니다.',
    problemEmptyCommand: '실행할 명령을 넣으세요.',
    problemNotAProgram: '이 파일은 프로그램으로 실행할 수 없습니다.',
    problemRuntimeMissing: '이 서버에 필요한 프로그램이 이 PC에 없습니다.',
    problemDidNotStart: '서버가 시작되지 않았습니다.',
  } satisfies Keys,
  fr: {
    pageDoneTitle: 'Connexion réussie',
    pageDoneBody: 'Vous pouvez fermer cet onglet et revenir à GenOffice.',
    pageFailedTitle: 'La connexion n’a pas abouti',
    pageFailedBody: 'Revenez à GenOffice et réessayez.',
    problemNeedsCommandWindow: 'Cette commande ne peut pas s’exécuter sans fenêtre de commande.',
    problemEmptyCommand: 'Saisissez la commande à exécuter.',
    problemNotAProgram: 'Ce fichier ne peut pas être exécuté comme un programme.',
    problemRuntimeMissing: 'Le programme dont ce serveur a besoin n’est pas sur ce PC.',
    problemDidNotStart: 'Le serveur n’a pas démarré.',
  } satisfies Keys,
  de: {
    pageDoneTitle: 'Angemeldet',
    pageDoneBody: 'Sie können diesen Tab schließen und zu GenOffice zurückkehren.',
    pageFailedTitle: 'Die Anmeldung wurde nicht abgeschlossen',
    pageFailedBody: 'Kehren Sie zu GenOffice zurück und versuchen Sie es erneut.',
    problemNeedsCommandWindow: 'Dieser Befehl kann nicht ohne Befehlsfenster ausgeführt werden.',
    problemEmptyCommand: 'Geben Sie den auszuführenden Befehl ein.',
    problemNotAProgram: 'Diese Datei kann nicht als Programm ausgeführt werden.',
    problemRuntimeMissing:
      'Das Programm, das dieser Server braucht, ist auf diesem PC nicht vorhanden.',
    problemDidNotStart: 'Der Server ist nicht gestartet.',
  } satisfies Keys,
  es: {
    pageDoneTitle: 'Sesión iniciada',
    pageDoneBody: 'Puedes cerrar esta pestaña y volver a GenOffice.',
    pageFailedTitle: 'No se completó el inicio de sesión',
    pageFailedBody: 'Vuelve a GenOffice e inténtalo de nuevo.',
    problemNeedsCommandWindow: 'Este comando no se puede ejecutar sin una ventana de comandos.',
    problemEmptyCommand: 'Escribe el comando que se va a ejecutar.',
    problemNotAProgram: 'Este archivo no se puede ejecutar como programa.',
    problemRuntimeMissing: 'El programa que necesita este servidor no está en este PC.',
    problemDidNotStart: 'El servidor no se inició.',
  } satisfies Keys,
  th: {
    pageDoneTitle: 'ลงชื่อเข้าใช้แล้ว',
    pageDoneBody: 'ปิดแท็บนี้แล้วกลับไปที่ GenOffice ได้เลย',
    pageFailedTitle: 'การลงชื่อเข้าใช้ไม่เสร็จสมบูรณ์',
    pageFailedBody: 'กลับไปที่ GenOffice แล้วลองอีกครั้ง',
    problemNeedsCommandWindow: 'คำสั่งนี้เรียกใช้ไม่ได้หากไม่มีหน้าต่างคำสั่ง',
    problemEmptyCommand: 'ใส่คำสั่งที่จะเรียกใช้',
    problemNotAProgram: 'ไฟล์นี้เรียกใช้เป็นโปรแกรมไม่ได้',
    problemRuntimeMissing: 'ไม่มีโปรแกรมที่เซิร์ฟเวอร์นี้ต้องใช้ในพีซีเครื่องนี้',
    problemDidNotStart: 'เซิร์ฟเวอร์ไม่ได้เริ่มทำงาน',
  } satisfies Keys,
  id: {
    pageDoneTitle: 'Berhasil masuk',
    pageDoneBody: 'Anda dapat menutup tab ini dan kembali ke GenOffice.',
    pageFailedTitle: 'Proses masuk tidak selesai',
    pageFailedBody: 'Kembali ke GenOffice dan coba lagi.',
    problemNeedsCommandWindow: 'Perintah ini tidak dapat dijalankan tanpa jendela perintah.',
    problemEmptyCommand: 'Masukkan perintah yang akan dijalankan.',
    problemNotAProgram: 'File ini tidak dapat dijalankan sebagai program.',
    problemRuntimeMissing: 'Program yang dibutuhkan server ini tidak ada di PC ini.',
    problemDidNotStart: 'Server tidak berjalan.',
  } satisfies Keys,
  ru: {
    pageDoneTitle: 'Вход выполнен',
    pageDoneBody: 'Можно закрыть эту вкладку и вернуться в GenOffice.',
    pageFailedTitle: 'Вход не завершён',
    pageFailedBody: 'Вернитесь в GenOffice и попробуйте ещё раз.',
    problemNeedsCommandWindow: 'Эту команду нельзя запустить без командного окна.',
    problemEmptyCommand: 'Введите команду для запуска.',
    problemNotAProgram: 'Этот файл нельзя запустить как программу.',
    problemRuntimeMissing: 'Программы, нужной этому серверу, нет на этом компьютере.',
    problemDidNotStart: 'Сервер не запустился.',
  } satisfies Keys,
  ar: {
    pageDoneTitle: 'تم تسجيل الدخول',
    pageDoneBody: 'يمكنك إغلاق علامة التبويب هذه والعودة إلى GenOffice.',
    pageFailedTitle: 'لم يكتمل تسجيل الدخول',
    pageFailedBody: 'عُد إلى GenOffice وحاول مرة أخرى.',
    problemNeedsCommandWindow: 'لا يمكن تشغيل هذا الأمر بدون نافذة أوامر.',
    problemEmptyCommand: 'أدخل الأمر المراد تشغيله.',
    problemNotAProgram: 'لا يمكن تشغيل هذا الملف كبرنامج.',
    problemRuntimeMissing: 'البرنامج الذي يحتاجه هذا الخادم غير موجود على هذا الكمبيوتر.',
    problemDidNotStart: 'لم يبدأ الخادم.',
  } satisfies Keys,
  pt: {
    pageDoneTitle: 'Sessão iniciada',
    pageDoneBody: 'Pode fechar este separador e voltar ao GenOffice.',
    pageFailedTitle: 'O início de sessão não foi concluído',
    pageFailedBody: 'Volte ao GenOffice e tente novamente.',
    problemNeedsCommandWindow: 'Este comando não pode ser executado sem uma janela de comandos.',
    problemEmptyCommand: 'Introduza o comando a executar.',
    problemNotAProgram: 'Este ficheiro não pode ser executado como programa.',
    problemRuntimeMissing: 'O programa de que este servidor precisa não está neste PC.',
    problemDidNotStart: 'O servidor não arrancou.',
  } satisfies Keys,
  it: {
    pageDoneTitle: 'Accesso eseguito',
    pageDoneBody: 'Puoi chiudere questa scheda e tornare a GenOffice.',
    pageFailedTitle: 'L’accesso non è stato completato',
    pageFailedBody: 'Torna a GenOffice e riprova.',
    problemNeedsCommandWindow:
      'Questo comando non può essere eseguito senza una finestra di comando.',
    problemEmptyCommand: 'Inserisci il comando da eseguire.',
    problemNotAProgram: 'Questo file non può essere eseguito come programma.',
    problemRuntimeMissing: 'Il programma di cui questo server ha bisogno non è su questo PC.',
    problemDidNotStart: 'Il server non si è avviato.',
  } satisfies Keys,
  pl: {
    pageDoneTitle: 'Zalogowano',
    pageDoneBody: 'Możesz zamknąć tę kartę i wrócić do GenOffice.',
    pageFailedTitle: 'Logowanie nie zostało zakończone',
    pageFailedBody: 'Wróć do GenOffice i spróbuj ponownie.',
    problemNeedsCommandWindow: 'Tego polecenia nie można uruchomić bez okna poleceń.',
    problemEmptyCommand: 'Wpisz polecenie do uruchomienia.',
    problemNotAProgram: 'Tego pliku nie można uruchomić jako programu.',
    problemRuntimeMissing: 'Programu potrzebnego temu serwerowi nie ma na tym komputerze.',
    problemDidNotStart: 'Serwer nie uruchomił się.',
  } satisfies Keys,
  cs: {
    pageDoneTitle: 'Přihlášení proběhlo',
    pageDoneBody: 'Tuto kartu můžete zavřít a vrátit se do GenOffice.',
    pageFailedTitle: 'Přihlášení nebylo dokončeno',
    pageFailedBody: 'Vraťte se do GenOffice a zkuste to znovu.',
    problemNeedsCommandWindow: 'Tento příkaz nelze spustit bez příkazového okna.',
    problemEmptyCommand: 'Zadejte příkaz, který se má spustit.',
    problemNotAProgram: 'Tento soubor nelze spustit jako program.',
    problemRuntimeMissing: 'Program, který tento server potřebuje, na tomto počítači není.',
    problemDidNotStart: 'Server se nespustil.',
  } satisfies Keys,
  nl: {
    pageDoneTitle: 'Aangemeld',
    pageDoneBody: 'U kunt dit tabblad sluiten en teruggaan naar GenOffice.',
    pageFailedTitle: 'Aanmelden is niet voltooid',
    pageFailedBody: 'Ga terug naar GenOffice en probeer het opnieuw.',
    problemNeedsCommandWindow: 'Deze opdracht kan niet worden uitgevoerd zonder opdrachtvenster.',
    problemEmptyCommand: 'Voer de opdracht in die moet worden uitgevoerd.',
    problemNotAProgram: 'Dit bestand kan niet als programma worden uitgevoerd.',
    problemRuntimeMissing: 'Het programma dat deze server nodig heeft, staat niet op deze pc.',
    problemDidNotStart: 'De server is niet gestart.',
  } satisfies Keys,
  ms: {
    pageDoneTitle: 'Berjaya log masuk',
    pageDoneBody: 'Anda boleh menutup tab ini dan kembali ke GenOffice.',
    pageFailedTitle: 'Log masuk tidak selesai',
    pageFailedBody: 'Kembali ke GenOffice dan cuba lagi.',
    problemNeedsCommandWindow: 'Arahan ini tidak boleh dijalankan tanpa tetingkap arahan.',
    problemEmptyCommand: 'Masukkan arahan yang hendak dijalankan.',
    problemNotAProgram: 'Fail ini tidak boleh dijalankan sebagai program.',
    problemRuntimeMissing: 'Program yang diperlukan oleh pelayan ini tiada pada PC ini.',
    problemDidNotStart: 'Pelayan tidak bermula.',
  } satisfies Keys,
  he: {
    pageDoneTitle: 'ההתחברות הצליחה',
    pageDoneBody: 'אפשר לסגור את הכרטיסייה ולחזור אל GenOffice.',
    pageFailedTitle: 'ההתחברות לא הושלמה',
    pageFailedBody: 'חזרו אל GenOffice ונסו שוב.',
    problemNeedsCommandWindow: 'אי אפשר להריץ את הפקודה הזו בלי חלון פקודה.',
    problemEmptyCommand: 'הזינו את הפקודה להרצה.',
    problemNotAProgram: 'אי אפשר להריץ את הקובץ הזה כתוכנה.',
    problemRuntimeMissing: 'התוכנה שהשרת הזה צריך לא נמצאת במחשב הזה.',
    problemDidNotStart: 'השרת לא הופעל.',
  } satisfies Keys,
  hi: {
    pageDoneTitle: 'साइन इन हो गया',
    pageDoneBody: 'आप यह टैब बंद करके GenOffice पर लौट सकते हैं।',
    pageFailedTitle: 'साइन इन पूरा नहीं हुआ',
    pageFailedBody: 'GenOffice पर लौटकर फिर से कोशिश करें।',
    problemNeedsCommandWindow: 'यह कमांड कमांड विंडो के बिना नहीं चल सकती।',
    problemEmptyCommand: 'चलाने के लिए कमांड डालें।',
    problemNotAProgram: 'यह फ़ाइल प्रोग्राम के रूप में नहीं चल सकती।',
    problemRuntimeMissing: 'इस सर्वर को जिस प्रोग्राम की ज़रूरत है, वह इस पीसी पर नहीं है।',
    problemDidNotStart: 'सर्वर शुरू नहीं हुआ।',
  } satisfies Keys,
  'zh-TW': {
    pageDoneTitle: '已登入',
    pageDoneBody: '可以關閉此分頁並返回 GenOffice。',
    pageFailedTitle: '登入未完成',
    pageFailedBody: '請返回 GenOffice 後再試一次。',
    problemNeedsCommandWindow: '此命令無法在沒有命令視窗的情況下執行。',
    problemEmptyCommand: '請輸入要執行的命令。',
    problemNotAProgram: '此檔案無法作為程式執行。',
    problemRuntimeMissing: '這台電腦上沒有此伺服器所需的程式。',
    problemDidNotStart: '伺服器未能啟動。',
  } satisfies Keys,
  vi: {
    pageDoneTitle: 'Đã đăng nhập',
    pageDoneBody: 'Bạn có thể đóng thẻ này và quay lại GenOffice.',
    pageFailedTitle: 'Chưa đăng nhập xong',
    pageFailedBody: 'Hãy quay lại GenOffice và thử lại.',
    problemNeedsCommandWindow: 'Lệnh này không thể chạy nếu không có cửa sổ lệnh.',
    problemEmptyCommand: 'Hãy nhập lệnh cần chạy.',
    problemNotAProgram: 'Không thể chạy tệp này như một chương trình.',
    problemRuntimeMissing: 'Máy tính này không có chương trình mà máy chủ này cần.',
    problemDidNotStart: 'Máy chủ không khởi động được.',
  } satisfies Keys,
})

export type McpHubStringKey = keyof typeof zh

export const mcpHubText = createI18n(MCP_HUB_STRINGS)

/** The pages the browser shows after a server's sign-in, in the person's language */
export function mcpSignInPages(lang: Lang): LoopbackPages {
  return {
    done: {
      lang,
      title: mcpHubText(lang, 'pageDoneTitle'),
      body: mcpHubText(lang, 'pageDoneBody'),
    },
    failed: {
      lang,
      title: mcpHubText(lang, 'pageFailedTitle'),
      body: mcpHubText(lang, 'pageFailedBody'),
    },
  }
}

/** Why a "my PC" server could not start, as the reason view says it */
export type McpLaunchProblemKey =
  'needs-command-window' | 'empty-command' | 'not-a-program' | 'runtime-missing' | 'did-not-start'

const PROBLEM_KEYS: Record<McpLaunchProblemKey, McpHubStringKey> = {
  'needs-command-window': 'problemNeedsCommandWindow',
  'empty-command': 'problemEmptyCommand',
  'not-a-program': 'problemNotAProgram',
  'runtime-missing': 'problemRuntimeMissing',
  'did-not-start': 'problemDidNotStart',
}

export function mcpLaunchProblemText(lang: Lang, problem: McpLaunchProblemKey): string {
  return mcpHubText(lang, PROBLEM_KEYS[problem])
}
