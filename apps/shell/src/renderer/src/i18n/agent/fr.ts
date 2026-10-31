import type { zh } from './zh'

export const fr = {
  windowTitle: 'Agent',
  homeCardSub: 'Travailler dans un dossier avec Claude Code ou Codex',
  intro:
    'L’agent exécute votre Claude Code ou Codex dans un dossier de votre choix. Il peut y lire les fichiers, en créer de nouveaux, utiliser vos compétences, exécuter des scripts et modifier les documents ouverts dans GenOffice.',
  folderLabel: 'Dossier du projet',
  folderPick: 'Choisir un dossier…',
  folderNone: 'Aucun dossier choisi',
  recentLabel: 'Dossiers récents',
  providerLabel: 'Programme',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Sous Windows, les commandes que vous autorisez s’exécutent sans isolement et peuvent accéder à tout votre PC et à Internet.',
  providerCodexNote:
    'Les commandes s’exécutent dans l’espace isolé de Codex : seul le dossier du projet peut être modifié, et il n’y a pas d’accès à Internet.',
  providerBlocked:
    'Pas encore disponible : on ne peut pas encore empêcher Codex de lire son propre fichier de connexion.',
  connChecking: 'Vérification de la connexion…',
  connUnavailable: 'Non connecté. Connectez-vous dans Paramètres → IA.',
  connMetered: 'Connecté avec une connexion payante à l’usage que vous avez acceptée.',
  modeLabel: 'Quand vous demander',
  modeAskCommands: 'Demander avant chaque commande',
  modeAskCommandsDesc:
    'La lecture et l’écriture de fichiers dans le dossier du projet se font directement. Avant d’exécuter une commande ou un script, l’agent vous demande.',
  modeAskWrites: 'Demander avant l’écriture et les commandes',
  modeAskWritesDesc:
    'Seule la lecture se fait directement. Avant d’écrire un fichier ou d’exécuter une commande, l’agent vous demande.',
  modeTrust: 'Faire confiance à ce projet',
  modeTrustDesc:
    'Plus aucune question. Codex reste quand même dans son espace isolé ; pour Claude Code, son propre vérificateur contrôle chaque action à votre place.',
  warningTitle: 'Avant de commencer',
  warningCommands:
    'Les commandes lancées par l’agent peuvent modifier des fichiers et utiliser Internet. Un document que quelqu’un vous a envoyé peut contenir des instructions cachées.',
  warningRedaction:
    'Les parties masquées pour l’AI ne le restent que dans les documents ouverts dans GenOffice. Les fichiers que l’agent lit dans le dossier sont envoyés tels quels.',
  warningUsage:
    'Un agent travaille en plusieurs étapes et consomme davantage votre abonnement que le panneau AI.',
  warningAccept: 'J’ai compris',
  start: 'Démarrer',
  starting: 'Démarrage…',
  stop: 'Arrêter',
  newSession: 'Nouvelle session',
  send: 'Envoyer',
  inputPlaceholder: 'Que doit faire l’agent ?',
  you: 'Vous',
  agent: 'Agent',
  startedLine: '{program} démarré dans {folder}',
  skillsLine: '{n} compétences disponibles',
  skillsLineOne: '{n} compétence disponible',
  toolRunning: 'En cours',
  toolDone: 'Terminé',
  toolFailed: 'Échec',
  toolDenied: 'Refusé',
  actRead: 'Lire',
  actWrite: 'Écrire',
  actCommand: 'Exécuter',
  actAppTool: 'Modifier un document ouvert',
  actSkill: 'Utiliser une compétence',
  actOther: 'Utiliser un outil',
  openFile: 'Ouvrir',
  permTitle: 'L’agent demande à :',
  permCommand: 'Exécuter cette commande',
  permWrite: 'Écrire dans ce fichier',
  permRead: 'Lire un fichier hors du dossier du projet',
  permOther: 'Utiliser l’outil « {tool} »',
  permReason: 'Raison : {reason}',
  permAllow: 'Autoriser',
  permDeny: 'Refuser',
  turnFailed: 'L’agent n’a pas pu terminer cette demande.',
  ended: 'La session est terminée.',
  errBadFolder:
    'Ce dossier ne peut pas être utilisé. Choisissez un dossier contenant votre propre travail : pas un lecteur entier, pas votre dossier personnel, ni un dossier de données de connexion ou d’application.',
  errNotConnected:
    'Ce programme n’est pas connecté. Connectez-vous dans Paramètres → IA, puis réessayez.',
  errNotAccepted: 'Lisez d’abord les remarques ci-dessus et confirmez-les.',
  errUnsafeTools:
    'Le programme a démarré avec des outils que l’application ne lui a pas donnés ; il a donc été arrêté.',
  errRateLimit: 'La limite de votre abonnement est atteinte. Réessayez plus tard.',
  errSignedOut: 'Le programme est déconnecté. Connectez-vous dans Paramètres → IA.',
  errMetered:
    'Le programme est connecté avec une connexion payante à l’usage que vous n’avez pas acceptée.',
  errSandboxUnavailable:
    "Codex ne peut pas ouvrir sur ce PC le bac à sable qui isole ses commandes ; il n'a donc pas démarré. Mettez Windows à jour ou choisissez Claude Code.",
  errNeedsUpdate:
    'Le programme est trop ancien pour le mode agent. Mettez-le à jour, puis réessayez.',
  errNotInstalled: 'Le programme n’est pas installé.',
  errGeneric: 'Un problème est survenu. Réessayez.',
  documentsUnprotected:
    'Les documents ouverts après le début de la session ({n}) ne bénéficient pas de la protection en écriture du programme. Arrêtez puis relancez la session pour les protéger.',
} satisfies Record<keyof typeof zh, string>
