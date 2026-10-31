import type { zh } from './zh'

export const pt = {
  windowTitle: 'Agente',
  homeCardSub: 'Trabalhe em uma pasta com Claude Code ou Codex',
  intro:
    'O agente executa o seu Claude Code ou Codex em uma pasta que você escolher. Ele pode ler os arquivos dessa pasta, criar novos, usar suas habilidades, executar scripts e alterar documentos abertos no GenOffice.',
  folderLabel: 'Pasta do projeto',
  folderPick: 'Escolher uma pasta…',
  folderNone: 'Nenhuma pasta escolhida',
  recentLabel: 'Pastas recentes',
  providerLabel: 'Programa',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'No Windows, os comandos que você permite são executados sem isolamento e podem acessar todo o seu PC e a internet.',
  providerCodexNote:
    'Os comandos são executados no espaço isolado do Codex: só a pasta do projeto pode ser alterada, e não há acesso à internet.',
  providerBlocked:
    'Ainda não disponível: ainda não é possível impedir que o Codex leia o próprio arquivo de login.',
  connChecking: 'Verificando a conexão…',
  connUnavailable: 'Não conectado. Faça login em Configurações → IA.',
  connMetered: 'Conectado com um login de pagamento por uso que você aceitou.',
  modeLabel: 'Quando perguntar a você',
  modeAskCommands: 'Perguntar antes de cada comando',
  modeAskCommandsDesc:
    'Ler e gravar arquivos na pasta do projeto acontece direto. Antes de executar um comando ou script, o agente pergunta.',
  modeAskWrites: 'Perguntar antes de gravar e de executar comandos',
  modeAskWritesDesc:
    'Só a leitura acontece direto. Antes de gravar um arquivo e antes de executar um comando, o agente pergunta.',
  modeTrust: 'Confiar neste projeto',
  modeTrustDesc:
    'Nada é perguntado. O Codex continua no seu espaço isolado; no Claude Code, o próprio revisor dele verifica cada ação no seu lugar.',
  warningTitle: 'Antes de começar',
  warningCommands:
    'Os comandos que o agente executa podem alterar arquivos e usar a internet. Um documento que alguém enviou a você pode conter instruções ocultas.',
  warningRedaction:
    'As partes que você ocultou da AI só ficam ocultas nos documentos abertos no GenOffice. Os arquivos que o agente lê da pasta são enviados como estão.',
  warningUsage:
    'Um agente trabalha em muitas etapas e usa mais da sua assinatura do que o painel de AI.',
  warningAccept: 'Entendi',
  start: 'Iniciar',
  starting: 'Iniciando…',
  stop: 'Parar',
  newSession: 'Nova sessão',
  send: 'Enviar',
  inputPlaceholder: 'O que o agente deve fazer?',
  you: 'Você',
  agent: 'Agente',
  startedLine: '{program} iniciado em {folder}',
  skillsLine: '{n} habilidades disponíveis',
  skillsLineOne: '{n} habilidade disponível',
  toolRunning: 'Em andamento',
  toolDone: 'Concluído',
  toolFailed: 'Falhou',
  toolDenied: 'Recusado',
  actRead: 'Ler',
  actWrite: 'Gravar',
  actCommand: 'Executar',
  actAppTool: 'Editar um documento aberto',
  actSkill: 'Usar uma habilidade',
  actOther: 'Usar uma ferramenta',
  openFile: 'Abrir',
  permTitle: 'O agente pede permissão para:',
  permCommand: 'Executar este comando',
  permWrite: 'Gravar este arquivo',
  permRead: 'Ler um arquivo fora da pasta do projeto',
  permOther: 'Usar a ferramenta “{tool}”',
  permReason: 'Motivo: {reason}',
  permAllow: 'Permitir',
  permDeny: 'Recusar',
  turnFailed: 'O agente não conseguiu concluir este pedido.',
  ended: 'A sessão terminou.',
  errBadFolder:
    'Esta pasta não pode ser usada. Escolha uma pasta com o seu próprio trabalho: não uma unidade inteira, nem a sua pasta pessoal, nem uma pasta de dados de login ou de aplicativos.',
  errNotConnected:
    'Este programa não está conectado. Faça login em Configurações → IA e tente novamente.',
  errNotAccepted: 'Leia as observações acima e confirme-as primeiro.',
  errUnsafeTools:
    'O programa foi iniciado com ferramentas que o aplicativo não forneceu, por isso foi parado.',
  errRateLimit: 'O limite da sua assinatura acabou. Tente novamente mais tarde.',
  errSignedOut: 'O programa está desconectado. Faça login em Configurações → IA.',
  errMetered: 'O programa está conectado com um login de pagamento por uso que você não aceitou.',
  errSandboxUnavailable:
    'O Codex não consegue abrir neste PC a área isolada que contém os seus comandos, por isso não foi iniciado. Atualize o Windows ou escolha o Claude Code.',
  errNeedsUpdate: 'O programa é antigo demais para o modo agente. Atualize-o e tente novamente.',
  errNotInstalled: 'O programa não está instalado.',
  errGeneric: 'Algo deu errado. Tente novamente.',
  documentsUnprotected:
    'Os documentos abertos depois do início da sessão ({n}) ficam fora da proteção de escrita do programa. Pare e inicie a sessão novamente para protegê-los.',
} satisfies Record<keyof typeof zh, string>
