# Projets

Un projet, c’est un dossier de votre PC. Choisissez un projet dans un panneau IA, et l’IA travaille en connaissant les fichiers, les consignes, la mémoire et les conversations de ce dossier. Rangez les documents d’un même travail dans un même dossier : une conversation commencée dans Docs peut se poursuivre dans Hangul ou Slides, sans qu’il faille réexpliquer le contexte dans chaque document.

## Choisir un projet

- Dans le panneau IA de chaque éditeur et dans **Demander à l’IA** sur l’Accueil, le nom du projet en cours s’affiche à gauche, sous la zone de saisie. Si aucun n’est choisi, on lit **Sans projet**.
- Cliquez dessus pour ouvrir la liste : les projets **Épinglés** et **Récents**, **Nouveau projet**, **Ajouter un dossier** et **Sans projet**. Tapez dans la case du haut pour chercher ; si aucun projet ne correspond, vous pouvez en créer un portant ce nom.
- Au survol d’une ligne apparaissent l’épingle, **Ouvrir le dossier** et **Retirer de la liste**. Retirer un projet de la liste ne touche ni au dossier ni à ses fichiers.
- Un projet dont le dossier a été déplacé ou supprimé apparaît en grisé avec la mention **Dossier introuvable**. Cliquez dessus et choisissez le dossier à son nouvel emplacement pour continuer avec le même projet.
- Quand vous ouvrez un document situé dans un dossier de projet, ce projet est déjà choisi. Si vous passez ce document sur **Sans projet**, il le reste à sa prochaine ouverture. Un projet choisi pour un document hors du dossier est lui aussi mémorisé pour ce document.
- Le projet choisi s’applique à partir de la requête suivante dans ce panneau. En changer en pleine conversation en démarre une nouvelle ; celle que vous aviez reste à sa place.

## Nouveau projet et Ajouter un dossier

- **Nouveau projet** : saisissez un nom, et un dossier de ce nom est créé dans votre dossier d’enregistrement par défaut (`Documents\GenOffice` au départ, modifiable dans les Paramètres). **Créer ailleurs…** permet de choisir un autre emplacement. Si un dossier de ce nom existe déjà, on vous demande s’il faut l’utiliser comme projet ; **Utiliser ce dossier** démarre avec lui. Si ce dossier est déjà un projet de votre liste, il s’ouvre directement, sans question.
- **Ajouter un dossier** (**Utiliser un dossier existant** sur l’écran Projets de l’Accueil) : utilise un dossier que vous avez déjà, sous-dossiers compris. Un lecteur entier, tout votre dossier utilisateur et les dossiers qui contiennent des données de connexion ou les données de l’application ne peuvent pas être choisis.
- Si vous ouvrez un document situé dans un dossier de projet absent de votre liste, « Ce document se trouve dans le dossier de projet “…” » s’affiche sous la zone de saisie, avec un bouton **Utiliser**. Cliquer dessus revient à ajouter le dossier.
- Quand un dossier reçu de quelqu’un d’autre contient déjà des consignes ou une mémoire, un `AGENTS.md` ou un `CLAUDE.md`, ou des conversations écrites sur un autre PC, l’application vous les montre une fois et vous demande quoi faire. **Tout afficher** permet de tout lire d’abord. **Utiliser avec les consignes** prend le tout. **Utiliser sans les consignes** tient ces consignes et cette mémoire à l’écart de l’IA, masque les conversations venues d’autres PC et cesse d’ajouter à la mémoire ; la lecture des fichiers continue de fonctionner. Vous pourrez changer plus tard avec **Utiliser aussi les consignes** sur la page du projet. **Annuler**, ou fermer la question sans choisir, n’ajoute pas le dossier.
- Ensuite, la question ne revient plus. Si les consignes ou la mémoire sont modifiées en dehors de GenOffice, le panneau IA affiche une fois « Consignes modifiées », et **Voir** ouvre la partie correspondante de la page du projet.

## Consignes et mémoire

- Les **consignes** sont les règles de ce projet, par exemple « Rédiger les rapports sous forme de puces et ne jamais abréger le nom de l’organisme ». Écrivez-les sur la page du projet dans l’Accueil, puis appuyez sur **Enregistrer**. Si le haut du dossier contient `AGENTS.md` ou `CLAUDE.md`, ces fichiers sont lus aussi, et vous pouvez les désactiver sur la page du projet.
- La **mémoire** rassemble les notes que l’IA prend pendant les conversations : des faits, des préférences et des décisions utiles pour la suite, une ligne datée pour chacune. Chaque fois qu’elle en écrit une, le panneau IA affiche « Mémorisé : … » avec un bouton **Supprimer**. Si cette note a déjà été supprimée, la ligne indique « Mémoire effacée : … » et n’a pas de bouton **Supprimer**. Elle ne vous demande pas votre accord avant.
- Quand la mémoire s’allonge, le panneau IA affiche « La mémoire devient longue » avec **Mettre en ordre**. Ce bouton fusionne les notes qui se recoupent ou qui sont dépassées. La version précédente est conservée, et **Annuler** la rétablit. Le rangement n’a lieu que si vous appuyez sur le bouton, et il envoie une requête à l’IA.
- Sur la page du projet, vous pouvez supprimer des notes, modifier toute la mémoire et désactiver la mémoire. Désactivée, elle ne reçoit plus rien de nouveau, mais la mémoire existante est toujours lue.
- Des consignes très longues perdent leur fin, et le panneau IA vous le signale. La mémoire est toujours envoyée en entier, quelle que soit sa longueur.

## Les fichiers que voit l’IA

- À chaque requête, l’IA reçoit le nom du projet, ses consignes et sa mémoire, ainsi que la liste des noms des fichiers du dossier. Elle lit elle-même le contenu d’un fichier quand elle en a besoin, de la même manière qu’une pièce jointe : les parties masquées à l’IA le restent.
- Elle ne lit pas les documents ouverts qui ont des modifications non enregistrées, les fichiers cachés dont le nom commence par un point, ni le dossier `.ieumoffice`.
- Pour tenir un fichier à l’écart de l’IA, appuyez sur **Masquer à l’IA** dans la partie Fichiers de la page du projet. C’est réversible. Le fichier apparaît toujours dans les résultats de recherche de l’Accueil.
- Dans les dossiers synchronisés par OneDrive, Google Drive et services semblables, les fichiers qui ne sont pas téléchargés sur ce PC apparaissent comme « Pas sur ce PC ». Quand l’IA veut en lire un, on vous demande d’abord s’il faut le télécharger.
- Tapez `@` dans la zone de saisie : « Fichiers de ce projet » apparaît après les documents ouverts. En choisir un le joint. Voir [Le panneau d’assistant IA](help://ai-panel).
- Les nouveaux documents que l’IA crée dans un projet sont enregistrés dans le dossier du document en cours, ou en haut du dossier de projet si la demande vient de l’Accueil. Si le nom est déjà pris, `(2)` est ajouté pour qu’aucun fichier ne soit remplacé.

## Conversations

- Un panneau IA où un projet est choisi affiche en haut le titre de la conversation en cours. Cliquez dessus pour voir la liste des conversations de ce projet, une case de recherche et **Nouvelle conversation**. N’importe quelle conversation de la liste peut être reprise dans n’importe quel éditeur.
- Ce qui a été fait dans un autre éditeur s’affiche sur une ligne, par exemple « 3 outils exécutés dans Hangul “rapport.hwp” ». L’IA n’utilise que les outils de l’éditeur où vous êtes.
- À l’ouverture d’un document, c’est la dernière conversation utilisée dans ce document qui s’affiche. Si deux fenêtres ont la même conversation ouverte, un message envoyé dans l’une apparaît aussitôt dans l’autre.
- Les conversations écrites sur un autre PC portent la mention **Autre PC**.
- Vous pouvez renommer ou supprimer des conversations dans la liste. Une conversation supprimée part à la corbeille.
- Les conversations qu’un document avait avant l’arrivée de cette fonction se trouvent en bas de la liste, sous **Conversations précédentes de ce document**.
- Les conversations **Sans projet** sont enregistrées document par document, comme avant. Dans Demander à l’IA sur l’Accueil, sans projet, la conversation prend fin à la fermeture de l’application.

## La page du projet dans l’Accueil

**Projets**, dans la barre latérale de l’Accueil, est l’endroit où l’on crée un **Nouveau projet**, où l’on choisit **Utiliser un dossier existant**, et où l’on ouvre un projet pour le gérer.

- **En-tête** : le nom (le changer ne renomme pas le dossier), le chemin du dossier, **Ouvrir dans l’Explorateur de fichiers** (sur Mac, **Afficher dans le Finder**), et l’état. Quand le projet est utilisé sans consignes, **Utiliser aussi les consignes** apparaît.
- **Consignes** : la zone des consignes, et les `AGENTS.md` et `CLAUDE.md` lus avec elle.
- **Mémoire** : la liste des notes, **Tout modifier**, **Mettre en ordre**, mémoire activée ou désactivée.
- **Fichiers** : les fichiers que voit l’IA et ceux qui lui sont cachés. Cliquez sur un nom de fichier pour l’ouvrir.
- **Conversations** : les conversations de ce projet. Cliquez sur l’une d’elles pour ouvrir le document où elle a servi en dernier et la poursuivre dans ce panneau IA.
- Cette page relit le dossier chaque fois qu’elle s’affiche : une note que l’IA vient de mémoriser apparaît sans la quitter. Si le fichier des consignes ou de la mémoire a changé hors de GenOffice pendant que vous le modifiiez, **Enregistrer** demande d’abord : **Recharger** lit le fichier modifié, **Enregistrer quand même** le remplace par vos modifications.

## Ce qui reste dans le dossier, et ce qu’il faut savoir

- Les consignes, la mémoire et les conversations sont conservées sous forme de fichiers texte dans un dossier `.ieumoffice`, à l’intérieur du dossier de projet. Déplacez le dossier ou copiez-le sur un autre PC, et elles suivent. Sur l’autre PC, choisissez-le une fois avec **Ajouter un dossier** dans un panneau IA, ou **Utiliser un dossier existant** sur l’écran Projets de l’Accueil.
- Le dossier `.ieumoffice` n’est créé que lorsqu’il y a quelque chose à écrire. Vous pouvez ouvrir et modifier ses fichiers dans le Bloc-notes.
- Ce que vous tapez dans une conversation peut se retrouver dans la mémoire. Pour écarter quelque chose, supprimez-le avec **Supprimer** sur la ligne « Mémorisé », ou désactivez la mémoire.
- Si vous choisissez un dossier synchronisé comme projet, ses consignes, sa mémoire et ses conversations sont aussi envoyées vers ce service. L’application vous le dit une fois, la première fois que vous le choisissez.
- Dans un dossier partagé utilisé par plusieurs personnes, la mémoire et les conversations peuvent se mélanger.
- Dans un dossier où l’application ne peut pas écrire, par exemple en lecture seule, les consignes et la lecture des fichiers fonctionnent toujours, mais les conversations et la mémoire ne sont pas enregistrées. Le panneau IA vous le signale.
- La fenêtre de l’agent n’utilise pas encore les projets. Un agent peut aussi modifier les fichiers du dossier `.ieumoffice` d’un dossier ; dans un dossier dont vous ne connaissez pas le contenu, utilisez donc l’un des modes qui demandent d’abord. Voir [Mode agent](help://agent-mode).
