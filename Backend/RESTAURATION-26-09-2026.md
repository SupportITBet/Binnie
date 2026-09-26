# Restaurer `binniesenglish.com` — procédure du 26 septembre 2026

**Ce document est sur GitHub à dessein.** La restauration efface `/opt/bet` : après elle,
la seule copie lisible de cette procédure sera celle du dépôt. On la récupère par
`git clone`, à l'étape 4.

---

## Ce qui s'est passé

Le 26 septembre 2026 à 14 h 58, `scripts/deployer-frontend.sh` a été lancé sur
`/home/binniesenglish/public_html` en croyant viser `binniesenglish.net`. Ce dossier était
la racine du domaine **principal** du compte cPanel — `binniesenglish.com` — qui servait un
site **WebSuitePro**. Le `rsync --delete` a effacé ses fichiers.

Constaté dans les journaux : WebSuitePro servi jusqu'à **14 h 48 : 58**, site BET servi à
partir de **15 h 00**. Les fichiers ne sont nulle part sur la machine, et elle n'a aucune
sauvegarde locale (`/backup` vide, pas de JetBackup, `.trash` vide).

**Ce qui a survécu :** la base `binniesenglish_websuitepro_db` (52 tables) — un `rsync` ne
touche pas MySQL. Le contenu du site (pages, blogs, produits) est donc intact.

**Ce qui n'est pas concerné du tout :** les données de la plateforme BET. Elles sont sur
Supabase, hors de ce serveur.

---

## Le plan

Restaurer la sauvegarde Hostinger du **20 septembre 2026, 05:15** (17,37 Go), qui précède
l'incident — puis refaire à la main le travail du 26 septembre, qu'elle emportera.

Compter **34 minutes** de restauration, et environ **une heure** de reconstruction.

`dash` et `bet-elearning` interrogent encore Vercel : les équipes continuent de travailler
pendant toute l'opération. Seul le site public est indisponible. **Ne pas basculer ces deux
applications avant la fin de cette procédure.**

---

## Étape 0 — Pouvoir copier des fichiers depuis le VPS

Le terminal du navigateur hPanel donne un accès root, mais `scp` demande une
authentification. Sans mot de passe root, autoriser la clé publique du poste — **sur le VPS,
dans le terminal navigateur** :

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys <<'CLE'
<coller ici le contenu de ~/.ssh/id_rsa.pub du poste, sur une seule ligne>
CLE
chmod 600 /root/.ssh/authorized_keys
```

> **La restauration efface `/root`, donc cette clé.** Il faudra la recoller après l'étape 3
> pour pouvoir remonter le `.env` à l'étape 4.

Repli si le terminal web coupe les lignes longues : copier les fichiers sous le dossier
personnel du compte cPanel et les télécharger par le *Gestionnaire de fichiers*.

```bash
mkdir -p /home/binniesenglish/transfert-26-09
cp /root/websuitepro-db-*.sql.gz         /home/binniesenglish/transfert-26-09/
cp /root/sauvegarde-public_html-*.tar.gz /home/binniesenglish/transfert-26-09/
cp /opt/bet/Backend/.env                 /home/binniesenglish/transfert-26-09/backend-env-vps.txt
tar czf /home/binniesenglish/transfert-26-09/apache-userdata.tar.gz -C /etc/apache2/conf.d userdata
chown -R binniesenglish:binniesenglish /home/binniesenglish/transfert-26-09
chmod 700 /home/binniesenglish/transfert-26-09
```

**En dehors de `public_html`, impérativement** : placé dedans, le `.env` serait téléchargeable
par n'importe qui. Supprimer le dossier après téléchargement.

---

## Étape 1 — Sortir de la machine ce qui n'y survivra pas

À exécuter **depuis votre poste**, pas depuis le VPS.

```bash
cd ~/Desktop && mkdir -p sauvegardes-vps-26-09 && cd sauvegardes-vps-26-09

scp root@191.101.80.79:/root/websuitepro-db-*.sql.gz        .
scp root@191.101.80.79:/root/sauvegarde-public_html-*.tar.gz .
scp root@191.101.80.79:/opt/bet/Backend/.env                 ./backend-env-vps
scp -r root@191.101.80.79:/etc/apache2/conf.d/userdata       ./apache-userdata

ls -lh
```

Le `.env` porte les 21 variables du Backend, dont des secrets qui n'existent nulle part
ailleurs. **Sans lui, tout est à regénérer** (Supabase, Brevo, Cloudinary, TouchPoint).

### La messagerie

```bash
# Sur le VPS : des courriels reçus depuis la sauvegarde ?
ls /home/binniesenglish/mail/
find /home/binniesenglish/mail -type f -newermt "2026-09-20 05:15" 2>/dev/null | wc -l
```

Si le compte est **supérieur à zéro**, sauvegardez le courrier avant de restaurer :

```bash
tar czf /root/mail-26-09.tar.gz -C /home/binniesenglish mail
# puis, depuis votre poste :
scp root@191.101.80.79:/root/mail-26-09.tar.gz ~/Desktop/sauvegardes-vps-26-09/
```

Il sera réinjecté à l'étape 7.

---

## Étape 2 — Vérifier avant de cliquer

```bash
ls -lh ~/Desktop/sauvegardes-vps-26-09/
zcat ~/Desktop/sauvegardes-vps-26-09/websuitepro-db-*.sql.gz | grep -c "CREATE TABLE"
grep -c "=" ~/Desktop/sauvegardes-vps-26-09/backend-env-vps
```

Attendu : **52** tables, et **21** lignes de variables. Si l'un des deux ne tombe pas juste,
ne restaurez pas — dites-le-moi d'abord.

---

## Étape 3 — Restaurer

hPanel → *VPS* → *Sauvegardes* → point du **2026-09-20 05:15** → *Restaurer*.

Pendant 34 minutes, la machine est indisponible : ni site public, ni API. Les tableaux de
bord continuent (Vercel).

---

## Étape 4 — Remettre le Backend

```bash
mkdir -p /opt/bet && cd /opt
git clone https://github.com/SupportITBet/Binnie.git bet
cd /opt/bet/Backend
npm install --omit=dev
```

Puis reposer le `.env` rapatrié à l'étape 1 :

```bash
# depuis votre poste
scp ~/Desktop/sauvegardes-vps-26-09/backend-env-vps root@191.101.80.79:/opt/bet/Backend/.env
# sur le VPS
chmod 600 /opt/bet/Backend/.env
```

> **Avant `pm2 start`, relire l'avertissement en tête de `DEPLOIEMENT-VPS.md`** : le démarrage
> réveille des tâches qui envoient des courriels, dont les campagnes programmées dont la date
> est passée. La requête de contrôle y figure.

```bash
npm install -g pm2
cd /opt/bet/Backend && pm2 start src/server.js --name bet-api
pm2 save && pm2 startup systemd -u root --hp /root   # exécuter la commande affichée
curl -s http://127.0.0.1:5001/api/equipe-photos/defilement    # attendu : {"duree":50}
```

---

## Étape 5 — Refaire `api.binniesenglish.net`

La section 1 puis la section 5 de `DEPLOIEMENT-VPS.md`, sans en sauter une ligne :
sous-domaine **avec création du dossier racine à la main**, include userdata pour le relais,
puis AutoSSL. L'enregistrement DNS `api → 191.101.80.79`, lui, est chez le registraire :
il n'a pas été touché par la restauration.

Puis les trois crons de la section 6.

---

## Étape 6 — Redéployer le Frontend, dans le BON dossier

**C'est l'étape qui a causé l'incident. Elle commence par une vérification, pas par un
déploiement.**

```bash
uapi --user=binniesenglish DomainInfo list_domains
```

La sortie nomme le domaine principal (`binniesenglish.com` → `public_html`) et les domaines
ajoutés avec leur racine. `binniesenglish.net` a été créé après le 20 septembre : il n'existe
probablement plus après restauration. Le recréer avec **sa propre racine**, jamais partagée :

> **L'interface cPanel n'est pas accessible sur ce compte.** Tout se fait depuis la console
> root de hPanel — qui peut davantage. Ne cherchez donc pas les écrans « Domains » ou
> « SSL/TLS Status » : leurs équivalents en commandes figurent dans `DEPLOIEMENT-VPS.md`, §1.

**Ne créez rien avant d'avoir lu la sortie de `list_domains`.** Trois cas possibles, et ils
n'appellent pas la même commande :

| Ce que dit `list_domains` | Ce qu'il faut faire |
|---|---|
| `binniesenglish.net` absent | le créer, avec sa racine propre |
| présent dans `addon_domains` avec une racine à lui | rien à créer — déployer dedans |
| présent dans `parked_domains` *(alias)* | **le cas dangereux** : un alias partage la racine du principal. Il faut le retirer des alias et le recréer en domaine ajouté, sinon le déploiement retombe dans `public_html` |

Envoyez-moi cette sortie plutôt que de deviner : le troisième cas est celui qui a causé
l'incident, et la commande pour en sortir dépend de la version de cPanel installée.

Pour mémoire, la création d'un sous-domaine — celle qui a fonctionné pour `api` :

```bash
uapi --user=binniesenglish SubDomain addsubdomain \
     domain=bet rootdomain=binniesenglish.net dir=/home/binniesenglish/bet-site
mkdir -p /home/binniesenglish/bet-site
chown binniesenglish:binniesenglish /home/binniesenglish/bet-site
chmod 755 /home/binniesenglish/bet-site
```

Puis les repères qui rendront la confusion impossible — voir `deploiement/LISEZ-MOI.md` :

```bash
cp /opt/bet/deploiement/binniesenglish.com/0-RACINE-*.txt /home/binniesenglish/public_html/
# et, dans la racine du .net : index.html, 0-RACINE-*.txt, .deploiement-bet
```

Puis, et seulement alors :

```bash
cd /opt/bet/Frontend
# recréer .env.production (non versionné) avec les 11 variables REACT_APP_*
/opt/bet/scripts/deployer-frontend.sh /home/binniesenglish/<la-racine-du-.net>
```

Le script refuse désormais d'écrire dans un dossier qui abrite visiblement autre chose, et
archive l'existant avant d'y toucher. **Ce garde-fou ne dispense pas du `list_domains`
ci-dessus** : il n'attrape que ce qu'il sait reconnaître.

---

## Étape 7 — Rattraper les six jours perdus

```bash
# Le contenu WebSuitePro modifié entre le 20 et le 26 septembre
scp ~/Desktop/sauvegardes-vps-26-09/websuitepro-db-*.sql.gz root@191.101.80.79:/root/
zcat /root/websuitepro-db-2026-09-26.sql.gz | mysql binniesenglish_websuitepro_db

# Le courrier, si l'étape 1 en avait trouvé
tar xzf /root/mail-26-09.tar.gz -C /home/binniesenglish
chown -R binniesenglish:binniesenglish /home/binniesenglish/mail
```

---

## Étape 8 — Contrôler

```bash
curl -s https://binniesenglish.com/ | grep -o "<title>[^<]*"        # le site WebSuitePro
curl -s https://binniesenglish.net/ | grep -o "<title>[^<]*"        # le site BET
curl -s https://api.binniesenglish.net/api/equipe-photos/defilement # {"duree":50}
mysql -e "SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema='binniesenglish_websuitepro_db';"      # 52
/opt/bet/scripts/cron-bet.sh badges-fidelite && tail -3 /var/log/bet-cron.log
```

Et depuis un navigateur, sur le site public : une inscription, un test de niveau. C'est le
seul contrôle qui valide la chaîne entière, CORS compris.

---

## Ce qui reste ouvert après cette procédure

- **CORS** : `www.binniesenglish.net`, `binniesenglish.com` et `www.binniesenglish.com`
  atteignent le site mais sont refusés par l'API. À traiter selon le rôle qu'on donne au
  `.com` — une fois qu'il sera redevenu lui-même.
- **Le bruit des rejets CORS** dans les journaux : une exception avec dix lignes de pile là
  où une ligne suffirait (`app.js`, vers la ligne 122).
- **Rotation des secrets** exposés en clair en terminal le 26 septembre :
  `SUPABASE_SERVICE_KEY`, `SMTP_PASS`, `CLOUDINARY_API_SECRET`.
- **La bascule** de `dash` et `bet-elearning` vers l'API du VPS, et la déclaration du
  domaine à TouchPoint.
