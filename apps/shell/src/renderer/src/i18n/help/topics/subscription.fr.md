# Connexion par abonnement

GenOffice fait fonctionner son IA avec un abonnement que vous avez déjà : un abonnement Claude (Anthropic) ou un abonnement Codex (OpenAI). Codex est le programme d’OpenAI, et vous vous y connectez avec votre forfait ChatGPT. Vous n’avez pas besoin de clé API, et GenOffice n’a pas de compte propre auquel s’inscrire.

## Comment ça marche

- L’IA n’est pas intégrée à GenOffice. Un programme de la société est installé sur ce PC — **Claude Code** pour un abonnement Claude, **Codex** pour un abonnement ChatGPT — et GenOffice lui demande la réponse.
- Ce programme est connecté avec votre propre compte : chaque requête est donc décomptée de votre propre forfait.
- GenOffice n’affiche jamais de formulaire de connexion à lui et ne lit ni n’enregistre jamais vos identifiants. Vous vous connectez dans le programme et sur la page web de la société.

## Avant de commencer

Il vous faut l’un des deux. Avoir les deux convient très bien.

- Un abonnement Claude (forfait Pro ou Max ; un compte Claude gratuit ne peut pas se connecter), et le programme Claude Code installé et connecté sur ce PC.
- Un abonnement ChatGPT, et le programme Codex installé et connecté sur ce PC.

Si le programme n’est pas encore installé, ou pas encore connecté, les boutons de la section suivante s’en chargent.

## Établir la connexion

1. Ouvrez **Paramètres** depuis la ligne en bas à gauche de l’accueil et choisissez **IA**. Sous **Connexion par abonnement** se trouvent une carte pour Claude et une pour Codex.
2. Lisez ce qu’indique la carte et appuyez sur son bouton. Le tableau ci-dessous explique chaque état.
3. Revenez à la fenêtre de GenOffice. La carte se revérifie d’elle-même, et **Vérifier à nouveau** lance la vérification tout de suite.

À la deuxième étape des écrans de bienvenue au premier lancement, et dans le panneau IA lorsqu’aucune IA n’est connectée, la question « Quelle IA utilisez-vous déjà ? » s’affiche d’abord. Choisissez un abonnement Claude payant, ChatGPT ou aucun des deux pour l’instant : seules les étapes de ce parcours (Installer le programme → Se connecter → Connecté) et sa carte s’affichent. **Choisir une autre méthode** permet de choisir à nouveau, et vous pouvez tout passer et établir la connexion plus tard. Si la connexion échoue toujours, appuyez sur **Copier les infos pour obtenir de l’aide** et envoyez le contenu copié à la personne qui vous aide. Il ne contient ni compte ni chemin de fichier.

| Ce qu’indique la carte                    | Ce que cela signifie                                                                                                         | Que faire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vérification…**                         | GenOffice demande au programme où il en est.                                                                                 | Patientez un instant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Non installé**                          | Le programme est introuvable sur ce PC.                                                                                      | Appuyez sur **Installer**. La commande d’installation officielle de la société s’exécute dans une nouvelle fenêtre de terminal : vous voyez ainsi ce qu’elle fait. GenOffice ne télécharge rien de lui-même. Pour installer à la main, **Guide d’installation officiel** ouvre les instructions de la société.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Non connecté**                          | Le programme est là, mais aucun compte n’y est connecté.                                                                     | Appuyez sur **Se connecter**. La page de connexion de la société s’ouvre dans votre navigateur : connectez-vous-y et autorisez l’accès, la carte se connecte d’elle-même. Prenez votre temps : la connexion peut prendre un moment. Si le navigateur ne s’ouvre pas du tout, appuyez sur **Le navigateur ne s’est pas ouvert ?** sur la carte (au bout de 25 secondes, il devient un bouton **Ouvrir la fenêtre de connexion**). N’appuyez pas dessus si vous êtes encore en train de vous connecter dans le navigateur : il interrompt cette connexion et tout recommence depuis le début. La fenêtre de connexion qui s’ouvre indique en haut les étapes à suivre. Pour y coller un code, faites un clic droit dans la fenêtre, puis appuyez sur Entrée. Il est normal que le code collé ne s’affiche pas ; si le message "Invalid code" apparaît, collez de nouveau le code dans la même fenêtre. Pour arrêter la connexion, appuyez sur **Annuler la connexion**. |
| **Connecté**                              | Une connexion par abonnement a été confirmée. Le nom du forfait s’affiche lorsque le programme l’indique.                    | Rien. L’IA est prête.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Connecté, mais pas avec un abonnement** | Le programme est connecté avec une clé API ou un compte facturé à l’usage, ou le type de connexion n’a pas pu être confirmé. | Voir « Connexions facturées à l’usage » ci-dessous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Impossible de vérifier la connexion**   | La vérification elle-même a échoué. La raison figure sur la carte.                                                           | Appuyez sur **Vérifier à nouveau**. Si la carte indique que le programme est trop ancien, appuyez sur **Mettre à jour** : la mise à jour officielle de la société s’exécute dans une nouvelle fenêtre. Une fois terminée, revenez à GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

La connexion est vérifiée au démarrage de l’application, à l’ouverture des Paramètres et lorsque vous revenez à la fenêtre après avoir lancé une installation ou une connexion.

## Sans abonnement : une IA gratuite

Pas d’abonnement Claude ni ChatGPT ? Sous Paramètres ▸ IA, **Utiliser gratuitement** permet de connecter une IA gratuite à la place. Choisir **Ni l’un ni l’autre pour l’instant** à la deuxième étape des écrans de bienvenue affiche les mêmes cartes, et le choisir dans le panneau IA lorsque rien n’est connecté propose **Connecter une IA gratuite**.

- **OpenRouter** : appuyez sur **Connecter dans le navigateur**. Votre navigateur ouvre OpenRouter ; inscrivez-vous ou connectez-vous, puis autorisez l’accès. Quand le navigateur indique que la connexion est établie, fermez l’onglet et revenez. Il n’y a aucune clé à copier, et la carte indique combien de requêtes gratuites il reste aujourd’hui.
- **Google Gemini** : appuyez sur **Obtenir une clé**, créez une clé dans Google AI Studio, collez-la dans la carte et appuyez sur **Connecter**. Réservé aux personnes de 18 ans ou plus. Une clé créée dans un projet Google dont la facturation est activée peut entraîner des frais.
- Une fois connectée, cette IA devient l’**IA à utiliser**. Si les deux sont connectées, **Utiliser cette IA** sur une carte permet de passer de l’une à l’autre. **Déconnecter** retire la clé de GenOffice.
- Les modèles gratuits sont moins performants que ceux des abonnements, et le nombre de requêtes par jour est limité. Une seule modification d’un document peut en demander plusieurs. Quand le quota du jour est épuisé, le panneau IA l’indique, ainsi que le moment où elle sera de nouveau utilisable.
- Tant que vous l’utilisez gratuitement, ce que vous envoyez peut servir à améliorer l’IA de cette société. Soyez prudent avec les documents qui contiennent des données personnelles.

## Connexions facturées à l’usage

Une carte qui indique **Connecté, mais pas avec un abonnement** porte un avertissement : « Ce n’est pas un abonnement : vous payez ce que vous consommez. »

- GenOffice n’utilise pas cette connexion tant que vous n’avez pas appuyé sur **Utiliser quand même**. Dès lors, chaque requête est facturée à ce compte.
- Même alors, elle n’est jamais choisie automatiquement. Choisissez-la vous-même sous **IA à utiliser**, où elle porte la mention **Payant**.
- Votre autorisation n’est retenue que pour ce programme. Elle est effacée lorsque le programme est déconnecté ou que sa connexion change.
- Pour utiliser plutôt votre abonnement, connectez le programme avec le compte de votre abonnement et appuyez sur **Vérifier à nouveau**.

## Changer de compte ou se déconnecter

Quand le programme est connecté, sa carte affiche le compte utilisé, à côté du nom du forfait, si le programme l’indique. Elle comporte aussi deux boutons.

- **Se connecter avec un autre compte** relance la procédure de connexion du programme lui-même. Terminez-la dans la fenêtre qui s’ouvre, avec l’autre compte.
- **Se déconnecter** exécute la déconnexion du programme lui-même. La carte indique ensuite **Non connecté**.
- Les deux s’appliquent à ce programme sur tout ce PC, pas seulement à GenOffice. Si vous utilisez aussi Claude Code ou Codex dans un terminal, il y est déconnecté lui aussi, ou passe à l’autre compte. GenOffice vous demande donc de confirmer avant.
- Le compte et ces deux boutons n’apparaissent qu’ici, sous Paramètres ▸ IA. GenOffice affiche le compte et ne l’enregistre nulle part.

## Quelle IA est utilisée

**IA à utiliser**, sous Paramètres ▸ IA, est réglé au départ sur **Automatique**. Automatique décide dans cet ordre :

1. Claude, lorsque sa carte indique Connecté.
2. Sinon Codex, lorsque sa carte indique Connecté.
3. Sinon aucune IA n’est connectée, et le panneau IA affiche le guide de connexion au lieu d’une erreur.

Automatique ne choisit jamais rien qui coûte de l’argent en plus : ni une clé API, ni une connexion facturée à l’usage. Celles-ci ne servent que tant que vous les choisissez vous-même.

Vous pouvez aussi choisir une IA vous-même, au même endroit ou dans la liste des modèles en bas du panneau IA. Si celle que vous avez choisie cesse de fonctionner, GenOffice ne passe pas discrètement à une autre. Il vous dit ce qui s’est passé et montre comment rétablir la connexion.

La liste des modèles affiche les modèles que le programme indique lui-même : chacun par son nom, avec son identifiant exact à côté, et **Modèle par défaut** avec le modèle qu’il désigne actuellement. L’étiquette en bas du panneau IA et **IA à utiliser** nomment aussi ce modèle. Lire cette liste ne demande rien à l’IA et ne compte donc pas dans votre forfait. Si le programme est trop ancien pour indiquer ses modèles, une courte liste intégrée est affichée à la place.

Partout où Codex peut être choisi, une ligne l’accompagne : « Utiliser un abonnement Codex dans une application n’est pas une méthode officiellement recommandée par OpenAI. » Décidez en connaissance de cause.

## Quand une requête est arrêtée

Une requête s’arrête lorsque la limite du forfait est atteinte, lorsque la connexion au compte a expiré ou lorsque le programme n’est plus là. GenOffice ne bascule pas de lui-même vers une autre IA.

- La raison s’affiche là où la réponse s’est arrêtée. Pour une limite atteinte, l’heure de réinitialisation s’affiche aussi, lorsque le programme l’indique.
- Si votre autre abonnement est connecté, un bouton **Continuer avec …** apparaît, par exemple **Continuer avec Codex**. Appuyer dessus en fait l’IA à utiliser — la liste des modèles montre le changement — et relance la requête.
- Si la seule autre connexion est une connexion facturée à l’usage que vous avez autorisée, le même bouton s’accompagne d’une note sur le coût.
- Il n’y a jamais de bouton qui vous fasse passer à une clé API.

## La ligne d’utilisation

Dès que vous avez utilisé 80 % ou plus d’une limite, le panneau IA affiche une ligne telle que « 85 % utilisés · réinitialisation à 15:00 ». Claude indique une limite sur 5 heures et une limite sur 7 jours, et Codex est présenté de la même façon lorsqu’il les indique. En dessous de 80 %, ou lorsque le programme n’indique rien, aucune ligne ne s’affiche.

## Ce qui est envoyé, et où

La première fois qu’un abonnement peut être utilisé, GenOffice affiche un avis, une seule fois. Pour le relire, allez dans Paramètres ▸ IA ▸ **Avis de première connexion** et appuyez sur **Revoir**. Il dit trois choses :

- Le contenu du document et votre conversation sont envoyés à Anthropic ou à OpenAI sous votre propre compte.
- L’utilisation de ce contenu pour entraîner l’IA dépend des paramètres de votre propre compte auprès de cette société, et non de GenOffice.
- GenOffice désactive l’enregistrement de l’historique des conversations de Codex, mais Codex peut tout de même conserver ses propres journaux de diagnostic sur ce PC.

Tout ce que vous avez masqué avec **Masquer la sélection à l'IA** n’est pas envoyé, quelle que soit l’IA utilisée.

## Bon à savoir

- **Vitesse.** Une réponse par abonnement démarre quelques secondes plus tard qu’avec une clé API, car le programme de la société doit d’abord se lancer.
- **Forfait ChatGPT gratuit.** Il apparaît comme Connecté, mais ses limites sont faibles : les requêtes s’arrêtent donc plus tôt. La ligne d’utilisation ne s’affiche pas pour lui.
- **Génération d’images.** Dans cette version, un abonnement ne génère pas d’images, quel que soit le forfait. Il faut pour cela la clé d’un fournisseur d’images ; voir [Modèles IA et paramètres](help://ai-models).
- **Proxys.** Claude Code et Codex ne reprennent pas les réglages de proxy de GenOffice. Ils utilisent le proxy défini pour ce PC, par exemple la variable d’environnement `HTTPS_PROXY`, exactement comme lorsque vous les lancez dans un terminal. S’ils ne parviennent pas à se connecter dans un terminal, ils n’y parviendront pas non plus d’ici.
- **Commandes et autres programmes.** Une requête qui arrive de la commande `ieumoffice` ou d’un agent de programmation connecté n’utilise pas votre abonnement, sauf si vous l’autorisez. Voir [Connecter un agent de codage](help://mcp).
