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
  echo "  déjà un site BET — déployé le $(cat "$MARQUEUR" 2>/dev/null | head -1)"
elif [ -f "$CIBLE/asset-manifest.json" ] && [ -d "$CIBLE/static" ]; then
  # Un build React antérieur à l'existence du marqueur.
  echo "  build React reconnu (asset-manifest.json + static/)"
else
  # Ni marqueur, ni build : soit le dossier est vide, soit il abrite autre chose.
  ETRANGERS=$(find "$CIBLE" -mindepth 1 -maxdepth 1 \
                ! -name '.well-known' ! -name 'cgi-bin' ! -name '.htaccess' \
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

# ── 1. Le code ───────────────────────────────────────────────────────────────
etape "Mise à jour du code"
cd "$RACINE"
git pull --ff-only
echo "  commit : $(git log -1 --format='%h %s')"

# ── 2. La configuration ──────────────────────────────────────────────────────
etape "Vérification de la configuration"
if [ ! -f "$FRONT/.env.production" ]; then
  rouge "✗ $FRONT/.env.production est absent."
  echo   "  Ce fichier n'est pas dans le dépôt (il ne doit pas l'être) : créez-le sur ce"
  echo   "  serveur, une fois pour toutes. Sans lui, le site appellerait localhost."
  exit 1
fi

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

if grep -qs "localhost:5001" build/static/js/main.*.js; then
  rouge "✗ Le build contient encore « localhost:5001 »."
  echo   "  La construction n'a pas lu .env.production. Rien n'a été publié."
  exit 1
fi
echo "  index.html ✓   .htaccess ✓   API intégrée ✓"
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
rsync -a --delete \
      --exclude='.well-known/' \
      --exclude='cgi-bin/' \
      --exclude='.deploiement-bet' \
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
