# O editor Markdown

O editor Markdown abre .md / .markdown — e .txt / .json, direto na visão de código — com código mais prévia renderizada.

- **Abrir**: a partir do Início ou de Arquivo ▸ Abrir…; também funciona a partir da linha de comandos.
- **Editar**: edição de texto simples; as extensões GFM (tabelas, listas de tarefas, rasurado, ligações automáticas) são renderizadas na pré-visualização.
- **Pré-visualização**: em tempo real; os recursos relativos, como imagens, são resolvidos ao lado do documento.
- **Salvar**: fiel byte a byte — o BOM, o CRLF e a presença de uma quebra de linha no fim do ficheiro são preservados; um salvamento sem alterações não reescreve o ficheiro.
- **Pesquisar e substituir**: o ctrl+F pesquisa no código; Substituir grava o resultado de volta.
- **IA**: botões prontos deixam o assistente reescrever, desenvolver ou traduzir o documento. Uma seleção pode ser ocultada da IA (veja o capítulo do painel de IA).

## A barra de ferramentas

Uma fila de botões por cima do editor (passe o cursor para ver as dicas):

- **Ficheiro e histórico**: Salvar, Salvar Como…, Desfazer, Refazer, Localizar; o interruptor de **Salvamento automático** à direita grava as alterações periodicamente no disco.
- **Botão de IA**: abre o painel de IA; ao lado ficam as opções de reescrever / desenvolver / traduzir.
- **Estilo de parágrafo** (menu suspenso): alterna entre o texto do corpo e os vários níveis de título.
- **Formatação na linha**: **negrito**, _itálico_, ~~tachado~~, `código embutido`, ligação.
- **Listas**: lista com marcadores, lista numerada, lista de tarefas.
- **Inserir**: tabela, imagem, separador horizontal.
- **Propriedades**: insere ou salta para o bloco YAML front matter no topo do ficheiro.
- **Estrutura**: salta pela hierarquia de títulos.
- **Ortografia**: liga ou desliga a verificação ortográfica deste documento.
- **Configurações de hospedagem de imagens**: imagens coladas ou arrastadas vão primeiro para o seu próprio armazenamento — compatível com S3 (R2/OSS/COS/MinIO), SM.MS ou GitHub — com a cópia local em assets como reserva.

Três exemplos rápidos:

- **Título**: ponha o cursor nessa linha ▸ menu suspenso de estilo de parágrafo ▸ "Título 1".
- **Tabela**: clique **Inserir tabela** ▸ arraste para escolher o número de linhas e colunas ▸ escreva nas células; a pré-visualização renderiza-a de imediato.
- **Lista de tarefas**: selecione algumas linhas ▸ clique **Lista de tarefas** ▸ cada linha passa a `- [ ]` e aparece na pré-visualização como uma caixa de verificação.

## Links entre notas

Os links de uma nota são seguidos com **Ctrl+clique** (**⌘+clique** no Mac). Um clique simples continua editando o texto.

- **Títulos**: `[texto](#titulo)` e `[[#Título]]` vão para esse título na mesma nota.
- **Outros arquivos**: `[texto](other.md)` ou `[texto](../folder/report.pdf)` abre o arquivo em sua própria aba, a partir da pasta da nota. Um link para um título de outra nota Markdown abre essa nota no título.
- **Links wiki**: `[[Nota]]`, `[[Nota#Título]]` e `[[Nota|texto exibido]]` são procurados em qualquer lugar do cofre da nota — a primeira pasta acima da nota que contém `.obsidian`, ou então a própria pasta da nota. Quando dois arquivos têm o mesmo nome, vence o mais próximo da nota.
- **Preenchimento**: digite `[[` e escolha uma nota do cofre na lista; ela é escrita como `[[Nome]]`.
- **Imagens**: `![[imagem.png]]` mostra a imagem abaixo do texto e `![[imagem.png|300]]` define a largura. Só aparecem imagens dentro do cofre com até 20 MB.
- **O que não muda**: links wiki continuam como texto simples no arquivo, então salvar nunca os reescreve. Links da web abrem no navegador. Caminhos de rede (`\\server\share`), links no modo código-fonte e a IA não abrem nada.

## Exportação

Menu Arquivo, tudo local e tudo pergunta onde colocar o resultado:

- **Exportar como Word…** e **Exportar como PDF…** escrevem um .docx ou .pdf a sério.
- **Exportar como ODT…** grava um .odt (texto OpenDocument) pela mesma conversão da exportação para Word; se algo mudar ou se perder no caminho, você vê a lista e confirma antes.
- **Exportar como imagens…** escreve um PNG por página numa pasta que escolher.
- **Converter e abrir no Docs** converte para .docx e abre-o no separador Docs incorporado aqui na aplicação — não é uma entrega a nada na nuvem, e a cópia convertida fica numa pasta de cache que é limpa ao fim de cerca de uma semana.

## Vista de código-fonte

O friso traz um interruptor **Código-fonte** (localizado com a aplicação). Ligue-o e o editor é substituído pelo Markdown em bruto: exatamente o texto que uma gravação escreve, nada embelezado, nada normalizado por baixo de si.

- **A edição é fiel byte a byte.** Uma gravação a partir da vista de código-fonte produz exatamente os mesmos bytes que uma gravação a partir do editor — o BOM, o CRLF e a presença de uma quebra de linha no fim sobrevivem todos.
- **É o mesmo documento.** Alterne para um lado e para o outro à vontade; a fonte é o próprio texto do editor, não uma cópia que seja preciso fundir.
- **A barra de formatação fica indisponível** enquanto a vista está aberta, porque a maioria desses botões insere construções do editor que só têm significado do lado renderizado. Reaparece quando fecha a vista.
- **.txt e .json** abrem aqui diretamente na visão de código: não há nada a renderizar, então o código _é_ o documento.
