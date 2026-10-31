import type { zh } from './zh'

export const he = {
  driveNav: 'Google Drive',
  driveDesc:
    'בחרו קבצים ב-Google Drive, ואז פתחו וערכו אותם ב-GenOffice; בשמירה הם חוזרים ל-Drive. GenOffice יכול לפתוח רק את הקבצים שתבחרו.',
  driveConnect: 'חיבור Google Drive',
  driveConnecting: 'התחברו לחשבון Google בדפדפן ואשרו את הגישה…',
  driveCancel: 'ביטול',
  driveConnectedAs: 'מחובר בתור {email}',
  driveDisconnect: 'ניתוק',
  driveDisconnectConfirm:
    'פעולה זו מסירה את ההתחברות ל-Drive מהמחשב הזה ומבקשת מ-Google לבטל את הגישה של GenOffice. עותקים שכבר נמצאים במחשב הזה יישארו.',
  driveDisconnectYes: 'ניתוק',
  driveNotPersisted:
    'המחשב הזה לא יכול לשמור את ההתחברות בהצפנה, ולכן החיבור מסתיים כשסוגרים את האפליקציה.',
  driveExpired: 'Google סיימה את החיבור: הגישה בוטלה או שההתחברות פגה. התחברו שוב.',
  driveAiAccess: 'לאפשר ל-AI למצוא ולקרוא קבצים ב-Drive',
  driveAiAccessDesc:
    'כשהאפשרות פעילה, ה-AI בעורכים יכול לחפש ולקרוא את קובצי ה-Drive שבחרתם כאן. מה שהוא קורא נשלח לספק ה-AI שבו אתם משתמשים. ה-AI לא יכול לשנות, למחוק או לשתף קבצים ב-Drive.',
  drivePrivacy:
    'רשימות קבצים ותוכנם עוברים רק בין המחשב הזה ל-Google. הם אף פעם לא עוברים דרך שרת של יוצרי GenOffice.',
  driveFailDenied: 'החיבור לא הצליח כי Google לא אישרה אותו.',
  driveFailScope: 'החיבור לא הצליח כי הגישה ל-Drive לא סומנה. התחברו שוב וסמנו את פריט ה-Drive.',
  driveFailTimeout: 'ההתחברות לא הסתיימה תוך 10 דקות. נסו שוב.',
  driveFailNetwork: 'לא ניתן להתחבר ל-Google. בדקו את החיבור לאינטרנט ונסו שוב.',
  driveRecent: 'קבצים שבחרתם',
  driveSearchPlaceholder: 'חיפוש בקבצים שבחרתם',
  driveSearchResults: 'תוצאות עבור “{q}”',
  driveRefresh: 'רענון',
  driveNotConnectedTitle: 'Google Drive לא מחובר',
  driveNotConnectedBody:
    'אחרי החיבור תוכלו לבחור קבצים מ-Drive, לפתוח ולערוך אותם כאן, ובשמירה הם חוזרים ל-Drive.',
  driveOpenSettings: 'חיבור בהגדרות',
  driveEmpty: 'עדיין אין קבצים. לחצו על “בחירה מ-Google Drive” כדי לבחור קבצים.',
  driveLoading: 'טוען…',
  driveLoadMore: 'הצגת עוד',
  driveOpening: 'פותח…',
  driveGoogleBadge: 'פורמט Google',
  driveGoogleNote:
    'מסמך Google נפתח כקובץ Office. בשמירה המקור נשאר כמו שהוא, וקובץ Office נשמר לידו או ב“האחסון שלי”.',
  driveReadOnly: 'צפייה בלבד',
  driveReadOnlyNote: 'אין לכם הרשאה לערוך את הקובץ הזה. בשמירה תישאלו אם לשמור עותק ב-Drive.',
  driveUnsupported: 'האפליקציה הזו לא יכולה לפתוח סוג קובץ כזה.',
  driveErrNotConnected: 'Google Drive מנותק. התחברו שוב בהגדרות.',
  driveErrNotFound: 'הקובץ לא נמצא. הוא נמחק, או שהחשבון הזה לא יכול לראות אותו.',
  driveErrForbidden: 'לחשבון הזה אין הרשאה להוריד את הקובץ.',
  driveErrTooLarge: 'הקובץ גדול מכדי לפתוח אותו.',
  driveErrRateLimit: 'Google מעכבת בקשות לרגע. נסו שוב בעוד רגע.',
  driveErrNetwork: 'לא ניתן להתחבר ל-Google Drive. בדקו את החיבור לאינטרנט.',
  driveErrDisk: 'לא ניתן היה לשמור את הקובץ במחשב הזה.',
  drivePick: 'בחירה מ-Google Drive',
  drivePicking: 'בחרו קבצים בחלון של Google שנפתח בדפדפן…',
  drivePickNote:
    'GenOffice יכול לפתוח רק את קובצי ה-Drive שתבחרו בחלון של Google. קבצים שבחרתם פעם אחת נשארים ברשימה הזו.',
  driveTrainingTitle: 'לפני שמשתמשים בקובצי Drive עם AI',
  driveTrainingBody:
    'Google לא מתירה לשלוח קובצי Drive לשירות AI שמשתמש בהם כדי לאמן את המודלים שלו. תוכניות אישיות של Claude,‏ ChatGPT ו-Codex עשויות להשתמש בשיחות שלכם לאימון אם לא תכבו זאת: ב-Claude תחת הגדרות → פרטיות, ב-ChatGPT תחת הגדרות → בקרת נתונים → “Improve the model for everyone”. ספקים עם מפתח API לא מאמנים על נתוני API כברירת מחדל. חיבורי AI חינמיים אף פעם לא מקבלים קובצי Drive.',
  driveTrainingAck: 'אימון המודלים כבוי בחשבונות ה-AI שמשמשים אותי עם קובצי Drive',
  driveFailTraining: 'קודם סמנו למעלה את הפריט על אימון מודלים.',
} satisfies Record<keyof typeof zh, string>
