#!/usr/bin/env bash
#
# Déclenche une tâche planifiée de l'API BET, depuis le crontab du VPS.
#
#   /opt/bet/scripts/cron-bet.sh paiements-mensuels
#
# POURQUOI UN SCRIPT ET PAS UN `curl` DANS LE CRONTAB :
#
#   1. Le secret reste dans le seul fichier qui le détient (`Backend/.env`). Recopié dans
#      crontab, il faudrait le changer à deux endroits le jour d'une rotation — et l'oubli
#      ne se verrait qu'au silence des tâches.
#   2. On appelle 127.0.0.1, pas https://api.binniesenglish.net. Une tâche qui cesserait de
#      s'exécuter parce qu'un certificat a expiré est un bug de données silencieux : plus
#      aucune mensualité générée, sans le moindre message. Le réseau local n'a ni DNS, ni
#      TLS, ni Apache à faire échouer.
#   3. Un journal horodaté, avec le code HTTP. `curl -fsS` seul ne dit ni quand, ni quoi.
#
set -uo pipefail

TACHES="rappels-seances paiements-mensuels badges-fidelite newsletter-programmee push-notifications"

TACHE="${1:-}"
if [ -z "$TACHE" ] || ! printf '%s\n' $TACHES | grep -qx "$TACHE"; then
  echo "usage : $(basename "$0") <$(echo $TACHES | tr ' ' '|')>" >&2
  exit 64
fi

ENV_FILE="${BET_ENV:-/opt/bet/Backend/.env}"
if [ ! -r "$ENV_FILE" ]; then
  echo "$(date '+%F %T') [$TACHE] ✗ $ENV_FILE illisible" >&2
  exit 1
fi

# `cut -d= -f2-` et non `-f2` : une valeur peut contenir des « = ».
lire() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]'; }

SECRET=$(lire CRON_SECRET)
PORT=$(lire PORT); PORT="${PORT:-5001}"

if [ -z "$SECRET" ]; then
  echo "$(date '+%F %T') [$TACHE] ✗ CRON_SECRET absent de $ENV_FILE" >&2
  exit 1
fi

URL="http://127.0.0.1:$PORT/api/jobs/$TACHE"
REPONSE=$(curl -sS -m 300 -w '\n%{http_code}' -H "Authorization: Bearer $SECRET" "$URL" 2>&1)
CODE=$(printf '%s' "$REPONSE" | tail -1)
CORPS=$(printf '%s' "$REPONSE" | sed '$d')

if [ "$CODE" = "200" ]; then
  echo "$(date '+%F %T') [$TACHE] ✓ $CORPS"
else
  # Sortie non nulle : cron enverra un courriel à root, et le journal garde la trace.
  echo "$(date '+%F %T') [$TACHE] ✗ HTTP $CODE — $CORPS" >&2
  exit 1
fi
