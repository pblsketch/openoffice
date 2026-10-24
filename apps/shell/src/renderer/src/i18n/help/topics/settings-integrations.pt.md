# Configurações, idioma, tema e integrações MCP

## Abrir as configurações

A linha no canto inferior esquerdo do ecrã Início abre o painel de configurações (mostra Conectar IA enquanto não houver uma IA conectada). O painel tem cinco secções: Conta, IA, Geral, Integrações e Sobre.

**Conta** mostra em que estado estão as suas assinaturas do Claude e do Codex, e **Gerenciar conexões** leva à secção IA. A IA tem os seus próprios artigos: [Conexão por assinatura](help://subscription) e [Modelos de IA e configurações](help://ai-models).

## Idioma

- As configurações oferecem **21 idiomas de interface**: inglês, chinês simplificado, japonês, coreano, francês, alemão, espanhol, tailandês, indonésio, russo, árabe, português, italiano, polaco, tcheco, neerlandês, malaio, hebraico, híndi, chinês tradicional e vietnamita.
- A troca aplica-se de imediato e persiste; e a barra de menus do sistema é reconstruída com o novo idioma.

## Tema

Claro / Escuro / Seguir o Sistema. O modo Seguir o Sistema acompanha o aspeto do sistema operativo, e os editores mudam de aspeto em sincronia sem cintilação.

## Geral

- **Posição da barra lateral de IA** (esquerda ou direita), **Tamanho do texto do painel de IA** e **Verificação ortográfica no chat de IA**.
- **Abrir o painel de IA em novos documentos** — desativado, um novo documento começa com o painel recolhido, a um clique de distância.
- **Salvar automaticamente todos os documentos** ativa a gravação automática por predefinição em todos os editores; continua a poder desativá-la para uma janela.
- **Local de salvamento** com o botão **Alterar** e **App padrão para documentos do Office** para reservar .docx / .xlsx / .pptx ao GenOffice.

O GenOffice não recolhe nem envia estatísticas de utilização, por isso não há nenhum interruptor para isso.

## IA ▸ Avançado

Fica fechado até o abrir; a maioria das pessoas nunca precisa dele. O separador **Modelo de IA** guarda as chaves de API e os servidores que executa por conta própria, para a conversa. No separador **Mídia e busca de IA**, cada capacidade escolhe o fornecedor que a serve, e a chave e o URL base de um fornecedor são introduzidos uma vez e partilhados:

- **Busca na web**, **Geração de imagens**, **Análise de imagens** e **Análise de vídeo**, cada uma com um fornecedor, um modelo, uma chave e um URL base.
- A **busca de arquivos local** roda nesta máquina. Abaixo dela, o **reranking de busca Jev** vem **desligado por padrão**. Ao ligar, os trechos dos 20 primeiros acertos locais — até 1.200 caracteres por documento, mais nomes de arquivos e pastas — vão para o endpoint de decisão escolhido (Jev via OpenRouter ou TypeSafe, Perplexity, Liquid AI d1, Cloudflare, um motor local ou URL própria) para reordenar por relevância. Desligado, nada sai do aparelho.
- **Permitir que solicitações automáticas usem uma assinatura** vem **desligado por padrão**. Decide se um pedido vindo da linha de comandos ou de um agente de programação conectado pode usar a sua assinatura do Claude ou do Codex; consulte [Conectar um agente de programação](help://mcp).

## Sobre

- **Versão**, o endereço do projeto no GitHub e uma linha que indica o projeto de código aberto em que esta aplicação se baseia.
- **Canal de atualização**: Estável ou Beta. Alterá-lo tem efeito imediato e verifica se existe uma atualização; não reverte uma instalação Beta para Estável.

## Associações de aplicações predefinidas

As Configurações podem registar o GenOffice como a aplicação que abre ficheiros .docx / .xlsx / .pptx / .pdf e semelhantes (registo de aplicação predefinida ao nível do sistema; confirme quando for solicitado).

## Avisos de software de terceiros e atualizações

- Ajuda ▸ Avisos de software de terceiros: o inventário completo das licenças de código aberto que acompanha a aplicação.
- Menu (☰) ▸ Procurar atualizações… (num Mac, Ajuda ▸ Procurar atualizações…): inicia uma verificação manual; e se houver uma versão mais recente, o GenOffice propõe a instalação.

## Integração MCP (para utilizadores avançados / clientes de IA)

**Integrações** é o painel que liga o GenOffice a um agente de programação, e tem o seu próprio artigo: Ligar um agente de programação. A versão curta — escolha um caminho (a linha de comandos, ou MCP), siga essa secção e depois inicie uma conversa nova e pergunte.

Em **Servidor HTTP local**, a aplicação também pode arrancar o servidor por si — um interruptor de ativação e uma porta —, enquanto **Avançado** acrescenta o URL de verificação de integridade e o arquivo de registro, em vez de o deixar ao assistente. Escuta apenas em localhost.

## Folha de referência da linha de comandos

| Comando             | O que faz                    |
| ------------------- | ---------------------------- |
| `ieumoffice <file>` | abrir um ficheiro            |
| `ieumoffice mcp`    | iniciar o servidor MCP local |
| `ieumoffice --help` | todos os comandos e opções   |
