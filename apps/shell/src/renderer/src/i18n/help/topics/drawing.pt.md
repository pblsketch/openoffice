# O editor de desenhos

O editor de desenhos abre desenhos do Excalidraw em uma aba própria e os salva de volta no mesmo arquivo.

- **O que ele abre**: notas de desenho feitas com o plugin Excalidraw do Obsidian (`.excalidraw.md`, ou um `.md` cujo front matter tem `excalidraw-plugin`) e arquivos `.excalidraw` do aplicativo web do Excalidraw.
- **Novo desenho**: o cartão **Desenho do Excalidraw** no Início, ou **Arquivo ▸ Novo**. Um novo desenho é uma nota de desenho do Obsidian (`.excalidraw.md`), e você dá o nome a ele ao salvar pela primeira vez.
- **Desenhar**: formas, setas, linhas, desenho à mão livre e texto, com a barra de ferramentas e os atalhos da própria tela de desenho. ctrl+Z desfaz.
- **Salvar**: ctrl+S. Um arquivo é salvo no formato em que foi aberto. O salvamento automático grava a cada 30 segundos e quando a janela perde o foco, mas pula um desenho que ainda não tem nome de arquivo. Um desenho que você só olhou é salvo byte a byte como estava.

## Notas de desenho do Obsidian

- Ao salvar, só a lista de textos da nota e os dados do desenho são reescritos. O front matter, o texto que você escreveu na nota e os links dela ficam como estavam, então a nota abre do mesmo jeito no Obsidian.
- As imagens que a nota indica (`[[imagem.png]]` em Embedded Files) aparecem quando estão dentro do cofre da nota: a primeira pasta acima da nota que tem uma pasta `.obsidian`, ou então a própria pasta da nota. Imagens com mais de 20 MB, em pastas ocultas ou fora do cofre não aparecem.
- Ainda não é possível adicionar imagens novas a uma nota. A ferramenta de imagem está desligada e soltar arquivos na tela de desenho está bloqueado, porque uma imagem guardada só dentro da nota poderia não aparecer no Obsidian.

## O que ele ainda não faz

- Não há painel de IA. A IA não consegue ler nem alterar desenhos.
- Não há exportação para PNG ou SVG.
- O editor fica fora da rede. As fontes já vêm embutidas, e bibliotecas compartilhadas, colaboração ao vivo e conteúdo da web incorporado estão desligados. Um link em um desenho só abre no navegador quando é um endereço da web ou de e-mail.

## Abrir desenhos pelo Explorador de Arquivos

O instalador coloca o aplicativo em **Abrir com** para arquivos `.excalidraw`, sem torná-lo o programa padrão. Uma nota de desenho é um arquivo `.md`, então ela abre em qualquer lugar onde um arquivo Markdown abre no aplicativo e vai para o editor de desenhos em vez do editor Markdown.
