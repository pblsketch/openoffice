# PDF: leitura, anotações e ocultação

O editor de PDF tem cinco separadores no friso: **Página Inicial / Anotar / Editar / Páginas / Exibir**. Ele lê e escreve: o texto pode ser editado, o conteúdo pode ser ocultado, assinado e os formulários podem ser preenchidos.

## Leitura e navegação

- Barra lateral esquerda: **Miniaturas** (clique para saltar, o intervalo visível fica destacado) ou **Estrutura** (os marcadores, quando existem).
- Zoom: o controlo de proporção no canto inferior direito; ctrl+roda ajusta o zoom por degraus.
- Mover a visualização: ative a **Ferramenta Mão** (guias Página Inicial e Exibir) e arraste para mover a página em qualquer direção. Enquanto está ativa, arrastar não seleciona texto e um clique simples continua abrindo links. Arrastar com o botão do meio (roda) pressionado move a visualização sem a ferramenta. Esc ou outra ferramenta a desativa.
- Rotação: por página ou em todas as páginas a partir do menu Páginas; as rotações são gravadas ao salvar.
- Pesquisar: ctrl+F para procurar em todo o texto com todas as ocorrências realçadas.
- PDFs encriptados: aparece um pedido de palavra-passe (uma pequena janela própria) para os abrir; a palavra-passe só é usada nesta sessão. Pode editar e guardar um documento assim; ao guardar, a palavra-passe mantém-se. **Anotar → Proteger** define, altera ou remove a palavra-passe e o que os leitores podem fazer.

## Selecionar texto e marcar (Anotar)

Experimente num parágrafo qualquer:

1. **Arraste o rato por cima de uma frase** — ao largar, uma barra de anotação surge por cima do texto:

![A barra de anotação depois de selecionar texto](img/pdf-highlight.png)

2. Escolha uma das três cores de **Destacar**, ou **Sublinhar**, **Ondulado** ou **Tachar**. Para mudar uma cor de destaque, clique nela com o botão direito e escolha outra. Depois de sublinhar, ondular ou tachar, abre-se uma fila de cores na barra: clique noutra cor para a mudar, e a marca seguinte também usará essa cor. **Perguntar à IA** envia a seleção com a sua pergunta para o painel de IA.
3. Para desfazer uma anotação, volte a arrastar-seleccionar o mesmo trecho e clique no botão ativo da barra (um interruptor ao estilo do Word), ou selecione-o e prima Delete.

A ter em conta:

- Arrastar sobre o texto faz aparecer uma barra: **Destacar / Sublinhar / Tachar / Copiar / Perguntar à IA**.
- As cores vêm da paleta; e **aplicar a mesma marcação a um intervalo já marcado remove-a** (interruptor ao estilo do Word).
- As marcações já gravadas no ficheiro podem ser selecionadas e eliminadas (menu ⋯ ou Delete).
- **Nota**: enquanto uma ferramenta de desenho estiver armada, a camada de texto não pode ser selecionada — a ferramenta desarma-se sozinha após cada colocação, ficando outra vez em modo de seleção para a ação seguinte.

## Ferramentas de desenho (Anotar)

Seis ferramentas: **Desenho livre, Retângulo, Elipse, Seta, Nota**, mais a **Censurar área** no separador Anotar.

- Cada ferramenta é um interruptor: clique para a armar; **ela desarma-se assim que uma forma é colocada** (clique outra vez na ferramenta para continuar); clicar na ferramenta armada também a desarma.
- O traço segue a espessura do pincel; o retângulo, a elipse e a seta desenham-se arrastando; as cores vêm da paleta de desenho.
- As formas colocadas podem ser selecionadas, eliminadas, arrastadas e (retângulo/elipse) redimensionadas.
- **Ocultar conteúdo, o fluxo completo** (esconder uma linha de texto):

  1. Separador Anotar ▸ clique **Censurar área** (a ferramenta arma-se).
  2. **Arraste uma caixa sobre o conteúdo** — fica coberto por um traço hachurado, e a barra de ferramentas ganha os botões **Limpar marcações** e **Aplicar censura**.

  3. Clique **Aplicar censura** e confirme — o resultado é uma cópia de trabalho em que o texto e as imagens cobertas são removidos a sério (não apenas tapados), e isso não pode ser anulado; o documento original fica intacto.

  Errou? O botão de limpar marcações apaga as marcações atuais para poder desenhar de novo.

## Notas adesivas e fio de comentários

- A **ferramenta de nota** coloca um alfinete e abre um cartão na margem para o texto (o nome do autor é configurável); depois de confirmar, guarda-o como uma anotação de Texto PDF padrão.
- Clique num alfinete para abrir o fio: **Responder** (as respostas formam uma única lista plana, sem aninhamento), **Editar** o seu comentário, **Eliminar** um comentário ou o fio inteiro.
- As edições em curso sobrevivem até o gravação escrever o novo texto na mesma anotação do ficheiro, mantendo a cadeia de respostas intacta.

## Editar o conteúdo do PDF (Editar)

- **Editar texto**: clique no texto para o editar por blocos (motor pdfium; as fontes são aproximadas tanto quanto possível).
- **Inserir texto**: coloque texto pesquisável com a fonte, o tamanho e a cor que quiser.
- **Inserir imagem / carimbo**.
- Formulários: os campos AcroForm preenchem-se diretamente; os valores são escritos ao salvar.

## Assinaturas

- **Assinatura manuscrita**: desenhe-a; pode ser associada a um campo de assinatura de um formulário.
- **Assinatura por imagem**: coloque uma imagem como assinatura.
- As assinaturas guardadas podem ser reutilizadas.
- **Assinatura com certificado** (aba Anotar): assine com um certificado do repositório do sistema ou de um arquivo .p12/.pfx; mostre opcionalmente a assinatura na página e certifique opcionalmente o documento contra mudanças posteriores.
- Assinar sempre grava um **novo arquivo** (atualização incremental — assinaturas anteriores seguem válidas) e abre a cópia assinada no lugar. Salve antes: a assinatura cobre o arquivo como está no disco.
- Uma faixa acima do documento lista as assinaturas existentes; **Ver assinaturas** mostra validade, cobertura e cadeia de certificados de cada uma. Revogação (CRL/OCSP) não é verificada.

## Operações de página (Páginas)

- **Girar / Excluir página / Reordenar**: arraste as miniaturas para reordenar; a exclusão pede confirmação.
- **Importar páginas**: traga páginas de outro PDF para o documento. **Inserir página em branco** adiciona uma página vazia.
- **Substituir páginas** troca um intervalo por páginas oriundas de outro documento; **Recortar páginas** apara as margens, com a opção de aplicar a todas as páginas.
- **Tamanho da página** redimensiona todas as páginas para um único tamanho de papel; **Inverter ordem** inverte o documento de trás para a frente.
- **Extrair página**: exporta as páginas selecionadas para um PDF novo.
- **Dividir PDF**: duas formas — dividir por intervalos em vários ficheiros, ou cortar cada página numa grelha de páginas mais pequenas.
- **Mesclar PDF**: duas formas — acrescentar outros PDFs, ou combinar várias páginas numa só folha. Os tamanhos são somados **antes** de se ler seja o que for, e um total **acima de 1 GiB é recusado** com uma mensagem legível (para manter a memória limitada).
- As alterações ao nível da página são gravadas no salvamento seguinte; Salvar Como deixa o original intacto.

## Exportar e imprimir

- **Exportar como Word… / PowerPoint… / Excel…** no menu Arquivo, ou os mesmos três a partir de **Converter PDF** no friso — tudo local, sem envio. O .pptx sai com um diapositivo por página e o .xlsx com uma folha de cálculo por página. Cada um pergunta onde guardar.
- **Imprimir**: a ordem e as rotações atuais através da caixa de diálogo do sistema; são suportados intervalos de páginas.

## Salvar

- O salvamento normal/automático grava as anotações e as edições de volta no ficheiro (de forma atómica).
- **A ocultação passa pelo seu próprio fluxo Aplicar censura**, que produz uma cópia e deixa o original intacto, para que o conteúdo sensível não fique nele.

## Atalhos da barra de seleção

Enquanto a barra de anotação está visível sobre o texto selecionado, uma única tecla executa uma ação na hora.

| Tecla | Ação                                       |
| ----- | ------------------------------------------ |
| H     | Destacar (remove o destaque se já existir) |
| U     | Sublinhar                                  |
| S     | Tachar                                     |
| N     | Adicionar uma nota no fim da seleção       |
| E     | Explicação da IA (cartão de trecho)        |
| T     | Tradução da IA (cartão de trecho)          |
| Enter | Abrir a caixa **Perguntar à IA**           |

- As teclas funcionam da mesma forma com um método de entrada coreano ou de qualquer outro idioma. São ignoradas enquanto você digita num campo ou segura Ctrl ou Alt.
- Num documento bloqueado para edição (a palavra-passe do proprietário impede alterações), H, U, S e N não fazem nada e mostram o motivo, como os botões da barra.

## Cartões de trecho

Pressione **E** ou **T**, ou os chips de explicar e traduzir da caixa **Perguntar à IA**, e a resposta aparece num pequeno cartão ao lado da seleção. Os cartões ficam guardados, por isso continuam lá quando você reabre o documento, e podem ser copiados. Perguntar de novo sobre o mesmo trecho abre o cartão existente sem enviar nada.

- **Manter como nota** cria uma nota naquele ponto. A primeira linha diz "Explicação da IA" ou "Tradução da IA", e o autor é o nome da sua conta no PC. Ela entra no arquivo quando você salva o PDF; até lá o cartão mostra "Aguardando salvar".
- **Continuar no painel de IA** passa o trecho e a resposta para o painel de IA sem enviá-los; **Adicionar à nota** coloca-os no fim da nota deste PDF.
- Só **Gerar novamente** envia o trecho de novo à IA.
- **Excluir** apaga apenas o cartão guardado. A nota que você já manteve continua lá.
- Uma linha pontilhada fraca marca cada trecho que tem cartão; clicar nela reabre o cartão. A linha existe só na tela e nunca é salva nem impressa. Ative ou desative em Exibir ▸ **Marcas de trecho**.

## Visão geral das anotações

- Exibir ▸ **Anotações** lista, na barra lateral esquerda, os destaques, sublinhados, tachados, notas e desenhos do documento, as marcações ainda não salvas e os cartões de trecho. As marcações mostram o texto que ficam por cima.
- Filtre por tipo, cor, intervalo de páginas ou texto, e ordene por página ou por ordem de criação.
- Clicar num item leva até o lugar com uma breve piscada. Uma nota abre o seu fio na margem; um cartão abre o cartão.
- Os comandos do menu **Copiar como Markdown**, **Abrir como documento Markdown** e **Abrir como documento do Word** usam a lista como está filtrada. A IA não é usada. Só é possível criar documentos novos a partir de um PDF aberto dentro do GenOffice.

## Tradução lado a lado

- Ative Exibir ▸ **Tradução lado a lado** e uma coluna de tradução aparece à direita de cada página, rolando junto com ela. Ativá-la não envia nada à IA. Um documento que você já traduziu com **Traduzir documento** mostra a tradução logo; os parágrafos sem tradução aparecem como texto original esmaecido.
- **Traduzir esta página** (ou **Traduzir o restante** quando parte já está feita) envia a página com um clique enquanto você usa uma assinatura; o nome da IA de destino aparece ao lado do botão. Numa conexão cobrada pelo uso, o primeiro clique numa aba pergunta antes "cobrará por isto · Traduzir / Cancelar".
- Clique duas vezes num parágrafo traduzido para editá-lo. Parágrafos editados ficam guardados como texto simples e são usados como estão nos arquivos PDF, Markdown e EPUB traduzidos. **Traduzir novamente** num parágrafo envia só esse parágrafo e pergunta antes se você o editou.
- Passar o mouse sobre um parágrafo traduzido contorna o lugar dele na página original. A largura e o tamanho do texto da coluna podem ser ajustados. **Traduzir todas as páginas…** abre a janela **Traduzir documento**, cujo formato **Apenas guardar (sem arquivo)** mantém a tradução sem gravar arquivo.
- Os parágrafos traduzidos de novo ficam ligados frase a frase. Passar o rato sobre uma frase traduzida destaca essa frase na página original, e passá-lo sobre uma frase original realça a sua tradução. Onde a frase não é encontrada na página, e nos parágrafos traduzidos antes ou editados por si, a ligação continua a ser por parágrafo.
- A barra acima da coluna alterna entre **Tradução** e **Explicação simples**. A explicação simples reescreve o texto com palavras do dia a dia e frases curtas, para crianças, idosos ou quem está aprendendo o idioma; fatos, números e nomes ficam como estão. A escolha é lembrada, e alternar não envia nada. Enquanto a explicação aparece, os botões de página e de parágrafo e a edição atuam sobre ela.
- Na explicação simples, **Explicar todas as páginas de forma simples…** abre a janela **Traduzir documento** com o modo **Explicação simples**. Uma explicação é mais longa que o original, por isso não pode virar um PDF traduzido; ela é gravada em Markdown ou EPUB. Com **Original e depois explicação** ligado, cada parágrafo original vem seguido da sua explicação; desligado, o arquivo traz só a explicação. O idioma começa como o da interface e pode ser o do próprio documento.

## Destaques com IA

- Em Página Inicial ▸ **Destaques com IA**, escolha um conjunto de categorias (Pesquisa e relatórios, Contratos e termos, Livros didáticos e manuais, ou Personalizado) e as páginas. Nada é enviado até você conferir o número estimado de chamadas e a IA de destino e pressionar **Iniciar**.
- As frases escolhidas pela IA aparecem em pré-visualização como caixas coloridas translúcidas na página. A pré-visualização nunca é salva; ative ou desative em Exibir ▸ **Pré-visualização dos destaques**.
- No painel **Anotações**, use **Aceitar** ou **Descartar** em cada sugestão, ou aceite uma categoria inteira. Uma frase que não foi encontrada no texto da página não pode ser aceita.
- Uma sugestão aceita vira um destaque na cor da sua categoria, e o nome da categoria é salvo como assunto da anotação, para que outros leitores de PDF o mostrem na lista de comentários. Ela entra no arquivo quando você salva o PDF.
- Os destaques com IA não podem começar num documento bloqueado para edição. Frases inventadas que não estão no texto são descartadas, e o relatório final diz quantas foram recebidas e descartadas.

## Visão geral do documento e citações de parágrafo

- No alto do painel de IA, **Visão geral do documento** ▸ **Criar visão geral** gera um resumo em três linhas, um resumo e termos-chave (com significado e primeira página). Um documento longo é resumido em partes, então você confirma antes o número estimado de chamadas.
- A visão geral fica guardada e reaparece ao reabrir; só **Gerar novamente** envia de novo. Clicar num termo procura-o no documento; cada seção pode ser copiada ou adicionada à nota.
- Quando a conversa está vazia, o painel de IA oferece três perguntas sugeridas. Clicar numa envia-a uma vez.
- Clicar num link de página (p.N) que a IA dá como evidência leva a essa página e destaca a frase citada por dois segundos. Se a frase não for encontrada, vai só para a página.

## Uma nota para cada PDF

- Na primeira vez que você pressiona **Abrir nota** (guia Exibir ou painel **Anotações**), abre-se uma janela de salvar, por padrão na pasta do PDF com o nome "nome do PDF nota.md". Depois disso, a nota abre direto numa aba de Markdown.
- Se você escolher um arquivo que já existe, o Windows pode perguntar se deseja substituí-lo, mas o arquivo não é sobrescrito: ele é vinculado como nota do jeito que está.
- **Adicionar à nota** (em cartões, itens do painel e na visão geral do documento) coloca uma citação e um link de página no fim da aba da nota e a deixa sem salvar; quem salva é você, na aba da nota. O link abre o PDF nessa página em outros programas, como um navegador.
- Um PDF que nunca foi salvo mostra "Salve o PDF primeiro". As notas só funcionam com PDFs abertos dentro do GenOffice.
