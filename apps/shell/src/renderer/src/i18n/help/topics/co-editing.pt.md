# Edição conjunta na sua rede

Pessoas na mesma rede (LAN) podem abrir um documento juntas, editá-lo ao mesmo tempo e ver os cursores e os nomes umas das outras. Não há servidor nem conta: o PC que compartilha o documento conduz a sessão, e só esse PC salva o arquivo.

## Compartilhar um documento

1. Abra o documento e clique em **Colaborar** na barra de ferramentas do editor.
2. Digite **Meu nome** e escolha **Minha cor**. Os outros veem isso ao lado do seu cursor.
3. Clique em **Começar a compartilhar**. Aparecem um **PIN** de 6 dígitos e o **Endereço deste PC**.
4. Passe o PIN para quem vai participar, e também o endereço se a pessoa não encontrar o documento.

Salve o documento antes se ele tiver alterações não salvas. Documentos protegidos por senha não podem ser compartilhados. **Novo PIN** dá ao documento um novo PIN; quem já entrou continua na sessão.

Para parar, abra **Colaborar** de novo e clique em **Parar de compartilhar**. Todos que participaram ficam com uma cópia não salva no próprio PC.

## Participar

1. Em qualquer editor, clique em **Colaborar** e mude para **Participar**.
2. Escolha o documento em **Encontrados** ou digite o endereço do PC que está compartilhando em **Endereço**.
3. Digite o PIN e clique em **Participar**. O documento compartilhado abre em uma nova guia.

Enquanto você participa, quem salva o arquivo é a pessoa que está compartilhando. O seu Salvar não faz nada e avisa você disso, e a guia nunca pede para ser salva quando você a fecha. **Sair** tira você da sessão. Quando a sessão termina, a guia continua aberta como uma cópia não salva, que você pode salvar onde quiser.

## Editar em conjunto

- O cursor ou a seleção de cada pessoa aparece na cor dela, com o nome dela.
- Desfazer só desfaz as suas próprias edições.
- Alguns recursos ficam desativados durante uma sessão, por exemplo os que alteram partes do documento além do conteúdo. O editor avisa quando recusa um deles.
- No editor Hangul, só a pessoa que está compartilhando edita. Quem participa acompanha as alterações ao vivo.
- Arquivos de texto simples e JSON abrem na visão de código do editor Markdown e ainda não podem ser compartilhados.

## Segurança

- O PIN nunca é enviado pela rede. Ele é verificado com uma troca de chaves, e tudo o que vem depois é criptografado. Outras pessoas na rede não conseguem ler o documento, as edições nem o PIN.
- Depois de 5 PINs errados vindos de um mesmo PC, esse PC precisa esperar 10 minutos. Depois de 20 PINs errados no total, todos os documentos compartilhados recebem um novo PIN e a pessoa que está compartilhando é avisada.
- Até 16 pessoas podem participar de um documento.
- Enquanto você compartilha, seu nome e o título do documento são anunciados na rede para que outras pessoas possam encontrá-lo.
- Na primeira vez que você compartilhar, o Firewall do Windows pode pedir permissão. Permita em redes privadas. Se você bloquear, os outros PCs não conseguirão se conectar.
