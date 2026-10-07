#!/usr/bin/env bash
#
# Déploie le tableau de bord (dash) sur le VPS — app.binniesenglish.net.
#
#   git -C /opt/bet pull --ff-only          ← D'ABORD, séparément. Voir plus bas.
#   /opt/bet/scripts/deployer-dash.sh /home/betnet/public_html/app-bet
#
# Même raison d'être que deployer-frontend.sh : refuser de publier un tableau de bord
# cassé par-dessus un qui marche. On construit, on vérifie, et on ne touche au dossier
# en ligne qu'une fois certain du résultat.
#
# POURQUOI CE SCRIPT NE FAIT PAS `git pull` LUI-MÊME. bash lit un script au fur et à
# mesure de son exécution, sans le charger entièrement en mémoire. Un `git pull` placé
# à l'intérieur réécrit donc le fichier que bash est en train de lire : la suite est
# interprétée à un décalage d'octets qui ne correspond plus à rien. C'est arrivé le
# 28/09/2026. Le script se contente de VÉRIFIER que le code est à jour, et refuse sinon.
#
set -euo pipefail

CIBLE="${1:-}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASH="$RACINE/dash"

rouge()  { printf "\033[31m%s\033[0m\n" "$*"; }
vert()   { printf "\033[32m%s\033[0m\n" "$*"; }
etape()  { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }

if [ -z "$CIBLE" ]; then
  rouge "Usage : $0 /home/betnet/public_html/app-bet"
  echo   "        (la racine du vhost app.binniesenglish.net)"
  exit 1
fi
if [ ! -d "$CIBLE" ]; then
  rouge "✗ Le dossier cible n'existe pas : $CIBLE"
  echo   "  Créez d'abord le sous-domaine dans cPanel : il crée sa racine sous public_html."
  exit 1
fi

# ── 0. À QUI EST CE DOSSIER ? ────────────────────────────────────────────────
# Le 26/09/2026, un rsync --delete lancé sur la mauvaise racine a effacé le site d'un
# autre domaine. Le contrôle ci-dessous reconnaît ce qu'un dash BET laisse derrière lui
# et s'arrête devant tout le reste.
MARQUEUR="$CIBLE/.deploiement-bet-dash"
etape "Identification du dossier cible"
if [ -f "$MARQUEUR" ]; then
  echo "  racine déclarée du tableau de bord BET — « $(head -1 "$MARQUEUR" 2>/dev/null) »"
elif [ -f "$CIBLE/asset-manifest.json" ] && [ -d "$CIBLE/static" ]; then
  echo "  build React reconnu (asset-manifest.json + static/)"
else
  ETRANGERS=$(find "$CIBLE" -mindepth 1 -maxdepth 1 \
                ! -name '.well-known' ! -name 'cgi-bin' ! -name '.htaccess' \
                ! -name '0-RACINE-*' 2>/dev/null | head -20)
  if [ -n "$ETRANGERS" ]; then
    rouge "✗ REFUS : ce dossier contient autre chose qu'un tableau de bord BET."
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
  ARCHIVE="/root/avant-deploiement-dash-$(date +%F-%H%M%S).tar.gz"
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
if [ ! -f "$DASH/.env.production" ]; then
  rouge "✗ $DASH/.env.production est absent."
  echo   "  Ce fichier n'est pas dans le dépôt (il ne doit pas l'être) : créez-le sur ce"
  echo   "  serveur, une fois pour toutes. Sans lui, le dash appellerait localhost."
  exit 1
fi

# `.env.local` PRIME sur `.env.production`, y compris pour un build de production : c'est
# la règle de priorité de react-scripts, et elle surprend tout le monde. Un `.env.local`
# oublié sur ce serveur imposerait silencieusement ses valeurs à la place de celles qu'on
# vient de vérifier — les contrôles ci-dessous liraient un fichier, la construction un
# autre. Le cas s'est vérifié le 30/09/2026 sur la machine de développement, où le build
# partait vers l'ancien projet Firebase malgré un .env.production correct.
for PARASITE in "$DASH/.env.local" "$DASH/.env.production.local"; do
  if [ -f "$PARASITE" ]; then
    rouge "✗ $PARASITE existe."
    echo   "  react-scripts lui donne la PRIORITÉ sur .env.production : ses valeurs"
    echo   "  remplaceraient celles que ce script vient de contrôler, sans rien signaler."
    echo   "  Écartez-le avant de publier :"
    echo   "      mv $PARASITE $PARASITE.hors-service"
    exit 1
  fi
done

lire_env() { grep -E "^$1=" "$DASH/.env.production" | head -1 | cut -d= -f2- | tr -d '[:space:]'; }

API=$(lire_env REACT_APP_API_URL)
if [ -z "$API" ]; then
  rouge "✗ REACT_APP_API_URL n'est pas renseignée dans .env.production"; exit 1
fi
case "$API" in
  *localhost*|*127.0.0.1*)
    rouge "✗ REACT_APP_API_URL vaut « $API »."
    echo   "  Chaque utilisateur chercherait l'API sur sa propre machine : aucune"
    echo   "  connexion, aucun dashboard."
    exit 1 ;;
esac
echo "  API visée : $API"

# Le 27/09/2026, le Frontend en ligne pointait vers le projet Firebase `bet2026-7dfb1`
# tandis que le backend et le dash écrivaient dans `binnie-a1a42` : les messages des
# prospects partaient dans une base que personne ne lisait. Le nom du projet ne produit
# aucune erreur visible quand il est faux — d'où ce contrôle.
FIREBASE_ATTENDU="binnie-a1a42"
FIREBASE=$(lire_env REACT_APP_FIREBASE_PROJECT_ID)
if [ "$FIREBASE" != "$FIREBASE_ATTENDU" ]; then
  rouge "✗ REACT_APP_FIREBASE_PROJECT_ID vaut « ${FIREBASE:-（vide）} »."
  echo   "  Le projet attendu est « $FIREBASE_ATTENDU » — celui que le backend utilise."
  echo   "  Publier avec un autre projet enverrait conversations et notifications dans"
  echo   "  une base que personne ne lit, SANS message d'erreur."
  exit 1
fi
echo "  projet Firebase : $FIREBASE ✓"

# SUPABASE, SANS QUOI LE DASH NE S'AFFICHE PAS DU TOUT. `createClient` lève
# « supabaseUrl is required » au CHARGEMENT du module, avant le premier rendu : il n'y a
# ni message, ni écran de connexion, ni erreur visible côté serveur — une page blanche.
# Ces deux valeurs ne vivaient que dans `.env`, qui n'est pas versionné et n'existe donc
# pas ici : le build ne les voyait pas, et ce script publiait quand même. Constaté en
# production le 04/10/2026 sur app.binniesenglish.net.
for VAR in REACT_APP_SUPABASE_URL REACT_APP_SUPABASE_ANON_KEY; do
  VAL=$(lire_env "$VAR")
  if [ -z "$VAL" ]; then
    rouge "✗ $VAR n'est pas renseignée dans .env.production"
    echo   "  Sans elle, le tableau de bord s'ouvre sur une PAGE BLANCHE : Supabase refuse"
    echo   "  de se construire et l'application ne rend rien du tout."
    echo   "  Ajoutez les deux lignes dans $DASH/.env.production :"
    echo   "      REACT_APP_SUPABASE_URL=https://<projet>.supabase.co"
    echo   "      REACT_APP_SUPABASE_ANON_KEY=<clé anon>"
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

# LA CLÉ DOIT ÊTRE UNE CLÉ, PAS UN GABARIT. « non vide » ne suffisait pas : une ligne
# collée telle quelle depuis une consigne — `REACT_APP_SUPABASE_ANON_KEY=<la clé anon>` —
# passe ce test, part dans le build, et Supabase rejette alors chaque requête. L'écran
# s'affiche mais rien ne se charge, ce qui est plus long à diagnostiquer qu'une page
# blanche. Une clé anon est un JWT : elle commence par `eyJ`. Arrivé le 04/10/2026.
SUPA_KEY=$(lire_env REACT_APP_SUPABASE_ANON_KEY)
case "$SUPA_KEY" in
  eyJ*) echo "  Supabase : $SUPA_URL ✓" ;;
  *)
    rouge "✗ REACT_APP_SUPABASE_ANON_KEY ne ressemble pas à une clé : « $SUPA_KEY »."
    echo   "  Une clé anon Supabase est un JWT et commence par « eyJ »."
    echo   "  Si vous lisez des chevrons ci-dessus, le gabarit a été collé à la place de"
    echo   "  la valeur. Copiez la vraie clé (Supabase › Settings › API › anon public)."
    exit 1 ;;
esac

# ── 3. Les dépendances ───────────────────────────────────────────────────────
etape "Installation des dépendances"
cd "$DASH"
# `npm install` et non `npm ci` : le package-lock n'est pas synchronisé avec package.json
# et `npm ci` refuse de travailler dans ce cas. À rebasculer sur `npm ci` quand le lock
# sera régénéré.
npm install --legacy-peer-deps --no-audit --no-fund

# ── 4. La construction ───────────────────────────────────────────────────────
etape "Construction du tableau de bord"
# Le cache de react-scripts survit aux changements de code et fait réapparaître des
# erreurs qui n'existent plus — « HistoriqueTestsNiveau is not defined » alors que
# l'import était bien là (28/09/2026). On part d'un cache propre : la construction est
# plus lente d'une minute, ce qui est sans commune mesure avec le temps perdu à
# chercher une erreur qui n'est plus dans le code.
rm -rf node_modules/.cache
# 4 Go : le dash est nettement plus gros que le site public, et `react-scripts build`
# se fait tuer sans message clair au-delà de la limite par défaut de Node.
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# ── 5. Les contrôles, avant de toucher au dash en ligne ──────────────────────
etape "Contrôle du résultat"
[ -f build/index.html ] || { rouge "✗ build/index.html absent — construction incomplète."; exit 1; }
[ -f build/.htaccess ]  || { rouge "✗ build/.htaccess absent — seule la page de connexion répondrait."; exit 1; }

# TOUS les fragments, pas seulement main.*.js : le dash charge la majeure partie de son
# code en modules différés, et une adresse erronée s'y cache sans apparaître dans le
# fragment principal. Une vérification limitée à main.*.js a déjà laissé passer du code.
if grep -qs "localhost:5001" build/static/js/*.js; then
  rouge "✗ Le build contient encore « localhost:5001 »."
  echo   "  La construction n'a pas lu .env.production. Rien n'a été publié."
  exit 1
fi
if ! grep -qs "$FIREBASE_ATTENDU" build/static/js/*.js; then
  rouge "✗ Le projet Firebase « $FIREBASE_ATTENDU » n'apparaît pas dans le build."
  echo   "  La configuration n'a pas été intégrée. Rien n'a été publié."
  exit 1
fi
# L'URL Supabase DANS LE BUNDLE, et pas seulement dans le fichier de configuration.
# Vérifier `.env.production` dit ce qu'on a écrit ; vérifier le bundle dit ce que
# react-scripts a réellement lu. C'est l'écart entre les deux qui a produit la page
# blanche, et c'est donc ici qu'il faut regarder.
if ! grep -qs "$SUPA_URL" build/static/js/*.js; then
  rouge "✗ L'URL Supabase n'apparaît pas dans le build."
  echo   "  react-scripts n'a pas lu .env.production : le dash s'ouvrirait sur une page"
  echo   "  blanche. Rien n'a été publié."
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
rsync -a --delete \
      --exclude='.well-known/' \
      --exclude='cgi-bin/' \
      --exclude='.deploiement-bet-dash' \
      --exclude='0-RACINE-*' \
      build/ "$CIBLE/"
date '+%F %H:%M:%S' > "$CIBLE/.deploiement-bet-dash"
git -C "$RACINE" log -1 --format='%h %s' >> "$CIBLE/.deploiement-bet-dash"
chown -R "$PROPRIO" "$CIBLE"
echo "  propriétaire rétabli : $PROPRIO"

vert "
✓ Tableau de bord publié.
  Vérifiez maintenant :
    · https://app.binniesenglish.net            la page de connexion
    · connectez-vous, puis rechargez une page interne   (valide le .htaccess)
    · la console du navigateur                  aucune erreur CORS sur $API
"
