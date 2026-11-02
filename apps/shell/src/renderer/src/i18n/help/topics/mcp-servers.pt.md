# Conectar servidores MCP

Um servidor MCP é um serviço que oferece à IA ferramentas de fora do aplicativo, como consultar leis ou pesquisar material mantido pela sua equipe. Depois que você conecta um servidor, as janelas de IA do GenOffice podem chamar as ferramentas dele durante uma conversa. Você decide, ferramenta por ferramenta, o que a IA pode usar e como.

## Adicionar um servidor

1. Abra **Configurações ▸ Integrações** e clique em **Adicionar um servidor** no cartão **Servidores MCP**.
2. Escolha como adicionar.
   - **Colar texto de configuração**: cole o texto de configuração inteiro do guia do servidor e clique em **Ler**. O GenOffice preenche os campos. Se um único texto trouxer vários servidores, você os confirma um de cada vez. Se o texto lê uma chave ou um valor de uma variável do PC (`${NOME}`), esse campo fica vazio para você preencher.
   - **Digitar**: digite um nome e o endereço. Se o guia do servidor fornecer uma chave, coloque-a no campo **Chave (opcional)**.
3. Leia o aviso acima do botão de adicionar e clique em **Adicionar**.
4. Ao adicionar, o GenOffice verifica a conexão na hora e busca a lista de ferramentas. Um servidor que exige login espera por você em vez de abrir o navegador. Clique em **Verificar conexão** para ver a lista de ferramentas que o servidor oferece. Se o servidor exigir login, clique em **Entrar pelo navegador** e conclua o login lá.

O nome de um servidor usa letras, números, `-` e `_`, com até 24 caracteres. A IA vê as ferramentas desse servidor com nomes no formato `mcp__name__tool`. Se uma habilidade chama ferramentas por nomes desse formato, adicione o servidor com o mesmo nome que a habilidade usa.

## Servidores por endereço e servidores neste PC

- Um servidor **por endereço** é acessado por um endereço da web. Endereços da internet precisam começar com `https://`. `http://` só funciona para este PC e para endereços de rede privada, em casa ou no trabalho, e antes você confirma que chaves e conteúdo de documentos vão trafegar sem criptografia.
- Um servidor **neste PC** é um programa que o GenOffice executa neste PC. A tela de adição mostra o programa exato, os argumentos e os nomes das variáveis de ambiente passadas a ele. Ele só é executado pela primeira vez depois que você clica em **Permitir execução**. Se o comando mudar depois, o servidor continua parado até você permitir de novo.
- Se um servidor neste PC precisar de um programa que este PC não tem (Node.js, ou uv para servidores Python), o GenOffice pergunta no cartão do servidor, em Configurações, se deve baixá-lo. Ele mostra o tamanho do download, e nada é baixado até você clicar em **Baixar**. Os programas baixados ficam dentro da pasta de dados do GenOffice, e as configurações do seu PC não são alteradas.
- Um servidor neste PC inicia quando é preciso e para depois de 10 minutos sem uso. Ele também para quando você fecha o GenOffice.

## Escolher o que cada ferramenta pode fazer

- Para cada ferramenta, escolha **Sempre permitir**, **Perguntar antes** ou **Não usar**.
- No início, as ferramentas que o servidor marca como somente leitura ficam em **Sempre permitir**, e todas as outras em **Perguntar antes**.
- Quando a IA chama uma ferramenta em **Perguntar antes**, aparece um cartão na janela de IA. Veja o que será enviado e clique em **Permitir só desta vez**, **Permitir sempre nesta conversa** ou **Bloquear**. Nada é executado até você clicar. Parar a IA ou fechar a janela conta como bloquear.
- Se o servidor alterar a descrição de uma ferramenta ou os valores que ela recebe, essa ferramenta mostra **Verificação necessária** e fica oculta da IA até você ver a alteração e clicar em **Aprovar a alteração**. Uma mudança nas orientações que o servidor dá à IA é verificada do mesmo jeito.
- Ferramentas novas de um servidor são ativadas com os mesmos ajustes iniciais, e o cartão e o botão na janela de IA mostram **Ferramentas novas: n**. A marca some quando você abre a lista de ferramentas desse servidor em Configurações.

## Usar servidores em uma janela de IA

- Os servidores funcionam nas janelas de IA dos editores e no Ask AI do Início. Enquanto um servidor estiver ativado, aparece um botão **Servidores conectados** ao lado do campo de entrada.
- Clique nele para ver o estado de cada servidor e para desativar ou ativar um servidor só nesta conversa. Uma conversa nova começa com todos os servidores que você ativou em Configurações. Um servidor cuja conexão nunca foi verificada aparece como **Ainda não verificado**; verifique-a nas Configurações para obter as ferramentas.
- Desativar **Permitir que a IA use ferramentas da internet** em **Configurações ▸ Mídia e busca de IA** também remove todas as ferramentas dos servidores MCP.
- Quando uma habilidade espera uma ferramenta de um servidor que você não pode usar agora, a IA diz na resposta qual etapa não conseguiu fazer. **Configurações ▸ Habilidades** também mostra, ao lado da habilidade, o servidor de que ela precisa.
- A janela do agente também pode usar as ferramentas dos servidores ativados. Valem as mesmas permissões, e uma sessão mantém os ajustes com que começou. Veja [Modo agente](help://agent-mode).

## Proteger o que um servidor devolve

Cada servidor tem a opção **Proteger o que este servidor devolve**, ativada no início. Enquanto está ativada, assim que algo devolvido por esse servidor entra em uma conversa, as ferramentas que enviam coisas para fora do aplicativo deixam de funcionar nessa conversa: pesquisa na web, leitura de uma página por endereço, ferramentas de outros servidores MCP e semelhantes. As ferramentas do mesmo servidor continuam funcionando. Comece uma conversa nova para usar as outras de novo. Você pode desativá-la em um servidor que só fornece material público.

A janela do agente não consegue manter essa proteção. Quando uma sessão começa com um servidor assim, a janela avisa você.

## O que vai para onde

- Quando a IA chama uma ferramenta, um texto escolhido pela IA vai para esse servidor. Ele pode incluir conteúdo do documento aberto e dos anexos. As partes ocultas da IA continuam ocultas.
- O que o servidor devolve vai para o provedor de IA que você está usando. Adicione apenas servidores cujos responsáveis você considere confiáveis.
- Chaves, logins e valores de variáveis de ambiente ficam guardados neste PC com a criptografia do seu sistema operacional. Se este PC não puder criptografá-los, eles são lembrados só até você fechar o aplicativo.
- Remover um servidor apaga as chaves e o login dele e pede ao servidor que encerre o login, se ele tiver suporte a isso.
