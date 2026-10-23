# L’éditeur de dessins

L’éditeur de dessins ouvre les dessins Excalidraw dans un onglet à part et les enregistre dans le même fichier.

- **Ce qu’il ouvre** : les notes de dessin créées avec le plugin Excalidraw d’Obsidian (`.excalidraw.md`, ou un `.md` dont le front matter contient `excalidraw-plugin`) et les fichiers `.excalidraw` de l’application web Excalidraw.
- **Nouveau dessin** : la carte **Dessin Excalidraw** de l’accueil, ou **Fichier ▸ Nouveau**. Un nouveau dessin est une note de dessin Obsidian (`.excalidraw.md`), et vous lui donnez un nom au premier enregistrement.
- **Dessiner** : formes, flèches, lignes, dessin à main levée et texte, avec la barre d’outils et les raccourcis propres au canevas. ctrl+Z annule.
- **Enregistrement** : ctrl+S. Un fichier est enregistré dans le format dans lequel il a été ouvert. L’enregistrement automatique écrit toutes les 30 secondes et quand la fenêtre perd le focus, mais laisse de côté un dessin qui n’a pas encore de nom de fichier. Un dessin que vous avez seulement regardé est enregistré octet pour octet tel qu’il était.

## Notes de dessin Obsidian

- L’enregistrement ne réécrit que la liste des textes de la note et les données du dessin. Le front matter, le texte que vous avez écrit dans la note et ses liens restent tels quels, si bien que la note s’ouvre de la même façon dans Obsidian.
- Les images que la note désigne (`[[image.png]]` sous Embedded Files) s’affichent quand elles se trouvent dans le coffre de la note : le premier dossier au-dessus de la note qui contient un dossier `.obsidian`, sinon le dossier de la note. Les images de plus de 20 MB, celles des dossiers cachés et celles hors du coffre ne s’affichent pas.
- Vous ne pouvez pas encore ajouter de nouvelles images à une note. L’outil image est désactivé et le dépôt de fichiers sur le canevas est bloqué, car une image conservée uniquement dans la note pourrait ne pas s’afficher dans Obsidian.

## Ce qu’il ne fait pas encore

- Il n’y a pas de panneau IA. L’IA ne peut ni lire ni modifier les dessins.
- Il n’y a pas d’export en PNG ou en SVG.
- L’éditeur reste hors du réseau. Ses polices sont intégrées, et les bibliothèques partagées, la collaboration en direct et les contenus web intégrés sont désactivés. Un lien dans un dessin ne s’ouvre dans le navigateur que s’il s’agit d’une adresse web ou e-mail.

## Ouvrir des dessins depuis l’Explorateur de fichiers

Le programme d’installation ajoute l’application à **Ouvrir avec** pour les fichiers `.excalidraw`, sans en faire le programme par défaut. Une note de dessin est un fichier `.md` : elle s’ouvre partout où un fichier Markdown s’ouvre dans l’application, et va dans l’éditeur de dessins au lieu de l’éditeur Markdown.
