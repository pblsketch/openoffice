import type { zh } from './zh'

export const cs = {
  aiAssistant: 'Asistent AI',
  cardChecking: 'Probíhá kontrola…',
  cardNotInstalled: 'Není nainstalováno',
  cardSignedOut: 'Nepřihlášeno',
  cardSigningIn: 'Probíhá přihlášení…',
  cardReady: 'Připojeno',
  cardReadyPlan: 'Připojeno · {plan}',
  cardMetered: 'Přihlášeno, ale ne přes předplatné',
  cardMeteredAccepted: 'Používá se · účtováno podle spotřeby',
  cardError: 'Připojení se nepodařilo ověřit',
  cardErrNeedsUpdate:
    'Program {provider} v tomto počítači je příliš starý. Aktualizujte ho a zkontrolujte znovu.',
  cardErrNeedsUpdateVersion:
    'Program {provider} v tomto počítači ({version}) je příliš starý; je potřeba verze {minimum} nebo novější. Spusťte v terminálu {command} a zkontrolujte znovu.',
  cardErrNeedsUpdatePath: 'Soubor, který tato aplikace spouští:',
  cardErrNeedsUpdateWindows:
    'Aktualizace programu {provider} ve WSL (Ubuntu) nebo v jiné složce tento soubor nezmění. Spusťte {command} ve Windows PowerShellu.',
  cardErrTimeout: 'Program {provider} neodpověděl včas. Zkontrolujte to za chvíli znovu.',
  cardErrFailed: 'Při kontrole {provider} došlo k potížím. Zkontrolujte to znovu.',
  actionInstall: 'Nainstalovat',
  actionLogin: 'Přihlásit se',
  actionLoginWindow: 'Prohlížeč se neotevřel?',
  actionRecheck: 'Zkontrolovat znovu',
  actionAcceptMetered: 'Přesto použít',
  actionInstallHelp: 'Oficiální návod k instalaci',
  actionOpenSettings: 'Otevřít nastavení',
  actionDismiss: 'Zavřít',
  actionSwitchAccount: 'Přihlásit se jiným účtem',
  actionLogout: 'Odhlásit se',
  installNote: 'Oficiální instalační příkaz společnosti {vendor} se spustí v novém okně terminálu.',
  loginNote: 'Přihlašovací stránka, která se otevře, patří společnosti {vendor}.',
  signingInBrowserNote:
    'V otevřeném prohlížeči se přihlaste ke svému účtu {vendor} a povolte přístup. Po dokončení se připojení vytvoří samo.',
  signingInWindowNote:
    'Postupujte podle návodu v horní části právě otevřeného přihlašovacího okna. Přihlaste se na nově otevřené přihlašovací stránce {vendor} v prohlížeči: okno se pak samo zavře a připojení se vytvoří. Přihlašovací stránka otevřená dříve už nefunguje; zavřete ji.',
  meteredWarning: 'Toto není předplatné: platíte podle skutečné spotřeby.',
  meteredMeaning:
    'Toto přihlášení používá klíč API nebo účet s platbou podle spotřeby, případně se jeho typ nepodařilo zjistit. Volbou „Přesto použít“ poběží AI přes toto připojení a každý požadavek se naúčtuje tomuto účtu.',
  connectTitle: 'Začněte připojením AI',
  connectBody: 'AI běží na předplatném Claude nebo Codex, které už máte. Klíč API není potřeba.',
  connectProviderTitle: 'Připojení {provider} teď nelze použít',
  connectKeyBody:
    'Nastavení poskytovatele {provider} není dokončeno. Dokončete ho v Nastavení, nebo zvolte jinou AI.',
  errNotConnected:
    'Není připojena žádná AI. Nejprve připojte předplatné Claude nebo Codex, nebo bezplatnou AI.',
  errNotInstalled: 'Program {provider} nebyl na tomto počítači nalezen.',
  errSignedOut: 'Přihlášení k {provider} vypršelo. Přihlaste se znovu a pokračujte.',
  errRateLimit: 'Limit předplatného {provider} je vyčerpán.',
  errRateLimitReset: 'Limit předplatného {provider} je vyčerpán. Obnoví se v {time}.',
  errUnsafeTools:
    'Program {provider} se spustil se zapnutými vlastními nástroji, proto byl běh z bezpečnostních důvodů zastaven.',
  errMeteredNotAccepted:
    'Připojení {provider} se účtuje podle spotřeby a zatím jste ho nepovolili. Chcete-li ho používat, zvolte v nastavení připojení „Přesto použít“.',
  errNeedsUpdate:
    'Program {provider} je pro tuto funkci příliš starý. Aktualizujte ho a zkuste to znovu.',
  errHeadlessLimit: 'Byl dosažen hodinový limit automatických požadavků.',
  errHeadlessLimitReset:
    'Byl dosažen hodinový limit automatických požadavků. Znovu budou možné v {time}.',
  connectFreeHint: 'Nemáte předplatné? V Nastavení můžete bezplatnou AI připojit zhruba za minutu.',
  actionConnectFree: 'Připojit bezplatnou AI',
  errFreeLimit:
    'Dnešní bezplatný limit je vyčerpán. Zkuste to zítra, nebo v Nastavení zvolte jinou AI.',
  errFreeLimitReset: 'Dnešní bezplatný limit je vyčerpán. Znovu ho můžete použít v {time}.',
  continueWith: 'Pokračovat s {provider}',
  continueMeteredNote:
    'Připojení {provider} není předplatné: pokračování se účtuje podle spotřeby.',
  usageLine: 'Využito {percent} % · obnoví se v {time}',
  usageWindowFiveHour: '5hodinový limit',
  usageWindowSevenDay: '7denní limit',
  noticeTitle: 'Než začnete AI používat s předplatným',
  noticeSend:
    'Obsah dokumentu a konverzace se odesílají společnosti Anthropic nebo OpenAI pod vaším vlastním účtem. Každý požadavek nese také název, nadpis a popis každé dovednosti s nastavením „Rozhoduje AI“; odesílají se také použité dovednosti a soubory dovedností, které AI přečte.',
  noticeTraining:
    'Zda se tento obsah použije k trénování AI, určuje nastavení vašeho účtu u dané společnosti.',
  noticeCodexHistory:
    'Tato aplikace vypíná ukládání historie konverzací v Codexu, Codex však může v tomto počítači dál uchovávat vlastní diagnostické protokoly.',
  noticePdfWholeDocument:
    'V editoru PDF mohou čtení stránek pomocí AI a překlad dokumentu odesílat obrázky stránek a celý text dokumentu.',
  noticeAck: 'Rozumím',
  codexNotice:
    'Používání předplatného Codex uvnitř aplikace není způsob, který OpenAI oficiálně doporučuje.',
  truncatedNotice: 'Vstup byl příliš dlouhý, proto byla jeho část před odesláním oříznuta.',
  pickerAuto: 'Automaticky',
  pickerAutoUsing: 'Automaticky · {provider}',
  pickerAutoUsingModel: 'Automaticky · {provider} · {model}',
  pickerDefaultModel: 'Výchozí model',
  pickerDefaultModelNamed: 'Výchozí model · {model}',
  pickerSubscription: 'Předplatné',
  pickerPaid: 'Placené',
  pickerPaidTitle: 'Účtováno podle spotřeby, nekryje to předplatné',
  pickerNotConnected: 'Připojit AI',
  guideQuestion: 'Jakou AI už používáte?',
  guidePathClaudeTitle: 'Mám placené předplatné Claude',
  guidePathClaudeBody: 'Je potřeba tarif Pro nebo Max. Bezplatný účet Claude se připojit nedá.',
  guidePathCodexTitle: 'Používám ChatGPT',
  guidePathCodexBody:
    'Přihlaste se účtem ChatGPT do programu Codex společnosti OpenAI. Bezplatný tarif umožňuje jen malé využití.',
  guidePathFreeTitle: 'Zatím žádnou',
  guidePathFreeBody:
    'Bezplatnou AI připojíte zhruba za minutu. Dokud ji používáte zdarma, může společnost odeslaný obsah využít ke zlepšení své AI.',
  guideBack: 'Zvolit jiný způsob',
  guideBadgeReady: 'Připojeno',
  guideBadgeInstalled: 'Nainstalováno',
  guideBadgeCheck: 'Ke kontrole',
  guideStepsLabel: 'Kroky připojení',
  stepInstall: 'Instalace programu',
  stepLogin: 'Přihlášení',
  stepReady: 'Připojeno',
  installReturnNote:
    'Až instalace v tom okně skončí, vraťte se sem. Aplikace to sama zkontroluje znovu.',
  loginHowNote:
    'Po kliknutí se otevře prohlížeč. Přihlaste se účtem {vendor} a klikněte na Povolit; připojení se dokončí samo.',
  signingInStalledNote:
    'Pokud se v prohlížeči neotevřela přihlašovací stránka, otevřete přihlašovací okno tlačítkem níže. Pokud se v prohlížeči ještě přihlašujete, dokončete přihlášení tam a tlačítko nepoužívejte: zastaví rozpracované přihlášení a začne znovu od začátku.',
  actionLoginWindowOpen: 'Otevřít přihlašovací okno',
  loginWindowTitle: 'Přihlášení k {provider}',
  loginWindowIntro:
    'Toto je přihlašovací okno programu {provider}. Anglický text níže vypisuje program {provider}.',
  loginWindowStepBrowser:
    'Až se v prohlížeči otevře přihlašovací stránka {vendor}, přihlaste se a povolte přístup. Toto okno se pak samo zavře.',
  loginWindowStepAddress:
    'Pokud se prohlížeč neotevřel, označte myší adresu níže, která začíná na https://, a zkopírujte ji kliknutím pravým tlačítkem myši. Vložte ji do adresního řádku prohlížeče a otevře se přihlašovací stránka.',
  loginWindowStepCode:
    'Pokud prohlížeč po přihlášení zobrazí kód, zkopírujte celý kód (pokud je u něj tlačítko pro kopírování, použijte ho). Vložte ho do tohoto okna jedním kliknutím pravým tlačítkem myši a stiskněte Enter. Je normální, že se vložený kód nezobrazí.',
  loginWindowStepInvalid:
    'Pokud se zobrazí "Invalid code", kód se nezkopíroval celý. Okno nezavírejte, zkopírujte kód znovu a vložte ho.',
  loginWindowClosing:
    'Přihlášení nebylo dokončeno. Až si přečtete zprávy výše, stiskněte Enter a toto okno se zavře. Chcete-li to zkusit znovu, stiskněte znovu tlačítko pro přihlášení.',
  actionCancelLogin: 'Zrušit přihlášení',
  actionUpdate: 'Aktualizovat',
  updateNote:
    'Po kliknutí se v novém okně spustí oficiální aktualizace společnosti {vendor}. Až tam skončí, vraťte se sem.',
  guideInfoHint:
    'Pořád to nejde? Zkopírujte informace o připojení a pošlete je tomu, kdo vám pomáhá. Neobsahují účet ani cesty k souborům.',
  actionCopyInfo: 'Kopírovat informace pro pomoc',
  copyInfoDone: 'Zkopírováno',
  actionConnectHelp: 'Zobrazit každý krok na obrazovce (stránka v korejštině)',
} satisfies Record<keyof typeof zh, string>
