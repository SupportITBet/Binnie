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
select id, sujet, statut, date_programmee
from newsletter_campagnes
where statut = 'programmee' and date_programmee <= now();
```

S'il y en a, décidez de leur sort (les envoyer sciemment, ou passer leur statut à
`brouillon`) **avant** de lancer le serveur, pas après.

---

## 1. Le sous-domaine

**DNS** — dans hPanel, écran *DNS / Serveurs de noms* de `binniesenglish.net` :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `api` | `191.101.80.79` | 300 |

**Le sous-domaine** — l'interface cPanel n'est pas accessible sur ce compte : tout se fait
depuis la console root de hPanel, qui a davantage de pouvoir qu'elle. Correspondances utiles :

| Dans l'interface cPanel | En console root |
|---|---|
| Domains → liste | `uapi --user=betnet DomainInfo list_domains` |
| Domains → Create A New Domain | `uapi --user=betnet SubDomain addsubdomain …` |
| SSL/TLS Status → Run AutoSSL | `/usr/local/cpanel/bin/autossl_check --user=betnet` |
| Gestionnaire de fichiers | le shell, et `scp` depuis le poste |

**Le compte est `betnet`, pas `binniesenglish`.** `api.binniesenglish.net` appartient au
domaine `.net`, donc au compte qui le sert. Viser l'autre compte écrirait un include que
le serveur ignore en silence — et on chercherait la panne du côté de Node.

La création du sous-domaine, donc :

```bash
uapi --user=betnet SubDomain addsubdomain \
     domain=api rootdomain=binniesenglish.net dir=/home/betnet/public_html/api-bet
mkdir -p /home/betnet/public_html/api-bet        # ← ne PAS omettre
chown betnet:betnet /home/betnet/public_html/api-bet
chmod 755 /home/betnet/public_html/api-bet
```

> **Le `mkdir` n'est pas une précaution, c'est une étape.** `uapi` inscrit le chemin dans la
> configuration Apache **sans créer le dossier**. Un vhost dont le `DocumentRoot` n'existe pas
> répond **500 à toutes les requêtes** — et il le fait avant d'ouvrir le journal du domaine,
> donc `logs/api.binniesenglish.net.error.log` reste vide, voire inexistant. Un 500 sans
> aucune trace de log est la signature de ce cas précis : cherchez le dossier, pas le code.

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
DASHBOARD_URL=https://app.binniesenglish.net
BACKEND_URL=https://api.binniesenglish.net
ALLOWED_ORIGINS=https://binniesenglish.net,https://app.binniesenglish.net,https://e-learning.binniesenglish.net
CRON_SECRET=<une longue chaîne aléatoire, la même que dans les crons plus bas>
PORT=5001
```

Puis restreignez-en la lecture :

```bash
chmod 600 /opt/bet/Backend/.env
```

`CRON_SECRET` protège les quatre routes de tâches planifiées : sans lui, n'importe qui
pourrait déclencher la génération des mensualités depuis l'extérieur.

### 3 bis. La clé Firebase — un fichier, pas une variable

Le serveur a besoin d'un accès administrateur à Firestore pour **supprimer un groupe de
discussion** : les messages y vivent sous `chats/libre_{id}/messages`, et une suppression
qui ne les effacerait pas laisserait le fil entier lisible derrière elle.

Contrairement au reste, ce secret est un **fichier** et non une variable : le SDK Firebase
attend `Backend/firebase-key.json` sur le disque. Il est dans `.gitignore` — c'est une clé
privée donnant un accès complet en lecture, écriture et suppression sur toutes vos
collections Firestore.

Depuis votre poste, une fois le fichier obtenu (Firebase Console → ⚙️ Paramètres du projet
→ Comptes de service → « Générer une nouvelle clé privée ») :

```bash
# ── SUR VOTRE MAC ──
# Le `cd` fait partie de la commande : `Backend/firebase-key.json` est un chemin RELATIF au
# dépôt, et depuis votre dossier personnel il ne désigne rien.
cd "/Users/doumbisss/Desktop/dossier sans titre/binnie"
scp Backend/firebase-key.json root@191.101.80.79:/opt/bet/Backend/firebase-key.json
```

```bash
# ── SUR LE VPS ──
chmod 600 /opt/bet/Backend/firebase-key.json
pm2 restart bet-api
pm2 logs bet-api --lines 30 | grep -i firebase
```

La dernière commande doit afficher `✅ Firebase initialisé`. Si elle affiche
`⚠️ Firebase non initialisé`, la suppression d'un groupe répondra **503** avec un message
explicite — c'est délibéré : mieux vaut un groupe encore présent qu'un groupe effacé de
l'écran dont les messages restent accessibles.

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

Node écoute en local ; Apache l'expose. **Pas par un `.htaccess`** : par un *include userdata*
cPanel, qui survit aux régénérations de `httpd.conf` et accepte `ProxyPass` — plus fiable que
`RewriteRule [P]`, qui réécrit l'URL avant de la relayer et abîme les chaînes de requête.

Cet include s'écrit en console : il n'a aucun équivalent dans l'interface cPanel, ce qui tombe
bien puisqu'elle n'est pas accessible ici.

```bash
for MODE in std ssl; do
  [ "$MODE" = ssl ] && PROTO=https || PROTO=http
  D=/etc/apache2/conf.d/userdata/$MODE/2_4/betnet/api.binniesenglish.net
  mkdir -p "$D"
  cat > "$D/proxy.conf" <<EOF
ProxyPreserveHost On
ProxyPass /.well-known/ !
ProxyPass        / http://127.0.0.1:5001/
ProxyPassReverse / http://127.0.0.1:5001/
RequestHeader set X-Forwarded-Proto "$PROTO"
EOF
done

/scripts/ensure_vhost_includes --user=betnet
apachectl configtest && apachectl graceful     # configtest AVANT graceful, toujours
```

Trois détails qui ne sont pas des détails :

- **`ProxyPass /.well-known/ !`** — sans cette exclusion, le défi ACME part vers Node, qui
  répond 404, et **AutoSSL échoue sans dire pourquoi**.
- **`std` et `ssl` séparés, avec le bon `X-Forwarded-Proto`** — c'est ce que lit
  `app.set("trust proxy", 1)` dans `app.js` pour décider si un cookie peut être marqué
  `secure`. Annoncer `https` sur du trafic `http` produit des cookies que le navigateur
  refuse de renvoyer.
- **`configtest` avant `graceful`** — un include mal formé ferait tomber le site principal
  `binniesenglish.net` avec le sous-domaine.

`trust proxy` gouverne aussi la limitation de débit : **à vérifier après coup** — si les
limitations bloquent tout le monde d'un coup, c'est que toutes les requêtes arrivent avec
l'adresse d'Apache.

Puis le certificat :

```bash
/usr/local/cpanel/bin/autossl_check --user=betnet
curl -s https://api.binniesenglish.net/api/equipe-photos/defilement   # attendu : {"duree":50}
```

> **Ne vous laissez pas égarer par la sortie d'AutoSSL.** Elle signale en vrac des dizaines de
> `Local HTTP DCV error` et des `Impediment: NO_UNSECURED_DOMAIN_PASSED_DCV` : ce sont les
> alias que cPanel fabrique d'office (`www.api.`, `webmail.`, `cpanel.`, `autodiscover.`…) et
> qui n'ont aucun DNS. Le seul juge est le `curl` **sans `-k`** : s'il répond, le certificat
> couvre le sous-domaine. Pour en être sûr :
>
> ```bash
> echo | openssl s_client -connect api.binniesenglish.net:443 \
>        -servername api.binniesenglish.net 2>/dev/null \
>   | openssl x509 -noout -subject -ext subjectAltName
> ```

Enfin, le contrôle qui ne se voit qu'au navigateur — CORS, depuis les trois origines :

```bash
for O in https://binniesenglish.net https://app.binniesenglish.net \
         https://e-learning.binniesenglish.net; do
  printf "%-46s " "$O"
  curl -s -X OPTIONS -D - -o /dev/null -H "Origin: $O" \
       -H "Access-Control-Request-Method: POST" \
       https://api.binniesenglish.net/api/touchpoint/initiate \
    | grep -i "access-control-allow-origin" || echo "AUCUN EN-TÊTE CORS"
done
```

Une origine absente de `ALLOWED_ORIGINS` passe parfaitement en `curl` direct et échoue pour
tous les visiteurs : le test en ligne de commande sans `Origin` ne le décèle jamais.

---

## 6. Les trois tâches planifiées

Vercel les déclenchait ; le VPS doit prendre le relais. **Sans elles, aucune mensualité ne
se génère et aucun rappel de séance ne part** — en silence.

```bash
crontab -e
```

```cron
0 5 * * *  /opt/bet/scripts/cron-bet.sh rappels-seances    >> /var/log/bet-cron.log 2>&1
0 6 * * *  /opt/bet/scripts/cron-bet.sh paiements-mensuels >> /var/log/bet-cron.log 2>&1
0 7 * * *  /opt/bet/scripts/cron-bet.sh badges-fidelite    >> /var/log/bet-cron.log 2>&1
```

`scripts/cron-bet.sh` lit `CRON_SECRET` dans `Backend/.env` et appelle `127.0.0.1` : le
secret n'est pas recopié, et une tâche ne peut pas cesser de s'exécuter parce qu'un
certificat a expiré. Son en-tête explique le reste.

> **Trois lignes, pas quatre — `newsletter-programmee` n'en fait pas partie.** Sur un VPS,
> `server.js` lance `demarrerEnvoiCampagnesProgrammees()`, qui fait *exactement* la même
> chose **toutes les 60 secondes**. Ajouter le cron ne servirait à rien et ferait courir un
> risque de double envoi à toute la liste de diffusion.

Vérification immédiate, sans attendre l'heure dite :

```bash
/opt/bet/scripts/cron-bet.sh badges-fidelite    # la plus inoffensive des trois
tail -5 /var/log/bet-cron.log
```

**Tant que Vercel tourne aussi, ces tâches s'exécuteront en double.** Ce n'est pas grave
pour ces trois-là — elles vérifient l'état avant d'agir — mais coupez les crons Vercel dès
que le VPS est en place, pour ne pas envoyer deux fois les mêmes rappels.

---

## ⚠️ `public_html` n'est pas la racine du site BET

Le compte cPanel `binniesenglish` a pour domaine **principal** `binniesenglish.com`, qui
hébergeait un site **WebSuitePro** (base `binniesenglish_websuitepro_db`, 52 tables). Sa
racine est `/home/binniesenglish/public_html`.

Le 26 septembre 2026, `scripts/deployer-frontend.sh` a été lancé sur ce dossier en croyant
viser `binniesenglish.net`. Le `rsync --delete` a effacé les fichiers de WebSuitePro ; la
base a survécu, les fichiers non, et la machine n'avait aucune sauvegarde.

**La règle :** `public_html` appartient toujours au domaine principal. Un domaine ajouté
reçoit son propre dossier, souvent `public_html/<le-domaine>/`. Avant tout déploiement :

```bash
uapi --user=binniesenglish DomainInfo list_domains
```

Le script refuse désormais d'écrire dans un dossier qui abrite visiblement autre chose, et
archive l'existant dans `/root/avant-deploiement-*.tar.gz` avant d'y toucher. Ce garde-fou
ne remplace pas la vérification ci-dessus : il n'attrape que ce qu'il sait reconnaître.

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
