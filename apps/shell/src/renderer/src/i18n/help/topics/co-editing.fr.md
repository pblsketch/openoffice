# Coédition sur votre réseau

Les personnes connectées au même réseau (LAN) peuvent ouvrir ensemble un document, le modifier en même temps et voir les curseurs et les noms des autres. Aucun serveur ni compte n’est nécessaire : le PC qui partage le document gère la session, et lui seul enregistre le fichier.

## Partager un document

1. Ouvrez le document et cliquez sur **Collaborer** dans la barre d’outils de l’éditeur.
2. Saisissez **Mon nom** et choisissez **Ma couleur**. Les autres les voient à côté de votre curseur.
3. Cliquez sur **Démarrer le partage**. Un **Code PIN** à 6 chiffres et l’**Adresse de ce PC** s’affichent.
4. Communiquez le code PIN aux personnes qui vont rejoindre la session, ainsi que l’adresse si elles ne trouvent pas le document.

Enregistrez d’abord le document s’il contient des modifications non enregistrées. Un document protégé par mot de passe ne peut pas être partagé. Le bouton **Nouveau code PIN** change le code PIN du document ; les personnes déjà connectées restent dans la session.

Pour arrêter, rouvrez **Collaborer** et cliquez sur **Arrêter le partage**. Chaque personne qui a rejoint la session garde une copie non enregistrée sur son PC.

## Rejoindre

1. Dans n’importe quel éditeur, cliquez sur **Collaborer** puis passez à **Rejoindre**.
2. Choisissez le document sous **Documents trouvés**, ou saisissez l’adresse du PC qui partage dans **Adresse**.
3. Saisissez le code PIN et cliquez sur **Rejoindre**. Le document partagé s’ouvre dans un nouvel onglet.

Tant que vous participez, c’est la personne qui partage qui enregistre le fichier. Votre commande Enregistrer n’a aucun effet et vous le signale, et l’onglet ne demande jamais à être enregistré quand vous le fermez. **Quitter** vous fait sortir de la session. Quand la session prend fin, l’onglet reste ouvert sous forme de copie non enregistrée, que vous pouvez enregistrer où vous voulez.

## Modifier ensemble

- Le curseur ou la sélection de chaque personne s’affiche dans sa couleur, avec son nom.
- Annuler ne revient que sur vos propres modifications.
- Certaines fonctions sont désactivées pendant une session, par exemple celles qui modifient d’autres parties du document que son contenu. L’éditeur vous prévient quand il en refuse une.
- Dans l’éditeur Hangul, seule la personne qui partage peut modifier. Les participants suivent les changements en direct.
- Les fichiers texte brut et JSON s’ouvrent dans la vue source de l’éditeur Markdown et ne peuvent pas encore être partagés.

## Sécurité

- Le code PIN n’est jamais envoyé sur le réseau. Il est vérifié par un échange de clés, et tout ce qui suit est chiffré. Les autres personnes du réseau ne peuvent lire ni le document, ni les modifications, ni le code PIN.
- Après 5 codes PIN erronés depuis un même PC, ce PC doit attendre 10 minutes. Après 20 codes PIN erronés au total, chaque document partagé reçoit un nouveau code PIN et la personne qui partage en est informée.
- Jusqu’à 16 personnes peuvent rejoindre un même document.
- Pendant le partage, votre nom et le titre du document sont annoncés sur le réseau pour que les autres puissent le trouver.
- Lors du premier partage, le Pare-feu Windows peut demander une autorisation. Autorisez l’accès sur les réseaux privés. Si vous le bloquez, les autres PC ne pourront pas se connecter.
