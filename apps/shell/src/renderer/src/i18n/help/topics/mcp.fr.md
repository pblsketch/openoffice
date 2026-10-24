# Connecter un agent de codage

GenOffice parle le Model Context Protocol : un agent de programmation peut donc lire, écrire et rendre vos documents avec les mêmes moteurs que l’application. L’agent ne devine pas un format de fichier : il reçoit les schémas typés des ops à partir des définitions mêmes contre lesquelles l’executor valide.

## L’enregistrer depuis l’application

C’est dans **Paramètres ▸ Intégrations** qu’on fait cela. Le panneau a deux moitiés, et vous pouvez utiliser l’une, l’autre, ou les deux.

**La compétence.** Une ligne par agent de programmation trouvé sur cette machine — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, chacune avec **Installer**, **Mettre à jour** et **Désinstaller**, plus **Installer dans un autre dossier…**, **Télécharger le skill (zip)** et **Copier le chemin**. Si votre assistant n’est pas dans la liste, indiquez à GenOffice un dossier depuis lequel il lit `SKILL.md`, ou enregistrez le zip et laissez l’assistant l’installer. La compétence et le MCP peuvent coexister : l’assistant choisit l’un des deux, et ils font exactement les mêmes choses.

**MCP.** Deux voies sont proposées : **Lancé par l’assistant (recommandé)**, où vous ajoutez la configuration affichée à votre client et où l’assistant lance le serveur lui-même, et le **Serveur HTTP local**, que l’application fait tourner pour vous. Dans les deux cas, l’assistant finit par parler à GenOffice et vous ne tapez jamais une commande.

## L’enregistrer depuis la ligne de commande

La même chose depuis un terminal — c’est la voie avancée, celle qu’il faut prendre quand l’agent se trouve là où le panneau ne peut pas le trouver :

```sh
ieumoffice mcp install all
```

Il trouve les agents de programmation présents sur cette machine et écrit l’entrée du serveur stdio dans la configuration de chacun, en laissant le reste du fichier tel qu’il l’a trouvé. L’entrée s’appelle `ieumoffice`. Faite à la main pour Claude Code, la même inscription s’écrit `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Un agent installé ailleurs demande `--dir <path>` ; `--force` réécrit une entrée déjà présente.

`ieumoffice mcp --help` réunit sur un seul écran tout ce que le serveur accepte : les formes d’enregistrement, de retrait et de liste, le service en HTTP, et les deux options de schéma.

## L’exécuter sans assistant

Pour un client sur une autre machine, servez-le plutôt en HTTP :

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` change le point d’écoute. Passez le même jeton au client.

En HTTP, les fichiers circulent aussi : `PUT /files/<name>` en envoie un, chaque outil accepte une URL `http(s)` à la place d’un chemin, et les sorties reviennent sous forme d’URL de téléchargement — et, si elles sont assez petites, de ressources intégrées. Les ops, les specs et le Markdown sont transmis en ligne dans les deux cas.

## Ce que l’agent obtient

Chaque commande est un outil. Les plus intéressantes :

- **`docs`, `sheet`, `slides`** — lire et modifier un fichier par le chemin d’écriture de l’application, un **op** à la fois. Un nouveau diaporama suit `deck_start`, `deck_page`, `deck_build`.
- **`render`** — un PNG par page, mis en page par le moteur de rendu de l’application, pour que l’agent regarde une diapositive au lieu de la deviner.
- **`pdf`** — la couche de texte d’un PDF, page par page, sans lancer l’application.
- **`info`** — métadonnées et résumé de la structure : c’est généralement l’appel le moins cher sur un fichier inconnu.
- **`search`, `image`, `media`** — recherche web et recherche d’images, génération d’images et analyse de médias à travers ce qui est configuré dans l’application, donc l’agent n’a pas besoin de ses propres clés. La section suivante dit ce qu’ils peuvent utiliser.
- **`merge`** — remplir un modèle `{{key}}`.

## Recherche, images et médias : ce qu’un agent peut utiliser

Une requête venue de la commande `ieumoffice` ou d’un client MCP n’a pas été saisie par vous dans l’application : GenOffice la traite donc avec prudence.

- **La recherche** fonctionne toujours et est gratuite par défaut. La clé d’un fournisseur de recherche n’est utilisée que si vous en avez sélectionné une.
- **Générer une image** demande la clé d’un fournisseur d’images. Dans cette version, un abonnement ne génère pas d’images.
- **Décrire une image** utilise un fournisseur à clé lorsqu’il y en a un de configuré. Votre abonnement Claude ou Codex **n’est pas utilisé, sauf si vous l’autorisez**.
- **La vidéo et l’audio** ont besoin d’un fournisseur à clé qui prend en charge la vidéo.

Pour autoriser l’utilisation de l’abonnement, ouvrez Paramètres ▸ IA ▸ **Avancé** et activez **Autoriser les requêtes automatiques à utiliser un abonnement**. Un avertissement s’affiche d’abord — « Il n’y a pas de limite horaire : un programme peut envoyer autant de requêtes qu’il le souhaite, et elles peuvent contenir tout le texte d’un document et des images de ses pages. Aucune des deux entreprises ne recommande de laisser un programme utiliser automatiquement votre abonnement, et votre compte pourrait être restreint. » — et le réglage ne s’active qu’après **Activer quand même**.

Même lorsque le réglage est activé :

- Les requêtes sont traitées une par une. Les autres attendent leur tour.
- Il n’y a pas de limite horaire. Le tour passe d’une requête à l’autre, pas d’une tâche à l’autre : une longue traduction de PDF alterne donc avec les autres appelants au lieu de les bloquer. Un réglage activé avec l’ancien avertissement a été désactivé : lisez le nouvel avertissement et réactivez-le.
- Une connexion facturée à l’usage que vous avez autorisée avec **Utiliser quand même** ne compte pas ici comme un abonnement. Elle est traitée comme une clé : si vous l’avez choisie comme IA à utiliser, les descriptions d’images passent par elle quel que soit le réglage, et chacune est facturée.

Lorsque le réglage est désactivé et qu’aucune clé n’est configurée, l’outil répond que la fonction est indisponible et nomme ce réglage. Un agent peut vérifier au préalable avec l’outil `capabilities` ; voir [Ligne de commande et agents](help://cli).

## Schémas et budget plus serré

`apply` et `create` annoncent leurs paramètres `ops`, `cells` et `data` avec le schéma typé de chaque op, généré à partir de `ieumoffice guide <domain> --json`. C’est précis, et ce n’est pas petit. Un client dont la fenêtre de contexte est serrée peut demander de simples tableaux à la place :

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Pourquoi la compétence

Un agent qui ne connaît pas le vocabulaire des ops devine. La compétence embarque la référence et les guides de conception — le même contenu que celui qu’imprime `ieumoffice guide` —, si bien que l’assistant écrit des ops dont il a réellement lu la spécification. Installez-la depuis le panneau ci-dessus, ou avec `ieumoffice skill` depuis un terminal.

## Ce qu’il atteint dans l’application

Le serveur ne se limite pas aux fichiers sur le disque. Tant que GenOffice tourne, l’agent peut aussi travailler par la fenêtre :

- **`open_in_genoffice`** ouvre un fichier dans un onglet et le met au premier plan.
- **`open_documents`** liste tous les documents que vous avez ouverts — id, type, chemin, et s’ils ont des modifications non enregistrées —, puis lit le contenu actuel de l’un d’eux, l’enregistre sur place ou le ferme, en enregistrant d’abord, sauf si vous lui demandez de jeter.
- **Les outils de contenu** prennent cet id (ou le chemin) comme argument `document`, si bien qu’une modification atterrit dans l’onglet que vous avez déjà ouvert et que la fenêtre bascule pour l’afficher.

Deux choses restent hors de portée : il n’y a pas de panneau IA, et la boîte de dialogue de mise à jour de l’application ne s’applique pas.

## Le panneau Serveur HTTP local

Sous **Serveur HTTP local**, l'application fait tourner le serveur elle-même au lieu de le laisser à l'assistant : un interrupteur d'activation, un champ **Port**, un indicateur **En cours / À l'arrêt** et la **Génération en arrière-plan** (écrire les documents directement dans un chemin sans ouvrir l'interface) et l'**Exemple de configuration client** à copier. Ouvrir **Avancé** ajoute les deux URL de connexion — Streamable HTTP et celle, plus ancienne, de SSE —, une URL de **Test de santé** et un interrupteur de **Journalisation** qui enregistre l'activité du serveur et des outils dans un fichier local que vous pouvez **Ouvrir**, **Actualiser** ou **Effacer** depuis cet endroit. Il n'écoute que sur localhost.
