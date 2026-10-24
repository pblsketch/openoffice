# Compétences

Une compétence est un ensemble d’instructions de travail pour l’IA. Notez une bonne fois ce que vous faites encore et encore — les étapes pour mettre au propre des notes de réunion, le ton d’un rapport, les points à vérifier à chaque fois — et vous pourrez l’appeler dans le panneau IA, ou l’IA s’en servira d’elle-même quand elle s’y prête. Une compétence est un dossier contenant un fichier `SKILL.md` dans un format ouvert : une compétence créée dans GenOffice fonctionne donc telle quelle dans Claude Code ou Codex.

## Activer et désactiver des compétences

**Paramètres ▸ Compétences** liste les compétences présentes sur ce PC, regroupées selon leur provenance. Chaque compétence apparaît sous son nom, comme dans les agents de programmation. Le champ de recherche en haut permet d’en trouver une par nom ou description.

| Provenance                         | Contenu                                                                   | Au départ   |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------- |
| **Intégrées**                      | Les 5 compétences fournies avec GenOffice                                 | Activées    |
| **Mes compétences**                | Les compétences que vous avez ajoutées ou créées (`~/.ieumoffice/skills`) | Activées    |
| **Dossier des compétences Claude** | Les compétences de `~/.claude/skills`                                     | Désactivées |
| **Plugins Claude**                 | Les compétences des plugins Claude installés                              | Désactivées |
| **Dossier des compétences Codex**  | Les compétences de `~/.agents/skills`                                     | Désactivées |

- L’interrupteur active ou désactive une compétence. Le même réglage s’applique au panneau IA de chaque éditeur, à Ask AI dans l’accueil et à la fenêtre de l’agent.
- Pour une compétence activée, choisissez **L’IA décide** ou **Seulement sur appel**. Au départ, c’est L’IA décide. Avec Seulement sur appel, la compétence n’est utilisée que lorsque vous l’appelez vous-même.
- Des compétences de provenances différentes peuvent porter le même nom. L’étiquette de provenance de chaque ligne permet de les distinguer.
- Le menu d’options contient **Voir le contenu**, **Modifier** (mes compétences uniquement), **Exporter (zip)** (mes compétences uniquement) et **Ouvrir le dossier**.
- **Mettre à la corbeille** déplace une de mes compétences dans la corbeille du système, d’où vous pouvez la restaurer.
- Une compétence intégrée se masque au lieu d’être supprimée : choisissez **Masquer**. **Afficher à nouveau**, en bas de la liste, la rétablit telle qu’elle était au départ.
- Pour modifier une compétence intégrée ou issue d’un autre programme, choisissez **Copier dans mes compétences**. La copie apparaît dans mes compétences et l’original est désactivé.
- Quand vous exportez une compétence qui a un modèle, le document modèle est aussi placé dans le zip. Vérifiez qu’il ne contient aucune information personnelle avant de l’exporter.

## Ajouter une compétence

1. Dans **Paramètres ▸ Compétences**, cliquez sur **Ajouter**.
2. Choisissez **Depuis un dossier**, **Depuis un fichier zip** ou **Depuis un lien GitHub**. Pour GitHub, saisissez l’adresse d’un dépôt public ou `owner/repo`, puis cliquez sur **Rechercher**.
3. Vérifiez les compétences trouvées dans l’aperçu. Il indique le nombre et la taille des fichiers, la présence éventuelle de scripts, les adresses web citées dans le texte et le fichier de licence.
4. Cochez uniquement les compétences à installer et cliquez sur **Installer**. Les compétences installées sont activées d’emblée.

Sous l’aperçu figure toujours ce message : « N’installez que des compétences provenant de sources de confiance. Une compétence donne des instructions à l’IA et, dans la fenêtre de l’agent, elle peut exécuter des scripts. » Lisez une compétence d’origine inconnue avant de l’installer.

- Si mes compétences en contient déjà une du même nom, choisissez **Remplacer** ou **Ignorer** sur cette ligne.
- Pour télécharger depuis GitHub, GenOffice se connecte uniquement à `github.com`, `api.github.com` et `codeload.github.com`, et n’envoie aucune donnée de connexion. Si l’archive est trop volumineuse ou échoue aux contrôles de sécurité, rien n’est installé.
- **Nouvelle compétence** ouvre un éditeur vide où vous rédigez vous-même le nom, la description et les instructions.

## Rechercher des mises à jour

- Pour une compétence installée depuis GitHub, **Rechercher des mises à jour** dans le menu d’options vérifie s’il y a du nouveau contenu. GitHub n’est contacté que lorsque vous cliquez dessus.
- Si rien n’a changé, le message « À jour » s’affiche. Sinon, examinez les fichiers modifiés et l’aperçu, puis cliquez sur **Mettre à jour**.
- Si vous avez vous-même modifié la compétence après l’avoir installée, « Vos propres modifications seront perdues » s’affiche aussi.
- La mise à jour conserve l’état activé ou désactivé de la compétence ainsi que le choix L’IA décide / Seulement sur appel.

## Appeler une compétence dans le panneau IA

1. Tapez `/` ou `$` au début de la zone de saisie de l’IA ou juste après une espace. La liste des compétences activées s’affiche.
2. Continuez à taper pour affiner la liste. Par exemple, `/meet` trouve `meeting-minutes`. Les mots de la description marchent aussi : `/compte` la trouve également.
3. Choisissez-en une avec les flèches et appuyez sur Entrée ou Tab. La compétence devient une pastille au-dessus de la zone de saisie.
4. Écrivez ce que vous voulez et envoyez. GenOffice joint le contenu de la compétence à la demande.

- Dans le panneau IA d’Excel, `$` n’ouvre la liste qu’au tout début de la zone de saisie, pour ne pas gêner les adresses de cellule comme `$A$1`.
- Vous pouvez ajouter plusieurs pastilles et en retirer une avec ×. Échap ferme seulement la liste ; il n’arrête pas l’exécution de l’IA.
- **Gérer les compétences…**, en bas de la liste, ouvre **Paramètres ▸ Compétences**.
- Les pastilles restent sur le message envoyé et dans la conversation enregistrée. Quand vous rouvrez une conversation et envoyez à nouveau, le contenu actuel de la compétence est relu. Une compétence supprimée ou désactivée entre-temps apparaît comme « Indisponible » sur sa pastille.
- Si le texte des compétences à joindre est trop long, « Les compétences sont trop volumineuses pour être envoyées » s’affiche et rien n’est envoyé.

## Les compétences que l’IA utilise d’elle-même

- Pour les compétences activées et réglées sur L’IA décide, les noms et les descriptions sont fournis à l’IA sous forme de liste. Quand l’une d’elles convient à la demande, l’IA en prend le contenu et l’utilise.
- Quand l’IA utilise une compétence, la conversation affiche « Compétence 〈nom〉 utilisée ».
- L’IA décide d’après la description si elle utilise une compétence. Une description qui précise dans quels cas la compétence doit servir l’aide à bien choisir.

## Créer une compétence en le demandant

1. Dans le panneau IA, dites par exemple « Enregistre ce qu’on vient de faire comme compétence » ou « Crée une compétence qui rédige les rapports dans notre style maison ».
2. L’IA repère les étapes et les règles qui méritent d’être reprises et affiche une carte **Nouvelle compétence**. Les valeurs propres à cette fois-ci, comme les noms et les dates, restent hors des instructions.
3. Vérifiez et modifiez le nom, la description et les instructions sur la carte. Le nom est ce qu’affiche la liste des compétences et ce que vous tapez après `/` : lettres anglaises minuscules, chiffres et traits d’union.
4. Cliquez sur **Enregistrer**. La nouvelle compétence est ajoutée à mes compétences, activée, et apparaît aussitôt dans la liste `/`.

- Aucun fichier n’est écrit tant que vous n’avez pas cliqué sur **Enregistrer**. Si vous cliquez sur **Annuler**, la conversation la garde seulement comme « Proposition de compétence non enregistrée ».
- Vous pouvez aussi demander à modifier une compétence existante, par exemple « Adapte la compétence de compte rendu à notre façon de faire ». La carte s’intitule alors **Modifier la compétence**. Une de mes compétences est écrasée avec **Remplacer** ; une compétence intégrée ou issue d’un autre programme est enregistrée comme copie dans mes compétences et l’original est désactivé.

## Joindre un document comme modèle

Quand vous créez une compétence dans le panneau IA d’un éditeur, le document en cours peut l’accompagner comme modèle. Cochez **Enregistrer aussi ce document comme modèle** sur la carte : le bouton se dédouble.

- **Créer un modèle vierge** : une copie du document s’ouvre dans un nouvel onglet, « Aperçu du modèle - 〈titre〉 », et l’IA de cet onglet efface les valeurs remplies comme les noms, les dates et les informations personnelles. Relisez l’onglet, retouchez-le à la main si besoin, puis cliquez sur **Enregistrer cet onglet comme modèle** ; l’onglet tel qu’il est à ce moment-là devient le modèle.
- **Enregistrer le document tel quel** : enregistre le document en cours comme modèle sans le modifier. Si le document contient des parties que vous avez masquées pour l’IA, ce bouton est bloqué, afin que le contenu masqué ne se retrouve pas tel quel dans le modèle.
- Le modèle est conservé comme copie du document dans le dossier de la compétence. Le document d’origine ne change pas.

## Utiliser une compétence avec modèle

- Une compétence qui a un modèle affiche **Contient un modèle** dans la liste.
- Appelez-la sous forme de pastille et envoyez : une copie du modèle s’ouvre comme nouveau document sans titre, et l’IA de cet onglet poursuit votre demande. Le panneau d’origine garde « Travail avec le modèle dans un nouvel onglet » et **Aller à l’onglet**.
- Quand l’IA choisit d’elle-même une compétence avec modèle, aucun onglet ne s’ouvre tout de suite. La conversation affiche à la place un bouton **Ouvrir un nouveau document à partir de ce modèle**.
- Vous choisissez généralement l’emplacement du nouveau document lors du premier enregistrement. Les éditeurs Markdown et HTML enregistrent comme toujours dans le dossier par défaut. Le fichier modèle lui-même reste inchangé.

## Compétences avec scripts

- Dans le panneau IA normal et dans Ask AI de l’accueil, les scripts d’une compétence ne s’exécutent jamais. Seul le texte de la compétence parvient à l’IA.
- Une compétence avec scripts affiche **Contient des scripts · fonctionne pleinement dans la fenêtre de l’agent**, et l’ajouter comme pastille affiche « Les scripts de cette compétence ne s’exécutent pas dans le panneau IA normal ». L’envoi n’est pas bloqué.
- Pour utiliser aussi les scripts, appelez la compétence dans la fenêtre de l’agent. Voir [Mode agent](help://agent-mode).

## Compétences intégrées

| Compétence        | Ce qu’elle fait                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `meeting-minutes` | Transforme les notes de réunion en compte rendu qui fait ressortir les décisions et les actions |
| `internal-comms`  | Rédige annonces, lettres d’information, points d’avancement, FAQ et autres messages internes    |
| `humanizer`       | Repère les tournures qui sonnent écrites par une IA et les rend naturelles                      |
| `copy-editing`    | Relit un texte anglais déjà écrit pour le rendre plus clair et plus concis                      |
| `find-skills`     | Trouve dans la fenêtre de l’agent les compétences utiles et propose de les installer            |

`copy-editing` est conçue pour les textes marketing en anglais. `find-skills` fonctionne uniquement dans la fenêtre de l’agent.

## Dans la fenêtre de l’agent

- La fenêtre de l’agent suit les mêmes réglages d’activation dans **Paramètres ▸ Compétences**, et on y appelle les compétences de la même façon, avec `/` ou `$` dans la zone de saisie.
- Les compétences des dossiers `.claude/skills` et `.agents/skills` du projet sont utilisées dans cette session sans avoir besoin d’être activées.
- La liste des compétences est fixée au démarrage de la session. Si vous activez ou désactivez des compétences pendant une session, « Les compétences modifiées s’appliquent à partir de la prochaine session » s’affiche.
- Quand l’agent crée une compétence, la même carte apparaît dans la fenêtre. Pour le modèle, choisissez parmi les documents ouverts dans des onglets et les fichiers du dossier du projet.
- Quand l’agent trouve une compétence qui mérite d’être installée, une proposition d’installation apparaît. Ouvrez-la avec **Ouvrir l’aperçu** et cliquez vous-même sur **Installer** ; sinon, rien n’est installé. Une compétence installée est disponible à partir de la prochaine session.
