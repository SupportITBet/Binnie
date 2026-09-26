# Déployer l'API BET sur le VPS Hostinger

Serveur `srv616261.hstgr.cloud` · `191.101.80.79` · AlmaLinux 8 · cPanel/WHM
API visée : **`api.binniesenglish.net`**

Vercel reste en service pendant toute cette installation. Les applications continuent de
l'interroger : on ne bascule qu'à la dernière étape, quand le VPS a fait ses preuves.

---

## ⚠️ À lire avant de démarrer le serveur

**Le passage de Vercel au VPS réveille des tâches qui ne tournaient pas.**

Vercel exécute des fonctions sans état : `server.js` n'y vit jamais assez longtemps pour
que ses minuteries se déclenchent. Sur un VPS, le processus reste en vie — et **une dizaine
de tâches démarrent automatiquement**, dont plusieurs envoient des e-mails :

| Tâche | Premier déclenchement | Ce qu'elle fait |
|---|---|---|
| `envoyerCampagnesProgrammees` | **60 secondes** | envoie les campagnes dont la date est passée |
| `relancesFacturesImpayees` | **90 secondes** | relance les impayés |
| `relancesMarketing` | **90 secondes** | relance les suivis marketing |
| `notifierEcheancesPaiement` | **90 secondes** | prévient des échéances |

Une campagne restée « programmée » avec une date dépassée **partira une minute et demie
après le premier démarrage**, à toute sa liste de destinataires. Sur Vercel, elle dormait.

**Avant le premier `pm2 start`, vérifiez donc en base :**

```sql
-- Aucune campagne ne doit être en attente avec une date passée
select id, objet, statut, date_envoi_programme
from newsletter_campagnes
where statut = 'programmee' and date_envoi_programme <= now();
```

S'il y en a, décidez de leur sort (les envoyer sciemment, ou passer leur statut à
`brouillon`) **avant** de lancer le serveur, pas après.

---

## 1. Le sous-domaine

**DNS** — dans hPanel, écran *DNS / Serveurs de noms* de `binniesenglish.net` :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `api` | `191.101.80.79` | 300 |

**cPanel** — *Domains → Create A New Domain* → `api.binniesenglish.net`.
Décochez « Share document root » : ce sous-domaine ne sert aucun fichier, il ne fait que
relayer vers Node.

---

## 2. Le code et les dépendances

```bash
cd /opt/bet
git pull                       # le dépôt est déjà cloné pour le Frontend
cd /opt/bet/Backend
npm install --omit=dev         # les outils de développement sont inutiles en production
```

---

## 3. Les variables d'environnement

Elles ne sont pas dans le dépôt, et c'est voulu : un secret versionné est un secret perdu.
Créez `/opt/bet/Backend/.env` avec **les valeurs que vous avez déjà** dans votre
`.env.vercel` local ou dans l'interface Vercel :

```
SUPABASE_URL=            SUPABASE_SERVICE_KEY=      SUPABASE_ANON_KEY=
CLOUDINARY_CLOUD_NAME=   CLOUDINARY_API_KEY=        CLOUDINARY_API_SECRET=
SMTP_HOST=               SMTP_PORT=                 SMTP_SECURE=
SMTP_USER=               SMTP_PASS=
BREVO_SENDER_EMAIL=      BREVO_SENDER_NAME=
CINETPAY_APIKEY=         CINETPAY_SITE_ID=
FRONTEND_URL=https://binniesenglish.net
DASHBOARD_URL=https://app.binnie.purepro-technologie.ci
BACKEND_URL=https://api.binniesenglish.net
ALLOWED_ORIGINS=https://binniesenglish.net,https://app.binnie.purepro-technologie.ci,https://e-learning.purepro-technologie.ci
CRON_SECRET=<une longue chaîne aléatoire, la même que dans les crons plus bas>
PORT=5001
```

Puis restreignez-en la lecture :

```bash
chmod 600 /opt/bet/Backend/.env
```

`CRON_SECRET` protège les quatre routes de tâches planifiées : sans lui, n'importe qui
pourrait déclencher la génération des mensualités depuis l'extérieur.

---

## 4. Le processus, et sa survie aux redémarrages

```bash
npm install -g pm2
cd /opt/bet/Backend
pm2 start src/server.js --name bet-api
pm2 logs bet-api --lines 40        # doit afficher « BET Backend lancé sur le port 5001 »
pm2 save
pm2 startup systemd -u root --hp /root    # exécutez la commande que PM2 affiche
```

Vérification locale, avant toute exposition :

```bash
curl -s http://127.0.0.1:5001/api/equipe-photos/defilement
# attendu : {"duree":50}
```

---

## 5. Le relais HTTPS

Node écoute en local ; Apache l'expose. Dans cPanel, *Domains → api.binniesenglish.net*,
ou directement dans la configuration Apache du sous-domaine :

```apache
RewriteEngine On
RewriteRule ^(.*)$ http://127.0.0.1:5001/$1 [P,L]
ProxyPreserveHost On
RequestHeader set X-Forwarded-Proto "https"
```

`app.set("trust proxy", 1)` est déjà en place dans `app.js` : c'est ce qui permet au serveur
de connaître la vraie adresse du visiteur derrière Apache, et donc de limiter correctement
les tentatives de connexion. **À vérifier après coup** — si les limitations bloquent tout le
monde d'un coup, c'est que toutes les requêtes arrivent avec l'adresse d'Apache.

Puis le certificat : cPanel → *SSL/TLS Status* → cochez le sous-domaine → *Run AutoSSL*.

```bash
curl -s https://api.binniesenglish.net/api/equipe-photos/defilement
# attendu : {"duree":50}
```

---

## 6. Les quatre tâches planifiées

Vercel les déclenchait ; le VPS doit prendre le relais. **Sans elles, aucune mensualité ne
se génère et aucun rappel de séance ne part** — en silence.

```bash
crontab -e
```

```cron
SECRET=<la même valeur que CRON_SECRET>

0 5 * * *  curl -fsS -H "Authorization: Bearer $SECRET" https://api.binniesenglish.net/api/jobs/rappels-seances      >> /var/log/bet-cron.log 2>&1
0 6 * * *  curl -fsS -H "Authorization: Bearer $SECRET" https://api.binniesenglish.net/api/jobs/paiements-mensuels   >> /var/log/bet-cron.log 2>&1
0 7 * * *  curl -fsS -H "Authorization: Bearer $SECRET" https://api.binniesenglish.net/api/jobs/badges-fidelite      >> /var/log/bet-cron.log 2>&1
0 8 * * *  curl -fsS -H "Authorization: Bearer $SECRET" https://api.binniesenglish.net/api/jobs/newsletter-programmee >> /var/log/bet-cron.log 2>&1
```

Le lendemain, vérifiez que quelque chose s'est passé :

```bash
tail -20 /var/log/bet-cron.log
```

**Tant que Vercel tourne aussi, ces tâches s'exécuteront en double.** Ce n'est pas grave
pour les trois premières — elles vérifient l'état avant d'agir — mais coupez les crons
Vercel dès que le VPS est en place, pour ne pas envoyer deux fois les mêmes rappels.

---

## 7. La bascule, seulement quand tout répond

Trois applications interrogent l'API. Pour chacune, changer `REACT_APP_API_URL`, puis
reconstruire et redéployer :

| Application | Fichier |
|---|---|
| Frontend (site public) | `Frontend/.env.production` (sur le VPS, non versionné) |
| dash (back-office) | `dash/.env.production` |
| bet-elearning | `bet-elearning/.env.production` |

```
REACT_APP_API_URL=https://api.binniesenglish.net
```

**Basculez-les une par une**, en vérifiant après chacune. Si quelque chose casse, remettre
l'ancienne adresse et reconstruire suffit à revenir en arrière — c'est tout l'intérêt
d'avoir gardé Vercel en service.

---

## 8. Ce qu'il reste à surveiller la première semaine

- `pm2 logs bet-api` — les erreurs qui ne se voient pas depuis les écrans ;
- `/var/log/bet-cron.log` — les quatre tâches s'exécutent-elles vraiment ;
- la limitation de débit — personne ne doit être bloqué à tort (cf. `trust proxy`) ;
- les e-mails — leur nombre doit ressembler à celui d'avant la migration, ni plus ni moins.

Quand le VPS a tenu une semaine, supprimez les crons de `vercel.json` et laissez le projet
Vercel en sommeil quelques semaines avant de le supprimer : c'est votre filet.
