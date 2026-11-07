# Installer GenOffice

Chaque version est publiée sur la [page Releases](https://github.com/pblsketch/openoffice/releases/latest) du projet sur GitHub. La version Windows est accompagnée de versions Mac et Linux publiées en bêta. Le développeur ne peut pas tester directement les versions Mac et Linux ; elles sont confirmées grâce aux retours des utilisateurs.

## Choisir le fichier pour votre machine

| Plateforme                              | Prérequis                                               | Fichier                           |
| --------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| **Windows**                             | Windows 10 ou version ultérieure, Intel/AMD 64 bits     | `GenOffice-Setup-<version>.exe`   |
| **Mac (bêta)**, Apple Silicon           | macOS 12 ou version ultérieure, puce M1 ou plus récente | `GenOffice-<version>-arm64.dmg`   |
| **Mac (bêta)**, Intel                   | macOS 12 ou version ultérieure, processeur Intel        | `GenOffice-<version>-x64.dmg`     |
| **Linux (bêta)**, toute distribution    | 64 bits (x86_64)                                        | `GenOffice-<version>.AppImage`    |
| **Linux (bêta)**, famille Ubuntu/Debian | 64 bits (x86_64)                                        | `ieumoffice_<version>_amd64.deb`  |
| **Linux (bêta)**, Fedora/RHEL/openSUSE  | 64 bits (x86_64)                                        | `ieumoffice-<version>.x86_64.rpm` |

Pour savoir quel Mac vous avez, ouvrez le menu Pomme ▸ **À propos de ce Mac**. Si « Puce » indique Apple M…, prenez le fichier qui se termine par `-arm64.dmg` ; si « Processeur » indique Intel …, prenez celui qui se termine par `-x64.dmg`. Les autres fichiers de la page Releases (`.zip`, `.yml`, `.blockmap`) servent à l’application elle-même pour se mettre à jour ; vous n’avez pas besoin de les télécharger. Les versions antérieures restent sur la page Releases.

## Sous Windows

1. Téléchargez `GenOffice-Setup-<version>.exe` depuis la page Releases.
2. Lancez-le. L’installeur n’est pas signé numériquement : Windows peut donc afficher d’abord une fenêtre bleue « Windows a protégé votre ordinateur ». Choisissez **Informations complémentaires**, puis **Exécuter quand même**. Le libellé exact dépend de votre version de Windows.
3. Suivez l’installeur jusqu’au bout.

Il place GenOffice dans le menu Démarrer et enregistre `.docx`, `.xlsx`, `.pptx`, `.pdf` et formats voisins, si bien qu’un double-clic sur un fichier l’ouvre.

Comme l’installeur n’est pas signé, n’exécutez que celui que vous avez téléchargé depuis la page Releases ci-dessus.

## Quand Windows bloque le téléchargement ou l’installation

### Edge indique que le fichier « n’est pas téléchargé couramment »

Microsoft Defender SmartScreen avertit ainsi pour un fichier qu’il a vu télécharger par peu de personnes. Voici la marche à suivre de Microsoft pour conserver le fichier :

1. Ouvrez la liste des téléchargements d’Edge (**Ctrl+J**), appuyez sur **…** à côté du fichier et choisissez **Conserver**.
2. Dans la fenêtre qui s’ouvre, appuyez sur **Afficher plus**, puis sur **Conserver quand même**. Le fichier reste dans votre dossier Téléchargements.

Cette fenêtre comporte aussi un bouton qui signale le fichier comme sûr. Il ouvre seulement la page de signalement de Microsoft (`feedback.smartscreen.microsoft.com`) et ne conserve pas le fichier. Fermez cette page et appuyez plutôt sur **Afficher plus** dans la fenêtre.

Si la fenêtre n’a pas de bouton **Afficher plus** ou **Conserver quand même** :

- Sur un PC géré par un établissement scolaire ou une entreprise, l’administrateur peut interdire d’ignorer ces avertissements (une stratégie Edge). Personne ne peut alors conserver le fichier sur ce PC ; demandez à l’administrateur de l’installer ou de l’autoriser.
- Télécharger depuis la page Releases dans un autre navigateur vous donne le même fichier.
- Si aucune des deux solutions ne fonctionne et qu’il s’agit de votre propre PC, le guide de dépannage des téléchargements de Microsoft permet, en dernier recours, de désactiver un instant Microsoft Defender SmartScreen : dans Edge, ouvrez **Paramètres et plus (…) ▸ Paramètres ▸ Confidentialité, recherche et services ▸ Sécurité**, désactivez **Microsoft Defender SmartScreen**, téléchargez de nouveau le fichier, puis réactivez-le aussitôt. Tant qu’il est désactivé, Edge ne vous avertit ni pour les téléchargements ni pour les sites dangereux comme les pages d’hameçonnage.

### Une fenêtre « Windows a protégé votre ordinateur » apparaît

Microsoft Defender SmartScreen affiche cette fenêtre la première fois qu’il voit un installeur non signé. Appuyez sur **Informations complémentaires** et un bouton **Exécuter quand même** apparaît. Sur un PC géré par un établissement scolaire ou une entreprise, un paramètre de l’administrateur peut masquer ce bouton ; adressez-vous à l’administrateur.

### Le Contrôle intelligent des applications le bloque

Lorsque le Contrôle intelligent des applications de Windows 11 est activé, il arrête les installeurs non signés et ne propose aucun chemin par **Informations complémentaires**. Selon Microsoft, il n’est pas possible d’autoriser une seule application : la seule option est de désactiver le Contrôle intelligent des applications, sous **Sécurité Windows ▸ Contrôle des applications et du navigateur ▸ Paramètres du Contrôle intelligent des applications**. Cela retire aussi cette protection pour toutes les autres applications. Avec les mises à jour récentes de Windows, il peut être réactivé sans réinstaller Windows.

## Sur un Mac (bêta)

Il vous faut macOS 12 (Monterey) ou version ultérieure. La version Mac n’a pas de signature de développeur Apple : la première fois que vous l’ouvrez, macOS indique qu’il ne peut pas vérifier que l’application est exempte de logiciels malveillants et ne l’ouvre pas. Autorisez-la une seule fois, comme ci-dessous.

1. Ouvrez le dmg et faites glisser `GenOffice.app` dans le dossier **Applications**.
2. Ouvrez GenOffice depuis le dossier Applications. Quand l’avertissement apparaît, appuyez sur **Terminé**.
3. Ouvrez **Réglages Système ▸ Confidentialité et sécurité**. Vers le bas, à côté de la ligne indiquant que GenOffice a été bloquée, appuyez sur **Ouvrir quand même** et saisissez le mot de passe de votre Mac. Le bouton reste affiché environ une heure après votre tentative d’ouverture.
4. Dans la fenêtre qui s’affiche de nouveau, appuyez sur **Ouvrir**. Ensuite, elle s’ouvre sans avertissement.

Sous macOS 12, l’emplacement est **Préférences Système ▸ Sécurité et confidentialité ▸ Général**, et le bouton s’y appelle aussi **Ouvrir quand même**.

Si macOS indique que l’application « est endommagée et ne peut pas être ouverte », ne la mettez pas à la corbeille. Exécutez la ligne ci-dessous dans le Terminal, puis rouvrez l’application et autorisez-la comme ci-dessus. Elle supprime la marque que macOS attache aux fichiers téléchargés depuis Internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Si macOS indique que l’application n’est pas prise en charge sur ce Mac, vérifiez deux choses :

- Un Mac Intel ne peut pas exécuter le fichier pour Apple Silicon (`-arm64.dmg`). Regardez « Processeur » dans **À propos de ce Mac**, supprimez l’application installée et installez plutôt le fichier `-x64.dmg`.
- macOS 11 ou antérieur ne peut pas exécuter GenOffice. **À propos de ce Mac** affiche aussi la version de macOS.

Également sur un Mac :

- Les cartes de connexion IA n’ont pas de bouton d’installation. Suivez le lien du guide d’installation officiel sur la carte pour installer Claude Code ou Codex. L’application de bureau Claude n’est pas Claude Code, il faut donc installer Claude Code même si l’application de bureau est déjà là.
- La connexion se termine dans le navigateur. Si le navigateur vous demande de coller un code, exécutez vous-même `claude auth login` ou `codex login` dans le Terminal. Voir [Connexion par abonnement](help://subscription).

## Sous Linux (bêta)

- **AppImage** : rendez-le exécutable (`chmod +x GenOffice-<version>.AppImage`) et lancez le fichier. Il n’y a pas d’étape d’installation.
- **deb** : installez avec `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm** : installez avec `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Sous openSUSE, utilisez `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Les paquets deb et rpm s’installent dans `/opt/GenOffice` et lient la commande de terminal `/usr/bin/ieumoffice`. Comme sur un Mac, les cartes de connexion IA n’ont pas de bouton d’installation, et lorsqu’une connexion demande un code, vous exécutez vous-même `claude auth login` ou `codex login` dans un terminal.

## Mises à jour

- GenOffice cherche une version plus récente sur la même page GitHub Releases. Lorsqu’il y en a une, **Paramètres ▸ À propos** la propose : appuyez sur **Mettre à jour vers …**, attendez la fin du téléchargement, puis appuyez sur **Redémarrer et installer**. Sous Windows, une fenêtre affiche la progression de l'installation ; à la fin, GenOffice se rouvre avec les documents que vous aviez ouverts. Sur Mac, l'app se ferme, est remplacée par la nouvelle version et se rouvre avec les documents que vous aviez ouverts. Cela vaut pour une app placée dans le dossier Applications ; une app ouverte directement depuis l'image disque vous renvoie plutôt à la page de téléchargement. La mise à jour ne s'installe que lorsque vous appuyez sur ce bouton, jamais à la simple fermeture de l'application.
- Sous Linux, seul l’AppImage se met à jour tout seul. Avec une installation deb ou rpm, l’application vous signale la nouvelle version et ouvre la page de téléchargement ; installez le nouveau fichier de la même manière.
- **Menu (☰) ▸ Rechercher les mises à jour** lance la vérification quand vous le demandez. Sur un Mac, c’est **Aide ▸ Rechercher les mises à jour**.
- Lorsque la vérification échoue — pas de réseau, ou rien de publié pour l’instant —, il ne se passe rien et l’application continue de fonctionner comme avant.
- **Canal de mise à jour**, également sous Paramètres ▸ À propos, vaut Stable ou Bêta. Une modification prend effet immédiatement et déclenche une recherche de mise à jour ; elle ne rétrograde pas une installation Bêta vers Stable.
- Les mises à jour ne sont pas signées non plus. Avant d’en installer une, l’application compare le fichier téléchargé à la somme de contrôle publiée avec cette version.
- Si **Redémarrer et installer** ferme l'application sans que la nouvelle version apparaisse, le lancement suivant le signale et propose de nouveau la mise à jour. Cette fois, le programme d'installation s'ouvre dans sa propre fenêtre : vous pouvez le suivre et répondre à une demande d'autorisation administrateur. Si cela ne suffit pas, la fenêtre de mise à jour renvoie vers la page de téléchargement ; installer avec le fichier obtenu là conserve vos paramètres et vos documents. Ce qu'a fait la mise à jour est consigné dans `update-log.txt`, dans le dossier de données de l'application (tapez `%APPDATA%\GenOffice` dans la barre d'adresse de l'Explorateur de fichiers pour l'ouvrir). Joignez ce fichier quand vous signalez le problème.

## Le build que vous exécutez

**Paramètres ▸ À propos** est l'endroit où l'application indique la version que vous avez, le canal qu'elle suit et où se trouve le projet. Elle y nomme aussi le projet open source sur lequel cette application est basée.

## La ligne de commande est incluse

Chaque installation livre une commande `ieumoffice` qui parle aux mêmes moteurs que la fenêtre : les deux ne peuvent donc pas se contredire sur un fichier. `ieumoffice install-cli` la met sur votre `PATH`. Pour ce qu’elle sait faire, voir [Ligne de commande et agents](help://cli).
