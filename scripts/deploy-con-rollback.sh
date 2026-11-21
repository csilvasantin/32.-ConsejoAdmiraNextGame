#!/usr/bin/env bash
# r241 (21-11-2026): despliegue de admira-live con backup anotado y rollback automático.
#
# Bug que arregla: el envoltorio anterior sacaba el id de producción con
#   wrangler pages deployment list | grep -m1 Production | grep -oE '<uuid>'
# y la línea de la tabla lleva el id DOS veces (columna Id y URL del dashboard) → PREV="id id"; además
# «wrangler pages deployment rollback» NO existe en wrangler. El rollback nunca habría funcionado.
# Ahora: el id y el commit salen de «--json» con jq (uno solo, validado como UUID) y el rollback vuelve a publicar
# el commit de ese despliegue (Source) con ./deploy.sh desde un worktree temporal — mismo camino que un deploy normal.
#
# Uso:  ADMIRA_RELEASE_AGENT=… ADMIRA_RELEASE_MACHINE=… scripts/deploy-con-rollback.sh [--dry-run]
#   --dry-run: resuelve el backup, prepara el worktree del rollback, comprueba que deploy.sh y el commit están y
#              enseña lo que haría, SIN desplegar nada.
# Variables: LOG (por defecto /tmp/deploy-con-rollback.log), ESPERA_S (15), FORZAR_FALLO=1 (solo pruebas: da la
# verificación por fallida para ejercitar el rollback; con --dry-run no publica nada).
set -uo pipefail
PROJ=admira-live
SITIO=https://www.admira.live
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
LOG="${LOG:-/tmp/deploy-con-rollback.log}"
ESPERA_S="${ESPERA_S:-15}"
RAIZ="$(git rev-parse --show-toplevel)" || exit 1
cd "$RAIZ"
: "${ADMIRA_RELEASE_AGENT:?Define ADMIRA_RELEASE_AGENT}"
: "${ADMIRA_RELEASE_MACHINE:?Define ADMIRA_RELEASE_MACHINE}"

UUID_RX='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

backup_actual() {  # → "id commit" del despliegue de producción vigente (el primero de la lista)
  npx --yes wrangler pages deployment list --project-name="$PROJ" --json 2>/dev/null \
    | jq -r '[.[] | select(.Environment == "Production")][0] | "\(.Id) \(.Source)"'
}

publicado_git() { curl -s --max-time 15 "$SITIO/version.json?nc=$RANDOM" | jq -r '.gitShort // empty' 2>/dev/null; }

sano() {  # $1 = commit corto esperado
  local g a b
  g="$(publicado_git)"
  a="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITIO/api/consumos/velocidad")"
  b="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITIO/api/flota/trabajando")"
  echo "  verificación: version.json=$g (esperado ${1:0:7}) · velocidad=$a · trabajando=$b"
  [ "${FORZAR_FALLO:-0}" = 1 ] && { echo "  (FORZAR_FALLO=1: se da por fallida)"; return 1; }
  [ "$g" = "${1:0:7}" ] && [ "$a" = 200 ] && [ "$b" = 200 ]
}

read -r PREV PREV_GIT <<<"$(backup_actual)"
if ! [[ "$PREV" =~ $UUID_RX ]] || ! [[ "$PREV_GIT" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "✗ no se pudo leer el backup de producción (id='$PREV' commit='$PREV_GIT'): no se despliega" >&2; exit 2
fi
echo "BACKUP=$PREV (commit $PREV_GIT)"

preparar_rollback() {  # crea el worktree del commit de backup → echo ruta
  git fetch -q origin 2>/dev/null || true
  git cat-file -e "$PREV_GIT^{commit}" 2>/dev/null || { echo "✗ el commit $PREV_GIT del backup no está en el repo" >&2; return 1; }
  local wt; wt="$(mktemp -d /tmp/rollback-admira-XXXXXX)"
  git worktree add -q --detach "$wt" "$PREV_GIT" || return 1
  [ -x "$wt/deploy.sh" ] || { echo "✗ $PREV_GIT no tiene deploy.sh" >&2; return 1; }
  echo "$wt"
}

rollback() {
  echo "↩ ROLLBACK a $PREV (commit $PREV_GIT)"
  local wt; wt="$(preparar_rollback)" || { echo "✗ ROLLBACK IMPOSIBLE: hazlo a mano desde el dashboard ($PREV)" >&2; return 1; }
  if [ "$DRY" = 1 ]; then
    echo "  [dry-run] se ejecutaría en $wt: ADMIRA_RELEASE_AGENT=$ADMIRA_RELEASE_AGENT ADMIRA_RELEASE_MACHINE=$ADMIRA_RELEASE_MACHINE ./deploy.sh"
    echo "  [dry-run] y se comprobaría version.json gitShort=${PREV_GIT:0:7}"
    git -C "$wt" log --oneline -1
  else
    (cd "$wt" && ./deploy.sh >>"$LOG" 2>&1) || true   # deploy.sh sale con 1 por el post-check 401 sin llave de kiosco
    sleep "$ESPERA_S"
    FORZAR_FALLO=0 sano "$PREV_GIT" && echo "✓ rollback publicado (commit $PREV_GIT)" || echo "✗ el rollback no verifica: revisa $LOG" >&2
  fi
  git worktree remove --force "$wt" 2>/dev/null || true
}

HEAD_GIT="$(git rev-parse HEAD)"
if [ "$DRY" = 1 ]; then
  echo "[dry-run] desplegaría HEAD ${HEAD_GIT:0:7}; si la verificación falla:"
  rollback; exit 0
fi

./deploy.sh >"$LOG" 2>&1 || true   # sale con 1 por el post-check 401 (falta la llave de kiosco en la caja): esperado
sleep "$ESPERA_S"
if sano "$HEAD_GIT"; then
  read -r NUEVO _ <<<"$(backup_actual)"
  echo "✓ DESPLEGADO $NUEVO (commit ${HEAD_GIT:0:7}) · backup $PREV"; exit 0
fi
rollback; exit 1
