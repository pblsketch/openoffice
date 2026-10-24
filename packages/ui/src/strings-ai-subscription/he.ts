import type { zh } from './zh'

export const he = {
  aiAssistant: 'עוזר AI',
  cardChecking: 'בודק…',
  cardNotInstalled: 'לא מותקן',
  cardSignedOut: 'לא מחובר לחשבון',
  cardSigningIn: 'מתבצעת כניסה…',
  cardReady: 'מחובר',
  cardReadyPlan: 'מחובר · {plan}',
  cardMetered: 'בוצעה כניסה, אך לא באמצעות מינוי',
  cardMeteredAccepted: 'בשימוש · חיוב לפי שימוש',
  cardError: 'לא ניתן היה לבדוק את החיבור',
  cardErrNeedsUpdate: 'התוכנה {provider} במחשב הזה ישנה מדי. עדכנו אותה ואז בדקו שוב.',
  cardErrNeedsUpdateVersion:
    'התוכנה {provider} במחשב הזה ({version}) ישנה מדי; נדרשת גרסה {minimum} ומעלה. הריצו {command} בטרמינל ואז בדקו שוב.',
  cardErrNeedsUpdatePath: 'הקובץ שהאפליקציה הזו מריצה:',
  cardErrNeedsUpdateWindows:
    'עדכון {provider} בתוך WSL (Ubuntu) או בתיקייה אחרת לא משנה את הקובץ הזה. הריצו {command} ב-Windows PowerShell.',
  cardErrTimeout: 'התוכנה {provider} לא ענתה בזמן. בדקו שוב בעוד רגע.',
  cardErrFailed: 'משהו השתבש במהלך הבדיקה של {provider}. בדקו שוב.',
  actionInstall: 'התקנה',
  actionLogin: 'כניסה',
  actionLoginWindow: 'הדפדפן לא נפתח?',
  actionRecheck: 'בדיקה חוזרת',
  actionAcceptMetered: 'להשתמש בכל זאת',
  actionInstallHelp: 'מדריך ההתקנה הרשמי',
  actionOpenSettings: 'פתיחת ההגדרות',
  actionDismiss: 'סגירה',
  actionSwitchAccount: 'כניסה עם חשבון אחר',
  actionLogout: 'יציאה מהחשבון',
  installNote: 'פקודת ההתקנה הרשמית של {vendor} תופעל בחלון מסוף חדש.',
  loginNote: 'דף הכניסה שייפתח הוא של {vendor}.',
  signingInBrowserNote:
    'היכנסו לחשבון {vendor} שלכם בדפדפן שנפתח ואשרו את הגישה. החיבור יתבצע מעצמו כשתסיימו.',
  signingInWindowNote:
    'פעלו לפי ההנחיות בראש חלון הכניסה שנפתח זה עתה. היכנסו בדף הכניסה החדש של {vendor} שנפתח בדפדפן: אז החלון ייסגר מעצמו והחיבור יושלם. דף הכניסה שהיה פתוח קודם כבר לא עובד; סגרו אותו.',
  meteredWarning: 'זה אינו מינוי: החיוב הוא לפי השימוש בפועל.',
  meteredMeaning:
    'הכניסה הזו משתמשת במפתח API או בחשבון בתשלום לפי שימוש, או שלא ניתן היה לאמת את סוגה. בחירה ב"להשתמש בכל זאת" מאפשרת לבינה המלאכותית לפעול דרך החיבור הזה, וכל בקשה תחויב בחשבון הזה.',
  connectTitle: 'חברו בינה מלאכותית כדי להתחיל',
  connectBody: 'הבינה המלאכותית פועלת עם מינוי Claude או Codex שכבר יש לכם. אין צורך במפתח API.',
  connectProviderTitle: 'החיבור {provider} אינו זמין לשימוש כרגע',
  connectKeyBody:
    'ההגדרה של {provider} עדיין לא הושלמה. השלימו אותה בהגדרות או בחרו בינה מלאכותית אחרת.',
  errNotConnected:
    'אין בינה מלאכותית מחוברת. חברו תחילה מינוי Claude או Codex, או בינה מלאכותית בחינם.',
  errNotInstalled: 'התוכנה {provider} לא נמצאה במחשב הזה.',
  errSignedOut: 'תוקף הכניסה אל {provider} פג. היכנסו שוב כדי להמשיך.',
  errRateLimit: 'מכסת המינוי של {provider} נוצלה במלואה.',
  errRateLimitReset: 'מכסת המינוי של {provider} נוצלה במלואה. היא תתאפס ב-{time}.',
  errUnsafeTools:
    'התוכנה {provider} הופעלה כשהכלים שלה עצמה פעילים, ולכן ההרצה נעצרה מטעמי בטיחות.',
  errMeteredNotAccepted:
    'החיבור {provider} מחויב לפי שימוש ועדיין לא אישרתם אותו. כדי להשתמש בו, בחרו "להשתמש בכל זאת" בהגדרות החיבור.',
  errNeedsUpdate: 'התוכנה {provider} ישנה מדי עבור התכונה הזו. עדכנו אותה ונסו שוב.',
  errHeadlessLimit: 'הושגה המכסה השעתית של בקשות אוטומטיות.',
  errHeadlessLimitReset:
    'הושגה המכסה השעתית של בקשות אוטומטיות. אפשר יהיה לשלוח בקשות שוב ב-{time}.',
  connectFreeHint: 'אין לכם מינוי? אפשר לחבר בינה מלאכותית בחינם בהגדרות תוך כדקה.',
  actionConnectFree: 'חיבור בינה מלאכותית בחינם',
  errFreeLimit: 'המכסה החינמית להיום נוצלה. נסו שוב מחר, או בחרו בינה מלאכותית אחרת בהגדרות.',
  errFreeLimitReset: 'המכסה החינמית להיום נוצלה. אפשר יהיה להשתמש בה שוב ב-{time}.',
  continueWith: 'המשך עם {provider}',
  continueMeteredNote: 'החיבור {provider} אינו מינוי: המשך העבודה יחויב לפי שימוש.',
  usageLine: 'נוצלו {percent}% · איפוס ב-{time}',
  usageWindowFiveHour: 'מכסה ל-5 שעות',
  usageWindowSevenDay: 'מכסה ל-7 ימים',
  noticeTitle: 'לפני השימוש בבינה המלאכותית עם המינוי שלכם',
  noticeSend:
    'תוכן המסמך והשיחה נשלחים אל Anthropic או אל OpenAI באמצעות החשבון האישי שלכם. כל בקשה כוללת גם את השם, הכותרת והתיאור של כל מיומנות שמוגדרת "ה-AI מחליט"; גם המיומנויות שבשימוש וקובצי המיומנויות שהבינה המלאכותית קוראת נשלחים יחד איתם.',
  noticeTraining:
    'השאלה אם התוכן הזה ישמש לאימון בינה מלאכותית נקבעת בהגדרות החשבון שלכם באותה חברה.',
  noticeCodexHistory:
    'האפליקציה מכבה את שמירת היסטוריית השיחות ב-Codex, אך ייתכן ש-Codex עדיין ישמור יומני אבחון משלו במחשב הזה.',
  noticePdfWholeDocument:
    'בעורך ה-PDF, קריאת עמודים בעזרת AI ותרגום מסמכים עשויים לשלוח תמונות של העמודים ואת כל הטקסט של המסמך.',
  noticeAck: 'הבנתי',
  codexNotice: 'שימוש במינוי Codex בתוך אפליקציה אינו שיטה ש-OpenAI ממליצה עליה באופן רשמי.',
  truncatedNotice: 'הקלט היה ארוך מדי, ולכן חלק ממנו נחתך לפני השליחה.',
  pickerAuto: 'אוטומטי',
  pickerAutoUsing: 'אוטומטי · {provider}',
  pickerAutoUsingModel: 'אוטומטי · {provider} · {model}',
  pickerDefaultModel: 'מודל ברירת מחדל',
  pickerDefaultModelNamed: 'מודל ברירת מחדל · {model}',
  pickerSubscription: 'מינוי',
  pickerPaid: 'בתשלום',
  pickerPaidTitle: 'חיוב לפי שימוש, לא כלול במינוי',
  pickerNotConnected: 'חיבור בינה מלאכותית',
  guideQuestion: 'באיזו בינה מלאכותית אתם כבר משתמשים?',
  guidePathClaudeTitle: 'יש לי מינוי Claude בתשלום',
  guidePathClaudeBody: 'נדרשת תוכנית Pro או Max. אי אפשר להתחבר עם חשבון Claude חינמי.',
  guidePathCodexTitle: 'יש לי ChatGPT',
  guidePathCodexBody:
    'נכנסים לתוכנת Codex של OpenAI עם חשבון ChatGPT. בתוכנית החינמית אפשר להשתמש רק מעט.',
  guidePathFreeTitle: 'עדיין אין לי',
  guidePathFreeBody:
    'אפשר לחבר בינה מלאכותית בחינם תוך כדקה. בזמן השימוש בחינם, התוכן שתשלחו עשוי לשמש לשיפור הבינה המלאכותית של אותה חברה.',
  guideBack: 'בחירת דרך אחרת',
  guideBadgeReady: 'מחובר',
  guideBadgeInstalled: 'מותקן',
  guideBadgeCheck: 'דורש בדיקה',
  guideStepsLabel: 'שלבי החיבור',
  stepInstall: 'התקנת התוכנה',
  stepLogin: 'כניסה',
  stepReady: 'החיבור הושלם',
  installReturnNote: 'כשההתקנה בחלון ההוא תסתיים, חזרו לכאן. האפליקציה תבדוק שוב מעצמה.',
  loginHowNote:
    'בלחיצה ייפתח דפדפן. היכנסו עם חשבון {vendor} שלכם ולחצו על אישור, והחיבור יושלם מעצמו.',
  signingInStalledNote:
    'אם דף הכניסה לא נפתח בדפדפן, פתחו את חלון הכניסה בכפתור שלמטה. אם אתם עדיין באמצע הכניסה בדפדפן, אל תלחצו עליו וסיימו שם: הכפתור עוצר את הכניסה הזו ומתחיל מחדש.',
  actionLoginWindowOpen: 'פתיחת חלון הכניסה',
  loginWindowTitle: 'כניסה אל {provider}',
  loginWindowIntro:
    'זהו חלון הכניסה של התוכנה {provider}. הטקסט באנגלית שמופיע למטה מגיע מהתוכנה {provider}.',
  loginWindowStepBrowser:
    'כשדף הכניסה של {vendor} נפתח בדפדפן, היכנסו ואשרו את הגישה. לאחר מכן החלון הזה ייסגר מעצמו.',
  loginWindowStepAddress:
    'אם הדפדפן לא נפתח, סמנו בגרירת העכבר את הכתובת שלמטה שמתחילה ב-https://, ואז לחצו על לחצן העכבר הימני כדי להעתיק אותה. הדביקו אותה בשורת הכתובת של הדפדפן כדי לפתוח את דף הכניסה.',
  loginWindowStepCode:
    'אם אחרי הכניסה הדפדפן מציג קוד, העתיקו את הקוד כולו (אם יש כפתור העתקה, השתמשו בו). לחצו פעם אחת על לחצן העכבר הימני בתוך החלון הזה כדי להדביק אותו, ואז הקישו Enter. זה תקין שהקוד המודבק לא מופיע.',
  loginWindowStepInvalid:
    'אם מופיע "Invalid code", הקוד לא הועתק במלואו. השאירו את החלון הזה פתוח, העתיקו שוב את הקוד והדביקו אותו.',
  loginWindowClosing:
    'הכניסה לא הסתיימה. אחרי שקראתם את ההודעות שלמעלה, הקישו Enter כדי לסגור את החלון הזה. כדי לנסות שוב, לחצו שוב על כפתור הכניסה.',
  actionCancelLogin: 'ביטול הכניסה',
  actionUpdate: 'עדכון',
  updateNote: 'בלחיצה, העדכון הרשמי של {vendor} יופעל בחלון חדש. כשהוא יסתיים שם, חזרו לכאן.',
  guideInfoHint:
    'עדיין לא עובד? העתיקו את פרטי החיבור ושלחו אותם למי שעוזר לכם. אין בהם חשבון ולא נתיבי קבצים.',
  actionCopyInfo: 'העתקת פרטים לקבלת עזרה',
  copyInfoDone: 'הועתק',
  actionConnectHelp: 'צפו בכל שלב על המסך (דף בקוריאנית)',
} satisfies Record<keyof typeof zh, string>
