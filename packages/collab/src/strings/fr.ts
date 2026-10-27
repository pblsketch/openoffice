import type { zh } from './zh'

export const fr = {
  button: 'Collaborer',
  dialogTitle: 'Collaborer',
  tabShare: 'Partager ce document',
  tabJoin: 'Rejoindre',
  nameLabel: 'Mon nom',
  nameHint: 'Affiché à côté de votre curseur sur l’écran des autres participants.',
  colorLabel: 'Ma couleur',
  colorChoice: 'Couleur {n}',
  shareIntro:
    'Les personnes connectées au même réseau (LAN) peuvent afficher et modifier ce document avec vous après avoir saisi le code PIN. Le fichier est enregistré uniquement sur ce PC.',
  shareStart: 'Démarrer le partage',
  shareStarting: 'Démarrage…',
  shareStop: 'Arrêter le partage',
  pinLabel: 'Code PIN',
  pinNew: 'Nouveau code PIN',
  pinChanged:
    'Trop de codes PIN erronés ont été saisis, le code PIN a donc été remplacé. Les personnes déjà connectées restent dans la session.',
  addressLabel: 'Adresse de ce PC',
  peopleLabel: 'Participants',
  nobodyYet: 'Personne n’a encore rejoint la session.',
  you: 'vous',
  hostBadge: 'partage',
  joinIntro:
    'Saisissez le code PIN fourni par la personne qui partage. Choisissez un document trouvé sur ce réseau ou saisissez l’adresse.',
  searching: 'Recherche de documents partagés sur ce réseau…',
  foundLabel: 'Documents trouvés',
  foundBy: 'partagé par {name}',
  addressInput: 'Adresse',
  addressPlaceholder: 'p. ex. 192.168.0.12',
  pinInput: 'Code PIN (6 chiffres)',
  join: 'Rejoindre',
  joining: 'Connexion…',
  close: 'Fermer',
  leave: 'Quitter',
  errPin: 'Ce code PIN est incorrect.',
  errLocked: 'Trop de codes PIN erronés. Ce PC ne peut pas réessayer avant 10 minutes.',
  errFull: 'Cette session est complète.',
  errVersion:
    'L’autre PC utilise une version différente de l’application. Mettez les deux PC à jour vers la même version.',
  errUnreachable:
    'Impossible de se connecter à cette adresse. Vérifiez l’adresse, le réseau et le pare-feu du PC qui partage.',
  errTimeout: 'Le PC qui partage ne répond pas.',
  errInvalid: 'Vérifiez l’adresse et le code PIN.',
  errUnavailable: 'Impossible d’ouvrir ce document sur ce PC.',
  errShareNetwork:
    'Impossible de démarrer le partage sur ce PC. Vérifiez si un autre programme bloque le réseau.',
  errShareTooLarge: 'Ce document est trop volumineux pour être partagé.',
  errShareBusy: 'Cet onglet participe déjà à une session.',
  errShareSaveFirst:
    'Certaines modifications ne sont pas enregistrées. Enregistrez d’abord, puis partagez.',
  errShareEncrypted: 'Un document protégé par mot de passe ne peut pas être partagé.',
  errShareUnsupported: 'Ce document ne peut pas être partagé pour le moment.',
  endedByHost:
    'La personne qui partage a mis fin à la session. Ce document est désormais une copie non enregistrée sur ce PC.',
  endedLost:
    'La connexion au PC qui partage a été perdue. Ce document est désormais une copie non enregistrée sur ce PC.',
  endedLeft:
    'Vous avez quitté la session. Ce document est désormais une copie non enregistrée sur ce PC.',
  endedHostStopped: 'Partage arrêté.',
  guestSaveBlocked: 'Pendant une session, c’est la personne qui partage qui enregistre le fichier.',
  guestBlocked: 'Cette fonction n’est pas disponible pendant une session.',
  hostBlocked:
    'Cette fonction n’est pas disponible tant que d’autres personnes participent à la session.',
  viewOnly:
    'Dans ce format, seule la personne qui partage peut modifier. Les participants suivent les changements en direct.',
  lanNotice:
    'Les échanges sont chiffrés : seules les personnes qui saisissent le code PIN peuvent les lire. Pendant le partage, votre nom et le titre du document sont visibles sur le réseau.',
  firewallHint:
    'Si le Pare-feu Windows vous le demande lors du premier partage, autorisez l’accès sur les réseaux privés.',
  statusHosting: 'Partage · {count}',
  statusGuest: 'Dans le document de {name}',
  dismiss: 'Compris',
} satisfies Record<keyof typeof zh, string>
