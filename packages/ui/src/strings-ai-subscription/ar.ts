import type { zh } from './zh'

export const ar = {
  aiAssistant: 'مساعد الذكاء الاصطناعي',
  cardChecking: 'جارٍ التحقق…',
  cardNotInstalled: 'غير مثبَّت',
  cardSignedOut: 'لم يتم تسجيل الدخول',
  cardSigningIn: 'جارٍ تسجيل الدخول…',
  cardReady: 'متصل',
  cardReadyPlan: 'متصل · {plan}',
  cardMetered: 'تم تسجيل الدخول، لكن ليس عبر اشتراك',
  cardMeteredAccepted: 'قيد الاستخدام · الرسوم حسب الاستخدام',
  cardError: 'تعذّر التحقق من الاتصال',
  cardErrNeedsUpdate: 'برنامج {provider} على هذا الحاسوب قديم جدًا. حدّثه ثم تحقق مرة أخرى.',
  cardErrNeedsUpdateVersion:
    'برنامج {provider} على هذا الحاسوب ({version}) قديم جدًا، ويلزم الإصدار {minimum} أو أحدث. شغّل {command} في الطرفية ثم تحقق مرة أخرى.',
  cardErrNeedsUpdatePath: 'الملف الذي يشغّله هذا التطبيق:',
  cardErrNeedsUpdateWindows:
    'تحديث {provider} داخل WSL (Ubuntu) أو في مجلد آخر لا يغيّر هذا الملف. شغّل {command} في Windows PowerShell.',
  cardErrTimeout: 'لم يستجب برنامج {provider} في الوقت المحدد. تحقق مرة أخرى بعد قليل.',
  cardErrFailed: 'حدث خطأ أثناء التحقق من {provider}. تحقق مرة أخرى.',
  actionInstall: 'تثبيت',
  actionLogin: 'تسجيل الدخول',
  actionLoginWindow: 'لم يُفتح المتصفح؟',
  actionRecheck: 'التحقق مرة أخرى',
  actionAcceptMetered: 'استخدام على أي حال',
  actionInstallHelp: 'دليل التثبيت الرسمي',
  actionOpenSettings: 'فتح الإعدادات',
  actionDismiss: 'إغلاق',
  actionSwitchAccount: 'تسجيل الدخول بحساب آخر',
  actionLogout: 'تسجيل الخروج',
  installNote: 'سيُنفَّذ أمر التثبيت الرسمي من {vendor} في نافذة طرفية جديدة.',
  loginNote: 'صفحة تسجيل الدخول التي ستُفتح تابعة لشركة {vendor}.',
  signingInBrowserNote:
    'سجّل الدخول إلى حسابك في {vendor} في المتصفح الذي فُتح، ثم اسمح بالوصول. سيتم الاتصال تلقائيًا عند الانتهاء.',
  signingInWindowNote:
    'اتبع الإرشادات في أعلى نافذة تسجيل الدخول التي فُتحت للتو. سجّل الدخول في صفحة {vendor} التي فُتحت من جديد في المتصفح، وعندها تُغلق النافذة تلقائيًا ويتم الاتصال. صفحة تسجيل الدخول التي كانت مفتوحة من قبل لم تعد تعمل، فأغلقها.',
  meteredWarning: 'هذا ليس اشتراكًا: تُحتسب الرسوم بحسب ما تستخدمه.',
  meteredMeaning:
    'يستخدم هذا التسجيل مفتاح API أو حسابًا يُدفع فيه حسب الاستخدام، أو تعذّر تأكيد نوعه. عند اختيار «استخدام على أي حال» يعمل الذكاء الاصطناعي عبر هذا الاتصال، وتُحتسب تكلفة كل طلب على ذلك الحساب.',
  connectTitle: 'اربط ذكاءً اصطناعيًا للبدء',
  connectBody:
    'يعمل الذكاء الاصطناعي باشتراك Claude أو Codex الذي لديك بالفعل. لا حاجة إلى مفتاح API.',
  connectProviderTitle: 'اتصال {provider} غير متاح للاستخدام حاليًا',
  connectKeyBody: 'لم يكتمل إعداد {provider} بعد. أكمله في الإعدادات، أو اختر ذكاءً اصطناعيًا آخر.',
  errNotConnected:
    'لا يوجد ذكاء اصطناعي متصل. اربط أولًا اشتراك Claude أو Codex، أو ذكاءً اصطناعيًا مجانيًا.',
  errNotInstalled: 'لم يُعثر على برنامج {provider} على هذا الحاسوب.',
  errSignedOut: 'انتهت صلاحية تسجيل الدخول إلى {provider}. سجّل الدخول مجددًا للمتابعة.',
  errRateLimit: 'تم استنفاد حد اشتراك {provider}.',
  errRateLimitReset: 'تم استنفاد حد اشتراك {provider}. سيُعاد تعيينه في {time}.',
  errUnsafeTools:
    'بدأ برنامج {provider} وأدواته الخاصة مفعَّلة، لذلك أُوقف التشغيل حفاظًا على الأمان.',
  errMeteredNotAccepted:
    'اتصال {provider} تُحتسب رسومه حسب الاستخدام ولم تسمح به بعد. اختر «استخدام على أي حال» في إعدادات الاتصال لاستخدامه.',
  errNeedsUpdate: 'برنامج {provider} قديم جدًا لهذه الميزة. حدّثه ثم حاول مرة أخرى.',
  errHeadlessLimit: 'تم بلوغ الحد الأقصى للطلبات التلقائية في الساعة.',
  errHeadlessLimitReset:
    'تم بلوغ الحد الأقصى للطلبات التلقائية في الساعة. يمكن إرسال الطلبات مجددًا في {time}.',
  connectFreeHint: 'ليس لديك اشتراك؟ يمكنك ربط ذكاء اصطناعي مجاني من الإعدادات في نحو دقيقة.',
  actionConnectFree: 'ربط ذكاء اصطناعي مجاني',
  errFreeLimit:
    'نفد رصيد الاستخدام المجاني لهذا اليوم. حاول مجددًا غدًا، أو اختر ذكاءً اصطناعيًا آخر في الإعدادات.',
  errFreeLimitReset: 'نفد رصيد الاستخدام المجاني لهذا اليوم. يمكنك استخدامه مجددًا في {time}.',
  continueWith: 'المتابعة باستخدام {provider}',
  continueMeteredNote: 'اتصال {provider} ليس اشتراكًا: المتابعة تُحتسب رسومها حسب الاستخدام.',
  usageLine: 'تم استخدام {percent}% · إعادة التعيين في {time}',
  usageWindowFiveHour: 'حد 5 ساعات',
  usageWindowSevenDay: 'حد 7 أيام',
  noticeTitle: 'قبل استخدام الذكاء الاصطناعي باشتراكك',
  noticeSend:
    'يُرسَل محتوى المستند ومحادثتك إلى Anthropic أو OpenAI عبر حسابك الشخصي. ويُرسَل مع كل طلب اسم كل مهارة مضبوطة على «يقرر الذكاء الاصطناعي» وعنوانها ووصفها، وتُرسَل معها المهارات المستخدمة وملفات المهارات التي يقرؤها الذكاء الاصطناعي.',
  noticeTraining:
    'استخدام هذا المحتوى في تدريب الذكاء الاصطناعي تحدده إعدادات حسابك لدى تلك الشركة.',
  noticeCodexHistory:
    'يوقف هذا التطبيق حفظ سجل المحادثات في Codex، لكن Codex قد يحتفظ بسجلاته التشخيصية الخاصة على هذا الحاسوب.',
  noticePdfWholeDocument:
    'في محرر PDF، قد ترسل قراءة الصفحات بالذكاء الاصطناعي وترجمة المستندات صور الصفحات والنص الكامل للمستند.',
  noticeAck: 'فهمت',
  codexNotice: 'استخدام اشتراك Codex داخل تطبيق ليس طريقة موصى بها رسميًا من OpenAI.',
  truncatedNotice: 'كان الإدخال طويلًا جدًا، لذا اقتُطع جزء منه قبل الإرسال.',
  pickerAuto: 'تلقائي',
  pickerAutoUsing: 'تلقائي · {provider}',
  pickerAutoUsingModel: 'تلقائي · {provider} · {model}',
  pickerDefaultModel: 'النموذج الافتراضي',
  pickerDefaultModelNamed: 'النموذج الافتراضي · {model}',
  pickerSubscription: 'اشتراك',
  pickerPaid: 'مدفوع',
  pickerPaidTitle: 'الرسوم حسب الاستخدام وغير مشمولة بالاشتراك',
  pickerNotConnected: 'ربط الذكاء الاصطناعي',
  guideQuestion: 'ما الذكاء الاصطناعي الذي تستخدمه بالفعل؟',
  guidePathClaudeTitle: 'لديّ اشتراك مدفوع في Claude',
  guidePathClaudeBody: 'يلزم وجود خطة Pro أو Max. لا يمكن الاتصال بحساب Claude مجاني.',
  guidePathCodexTitle: 'أستخدم ChatGPT',
  guidePathCodexBody:
    'سجّل الدخول إلى برنامج Codex من OpenAI بحسابك في ChatGPT. الخطة المجانية لا تتيح إلا استخدامًا قليلًا.',
  guidePathFreeTitle: 'لا أملك أيًّا منهما بعد',
  guidePathFreeBody:
    'اربط ذكاءً اصطناعيًا مجانيًا في نحو دقيقة. أثناء استخدامه مجانًا، قد يُستخدم ما ترسله لتحسين الذكاء الاصطناعي لدى تلك الشركة.',
  guideBack: 'اختيار طريقة أخرى',
  guideBadgeReady: 'متصل',
  guideBadgeInstalled: 'مثبَّت',
  guideBadgeCheck: 'يحتاج إلى تحقق',
  guideStepsLabel: 'خطوات الاتصال',
  stepInstall: 'تثبيت البرنامج',
  stepLogin: 'تسجيل الدخول',
  stepReady: 'اكتمل الاتصال',
  installReturnNote:
    'عند انتهاء التثبيت في تلك النافذة، عد إلى هنا. سيتحقق التطبيق مرة أخرى تلقائيًا.',
  loginHowNote:
    'عند الضغط يُفتح المتصفح. سجّل الدخول بحسابك في {vendor} واضغط «سماح»، وسيكتمل الاتصال تلقائيًا.',
  signingInStalledNote:
    'إذا لم تُفتح صفحة تسجيل الدخول في المتصفح، فافتح نافذة تسجيل الدخول بالزر أدناه. أما إذا كنت لا تزال تسجّل الدخول في المتصفح، فلا تضغط الزر وأكمل هناك: فالضغط عليه يوقف تسجيل الدخول الجاري ويبدأ من جديد.',
  actionLoginWindowOpen: 'فتح نافذة تسجيل الدخول',
  loginWindowTitle: 'تسجيل الدخول إلى {provider}',
  loginWindowIntro:
    'هذه نافذة تسجيل الدخول الخاصة ببرنامج {provider}. النص الإنجليزي أدناه يعرضه برنامج {provider}.',
  loginWindowStepBrowser:
    'عندما تُفتح صفحة تسجيل الدخول إلى {vendor} في المتصفح، سجّل الدخول واسمح بالوصول. بعدها تُغلق هذه النافذة تلقائيًا.',
  loginWindowStepAddress:
    'إذا لم يُفتح المتصفح، فحدّد بالماوس العنوان أدناه الذي يبدأ بـ https:// بسحب المؤشر فوقه، ثم انقر بزر الماوس الأيمن لنسخه. الصقه في شريط العنوان في المتصفح لتُفتح صفحة تسجيل الدخول.',
  loginWindowStepCode:
    'إذا عرض المتصفح رمزًا بعد تسجيل الدخول، فانسخ الرمز كاملًا (استخدم زر النسخ إن وُجد). انقر بزر الماوس الأيمن مرة واحدة داخل هذه النافذة للصقه، ثم اضغط Enter. من الطبيعي ألا يظهر الرمز الملصق.',
  loginWindowStepInvalid:
    'إذا ظهرت عبارة "Invalid code"، فهذا يعني أن الرمز لم يُنسخ كاملًا. أبقِ هذه النافذة مفتوحة، وانسخ الرمز مرة أخرى والصقه.',
  loginWindowClosing:
    'لم يكتمل تسجيل الدخول. بعد قراءة الرسائل أعلاه، اضغط Enter لإغلاق هذه النافذة. للمحاولة مرة أخرى، اضغط زر تسجيل الدخول من جديد.',
  actionCancelLogin: 'إلغاء تسجيل الدخول',
  actionUpdate: 'تحديث',
  updateNote:
    'عند الضغط يُشغَّل التحديث الرسمي من {vendor} في نافذة جديدة. عند انتهائه هناك، عد إلى هنا.',
  guideInfoHint:
    'ألا يزال لا يعمل؟ انسخ معلومات الاتصال وأرسلها إلى من يساعدك. لا تتضمن حسابًا ولا مسارات ملفات.',
  actionCopyInfo: 'نسخ المعلومات لطلب المساعدة',
  copyInfoDone: 'تم النسخ',
  actionConnectHelp: 'شاهد كل خطوة على الشاشة (صفحة باللغة الكورية)',
} satisfies Record<keyof typeof zh, string>
