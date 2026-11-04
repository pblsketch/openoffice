# Diagramas: desenhar e editar arquivos draw.io

O editor de diagramas abre arquivos draw.io em uma aba. Nele você desenha fluxogramas, diagramas de arquitetura e outros diagramas, salva-os no formato em que vieram, exporta-os como imagem ou PDF e deixa a IA lê-los, alterá-los e desenhá-los. O editor roda inteiramente no seu PC.

## Abrir um diagrama

- O editor abre arquivos `.drawio`, `.dio`, `.drawio.svg` e `.drawio.png`: pela janela de abertura, arrastando um arquivo para a janela, pelos arquivos recentes, pela árvore de pastas ou (para `.drawio` e `.dio`) pela lista do Google Drive. No Windows, instalar o GenOffice faz dele o programa dos arquivos `.drawio` e `.dio`.
- Um arquivo `.drawio.svg` ou `.drawio.png` só abre se o diagrama estiver guardado dentro da imagem. Uma imagem SVG ou PNG comum não é aberta como diagrama. Arquivos danificados também não abrem, e o motivo é mostrado.
- Um arquivo do Visio (`.vsdx`) é importado como um diagrama novo, sem título. O primeiro salvamento sugere um arquivo `.drawio` na pasta do arquivo do Visio, e o próprio arquivo do Visio não é alterado. Se algumas imagens dele não puderam ser convertidas, o editor informa quantas. No Windows, os arquivos `.vsdx` aparecem apenas em "Abrir com".
- Um diagrama novo e vazio começa pelo bloco **Diagrama** da tela inicial ou por Novo no menu Arquivo.
- Se o diagrama já estiver aberto, a aba dele vem para a frente.

## Editar

- A tela de edição é a tela do draw.io sem mudanças: os menus em cima, as formas à esquerda, o painel de formato à direita e as abas de página embaixo.
- Salvar (Ctrl+S), Salvar como (Ctrl+Shift+S) e Imprimir (Ctrl+P) ficam a cargo do GenOffice. Trocar de aba e os outros atalhos do aplicativo continuam funcionando. Todos os demais atalhos são do próprio editor, inclusive desfazer (Ctrl+Z).
- **Ajuda** (F1), nos menus do editor, abre esta página.
- O editor usa o idioma do GenOffice. Quando você troca o idioma, o editor reinicia: as alterações não salvas continuam, mas o histórico de desfazer se perde.
- O editor acompanha o tema do GenOffice. No tema escuro, o desenho também aparece em cores escuras, mas o arquivo salvo, os PNG, os PDF e as impressões ficam exatamente iguais aos do tema claro.

## Salvar

- Salvar, Salvar como, o **Salvamento automático** na barra de status e a pergunta antes de fechar funcionam como nos outros editores.
- Um diagrama é salvo no formato em que foi aberto. Salvar como oferece `.drawio`, `.dio`, `.drawio.svg` e `.drawio.png`. Um diagrama novo é salvo primeiro como `.drawio`.
- Se nada mudou, o arquivo não é gravado de novo. Páginas guardadas compactadas no arquivo continuam compactadas.
- A imagem de um arquivo `.drawio.png` mostra a primeira página; o diagrama inteiro fica guardado dentro dela.
- Enquanto um diagrama tiver alterações não salvas, uma cópia de recuperação fica na pasta de dados do aplicativo, para que o trabalho sobreviva a uma falha.

## Exportar e imprimir

- Escolha a exportação em PNG, SVG ou PDF no menu Arquivo (os itens de exportação dos menus do editor abrem a mesma janela). Depois escolha **Todas as páginas** (o padrão) ou **Somente a página atual**.
- Com todas as páginas, PNG e SVG geram um arquivo por página, com o nome `<nome>-p<número da página>`. Um PDF tem uma folha por página, no tamanho de página definido no diagrama.
- Imprimir (Ctrl+P) também imprime uma folha por página. Exportações e impressões usam sempre cores claras, seja qual for o tema.

## Painel de IA

- Peça à IA para desenhar um fluxograma, um diagrama de sequência ou um organograma, explicar o diagrama, organizar uma página ou acrescentar o próximo passo depois das formas selecionadas.
- A IA lê o diagrama como texto: as páginas e, de cada forma e cada conector, o id, o texto, a forma, a posição e as ligações, além de quais formas você selecionou. Ela não vê o diagrama como imagem.
- As alterações da IA aparecem na hora. Cada alteração é um passo de desfazer (Ctrl+Z), e a lista de rodadas no painel desfaz uma rodada inteira da IA. Se qualquer parte de uma alteração for recusada, o diagrama fica como estava.
- Para um fluxograma novo, um diagrama de sequência ou algo parecido, a IA escreve Mermaid e o GenOffice o transforma em formas no seu PC. O layout pode ficar um pouco diferente do que o site do draw.io gera.
- Diagramas também podem ser anexados no painel de IA dos outros editores, escolhidos com `@` e encontrados pela pesquisa de arquivos da tela inicial. Os [comandos de terminal](help://cli) também leem, editam e criam diagramas (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Uso da internet

- A aba de diagrama não envia nada para a internet. O editor roda a partir de arquivos instalados com o GenOffice, e o armazenamento em nuvem, o compartilhamento, os plugins e a IA própria dele estão desligados.
- Imagens e fontes que um diagrama busca na internet não são carregadas; um aviso informa isso quando o arquivo abre. Um link da web ou de e-mail em uma forma só abre no seu navegador padrão quando você clica nele.
- O bloco de rascunho, as bibliotecas de formas que você adiciona e as cores recentes ficam neste PC, na pasta de dados do aplicativo. O painel de IA envia o texto do diagrama para a IA que você escolheu, como nos outros editores.

## Não disponível

- Inserir ou editar PlantUML. As formas PlantUML de um arquivo aparecem como a imagem guardada delas.
- Layouts automáticos que usam ELK e conectores que contornam as formas. Esses conectores são desenhados como conectores comuns.
- Formatos antigos do Visio (`.vsd`, `.vss`) e salvar de volta em `.vsdx`.
- Armazenamento em nuvem, compartilhamento, publicação, plugins e os recursos de IA próprios do editor.
- Ocultar da IA partes de um diagrama.
