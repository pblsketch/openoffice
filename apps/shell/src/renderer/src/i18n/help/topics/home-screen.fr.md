# L’écran d’accueil : où vivent vos fichiers

Accueil est la page de démarrage de GenOffice : une barre de navigation à gauche, des listes de fichiers et des cartes de création rapide à droite.

## Navigation dans la barre latérale

- **Récents** : les fichiers que vous avez ouverts récemment. Chaque ligne est datée — aujourd’hui, hier ou la date.
- **Favoris** : les fichiers que vous avez mis en favori. Survolez une ligne et cliquez sur l’étoile pour l’ajouter ou le retirer. **Déplacer vers un groupe** dans le menu ⋯ range les fichiers étoilés dans des groupes nommés ; la vue Étoilés filtre par groupe.
- **Guide de l’utilisateur** : ouvre ce manuel.
- **Ask AI** : le panneau de base de connaissances — posez des questions et recevez des réponses citées depuis vos fichiers étoilés (voir ci-dessous).
- **Projets** : les dossiers (projets) avec lesquels l’IA peut travailler. Créez un projet ou utilisez un dossier existant, puis ouvrez-en un pour gérer ses consignes, sa mémoire, ses fichiers et ses conversations. Voir [Projets](help://projects).
- **Dossiers** : les répertoires que vous ajoutez à la barre latérale avec **Ajouter un dossier…**, ou que vous y faites glisser depuis le gestionnaire de fichiers. Chacun devient une racine que vous pouvez ouvrir, dans laquelle créer des sous-dossiers, renommer et retirer ; une racine qui devient indisponible est signalée comme telle et peut être retirée de la liste. **Nouveau dossier** en crée un autre.
- **La ligne tout en bas** : indique si une IA est connectée — **Connecter l’IA**, ou le nom de l’abonnement connecté — et ouvre les Paramètres.

Il n’y a pas d’entrée Corbeille ici. Les fichiers supprimés vont dans la corbeille du système, et les restaurer relève de l’OS.

## La liste des fichiers

Chaque ligne affiche une icône, le nom du fichier, la date de modification et autres informations. Le **menu ⋯** de la ligne propose :

- **Ouvrir**, et **Afficher dans le dossier** pour localiser le fichier dans votre gestionnaire de fichiers.
- **Copier le chemin**.
- **Déplacer vers un dossier…** : ouvre un sélecteur de dossier et déplace réellement le fichier ; si la destination contient déjà un fichier de ce nom, vous pouvez ignorer, écraser ou renommer.
- **Renommer** : sur place, l’extension est conservée automatiquement.
- **Ajouter aux favoris / Retirer des favoris** — les favoris survivent aux redémarrages et suivent le fichier quand vous le renommez.
- **Dupliquer** : crée une copie dans le même dossier.
- **Supprimer** : déplace le fichier vers la corbeille du système — ce n’est pas une suppression définitive.
- **Retirer de la liste**, dans la vue **Récents** de premier niveau, pour faire disparaître une entrée sans toucher au fichier.

### Plusieurs fichiers à la fois

Cochez la case d’une ligne, ou faites ⌘/ctrl-clic, pour composer une sélection ; la case d’en-tête sélectionne tout ce qui est actuellement listé, et une barre au-dessus de la liste indique (**{n} sélectionné(s)**) combien sont sélectionnés et offre **Déplacer vers un dossier…** ainsi que **Supprimer les fichiers** pour l’ensemble. Vous pouvez aussi faire glisser une multi-sélection sur un dossier de la barre latérale.

## Recherche

La zone de recherche en haut porte sur deux choses à la fois :

- **Les noms de fichiers** : filtrage rapide par nom.
- **Le contenu des fichiers** : GenOffice indexe vos fichiers en arrière-plan (le texte des .docx/odt/xlsx/pptx/pdf/md/html), si bien que chercher dans le corps du texte trouve aussi des fichiers. La portée et les interrupteurs se règlent dans les paramètres de recherche.

## Cartes de démarrage rapide

Les cartes au-dessus des listes créent un document en une étape. Cliquer sur une carte crée un fichier de ce type et ouvre son éditeur — vous pouvez écrire tout de suite, ou laisser l’IA le rédiger (chaque éditeur a un **bouton IA** dans son ruban, et **Demander à l’IA** dans le menu contextuel de sélection).

Le nouveau fichier atterrit dans le dossier actuellement sélectionné dans la barre latérale ; sans sélection, il va dans le dossier par défaut.

Ce que fait chaque carte :

- **AI Docs** (.docx) : un document texte vierge dans l’éditeur Docs. Le fichier n’est écrit sur le disque qu’à la **première sauvegarde** ; les nouveaux documents s’ouvrent avec le panneau IA déplié (désactivez-le dans Paramètres → « Ouvrir le panneau IA dans les nouveaux documents »).
- **AI Sheets** (.xlsx) : un tableur vierge dans l’éditeur Sheets. Tant que vous n’avez pas enregistré, aucun fichier n’existe sur le disque — le nom est réservé pour la première sauvegarde ; après la première génération par l’IA, le fichier peut aussi être renommé automatiquement d’après son contenu.
- **AI Slides** (.pptx) : une présentation vierge dans l’éditeur Slides.
- **AI Markdown** (.md) : un document Markdown vierge dans l’éditeur Markdown.
- **AI HTML** (.html) : une page web vierge dans l’éditeur HTML.
- **AI PDF** (.pdf) : différent des autres — il crée **immédiatement** un vrai PDF vierge d’une seule page dans le dossier cible et l’ouvre comme un fichier ordinaire (l’éditeur PDF travaille sur de vrais fichiers). Pratique pour annoter, caviarder ou ajouter du texte ; le fichier peut être renommé automatiquement d’après son contenu à la première sauvegarde.
- **Ouvrir un fichier local** : un sélecteur de fichiers du système pour Word (.docx/.doc/.odt), Excel (.xlsx/.xlsm/.xls/.csv/.tsv), PowerPoint (.pptx/.ppt), PDF, Markdown (.md/.markdown) et pages web (.html/.htm). La sélection multiple fonctionne ; chaque fichier obtient son propre onglet. Les fichiers texte (.txt, .json) s'ouvrent aussi ici — ils arrivent dans la vue source de l'éditeur Markdown.

> Astuce : Fichier ▸ Nouveau dans la barre de menus crée les mêmes types de documents (⌘N/Ctrl+N crée un document texte par défaut) ; faire glisser un fichier dans la fenêtre l’ouvre.

## Interrogez votre base de connaissances

- Étoilez d'abord des fichiers (tout type que l'app lit) ; l'en-tête du panneau compte le corpus, et une base vide vous invite à aller étoiler.
- Les réponses citent leurs fichiers d'origine ; cliquez une citation pour ouvrir le fichier dans son éditeur.
- Nécessite une IA connectée ; voir [Connexion par abonnement](help://subscription). La conversation ne vit qu'en mémoire — fermer l'app y met fin.
- Choisissez un projet sous la zone de saisie : les fichiers du dossier sont alors eux aussi cherchés et lus, et la conversation est conservée dans ce dossier pour que vous puissiez la poursuivre dans un autre éditeur. Sans projet, la conversation ne vit qu’en mémoire, comme indiqué plus haut.
- La recherche tourne sur l'index de fichiers local, comme la recherche de l'accueil ; les fichiers disparus sortent silencieusement du corpus.
- Les groupes n'organisent que la liste Étoilés — la base de connaissances couvre toujours tous les fichiers étoilés.
