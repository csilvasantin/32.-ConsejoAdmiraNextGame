#!/bin/bash
# statusline-consumo.sh — statusline de Claude Code de los agentes de la flota (instalar en ~/.claude/statusline-consumo.sh
# y apuntar a él el «statusLine» de cada CLAUDE_CONFIG_DIR: ~/.claude, ~/.claude-morfeo…).
# Guarda el JSON de estado que Claude Code le pasa (incluye rate_limits: five_hour / seven_day con used_percentage y
# resets_at) para que pulso-tokens.py mande el % usado y la hora de reinicio de cada cuenta a admira.live.
#   ~/.fleet/claude-statusline.json            → copia de siempre (la lee Jobs)
#   ~/.fleet/limites/claude-<carpeta>.json      → una por carpeta de config («claude» = ~/.claude, «morfeo» = ~/.claude-morfeo)
# Solo rate_limits + versión + hora: nada de la conversación.
in=$(cat)
dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
carpeta=$(basename "$dir"); carpeta="${carpeta#.}"; carpeta="${carpeta#claude-}"
mkdir -p ~/.fleet/limites 2>/dev/null
[ "$dir" = "$HOME/.claude" ] && printf '%s' "$in" > ~/.fleet/claude-statusline.json 2>/dev/null
printf '%s' "$in" | /usr/bin/python3 -c 'import json,sys,os,time
dest=sys.argv[1]
try:
  d=json.load(sys.stdin); r=d.get("rate_limits") or {}
  if r:
    tmp=dest+".tmp"
    with open(tmp,"w") as f: json.dump({"rate_limits":r,"version":d.get("version"),"ts":int(time.time())},f)
    os.replace(tmp,dest)
  s=(r.get("five_hour") or {}).get("used_percentage"); w=(r.get("seven_day") or {}).get("used_percentage")
  m=(d.get("model") or {}).get("display_name","")
  q=lambda x: "?" if x is None else x
  print("%s · 5h %s%% · semana %s%%" % (m, q(s), q(w)))
except Exception: print("")' "$HOME/.fleet/limites/claude-$carpeta.json"
