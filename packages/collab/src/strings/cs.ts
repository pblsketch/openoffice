import type { zh } from './zh'

export const cs = {
  button: 'Spolupráce',
  dialogTitle: 'Spolupráce',
  tabShare: 'Sdílet tento dokument',
  tabJoin: 'Připojit se',
  nameLabel: 'Moje jméno',
  nameHint: 'Zobrazuje se ostatním na obrazovce vedle vašeho kurzoru.',
  colorLabel: 'Moje barva',
  colorChoice: 'Barva {n}',
  shareIntro:
    'Lidé ve stejné síti (LAN) mohou po zadání PIN kódu tento dokument zobrazit a upravovat společně s vámi. Soubor se ukládá pouze na tomto počítači.',
  shareStart: 'Zahájit sdílení',
  shareStarting: 'Spouštění…',
  shareStop: 'Ukončit sdílení',
  pinLabel: 'PIN',
  pinNew: 'Nový PIN',
  pinChanged:
    'Bylo zadáno příliš mnoho nesprávných PIN kódů, proto byl PIN nahrazen novým. Lidé, kteří se již připojili, zůstávají.',
  addressLabel: 'Adresa tohoto počítače',
  peopleLabel: 'Účastníci',
  nobodyYet: 'Zatím se nikdo nepřipojil.',
  you: 'vy',
  hostBadge: 'sdílí',
  joinIntro:
    'Zadejte PIN, který vám dala sdílející osoba. Vyberte dokument nalezený v této síti, nebo zadejte adresu.',
  searching: 'Hledání sdílených dokumentů v této síti…',
  foundLabel: 'Nalezeno',
  foundBy: 'sdílí {name}',
  addressInput: 'Adresa',
  addressPlaceholder: 'např. 192.168.0.12',
  pinInput: 'PIN (6 číslic)',
  join: 'Připojit se',
  joining: 'Připojování…',
  close: 'Zavřít',
  leave: 'Odejít',
  errPin: 'Tento PIN není správný.',
  errLocked:
    'Příliš mnoho nesprávných PIN kódů. Z tohoto počítače to 10 minut nepůjde zkusit znovu.',
  errFull: 'Tato relace je plná.',
  errVersion:
    'Na druhém počítači běží jiná verze aplikace. Aktualizujte oba počítače na stejnou verzi.',
  errUnreachable:
    'K této adrese se nepodařilo připojit. Zkontrolujte adresu, síť a bránu firewall sdílejícího počítače.',
  errTimeout: 'Sdílející počítač neodpovídá.',
  errInvalid: 'Zkontrolujte adresu a PIN.',
  errUnavailable: 'Tento dokument se na tomto počítači nepodařilo otevřít.',
  errShareNetwork:
    'Sdílení se na tomto počítači nepodařilo spustit. Zkontrolujte, zda síť neblokuje jiný program.',
  errShareTooLarge: 'Tento dokument je příliš velký na sdílení.',
  errShareBusy: 'Tato karta už je v relaci.',
  errShareSaveFirst: 'Máte neuložené změny. Nejprve je uložte a potom sdílejte.',
  errShareEncrypted: 'Dokument chráněný heslem nelze sdílet.',
  errShareUnsupported: 'Tento dokument teď nelze sdílet.',
  endedByHost:
    'Sdílející osoba relaci ukončila. Tento dokument je teď neuložená kopie na tomto počítači.',
  endedLost:
    'Spojení se sdílejícím počítačem bylo přerušeno. Tento dokument je teď neuložená kopie na tomto počítači.',
  endedLeft: 'Opustili jste relaci. Tento dokument je teď neuložená kopie na tomto počítači.',
  endedHostStopped: 'Sdílení bylo ukončeno.',
  guestSaveBlocked: 'Během relace soubor ukládá sdílející osoba.',
  guestBlocked: 'Tato funkce není během relace k dispozici.',
  hostBlocked: 'Tato funkce není k dispozici, dokud jsou v relaci další lidé.',
  viewOnly:
    'V tomto formátu může upravovat jen sdílející osoba; ostatní účastníci sledují změny živě.',
  lanNotice:
    'Přenášený obsah je šifrovaný, takže ho mohou číst jen ti, kdo zadali PIN. Během sdílení je vaše jméno a název dokumentu viditelný v síti.',
  firewallHint:
    'Pokud se při prvním sdílení zeptá brána Windows Firewall, povolte přístup v privátních sítích.',
  statusHosting: 'Sdílení · {count}',
  statusGuest: 'V dokumentu uživatele {name}',
  dismiss: 'Rozumím',
} satisfies Record<keyof typeof zh, string>
