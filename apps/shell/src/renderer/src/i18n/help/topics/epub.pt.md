# Livros EPUB: ler, editar e traduzir

O editor de livros digitais abre livros EPUB (`.epub`) em uma aba. Você lê o livro, corrige o texto direto na página, pergunta à IA sobre ele e o traduz para um novo arquivo EPUB. Não existe uma tela para editar o código de um capítulo.

## Abrir um livro

- Abra um arquivo `.epub` pela janela de abertura, arrastando-o para a janela, pelos arquivos recentes, pela árvore de pastas ou pela lista do Google Drive. No Windows, ele também aparece em "Abrir com". Instalar o GenOffice não o torna o programa padrão para arquivos `.epub`.
- Se o livro já estiver aberto, a aba dele vem para a frente.
- Livros com proteção contra cópia (DRM) não abrem: abra-os no app da loja onde você os comprou. Arquivos danificados e arquivos que não são livros EPUB também não abrem, e o motivo é mostrado.
- **Livros de layout fixo** (montados página por página, como livros ilustrados e quadrinhos) abrem somente para leitura. Edição, edição pela IA, substituição e tradução ficam desativadas, e a linha de status explica o motivo. Ler e perguntar à IA continuam funcionando.
- Um capítulo cujo arquivo está malformado é mostrado da melhor forma possível, mas não pode ser editado, e um aviso no topo dele informa isso. Ele é salvo sem alterações e fica no idioma original nas traduções.

## Ler

- O painel **Sumário**, à esquerda, mostra o índice do livro. Clique em um item para ir até ele. Um livro sem índice recebe uma lista dos seus capítulos.
- Cada capítulo rola para cima e para baixo. Continue rolando depois do fim de um capítulo para passar ao seguinte, ou antes do início dele para voltar. A linha de status mostra em que capítulo você está.
- A aba **Exibir** muda o tamanho do texto e o espaçamento entre linhas e liga e desliga a **Visualização escura**. Essas configurações mudam só a tela, nunca o livro, e valem para todos os livros.
- O ponto em que você parou de ler é lembrado para cada arquivo, na pasta de dados do app, e não no livro.
- **Localizar no livro** (Ctrl+F) pesquisa em todos os capítulos. Clique em um resultado para ir até ele.
- Um link dentro do livro leva ao lugar indicado. Links da web e de e-mail abrem no seu navegador padrão; outros endereços não são abertos.
- Os scripts do próprio livro nunca são executados e nada é carregado da internet. Áudio e vídeo não são reproduzidos.

## Editar o texto

- Clique em um parágrafo e digite. Parágrafos, títulos, itens de lista, citações, células de tabela e legendas de imagens podem ser editados. Imagens e a estrutura das tabelas, não.
- Colar insere apenas texto simples.
- **Enter** divide um parágrafo em dois e **Shift+Enter** começa uma nova linha dentro dele. **Backspace** no início de um parágrafo junta-o ao anterior, e **Delete** no fim traz o seguinte para ele. Em células de tabela, legendas e listas de definição, Enter não faz nada: só o texto de dentro muda.
- **Negrito** (Ctrl+B) e **Itálico** (Ctrl+I) ligam e desligam. Texto que a folha de estilos do livro deixa em negrito ou itálico fica como está.
- **Desfazer** (Ctrl+Z) e **Refazer** (Ctrl+Y) continuam funcionando depois de salvar. Desfazer uma alteração feita em outro capítulo leva você até ele.
- **Substituir** (Ctrl+H) percorre o livro inteiro, um parágrafo por vez: uma ocorrência nunca ocupa dois parágrafos. Capítulos somente leitura são ignorados, e o número de trechos ignorados é mostrado. **Substituir tudo** é desfeito em um único passo.

## Salvar

- Salvar (Ctrl+S), Salvar como (Ctrl+Shift+S, só `.epub`), o **Salvamento automático** na faixa de opções e a pergunta antes de fechar funcionam como nos outros editores.
- Se nada mudou, o arquivo não é gravado de novo. Ao salvar alterações, só os parágrafos que você mudou são regravados. Imagens, fontes, estilos e todas as outras partes do livro ficam exatamente como estavam. Em um livro EPUB 3, a data de "última modificação" também é atualizada.
- Se outro programa alterou o arquivo depois que você o abriu, o arquivo não é sobrescrito.

## Painel de IA

- Pergunte sobre o livro, peça o resumo de um capítulo ou peça que o texto dele seja corrigido ou reescrito. A IA lê o índice e os capítulos do livro e encontra texto nele.
- As alterações da IA aparecem na hora, e um único desfazer (Ctrl+Z) reverte tudo o que ela mudou naquela vez. A IA pode deixar texto em negrito ou itálico, mas não pode adicionar imagens, tabelas nem capítulos.
- O texto do livro é material para a IA, não instruções para ela.
- Peça "Traduza este livro para o francês" e a IA abre a janela de tradução com esse idioma já preenchido. Nada é enviado até você clicar em **Iniciar**.
- Livros EPUB também podem ser anexados no painel de IA dos outros editores, escolhidos com `@` e encontrados pela pesquisa de arquivos da tela inicial.

## Traduzir um livro

1. Na aba **Página Inicial**, clique em **Traduzir livro** (ou Arquivo ▸ Traduzir livro…).
2. Escolha o idioma, os capítulos (no começo, todos estão marcados) e os resultados: um **Livro traduzido**, um **Livro bilíngue** (original e tradução) ou os dois. Escolha onde cada um será salvo.
3. Clique em **Avançar**. A confirmação mostra o número estimado de pedidos à IA, para qual IA eles vão, as partes já traduzidas (que não são enviadas de novo) e, em uma conexão cobrada por uso, que haverá cobrança. Se o livro tiver alterações não salvas, o botão será **Salvar e traduzir**.
4. Clique em **Iniciar**. O progresso e **Parar** aparecem no topo. A edição fica bloqueada até a tradução terminar; o painel de IA continua funcionando.
5. No fim, um relatório lista o que foi traduzido, o que ficou no idioma original e os arquivos gerados, cada um com **Abrir**.

- O livro em si não muda. Cada resultado é um novo arquivo EPUB com identidade própria, para que os apps de biblioteca de livros digitais o mantenham separado do original.
- O título e o índice também são traduzidos. Em um livro bilíngue, cada parágrafo vem seguido da sua tradução; em tabelas, legendas e listas, a tradução fica dentro da mesma célula ou item. O título dele mostra os dois, como "Título original (Título traduzido)".
- Os capítulos que você não escolheu ficam no idioma original no resultado.
- Um livro escrito na vertical passa a ser horizontal, a menos que seja traduzido para japonês, chinês ou coreano. Traduções para árabe e hebraico são lidas da direita para a esquerda.
- O que já foi traduzido fica guardado. Se você parar, escolha **Exportar o que foi traduzido até agora** (o restante fica no idioma original) ou **Continuar depois**. Quando você abre um livro com uma tradução inacabada, o GenOffice oferece continuar. **Traduzir de novo desde o início** primeiro exclui a tradução guardada para aquele idioma.
- As traduções guardadas entram em Configurações ▸ Geral ▸ **Resultados de IA salvos**, junto com as de documentos PDF, e **Excluir tudo** também as remove.
- A mesma tradução também pode ser executada pela [linha de comandos](help://cli) com `ieumoffice epub translate`.

## Ainda não disponível

- Adicionar, excluir ou reordenar capítulos; mudar o título, o autor ou a capa; inserir imagens ou tabelas; transformar um parágrafo em título ou lista.
- Editar ou traduzir livros de layout fixo e abrir livros com proteção contra cópia.
- Virar páginas como em um livro impresso e criar um livro novo e vazio.
- Comparar o original e a tradução lado a lado dentro do editor. Em vez disso, abra o livro bilíngue e corrija o livro traduzido como qualquer outro livro.
- Ocultar da IA partes de um livro.
