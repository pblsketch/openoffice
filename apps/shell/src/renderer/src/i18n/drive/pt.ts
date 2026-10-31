import type { zh } from './zh'

export const pt = {
  driveNav: 'Google Drive',
  driveDesc:
    'Escolha arquivos no Google Drive, depois abra e edite no GenOffice; ao salvar, eles voltam para o Drive. O GenOffice só pode abrir os arquivos que você escolher.',
  driveConnect: 'Conectar o Google Drive',
  driveConnecting: 'Entre na sua conta Google no navegador e permita o acesso…',
  driveCancel: 'Cancelar',
  driveConnectedAs: 'Conectado como {email}',
  driveDisconnect: 'Desconectar',
  driveDisconnectConfirm:
    'Isso remove o login do Drive deste PC e pede ao Google que revogue o acesso do GenOffice. As cópias que já estão neste PC permanecem.',
  driveDisconnectYes: 'Desconectar',
  driveNotPersisted:
    'Este PC não consegue guardar o login criptografado, então a conexão termina quando você fecha o aplicativo.',
  driveExpired:
    'O Google encerrou a conexão: o acesso foi removido ou o login expirou. Conecte novamente.',
  driveAiAccess: 'Deixar a IA encontrar e ler arquivos no Drive',
  driveAiAccessDesc:
    'Quando ativado, a IA dos editores pode pesquisar e ler os arquivos do Drive que você escolheu aqui. O que ela lê vai para o provedor de IA que você usa. A IA não pode alterar, excluir nem compartilhar arquivos do Drive.',
  drivePrivacy:
    'Listas e conteúdo de arquivos trafegam apenas entre este PC e o Google. Nunca passam por um servidor dos criadores do GenOffice.',
  driveFailDenied: 'A conexão não foi feita porque o Google não a permitiu.',
  driveFailScope:
    'A conexão não foi feita porque o acesso ao Drive não foi marcado. Conecte novamente e marque o item do Drive.',
  driveFailTimeout: 'O login não terminou em 10 minutos. Tente novamente.',
  driveFailNetwork:
    'Não foi possível acessar o Google. Verifique sua conexão com a internet e tente novamente.',
  driveRecent: 'Arquivos escolhidos',
  driveSearchPlaceholder: 'Pesquisar nos arquivos escolhidos',
  driveSearchResults: 'Resultados para “{q}”',
  driveRefresh: 'Atualizar',
  driveNotConnectedTitle: 'O Google Drive não está conectado',
  driveNotConnectedBody:
    'Depois de conectar, você pode escolher arquivos do Drive, abrir e editar aqui, e ao salvar eles voltam para o Drive.',
  driveOpenSettings: 'Conectar nas Configurações',
  driveEmpty: 'Nenhum arquivo ainda. Clique em “Escolher no Google Drive” para selecionar alguns.',
  driveLoading: 'Carregando…',
  driveLoadMore: 'Mostrar mais',
  driveOpening: 'Abrindo…',
  driveGoogleBadge: 'Formato Google',
  driveGoogleNote:
    'Um documento do Google abre como arquivo do Office. Ao salvar, o original fica como está e um arquivo do Office é salvo ao lado dele, ou no Meu Drive.',
  driveReadOnly: 'Somente leitura',
  driveReadOnlyNote:
    'Você não pode editar este arquivo. Ao salvar, será perguntado se deseja salvar uma cópia no Drive.',
  driveUnsupported: 'Este aplicativo não consegue abrir este tipo de arquivo.',
  driveErrNotConnected: 'O Google Drive foi desconectado. Conecte novamente nas Configurações.',
  driveErrNotFound: 'Arquivo não encontrado. Ele foi excluído ou esta conta não consegue vê-lo.',
  driveErrForbidden: 'Esta conta não tem permissão para baixar este arquivo.',
  driveErrTooLarge: 'O arquivo é grande demais para abrir.',
  driveErrRateLimit:
    'O Google está segurando as solicitações por um momento. Tente novamente em instantes.',
  driveErrNetwork: 'Não foi possível acessar o Google Drive. Verifique sua conexão com a internet.',
  driveErrDisk: 'Não foi possível salvar o arquivo neste PC.',
  drivePick: 'Escolher no Google Drive',
  drivePicking: 'Escolha os arquivos na janela do Google que abriu no navegador…',
  drivePickNote:
    'O GenOffice só pode abrir os arquivos do Drive que você escolher na janela do Google. Os arquivos escolhidos uma vez ficam nesta lista.',
  driveTrainingTitle: 'Antes de usar arquivos do Drive com IA',
  driveTrainingBody:
    'O Google não permite que arquivos do Drive vão para um serviço de IA que os use para treinar seus modelos. Os planos pessoais do Claude, ChatGPT e Codex podem usar suas conversas para treinamento, a menos que você desative isso: no Claude, em Configurações → Privacidade; no ChatGPT, em Configurações → Controles de dados → “Melhorar o modelo para todos”. Provedores com chave de API não treinam com dados da API por padrão. Conexões de IA gratuitas nunca recebem arquivos do Drive.',
  driveTrainingAck:
    'O treinamento de modelos está desativado nas contas de IA que uso com arquivos do Drive',
  driveFailTraining: 'Primeiro marque o item sobre treinamento de modelos acima.',
} satisfies Record<keyof typeof zh, string>
