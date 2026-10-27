import type { zh } from './zh'

export const pt = {
  button: 'Colaborar',
  dialogTitle: 'Colaborar',
  tabShare: 'Compartilhar este documento',
  tabJoin: 'Participar',
  nameLabel: 'Meu nome',
  nameHint: 'Aparece ao lado do seu cursor na tela das outras pessoas.',
  colorLabel: 'Minha cor',
  colorChoice: 'Cor {n}',
  shareIntro:
    'Pessoas na mesma rede (LAN) podem ver e editar este documento com você depois de digitar o PIN. O arquivo é salvo somente neste PC.',
  shareStart: 'Começar a compartilhar',
  shareStarting: 'Iniciando…',
  shareStop: 'Parar de compartilhar',
  pinLabel: 'PIN',
  pinNew: 'Novo PIN',
  pinChanged:
    'Houve muitas tentativas com PIN errado, então o PIN foi trocado. Quem já entrou continua na sessão.',
  addressLabel: 'Endereço deste PC',
  peopleLabel: 'Participantes',
  nobodyYet: 'Ninguém entrou ainda.',
  you: 'você',
  hostBadge: 'compartilhando',
  joinIntro:
    'Digite o PIN que a pessoa que está compartilhando passou para você. Escolha um documento encontrado nesta rede ou digite o endereço.',
  searching: 'Procurando documentos compartilhados nesta rede…',
  foundLabel: 'Encontrados',
  foundBy: 'compartilhado por {name}',
  addressInput: 'Endereço',
  addressPlaceholder: 'ex.: 192.168.0.12',
  pinInput: 'PIN (6 dígitos)',
  join: 'Participar',
  joining: 'Conectando…',
  close: 'Fechar',
  leave: 'Sair',
  errPin: 'Esse PIN não está correto.',
  errLocked: 'Muitas tentativas com PIN errado. Este PC não pode tentar novamente por 10 minutos.',
  errFull: 'Esta sessão está lotada.',
  errVersion:
    'O outro PC usa uma versão diferente do aplicativo. Atualize os dois PCs para a mesma versão.',
  errUnreachable:
    'Não foi possível conectar a esse endereço. Verifique o endereço, a rede e o firewall do PC que está compartilhando.',
  errTimeout: 'O PC que está compartilhando não está respondendo.',
  errInvalid: 'Verifique o endereço e o PIN.',
  errUnavailable: 'Não foi possível abrir este documento neste PC.',
  errShareNetwork:
    'Não foi possível começar a compartilhar neste PC. Verifique se outro programa está bloqueando a rede.',
  errShareTooLarge: 'Este documento é grande demais para ser compartilhado.',
  errShareBusy: 'Esta guia já está em uma sessão.',
  errShareSaveFirst: 'Há alterações não salvas. Salve primeiro e depois compartilhe.',
  errShareEncrypted: 'Não é possível compartilhar um documento protegido por senha.',
  errShareUnsupported: 'Não é possível compartilhar este documento agora.',
  endedByHost:
    'A pessoa que estava compartilhando encerrou a sessão. Este documento agora é uma cópia não salva neste PC.',
  endedLost:
    'A conexão com o PC que estava compartilhando foi perdida. Este documento agora é uma cópia não salva neste PC.',
  endedLeft: 'Você saiu da sessão. Este documento agora é uma cópia não salva neste PC.',
  endedHostStopped: 'O compartilhamento foi interrompido.',
  guestSaveBlocked: 'Durante uma sessão, quem salva o arquivo é a pessoa que está compartilhando.',
  guestBlocked: 'Este recurso não está disponível durante uma sessão.',
  hostBlocked: 'Este recurso não está disponível enquanto houver outras pessoas na sessão.',
  viewOnly:
    'Neste formato, só a pessoa que está compartilhando edita; quem participa acompanha ao vivo.',
  lanNotice:
    'O que é trocado é criptografado, então só quem digitar o PIN pode ler. Enquanto você compartilha, seu nome e o título do documento ficam visíveis na rede.',
  firewallHint:
    'Se o Firewall do Windows perguntar na primeira vez que você compartilhar, permita o acesso em redes privadas.',
  statusHosting: 'Compartilhando · {count}',
  statusGuest: 'No documento de {name}',
  dismiss: 'Entendi',
} satisfies Record<keyof typeof zh, string>
