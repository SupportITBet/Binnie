# Intégration paiement — TouchPoint (InTouch Group)

Remplace l'ancienne intégration CinetPay (désactivée, code conservé en commentaire — voir section [CinetPay désactivé](#cinetpay-désactivé-où-et-comment)).

## Documentation TouchPoint utilisée

Portail développeur (SPA, non indexable par un simple fetch — accédé via captures d'écran) :
**https://developers.intouchgroup.net/documentation/PAYMENT/4**

Sections consultées dans le menu de gauche "API Documentation" :
- **Direct API** (`PUT`) — intégration bas niveau, envisagée brièvement (2026-08-20) suite aux frictions de test sur Checkout page (validation de domaine, détection de doublon), puis abandonnée : nécessite des identifiants distincts (`loginAgent`/`passwordAgent`) auxquels on n'a pas accès, et une gestion d'OTP côté client (mobile money uniquement, pas de carte). Aucun code n'a été conservé pour cette piste.
- **Checkout page** (`SCRIPT`) — solution retenue, page de paiement hébergée par TouchPoint
- **Callback API** (`GET`) — format générique de notification de paiement
- **Callback TouchPay** (`GET`) — format de notification spécifique au widget Checkout page (celui utilisé ici)

## Architecture

```
┌─────────────┐        1. POST /api/touchpoint/initiate         ┌─────────────┐
│  Frontend   │ ───────────────────────────────────────────────▶│   Backend   │
│ (bouton     │                                                   │             │
│  paiement)  │◀─────────────────────────────────────────────────│  crée ligne │
└─────────────┘   { order_number, agency_code, secure_code,      │ paiements_  │
       │           domain_name, amount, ... }                    │ touchpoint  │
       │                                                          │ statut =    │
       │ 2. charge le script TouchPoint puis appelle              │ en_attente  │
       │    sendPaymentInfos(order_number, agency_code,           └─────────────┘
       │    secure_code, domain_name, url_success, url_failed,
       │    amount, city, email, prenom, nom, tel)
       ▼
┌─────────────────────┐
│  Page TouchPoint     │  3. client choisit son moyen de paiement
│  (hébergée, popup    │     (mobile money / carte) et paie
│  ou redirection)     │
└─────────────────────┘
       │
       │ 4a. redirection navigateur vers url_redirection_success
       │     ou url_redirection_failed (/paiement/retour?order_number=...)
       │
       │ 4b. EN PARALLÈLE, webhook serveur → serveur (asynchrone)
       ▼
┌─────────────────────────────────────────────┐
│ GET /api/touchpoint/callback                 │
│  ?payment_mode=...&paid_sum=...&paid_amount=...
│  &payment_token=...&payment_status=200|420    │
│  &command_number=...&payment_validation_date=...
│                                               │
│  → met à jour paiements_touchpoint.statut     │
│  → si succès (payment_status=200) :           │
│      - insert paiements_parcours              │
│      - update assignations_parcours (tranche) │
│      - notification au commercial responsable │
└───────────────────────────────────────────────┘
       ▲
       │ 5. PaiementRetour.jsx (frontend) poll
       │    POST /api/touchpoint/verify { order_number }
       │    pour afficher le statut final au client
```

## Backend

| Route | Méthode | Fichier | Rôle |
|---|---|---|---|
| `/api/touchpoint/initiate` | POST | `Backend/src/routes/touchpoint.js` | Crée la ligne `paiements_touchpoint` (statut `en_attente`), retourne les params pour `sendPaymentInfos()` |
| `/api/touchpoint/callback` | GET | idem | Webhook public TouchPoint ("Callback TouchPay") — met à jour le statut, débloque le parcours si succès |
| `/api/touchpoint/verify` | POST | idem | Polling frontend, body `{ order_number }` |
| `/api/touchpoint/admin/all` | GET | idem | Liste tous les paiements reçus (dashboard admin) — `authenticateAdmin` |
| `/api/touchpoint/admin/:id/traiter` | PATCH | idem | Marque un paiement comme traité par une assistante — `authenticateAdmin` |

Montée dans `Backend/src/app.js` (`app.use("/api/touchpoint", touchpointRouter)`).

### Variables d'environnement (`Backend/.env`)

```
TOUCHPOINT_AGENCY_CODE=    # Account ID fourni par InTouch (BO Partenaire > Compte(s) > Compte, ou ticket support)
TOUCHPOINT_SECURE_CODE=    # Paramètre fourni par InTouch — conçu pour être exposé côté client (pas un secret serveur)
TOUCHPOINT_DOMAIN_NAME=    # Domaine du site (ex: binniesenglish.com)
```

Tant que ces variables sont vides, `POST /initiate` répond `503 "TouchPoint non configuré"`.

### Script client (chargé dynamiquement par le frontend)

```
https://touchpay.gutouch.net/touchpayv2/script/touchpaynr/prod_touchpay-0.0.1.js
```
⚠️ **Divergence doc vs réalité** : le portail développeur (developers.intouchgroup.net) documente `https://touchpay.gutouch.com/touchpay/script2/prod_touchpay-0.0.2.js` — mais ce n'est **pas** l'URL réelle pour notre compte. Le support TouchPoint (Hilaire, WhatsApp, 2026-08-20) a fourni un fichier de test officiel (`BETSA9323.html`, dans `Frontend/`) qui utilise l'URL ci-dessus (`.net`, chemin différent, version `0.0.1`). C'est cette URL confirmée par le support qu'il faut utiliser, pas celle du portail. À re-questionner si un jour un changement de comportement inexpliqué survient à nouveau.

Fonction appelée après chargement :
```js
sendPaymentInfos(order_number, agency_code, secure_code, domain_name,
                  url_redirection_success, url_redirection_failed,
                  amount, city, email, clientFirstName, clientLastName, clientPhone)
```

⚠️ **Piège de casse** : la documentation officielle TouchPoint (developers.intouchgroup.net) écrit `SendPaymentInfos` (S majuscule), mais le script réel expose `window.sendPaymentInfos` (s minuscule) — vérifié en désobfusquant `prod_touchpay-0.0.2.js` (`grep -o "SendPaymentInfos" script.js` → 0 résultat ; `grep -oi` → 1 résultat, casse réelle `sendPaymentInfos`). Utiliser la mauvaise casse fait échouer silencieusement l'appel (`window.SendPaymentInfos` reste `undefined`), sans lien avec le piège anti-debug du script (celui-ci déclenche `debugger;` en boucle si les DevTools sont ouverts — désactiver les breakpoints ou fermer les DevTools pour tester sereinement, mais ce n'était pas la cause du bug ici).

## Base de données

Table `paiements_touchpoint` (miroir de l'ancienne `paiements_cinetpay`) — schéma dans `Backend/sql/touchpoint_migration.sql`, **à exécuter manuellement dans Supabase SQL Editor** (pas d'exécution automatique possible depuis cet environnement).

Colonnes clés : `order_number` (unique), `payment_token`, `payment_mode`, `statut` (`en_attente|validé|échoué|annulé`), infos client/offre, `montant`, `traitee`/`assistante_id` (workflow assistante).

## Frontend

| Fichier | Rôle |
|---|---|
| `Frontend/src/Pages/Paiement/TouchPointButton.jsx` | Bouton "Payer avec TouchPoint" réutilisable — appelle `/initiate`, charge le script, déclenche `sendPaymentInfos()` |
| `Frontend/src/Pages/Paiement/PaiementRetour.jsx` | Page `/paiement/retour` — détecte `?order_number=` (TouchPoint) vs `?transaction_id=` (ancien CinetPay), affiche le statut final |
| `Frontend/src/utils/touchpoint.js` | Helper partagé `payerAvecTouchPoint()` / `parsePrixFCFA()`, utilisé directement dans les 3 modales de parcours (sans passer par le composant bouton ci-dessus) |

**Paiement immédiat branché** dans les 3 modales de parcours publiques — déclenché automatiquement à la soumission si le client choisit Mobile Money/Carte bancaire **et** qu'un montant chiffré est déterminable (sinon, offre "Sur devis" → comportement historique inchangé, demande envoyée sans charge) :

| Fichier | Fonction | Étape succès | Montant utilisé |
|---|---|---|---|
| `ParcoursModal.jsx` | `submitAssignation` | 4 | `parsePrixFCFA(offreChoisie?.prix)` |
| `ParcoursModal.jsx` | `submitDomicile` | 4 | `prixChoisi` (déjà numérique) |
| `EnfantParcoursModal.jsx` | `handleSubmit` | 5 | `prixOffreNum` (payeur = parent) |
| `CentresEnLigneModal.jsx` | `submitInscription` | 3 | `parsePrixFCFA(offreChoisie?.prix)` |
| `Courses/CourseDetail.jsx` | `handlePay` | — (redirection) | `parsePrixFCFA(selectedFormat?.price \|\| course.price)` |
| `Components/CertificationDetail/CertificationDetail.jsx` | `handlePay` | — (redirection) | `parsePrixFCFA(cert.price)` |

Dans ces deux dernières pages, l'ancien formulaire affichait des **faux champs de carte bancaire** (titulaire/numéro/expiration/CVV, jamais lus ni envoyés nulle part) — supprimés, remplacés par un message annonçant la redirection sécurisée vers TouchPoint. Le sous-choix d'opérateur mobile money (Orange/MTN/Wave/Moov) a aussi été retiré de ces 5 fichiers au total (les 3 modales + ces 2 pages) : TouchPoint le redemande de toute façon sur sa propre page hébergée, ce choix n'était jamais transmis à l'API.

`TouchPointButton.jsx` (composant) reste lui non branché nulle part — toutes ces pages appellent directement `payerAvecTouchPoint()` du helper, pas ce composant.

## CinetPay désactivé — où et comment

Le passage à TouchPoint a entraîné la désactivation complète de CinetPay (décision du 2026-08-19 : couper aussi le flux espace apprenant, actif en prod jusque-là, plutôt que de faire cohabiter les deux intégrateurs). Rien n'a été supprimé — tout est conservé en commentaire (bloc `/* ── Ancienne implémentation CinetPay ── */`) pour référence :

| Fichier | Ce qui a été désactivé |
|---|---|
| `Backend/src/app.js` | Import + montage du router `cinetpay.js` commentés |
| `Backend/src/routes/apprenants.js` | `POST /initier-paiement` renvoie désormais `503`, ancien code CinetPay REST conservé en commentaire |
| `dash/src/Pages/EspaceApprenant/EspaceApprenant.jsx` | `handlePayerTranche` reconstruit sur TouchPoint (voir plus bas) — plus un simple stub |
| `dash/src/Pages/SuperAdminDashboard/SuperAdminDashboard.jsx` | Panneau admin "CinetPay en ligne" désactivé |
| `dash/src/Pages/AdminDashboard/AdminDashboard.jsx` | Idem |
| `Frontend/src/Pages/Paiement/CinetPayButton.jsx` | Marqué déprécié (n'était déjà branché nulle part) |
| `Backend/src/middlewares/autoAudit.js`, `plateformeParModule.js` | Labels conservés pour les anciens logs d'audit + entrée `touchpoint` ajoutée |

**Flux espace apprenant reconstruit sur TouchPoint** : `POST /api/apprenants/initier-paiement` (authentifié apprenant) réutilise la même logique que `/api/touchpoint/initiate` mais rattache le paiement à une `assignation_id`/`tranche_id` via le champ `message` (metadata JSON, même mécanisme que côté public) ; le callback générique `/api/touchpoint/callback` traite ces paiements automatiquement (débloque la tranche + notifie le commercial). `EspaceApprenant.jsx` charge le script et appelle `sendPaymentInfos()` côté client, exactement comme les modales publiques.

## Ce qu'il reste à faire

1. Récupérer `TOUCHPOINT_AGENCY_CODE` / `TOUCHPOINT_SECURE_CODE` / `TOUCHPOINT_DOMAIN_NAME` (ticket support déjà envoyé à TouchPoint) et les renseigner dans `Backend/.env` (+ config Vercel en prod)
2. ~~Exécuter `Backend/sql/touchpoint_migration.sql` dans Supabase~~ — fait (2026-08-19)
3. Confirmer auprès de TouchPoint l'URL à déclarer comme callback (`https://backend-binnie.vercel.app/api/touchpoint/callback` en prod) — probablement à renseigner dans le BO Partenaire, menu "Notifications" ou "Callback"
4. ~~Brancher le paiement dans les modales de parcours publiques~~ — fait, voir tableau ci-dessus
5. ~~Reconstruire le flux de paiement espace apprenant sur TouchPoint~~ — fait, voir ci-dessus
6. Tester un paiement de bout en bout en sandbox dès que les identifiants marchand sont disponibles (rien n'est testable tant que `TOUCHPOINT_AGENCY_CODE`/`SECURE_CODE`/`DOMAIN_NAME` sont vides — toutes les routes `/initiate` répondent `503`)
