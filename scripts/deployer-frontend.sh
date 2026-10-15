#!/usr/bin/env bash
#
# Déploie le site public (Frontend) sur le VPS.
#
#   ./scripts/deployer-frontend.sh /home/<utilisateur>/public_html
#
# CE QUE CE SCRIPT REFUSE DE FAIRE, et c'est sa raison d'être : publier un site cassé
# par-dessus un site qui marche. Il construit d'abord, vérifie ensuite, et ne touche au
# dossier en ligne qu'une fois certain du résultat. Un `npm run build` qui échoue à
# mi-chemin laisse un dossier `build/` incomplet ; recopié tel quel, il remplace un site
# fonctionnel par une coquille vide.
#
# Les trois contrôles qui comptent :
#   1. `.env.production` existe            — sinon le site appellerait localhost
#   2. l'adresse de l'API est une vraie    — le piège du premier déploiement
#   3. `.htaccess` est dans le build       — sans lui, seule l'accueil répond
#
set -euo pipefail

CIBLE="${1:-}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONT="$RACINE/Frontend"

rouge()  { printf "\033[31m%s\033[0m\n" "$*"; }
vert()   { printf "\033[32m%s\033[0m\n" "$*"; }
etape()  { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }

if [ -z "$CIBLE" ]; then
  rouge "Usage : $0 /home/<utilisateur>/public_html"
  echo   "        (le dossier servi par Apache pour binniesenglish.net)"
  exit 1
fi

if [ ! -d "$CIBLE" ]; then
  rouge "✗ Le dossier cible n'existe pas : $CIBLE"
  echo   "  Créez d'abord le compte du domaine dans WHM."
  exit 1
fi

# ── 0. À QUI EST CE DOSSIER ? ────────────────────────────────────────────────
#
# Le 26 septembre 2026, ce script a été lancé sur /home/binniesenglish/public_html
# en croyant viser binniesenglish.net. Ce dossier était la racine du domaine PRINCIPAL
# du compte cPanel — binniesenglish.com — et servait un site WebSuitePro. Le `rsync
# --delete` de l'étape 6 l'a effacé. La base de données a survécu, les fichiers non.
#
# `public_html` n'appartient jamais à un domaine ajouté : c'est toujours la racine du
# domaine principal. Un domaine ajouté reçoit son propre dossier — souvent
# `public_html/<le-domaine>/`. Se tromper des deux est d'autant plus facile que les
# deux chemins se ressemblent.
#
# Le contrôle ci-dessous refuse donc d'écrire dans un dossier qui abrite VISIBLEMENT
# autre chose. Il ne prétend pas tout reconnaître : il reconnaît ce qu'un site BET
# laisse derrière lui, et s'arrête devant tout le reste.
MARQUEUR="$CIBLE/.deploiement-bet"
etape "Identification du dossier cible"
if [ -f "$MARQUEUR" ]; then
  echo "  racine déclarée du site BET — « $(head -1 "$MARQUEUR" 2>/dev/null) »"
elif [ -f "$CIBLE/asset-manifest.json" ] && [ -d "$CIBLE/static" ]; then
  # Un build React antérieur à l'existence du marqueur.
  echo "  build React reconnu (asset-manifest.json + static/)"
else
  # Ni marqueur, ni build : soit le dossier est vide, soit il abrite autre chose.
  # `0-RACINE-*.txt` identifie la racine d'un domaine (voir deploiement/). C'est un
  # repère, pas un site : il ne doit pas faire échouer une première publication.
  ETRANGERS=$(find "$CIBLE" -mindepth 1 -maxdepth 1 \
                ! -name '.well-known' ! -name 'cgi-bin' ! -name '.htaccess' \
                ! -name '0-RACINE-*' \
                2>/dev/null | head -20)
  if [ -n "$ETRANGERS" ]; then
    rouge "✗ REFUS : ce dossier contient autre chose qu'un site BET."
    echo
    echo "  $CIBLE"
    printf '    %s\n' $(echo "$ETRANGERS" | xargs -n1 basename 2>/dev/null)
    echo
    echo "  L'étape 6 supprime tout ce qui ne figure pas dans le build. Si ce dossier"
    echo "  est la racine d'un AUTRE site, il serait effacé — c'est arrivé une fois."
    echo
    echo "  Rappel : public_html est la racine du domaine PRINCIPAL du compte."
    echo "  Un domaine ajouté a son propre dossier. Pour savoir lequel :"
    echo "      uapi --user=<compte> DomainInfo list_domains"
    echo
    echo "  Si vous voulez réellement remplacer ce contenu, créez le marqueur"
    echo "  vous-même, en connaissance de cause :"
    echo "      touch $MARQUEUR"
    exit 1
  fi
  echo "  dossier vide — première publication"
fi

# ── 0 bis. Une copie de l'existant, avant d'y toucher ────────────────────────
# Douze mégaoctets de précaution contre une republication ratée. Le jour où le build
# est incomplet malgré les contrôles, c'est ce fichier qui remet le site en ligne.
if [ -n "$(ls -A "$CIBLE" 2>/dev/null)" ]; then
  ARCHIVE="/root/avant-deploiement-$(basename "$CIBLE")-$(date +%F-%H%M%S).tar.gz"
  if tar czf "$ARCHIVE" -C "$(dirname "$CIBLE")" "$(basename "$CIBLE")" 2>/dev/null; then
    echo "  copie de sûreté : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
  else
    rouge "  ⚠ copie de sûreté impossible — poursuite sans filet"
  fi
fi

# ── 1. Le code est-il à jour ? ───────────────────────────────────────────────
#
# Ce script faisait `git pull` ici. C'était un piège : bash lit un script au fur et à
# mesure de son exécution, sans le charger entièrement en mémoire. Le pull réécrivait
# donc le fichier que bash était en train de lire, et la suite était interprétée à un
# décalage d'octets qui ne correspondait plus à rien (28/09/2026). Le script se contente
# désormais de VÉRIFIER, et refuse si le code n'est pas à jour.
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
if [ ! -f "$FRONT/.env.production" ]; then
  rouge "✗ $FRONT/.env.production est absent."
  echo   "  Ce fichier n'est pas dans le dépôt (il ne doit pas l'être) : créez-le sur ce"
  echo   "  serveur, une fois pour toutes. Sans lui, le site appellerait localhost."
  exit 1
fi

# `.env.local` PRIME sur `.env.production`, y compris pour un build de production : c'est
# la règle de priorité de react-scripts, et elle surprend tout le monde. Un `.env.local`
# oublié ici imposerait silencieusement ses valeurs à la place de celles qu'on vérifie
# juste en dessous — les contrôles liraient un fichier, la construction un autre.
for PARASITE in "$FRONT/.env.local" "$FRONT/.env.production.local"; do
  if [ -f "$PARASITE" ]; then
    rouge "✗ $PARASITE existe."
    echo   "  react-scripts lui donne la PRIORITÉ sur .env.production : ses valeurs"
    echo   "  remplaceraient celles que ce script vient de contrôler, sans rien signaler."
    echo   "  Écartez-le avant de publier :"
    echo   "      mv $PARASITE $PARASITE.hors-service"
    exit 1
  fi
done

API=$(grep -E "^REACT_APP_API_URL=" "$FRONT/.env.production" | cut -d= -f2- | tr -d '[:space:]')
if [ -z "$API" ]; then
  rouge "✗ REACT_APP_API_URL n'est pas renseignée dans .env.production"
  exit 1
fi
case "$API" in
  *localhost*|*127.0.0.1*)
    rouge "✗ REACT_APP_API_URL vaut « $API »."
    echo   "  Le site s'afficherait, mais chaque visiteur chercherait l'API sur sa propre"
    echo   "  machine : ni inscription, ni test de niveau, ni paiement."
    exit 1 ;;
esac
echo "  API visée : $API"

# SUPABASE, SANS QUOI LE SITE NE S'AFFICHE PAS DU TOUT. `src/config/supabase.js` appelle
# `createClient` sans protection : sans URL, il lève « supabaseUrl is required » au
# CHARGEMENT du module, avant le premier rendu — page blanche, sans message ni erreur
# serveur. Ces valeurs ne vivaient que dans `.env`, non versionné, donc absent d'un
# serveur : le build ne les voyait pas. C'est ce qui est arrivé au dash le 04/10/2026,
# dont la configuration avait exactement le même manque.
SUPA_URL=$(grep -E "^REACT_APP_SUPABASE_URL=" "$FRONT/.env.production" | cut -d= -f2- | tr -d '[:space:]')
SUPA_KEY=$(grep -E "^REACT_APP_SUPABASE_ANON_KEY=" "$FRONT/.env.production" | cut -d= -f2- | tr -d '[:space:]')
if [ -z "$SUPA_URL" ] || [ -z "$SUPA_KEY" ]; then
  rouge "✗ La configuration Supabase manque dans .env.production"
  echo   "  Sans elle, le site s'ouvre sur une PAGE BLANCHE : le client Supabase refuse de"
  echo   "  se construire et l'application ne rend rien."
  echo   "  Ajoutez les deux lignes dans $FRONT/.env.production :"
  echo   "      REACT_APP_SUPABASE_URL=https://<projet>.supabase.co"
  echo   "      REACT_APP_SUPABASE_ANON_KEY=<clé anon>"
  exit 1
fi
case "$SUPA_URL" in
  https://*.supabase.co) : ;;
  *)
    rouge "✗ REACT_APP_SUPABASE_URL vaut « $SUPA_URL »."
    echo   "  Une URL de projet Supabase ressemble à https://<projet>.supabase.co."
    exit 1 ;;
esac
# La clé doit être une clé, pas un gabarit : « non vide » laissait passer une ligne collée
# telle quelle depuis une consigne. Une clé anon est un JWT, elle commence par `eyJ`.
case "$SUPA_KEY" in
  eyJ*) echo "  Supabase : $SUPA_URL ✓" ;;
  *)
    rouge "✗ REACT_APP_SUPABASE_ANON_KEY ne ressemble pas à une clé : « $SUPA_KEY »."
    echo   "  Une clé anon Supabase est un JWT et commence par « eyJ »."
    exit 1 ;;
esac

# ── 3. Les dépendances ───────────────────────────────────────────────────────
etape "Installation des dépendances"
cd "$FRONT"
# `npm install` et non `npm ci` : le package-lock du dépôt n'est pas synchronisé avec
# package.json, et `npm ci` refuse de travailler dans ce cas. À rebasculer sur `npm ci`
# le jour où le lock sera régénéré — il garantit des versions identiques d'un
# déploiement à l'autre, ce que `npm install` ne promet pas.
npm install --legacy-peer-deps --no-audit --no-fund

# ── 4. La construction ───────────────────────────────────────────────────────
etape "Construction du site"
# 2 Go : `react-scripts build` dépasse la limite par défaut de Node sur un projet de
# cette taille, et se fait tuer sans message clair.
NODE_OPTIONS=--max-old-space-size=2048 npm run build

# ── 5. Les contrôles, avant de toucher au site en ligne ──────────────────────
etape "Contrôle du résultat"
[ -f build/index.html ] || { rouge "✗ build/index.html absent — construction incomplète."; exit 1; }
[ -f build/.htaccess ]  || { rouge "✗ build/.htaccess absent — seule la page d'accueil répondrait."; exit 1; }

# TOUS les fragments, pas seulement main.*.js : une partie du code part dans des modules
# chargés à la demande, et une adresse erronée s'y cache sans apparaître dans le fragment
# principal. Une vérification limitée à main.*.js a déjà laissé passer du code.
if grep -qs "localhost:5001" build/static/js/*.js; then
  rouge "✗ Le build contient encore « localhost:5001 »."
  echo   "  La construction n'a pas lu .env.production. Rien n'a été publié."
  exit 1
fi
# L'URL Supabase DANS LE BUNDLE, pas seulement dans le fichier de configuration. Le
# premier dit ce qu'on a écrit, le second ce que react-scripts a réellement lu — et c'est
# l'écart entre les deux qui produit la page blanche.
if ! grep -qs "$SUPA_URL" build/static/js/*.js; then
  rouge "✗ L'URL Supabase n'apparaît pas dans le build."
  echo   "  react-scripts n'a pas lu .env.production : le site s'ouvrirait sur une page"
  echo   "  blanche. Rien n'a été publié."
  exit 1
fi
echo "  index.html ✓   .htaccess ✓   API intégrée ✓   Supabase intégré ✓"
echo "  poids : $(du -sh build | cut -f1)"

# ── 6. La publication ────────────────────────────────────────────────────────
etape "Publication vers $CIBLE"
PROPRIO=$(stat -c '%U:%G' "$CIBLE" 2>/dev/null || stat -f '%Su:%Sg' "$CIBLE")
# `--delete` retire du site les fichiers disparus du build : sans lui, les anciens
# fragments JavaScript s'accumulent indéfiniment à chaque déploiement.
#
# `--exclude` : ces dossiers n'appartiennent pas au build, et `--delete` les emporterait.
#   .well-known  Let's Encrypt y dépose son défi de validation. Supprimé au mauvais moment,
#                AutoSSL échoue et le certificat du domaine expire — trois mois plus tard,
#                sans que rien n'ait l'air de s'être passé le jour du déploiement.
#   cgi-bin      créé par cPanel à la création du compte.
#   0-RACINE-*   le repère qui nomme le domaine servi par ce dossier. Il n'a d'utilité
#                que s'il survit aux déploiements : c'est en le lisant dans la liste des
#                fichiers, chez Hostinger, qu'on évite de confondre deux racines.
#   api-bet/     RACINE DU VHOST api.binniesenglish.net. cPanel place les sous-domaines
#                SOUS public_html, donc dans la cible de ce déploiement. Supprimé, le
#                vhost de l'API perd sa racine documentaire et répond 500 à tout — sans
#                rien écrire dans les journaux, ce qui rend la panne très difficile à
#                relier au déploiement qui l'a causée.
#   elearning-bet/  RACINE DU VHOST e-learning.binniesenglish.net, ajoutée le 15/10/2026.
#                Même piège que api-bet/ et app-bet/ : cPanel place les sous-domaines SOUS
#                public_html, donc dans la cible de ce déploiement. Sans cette exclusion,
#                publier le site public effacerait la plateforme e-learning.
#                ⚠ Ce nom doit correspondre au dossier réel du vhost. Pour le vérifier :
#                    uapi --user=betnet DomainInfo list_domains
rsync -a --delete \
      --exclude='.well-known/' \
      --exclude='cgi-bin/' \
      --exclude='.deploiement-bet' \
      --exclude='0-RACINE-*' \
      --exclude='api-bet/' \
      --exclude='app-bet/' \
      --exclude='elearning-bet/' \
      build/ "$CIBLE/"
date '+%F %H:%M:%S' > "$CIBLE/.deploiement-bet"
git -C "$RACINE" log -1 --format='%h %s' >> "$CIBLE/.deploiement-bet"
chown -R "$PROPRIO" "$CIBLE"
echo "  propriétaire rétabli : $PROPRIO"

vert "
✓ Site publié.
  Vérifiez maintenant :
    · https://binniesenglish.net          la page d'accueil
    · https://binniesenglish.net/parcours une page interne (valide le .htaccess)
    · la console du navigateur            aucune erreur CORS sur $API
"
