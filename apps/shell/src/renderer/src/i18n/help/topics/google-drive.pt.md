# Google Drive

Conecte o Google Drive para abrir no GenOffice os arquivos do Drive que você escolher e editá-los. Ao salvar, o arquivo volta para o Drive. O GenOffice só pode abrir os arquivos que você escolhe na janela do Google; ele não vê o resto do seu Drive.

## Conectar

1. Abra **Configurações ▸ Integrações**.
2. Leia **Antes de usar arquivos do Drive com IA**, desative o treinamento de modelos nas contas de IA que você usa com arquivos do Drive e depois marque esse item.
   - Claude: em **Configurações ▸ Privacidade** do Claude, desative o treinamento de modelos.
   - ChatGPT e Codex: em **Configurações ▸ Controles de dados** do ChatGPT, desative **Melhorar o modelo para todos**.
   - Provedores com chave de API não usam dados da API para treinamento por padrão.
   - Conexões de IA gratuitas (modelos gratuitos do OpenRouter, Gemini) nunca recebem arquivos do Drive.
3. Clique em **Conectar o Google Drive**. A página de login do Google abre no navegador. Entre e permita o acesso.
4. Volte ao GenOffice. O cartão mostra a conta conectada.

O Google não permite que arquivos do Drive vão para um serviço de IA que os use para treinar seus modelos, por isso você não pode conectar nem escolher arquivos até marcar o item.

O login fica guardado neste PC com a criptografia que o sistema operacional oferece à sua conta de usuário (a proteção do próprio Windows, o Keychain do macOS ou um chaveiro da área de trabalho no Linux). Se este PC não conseguir criptografá-lo, a conexão dura só até você fechar o aplicativo.

## Abrir arquivos do Drive

- Clique em **Google Drive** na barra lateral da tela inicial e depois em **Escolher no Google Drive**.
- O seletor de arquivos do Google abre no navegador. Escolha os arquivos que quer abrir (pode ser vários de uma vez); o GenOffice volta e os abre no editor certo.
- Os arquivos escolhidos uma vez ficam na lista **Arquivos escolhidos**. Abra-os de novo por ali, ou pesquise por nome e conteúdo.
- Formatos que o GenOffice não abre aparecem esmaecidos. Documentos, Planilhas e Apresentações Google abrem como arquivos do Word, Excel e PowerPoint.

## Salvar de volta no Drive

- Salve como de costume. Em instantes o arquivo é enviado para o Drive.
- Se alguém alterou o arquivo no Drive depois que você o abriu, você vai escolher entre substituir o arquivo no Drive, salvar uma cópia no Drive ou manter a alteração só neste PC.
- Um arquivo que você só pode ver é salvo no Drive como cópia, ou fica neste PC.
- Um documento do Google fica como está. Suas alterações são salvas como arquivo do Office na mesma pasta, ou no Meu Drive quando não é possível gravar nessa pasta.
- Se um envio falhar, suas alterações ficam neste PC e o GenOffice tenta novamente, inclusive na próxima vez que o aplicativo for aberto.

## A IA e o Drive

- No painel de IA dos editores de Word, Excel, PowerPoint, HTML, mapa mental e Hangul, clique em **Anexar do Google Drive**, ao lado do botão de anexo, para escolher arquivos na janela do Google no navegador e anexá-los como arquivos deste PC. Até 20 de cada vez.
- Enquanto **Deixar a IA encontrar e ler arquivos no Drive** estiver ativado (ele é ativado ao conectar), a IA de qualquer editor pode pesquisar e ler os arquivos do Drive que você escolheu no GenOffice. Por exemplo: "Encontre no meu Drive a ata da reunião do mês passado e resuma." Se o arquivo não for encontrado, escolha-o primeiro na tela inicial.
- O que a IA lê vai para o provedor de IA que você usa. As partes ocultas da IA continuam ocultas.
- Enquanto a IA em uso for uma conexão gratuita, anexar do Drive e a leitura do Drive pela IA não funcionam.
- A IA não pode alterar, excluir nem compartilhar arquivos do Drive.
- Quando uma conversa contém algo lido do Drive, essa conversa deixa de usar a pesquisa na web, a pesquisa de imagens, a leitura de páginas por endereço da web e a inserção de imagens por endereço da web. Comece uma nova conversa para usá-las de novo.

## Desconectar

Clique em **Desconectar** em **Configurações ▸ Integrações**. O GenOffice remove o login deste PC e pede ao Google que revogue o acesso. As cópias de arquivos que já estão neste PC permanecem. Você também pode remover o acesso a qualquer momento em **Conexões de terceiros** na sua Conta do Google.
