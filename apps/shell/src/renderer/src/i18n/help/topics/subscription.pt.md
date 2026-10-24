# Conexão por assinatura

O GenOffice faz funcionar a IA com uma assinatura que já tem: uma assinatura do Claude (Anthropic) ou uma assinatura do Codex (OpenAI). O Codex é o programa da OpenAI, e é com o seu plano ChatGPT que inicia sessão nele. Não precisa de uma chave de API, e o GenOffice não tem conta própria em que seja preciso registar-se.

## Como funciona

- A IA não está incorporada no GenOffice. Neste PC está instalado um programa da empresa — o **Claude Code** para uma assinatura do Claude, o **Codex** para uma assinatura do ChatGPT — e o GenOffice pede a resposta a esse programa.
- Esse programa tem a sessão iniciada com a sua própria conta, por isso cada pedido conta para o seu próprio plano.
- O GenOffice nunca mostra um formulário de início de sessão seu, e nunca lê nem guarda as suas credenciais. Inicia sessão no programa e na página web da própria empresa.

## Antes de começar

Precisa de uma destas duas coisas. Ter as duas também serve.

- Uma assinatura do Claude (um plano Pro ou Max; uma conta gratuita do Claude não consegue se conectar), e o programa Claude Code instalado e com sessão iniciada neste PC.
- Uma assinatura do ChatGPT, e o programa Codex instalado e com sessão iniciada neste PC.

Se o programa ainda não estiver instalado, ou ainda não tiver sessão iniciada, os botões da secção seguinte tratam disso.

## Conectar

1. Abra as **Configurações** a partir da linha no canto inferior esquerdo do ecrã Início e escolha **IA**. Em **Conexão por assinatura** há um cartão para o Claude e outro para o Codex.
2. Leia o que o cartão diz e clique no botão dele. A tabela abaixo explica cada estado.
3. Volte à janela do GenOffice. O cartão volta a verificar sozinho, e **Verificar novamente** verifica de imediato.

No segundo passo dos ecrãs de boas-vindas no primeiro arranque, e no painel de IA quando não há nenhuma IA conectada, aparece primeiro a pergunta «Qual IA você já usa?». Escolha uma assinatura paga do Claude, o ChatGPT ou nenhuma ainda, e só verá os passos desse caminho (Instalar o programa → Entrar → Conectado) e o seu cartão. **Escolher outra forma** permite escolher de novo, e pode ignorar tudo e conectar mais tarde. Se mesmo assim não conectar, clique em **Copiar informações para ajuda** e envie o que foi copiado a quem está ajudando você. Não inclui nenhuma conta nem caminhos de arquivos.

| O que o cartão diz                          | O que significa                                                                                                                               | O que fazer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Verificando…**                            | O GenOffice está a perguntar ao programa em que estado se encontra.                                                                           | Aguarde um momento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Não instalado**                           | O programa não foi encontrado neste PC.                                                                                                       | Clique em **Instalar**. O comando oficial de instalação da empresa é executado numa nova janela de terminal, para poder ver o que ele faz. O GenOffice não transfere nada por conta própria. Se preferir instalar à mão, **Guia oficial de instalação** abre as instruções da empresa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Sem login**                               | O programa existe, mas não tem sessão iniciada.                                                                                               | Clique em **Entrar**. A página de início de sessão da empresa abre no navegador: inicie sessão aí e permita o acesso, e o cartão conecta-se sozinho. Não tenha pressa; iniciar sessão pode demorar um pouco. Se o navegador não chegar a abrir, clique em **O navegador não abriu?** no cartão (passados 25 segundos, passa a ser um botão **Abrir a janela de login**). Não clique nele enquanto ainda não tiver terminado de iniciar sessão no navegador: isso interrompe esse início de sessão e recomeça do início. No topo da janela de login que se abre aparecem os passos a seguir. Para colar um código nela, clique com o botão direito dentro da janela e depois prima Enter. É normal que o código colado não apareça; se aparecer "Invalid code", cole o código de novo na mesma janela. Para deixar de iniciar sessão, clique em **Cancelar login**. |
| **Conectado**                               | Foi confirmado um login com assinatura. O nome do plano é mostrado quando o programa o indica.                                                | Nada. A IA está pronta a usar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Login feito, mas não com uma assinatura** | O programa tem sessão iniciada com uma chave de API ou com uma conta de pagamento por consumo, ou não foi possível confirmar o tipo de login. | Veja «Logins de pagamento por consumo» mais abaixo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Não foi possível verificar a conexão**    | A própria verificação falhou. O motivo é mostrado no cartão.                                                                                  | Clique em **Verificar novamente**. Se disser que o programa é demasiado antigo, clique em **Atualizar**: a atualização oficial da empresa é executada numa nova janela. Quando terminar lá, volte ao GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

A conexão é verificada quando a aplicação arranca, quando abre as Configurações e quando regressa à janela depois de iniciar uma instalação ou um início de sessão.

## Sem assinatura: IA gratuita

Não tem assinatura do Claude nem do ChatGPT? Em Configurações ▸ IA, **Usar de graça** conecta uma IA gratuita em vez disso. Escolher **Nenhuma ainda** no segundo passo dos ecrãs de boas-vindas mostra os mesmos cartões, e escolhê-la no painel de IA quando não há nada conectado oferece **Conectar uma IA gratuita**.

- **OpenRouter**: clique em **Conectar pelo navegador**. O navegador abre o OpenRouter; crie conta ou inicie sessão e permita o acesso. Quando o navegador disser que está conectado, feche o separador e volte. Não há chave para copiar, e o cartão mostra quantos pedidos gratuitos restam hoje.
- **Google Gemini**: clique em **Obter uma chave**, crie uma chave no Google AI Studio, cole-a no cartão e clique em **Conectar**. Só para maiores de 18 anos. Uma chave criada num projeto Google com a faturação ativada pode gerar custos.
- Depois de conectada, essa IA passa a ser a **IA em uso**. Com as duas conectadas, **Usar esta IA** num cartão alterna entre elas. **Desconectar** remove a chave do GenOffice.
- Os modelos gratuitos são mais fracos do que os das assinaturas, e cada dia permite um número limitado de pedidos. Uma só edição de um documento pode gastar vários. Quando a quota de hoje se esgota, o painel de IA avisa, e diz quando se pode voltar a usar.
- Enquanto a usa de graça, o que envia pode ser usado para melhorar a IA dessa empresa. Tenha cuidado com documentos que contenham dados pessoais.

## Logins de pagamento por consumo

Um cartão que diz **Login feito, mas não com uma assinatura** traz um aviso: «Isto não é uma assinatura: você paga pelo que usar.»

- O GenOffice não usa esse login enquanto não clicar em **Usar mesmo assim**. A partir daí, cada pedido é cobrado a essa conta.
- Mesmo então, nunca é escolhido automaticamente. Escolha-o por si em **IA em uso**, onde aparece marcado como **Pago**.
- A sua permissão é lembrada apenas para esse programa. É apagada quando a sessão do programa é terminada ou o login dele muda.
- Para usar antes a sua assinatura, inicie sessão no programa com a conta da assinatura e clique em **Verificar novamente**.

## Mudar de conta ou sair

Quando o programa tem sessão iniciada, o cartão mostra a conta em uso ao lado do nome do plano, se o programa a indicar. Tem também dois botões.

- **Entrar com outra conta** volta a iniciar o login do próprio programa. Conclua-o na janela que se abre, com a outra conta.
- **Sair** executa o fim de sessão do próprio programa. Depois disso, o cartão indica **Sem login**.
- Ambas as ações aplicam-se a esse programa em todo este PC, e não só ao GenOffice. Se também usa o Claude Code ou o Codex num terminal, aí a sessão também é terminada ou passa para a outra conta. Por isso, o GenOffice pede-lhe confirmação primeiro.
- A conta e estes dois botões só aparecem aqui, em Configurações ▸ IA. O GenOffice mostra a conta e não a guarda em lado nenhum.

## Que IA é usada

**IA em uso**, em Configurações ▸ IA, começa em **Automático**. O Automático decide por esta ordem:

1. O Claude, quando o cartão dele diz Conectado.
2. Caso contrário o Codex, quando o cartão dele diz Conectado.
3. Caso contrário não há nenhuma IA conectada, e o painel de IA mostra o guia de conexão em vez de um erro.

O Automático nunca escolhe nada que custe dinheiro extra: nem uma chave de API, nem um login de pagamento por consumo. Esses só são usados enquanto os escolher por si.

Também pode escolher uma IA por si, no mesmo sítio ou na lista de modelos ao fundo do painel de IA. Se a que escolheu deixar de funcionar, o GenOffice não passa discretamente para outra. Diz-lhe o que aconteceu e mostra como voltar a conectar.

A lista de modelos mostra os modelos que o próprio programa indica: cada um com o seu nome e, ao lado, o identificador exato, e **Modelo padrão** indica a que modelo corresponde neste momento. A etiqueta na parte inferior do painel de IA e **IA em uso** também indicam esse modelo. Ler a lista não pergunta nada à IA, pelo que não conta para o seu plano. Se o programa for demasiado antigo para indicar os seus modelos, é mostrada em vez disso uma lista curta incorporada.

Onde quer que o Codex possa ser escolhido, aparece junto dele uma linha: «Usar uma assinatura do Codex dentro de um aplicativo não é um método oficialmente recomendado pela OpenAI.» Decida tendo isso em conta.

## Quando um pedido é interrompido

Um pedido para quando o limite do plano se esgota, quando o login expirou ou quando o programa já não existe. O GenOffice não muda sozinho para outra IA.

- O motivo é mostrado no ponto em que a resposta parou. No caso de um limite esgotado, também é mostrada a hora a que é reposto, quando o programa a indica.
- Se a sua outra assinatura estiver conectada, aparece um botão **Continuar com …**, por exemplo **Continuar com Codex**. Clicar nele faz dessa a IA em uso — a lista de modelos mostra a mudança — e volta a executar o pedido.
- Se a única outra conexão for um login de pagamento por consumo que autorizou, o mesmo botão vem acompanhado de uma nota sobre o custo.
- Nunca há um botão que o leve para uma chave de API.

## A linha de utilização

Depois de ter usado 80% ou mais de um limite, o painel de IA mostra uma linha como «85% usado · redefine às 15:00». O Claude indica um limite de 5 horas e um limite de 7 dias, e o Codex é mostrado da mesma forma quando os indica. Abaixo de 80%, ou quando o programa não indica nada, não é mostrada nenhuma linha.

## O que é enviado, e para onde

Na primeira vez que uma assinatura pode ser usada, o GenOffice mostra um aviso, uma única vez. Para o voltar a ler, vá a Configurações ▸ IA ▸ **Aviso da primeira conexão** e clique em **Ver novamente**. Diz três coisas:

- O conteúdo do documento e a sua conversa são enviados à Anthropic ou à OpenAI pela sua própria conta.
- Se esse conteúdo é usado para treinar IA depende das configurações da sua própria conta nessa empresa, não do GenOffice.
- O GenOffice desativa o salvamento do histórico de conversas do Codex, mas o Codex ainda pode manter seus próprios registros de diagnóstico neste PC.

Tudo o que ocultou com **Ocultar a seleção da IA** não é enviado, seja qual for a IA que use.

## Convém saber

- **Velocidade.** Uma resposta através de uma assinatura começa alguns segundos mais tarde do que uma através de uma chave de API, porque o programa da empresa tem primeiro de arrancar.
- **Plano gratuito do ChatGPT.** Aparece como Conectado, mas os limites são pequenos, por isso os pedidos param mais cedo. A linha de utilização não aparece para ele.
- **Geração de imagens.** Nesta versão, uma assinatura não gera imagens, em nenhum plano. Para isso é precisa a chave de um fornecedor de imagens; consulte [Modelos de IA e configurações](help://ai-models).
- **Proxies.** O Claude Code e o Codex não recebem as definições de proxy do GenOffice. Usam o proxy definido para este PC, por exemplo a variável de ambiente `HTTPS_PROXY`, tal como quando os executa num terminal. Se não conseguirem ligar-se num terminal, também não conseguem a partir daqui.
- **Comandos e outros programas.** Um pedido que chega do comando `ieumoffice` ou de um agente de programação conectado não usa a sua assinatura, a menos que o autorize. Consulte [Conectar um agente de programação](help://mcp).
