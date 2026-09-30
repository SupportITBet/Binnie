#!/usr/bin/env bash
#
# Déploie l'API (Backend) sur le VPS — api.binniesenglish.net.
#
#   git -C /opt/bet pull --ff-only          ← D'ABORD, séparément. Voir plus bas.
#   /opt/bet/scripts/deployer-backend.sh
#
# Un déploiement de backend n'est pas une copie de fichiers : c'est un redémarrage de
# service. Entre les deux, l'API est indisponible. Ce script réduit cette fenêtre au
# strict nécessaire, et surtout REFUSE de redémarrer sur du code qui ne démarrera pas —
# une erreur de syntaxe dans un fichier chargé au démarrage laisse l'API morte, et le
# service redémarre en boucle sans que rien ne le dise clairement.
#
# POURQUOI CE SCRIPT NE FAIT PAS `git pull` LUI-MÊME. bash lit un script au fur et à
# mesure de son exécution. Un `git pull` placé à l'intérieur réécrit le fichier que bash
# est en train de lire, et la suite est interprétée à un décalage qui ne correspond plus
# à rien. C'est arrivé le 28/09/2026. Le script VÉRIFIE que le code est à jour.
#
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACK="$RACINE/Backend"
PORT="${PORT:-5001}"

rouge()  { printf "\033[31m%s\033[0m\n" "$*"; }
jaune()  { printf "\033[33m%s\033[0m\n" "$*"; }
vert()   { printf "\033[32m%s\033[0m\n" "$*"; }
etape()  { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }

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
  echo   "      git -C $RACINE pull --ff-only && $0"
  exit 1
fi
echo "  commit : $(git log -1 --format='%h %s')"

# ── 2. La configuration ──────────────────────────────────────────────────────
etape "Vérification de la configuration"
if [ ! -f "$BACK/.env" ]; then
  rouge "✗ $BACK/.env est absent — l'API ne démarrerait pas."
  exit 1
fi

# Le 28/09/2026, le .env du serveur pointait encore vers `zfgtlgbbtxajvvbujdsb`, l'ancien
# projet Supabase gelé depuis le 3 septembre : l'API répondait normalement, mais lisait et
# écrivait dans une base que plus personne n'utilisait. Rien ne le signalait.
SUPABASE_ATTENDU="gznaizizjzdwgtmuxkep"
SUPABASE=$(grep -E "^SUPABASE_URL=" "$BACK/.env" | head -1 | cut -d= -f2- | tr -d '[:space:]')
case "$SUPABASE" in
  *"$SUPABASE_ATTENDU"*) echo "  projet Supabase : $SUPABASE_ATTENDU ✓" ;;
  "") rouge "✗ SUPABASE_URL n'est pas renseignée dans .env"; exit 1 ;;
  *)  rouge "✗ SUPABASE_URL vaut « $SUPABASE »."
      echo   "  Le projet attendu est « $SUPABASE_ATTENDU ». L'API répondrait normalement"
      echo   "  tout en travaillant dans une base que personne n'utilise."
      exit 1 ;;
esac

# `.env.vercel` décrit l'ancien déploiement Vercel : projet Supabase gelé et clé CinetPay
# de test. Le confondre avec `.env` a failli effacer la configuration SMTP du serveur et
# mettre l'encaissement en mode test (28/09/2026). Il n'a rien à faire ici.
if [ -f "$BACK/.env.vercel" ]; then
  jaune "  ⚠ $BACK/.env.vercel est présent sur ce serveur."
  jaune "    Ce fichier décrit l'ANCIEN déploiement (projet Supabase gelé, clé CinetPay"
  jaune "    de test). Renommez-le pour qu'on ne puisse plus le prendre pour .env :"
  jaune "        mv $BACK/.env.vercel $BACK/.env.ANCIEN-PROJET-NE-PAS-DEPLOYER"
fi

# ── 3. Les dépendances ───────────────────────────────────────────────────────
etape "Installation des dépendances"
cd "$BACK"
npm install --no-audit --no-fund

# ── 4. Le code démarre-t-il ? ────────────────────────────────────────────────
# Contrôle de syntaxe sur TOUS les fichiers chargés au démarrage. Il ne prouve pas que
# l'API fonctionne, mais il attrape la faute qui la laisserait morte après redémarrage —
# et il coûte deux secondes, contre plusieurs minutes d'API indisponible.
etape "Contrôle de syntaxe"
ERREURS=0
while IFS= read -r -d '' f; do
  if ! node --check "$f" 2>/dev/null; then
    rouge "  ✗ $(realpath --relative-to="$BACK" "$f" 2>/dev/null || echo "$f")"
    node --check "$f" 2>&1 | sed 's/^/      /' | head -4
    ERREURS=$((ERREURS + 1))
  fi
  # Les parenthèses ne sont pas décoratives : sans elles, `-print0` ne s'appliquerait
  # qu'à la seconde branche du `-o` et les fichiers .js ne seraient jamais examinés.
done < <(find src \( -name '*.js' -o -name '*.mjs' \) -print0)
if [ "$ERREURS" -gt 0 ]; then
  rouge "✗ $ERREURS fichier(s) invalide(s). L'API n'a PAS été redémarrée."
  exit 1
fi
echo "  tous les fichiers de src/ sont syntaxiquement valides"

# ── 5. Le redémarrage ────────────────────────────────────────────────────────
# Le superviseur du service est DÉTECTÉ, pas supposé : selon la mise en place il peut
# s'agir de systemd, de pm2, ou de Passenger (cPanel). Redémarrer le mauvais ne produit
# aucune erreur — la requête suivante répond simplement l'ancien code, et on cherche
# ailleurs pendant une heure.
etape "Redémarrage du service"
REDEMARRE=""

if command -v systemctl >/dev/null 2>&1; then
  UNITE=$(systemctl list-units --type=service --all --no-legend --plain 2>/dev/null \
          | awk '{print $1}' | grep -iE '^(bet|api-bet|binnie)[^ ]*\.service$' | head -1)
  if [ -n "$UNITE" ]; then
    systemctl restart "$UNITE"
    REDEMARRE="systemd ($UNITE)"
  fi
fi

if [ -z "$REDEMARRE" ] && command -v pm2 >/dev/null 2>&1; then
  PROC=$(pm2 jlist 2>/dev/null | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const l=JSON.parse(s); const m=l.find(p=>/bet|binnie|api/i.test(p.name));
            if (m) console.log(m.name); } catch {}
    });' 2>/dev/null)
  if [ -n "$PROC" ]; then
    pm2 restart "$PROC" --update-env
    pm2 save >/dev/null 2>&1 || true
    REDEMARRE="pm2 ($PROC)"
  fi
fi

# Passenger relit l'application quand ce fichier est touché. C'est le mécanisme des
# applications Node de cPanel.
if [ -z "$REDEMARRE" ] && [ -d "$BACK/tmp" ]; then
  touch "$BACK/tmp/restart.txt"
  REDEMARRE="Passenger (tmp/restart.txt)"
fi

if [ -z "$REDEMARRE" ]; then
  rouge "✗ Aucun superviseur reconnu — le service n'a PAS été redémarré."
  echo   "  Le code et les dépendances SONT à jour ; il ne manque que le redémarrage."
  echo   "  Cherchez lequel gère l'API, puis relancez-le à la main :"
  echo   "      systemctl list-units --type=service | grep -i bet"
  echo   "      pm2 list"
  echo   "      ls $BACK/tmp/restart.txt"
  echo
  echo   "  Puis ajoutez-le à l'étape 5 de ce script, pour que le prochain déploiement"
  echo   "  n'ait pas à le chercher."
  exit 1
fi
echo "  redémarré via $REDEMARRE"

# ── 6. L'API répond-elle ? ───────────────────────────────────────────────────
# Sans ce contrôle, le script annoncerait un succès alors que le service redémarre en
# boucle. On interroge en local (127.0.0.1) pour séparer une API morte d'un problème
# de vhost ou de certificat, qui ne se règle pas au même endroit.
etape "Contrôle de l'API"
SANTE=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  if SANTE=$(curl -fsS --max-time 4 "http://127.0.0.1:$PORT/health" 2>/dev/null); then break; fi
  SANTE=""
  sleep 2
done
if [ -z "$SANTE" ]; then
  rouge "✗ L'API ne répond pas sur http://127.0.0.1:$PORT/health après 20 secondes."
  echo   "  Le code est déployé mais le service ne démarre pas. Les journaux :"
  case "$REDEMARRE" in
    systemd*) echo "      journalctl -u ${UNITE:-<unité>} -n 60 --no-pager" ;;
    pm2*)     echo "      pm2 logs ${PROC:-<processus>} --lines 60 --nostream" ;;
    *)        echo "      les journaux de l'application Node dans cPanel" ;;
  esac
  exit 1
fi
echo "  http://127.0.0.1:$PORT/health → $SANTE"

if PUBLIC=$(curl -fsS --max-time 8 "https://api.binniesenglish.net/health" 2>/dev/null); then
  echo "  https://api.binniesenglish.net/health → $PUBLIC"
else
  jaune "  ⚠ L'API répond en local mais pas publiquement."
  jaune "    Le service va bien : cherchez du côté du vhost, du proxy ou du certificat."
fi

vert "
✓ API déployée — $(git -C "$RACINE" log -1 --format='%h %s')

  Cette mise à jour pose trois nouveaux verrous de permissions. Les comptes déjà
  connectés gardent en mémoire les droits lus à leur connexion : demandez aux coachs,
  à l'onboarding et à la collecte de données de SE RECONNECTER, sans quoi ils verront
  un refus jusqu'à l'expiration de leur session.
"
