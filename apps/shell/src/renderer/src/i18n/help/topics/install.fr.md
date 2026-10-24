# Installer GenOffice

Chaque version est publiée sur la [page Releases](https://github.com/pblsketch/openoffice/releases/latest) du projet sur GitHub. Cette version est publiée pour Windows.

## Choisir le fichier pour votre machine

| Plateforme  | Prérequis                                           | Fichier                         |
| ----------- | --------------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 ou version ultérieure, Intel/AMD 64 bits | `GenOffice-Setup-<version>.exe` |

Les versions antérieures restent sur la page Releases.

## Sous Windows

1. Téléchargez `GenOffice-Setup-<version>.exe` depuis la page Releases.
2. Lancez-le. L’installeur n’est pas signé numériquement : Windows peut donc afficher d’abord une fenêtre bleue « Windows a protégé votre ordinateur ». Choisissez **Informations complémentaires**, puis **Exécuter quand même**. Le libellé exact dépend de votre version de Windows.
3. Suivez l’installeur jusqu’au bout.

Il place GenOffice dans le menu Démarrer et enregistre `.docx`, `.xlsx`, `.pptx`, `.pdf` et formats voisins, si bien qu’un double-clic sur un fichier l’ouvre.

Comme l’installeur n’est pas signé, n’exécutez que celui que vous avez téléchargé depuis la page Releases ci-dessus.

## Mises à jour

- GenOffice cherche une version plus récente sur la même page GitHub Releases. Lorsqu’il y en a une, **Paramètres ▸ À propos** la propose : appuyez sur **Mettre à jour vers …**, attendez la fin du téléchargement, puis appuyez sur **Redémarrer et installer**.
- **Menu (☰) ▸ Rechercher les mises à jour** lance la vérification quand vous le demandez. Sur un Mac, c’est **Aide ▸ Rechercher les mises à jour**.
- Lorsque la vérification échoue — pas de réseau, ou rien de publié pour l’instant —, il ne se passe rien et l’application continue de fonctionner comme avant.
- **Canal de mise à jour**, également sous Paramètres ▸ À propos, vaut Stable ou Bêta. Une modification prend effet immédiatement et déclenche une recherche de mise à jour ; elle ne rétrograde pas une installation Bêta vers Stable.
- Les mises à jour ne sont pas signées non plus. Avant d’en installer une, l’application compare le fichier téléchargé à la somme de contrôle publiée avec cette version.

## Le build que vous exécutez

**Paramètres ▸ À propos** est l'endroit où l'application indique la version que vous avez, le canal qu'elle suit et où se trouve le projet. Elle y nomme aussi le projet open source sur lequel cette application est basée.

## La ligne de commande est incluse

Chaque installation livre une commande `ieumoffice` qui parle aux mêmes moteurs que la fenêtre : les deux ne peuvent donc pas se contredire sur un fichier. `ieumoffice install-cli` la met sur votre `PATH`. Pour ce qu’elle sait faire, voir [Ligne de commande et agents](help://cli).
