# O painel do assistente de IA

Todos os editores podem chamar o painel de IA: selecione algo, dê uma instrução e veja o resultado a chegar.

## Abrir e usar

- O painel precisa de uma IA conectada. Se não houver nenhuma, mostra os cartões de conexão em vez de um erro; consulte [Conexão por assinatura](help://subscription).
- Pontos de entrada: o **botão de IA** no friso de cada editor, **Perguntar à IA** nos menus de contexto, ou Perguntar à IA na barra de marcação.
- Descreva a tarefa por palavras normais (reescrever isto / transformar esta coluna em percentagens / refazer a disposição desta página...) e prima Enter.
- As respostas são renderizadas **em fluxo**; quando a IA precisa de ferramentas (ler o documento, editá-lo), executa-as e continua até terminar.
- **Parar**: interrompe a volta em curso a qualquer momento.
- **Fila de espera**: enquanto uma resposta chega, Enter coloca sua mensagem na fila em vez de descartá-la — uma faixa acima do campo de entrada conta quantas; abra-a para editar, remover, reordenar, pausar ou limpar. A mensagem seguinte parte sozinha ao fim do turno; Esc continua parando o turno.

## Que IA responde

- A lista de modelos ao fundo do painel mostra a IA em uso e permite escolher outra: primeiro as suas assinaturas, depois os fornecedores com chave que configurou.
- Depois de ter usado 80% ou mais do limite de uma assinatura, aparece no painel uma linha como «85% usado · redefine às 15:00».
- Se um pedido for interrompido — o limite esgotou-se, ou o login expirou —, o painel diz porquê e não muda sozinho para outra IA. Quando a sua outra assinatura está conectada, um botão **Continuar com …** propõe-na.

## O que sabe fazer

- **Docs**: reescrever, desenvolver, traduzir, resumir, inserir tabelas e imagens, ajustar a formatação; cada volta guarda um instantâneo primeiro.
- **Sheets**: fórmulas, preenchimento de dados, transformações em massa, formatação.
- **Slides**: gerar a apresentação inteira, ajustar o layout, reescrever os textos.
- **PDF**: perguntas e respostas e resumos com base no texto ou nas páginas selecionadas.
- **Markdown / HTML**: reescrever, desenvolver, traduzir.
- **Início ▸ Ask AI** responde a partir dos seus arquivos favoritados e os cita — o painel de base de conhecimento tem a própria seção no capítulo Início, e o painel de IA do Docs carrega a mesma capacidade.

## Anexar documentos abertos

No painel de IA dos editores Docs, Sheets, Slides, Hangul, HTML e mapa mental, você pode anexar como material outros documentos abertos no GenOffice ou abertos recentemente. Um documento anexado é tratado exatamente como um arquivo escolhido no seu PC.

- **`@` no campo de entrada**: digite `@` no início do campo ou depois de um espaço para abrir uma lista de documentos. Se a janela estiver dividida, o documento do outro painel vem primeiro, depois os outros documentos abertos e os recentes; o documento em que você está fica de fora. Filtre com algumas letras do nome (espaços são aceitos) e escolha com Enter ou um clique: `@nome do documento` entra no campo e o documento é anexado. **Procurar mais…**, no fim da lista, abre a janela de escolha de documentos descrita abaixo.
- **Anexar de documentos do GenOffice**: este botão, ao lado do botão de anexo, abre a mesma lista em uma janela, onde você pode marcar vários documentos e anexá-los de uma vez.
- Documentos com alterações não salvas e documentos novos que nunca foram salvos aparecem esmaecidos e não podem ser escolhidos. Salve-os e escolha de novo: a IA lê o arquivo salvo.
- Quando dois documentos têm o mesmo nome, mas estão em pastas diferentes, o nome da pasta logo acima é acrescentado, como em `@plano.docx(2º semestre)`, e esse nome de pasta também é passado à IA.
- Os editores de PDF e Markdown ainda não têm anexos, então nenhuma das duas formas está disponível neles.

## Projetos

- Clique no nome do projeto, à esquerda e abaixo do campo de entrada, para escolher um projeto (uma pasta do seu PC). A IA passa a responder conhecendo os arquivos, as instruções e a memória dessa pasta, e a conversa fica guardada nela para você continuar em outro editor. Veja [Projetos](help://projects).
- Com um projeto escolhido, o título da conversa atual aparece no topo do painel. Clique nele para ver a lista de conversas do projeto e **Nova conversa**.
- A lista de `@` do campo de entrada mostra "Arquivos deste projeto" depois dos documentos abertos.
- Um pedido com um projeto escolhido também envia à IA que você está usando as instruções (junto com `AGENTS.md` e `CLAUDE.md` no topo da pasta, que você pode desativar na página do projeto), a memória e a lista de nomes de arquivo desse projeto, um trecho curto de cada arquivo que a IA encontrar ao pesquisar a pasta, além do texto de qualquer arquivo que a IA ler.

## Reversão e segurança

- O painel do Docs mantém uma **lista de versões**: um instantâneo por volta, pode voltar a qualquer um deles, e a própria reversão pode ser anulada com Ctrl+Z. Os instantâneos sobrevivem a fechar e reabrir o documento.
- As edições da IA passam pelo mesmo fluxo de edição das manuais (anuláveis e sujeitas a salvamento) — nada contorna a sua confirmação de salvamento.

## Ocultar uma seleção da IA

- Em Slides, HTML e Markdown uma seleção pode sair da vista do modelo: clique direito ▸ **Ocultar a seleção da IA**, dê nome ao espaço reservado, e o modelo lê `{{nome}}` no lugar. (Markdown arma o item com a chave de olho riscado da faixa; a do HTML vive no painel de código.)
- O arquivo guarda o texto real — salvar, exportar e imprimir ficam intactos, e a marca sobrevive à reabertura. O mesmo item desfaz (Markdown ganha também **Mostrar a seleção à IA novamente**).
- HTML oculta conteúdos de elementos, valores de atributos e literais de string dos scripts; a página renderizada nunca muda.
- Slides também oculta imagens, vídeos e áudios inteiros, e um slide com conteúdo oculto nunca é enviado como captura: a checagem automática de layout pula a página e avisa.
- Isso vale só para a IA do aplicativo — a CLI, as ferramentas MCP e a exportação headless leem o arquivo diretamente e continuam vendo o texto.

## Privacidade

- As instruções e o conteúdo relevante do documento vão para **a IA que está a usar**: para a Anthropic ou a OpenAI pela sua própria conta quando usa uma assinatura, ou para o fornecedor cuja chave introduziu. Sem nenhuma IA conectada, nada é enviado.
- Se o conteúdo de uma assinatura é usado para treinar IA depende das configurações da sua própria conta nessa empresa.
- Os ficheiros locais não são carregados para lado nenhum; as chaves de API ficam guardadas no ficheiro de definições da aplicação nesta máquina e são enviadas apenas nos cabeçalhos dos pedidos.
