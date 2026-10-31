# Projetos

Um projeto é uma pasta do seu PC. Escolha um projeto em um painel de IA e a IA passa a trabalhar conhecendo os arquivos, as instruções, a memória e as conversas dessa pasta. Junte em uma pasta os documentos de um mesmo trabalho e uma conversa começada no Docs pode continuar no Hangul ou no Slides, sem que você precise explicar o contexto de novo em cada documento.

## Escolher um projeto

- No painel de IA de todos os editores e no **Ask AI** do Início, o nome do projeto atual fica à esquerda, abaixo do campo de entrada. Quando nenhum está escolhido, aparece **Sem projeto**.
- Clique nele para abrir a lista: projetos **Fixados** e **Recentes**, **Novo projeto**, **Adicionar pasta** e **Sem projeto**. Digite na caixa do topo para pesquisar; se nenhum projeto corresponder, você pode criar um novo com esse nome.
- Ao passar o cursor sobre uma linha aparecem fixar, **Abrir pasta** e **Remover da lista**. Remover um projeto da lista não mexe na pasta nem nos arquivos dela.
- Um projeto cuja pasta foi movida ou apagada aparece esmaecido como **Pasta não encontrada**. Clique nele e escolha a pasta no novo lugar para continuar com o mesmo projeto.
- Ao abrir um documento que está dentro da pasta de um projeto, esse projeto já vem escolhido. Se você mudar esse documento para **Sem projeto**, ele continua assim da próxima vez que for aberto. O projeto que você escolher para um documento fora da pasta também fica guardado para esse documento.
- O projeto escolhido vale a partir do próximo pedido daquele painel. Trocá-lo no meio de uma conversa começa uma conversa nova; a conversa em que você estava continua onde estava.

## Novo projeto e Adicionar pasta

- **Novo projeto**: digite um nome e uma pasta com esse nome é criada na sua pasta padrão de salvamento (no início, `Documentos\GenOffice`; você pode mudá-la nas Configurações). **Criar em outro lugar…** permite escolher outro local. Se já existir uma pasta com esse nome, o app pergunta se você quer usá-la como projeto, e **Usar esta pasta** começa com ela. Se essa pasta já é um projeto da sua lista, ela abre direto, sem perguntar.
- **Adicionar pasta** (**Usar uma pasta existente** na tela Projetos do Início): usa uma pasta que você já tem. As subpastas dela entram também. Não é possível escolher uma unidade inteira, a sua pasta de usuário inteira nem pastas que guardam dados de login ou os dados do app.
- Ao abrir um documento que está dentro da pasta de um projeto que não está na sua lista, aparece abaixo do campo de entrada "Este documento está na pasta do projeto '…'" com um botão **Usar**. Clicar nele é o mesmo que Adicionar pasta.
- Quando uma pasta recebida de outra pessoa já traz instruções ou memória, `AGENTS.md` ou `CLAUDE.md`, ou conversas escritas em outro PC, o app mostra isso uma vez e pergunta. **Ver tudo** deixa você ler tudo antes. **Usar com instruções** aproveita tudo. **Usar sem instruções** mantém essas instruções e essa memória longe da IA, esconde as conversas de outros PCs e para de acrescentar memória; a leitura de arquivos continua funcionando. Mais tarde você pode mudar com **Usar também as instruções** na página do projeto. Clicar em **Cancelar** ou fechar a pergunta sem escolher não adiciona a pasta.
- Depois disso, o app não pergunta de novo. Se as instruções ou a memória mudarem fora do GenOffice, o painel de IA mostra uma vez "As instruções mudaram", e **Ver** abre essa parte da página do projeto.

## Instruções e memória

- As **instruções** são as regras deste projeto, como "Escreva os relatórios em tópicos e nunca abrevie o nome da organização". Escreva-as na página do projeto no Início e clique em **Salvar**. Se a raiz da pasta tiver `AGENTS.md` ou `CLAUDE.md`, eles também são lidos, e você pode desativá-los na página do projeto.
- A **memória** são anotações que a IA faz durante as conversas: fatos, preferências e decisões que vão ajudar depois, uma por linha, com a data. Cada vez que ela anota algo, o painel de IA mostra "Memorizado: …" com um botão **Excluir**. Se essa anotação já foi excluída, a linha mostra "Memória apagada: …" e não tem o botão **Excluir**. Ela não pede sua permissão antes.
- Quando a memória fica longa, o painel de IA mostra "A memória está ficando longa" com **Organizar**. Clicar nele junta as anotações repetidas ou desatualizadas. A versão anterior é guardada, e **Desfazer** a traz de volta. A organização só acontece quando você clica no botão, e ela envia um pedido à IA.
- Na página do projeto você pode excluir anotações, editar a memória inteira e desativá-la. Desativada, nada novo é anotado e a memória existente continua sendo lida.
- Instruções muito longas perdem a parte final, e o painel de IA avisa. A memória é sempre enviada inteira, por mais longa que seja.

## Arquivos que a IA vê

- A cada pedido, a IA recebe o nome do projeto, as instruções, a memória e uma lista com os nomes dos arquivos da pasta. Quando precisa do conteúdo de um arquivo, ela mesma o lê, do mesmo jeito que um anexo, por isso as partes ocultas da IA continuam ocultas.
- Ela não lê documentos abertos com alterações não salvas, arquivos ocultos cujo nome começa com um ponto nem a pasta `.ieumoffice`.
- Para manter um arquivo longe da IA, clique em **Ocultar da IA** na seção Arquivos da página do projeto. Dá para desfazer. O arquivo continua aparecendo nos resultados de pesquisa do Início.
- Em pastas sincronizadas pelo OneDrive, pelo Google Drive e serviços parecidos, os arquivos que não foram baixados para este PC aparecem como "Não está neste PC". Quando a IA quer ler um deles, o app pergunta antes se deve baixá-lo.
- Digite `@` no campo de entrada e "Arquivos deste projeto" aparece depois dos documentos abertos. Escolher um deles o anexa. Veja [O painel do assistente de IA](help://ai-panel).
- Os documentos novos que a IA cria em um projeto são salvos na pasta do documento atual, ou na raiz da pasta do projeto quando o pedido vem do Início. Se o nome já existir, `(2)` é acrescentado para que nenhum arquivo seja substituído.

## Conversas

- Um painel de IA com um projeto escolhido mostra no topo o título da conversa atual. Clique nele para ver a lista de conversas do projeto, uma caixa de pesquisa e **Nova conversa**. Qualquer conversa da lista pode ser retomada em qualquer editor.
- O que foi feito em outro editor aparece em uma linha só, como "3 ferramentas executadas no Hangul 'relatorio.hwp'". A IA só usa as ferramentas do editor em que você está.
- Ao abrir um documento, aparece a última conversa usada nele. Se duas janelas estiverem com a mesma conversa aberta, uma mensagem enviada em uma aparece na outra na hora.
- As conversas escritas em outro PC levam a marca **Outro PC**.
- Na lista você pode renomear ou excluir conversas. Uma conversa excluída vai para a lixeira.
- As conversas que um documento já tinha antes deste recurso ficam no fim da lista, em **Conversas anteriores deste documento**.
- As conversas **Sem projeto** são salvas por documento, como antes. No Ask AI do Início sem projeto, a conversa acaba quando você fecha o app.

## A página do projeto no Início

**Projetos**, na barra lateral do Início, é onde você cria um **Novo projeto**, escolhe **Usar uma pasta existente** e abre um deles para gerenciá-lo.

- **Cabeçalho**: o nome (renomeá-lo não renomeia a pasta), o caminho da pasta, **Abrir no Explorador de Arquivos** (no Mac, **Mostrar no Finder**) e o estado. Quando o projeto é usado sem instruções, aparece **Usar também as instruções**.
- **Instruções**: a caixa de instruções e os `AGENTS.md` e `CLAUDE.md` lidos junto com ela.
- **Memória**: a lista de anotações, **Editar tudo**, **Organizar** e a memória ligada ou desligada.
- **Arquivos**: os arquivos que a IA vê e os que ficam escondidos dela. Clique no nome de um arquivo para abri-lo.
- **Conversas**: as conversas deste projeto. Clique em uma para abrir o documento em que ela foi usada por último e continuar naquele painel de IA.
- Esta página lê a pasta de novo sempre que aparece, então uma anotação que a IA acabou de memorizar aparece sem você sair dela. Se o arquivo de instruções ou de memória mudou fora do GenOffice enquanto você o editava, **Salvar** pergunta antes: **Recarregar** lê o arquivo alterado e **Salvar mesmo assim** o substitui pelas suas alterações.

## O que fica na pasta e o que é bom saber

- As instruções, a memória e as conversas ficam guardadas como arquivos de texto em uma pasta `.ieumoffice` dentro da pasta do projeto. Se você mover a pasta ou copiá-la para outro PC, elas vão junto. No outro PC, escolha a pasta uma vez com **Adicionar pasta** em um painel de IA ou com **Usar uma pasta existente** na tela Projetos do Início.
- A pasta `.ieumoffice` só é criada quando há algo para gravar. Você pode abrir e editar os arquivos dela no Bloco de Notas.
- O que você digita em uma conversa pode ir parar na memória. Para deixar algo de fora, apague com **Excluir** na linha "Memorizado" ou desative a memória.
- Se você escolher uma pasta sincronizada como projeto, as instruções, a memória e as conversas também são enviadas para esse serviço. O app avisa uma vez, na primeira vez que você a escolhe.
- Em uma pasta compartilhada usada por várias pessoas, a memória e as conversas podem se misturar.
- Em uma pasta onde o app não consegue gravar, como uma pasta somente leitura, as instruções e a leitura de arquivos continuam funcionando, mas as conversas e a memória não são salvas. O painel de IA avisa.
- A janela do agente ainda não usa projetos. Um agente também pode alterar os arquivos da pasta `.ieumoffice`, então, em uma pasta com material que você não conhece, use um dos modos que perguntam antes. Veja [Modo agente](help://agent-mode).
