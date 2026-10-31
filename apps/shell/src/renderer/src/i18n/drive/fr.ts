import type { zh } from './zh'

export const fr = {
  driveNav: 'Google Drive',
  driveDesc:
    'Choisissez des fichiers dans Google Drive, puis ouvrez-les et modifiez-les dans GenOffice ; l’enregistrement les renvoie dans Drive. GenOffice ne peut ouvrir que les fichiers que vous choisissez.',
  driveConnect: 'Connecter Google Drive',
  driveConnecting: 'Connectez-vous à votre compte Google dans le navigateur et autorisez l’accès…',
  driveCancel: 'Annuler',
  driveConnectedAs: 'Connecté en tant que {email}',
  driveDisconnect: 'Déconnecter',
  driveDisconnectConfirm:
    'Cela supprime la connexion Drive de ce PC et demande à Google de retirer l’accès de GenOffice. Les copies déjà présentes sur ce PC restent.',
  driveDisconnectYes: 'Déconnecter',
  driveNotPersisted:
    'Ce PC ne peut pas conserver la connexion chiffrée : elle prend fin à la fermeture de l’application.',
  driveExpired:
    'Google a mis fin à la connexion : l’accès a été retiré ou la connexion a expiré. Connectez-vous à nouveau.',
  driveAiAccess: 'Laisser l’IA trouver et lire des fichiers dans Drive',
  driveAiAccessDesc:
    'Activé, l’IA des éditeurs peut chercher et lire les fichiers Drive que vous avez choisis ici. Ce qu’elle lit est envoyé au fournisseur d’IA que vous utilisez. L’IA ne peut pas modifier, supprimer ni partager des fichiers Drive.',
  drivePrivacy:
    'Les listes et le contenu des fichiers circulent uniquement entre ce PC et Google. Ils ne passent jamais par un serveur des auteurs de GenOffice.',
  driveFailDenied: 'La connexion n’a pas abouti car Google ne l’a pas autorisée.',
  driveFailScope:
    'La connexion n’a pas abouti car l’accès à Drive n’était pas coché. Reconnectez-vous et cochez l’élément Drive.',
  driveFailTimeout: 'La connexion ne s’est pas terminée en 10 minutes. Réessayez.',
  driveFailNetwork: 'Impossible de joindre Google. Vérifiez votre connexion Internet et réessayez.',
  driveRecent: 'Fichiers choisis',
  driveSearchPlaceholder: 'Rechercher dans les fichiers choisis',
  driveSearchResults: 'Résultats pour « {q} »',
  driveRefresh: 'Actualiser',
  driveNotConnectedTitle: 'Google Drive n’est pas connecté',
  driveNotConnectedBody:
    'Une fois connecté, vous pouvez choisir des fichiers Drive, les ouvrir et les modifier ici, et l’enregistrement les renvoie dans Drive.',
  driveOpenSettings: 'Connecter dans les paramètres',
  driveEmpty:
    'Aucun fichier pour l’instant. Cliquez sur « Choisir dans Google Drive » pour en sélectionner.',
  driveLoading: 'Chargement…',
  driveLoadMore: 'Afficher plus',
  driveOpening: 'Ouverture…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Un document Google s’ouvre comme fichier Office. L’enregistrement laisse l’original intact et enregistre un fichier Office à côté, ou dans Mon Drive.',
  driveReadOnly: 'Lecture seule',
  driveReadOnlyNote:
    'Vous ne pouvez pas modifier ce fichier. À l’enregistrement, on vous demandera s’il faut enregistrer une copie dans Drive.',
  driveUnsupported: 'Cette application ne peut pas ouvrir ce type de fichier.',
  driveErrNotConnected: 'Google Drive est déconnecté. Reconnectez-le dans les paramètres.',
  driveErrNotFound: 'Fichier introuvable. Il a été supprimé, ou ce compte ne peut pas le voir.',
  driveErrForbidden: 'Ce compte n’est pas autorisé à télécharger ce fichier.',
  driveErrTooLarge: 'Le fichier est trop volumineux pour être ouvert.',
  driveErrRateLimit: 'Google limite les requêtes pour un moment. Réessayez bientôt.',
  driveErrNetwork: 'Impossible de joindre Google Drive. Vérifiez votre connexion Internet.',
  driveErrDisk: 'Le fichier n’a pas pu être enregistré sur ce PC.',
  drivePick: 'Choisir dans Google Drive',
  drivePicking: 'Choisissez des fichiers dans la fenêtre Google ouverte dans votre navigateur…',
  drivePickNote:
    'GenOffice ne peut ouvrir que les fichiers Drive que vous choisissez dans la fenêtre de Google. Les fichiers choisis une fois restent dans cette liste.',
  driveTrainingTitle: 'Avant d’utiliser des fichiers Drive avec l’IA',
  driveTrainingBody:
    'Google n’autorise pas l’envoi de fichiers Drive à un service d’IA qui s’en sert pour entraîner ses modèles. Les abonnements personnels Claude, ChatGPT et Codex peuvent utiliser vos conversations pour l’entraînement si vous ne le désactivez pas : dans Claude, sous Paramètres → Confidentialité ; dans ChatGPT, sous Paramètres → Gestion des données → « Améliorer le modèle pour tous ». Les fournisseurs à clé API n’entraînent pas leurs modèles sur les données de l’API par défaut. Les connexions d’IA gratuites ne reçoivent jamais de fichiers Drive.',
  driveTrainingAck:
    'L’entraînement des modèles est désactivé dans les comptes d’IA que j’utilise avec des fichiers Drive',
  driveFailTraining: 'Cochez d’abord l’élément sur l’entraînement des modèles ci-dessus.',
} satisfies Record<keyof typeof zh, string>
