#!/bin/bash
# visor-instalar.sh — instala el publicador del visor en ESTE Mac. Idempotente.
# Copia de seguridad de lo que va a sustituir. No lee ni imprime claves.
#
#   bash tools/visor-instalar.sh                         instala en este Mac (MBP16, MBP14 o MBA16)
#   bash tools/visor-instalar.sh --plan --equipo NOMBRE  dice el perfil y no toca nada
#   bash tools/visor-instalar.sh quitar                  lo para y lo quita
#
# Perfiles (#5822): MBP16 híbrido «GrokBot → MBP16»; MBP14 edge «MBP14»; MBA16 edge «MBA16».
# En el borde, Neo y Trinity quedan como app de escritorio («sin terminal, solo encargo»)
# hasta que alguien arranque tools/tmux-edge-lanzar.sh a propósito. Este script no lo arranca.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
L=com.admiranext.visor-publicar
P="${HOME}/Library/LaunchAgents/${L}.plist"
PLAN=0
EQUIPO="${VISOR_EQUIPO:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --plan) PLAN=1 ;;
    --equipo) EQUIPO="${2:-}"; shift ;;
    quitar)
      if [ "$(uname -s)" != "Darwin" ]; then echo "quitar solo tiene sentido en macOS"; exit 0; fi
      launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true
      rm -f "$P"
      echo "visor-publicar quitado"
      exit 0
      ;;
    *) echo "opción desconocida: $1" >&2; exit 2 ;;
  esac
  shift
done

# aire antes que pro, 14 antes que 16: «macbookpro16» no debe caer en el 14.
perfil_de() {
  local n
  n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
  case "$n" in
    *macbookair*16*|*mba16*) echo mba16 ;;
    *macbookpro*14*|*mbp14*|*negro14*) echo mbp14 ;;
    *macbookpro*16*|*mbp16*) echo mbp16 ;;
    *) echo "" ;;
  esac
}

if [ -z "$EQUIPO" ]; then
  EQUIPO="$(scutil --get LocalHostName 2>/dev/null || scutil --get ComputerName 2>/dev/null || hostname -s)"
fi
PERFIL="$(perfil_de "$EQUIPO")"
MAQ=""; MODO=""; TERM=""; ETQ=""; SUP=""; SES=""
case "$PERFIL" in
  mbp16) MAQ=macbook-pro-16; MODO=hibrido; TERM=MBP16; ETQ="GrokBot → MBP16" ;;
  mbp14) MAQ=macbookpronegro14; MODO=edge; TERM=MBP14; ETQ="MBP14"; SUP=escritorio; SES=neo ;;
  mba16) MAQ=macbookair16plata; MODO=edge; TERM=MBA16; ETQ="MBA16"; SUP=escritorio; SES=trinity ;;
esac

if [ "$PLAN" = 1 ]; then
  if [ -z "$PERFIL" ]; then echo "perfil desconocido para «${EQUIPO}»" >&2; exit 2; fi
  printf 'perfil=%s\nmaquina=%s\nmodo=%s\nterminal=%s\netiqueta=%s\nsuperficie=%s\nsesion=%s\n' \
    "$PERFIL" "$MAQ" "$MODO" "$TERM" "$ETQ" "$SUP" "$SES"
  if [ -n "$SUP" ]; then echo "marca=sin terminal, solo encargo"; fi
  echo "claves=no se leen"
  exit 0
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "este instalador es para macOS (MBP16, MBP14, MBA16). Aquí: bash tools/visor-instalar.sh --plan --equipo MacBookPro16" >&2
  exit 2
fi
if [ -z "$PERFIL" ]; then
  echo "no reconozco este Mac («${EQUIPO}»). Pasa --equipo o revisa LocalHostName. No instalo a ciegas." >&2
  exit 2
fi

BACKUP="$HOME/.fleet/backup/visor-$(date +%Y%m%d-%H%M%S)"
poner() {
  # poner DEST MODO < contenido por stdin. Si el destino ya es igual, no lo toca (idempotente).
  local dest="$1" modo="$2" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if [ -f "$dest" ] && cmp -s "$dest" "$tmp"; then rm -f "$tmp"; return 0; fi
  if [ -f "$dest" ]; then
    mkdir -p "$BACKUP"
    cp -p "$dest" "$BACKUP/$(basename "$dest")"
    echo "copia previa: $BACKUP/$(basename "$dest")"
  fi
  mkdir -p "$(dirname "$dest")"
  install -m "$modo" "$tmp" "$dest"
  rm -f "$tmp"
}

mkdir -p "$HOME/.fleet/logs" "$HOME/.config/admiranext" "$HOME/Claude/vista"
poner "$HOME/Claude/vista/estado-agente.py" 755 < "$D/estado-agente.py"
poner "$HOME/.fleet/visor-publicar.py" 755 < "$D/visor-publicar.py"
poner "$HOME/.config/admiranext/visor-maquina.conf" 644 <<EOF
maquina=${MAQ}
modo=${MODO}
terminal=${TERM}
EOF

if [ ! -f "$HOME/.config/admiranext/cuadratura.conf" ]; then
  poner "$HOME/.config/admiranext/cuadratura.conf" 644 <<'C'
Neo · Claude|macbook-pro-16|neo|Homebrew
Morfeo · Claude|macbook-pro-16|morfeo|Red Sands
Trinity · Codex|macbook-pro-16|trinity|Ocean
Oráculo · Codex|macmini|oraculo|Grass
C
fi

if [ "$PERFIL" = mbp14 ] || [ "$PERFIL" = mba16 ]; then
  TITULO="Neo · Claude"; SKIN="Homebrew"
  [ "$PERFIL" = mba16 ] && TITULO="Trinity · Codex" && SKIN="Ocean"
  poner "$HOME/.config/admiranext/visor-edge.conf" 644 <<EOF
${TITULO}|${MAQ}|${SES}|${SKIN}|sin_terminal|${TERM}|escritorio
EOF
fi

NUEVO="$(sed "s#__HOME__#$HOME#g" "$D/$L.plist")"
if [ -f "$P" ] && [ "$NUEVO" = "$(cat "$P")" ] && launchctl print "gui/$(id -u)/$L" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$L"
else
  if [ -f "$P" ]; then
    mkdir -p "$BACKUP"
    cp -p "$P" "$BACKUP/$(basename "$P")"
    echo "copia previa: $BACKUP/$(basename "$P")"
  fi
  launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true
  printf '%s\n' "$NUEVO" > "$P"
  launchctl bootstrap "gui/$(id -u)" "$P"
fi
echo "visor-publicar instalado · perfil ${PERFIL} · ${ETQ} · máquina ${MAQ}"
echo "el lanzador edge no se ha ejecutado"
