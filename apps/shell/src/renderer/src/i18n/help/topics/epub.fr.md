# Livres EPUB : lire, modifier et traduire

L’éditeur de livres numériques ouvre les livres EPUB (`.epub`) dans un onglet. Vous y lisez le livre, corrigez son texte directement sur la page, interrogez l’IA à son sujet et le traduisez dans un nouveau fichier EPUB. Il n’existe pas d’écran pour modifier le code d’un chapitre.

## Ouvrir un livre

- Ouvrez un fichier `.epub` depuis la boîte de dialogue d’ouverture, en le faisant glisser sur la fenêtre, depuis les fichiers récents, l’arborescence des dossiers ou la liste Google Drive. Sous Windows, il est aussi proposé dans « Ouvrir avec ». L’installation de GenOffice n’en fait pas le programme par défaut des fichiers `.epub`.
- Si le livre est déjà ouvert, son onglet passe au premier plan.
- Les livres protégés contre la copie (DRM) ne s’ouvrent pas : ouvrez-les dans l’application de la librairie où vous les avez achetés. Les fichiers endommagés et ceux qui ne sont pas des livres EPUB ne s’ouvrent pas non plus, et la raison s’affiche.
- Les **livres à mise en page fixe** (composés page par page, comme les albums illustrés et les bandes dessinées) s’ouvrent en lecture seule. La modification, la modification par l’IA, le remplacement et la traduction sont désactivés, et la ligne d’état en donne la raison. La lecture et les questions à l’IA restent possibles.
- Un chapitre dont le fichier est mal formé s’affiche du mieux possible mais ne peut pas être modifié, ce qu’indique une note en haut du chapitre. Il est enregistré tel quel et reste dans la langue d’origine dans les traductions.

## Lire

- Le volet **Sommaire**, à gauche, affiche la table des matières du livre. Cliquez sur une entrée pour vous y rendre. Un livre qui n’en a pas reçoit la liste de ses chapitres.
- Chaque chapitre défile de haut en bas. Continuez à défiler après la fin d’un chapitre pour passer au suivant, ou avant son début pour revenir au précédent. La ligne d’état indique dans quel chapitre vous êtes.
- L’onglet **Affichage** règle la taille du texte et l’interligne, et active ou désactive la **Lecture sombre**. Ces réglages ne touchent que l’écran, jamais le livre, et valent pour tous les livres.
- L’endroit où vous avez arrêté votre lecture est mémorisé pour chaque fichier, dans le dossier de données de l’application et non dans le livre.
- **Rechercher dans le livre** (Ctrl+F) cherche dans tous les chapitres. Cliquez sur un résultat pour y aller.
- Un lien interne au livre mène à l’endroit visé. Les liens web et e-mail s’ouvrent dans votre navigateur par défaut ; les autres adresses ne sont pas ouvertes.
- Les scripts du livre ne s’exécutent jamais et rien n’est chargé depuis Internet. Le son et la vidéo ne sont pas lus.

## Modifier le texte

- Cliquez dans un paragraphe et tapez. Les paragraphes, titres, éléments de liste, citations, cellules de tableau et légendes d’images sont modifiables. Les images et la structure des tableaux ne le sont pas.
- Le collage n’insère que du texte brut.
- **Enter** coupe un paragraphe en deux et **Shift+Enter** commence une nouvelle ligne à l’intérieur. **Backspace** au début d’un paragraphe le fusionne avec le précédent, et **Delete** à la fin y rattache le suivant. Dans les cellules de tableau, les légendes et les listes de définitions, Enter ne fait rien : seul le texte à l’intérieur change.
- **Gras** (Ctrl+B) et **Italique** (Ctrl+I) s’activent et se désactivent. Le texte que la feuille de style du livre met en gras ou en italique reste tel quel.
- **Annuler** (Ctrl+Z) et **Rétablir** (Ctrl+Y) fonctionnent encore après l’enregistrement. Annuler une modification faite dans un autre chapitre vous y ramène.
- **Remplacer** (Ctrl+H) parcourt tout le livre, paragraphe par paragraphe : une correspondance ne s’étend jamais sur deux paragraphes. Les chapitres en lecture seule sont ignorés, et le nombre d’endroits ignorés est indiqué. **Tout remplacer** s’annule en une seule fois.

## Enregistrer

- Enregistrer (Ctrl+S), Enregistrer sous (Ctrl+Shift+S, `.epub` uniquement), l’**Enregistrement automatique** du ruban et la question posée avant la fermeture fonctionnent comme dans les autres éditeurs.
- Si rien n’a changé, le fichier n’est pas réécrit. Lorsque vous enregistrez des modifications, seuls les paragraphes modifiés sont réécrits. Les images, polices, styles et toutes les autres parties du livre restent exactement comme avant. Dans un livre EPUB 3, la date de « dernière modification » est aussi mise à jour.
- Si un autre programme a modifié le fichier après son ouverture, le fichier n’est pas écrasé.

## Panneau IA

- Posez des questions sur le livre, faites résumer un chapitre, ou faites corriger ou réécrire son texte. L’IA lit le sommaire et les chapitres du livre et y retrouve du texte.
- Les modifications de l’IA apparaissent aussitôt, et une seule annulation (Ctrl+Z) défait tout ce qu’elle a changé pendant ce tour. L’IA peut mettre du texte en gras ou en italique, mais ne peut pas ajouter d’images, de tableaux ni de chapitres.
- Le texte du livre est une matière de travail pour l’IA, pas une consigne qu’elle doit suivre.
- Demandez « Traduis ce livre en français » et l’IA ouvre la fenêtre de traduction avec cette langue déjà choisie. Rien n’est envoyé tant que vous n’avez pas cliqué sur **Commencer**.
- Les livres EPUB peuvent aussi être joints dans le panneau IA des autres éditeurs, choisis avec `@`, et trouvés par la recherche de fichiers de l’accueil.

## Traduire un livre

1. Dans l’onglet **Accueil**, cliquez sur **Traduire le livre** (ou Fichier ▸ Traduire le livre…).
2. Choisissez la langue, les chapitres (tous sont sélectionnés au départ) et les résultats : un **Livre traduit**, un **Livre bilingue** (original et traduction), ou les deux. Choisissez où chacun est enregistré.
3. Cliquez sur **Suivant**. La confirmation affiche le nombre estimé de requêtes à l’IA, l’IA qui les reçoit, les parties déjà traduites (qui ne sont pas renvoyées) et, sur une connexion facturée à l’usage, le fait que ce sera payant. Si le livre a des modifications non enregistrées, le bouton devient **Enregistrer et traduire**.
4. Cliquez sur **Commencer**. La progression et **Arrêter** apparaissent en haut. La modification est bloquée jusqu’à la fin de la traduction ; le panneau IA continue de fonctionner.
5. À la fin, un rapport liste ce qui a été traduit, ce qui est resté dans la langue d’origine et les fichiers produits, chacun avec **Ouvrir**.

- Le livre lui-même ne change pas. Chaque résultat est un nouveau fichier EPUB doté de sa propre identité, si bien que les applications de bibliothèque numérique le distinguent de l’original.
- Le titre et la table des matières sont traduits eux aussi. Dans un livre bilingue, chaque paragraphe est suivi de sa traduction ; dans les tableaux, les légendes et les listes, la traduction se place dans la même cellule ou le même élément. Son titre montre les deux, sous la forme « Titre original (Titre traduit) ».
- Les chapitres que vous n’avez pas choisis restent dans la langue d’origine dans le résultat.
- Un livre écrit à la verticale passe à l’horizontale, sauf s’il est traduit en japonais, en chinois ou en coréen. Les traductions en arabe et en hébreu se lisent de droite à gauche.
- Ce qui a déjà été traduit est conservé. Si vous arrêtez, choisissez **Exporter ce qui est traduit jusqu’ici** (le reste demeure dans la langue d’origine) ou **Continuer plus tard**. Quand vous ouvrez un livre dont la traduction est inachevée, GenOffice propose de la poursuivre. **Retraduire depuis le début** supprime d’abord la traduction conservée pour cette langue.
- Les traductions conservées sont comptées dans Paramètres ▸ Général ▸ **Résultats IA enregistrés**, avec celles des documents PDF, et **Tout supprimer** les efface aussi.
- La même traduction peut aussi se lancer depuis la [ligne de commande](help://cli) avec `ieumoffice epub translate`.

## Pas encore pris en charge

- Ajouter, supprimer ou réordonner des chapitres ; modifier le titre, l’auteur ou la couverture ; insérer des images ou des tableaux ; transformer un paragraphe en titre ou en liste.
- Modifier ou traduire les livres à mise en page fixe, et ouvrir les livres protégés contre la copie.
- Tourner les pages comme dans un livre imprimé, et créer un nouveau livre vide.
- Comparer l’original et la traduction côte à côte dans l’éditeur. Ouvrez plutôt le livre bilingue, et corrigez le livre traduit comme n’importe quel autre livre.
- Masquer à l’IA certaines parties d’un livre.
