# Instalar o GenOffice

Todas as versões são publicadas na [página de lançamentos](https://github.com/pblsketch/openoffice/releases/latest) do projeto no GitHub. Esta versão é lançada para Windows.

## Escolher o ficheiro para a sua máquina

| Plataforma  | Requisitos                                    | Ficheiro                        |
| ----------- | --------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 ou posterior, Intel/AMD de 64 bits | `GenOffice-Setup-<version>.exe` |

As versões mais antigas permanecem na página de lançamentos.

## No Windows

1. Transfira `GenOffice-Setup-<version>.exe` a partir da página de lançamentos.
2. Execute-o. O instalador não tem assinatura digital, por isso o Windows pode mostrar primeiro uma janela azul «O Windows protegeu o seu PC». Escolha **Mais informações** e depois **Executar mesmo assim**. O texto exato depende da sua versão do Windows.
3. Siga o instalador até ao fim.

Ele coloca o GenOffice no menu Iniciar e regista `.docx`, `.xlsx`, `.pptx`, `.pdf` e afins, para que um clique duplo num ficheiro o abra.

Como o instalador não está assinado, execute apenas um que tenha transferido da página de lançamentos indicada acima.

## Atualizações

- O GenOffice procura uma versão mais recente na mesma página de lançamentos do GitHub. Quando é publicada uma, **Configurações ▸ Sobre** propõe-na: clique em **Atualizar para …**, aguarde a transferência e depois clique em **Reiniciar e instalar**.
- **Menu (☰) ▸ Procurar atualizações…** verifica sempre que o pedir. Num Mac, é **Ajuda ▸ Procurar atualizações…**.
- Quando a verificação falha — sem rede, ou ainda nada publicado —, não acontece nada e a aplicação continua a funcionar como antes.
- **Canal de atualização**, também em Configurações ▸ Sobre, é Estável ou Beta. Alterá-lo tem efeito imediato e verifica se existe uma atualização; não reverte uma instalação Beta para Estável.
- As atualizações também não têm assinatura digital. Antes de instalar uma, a aplicação compara o ficheiro transferido com a soma de verificação publicada com essa versão.

## A versão que está a executar

**Configurações ▸ Sobre** é onde a aplicação comunica a versão que tem, o canal que segue e onde vive o projeto. Também indica o projeto de código aberto em que esta aplicação se baseia.

## A linha de comandos vem de brinde

Todas as instalações incluem um comando `ieumoffice` que fala com os mesmos motores que a janela usa, por isso os dois nunca discordam sobre um ficheiro. `ieumoffice install-cli` coloca-o no seu `PATH`. Consulte [Linha de comandos e agentes](help://cli) para saber o que ele sabe fazer.
