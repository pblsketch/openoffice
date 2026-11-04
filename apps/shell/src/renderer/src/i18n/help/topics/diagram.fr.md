# Diagrammes : dessiner et modifier des fichiers draw.io

L’éditeur de diagrammes ouvre les fichiers draw.io dans un onglet. Vous y dessinez des organigrammes de processus, des schémas d’architecture et d’autres diagrammes, vous les enregistrez dans leur format d’origine, vous les exportez en images ou en PDF, et l’IA peut les lire, les modifier et les dessiner. L’éditeur fonctionne entièrement sur votre PC.

## Ouvrir un diagramme

- L’éditeur ouvre les fichiers `.drawio`, `.dio`, `.drawio.svg` et `.drawio.png` : depuis la boîte de dialogue d’ouverture, en faisant glisser un fichier sur la fenêtre, depuis les fichiers récents, l’arborescence des dossiers ou (pour `.drawio` et `.dio`) la liste Google Drive. Sous Windows, l’installation de GenOffice en fait le programme des fichiers `.drawio` et `.dio`.
- Un fichier `.drawio.svg` ou `.drawio.png` ne s’ouvre que si le diagramme est enregistré à l’intérieur de l’image. Une image SVG ou PNG ordinaire n’est pas ouverte comme diagramme. Les fichiers endommagés ne s’ouvrent pas non plus, et la raison s’affiche.
- Un fichier Visio (`.vsdx`) est importé comme un nouveau diagramme sans titre. Le premier enregistrement propose un fichier `.drawio` dans le dossier du fichier Visio, qui reste lui-même inchangé. Si certaines images n’ont pas pu être converties, l’éditeur en indique le nombre. Sous Windows, les fichiers `.vsdx` sont proposés uniquement dans « Ouvrir avec ».
- Un nouveau diagramme vide se crée avec la vignette **Diagramme** de l’accueil ou avec Nouveau dans le menu Fichier.
- Si le diagramme est déjà ouvert, son onglet passe au premier plan.

## Modifier

- L’écran de modification est celui de draw.io, sans changement : les menus en haut, les formes à gauche, le panneau de format à droite et les onglets de pages en bas.
- Enregistrer (Ctrl+S), Enregistrer sous (Ctrl+Shift+S) et Imprimer (Ctrl+P) sont pris en charge par GenOffice. Le changement d’onglet et les autres raccourcis de l’application continuent de fonctionner. Tous les autres raccourcis appartiennent à l’éditeur, y compris l’annulation (Ctrl+Z).
- **Aide** (F1), dans les menus de l’éditeur, ouvre cette page.
- L’éditeur suit la langue de GenOffice. Quand vous changez de langue, l’éditeur redémarre : les modifications non enregistrées sont gardées, mais l’historique d’annulation est perdu.
- L’éditeur suit le thème de GenOffice. Avec le thème sombre, le dessin s’affiche lui aussi en couleurs sombres, mais le fichier enregistré, les PNG, les PDF et les impressions sont identiques à ceux du thème clair.

## Enregistrer

- Enregistrer, Enregistrer sous, l’**Enregistrement automatique** de la ligne d’état et la question posée avant la fermeture fonctionnent comme dans les autres éditeurs.
- Un diagramme est enregistré dans le format avec lequel il a été ouvert. Enregistrer sous propose `.drawio`, `.dio`, `.drawio.svg` et `.drawio.png`. Un nouveau diagramme est d’abord enregistré en `.drawio`.
- Si rien n’a changé, le fichier n’est pas réécrit. Les pages stockées compressées dans le fichier le restent.
- L’image d’un fichier `.drawio.png` montre la première page ; le diagramme complet est enregistré à l’intérieur.
- Tant qu’un diagramme a des modifications non enregistrées, une copie de récupération est conservée dans le dossier de données de l’application, ce qui préserve le travail en cas de plantage.

## Exporter et imprimer

- Choisissez l’export PNG, SVG ou PDF dans le menu Fichier (les commandes d’export des menus de l’éditeur ouvrent la même fenêtre). Choisissez ensuite **Toutes les pages** (par défaut) ou **Page actuelle uniquement**.
- Avec toutes les pages, PNG et SVG produisent un fichier par page, nommé `<nom>-p<numéro de page>`. Un PDF contient une feuille par page, au format de page défini dans le diagramme.
- Imprimer (Ctrl+P) imprime aussi une feuille par page. Les exports et les impressions utilisent toujours des couleurs claires, quel que soit le thème.

## Panneau IA

- Demandez à l’IA de dessiner un organigramme de processus, un diagramme de séquence ou un organigramme hiérarchique, d’expliquer le diagramme, de ranger une page ou d’ajouter l’étape suivante après les formes sélectionnées.
- L’IA lit le diagramme sous forme de texte : les pages et, pour chaque forme et chaque connecteur, son identifiant, son texte, sa forme, sa position et ses liaisons, ainsi que les formes que vous avez sélectionnées. Elle ne voit pas le diagramme comme une image.
- Les modifications de l’IA apparaissent aussitôt. Chacune correspond à une étape d’annulation (Ctrl+Z), et la liste des tours du panneau défait un tour complet de l’IA. Si une partie d’une modification est refusée, le diagramme reste tel qu’il était.
- Pour un nouvel organigramme de processus, un diagramme de séquence ou un schéma du même genre, l’IA écrit du Mermaid que GenOffice transforme en formes sur votre PC. La disposition peut différer un peu de celle que produit le site web de draw.io.
- Les diagrammes peuvent aussi être joints dans le panneau IA des autres éditeurs, choisis avec `@`, et trouvés par la recherche de fichiers de l’accueil. Les [commandes du terminal](help://cli) lisent, modifient et créent aussi des diagrammes (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Utilisation d’Internet

- L’onglet de diagramme n’envoie rien sur Internet. L’éditeur fonctionne à partir de fichiers installés avec GenOffice, et son stockage en ligne, son partage, ses extensions et sa propre IA sont désactivés.
- Les images et polices qu’un diagramme va chercher sur Internet ne sont pas chargées ; une note le signale à l’ouverture du fichier. Un lien web ou e-mail placé sur une forme ne s’ouvre dans votre navigateur par défaut que lorsque vous cliquez dessus.
- Le bloc-notes, les bibliothèques de formes que vous ajoutez et les couleurs récentes restent sur ce PC, dans le dossier de données de l’application. Le panneau IA envoie le texte du diagramme à l’IA que vous avez choisie, comme dans les autres éditeurs.

## Non disponible

- Insérer ou modifier du PlantUML. Les formes PlantUML d’un fichier s’affichent sous forme de leur image enregistrée.
- Les dispositions automatiques qui utilisent ELK, et les connecteurs qui contournent les formes. Ces connecteurs sont dessinés comme des connecteurs ordinaires.
- Les anciens formats Visio (`.vsd`, `.vss`) et l’enregistrement en `.vsdx`.
- Le stockage en ligne, le partage, la publication, les extensions et les fonctions d’IA propres à l’éditeur.
- Masquer à l’IA certaines parties d’un diagramme.
