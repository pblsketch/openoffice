# Instalar o GenOffice

Todas as versões são publicadas na [página de lançamentos](https://github.com/pblsketch/openoffice/releases/latest) do projeto no GitHub. A versão para Windows é publicada juntamente com versões para Mac e Linux, lançadas como beta. O programador não consegue testar diretamente as versões para Mac e Linux; são confirmadas através dos relatos dos utilizadores.

## Escolher o ficheiro para a sua máquina

| Plataforma                              | Requisitos                                     | Ficheiro                          |
| --------------------------------------- | ---------------------------------------------- | --------------------------------- |
| **Windows**                             | Windows 10 ou posterior, Intel/AMD de 64 bits  | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon           | macOS 12 ou posterior, chip M1 ou mais recente | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                   | macOS 12 ou posterior, processador Intel       | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, qualquer distribuição | 64 bits (x86_64)                               | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, família Ubuntu/Debian | 64 bits (x86_64)                               | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE  | 64 bits (x86_64)                               | `ieumoffice-<version>.x86_64.rpm` |

Para ver que Mac tem, abra o menu Apple ▸ **Acerca deste Mac**. Se em «Chip» aparecer Apple M…, escolha o ficheiro que termina em `-arm64.dmg`; se em «Processador» aparecer Intel …, escolha o que termina em `-x64.dmg`. Os outros ficheiros da página de lançamentos (`.zip`, `.yml`, `.blockmap`) são os que a própria aplicação usa para se atualizar; não precisa de os transferir. As versões mais antigas permanecem na página de lançamentos.

## No Windows

1. Transfira `GenOffice-Setup-<version>.exe` a partir da página de lançamentos.
2. Execute-o. O instalador não tem assinatura digital, por isso o Windows pode mostrar primeiro uma janela azul «O Windows protegeu o seu PC». Escolha **Mais informações** e depois **Executar mesmo assim**. O texto exato depende da sua versão do Windows.
3. Siga o instalador até ao fim.

Ele coloca o GenOffice no menu Iniciar e regista `.docx`, `.xlsx`, `.pptx`, `.pdf` e afins, para que um clique duplo num ficheiro o abra.

Como o instalador não está assinado, execute apenas um que tenha transferido da página de lançamentos indicada acima.

## Quando o Windows bloqueia a transferência ou a instalação

### O Edge diz que o ficheiro «não é normalmente transferido»

O Microsoft Defender SmartScreen avisa desta forma sobre um ficheiro que ainda não viu muitas pessoas transferir. O guia da Microsoft para manter o ficheiro é o seguinte:

1. Abra a lista de transferências do Edge (**Ctrl+J**), clique em **…** junto ao ficheiro e escolha **Manter**.
2. Na janela que se abre, clique em **Mostrar mais** e depois em **Manter mesmo assim**. O ficheiro fica na sua pasta Transferências.

Essa janela também tem um botão que comunica que o ficheiro é seguro. Esse botão só abre a página de denúncias da Microsoft (`feedback.smartscreen.microsoft.com`) e não mantém o ficheiro. Feche essa página e clique antes em **Mostrar mais** na janela.

Se a janela não tiver **Mostrar mais** ou não tiver **Manter mesmo assim**:

- Num PC gerido por uma escola ou empresa, o administrador pode desativar a possibilidade de ignorar estes avisos (uma política do Edge). Nesse caso ninguém nesse PC consegue manter o ficheiro; peça ao administrador que o instale ou que o permita.
- Transferir a partir da página de lançamentos noutro navegador dá-lhe o mesmo ficheiro.
- Se nenhuma das opções resultar e o PC for seu, o guia da Microsoft para resolver problemas de transferências permite, como último recurso, desativar o Microsoft Defender SmartScreen por um momento: no Edge, abra **Definições e mais (…) ▸ Definições ▸ Privacidade, pesquisa e serviços ▸ Segurança**, desative o **Microsoft Defender SmartScreen**, transfira o ficheiro novamente e volte a ativá-lo de imediato. Enquanto está desativado, o Edge não o avisa nem sobre transferências nem sobre sites perigosos, como páginas de phishing.

### Aparece a janela «O Windows protegeu o seu PC»

O Microsoft Defender SmartScreen mostra esta janela na primeira vez que vê um instalador sem assinatura. Clique em **Mais informações** e aparece o botão **Executar mesmo assim**. Num PC gerido por uma escola ou empresa, uma definição do administrador pode ocultar esse botão; fale com o administrador.

### O Controle Inteligente de Aplicativos bloqueia-o

Quando o Controle Inteligente de Aplicativos do Windows 11 está ativado, impede os instaladores sem assinatura e não oferece o caminho de **Mais informações**. A Microsoft indica que não há forma de permitir uma única aplicação: a única opção é desativar o Controle Inteligente de Aplicativos, em **Segurança do Windows ▸ Controle de aplicativos e navegador ▸ Configurações do Controle Inteligente de Aplicativos**. Isso retira esta proteção também a todas as outras aplicações. Com as atualizações recentes do Windows, é possível voltar a ativá-lo sem reinstalar o Windows.

## Num Mac (beta)

Precisa do macOS 12 (Monterey) ou posterior. A versão para Mac não tem assinatura de programador da Apple, por isso, na primeira vez que a abre, o macOS diz que não consegue verificar se a aplicação está livre de software malicioso e não a abre. Permita-a uma só vez, como abaixo.

1. Abra o dmg e arraste `GenOffice.app` para a pasta **Aplicações**.
2. Abra o GenOffice a partir da pasta Aplicações. Quando aparecer o aviso, clique em **Concluído**.
3. Abra **Definições do Sistema ▸ Privacidade e segurança**. Perto do fim, junto à linha que diz que o GenOffice foi bloqueado, clique em **Abrir mesmo assim** e introduza a palavra-passe do Mac. O botão aparece durante cerca de uma hora depois de ter tentado abrir a aplicação.
4. Na janela que aparece de novo, clique em **Abrir**. A partir daí abre sem aviso.

No macOS 12 o local é **Preferências do Sistema ▸ Segurança e privacidade ▸ Geral**, e o botão aí é **Abrir mesmo assim**.

Se o macOS disser que a aplicação «está danificada e não pode ser aberta», não a mova para o Lixo. Execute a linha abaixo no Terminal, abra a aplicação de novo e permita-a como acima. Ela remove a marca que o macOS associa aos ficheiros transferidos da internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Se o macOS disser que a aplicação não é suportada neste Mac, verifique duas coisas:

- Um Mac Intel não consegue executar o ficheiro para Apple Silicon (`-arm64.dmg`). Veja «Processador» em **Acerca deste Mac**, apague a aplicação que instalou e instale antes o ficheiro `-x64.dmg`.
- O macOS 11 ou anterior não consegue executar o GenOffice. **Acerca deste Mac** também mostra a versão do macOS.

Ainda num Mac:

- Os cartões de ligação da IA não têm botão de instalação. Siga a ligação para o guia oficial de instalação no cartão para instalar o Claude Code ou o Codex. O aplicativo de desktop do Claude não é o Claude Code, então é preciso instalar o Claude Code mesmo que o aplicativo de desktop já esteja instalado.
- O início de sessão termina no navegador. Se o navegador pedir para colar um código, execute você mesmo `claude auth login` ou `codex login` no Terminal. Consulte [Conexão por assinatura](help://subscription).

## No Linux (beta)

- **AppImage**: torne-o executável (`chmod +x GenOffice-<version>.AppImage`) e execute o ficheiro. Não há passo de instalação.
- **deb**: instale com `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: instale com `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. No openSUSE, use `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Os pacotes deb e rpm instalam-se em `/opt/GenOffice` e ligam o comando de terminal `/usr/bin/ieumoffice`. Tal como num Mac, os cartões de ligação da IA não têm botão de instalação e, quando um início de sessão pede um código, é você que executa `claude auth login` ou `codex login` num terminal.

## Atualizações

- O GenOffice procura uma versão mais recente na mesma página de lançamentos do GitHub. Quando é publicada uma, **Configurações ▸ Sobre** propõe-na: clique em **Atualizar para …**, aguarde a transferência e depois clique em **Reiniciar e instalar**. No Windows, uma janela mostra o progresso da instalação; ao terminar, o GenOffice abre de novo com os documentos que estavam abertos. No Mac, o aplicativo fecha, é substituído pela nova versão e abre de novo com os documentos que estavam abertos. Isso vale para um aplicativo na pasta Aplicativos; um aplicativo aberto direto da imagem de disco indica a página de download. A atualização só é instalada quando você pressiona esse botão, nunca ao simplesmente fechar o aplicativo.
- No Linux só o AppImage se atualiza sozinho. Com uma instalação deb ou rpm, a aplicação avisa-o da nova versão e abre a página de transferência; instale o novo ficheiro da mesma forma.
- **Menu (☰) ▸ Procurar atualizações…** verifica sempre que o pedir. Num Mac, é **Ajuda ▸ Procurar atualizações…**.
- Quando a verificação falha — sem rede, ou ainda nada publicado —, não acontece nada e a aplicação continua a funcionar como antes.
- **Canal de atualização**, também em Configurações ▸ Sobre, é Estável ou Beta. Alterá-lo tem efeito imediato e verifica se existe uma atualização; não reverte uma instalação Beta para Estável.
- As atualizações também não têm assinatura digital. Antes de instalar uma, a aplicação compara o ficheiro transferido com a soma de verificação publicada com essa versão.
- Se **Reiniciar e instalar** fechar a aplicação mas a nova versão não aparecer, o próximo arranque avisa disso e volta a oferecer a atualização. Desta vez o instalador abre na sua própria janela, para que o possa acompanhar e responder a um pedido de administrador. Se mesmo assim não funcionar, a janela de atualização aponta para a página de transferência; instalar com o ficheiro obtido aí mantém as suas definições e documentos. O que o atualizador fez fica registado em `update-log.txt`, na pasta de dados da aplicação (escreva `%APPDATA%\GenOffice` na barra de endereço do Explorador de Ficheiros para a abrir). Anexe esse ficheiro ao comunicar o problema.

## A versão que está a executar

**Configurações ▸ Sobre** é onde a aplicação comunica a versão que tem, o canal que segue e onde vive o projeto. Também indica o projeto de código aberto em que esta aplicação se baseia.

## A linha de comandos vem de brinde

Todas as instalações incluem um comando `ieumoffice` que fala com os mesmos motores que a janela usa, por isso os dois nunca discordam sobre um ficheiro. `ieumoffice install-cli` coloca-o no seu `PATH`. Consulte [Linha de comandos e agentes](help://cli) para saber o que ele sabe fazer.
