# Connecter des serveurs MCP

Un serveur MCP est un service qui propose à l’IA des outils extérieurs à l’application, par exemple la recherche de textes de loi ou la consultation de documents gérés par votre équipe. Une fois un serveur connecté, les fenêtres IA de GenOffice peuvent appeler ses outils pendant une conversation. Vous décidez, outil par outil, ce que l’IA peut utiliser et comment.

## Ajouter un serveur

1. Ouvrez **Paramètres ▸ Intégrations** et cliquez sur **Ajouter un serveur** dans la carte **Serveurs MCP**.
2. Choisissez la façon de l’ajouter.
   - **Coller un texte de réglages** : collez en entier le texte de réglages fourni par le guide du serveur, puis cliquez sur **Lire**. GenOffice remplit les champs. Si un seul texte contient plusieurs serveurs, vous les confirmez un par un. Si le texte lit une clé ou une valeur dans une variable du PC (`${NOM}`), ce champ reste vide et c’est à vous de le remplir.
   - **Saisir** : indiquez un nom et l’adresse. Si le guide du serveur vous donne une clé, mettez-la dans le champ **Clé (facultative)**.
3. Lisez l’avis au-dessus du bouton d’ajout, puis cliquez sur **Ajouter**.
4. Dès l’ajout, GenOffice vérifie la connexion et récupère la liste des outils. Un serveur qui demande une connexion attend votre action au lieu d’ouvrir le navigateur. Cliquez sur **Vérifier la connexion** pour voir la liste des outils proposés par le serveur. Si le serveur demande une connexion, cliquez sur **Se connecter avec le navigateur** et terminez la connexion dans le navigateur.

Le nom d’un serveur se compose de lettres, de chiffres, de `-` et de `_`, sur 24 caractères au plus. L’IA voit les outils de ce serveur sous des noms de la forme `mcp__name__tool`. Si une compétence appelle des outils par des noms de cette forme, ajoutez le serveur sous le nom que la compétence utilise.

## Serveurs par adresse et serveurs sur ce PC

- Un serveur **par adresse** est joint par une adresse web. Les adresses sur Internet doivent commencer par `https://`. `http://` ne fonctionne que pour ce PC et pour les adresses de réseau privé, à la maison ou au travail, et vous confirmez d’abord que les clés et le contenu des documents circuleront sans chiffrement.
- Un serveur **sur ce PC** est un programme que GenOffice lance sur ce PC. L’écran d’ajout montre le programme exact, ses arguments et les noms des variables d’environnement qui lui sont transmises. Il ne s’exécute pour la première fois qu’après votre clic sur **Autoriser l’exécution**. Si la commande change plus tard, le serveur reste arrêté tant que vous ne l’autorisez pas de nouveau.
- Si un serveur sur ce PC a besoin d’un programme absent de ce PC (Node.js, ou uv pour les serveurs Python), GenOffice demande sur la carte du serveur, dans les paramètres, s’il doit le télécharger. La taille du téléchargement s’affiche, et rien n’est téléchargé tant que vous n’avez pas cliqué sur **Télécharger**. Les programmes téléchargés restent dans le dossier de données de GenOffice, et les réglages de votre PC ne sont pas modifiés.
- Un serveur sur ce PC démarre quand il est nécessaire et s’arrête après 10 minutes sans utilisation. Il s’arrête aussi quand vous fermez GenOffice.

## Choisir ce que chaque outil peut faire

- Pour chaque outil, choisissez **Toujours autoriser**, **Demander d’abord** ou **Ne pas utiliser**.
- Au départ, les outils que le serveur indique comme servant uniquement à lire sont sur **Toujours autoriser**, et tous les autres sur **Demander d’abord**.
- Quand l’IA appelle un outil réglé sur **Demander d’abord**, une carte apparaît dans la fenêtre IA. Regardez ce qui va être envoyé, puis cliquez sur **Autoriser cette fois**, **Toujours autoriser dans cette conversation** ou **Bloquer**. Rien ne s’exécute tant que vous n’avez pas cliqué. Arrêter l’IA ou fermer la fenêtre équivaut à bloquer.
- Si le serveur modifie la description d’un outil ou les valeurs qu’il accepte, cet outil affiche **À vérifier** et reste caché de l’IA tant que vous n’avez pas regardé la modification et cliqué sur **Approuver la modification**. Un changement dans les consignes que le serveur donne à l’IA se vérifie de la même façon.
- Les nouveaux outils d’un serveur sont activés avec les mêmes réglages de départ, et la carte ainsi que le bouton de la fenêtre IA affichent **Nouveaux outils : n**. Le repère disparaît quand vous ouvrez la liste des outils de ce serveur dans les paramètres.

## Utiliser les serveurs dans une fenêtre IA

- Les serveurs fonctionnent dans les fenêtres IA des éditeurs et dans Ask AI de l’accueil. Tant qu’un serveur est activé, un bouton **Serveurs connectés** apparaît à côté du champ de saisie.
- Cliquez dessus pour voir l’état de chaque serveur et pour en désactiver ou en activer un pour cette conversation seulement. Une nouvelle conversation démarre avec tous les serveurs que vous avez activés dans les paramètres. Un serveur dont la connexion n’a jamais été vérifiée affiche **Pas encore vérifié** ; vérifiez-la dans les réglages pour obtenir ses outils.
- Désactiver **Autoriser l’IA à utiliser les outils internet** sous **Paramètres ▸ Médias IA et recherche** retire aussi tous les outils des serveurs MCP.
- Quand une compétence attend un outil d’un serveur que vous ne pouvez pas utiliser pour le moment, l’IA indique dans sa réponse l’étape qu’elle n’a pas pu faire. **Paramètres ▸ Compétences** affiche aussi, à côté de la compétence, le serveur dont elle a besoin.
- La fenêtre de l’agent peut aussi utiliser les outils des serveurs activés. Les mêmes autorisations s’appliquent, et une session garde les réglages avec lesquels elle a démarré. Voir [Mode agent](help://agent-mode).

## Protéger ce que renvoie un serveur

Chaque serveur a l’option **Protéger ce que ce serveur renvoie**, activée au départ. Tant qu’elle est activée, dès que quelque chose renvoyé par ce serveur se trouve dans une conversation, les outils qui envoient des données hors de l’application s’arrêtent pour cette conversation : recherche sur le web, lecture d’une page à partir de son adresse, outils des autres serveurs MCP et ainsi de suite. Les outils du même serveur continuent de fonctionner. Démarrez une nouvelle conversation pour utiliser de nouveau les autres. Vous pouvez la désactiver pour un serveur qui ne fournit que des documents publics.

La fenêtre de l’agent ne peut pas maintenir cette protection. Quand une session démarre avec un tel serveur, la fenêtre vous le signale.

## Ce qui va où

- Quand l’IA appelle un outil, le texte choisi par l’IA est envoyé à ce serveur. Il peut contenir du contenu du document ouvert et des pièces jointes. Les parties masquées à l’IA restent masquées.
- Ce que le serveur renvoie est envoyé au fournisseur d’IA que vous utilisez. N’ajoutez que des serveurs dont vous faites confiance à l’exploitant.
- Les clés, les connexions et les valeurs des variables d’environnement sont conservées sur ce PC avec le chiffrement de votre système d’exploitation. Si ce PC ne peut pas les chiffrer, elles ne sont retenues que jusqu’à la fermeture de l’application.
- Supprimer un serveur efface ses clés et sa connexion, et demande au serveur de mettre fin à la connexion s’il le permet.
