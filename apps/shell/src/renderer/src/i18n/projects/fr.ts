import type { zh } from './zh'

export const fr = {
  navProjects: 'Projets',
  intro:
    'Faites d’un dossier un projet : ses documents, ses consignes, sa mémoire et ses conversations deviennent le contexte du panneau IA. Tout est conservé dans ce dossier.',
  emptyHint:
    'Aucun projet pour l’instant. Créez-en un ou utilisez un dossier existant comme projet.',
  newNameLabel: 'Nom du nouveau projet',
  create: 'Créer',
  cancel: 'Annuler',
  backToList: 'Tous les projets',
  projectNameLabel: 'Nom du projet',
  saveName: 'Enregistrer le nom',
  renameHint: 'Le dossier garde son nom.',
  openInExplorer: 'Ouvrir dans l’Explorateur de fichiers',
  openInFinder: 'Afficher dans le Finder',
  trustUse: 'consignes et mémoire envoyées à l’IA',
  trustWithout: 'utilisé sans consignes',
  trustWithoutDesc:
    'Les consignes, la mémoire et les conversations d’autres PC ne sont pas envoyées à l’IA, et aucune mémoire n’est conservée.',
  trustUnconfirmed: 'dossier pas encore confirmé',
  retry: 'Réessayer',
  relocate: 'Choisir à nouveau le dossier',
  missingNote: 'Dossier introuvable. Si vous l’avez déplacé, choisissez son nouvel emplacement.',
  tabsLabel: 'Contenu du projet',
  tabInstructions: 'Consignes',
  tabMemory: 'Mémoire',
  tabFiles: 'Fichiers',
  tabChats: 'Conversations',
  instructionsDesc:
    'Les règles de travail que l’IA suit dans ce projet. Elles accompagnent chaque demande d’un panneau IA où ce projet est choisi.',
  instructionsPlaceholder:
    'Par exemple : rédiger les rapports sur un ton formel et écrire les dates sous la forme 30 oct. 2026.',
  save: 'Enregistrer',
  saved: 'Enregistré.',
  saveUnwritable: 'Impossible d’écrire dans ce dossier, rien n’a été enregistré.',
  alsoRead: 'Lus aussi',
  readAgentsFiles: 'Lire aussi AGENTS.md et CLAUDE.md en haut du dossier comme consignes',
  withoutNotSent:
    'Ce projet est utilisé sans consignes : rien de ceci n’est envoyé à l’IA pour l’instant.',
  memoryDesc:
    'Les notes que l’IA a prises pendant les conversations. Supprimez ce qui est faux ou inutile.',
  memoryEnabled: 'Conserver la mémoire',
  memoryEnabledDesc:
    'Désactivé, l’IA n’écrit plus rien de nouveau. La mémoire existante reste lue.',
  memoryLength: '{count} entrées · {chars} caractères',
  memoryEmpty: 'Aucune mémoire pour l’instant.',
  memoryEditAll: 'Tout modifier',
  memoryEditLabel: 'Toute la mémoire',
  memoryConflict: 'Il existe des copies en conflit de synchronisation : {names}',
  consolidating: 'Mise en ordre…',
  stop: 'Arrêter',
  consolidateConnect:
    'Aucune IA utilisable n’est connectée. Connectez-en une, puis appuyez à nouveau.',
  openAiSettings: 'Ouvrir les réglages IA',
  consolidateChecking: 'Vérification de la connexion IA. Appuyez à nouveau dans un instant.',
  consolidateNotice: 'Lisez d’abord l’avis de connexion IA, puis appuyez à nouveau.',
  consolidateNothing: 'Il n’y a pas de mémoire à mettre en ordre.',
  consolidateWithout:
    'Ce projet est utilisé sans consignes : sa mémoire ne peut pas être envoyée à l’IA. Appuyez sur [Utiliser aussi les consignes] ci-dessus pour la mettre en ordre.',
  consolidateFailed: 'Mise en ordre impossible. La mémoire est inchangée.',
  consolidateStopped: 'Arrêté. La mémoire est inchangée.',
  consolidateUndone: 'Retour à l’état d’avant la mise en ordre.',
  undoFailed: 'Impossible d’annuler.',
  removeMemoryAria: 'Supprimer cette mémoire : {text}',
  filesDesc:
    'Les fichiers que l’IA peut voir dans ce projet. Les fichiers cachés et le dossier .ieumoffice sont exclus.',
  filesEmpty: 'Aucun fichier visible par l’IA.',
  filesLoadFailed: 'Impossible de lire la liste des fichiers.',
  filesCount: '{count} fichiers',
  loadMore: 'Afficher plus',
  noExt: 'Sans type',
  notOnPc: 'Pas sur ce PC',
  notOnPcTitle:
    'Ce fichier est uniquement dans le cloud. Si l’IA veut le lire, on vous demande d’abord de le télécharger.',
  hideFromAi: 'Masquer à l’IA',
  hideFromAiAria: 'Masquer à l’IA : {name}',
  ignoredTitle: 'Fichiers masqués à l’IA',
  ignoredDesc:
    'Cette liste ne s’affiche que sur cet écran. Annulez pour que l’IA voie à nouveau un fichier.',
  ignoredEmpty: 'Aucun.',
  restoreAria: 'Annuler : {name}',
  chatsDesc:
    'Les conversations de ce projet. Cliquez pour en reprendre une dans le panneau IA du dernier document qui l’a utilisée.',
  actionFailed: 'Cela n’a pas fonctionné. Veuillez réessayer.',
  loadFailed: 'Impossible de lire le projet.',
  addExistingFolder: 'Utiliser un dossier existant',
  trustStatus: 'État : {state}',
  trustUseButton: 'Utiliser aussi les consignes',
  changedOutside:
    'Ce fichier a été modifié ailleurs pendant que vous le modifiiez. [Recharger] lit la nouvelle version ; [Enregistrer quand même] la remplace par ce que vous avez ici.',
  reloadFile: 'Recharger',
  saveAnyway: 'Enregistrer quand même',
  openFileAria: 'Ouvrir dans l’application : {name}',
} satisfies Record<keyof typeof zh, string>
