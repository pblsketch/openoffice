import type { zh } from './zh'

export const cs = {
  windowTitle: 'Agent',
  homeCardSub: 'Práce ve složce s Claude Code nebo Codex',
  intro:
    'Agent spouští váš Claude Code nebo Codex ve složce, kterou si vyberete. Může číst soubory v ní, vytvářet nové, používat vaše dovednosti, spouštět skripty a měnit dokumenty otevřené v GenOffice.',
  folderLabel: 'Složka projektu',
  folderPick: 'Vybrat složku…',
  folderNone: 'Není vybrána žádná složka',
  recentLabel: 'Nedávné složky',
  providerLabel: 'Program',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Ve Windows běží příkazy, které povolíte, bez izolace a mají přístup k celému počítači i k internetu.',
  providerCodexNote:
    'Příkazy běží v izolovaném prostoru programu Codex: zapisovat lze jen do složky projektu a internet není k dispozici.',
  providerBlocked:
    'Zatím nedostupné: Codexu zatím nelze zabránit ve čtení vlastního přihlašovacího souboru.',
  connChecking: 'Kontroluje se připojení…',
  connUnavailable: 'Nepřipojeno. Přihlaste se v Nastavení → AI.',
  connMetered: 'Přihlášeno placeným přihlášením podle spotřeby, které jste přijali.',
  modeLabel: 'Kdy se vás ptát',
  modeAskCommands: 'Ptát se před každým příkazem',
  modeAskCommandsDesc:
    'Čtení a zápis souborů ve složce projektu proběhne hned. Před spuštěním příkazu nebo skriptu se agent zeptá.',
  modeAskWrites: 'Ptát se před zápisem a příkazy',
  modeAskWritesDesc:
    'Hned proběhne jen čtení. Před zápisem souboru i před spuštěním příkazu se agent zeptá.',
  modeTrust: 'Důvěřovat tomuto projektu',
  modeTrustDesc:
    'Na nic se neptá. Codex přesto zůstává ve svém izolovaném prostoru; u Claude Code kontroluje každou akci místo vás jeho vlastní kontrolor.',
  warningTitle: 'Než začnete',
  warningCommands:
    'Příkazy, které agent spouští, mohou měnit soubory a používat internet. Dokument, který vám někdo poslal, může obsahovat skryté pokyny.',
  warningRedaction:
    'Části skryté před AI zůstávají skryté jen v dokumentech otevřených v GenOffice. Soubory, které agent čte ze složky, se odesílají tak, jak jsou.',
  warningUsage:
    'Agent pracuje v mnoha krocích a spotřebuje víc z vašeho předplatného než panel AI.',
  warningAccept: 'Rozumím',
  start: 'Spustit',
  starting: 'Spouští se…',
  stop: 'Zastavit',
  newSession: 'Nová relace',
  send: 'Odeslat',
  inputPlaceholder: 'Co má agent udělat?',
  you: 'Vy',
  agent: 'Agent',
  startedLine: '{program} spuštěn ve složce {folder}',
  skillsLine: 'Dostupné dovednosti: {n}',
  skillsLineOne: 'Dostupná {n} dovednost',
  toolRunning: 'Probíhá',
  toolDone: 'Hotovo',
  toolFailed: 'Nezdařilo se',
  toolDenied: 'Odmítnuto',
  actRead: 'Čtení',
  actWrite: 'Zápis',
  actCommand: 'Spuštění',
  actAppTool: 'Úprava otevřeného dokumentu',
  actSkill: 'Použití dovednosti',
  actOther: 'Použití nástroje',
  openFile: 'Otevřít',
  permTitle: 'Agent žádá o svolení:',
  permCommand: 'Spustit tento příkaz',
  permWrite: 'Zapsat do tohoto souboru',
  permRead: 'Číst soubor mimo složku projektu',
  permOther: 'Použít nástroj „{tool}“',
  permReason: 'Důvod: {reason}',
  permAllow: 'Povolit',
  permDeny: 'Odmítnout',
  turnFailed: 'Agent tento požadavek nedokončil.',
  ended: 'Relace skončila.',
  errBadFolder:
    'Tuto složku nelze použít. Vyberte složku s vlastní prací: ne celý disk, ne domovskou složku a ne složku s přihlašovacími nebo aplikačními daty.',
  errNotConnected: 'Tento program není připojen. Přihlaste se v Nastavení → AI a zkuste to znovu.',
  errNotAccepted: 'Nejprve si přečtěte upozornění výše a potvrďte je.',
  errUnsafeTools: 'Program se spustil s nástroji, které mu aplikace nedala, a proto byl zastaven.',
  errRateLimit: 'Limit předplatného je vyčerpán. Zkuste to později.',
  errSignedOut: 'Program je odhlášen. Přihlaste se v Nastavení → AI.',
  errMetered: 'Program je přihlášen placeným přihlášením podle spotřeby, které jste nepřijali.',
  errSandboxUnavailable:
    'Codex na tomto počítači nemůže otevřít izolované prostředí pro své příkazy, a proto se nespustil. Aktualizujte Windows, nebo zvolte Claude Code.',
  errNeedsUpdate: 'Program je pro režim agenta příliš starý. Aktualizujte ho a zkuste to znovu.',
  errNotInstalled: 'Program není nainstalován.',
  errGeneric: 'Něco se pokazilo. Zkuste to znovu.',
  documentsUnprotected:
    'Dokumenty otevřené po spuštění relace ({n}) nejsou chráněny vlastní ochranou programu proti zápisu. Zastavte a znovu spusťte relaci, abyste je ochránili.',
} satisfies Record<keyof typeof zh, string>
