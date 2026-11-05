# PDF : lecture, annotation et caviardage

L’éditeur PDF a cinq onglets de ruban : **Accueil / Annoter / Édition / Pages / Affichage**. Il lit et écrit : le texte est modifiable, le contenu peut être caviardé, signé, et les formulaires peuvent être remplis.

## Lecture et navigation

- Barre latérale gauche : les **Vignettes** (cliquez pour sauter, la plage visible est mise en évidence) ou les **Signets** (le sommaire, lorsqu’il existe).
- Zoom : le contrôle de ratio en bas à droite ; ctrl+molette règle le zoom par crans.
- Déplacer l'affichage : activez l'**Outil Main** (onglets Accueil et Affichage) et faites glisser pour déplacer la page dans tous les sens. Tant qu'il est actif, le glissement ne sélectionne pas de texte et un simple clic suit toujours un lien. Glisser avec le bouton du milieu (molette) enfoncé déplace l'affichage sans l'outil. Échap ou un autre outil le désactive.
- Rotation : page par page ou pour toutes les pages depuis le menu Pages ; les rotations sont réécrites à l’enregistrement.
- Recherche : ctrl+F en texte intégral, toutes les occurrences sont mises en évidence.
- PDF chiffrés : une demande de mot de passe (dans sa propre petite fenêtre) permet de les ouvrir ; le mot de passe ne sert que pour cette session. Vous pouvez modifier et enregistrer un tel document ; l’enregistrement conserve son mot de passe. **Annoter → Protéger** définit, change ou retire le mot de passe et ce que les lecteurs peuvent faire.

## Sélection de texte et marquage (Annoter)

Essayez sur n’importe quel paragraphe :

1. **Faites glisser la souris sur une phrase** — au relâchement, une barre d’annotation flotte au-dessus :

![La barre d’annotation après la sélection de texte](img/pdf-highlight.png)

2. Choisissez l’une des trois couleurs de **Surligner**, ou **Souligner**, **Ondulé** ou **Barrer**. Pour changer une couleur de surlignage, faites un clic droit dessus et choisissez-en une autre. Après un soulignement, un trait ondulé ou un barré, une rangée de couleurs s’ouvre sur la barre : cliquez sur une autre couleur pour la changer ; la suivante utilisera aussi cette couleur. **Demander à l’IA** envoie la sélection avec votre question au panneau IA.
3. Pour annuler une annotation, sélectionnez de nouveau le même passage par glissement et cliquez sur le bouton actif de la barre (un interrupteur à la Word), ou sélectionnez-le et appuyez sur Suppr.

Référence :

- Faites glisser sur du texte et une barre contextuelle apparaît : **surligner / souligner / barrer / copier / Demander à l’IA**.
- Les couleurs viennent de la palette ; **appliquer le même marquage à une plage déjà marquée le retire** (interrupteur à la Word).
- Les marquages déjà enregistrés dans le fichier peuvent être sélectionnés et supprimés (menu ⋯ ou Suppr).
- **Remarque** : tant qu’un outil de dessin est armé, la couche de texte n’est pas sélectionnable — l’outil se désarme après chaque placement, vous êtes donc de nouveau en mode sélection pour la suite.

## Outils de dessin (Annoter)

Six outils : **Dessin, Rectangle, Ellipse, Flèche, Note**, plus le **Caviarder une zone** sur l’onglet Annoter.

- Chaque outil est un interrupteur : cliquez pour l’armer ; **il se désarme dès qu’une forme est placée** (cliquez de nouveau sur l’outil pour continuer) ; cliquer sur l’outil armé le désarme aussi.
- Le dessin suit l’épaisseur du trait ; rectangle/ellipse/flèche se tracent au glissement ; les couleurs viennent de la palette de dessin.
- Les formes placées peuvent être sélectionnées, supprimées, déplacées et (rectangle/ellipse) redimensionnées.
- **Le caviardage, procédure complète** (pour masquer une ligne de texte) :

  1. Onglet Annoter ▸ cliquez sur **Caviarder une zone** (l’outil s’arme).
  2. **Faites glisser un rectangle sur le contenu** — il est couvert d’une marque hachurée, et la barre d’outils gagne les boutons **effacer les marques / appliquer le caviardage**.

  3. Cliquez sur **Appliquer le caviardage** et confirmez — le résultat est une copie de travail où le texte et les images couverts sont physiquement supprimés (et non masqués), et cela est irréversible ; le document d’origine reste intact.

  Une erreur ? Le bouton effacer les marques supprime les marques actuelles pour vous permettre de redessiner.

## Pense-bêtes et fils de commentaires

- L’**outil Note** pose une épingle et ouvre une carte en marge pour ce texte (nom d’auteur configurable) ; une fois validé, elle est enregistrée comme annotation de texte PDF standard.
- Cliquez sur une épingle pour ouvrir le fil : **Répondre** (les réponses forment une seule liste à plat, sans imbrication), **Modifier** votre commentaire, **Supprimer** un commentaire ou un fil entier.
- Les modifications en cours survivent jusqu’à ce que l’enregistrement réécrive le nouveau texte dans la même annotation du fichier, ce qui préserve l’enchaînement des réponses.

## Modifier le contenu du PDF (Édition)

- **Modifier le texte** : cliquez sur le texte pour le modifier bloc par bloc (moteur pdfium ; polices appariées au mieux).
- **Insérer du texte** : placez un texte consultable avec la police, la taille et la couleur de votre choix.
- **Insérer une image / un tampon**.
- Formulaires : les champs AcroForm se remplissent directement ; les valeurs sont écrites à l’enregistrement.

## Signatures

- **Signature manuscrite** : dessinez-la ; elle peut être liée à un champ de signature de formulaire.
- **Signature image** : placez une image comme signature.
- Les signatures enregistrées peuvent être réutilisées.
- **Signature par certificat** (onglet Annoter) : signez avec un certificat du magasin système ou d'un fichier .p12/.pfx ; affichez ou non la signature sur la page, et certifiez ou non le document contre des changements ultérieurs.
- Signer écrit toujours un **nouveau fichier** (mise à jour incrémentale — les signatures antérieures restent valides) et ouvre la copie signée à sa place. Enregistrez d'abord : une signature couvre le fichier tel qu'enregistré sur disque.
- Une bannière au-dessus du document liste les signatures existantes ; **Afficher les signatures** montre validité, couverture et chaîne de certificats de chacune. La révocation (CRL/OCSP) n'est pas vérifiée.

## Opérations sur les pages (Pages)

- **Rotation / suppression / réorganisation** : faites glisser les vignettes pour réorganiser ; la suppression demande confirmation.
- **Importer des pages** : faites venir des pages depuis un autre PDF. **Insérer une page vierge** ajoute une page vide.
- **Remplacer les pages** échange une plage contre des pages venant d’ailleurs ; **Rogner les pages** rogne les bords, avec une option pour l’appliquer à toutes les pages.
- **Taille de page** redimensionne toutes les pages à un même format de papier ; **Inverser l’ordre** retourne le document de bout en bout.
- **Extraire des pages** : exportez les pages sélectionnées dans un nouveau PDF.
- **Diviser le PDF** : deux formes — par plages en plusieurs fichiers, ou chaque page découpée en une grille de pages plus petites.
- **Fusionner des PDF** : deux formes — ajouter d’autres PDF, ou réunir plusieurs pages sur une même feuille. Les tailles sont additionnées **avant** toute lecture et **tout total supérieur à 1 Gio est refusé** avec une erreur lisible (cela garde la mémoire bornée).
- Les changements au niveau des pages sont réécrits à l’enregistrement suivant ; Enregistrer sous laisse l’original intact.

## Export et impression

- **Exporter en Word… / PowerPoint… / Excel…** dans le menu Fichier, ou les trois mêmes depuis **Convertir le PDF** dans le ruban — tout est local, sans téléversement. Le .pptx donne une diapositive par page et le .xlsx une feuille de calcul par page. Chacun demande où l’enregistrer.
- **Imprimer** : l’ordre et les rotations courants via la boîte de dialogue du système ; plages de pages prises en charge.

## Enregistrement

- L’enregistrement normal ou automatique réécrit les annotations et les modifications dans le fichier (de façon atomique).
- **Le caviardage passe par sa procédure Appliquer**, qui produit une copie et laisse l’original intact, afin que le contenu sensible ne reste pas dedans.

## Raccourcis de la barre de sélection

Tant que la barre d’annotation est affichée au-dessus d’un texte sélectionné, une seule touche lance une action immédiatement.

| Touche | Action                                       |
| ------ | -------------------------------------------- |
| H      | Surligner (retire le surlignage s’il existe) |
| U      | Souligner                                    |
| S      | Barrer                                       |
| N      | Ajouter une note à la fin de la sélection    |
| E      | Explication IA (fiche de passage)            |
| T      | Traduction IA (fiche de passage)             |
| Entrée | Ouvrir la zone **Demander à l’IA**           |

- Les touches fonctionnent de la même façon avec une méthode de saisie coréenne ou toute autre. Elles sont ignorées pendant la saisie dans un champ ou si Ctrl ou Alt est enfoncé.
- Dans un document verrouillé contre la modification (son mot de passe propriétaire interdit les modifications), H, U, S et N n’ont aucun effet et affichent la raison, comme les boutons de la barre.

## Fiches de passage

Appuyez sur **E** ou **T**, ou sur les puces d’explication et de traduction de la zone **Demander à l’IA** : la réponse s’affiche dans une petite fiche à côté de la sélection. Les fiches sont conservées, elles sont donc encore là quand vous rouvrez le document, et vous pouvez les copier. Redemander le même passage ouvre la fiche existante sans rien envoyer.

- **Garder en note** crée une note à cet endroit. Sa première ligne indique « Explication IA » ou « Traduction IA », et l’auteur est le nom de votre compte sur le PC. Elle entre dans le fichier à l’enregistrement du PDF ; d’ici là, la fiche affiche « En attente d’enregistrement ».
- **Poursuivre dans le panneau IA** transmet le passage et la réponse au panneau IA sans les envoyer ; **Ajouter à la note** les place à la fin de la note de ce PDF.
- Seul **Régénérer** renvoie le passage à l’IA.
- **Supprimer** efface uniquement la fiche conservée. Une note déjà gardée reste en place.
- Un léger trait pointillé signale chaque passage qui a une fiche ; un clic dessus rouvre la fiche. Ce trait n’existe qu’à l’écran, il n’est jamais enregistré ni imprimé. Activez-le ou désactivez-le avec Affichage ▸ **Repères de passage**.

## Vue d’ensemble des annotations

- Affichage ▸ **Annotations** liste dans la barre latérale gauche les surlignages, soulignements, textes barrés, notes et dessins du document, les marques pas encore enregistrées et les fiches de passage. Les marques affichent le texte qu’elles recouvrent.
- Filtrez par type, couleur, plage de pages ou texte, et triez par page ou par ordre de création.
- Cliquer sur un élément y conduit avec un bref clignotement. Une note ouvre son fil dans la marge, une fiche ouvre la fiche.
- Les commandes du menu **Copier en Markdown**, **Ouvrir en document Markdown** et **Ouvrir en document Word** reprennent la liste telle qu’elle est filtrée. L’IA n’intervient pas. Un nouveau document ne peut être créé qu’à partir d’un PDF ouvert dans GenOffice.

## Traduction en regard

- Activez Affichage ▸ **Traduction en regard** : une colonne de traduction apparaît à droite de chaque page et défile avec elle. L’activer n’envoie rien à l’IA. Un document déjà traduit avec **Traduire le document** affiche aussitôt sa traduction ; les paragraphes sans traduction apparaissent en texte source estompé.
- **Traduire cette page** (ou **Traduire le reste** si une partie est faite) envoie la page d’un seul clic quand vous utilisez un abonnement ; le nom de l’IA destinataire figure à côté du bouton. Sur une connexion facturée à l’usage, le premier clic dans un onglet demande d’abord « facturera ce service · Traduire / Annuler ».
- Double-cliquez sur un paragraphe traduit pour le modifier. Les paragraphes modifiés sont conservés en texte brut et repris tels quels dans les fichiers PDF, Markdown et EPUB traduits. **Retraduire** sur un paragraphe n’envoie que celui-ci et demande confirmation si vous l’avez modifié.
- Survoler un paragraphe traduit entoure son emplacement dans la page source. La largeur et la taille du texte de la colonne sont réglables. **Traduire toutes les pages…** ouvre la fenêtre **Traduire le document**, dont le format **Conserver seulement (aucun fichier)** garde la traduction sans écrire de fichier.
- Les paragraphes nouvellement traduits sont reliés phrase par phrase. Survoler une phrase traduite surligne cette phrase sur la page source, et survoler une phrase source met en évidence sa traduction. Là où la phrase est introuvable sur la page, ainsi que pour les paragraphes traduits auparavant ou modifiés par vous, le lien reste par paragraphe.
- La barre au-dessus de la colonne passe de **Traduction** à **Explication simple**. L’explication simple réécrit le texte avec des mots de tous les jours et des phrases courtes, pour les enfants, les personnes âgées ou celles qui apprennent la langue ; les faits, les nombres et les noms restent tels quels. Le choix est mémorisé, et changer n’envoie rien. Tant que l’explication est affichée, les boutons de page et de paragraphe et la modification s’appliquent à elle.
- En explication simple, **Expliquer toutes les pages simplement…** ouvre la fenêtre **Traduire le document** avec le mode **Explication simple**. Une explication est plus longue que l’original et ne peut donc pas devenir un PDF traduit ; elle s’écrit en Markdown ou en EPUB. Avec **Original puis explication**, chaque paragraphe d’origine est suivi de son explication ; désactivé, le fichier ne contient que l’explication. La langue est d’abord celle de l’interface et peut être celle du document.

## Surlignage IA

- Dans Accueil ▸ **Surlignage IA**, choisissez un jeu de catégories (Recherche et rapports, Contrats et conditions, Manuels et guides, ou Personnalisé) et les pages. Rien n’est envoyé avant que vous ayez vérifié le nombre d’appels estimé et l’IA destinataire, puis appuyé sur **Démarrer**.
- Les phrases choisies par l’IA sont prévisualisées par des cadres colorés translucides sur la page. L’aperçu n’est jamais enregistré ; activez-le ou désactivez-le avec Affichage ▸ **Aperçu des surlignages**.
- Dans le panneau **Annotations**, **Accepter** ou **Écarter** les suggestions une par une, ou acceptez toute une catégorie. Une phrase introuvable dans le texte de la page ne peut pas être acceptée.
- Une suggestion acceptée devient un surlignage de la couleur de sa catégorie, et le nom de la catégorie est enregistré comme objet de l’annotation : les autres lecteurs PDF l’affichent dans leur liste de commentaires. Elle entre dans le fichier à l’enregistrement du PDF.
- Le surlignage IA ne peut pas démarrer dans un document verrouillé contre la modification. Les phrases inventées qui ne figurent pas dans le texte sont écartées, et le bilan final indique combien ont été reçues et écartées.

## Aperçu du document et citations de paragraphe

- En haut du panneau IA, **Aperçu du document** ▸ **Créer un aperçu** produit un résumé en trois lignes, un résumé et des termes clés (avec leur sens et leur première page). Un long document est résumé par parties : vous confirmez d’abord le nombre d’appels estimé.
- L’aperçu est conservé et réapparaît à la réouverture ; seul **Régénérer** renvoie. Cliquer sur un terme le recherche dans le document ; chaque section peut être copiée ou ajoutée à la note.
- Quand la conversation est vide, le panneau IA propose trois questions suggérées. Un clic envoie la question une fois.
- Cliquer sur un lien de page (p.N) donné par l’IA comme preuve mène à cette page et met la phrase citée en évidence pendant deux secondes. Si la phrase est introuvable, seule la page s’ouvre.

## Une note par PDF

- La première fois que vous appuyez sur **Ouvrir la note** (onglet Affichage ou panneau **Annotations**), une boîte d’enregistrement s’ouvre, par défaut dans le dossier du PDF avec le nom « nom du PDF note.md ». Ensuite, la note s’ouvre directement dans un onglet Markdown.
- Si vous choisissez un fichier existant, Windows peut demander s’il faut le remplacer, mais le fichier n’est pas écrasé : il est relié comme note tel quel.
- **Ajouter à la note** (sur les fiches, les éléments du panneau et l’aperçu du document) place une citation et un lien de page à la fin de l’onglet de la note, sans l’enregistrer ; c’est vous qui enregistrez dans l’onglet de la note. Le lien ouvre le PDF à cette page dans d’autres programmes, comme un navigateur.
- Un PDF jamais enregistré affiche « Enregistrez d’abord le PDF ». Les notes ne fonctionnent que pour les PDF ouverts dans GenOffice.
