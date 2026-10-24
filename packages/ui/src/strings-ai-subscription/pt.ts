import type { zh } from './zh'

export const pt = {
  aiAssistant: 'Assistente de IA',
  cardChecking: 'Verificando…',
  cardNotInstalled: 'Não instalado',
  cardSignedOut: 'Sem login',
  cardSigningIn: 'Entrando…',
  cardReady: 'Conectado',
  cardReadyPlan: 'Conectado · {plan}',
  cardMetered: 'Login feito, mas não com uma assinatura',
  cardMeteredAccepted: 'Em uso · cobrado por consumo',
  cardError: 'Não foi possível verificar a conexão',
  cardErrNeedsUpdate:
    'O programa {provider} neste PC é antigo demais. Atualize-o e verifique novamente.',
  cardErrNeedsUpdateVersion:
    'O programa {provider} neste PC ({version}) é antigo demais; é necessária a versão {minimum} ou mais recente. Execute {command} em um terminal e verifique novamente.',
  cardErrNeedsUpdatePath: 'Arquivo que este aplicativo executa:',
  cardErrNeedsUpdateWindows:
    'Atualizar o {provider} dentro do WSL (Ubuntu) ou em outra pasta não altera este arquivo. Execute {command} no Windows PowerShell.',
  cardErrTimeout: 'O programa {provider} não respondeu a tempo. Verifique novamente em instantes.',
  cardErrFailed: 'Algo deu errado ao verificar {provider}. Verifique novamente.',
  actionInstall: 'Instalar',
  actionLogin: 'Entrar',
  actionLoginWindow: 'O navegador não abriu?',
  actionRecheck: 'Verificar novamente',
  actionAcceptMetered: 'Usar mesmo assim',
  actionInstallHelp: 'Guia oficial de instalação',
  actionOpenSettings: 'Abrir configurações',
  actionDismiss: 'Fechar',
  actionSwitchAccount: 'Entrar com outra conta',
  actionLogout: 'Sair',
  installNote:
    'O comando oficial de instalação da {vendor} é executado em uma nova janela de terminal.',
  loginNote: 'A página de login que se abre é da própria {vendor}.',
  signingInBrowserNote:
    'Entre na sua conta da {vendor} no navegador que abriu e permita o acesso. A conexão é feita sozinha quando você terminar.',
  signingInWindowNote:
    'Siga as instruções no topo da janela de login que acabou de abrir. Entre na página de login da {vendor} que abriu no navegador: a janela fecha sozinha e a conexão é concluída. Uma página de login que já estava aberta antes não funciona mais; feche-a.',
  meteredWarning: 'Isto não é uma assinatura: você paga pelo que usar.',
  meteredMeaning:
    'Este login usa uma chave de API ou uma conta de pagamento por consumo, ou não foi possível confirmar o tipo. “Usar mesmo assim” permite que a IA funcione com esta conexão, e cada solicitação é cobrada dessa conta.',
  connectTitle: 'Conecte uma IA para começar',
  connectBody:
    'A IA funciona com a assinatura do Claude ou do Codex que você já tem. Nenhuma chave de API é necessária.',
  connectProviderTitle: 'A conexão {provider} não pode ser usada agora',
  connectKeyBody:
    'A configuração de {provider} não foi concluída. Conclua-a nas Configurações ou escolha outra IA.',
  errNotConnected:
    'Nenhuma IA está conectada. Conecte primeiro uma assinatura do Claude ou do Codex, ou uma IA gratuita.',
  errNotInstalled: 'O programa {provider} não foi encontrado neste PC.',
  errSignedOut: 'O login em {provider} expirou. Entre novamente para continuar.',
  errRateLimit: 'O limite da assinatura {provider} foi atingido.',
  errRateLimitReset:
    'O limite da assinatura {provider} foi atingido. Ele será redefinido às {time}.',
  errUnsafeTools:
    'O programa {provider} foi iniciado com as próprias ferramentas ativadas, então a execução foi interrompida por segurança.',
  errMeteredNotAccepted:
    'A conexão {provider} é cobrada por consumo e você ainda não a permitiu. Escolha “Usar mesmo assim” nas configurações de conexão para usá-la.',
  errNeedsUpdate:
    'O programa {provider} é antigo demais para este recurso. Atualize-o e tente novamente.',
  errHeadlessLimit: 'O limite por hora de solicitações automáticas foi atingido.',
  errHeadlessLimitReset:
    'O limite por hora de solicitações automáticas foi atingido. Elas voltam a ser possíveis às {time}.',
  connectFreeHint:
    'Não tem assinatura? Você pode conectar uma IA gratuita nas Configurações em cerca de um minuto.',
  actionConnectFree: 'Conectar uma IA gratuita',
  errFreeLimit:
    'O uso gratuito de hoje acabou. Tente novamente amanhã ou escolha outra IA nas Configurações.',
  errFreeLimitReset: 'O uso gratuito de hoje acabou. Você poderá usá-lo novamente às {time}.',
  continueWith: 'Continuar com {provider}',
  continueMeteredNote:
    'A conexão {provider} não é uma assinatura: continuar é cobrado por consumo.',
  usageLine: '{percent}% usado · redefine às {time}',
  usageWindowFiveHour: 'Limite de 5 horas',
  usageWindowSevenDay: 'Limite de 7 dias',
  noticeTitle: 'Antes de usar a IA com a sua assinatura',
  noticeSend:
    'O conteúdo do documento e a sua conversa são enviados à Anthropic ou à OpenAI pela sua própria conta. Cada solicitação leva também o nome, o título e a descrição de cada habilidade configurada como “A IA decide”; também são enviadas as habilidades em uso e os arquivos de habilidade que a IA lê.',
  noticeTraining:
    'Se esse conteúdo é usado para treinar IA depende das configurações da sua própria conta nessa empresa.',
  noticeCodexHistory:
    'Este aplicativo desativa o salvamento do histórico de conversas do Codex, mas o Codex ainda pode manter seus próprios registros de diagnóstico neste PC.',
  noticePdfWholeDocument:
    'No editor de PDF, a leitura de páginas com IA e a tradução de documentos podem enviar imagens das páginas e todo o texto do documento.',
  noticeAck: 'Entendi',
  codexNotice:
    'Usar uma assinatura do Codex dentro de um aplicativo não é um método oficialmente recomendado pela OpenAI.',
  truncatedNotice: 'A entrada era longa demais, então parte dela foi cortada antes do envio.',
  pickerAuto: 'Automático',
  pickerAutoUsing: 'Automático · {provider}',
  pickerAutoUsingModel: 'Automático · {provider} · {model}',
  pickerDefaultModel: 'Modelo padrão',
  pickerDefaultModelNamed: 'Modelo padrão · {model}',
  pickerSubscription: 'Assinatura',
  pickerPaid: 'Pago',
  pickerPaidTitle: 'Cobrado por consumo, não coberto por assinatura',
  pickerNotConnected: 'Conectar IA',
  guideQuestion: 'Qual IA você já usa?',
  guidePathClaudeTitle: 'Tenho uma assinatura paga do Claude',
  guidePathClaudeBody:
    'É preciso ter um plano Pro ou Max. Uma conta gratuita do Claude não consegue se conectar.',
  guidePathCodexTitle: 'Uso o ChatGPT',
  guidePathCodexBody:
    'Entre no programa Codex da OpenAI com sua conta do ChatGPT. O plano gratuito permite pouco uso.',
  guidePathFreeTitle: 'Nenhuma ainda',
  guidePathFreeBody:
    'Conecte uma IA gratuita em cerca de um minuto. Enquanto você usa de graça, o que você envia pode ser usado para melhorar a IA dessa empresa.',
  guideBack: 'Escolher outra forma',
  guideBadgeReady: 'Conectado',
  guideBadgeInstalled: 'Instalado',
  guideBadgeCheck: 'Verificar',
  guideStepsLabel: 'Etapas da conexão',
  stepInstall: 'Instalar o programa',
  stepLogin: 'Entrar',
  stepReady: 'Conectado',
  installReturnNote:
    'Quando a instalação terminar naquela janela, volte para cá. O app verifica de novo sozinho.',
  loginHowNote:
    'Ao clicar, um navegador se abre. Entre com sua conta da {vendor} e clique em Permitir; a conexão é concluída sozinha.',
  signingInStalledNote:
    'Se nenhuma página de login abriu no navegador, abra a janela de login com o botão abaixo. Se você ainda está entrando pelo navegador, termine por lá: o botão interrompe esse login e recomeça do início.',
  actionLoginWindowOpen: 'Abrir a janela de login',
  loginWindowTitle: 'Login em {provider}',
  loginWindowIntro:
    'Esta é a janela de login do programa {provider}. O texto em inglês abaixo vem do programa {provider}.',
  loginWindowStepBrowser:
    'Quando a página de login da {vendor} abrir no navegador, entre e permita o acesso. Depois, esta janela fecha sozinha.',
  loginWindowStepAddress:
    'Se nenhum navegador abriu, arraste o mouse sobre o endereço abaixo que começa com https:// para selecioná-lo e clique com o botão direito para copiá-lo. Cole-o na barra de endereços do navegador para abrir a página de login.',
  loginWindowStepCode:
    'Se o navegador mostrar um código depois que você entrar, copie o código inteiro (use o botão de copiar, se houver). Clique uma vez com o botão direito dentro desta janela para colá-lo e pressione Enter. É normal que o código colado não apareça.',
  loginWindowStepInvalid:
    'Se aparecer "Invalid code", o código não foi copiado por inteiro. Não feche esta janela, copie o código de novo e cole-o.',
  loginWindowClosing:
    'O login não foi concluído. Depois de ler as mensagens acima, pressione Enter para fechar esta janela. Para tentar de novo, clique outra vez no botão de login.',
  actionCancelLogin: 'Cancelar login',
  actionUpdate: 'Atualizar',
  updateNote:
    'Ao clicar, a atualização oficial da {vendor} é executada em uma nova janela. Quando terminar lá, volte para cá.',
  guideInfoHint:
    'Ainda não funciona? Copie as informações da conexão e envie para quem está ajudando você. Elas não incluem conta nem caminhos de arquivos.',
  actionCopyInfo: 'Copiar informações para ajuda',
  copyInfoDone: 'Copiado',
  actionConnectHelp: 'Ver cada passo na tela (página em coreano)',
} satisfies Record<keyof typeof zh, string>
