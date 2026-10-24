import type { zh } from './zh'

export const fr = {
  aiAssistant: 'Assistant IA',
  cardChecking: 'Vérification…',
  cardNotInstalled: 'Non installé',
  cardSignedOut: 'Non connecté',
  cardSigningIn: 'Connexion en cours…',
  cardReady: 'Connecté',
  cardReadyPlan: 'Connecté · {plan}',
  cardMetered: 'Connecté, mais pas avec un abonnement',
  cardMeteredAccepted: 'En service · facturé à l’usage',
  cardError: 'Impossible de vérifier la connexion',
  cardErrNeedsUpdate:
    'Le programme {provider} installé sur ce PC est trop ancien. Mettez-le à jour, puis vérifiez à nouveau.',
  cardErrNeedsUpdateVersion:
    'Le programme {provider} installé sur ce PC ({version}) est trop ancien ; la version {minimum} ou plus récente est nécessaire. Exécutez {command} dans un terminal, puis vérifiez à nouveau.',
  cardErrNeedsUpdatePath: 'Fichier exécuté par cette application :',
  cardErrNeedsUpdateWindows:
    'Mettre à jour {provider} dans WSL (Ubuntu) ou dans un autre dossier ne modifie pas ce fichier. Exécutez {command} dans Windows PowerShell.',
  cardErrTimeout:
    "Le programme {provider} n'a pas répondu à temps. Vérifiez à nouveau dans un instant.",
  cardErrFailed:
    'Un problème est survenu lors de la vérification de {provider}. Vérifiez à nouveau.',
  actionInstall: 'Installer',
  actionLogin: 'Se connecter',
  actionLoginWindow: 'Le navigateur ne s’est pas ouvert ou affiche un code ?',
  actionRecheck: 'Vérifier à nouveau',
  actionAcceptMetered: 'Utiliser quand même',
  actionInstallHelp: 'Guide d’installation officiel',
  actionOpenSettings: 'Ouvrir les paramètres',
  actionDismiss: 'Fermer',
  actionSwitchAccount: 'Se connecter avec un autre compte',
  actionLogout: 'Se déconnecter',
  installNote:
    'La commande d’installation officielle de {vendor} s’exécute dans une nouvelle fenêtre de terminal.',
  loginNote: 'La page de connexion qui s’ouvre est celle de {vendor}.',
  signingInBrowserNote:
    'Connectez-vous à votre compte {vendor} dans le navigateur qui s’est ouvert, puis autorisez l’accès. La connexion se fait d’elle-même une fois terminé.',
  signingInWindowNote:
    'Si le navigateur ne s’est pas ouvert, copiez l’adresse affichée dans la fenêtre qui vient de s’ouvrir et ouvrez-la dans votre navigateur. Quand le navigateur affiche un code, copiez-le, collez-le une seule fois dans cette fenêtre et appuyez sur Entrée. Le code collé peut ne pas s’afficher dans la fenêtre.',
  meteredWarning: 'Ce n’est pas un abonnement : vous payez ce que vous consommez.',
  meteredMeaning:
    'Cette connexion utilise une clé API ou un compte facturé à l’usage, ou son type n’a pas pu être confirmé. « Utiliser quand même » permet à l’IA de fonctionner avec cette connexion, et chaque requête est facturée à ce compte.',
  connectTitle: 'Connectez une IA pour commencer',
  connectBody:
    'L’IA fonctionne avec l’abonnement Claude ou Codex que vous avez déjà. Aucune clé API n’est nécessaire.',
  connectProviderTitle: 'La connexion {provider} n’est pas utilisable pour le moment',
  connectKeyBody:
    'La configuration de {provider} n’est pas terminée. Terminez-la dans les paramètres ou choisissez une autre IA.',
  errNotConnected:
    'Aucune IA n’est connectée. Connectez d’abord un abonnement Claude ou Codex, ou une IA gratuite.',
  errNotInstalled: 'Le programme {provider} est introuvable sur ce PC.',
  errSignedOut: 'La connexion à {provider} a expiré. Reconnectez-vous pour continuer.',
  errRateLimit: 'La limite de l’abonnement {provider} est atteinte.',
  errRateLimitReset:
    'La limite de l’abonnement {provider} est atteinte. Réinitialisation à {time}.',
  errUnsafeTools:
    'Le programme {provider} a démarré avec ses propres outils activés ; l’exécution a été arrêtée par sécurité.',
  errMeteredNotAccepted:
    'La connexion {provider} est facturée à l’usage et vous ne l’avez pas encore autorisée. Choisissez « Utiliser quand même » dans les paramètres de connexion pour l’utiliser.',
  errNeedsUpdate:
    'Le programme {provider} est trop ancien pour cette fonction. Mettez-le à jour puis réessayez.',
  errHeadlessLimit: 'La limite horaire des requêtes automatiques est atteinte.',
  errHeadlessLimitReset:
    'La limite horaire des requêtes automatiques est atteinte. Les requêtes seront de nouveau possibles à {time}.',
  connectFreeHint:
    'Pas d’abonnement ? Vous pouvez connecter une IA gratuite dans les paramètres en une minute environ.',
  actionConnectFree: 'Connecter une IA gratuite',
  errFreeLimit:
    'Le quota gratuit du jour est épuisé. Réessayez demain ou choisissez une autre IA dans les paramètres.',
  errFreeLimitReset:
    'Le quota gratuit du jour est épuisé. Vous pourrez de nouveau l’utiliser à {time}.',
  continueWith: 'Continuer avec {provider}',
  continueMeteredNote:
    'La connexion {provider} n’est pas un abonnement : continuer est facturé à l’usage.',
  usageLine: '{percent} % utilisés · réinitialisation à {time}',
  usageWindowFiveHour: 'Limite sur 5 heures',
  usageWindowSevenDay: 'Limite sur 7 jours',
  noticeTitle: 'Avant d’utiliser l’IA avec votre abonnement',
  noticeSend:
    'Le contenu du document et votre conversation sont envoyés à Anthropic ou à OpenAI sous votre propre compte. Chaque requête contient aussi le nom, le titre et la description de chaque compétence réglée sur « L’IA décide » ; les compétences utilisées et les fichiers de compétence lus par l’IA sont envoyés avec eux.',
  noticeTraining:
    'L’utilisation de ce contenu pour entraîner l’IA dépend des paramètres de votre propre compte auprès de cette société.',
  noticeCodexHistory:
    'Cette application désactive l’enregistrement de l’historique des conversations de Codex, mais Codex peut tout de même conserver ses propres journaux de diagnostic sur ce PC.',
  noticePdfWholeDocument:
    'Dans l’éditeur PDF, la lecture de pages par l’IA et la traduction de documents peuvent envoyer des images des pages et tout le texte du document.',
  noticeAck: 'Compris',
  codexNotice:
    'Utiliser un abonnement Codex dans une application n’est pas une méthode officiellement recommandée par OpenAI.',
  truncatedNotice: 'L’entrée était trop longue : une partie a été coupée avant l’envoi.',
  pickerAuto: 'Automatique',
  pickerAutoUsing: 'Automatique · {provider}',
  pickerAutoUsingModel: 'Automatique · {provider} · {model}',
  pickerDefaultModel: 'Modèle par défaut',
  pickerDefaultModelNamed: 'Modèle par défaut · {model}',
  pickerSubscription: 'Abonnement',
  pickerPaid: 'Payant',
  pickerPaidTitle: 'Facturé à l’usage, non couvert par un abonnement',
  pickerNotConnected: 'Connecter l’IA',
  guideQuestion: 'Quelle IA utilisez-vous déjà ?',
  guidePathClaudeTitle: 'J’ai un abonnement Claude payant',
  guidePathClaudeBody:
    'Un forfait Pro ou Max est nécessaire. Un compte Claude gratuit ne peut pas se connecter.',
  guidePathCodexTitle: 'J’utilise ChatGPT',
  guidePathCodexBody:
    'Connectez-vous au programme Codex d’OpenAI avec votre compte ChatGPT. Le forfait gratuit ne permet qu’une utilisation limitée.',
  guidePathFreeTitle: 'Ni l’un ni l’autre pour l’instant',
  guidePathFreeBody:
    'Connectez une IA gratuite en une minute environ. Tant que vous l’utilisez gratuitement, ce que vous envoyez peut servir à améliorer l’IA de cette entreprise.',
  guideBack: 'Choisir une autre méthode',
  guideBadgeReady: 'Connecté',
  guideBadgeInstalled: 'Installé',
  guideBadgeCheck: 'À vérifier',
  guideStepsLabel: 'Étapes de connexion',
  stepInstall: 'Installer le programme',
  stepLogin: 'Se connecter',
  stepReady: 'Connecté',
  installReturnNote:
    'Une fois l’installation terminée dans cette fenêtre, revenez ici. L’application vérifie à nouveau d’elle-même.',
  loginHowNote:
    'Un navigateur s’ouvre quand vous cliquez. Connectez-vous avec votre compte {vendor} et cliquez sur Autoriser : la connexion se fait d’elle-même.',
  signingInStalledNote:
    'Le navigateur ne s’est pas ouvert ou affiche un code ? Ouvrez la fenêtre de connexion avec le bouton ci-dessous. Collez l’adresse qui y est affichée dans votre navigateur, ou collez le code du navigateur dans la fenêtre.',
  actionLoginWindowOpen: 'Ouvrir la fenêtre de connexion',
  actionCancelLogin: 'Annuler la connexion',
  actionUpdate: 'Mettre à jour',
  updateNote:
    'La mise à jour officielle de {vendor} s’exécute dans une nouvelle fenêtre quand vous cliquez. Une fois terminée, revenez ici.',
  guideInfoHint:
    'Toujours bloqué ? Copiez les informations de connexion et envoyez-les à la personne qui vous aide. Elles ne contiennent ni compte ni chemin de fichier.',
  actionCopyInfo: 'Copier les infos pour obtenir de l’aide',
  copyInfoDone: 'Copié',
  actionConnectHelp: 'Voir chaque étape à l’écran (page en coréen)',
} satisfies Record<keyof typeof zh, string>
