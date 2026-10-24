# Onglets et gestion des fenêtres

Tous les fichiers ouverts partagent une seule fenêtre ; la barre d’onglets en haut permet de passer de l’un à l’autre, à la manière d’un navigateur.

![La barre d’onglets : Accueil plus deux documents](img/tabs.png)

## Principes

- **Basculer** : cliquez sur un onglet, appuyez sur **Ctrl+Tab** (suivant) / **Ctrl+Maj+Tab** (précédent), ou faites défiler la molette au-dessus de la barre.
- **Fermer** : la × de l’onglet, ou ⌘W/ctrl+W. Les modifications non enregistrées déclenchent une demande de confirmation.
- **Nouveau** : le + à l’extrémité droite de la barre.
- **L’activation est immédiate** : appuyer sur un onglet bascule tout de suite, sans attendre la fin du clic.

## Renommer : double-cliquez sur un onglet

**Double-cliquez sur n’importe quel onglet de fichier** et le titre devient un champ de saisie sur place : Entrée valide, Échap annule, la perte de focus valide ; l’Entrée qui confirme un candidat de l’IME n’est pas prise pour une validation. Le renommage passe par les mêmes contrôles de sécurité que celui d’une ligne de l’accueil (caractères interdits, conflits de nom), renomme le fichier sur le disque et actualise la liste des récents.

## Réordonner par glisser-déposer

Maintenez un onglet et faites-le glisser latéralement pour le réordonner ; les voisins s’écartent en direct et l’ordre se fixe au relâchement. Une zone morte de 4 pixels évite que les simples clics ne fassent bouger les onglets.

## Menu contextuel

Un clic droit sur un onglet propose **Ouvrir dans une nouvelle fenêtre** — disponible sur chaque onglet de document détachable — et **Fermer**, grisé sur un onglet qui ne peut pas être fermé. Les deux suivent la langue de l’application.

## Détacher dans une fenêtre

**Faites glisser un onglet hors de la barre** (ou utilisez Ouvrir dans une nouvelle fenêtre) et il devient sa propre fenêtre, avec le document vivant ; faites-le glisser à nouveau pour le rattacher à la barre. Une fenêtre détachée est une fenêtre à part entière — continuez à y modifier et à y enregistrer.

## La liste de tous les onglets

Quand les onglets débordent, la petite icône de la barre d’onglets à l’extrémité droite ouvre la liste complète (un menu natif, jamais masqué par la zone de contenu) ; choisissez avec les flèches.

## La barre d’outils de chaque éditeur

Chaque onglet d’éditeur a une barre d’outils en haut (la disposition exacte varie légèrement selon l’éditeur) :

- **Enregistrer** (⌘S/ctrl+S) et **Enregistrer sous**.
- **Annuler / Rétablir** : sur plusieurs niveaux ; chaque éditeur conserve son propre historique.
- **Rechercher** (ctrl+F) : ouvre le panneau de recherche de cet éditeur.
- **Enregistrement automatique** : activé, les modifications sont écrites sur le disque à intervalles réguliers ; désactivé, seuls les enregistrements manuels écrivent (la marque de non-enregistrement sur l’onglet ou le titre vous y aide).

## L’onglet Accueil

L’onglet Accueil le plus à gauche ne peut pas être fermé ; pour revenir d’un éditeur, cliquez dessus ou utilisez Fichier ▸ **Retour à l’accueil**.

## Affichage scindé : deux volets

**Faites glisser un onglet vers le bord droit de la fenêtre** : l’onglet suit comme une petite copie flottante, l’indication « Scinder ici » apparaît près du bord, et le déposer donne deux volets côte à côte. Déposez-le sur le bord inférieur pour deux volets empilés. Le menu contextuel de l’onglet fait de même avec **Scinder à droite** et **Scinder en bas**, et propose **Annuler la scission** sur un onglet qui se trouve dans un volet.

- L’onglet déposé va dans le volet où vous l’avez lâché ; l’autre volet garde le document que vous consultiez juste avant.
- S’il n’y a qu’un seul document ouvert, une copie du même document est placée dans les deux volets, pour regarder le début et la fin ensemble. Un nouveau document jamais enregistré se scinde aussi.
- Faites glisser le **séparateur** entre les volets pour changer leur part, double-cliquez dessus pour un partage égal, ou poussez-le jusqu’à un bord pour fermer ce volet ; le document reste ouvert comme onglet.

## Une seule fenêtre IA, qui suit le focus

- Une seule fenêtre IA est visible. Le volet sur lequel vous travaillez montre la sienne ; celle de l’autre volet se replie en un rail, et un clic sur un volet ramène sa fenêtre IA au premier plan.
- Pendant qu’elle est repliée, la conversation de ce volet et les travaux IA en cours restent vivants. Les conversations sont conservées par document.
- **Deux copies du même document** : après un enregistrement dans un volet, enregistrer depuis l’autre demande d’abord « Ce document a été modifié ailleurs ». L’enregistrement automatique, lui, attend silencieusement.
- Après une fermeture normale, **relancer l’application sans fichier** ramène la dernière paire de documents scindés exactement comme elle était ; la lancer avec un fichier n’ouvre que ce fichier. Après un arrêt soudain, les onglets précédents reviennent comme décrit plus bas.
- Les onglets Accueil, Aide et Présentation (aperçu) ne peuvent pas entrer dans un volet ; tant qu’un de ces onglets est ouvert, les deux volets se cachent un moment et reviennent dès que vous retournez à un onglet de document.

Trois volets ou plus, la scission dans une fenêtre détachée et la synchronisation en direct des deux copies sont remises à plus tard.

## Quand l’application ou le PC s’éteint brusquement

Tant qu’un document a des modifications non enregistrées, GenOffice en garde une copie de récupération environ toutes les 30 secondes dans le dossier de données de l’application. Tous les éditeurs le font, y compris pour un nouveau document jamais enregistré. Votre fichier lui-même ne change pas tant que vous n’enregistrez pas.

- **Vos onglets reviennent** : si l’application ou le PC s’est arrêté sans fermeture normale (coupure de courant, plantage, application fermée de force, arrêt du PC ou redémarrage pour une mise à jour), les onglets de documents ouverts reviennent au prochain lancement de GenOffice, dans le même ordre et avec l’écran partagé s’il y en avait un. C’est aussi le cas si vous le lancez en ouvrant un fichier.
- **Une seule liste sur l’accueil** : les documents dont du contenu n’est pas enregistré sont listés ensemble sur l’écran d’accueil. Choisissez **Restaurer** ou **Abandonner** pour chacun, ou utilisez **Tout restaurer** ou **Tout abandonner**, puis appuyez sur **Valider**. Si un autre programme ou un service de synchronisation a modifié le fichier entre-temps, **Abandonner** est présélectionné pour que le fichier reste tel qu’il est. Si le fichier d’origine est introuvable, la restauration ouvre le contenu comme un nouveau document sans titre.
- **Décider plus tard** : fermer la liste ne supprime rien. À la première ouverture de l’un de ces documents, une boîte portant son nom pose de nouveau la question ; appuyer sur Échap ou fermer la boîte le restaure. Si vous n’avez pas besoin du contenu restauré, fermez le document avec **Ne pas enregistrer**.
- **Les onglets se chargent à l’ouverture** : les onglets restaurés affichent tout de suite leur titre, mais chaque document ne se charge qu’au premier clic sur son onglet. Tout ouvrir d’un coup pourrait faire s’éteindre à nouveau un PC à court de mémoire.
- **À l’arrêt du PC** : si des documents ne sont pas enregistrés, GenOffice ne demande pas s’il faut les enregistrer. Il garde les copies, se ferme et les propose au lancement suivant.
- **Documents sans copie** : les fichiers Excel, HWP et PDF protégés par mot de passe n’ont pas de copie de récupération, leurs modifications non enregistrées ne peuvent donc pas être restaurées ; un avis le signale une fois à l’ouverture d’un tel document. Enregistrez-les souvent. Les documents Word et PowerPoint protégés par mot de passe ont une copie verrouillée avec le même mot de passe.
- **Fichiers CSV, anciens .xls et .tsv** : l’éditeur de tableur conserve leur copie comme classeur sans titre. Une fois restaurée, elle s’ouvre comme classeur sans titre, et le premier enregistrement propose le dossier et le nom du fichier d’origine en .xlsx.

Une copie est supprimée quand vous enregistrez le document, le fermez avec **Ne pas enregistrer** ou choisissez **Abandonner**, ainsi qu’après 30 jours sans modification. Après une fermeture normale, GenOffice démarre comme avant, sans rouvrir d’onglets.

**Ce n’est pas l’enregistrement automatique.** L’enregistrement automatique écrit vos modifications dans le fichier lui-même, et seulement après un premier enregistrement. Une copie de récupération ne touche jamais votre fichier ; elle garde seulement ce que vous n’avez pas encore enregistré, jusqu’à ce que vous enregistriez ou abandonniez.
