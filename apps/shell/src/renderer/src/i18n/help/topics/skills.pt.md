# Habilidades

Uma habilidade é um conjunto de instruções de trabalho para a IA. Registe uma vez algo que faz sempre — os passos para organizar notas de reunião, o tom de um relatório, os pontos a verificar todas as vezes — e poderá chamá-la no painel de IA, ou a IA usa-a por iniciativa própria quando for útil. Uma habilidade é uma pasta com um ficheiro `SKILL.md` num formato aberto, por isso uma habilidade criada no GenOffice também funciona tal como está no Claude Code ou no Codex.

## Ativar e desativar habilidades

**Configurações ▸ Habilidades** lista as habilidades deste PC, agrupadas pela origem. Cada habilidade aparece pelo nome, como nos agentes de programação. Use a caixa de pesquisa no topo para encontrar uma por nome ou descrição.

| Origem                             | O que contém                                                | No início   |
| ---------------------------------- | ----------------------------------------------------------- | ----------- |
| **Integradas**                     | As 5 habilidades que vêm com o GenOffice                    | Ativadas    |
| **Minhas habilidades**             | Habilidades que adicionou ou criou (`~/.ieumoffice/skills`) | Ativadas    |
| **Pasta de habilidades do Claude** | As habilidades em `~/.claude/skills`                        | Desativadas |
| **Plugins do Claude**              | As habilidades dos plugins do Claude instalados             | Desativadas |
| **Pasta de habilidades do Codex**  | As habilidades em `~/.agents/skills`                        | Desativadas |

- O interruptor ativa ou desativa uma habilidade. A mesma configuração vale para o painel de IA de todos os editores, para o Ask AI do Início e para a janela do agente.
- Para uma habilidade ativada, escolha **A IA decide** ou **Só quando chamada**. No início fica em A IA decide. Com Só quando chamada, a habilidade só é usada quando a chama.
- Habilidades de origens diferentes podem ter o mesmo nome. O rótulo de origem em cada linha distingue-as.
- O menu de mais opções tem **Ver conteúdo**, **Editar** (só minhas habilidades), **Exportar (zip)** (só minhas habilidades) e **Abrir pasta**.
- **Mover para a lixeira** envia uma das minhas habilidades para a reciclagem do sistema, de onde a pode restaurar.
- Uma habilidade integrada é ocultada em vez de removida: escolha **Ocultar**. **Mostrar de novo**, no fim da lista, traz a habilidade de volta tal como era no início.
- Para alterar uma habilidade integrada ou de outro programa, escolha **Copiar para minhas habilidades**. A cópia aparece em minhas habilidades e a original é desativada.
- Ao exportar uma habilidade com modelo, o documento de modelo também vai no zip. Verifique se o documento não contém informações pessoais antes de exportar.

## Adicionar uma habilidade

1. Em **Configurações ▸ Habilidades**, clique em **Adicionar**.
2. Escolha **De uma pasta**, **De um arquivo zip** ou **De um link do GitHub**. Para o GitHub, escreva o endereço de um repositório público ou `owner/repo` e clique em **Buscar**.
3. Reveja na pré-visualização as habilidades encontradas. Ela mostra o número e o tamanho dos ficheiros, se há scripts, os endereços web citados no texto e o ficheiro de licença.
4. Marque só as habilidades que quer instalar e clique em **Instalar**. As habilidades instaladas já começam ativadas.

Por baixo da pré-visualização aparece sempre: «Instale habilidades somente de fontes confiáveis. Uma habilidade dá instruções à IA e, na janela do agente, pode executar scripts.» Leia uma habilidade de origem desconhecida antes de a instalar.

- Se minhas habilidades já tiver uma com o mesmo nome, escolha **Substituir** ou **Pular** nessa linha.
- Ao transferir do GitHub, o GenOffice liga-se apenas a `github.com`, `api.github.com` e `codeload.github.com`, e não envia nenhum dado de início de sessão. Se o pacote for grande demais ou não passar nas verificações de segurança, nada é instalado.
- **Nova habilidade** abre um editor vazio onde escreve o nome, a descrição e as instruções.

## Verificar atualizações

- Para uma habilidade instalada a partir do GitHub, **Verificar atualizações** no menu de mais opções procura conteúdo novo. O GitHub só é contactado quando clica.
- Se nada mudou, aparece «Atualizada». Se algo mudou, reveja os ficheiros alterados e a pré-visualização e clique em **Atualizar**.
- Se editou a habilidade depois de a instalar, aparece também «Suas edições serão perdidas».
- A atualização mantém o estado ativado ou desativado da habilidade e a escolha entre A IA decide e Só quando chamada.

## Chamar uma habilidade no painel de IA

1. Escreva `/` ou `$` no início da caixa de entrada da IA ou logo a seguir a um espaço. A lista de habilidades ativadas aparece.
2. Continue a escrever para filtrar a lista. Por exemplo, `/meet` encontra `meeting-minutes`. As palavras da descrição também servem, por isso `/ata` também a encontra.
3. Escolha uma com as setas e prima Enter ou Tab. A habilidade passa a ser um chip por cima da caixa de entrada.
4. Escreva o que quer e envie. O GenOffice acrescenta o conteúdo da habilidade ao pedido.

- No painel de IA do Excel, `$` só abre a lista mesmo no início da caixa de entrada, para não atrapalhar endereços de célula como `$A$1`.
- Pode adicionar vários chips e remover um com ×. Esc só fecha a lista; não interrompe uma execução da IA.
- **Gerenciar habilidades…**, no fim da lista, abre **Configurações ▸ Habilidades**.
- Os chips ficam na mensagem enviada e na conversa guardada. Quando reabre uma conversa e envia de novo, o conteúdo atual da habilidade é lido outra vez. Uma habilidade removida ou desativada entretanto aparece como «Indisponível» no seu chip.
- Se o texto das habilidades a enviar for longo demais, aparece «As habilidades são grandes demais para enviar junto» e nada é enviado.

## Habilidades que a IA usa por iniciativa própria

- Para as habilidades ativadas e configuradas como A IA decide, os nomes e as descrições são passados à IA como uma lista. Quando uma corresponde ao pedido, a IA lê o conteúdo dela e usa-a.
- Quando a IA usa uma habilidade, a conversa mostra «Habilidade 〈nome〉 usada».
- A IA decide pela descrição se vai usar uma habilidade. Uma descrição que diga quando a habilidade deve ser usada ajuda a IA a escolher bem.

## Criar uma habilidade a pedido

1. No painel de IA, diga algo como «Guarda o que acabámos de fazer como habilidade» ou «Cria uma habilidade que escreva relatórios no estilo da nossa equipa».
2. A IA separa os passos e as regras que vale a pena repetir e mostra um cartão **Nova habilidade**. Os valores usados só desta vez, como nomes e datas, ficam fora das instruções.
3. Reveja e edite o nome, a descrição e as instruções no cartão. O nome é o que a lista de habilidades mostra e o que escreve depois de `/`: letras minúsculas inglesas, algarismos e hífenes.
4. Clique em **Salvar**. A nova habilidade é adicionada a minhas habilidades, já ativada, e aparece logo na lista de `/`.

- Nenhum ficheiro é gravado até clicar em **Salvar**. Se clicar em **Cancelar**, a conversa guarda-a apenas como «Proposta de habilidade não salva».
- Também pode pedir para alterar uma habilidade existente, por exemplo «Altera a habilidade de atas para a nossa maneira de trabalhar». O cartão passa a chamar-se **Alterar habilidade**. Uma das minhas habilidades é substituída com **Substituir**; uma habilidade integrada ou de outro programa é guardada como cópia em minhas habilidades e a original é desativada.

## Adicionar um documento como modelo

Quando cria uma habilidade no painel de IA de um editor, o documento atual pode ir junto como modelo. Marque **Salvar também este documento como modelo** no cartão, e o botão divide-se em dois.

- **Criar um modelo em branco**: uma cópia do documento abre-se num novo separador, «Pré-visualização do modelo - 〈título〉», e a IA desse separador apaga os valores preenchidos, como nomes, datas e informações pessoais. Reveja o separador, altere mais à mão se precisar e clique em **Salvar esta aba como modelo**; o separador tal como está nesse momento passa a ser o modelo.
- **Salvar o documento como está**: guarda o documento atual como modelo, sem alterações. Se o documento tiver partes que ocultou da IA, este botão fica bloqueado, para que o conteúdo oculto não acabe no modelo tal como está.
- O modelo é guardado como uma cópia do documento dentro da pasta da habilidade. O documento original não muda.

## Usar uma habilidade com modelo

- Uma habilidade com modelo mostra **Tem modelo** na lista.
- Chame-a como chip e envie: uma cópia do modelo abre-se como um novo documento sem título, e a IA desse separador continua o seu pedido. O painel original mantém «O trabalho com o modelo continua numa nova aba» e **Ir para a aba**.
- Quando a IA escolhe sozinha uma habilidade com modelo, nenhum separador se abre de imediato. Em vez disso, a conversa mostra um botão **Abrir um novo documento com este modelo**.
- Normalmente escolhe onde fica o novo documento na primeira vez que o guarda. Os editores de Markdown e HTML guardam na pasta predefinida, como sempre. O ficheiro de modelo em si continua como estava.

## Habilidades com scripts

- No painel de IA normal e no Ask AI do Início, os scripts de uma habilidade nunca são executados. Só o texto da habilidade chega à IA.
- Uma habilidade com scripts mostra **Tem scripts · funciona por completo na janela do agente**, e ao adicioná-la como chip aparece «Os scripts desta habilidade não são executados no painel de IA normal». O envio não é bloqueado.
- Para usar também os scripts, chame a habilidade na janela do agente. Veja [Modo agente](help://agent-mode).

## Habilidades integradas

| Habilidade        | O que faz                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `meeting-minutes` | Transforma notas de reunião numa ata que mostra as decisões e as tarefas                         |
| `internal-comms`  | Escreve avisos, boletins, relatórios de progresso, perguntas frequentes e outros textos internos |
| `humanizer`       | Encontra as expressões que parecem escritas por IA e torna-as naturais                           |
| `copy-editing`    | Revê um texto em inglês já escrito para o tornar mais claro e conciso                            |
| `find-skills`     | Encontra na janela do agente as habilidades de que precisa e sugere instalá-las                  |

`copy-editing` foi feita para textos de marketing em inglês. `find-skills` só funciona na janela do agente.

## Na janela do agente

- A janela do agente segue as mesmas configurações de ativação de **Configurações ▸ Habilidades**, e as habilidades são chamadas na caixa de entrada dela da mesma maneira, com `/` ou `$`.
- As habilidades em `.claude/skills` e `.agents/skills` da pasta do projeto são usadas nessa sessão sem precisarem de ser ativadas.
- A lista de habilidades fica fixa quando a sessão começa. Se ativar ou desativar habilidades durante uma sessão, aparece «As habilidades alteradas valem a partir da próxima sessão».
- Quando o agente cria uma habilidade, o mesmo cartão aparece na janela. Para o modelo, escolha entre os documentos abertos em separadores e os ficheiros da pasta do projeto.
- Quando o agente encontra uma habilidade que vale a pena instalar, aparece uma proposta de instalação. Abra-a com **Abrir pré-visualização** e clique pessoalmente em **Instalar**; caso contrário, nada é instalado. Uma habilidade instalada fica disponível a partir da próxima sessão.
