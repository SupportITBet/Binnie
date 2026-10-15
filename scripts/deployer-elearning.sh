#!/usr/bin/env bash
#
# Déploie la plateforme BET E-Learning sur le VPS — e-learning.binniesenglish.net.
#
#   git -C /opt/bet pull --ff-only          ← D'ABORD, séparément. Voir plus bas.
#   /opt/bet/scripts/deployer-elearning.sh /home/betnet/public_html/elearning-bet
#
# Même raison d'être que deployer-dash.sh : refuser de publier une application cassée
# par-dessus une qui marche. On construit, on vérifie, et on ne touche au dossier en
# ligne qu'une fois certain du résultat.
#
# LE DOMAINE PORTE UN TIRET : « e-learning.binniesenglish.net ». Le code a longtemps cité
# « elearning.binniesenglish.net », sans tiret — un nom qui n'a JAMAIS eu d'enregistrement
# DNS (vérifié le 15/10/2026 : `dig +short elearning.binniesenglish.net` ne renvoie rien,
# là où la forme avec tiret résout bien vers 191.101.80.79). Les liens construits à partir
# de l'ancienne forme ne menaient donc nulle part.
#
# POURQUOI CE SCRIPT NE FAIT PAS `git pull` LUI-MÊME. bash lit un script au fur et à
# mesure de son exécution, sans le charger entièrement en mémoire. Un `git pull` placé
# à l'intérieur réécrit le fichier que bash est en train de lire : la suite est
# interprétée à un décalage d'octets qui ne correspond plus à rien. C'est arrivé le
# 28/09/2026. Le script se contente de VÉRIFIER que le code est à jour, et refuse sinon.
#
set -euo pipefail

CIBLE="${1:-}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELEARN="$RACINE/bet-elearning"

rouge()  { printf "\033[31m%s\033[0m\n" "$*"; }
vert()   { printf "\033[32m%s\033[0m\n" "$*"; }
etape()  { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }

if [ -z "$CIBLE" ]; then
  rouge "Usage : $0 /home/betnet/public_html/elearning-bet"
  echo   "        (la racine du vhost e-learning.binniesenglish.net)"
  echo
  echo   "  Pour savoir quel dossier sert ce sous-domaine :"
  echo   "      uapi --user=betnet DomainInfo list_domains"
  exit 1
fi
if [ ! -d "$CIBLE" ]; then
  rouge "✗ Le dossier cible n'existe pas : $CIBLE"
  echo   "  Créez d'abord le sous-domaine dans cPanel : il crée sa racine sous public_html."
  exit 1
fi

# ── 0. À QUI EST CE DOSSIER ? ────────────────────────────────────────────────
# Le 26/09/2026, un rsync --delete lancé sur la mauvaise racine a effacé le site d'un
# autre domaine. Le contrôle ci-dessous reconnaît ce qu'une publication e-learning BET
# laisse derrière elle, et s'arrête devant tout le reste.
MARQUEUR="$CIBLE/.deploiement-bet-elearning"
etape "Identification du dossier cible"
if [ -f "$MARQUEUR" ]; then
  echo "  racine déclarée de BET E-Learning — « $(head -1 "$MARQUEUR" 2>/dev/null) »"
elif [ -f "$CIBLE/asset-manifest.json" ] && [ -d "$CIBLE/static" ]; then
  echo "  build React reconnu (asset-manifest.json + static/)"
else
  # `php.ini` et `.user.ini` sont posés par cPanel À LA CRÉATION du sous-domaine, avec
  # `cgi-bin` et `.htaccess`. Un dossier qui ne contient qu'eux est donc un dossier NEUF,
  # pas le site d'autrui : les compter comme étrangers faisait refuser la toute première
  # publication, celle que ce contrôle est précisément censé autoriser (15/10/2026).
  ETRANGERS=$(find "$CIBLE" -mindepth 1 -maxdepth 1 \
                ! -name '.well-known' ! -name 'cgi-bin' ! -name '.htaccess' \
                ! -name 'php.ini' ! -name '.user.ini' \
                ! -name '0-RACINE-*' 2>/dev/null | head -20)
  if [ -n "$ETRANGERS" ]; then
    rouge "✗ REFUS : ce dossier contient autre chose qu'une publication BET E-Learning."
    echo
    echo "  $CIBLE"
    printf '    %s\n' $(echo "$ETRANGERS" | xargs -n1 basename 2>/dev/null)
    echo
    echo "  L'étape 6 supprime tout ce qui ne figure pas dans le build."
    echo "  Pour savoir quel dossier sert quel domaine :"
    echo "      uapi --user=betnet DomainInfo list_domains"
    echo
    echo "  Si vous voulez réellement remplacer ce contenu, en connaissance de cause :"
    echo "      touch $MARQUEUR"
    exit 1
  fi
  echo "  dossier vide — première publication"
fi

# ── 0 bis. Une copie de l'existant, avant d'y toucher ────────────────────────
if [ -n "$(ls -A "$CIBLE" 2>/dev/null)" ]; then
  ARCHIVE="/root/avant-deploiement-elearning-$(date +%F-%H%M%S).tar.gz"
  if tar czf "$ARCHIVE" -C "$(dirname "$CIBLE")" "$(basename "$CIBLE")" 2>/dev/null; then
    echo "  copie de sûreté : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
  else
    rouge "  ⚠ copie de sûreté impossible — poursuite sans filet"
  fi
fi

# ── 1. Le code est-il à jour ? ───────────────────────────────────────────────
etape "Vérification du code"
cd "$RACINE"
git fetch --quiet origin
LOCAL=$(git rev-parse HEAD)
DISTANT=$(git rev-parse '@{u}' 2>/dev/null || echo "$LOCAL")
if [ "$LOCAL" != "$DISTANT" ]; then
  rouge "✗ Le code local n'est pas celui d'origine."
  echo   "  local   : $(git log -1 --format='%h %s' "$LOCAL")"
  echo   "  distant : $(git log -1 --format='%h %s' "$DISTANT")"
  echo
  echo   "  Mettez à jour AVANT de relancer ce script, jamais pendant :"
  echo   "      git -C $RACINE pull --ff-only && $0 $CIBLE"
  exit 1
fi
echo "  commit : $(git log -1 --format='%h %s')"

# ── 2. La configuration ──────────────────────────────────────────────────────
etape "Vérification de la configuration"
if [ ! -f "$ELEARN/.env.production" ]; then
  rouge "✗ $ELEARN/.env.production est absent."
  echo   "  Ce fichier n'est pas dans le dépôt (il ne doit pas l'être) : créez-le sur ce"
  echo   "  serveur, une fois pour toutes. Sans lui, l'application appellerait localhost."
  exit 1
fi

# `.env.local` PRIME sur `.env.production`, y compris pour un build de production : c'est
# la règle de priorité de react-scripts, et elle surprend tout le monde. Un `.env.local`
# oublié ici imposerait silencieusement ses valeurs à la place de celles qu'on vérifie
# juste en dessous — les contrôles liraient un fichier, la construction un autre.
for PARASITE in "$ELEARN/.env.local" "$ELEARN/.env.production.local"; do
  if [ -f "$PARASITE" ]; then
    rouge "✗ $PARASITE existe."
    echo   "  react-scripts lui donne la PRIORITÉ sur .env.production : ses valeurs"
    echo   "  remplaceraient celles que ce script vient de contrôler, sans rien signaler."
    echo   "  Écartez-le avant de publier :"
    echo   "      mv $PARASITE $PARASITE.hors-service"
    exit 1
  fi
done

# ATTENTION AU PIÈGE DE `.env`. En développement, `bet-elearning/.env` porte Supabase et
# Firebase, et `.env.production` ne portait QUE les trois adresses. react-scripts lit les
# deux et complète l'un par l'autre : sur un poste de développement le build est donc
# complet, et on croit `.env.production` suffisant. Sur ce serveur, `.env` n'existe pas —
# il n'est pas versionné — et les clés manquantes produisent une PAGE BLANCHE. C'est
# exactement ce qui est arrivé au dash le 04/10/2026. D'où les contrôles ci-dessous, qui
# lisent `.env.production` SEUL, puis vérifient le bundle réellement produit.
lire_env() { grep -E "^$1=" "$ELEARN/.env.production" | head -1 | cut -d= -f2- | tr -d '[:space:]'; }

API=$(lire_env REACT_APP_API_URL)
if [ -z "$API" ]; then
  rouge "✗ REACT_APP_API_URL n'est pas renseignée dans .env.production"; exit 1
fi
case "$API" in
  *localhost*|*127.0.0.1*)
    rouge "✗ REACT_APP_API_URL vaut « $API »."
    echo   "  Chaque utilisateur chercherait l'API sur sa propre machine : aucune"
    echo   "  connexion, aucun cours, aucune séance."
    exit 1 ;;
esac
echo "  API visée : $API"

# L'ADRESSE PUBLIQUE DE LA PLATEFORME, celle que l'application met dans ses propres liens.
# Le tiret n'est pas cosmétique : « elearning.binniesenglish.net » n'a aucun DNS, donc tout
# lien bâti dessus mène à une erreur de résolution chez le destinataire.
ELEARNING_URL=$(lire_env REACT_APP_ELEARNING_URL)
case "$ELEARNING_URL" in
  https://e-learning.binniesenglish.net) echo "  adresse publique : $ELEARNING_URL ✓" ;;
  "")
    rouge "✗ REACT_APP_ELEARNING_URL n'est pas renseignée dans .env.production"; exit 1 ;;
  https://elearning.binniesenglish.net*)
    rouge "✗ REACT_APP_ELEARNING_URL vaut « $ELEARNING_URL » — SANS TIRET."
    echo   "  Ce nom n'a aucun enregistrement DNS : les liens produits par l'application"
    echo   "  ne mèneraient nulle part. Attendu : https://e-learning.binniesenglish.net"
    exit 1 ;;
  *)
    rouge "✗ REACT_APP_ELEARNING_URL vaut « $ELEARNING_URL »."
    echo   "  Attendu : https://e-learning.binniesenglish.net"
    exit 1 ;;
esac

# FIREBASE. bet-elearning a SON PROPRE projet — `bet2026-7dfb1` — et ce n'est pas une
# erreur de configuration : ses collections (`chats_elearning`, `presence_elearning`) sont
# distinctes de celles de dash (`chats`, `presence`), et le backend ne lit ni n'écrit les
# premières. La messagerie e-learning est donc close sur elle-même, par construction. On
# vérifie seulement que la valeur est présente et que c'est bien ce projet-là : la publier
# avec celui de dash enverrait les conversations dans une base que personne ne lit, SANS
# message d'erreur — c'est ce qui était arrivé au Frontend le 27/09/2026, dans l'autre sens.
FIREBASE_ATTENDU="bet2026-7dfb1"
FIREBASE=$(lire_env REACT_APP_FIREBASE_PROJECT_ID)
if [ "$FIREBASE" != "$FIREBASE_ATTENDU" ]; then
  rouge "✗ REACT_APP_FIREBASE_PROJECT_ID vaut « ${FIREBASE:-(vide)} »."
  echo   "  Le projet attendu pour bet-elearning est « $FIREBASE_ATTENDU »."
  echo   "  Sans lui, messagerie et présence ne fonctionnent pas — en silence."
  exit 1
fi
echo "  projet Firebase : $FIREBASE ✓"

# SUPABASE, SANS QUOI L'APPLICATION NE S'AFFICHE PAS DU TOUT. `createClient` lève
# « supabaseUrl is required » au CHARGEMENT du module, avant le premier rendu : ni écran
# de connexion, ni message, ni erreur serveur — une page blanche.
for VAR in REACT_APP_SUPABASE_URL REACT_APP_SUPABASE_ANON_KEY; do
  if [ -z "$(lire_env "$VAR")" ]; then
    rouge "✗ $VAR n'est pas renseignée dans .env.production"
    echo   "  Sans elle, la plateforme s'ouvre sur une PAGE BLANCHE."
    exit 1
  fi
done
SUPA_URL=$(lire_env REACT_APP_SUPABASE_URL)
case "$SUPA_URL" in
  https://*.supabase.co) : ;;
  *)
    rouge "✗ REACT_APP_SUPABASE_URL vaut « $SUPA_URL »."
    echo   "  Une URL de projet Supabase ressemble à https://<projet>.supabase.co."
    exit 1 ;;
esac
# La clé doit être une clé, pas un gabarit : « non vide » laisse passer une ligne collée
# telle quelle depuis une consigne. Une clé anon est un JWT, elle commence par `eyJ`.
SUPA_KEY=$(lire_env REACT_APP_SUPABASE_ANON_KEY)
case "$SUPA_KEY" in
  eyJ*) echo "  Supabase : $SUPA_URL ✓" ;;
  *)
    rouge "✗ REACT_APP_SUPABASE_ANON_KEY ne ressemble pas à une clé : « $SUPA_KEY »."
    echo   "  Une clé anon Supabase est un JWT et commence par « eyJ »."
    exit 1 ;;
esac

# ── 3. Les dépendances ───────────────────────────────────────────────────────
etape "Installation des dépendances"
cd "$ELEARN"
npm install --legacy-peer-deps --no-audit --no-fund

# ── 4. La construction ───────────────────────────────────────────────────────
etape "Construction de BET E-Learning"
# Le cache de react-scripts survit aux changements de code et fait réapparaître des
# erreurs qui n'existent plus (28/09/2026). On part d'un cache propre.
rm -rf node_modules/.cache
# 4 Go : l'application est volumineuse et `react-scripts build` se fait tuer sans message
# clair au-delà de la limite par défaut de Node.
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# ── 5. Les contrôles, avant de toucher à ce qui est en ligne ─────────────────
etape "Contrôle du résultat"
[ -f build/index.html ] || { rouge "✗ build/index.html absent — construction incomplète."; exit 1; }
[ -f build/.htaccess ]  || { rouge "✗ build/.htaccess absent — seule la page d'accueil répondrait."; exit 1; }

# TOUS les fragments, pas seulement main.*.js : l'essentiel du code part en modules
# chargés à la demande, et une adresse erronée s'y cache sans apparaître dans le
# fragment principal.
if grep -qs "localhost:5001" build/static/js/*.js; then
  rouge "✗ Le build contient encore « localhost:5001 »."
  echo   "  La construction n'a pas lu .env.production. Rien n'a été publié."
  exit 1
fi
# Le bundle dit ce que react-scripts a RÉELLEMENT lu ; `.env.production` dit seulement ce
# qu'on y a écrit. C'est l'écart entre les deux qui produit la page blanche.
if ! grep -qs "$SUPA_URL" build/static/js/*.js; then
  rouge "✗ L'URL Supabase n'apparaît pas dans le build."
  echo   "  react-scripts n'a pas lu .env.production : la plateforme s'ouvrirait sur une"
  echo   "  page blanche. Rien n'a été publié."
  exit 1
fi
if ! grep -qs "$FIREBASE_ATTENDU" build/static/js/*.js; then
  rouge "✗ Le projet Firebase « $FIREBASE_ATTENDU » n'apparaît pas dans le build."
  echo   "  La configuration n'a pas été intégrée. Rien n'a été publié."
  exit 1
fi
# L'ancienne adresse sans tiret ne doit plus exister nulle part dans le code publié.
if grep -qsE "https://elearning\.binniesenglish\.net" build/static/js/*.js; then
  rouge "✗ Le build contient encore « elearning.binniesenglish.net » (sans tiret)."
  echo   "  Ce nom n'a aucun DNS. Rien n'a été publié."
  exit 1
fi
echo "  index.html ✓   .htaccess ✓   API intégrée ✓   Firebase intégré ✓   Supabase intégré ✓"
echo "  poids : $(du -sh build | cut -f1)"

# ── 6. La publication ────────────────────────────────────────────────────────
etape "Publication vers $CIBLE"
PROPRIO=$(stat -c '%U:%G' "$CIBLE" 2>/dev/null || stat -f '%Su:%Sg' "$CIBLE")
# `--delete` retire les fragments JavaScript des versions précédentes, qui sinon
# s'accumulent indéfiniment. Les exclusions protègent ce qui n'appartient pas au build :
#   .well-known  le défi de validation d'AutoSSL. Supprimé au mauvais moment, le
#                certificat du sous-domaine expire trois mois plus tard, sans que rien
#                n'ait l'air de s'être passé le jour du déploiement.
#   cgi-bin      créé par cPanel.
#   0-RACINE-*   le repère qui nomme le domaine servi par ce dossier.
#   php.ini, .user.ini
#                posés par cPanel à la création du sous-domaine. Le site est statique et
#                ne s'en sert pas, mais ils n'appartiennent pas au build : les effacer
#                serait défaire une configuration qu'on n'a pas mise là.
rsync -a --delete \
      --exclude='.well-known/' \
      --exclude='cgi-bin/' \
      --exclude='.deploiement-bet-elearning' \
      --exclude='0-RACINE-*' \
      --exclude='php.ini' \
      --exclude='.user.ini' \
      build/ "$CIBLE/"
date '+%F %H:%M:%S' > "$CIBLE/.deploiement-bet-elearning"
git -C "$RACINE" log -1 --format='%h %s' >> "$CIBLE/.deploiement-bet-elearning"
chown -R "$PROPRIO" "$CIBLE"
echo "  propriétaire rétabli : $PROPRIO"

vert "
✓ BET E-Learning publié.
  Vérifiez maintenant :
    · https://e-learning.binniesenglish.net     la page de connexion
    · connectez-vous, puis rechargez une page interne   (valide le .htaccess)
    · la console du navigateur                  aucune erreur CORS sur $API

  Si la console affiche une erreur CORS, c'est le backend qu'il faut mettre à jour :
  ALLOWED_ORIGINS doit contenir https://e-learning.binniesenglish.net, puis redémarrer
  l'API. Tant que ce n'est pas fait, la page s'affiche mais aucune donnée ne charge.
"
