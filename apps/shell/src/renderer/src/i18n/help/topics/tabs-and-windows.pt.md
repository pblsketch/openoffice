# Guias e gestão de janelas

Todos os ficheiros abertos partilham uma janela; a barra de guias no topo muda entre eles, ao estilo de um navegador.

![A barra de guias: Início e dois documentos](img/tabs.png)

## Noções básicas

- **Mudar**: clique numa guia, prima **Ctrl+Tab** (seguinte) / **Ctrl+Shift+Tab** (anterior), ou rode a roda do rato sobre a barra.
- **Fechar**: o × na guia, ou ⌘W/ctrl+W. Se houver alterações por salvar, o GenOffice pergunta primeiro.
- **Nova**: o + no extremo direito da barra.
- **Ativação imediata**: premir uma guia muda para ela logo que é premida, sem esperar que o clique termine.

## Renomear: clique duas vezes numa guia

**Clique duas vezes em qualquer guia de ficheiro** e o título transforma-se num campo de escrita no local: Enter confirma, Escape cancela, e sair do campo também confirma; o Enter que confirma uma sugestão do IME não é confundido com uma confirmação. A renomeação passa pelas mesmas verificações de segurança que a renomeação de uma linha no ecrã Início (caracteres proibidos, nomes em conflito), renomeia o ficheiro no disco e atualiza a lista de recentes.

## Arrastar para reordenar

Prima e arraste uma guia para o lado para reordenar; as guias vizinhas abrem espaço de imediato e a ordem assenta quando larga o rato. Uma zona morta de 4 píxeis impede que cliques simples façam as guias oscilar.

## Menu de contexto

Clique com o botão direito numa guia para **Abrir em nova janela** — disponível em cada guia de documento que possa destacar — e **Fechar**, esbatido numa guia que não possa ser fechada. Ambas seguem o idioma da aplicação.

## Destacar numa janela

**Arraste uma guia para fora da barra** (ou use Abrir em nova janela) e ela passa a ser uma janela própria com o documento ativo; arraste-a de volta para a encaixar na barra. Uma janela destacada é um par em tudo — pode continuar a editar e a salvar lá.

## A lista de todas as guias

Quando as guias não cabem na barra, o pequeno ícone da barra de guias no extremo direito abre a lista completa (um menu do sistema, nunca tapado pela área de conteúdo); escolha com as setas.

## A barra de ferramentas de cada editor

Cada guia de editor tem uma barra de ferramentas no topo (a disposição exata varia um pouco de editor para editor):

- **Salvar** (⌘S/ctrl+S) e **Salvar Como…**.
- **Desfazer / Refazer**: vários níveis; cada editor guarda o seu próprio histórico.
- **Localizar** (ctrl+F): abre o painel de pesquisa desse editor.
- Interruptor de **Salvamento automático**: quando está ligado, as alterações são gravadas no disco periodicamente; quando está desligado, só o salvamento manual grava (e o marcador de não salvo na guia ou no título lembra-lhe disso).

## A guia Início

A guia Início mais à esquerda não pode ser fechada; para voltar de qualquer editor, clique nela ou use Arquivo ▸ **Voltar ao início**.

## Vista dividida: dois painéis

**Arraste uma guia até ao bordo direito da janela**: a guia acompanha como uma pequena cópia flutuante, a indicação «Dividir aqui» aparece junto ao bordo e, ao largar, ficam dois painéis lado a lado. Se largar no bordo inferior, ficam dois painéis empilhados. O menu de contexto da guia oferece o mesmo com **Dividir à direita** e **Dividir abaixo**, e **Desfazer divisão** numa guia que está num painel.

- A guia arrastada fica no painel onde a largou; o outro painel mantém o documento que estava a ver momentos antes.
- Se houver só um documento aberto, uma cópia do mesmo documento vai para os dois painéis, para ver o início e o fim ao mesmo tempo. Um documento novo ainda não salvo também pode ser dividido.
- Arraste o **divisor** entre os painéis para mudar a proporção, clique duas vezes para meio a meio, ou empurre-o até uma ponta para fechar esse painel; o documento continua aberto como guia.

## Uma única janela de IA que segue o foco

- Só uma janela de IA fica visível. O painel em que está a trabalhar mostra a dele; a do outro painel recolhe-se numa barra, e clicar num painel traz a janela de IA desse painel para a frente.
- Enquanto está recolhida, a conversa desse painel e o trabalho de IA em curso continuam vivos. As conversas são guardadas por documento.
- **Duas cópias do mesmo documento**: depois de salvar num painel, salvar a partir do outro pergunta primeiro «Este documento mudou noutro sítio». Já o salvamento automático espera em silêncio.
- Depois de um fecho normal, **reabrir a aplicação sem ficheiro** traz de volta o último par de documentos divididos exatamente como estava; abri-la com um ficheiro abre apenas esse ficheiro. Depois de um encerramento repentino, os separadores anteriores voltam como descrito abaixo.
- As guias Início, Ajuda e Apresentação (pré-visualização) não podem entrar num painel; enquanto uma delas está aberta, os dois painéis escondem-se por um momento e voltam quando regressa a uma guia de documento.

Três ou mais painéis, a divisão dentro de uma janela destacada e a sincronização em tempo real das duas cópias ficam para mais tarde.

## Quando a aplicação ou o PC se desliga de repente

Enquanto um documento tem alterações não salvas, o GenOffice guarda uma cópia de recuperação dele mais ou menos a cada 30 segundos na pasta de dados da própria aplicação. Todos os editores fazem isto, também para um documento novo que nunca foi salvo. O seu ficheiro em si não muda até que o salve.

- **Os seus separadores voltam**: se a aplicação ou o PC se desligou sem fechar normalmente (falha de energia, uma falha da aplicação, a aplicação fechada à força, o PC a desligar ou a reiniciar para uma atualização), os separadores de documentos que estavam abertos voltam na próxima vez que iniciar o GenOffice, pela mesma ordem e com a vista dividida, se a tinha. Também acontece se o iniciar ao abrir um ficheiro.
- **Uma única lista no Início**: os documentos que ainda têm conteúdo não salvo aparecem juntos no ecrã Início. Escolha **Restaurar** ou **Descartar** para cada um, ou use **Restaurar tudo** ou **Descartar tudo**, e prima **Confirmar**. Se outro programa ou um serviço de sincronização alterou o ficheiro depois, **Descartar** vem selecionado para que o ficheiro fique como está agora. Se o ficheiro original já não for encontrado, restaurar abre o conteúdo como um documento novo sem título.
- **Decidir depois**: fechar a lista não apaga nada. Quando abrir pela primeira vez um desses documentos, uma caixa com o nome dele volta a perguntar; premir Esc ou fechar a caixa restaura-o. Se não precisar do conteúdo restaurado, feche o documento com **Não Salvar**.
- **Os separadores carregam ao abri-los**: os separadores restaurados mostram logo o título, mas cada documento só é carregado quando clica no seu separador pela primeira vez. Abrir tudo de uma vez poderia fazer um PC com pouca memória desligar-se outra vez.
- **Ao desligar o PC**: se houver documentos não salvos, o GenOffice não pergunta se deve salvá-los. Guarda as cópias, fecha-se e oferece-as no próximo arranque.
- **Documentos sem cópia**: os ficheiros Excel, HWP e PDF protegidos por palavra-passe não têm cópia de recuperação, por isso as suas alterações não salvas não podem ser restauradas; um aviso indica-o uma vez quando um documento destes é aberto. Salve-os com frequência. Os documentos Word e PowerPoint protegidos por palavra-passe têm uma cópia bloqueada com a mesma palavra-passe.
- **Ficheiros CSV, .xls antigos e .tsv**: o editor de folhas de cálculo guarda a sua cópia como um livro sem título. Ao restaurá-la, abre como um livro sem título e, ao salvar pela primeira vez, sugere a pasta e o nome do ficheiro original em .xlsx.

Uma cópia é apagada quando salva o documento, o fecha com **Não Salvar** ou escolhe **Descartar**, e também ao fim de 30 dias sem alterações. Depois de um fecho normal, o GenOffice arranca como antes e não traz separadores de volta.

**Isto não é o Salvamento automático.** O Salvamento automático escreve as alterações no próprio ficheiro, e só depois de o ter salvo uma vez. Uma cópia de recuperação nunca toca no seu ficheiro; guarda apenas o que ainda não salvou, até salvar ou descartar.
