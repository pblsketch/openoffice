# Google Drive

Connectez Google Drive pour ouvrir dans GenOffice les fichiers Drive que vous choisissez et les modifier. Quand vous enregistrez, le fichier retourne dans Drive. GenOffice ne peut ouvrir que les fichiers que vous choisissez dans la fenêtre de Google ; il ne voit pas le reste de votre Drive.

## Se connecter

1. Ouvrez **Paramètres ▸ Intégrations**.
2. Lisez **Avant d'utiliser des fichiers Drive avec l'IA**, désactivez l'entraînement des modèles dans les comptes d'IA que vous utilisez avec des fichiers Drive, puis cochez cet élément.
   - Claude : dans **Paramètres ▸ Confidentialité** de Claude, désactivez l'entraînement des modèles.
   - ChatGPT et Codex : dans **Paramètres ▸ Gestion des données** de ChatGPT, désactivez **Améliorer le modèle pour tous**.
   - Les fournisseurs à clé API n'utilisent pas les données de l'API pour l'entraînement par défaut.
   - Les connexions d'IA gratuites (modèles gratuits d'OpenRouter, Gemini) ne reçoivent jamais de fichiers Drive.
3. Cliquez sur **Connecter Google Drive**. La page de connexion de Google s'ouvre dans votre navigateur. Connectez-vous et autorisez l'accès.
4. Revenez à GenOffice. La carte affiche le compte connecté.

Google n'autorise pas l'envoi de fichiers Drive à un service d'IA qui s'en sert pour entraîner ses modèles : tant que l'élément n'est pas coché, vous ne pouvez ni vous connecter ni choisir de fichiers.

La connexion est conservée sur ce PC avec le chiffrement que votre système d'exploitation fournit à votre compte utilisateur (la protection propre à Windows, le trousseau de macOS, ou un trousseau de bureau sous Linux). Si ce PC ne peut pas la chiffrer, la connexion ne dure que jusqu'à la fermeture de l'application.

## Ouvrir des fichiers Drive

- Cliquez sur **Google Drive** dans la barre latérale de l'accueil, puis sur **Choisir dans Google Drive**.
- Le sélecteur de fichiers de Google s'ouvre dans votre navigateur. Choisissez les fichiers à ouvrir (plusieurs à la fois, c'est possible) ; GenOffice revient au premier plan et les ouvre dans le bon éditeur.
- Les fichiers choisis une fois restent dans la liste **Fichiers choisis**. Rouvrez-les depuis cette liste, ou cherchez-les par nom et par contenu.
- Les formats que GenOffice ne peut pas ouvrir sont grisés. Les documents, feuilles de calcul et présentations Google s'ouvrent comme fichiers Word, Excel et PowerPoint.

## Enregistrer dans Drive

- Enregistrez comme d'habitude. Peu après, le fichier est envoyé dans Drive.
- Si quelqu'un a modifié le fichier dans Drive après son ouverture, on vous demande s'il faut remplacer le fichier dans Drive, enregistrer une copie dans Drive ou garder la modification sur ce PC uniquement.
- Un fichier en lecture seule est enregistré dans Drive sous forme de copie, ou gardé sur ce PC.
- Un document Google reste tel quel. Vos modifications sont enregistrées comme fichier Office dans le même dossier, ou dans Mon Drive si ce dossier n'accepte pas l'écriture.
- Si un envoi échoue, vos modifications restent sur ce PC et GenOffice réessaie, y compris au prochain démarrage de l'application.

## L'IA et Drive

- Dans le panneau IA des éditeurs Word, Excel, PowerPoint, HTML, carte mentale et Hangul, cliquez sur **Joindre depuis Google Drive**, à côté du bouton de pièce jointe, pour choisir des fichiers dans la fenêtre de Google de votre navigateur et les joindre comme des fichiers de ce PC. Jusqu'à 20 à la fois.
- Tant que **Laisser l'IA trouver et lire des fichiers dans Drive** est activé (il s'active à la connexion), l'IA de chaque éditeur peut chercher et lire les fichiers Drive que vous avez choisis dans GenOffice. Par exemple : « Trouve dans mon Drive le compte rendu de réunion du mois dernier et résume-le. » Si le fichier est introuvable, choisissez-le d'abord sur l'écran d'accueil.
- Ce que l'IA lit est envoyé au fournisseur d'IA que vous utilisez. Les parties masquées à l'IA restent masquées.
- Quand l'IA utilisée est une connexion gratuite, ni la jonction depuis Drive ni la lecture de Drive par l'IA ne fonctionnent.
- L'IA ne peut pas modifier, supprimer ni partager des fichiers Drive.
- Dès qu'une conversation contient un contenu lu dans Drive, elle n'utilise plus la recherche web, la recherche d'images, la lecture de pages par adresse web ni l'insertion d'images par adresse web. Commencez une nouvelle conversation pour les retrouver.

## Se déconnecter

Cliquez sur **Déconnecter** dans **Paramètres ▸ Intégrations**. GenOffice supprime la connexion de ce PC et demande à Google de retirer son accès. Les copies de fichiers déjà sur ce PC restent. Vous pouvez aussi retirer l'accès à tout moment dans **Connexions tierces** de votre compte Google.
