#!/usr/bin/env python3
"""lineas-commits.py — líneas de código ESCRITAS por los agentes, commit a commit (GrokBotBox, 09-10-2026 · r30).

Las fotos de /api/control/lineas (tools/hackeo-corpus.py, 00:00 y 12:00) solo dan dos puntos al día. Para la gráfica
de /consumos (1 h / 24 h / 7 d, mismo eje que los tokens) hace falta más resolución: este script lee el historial
de la rama principal de cada repo de la Galaxia (la MISMA lista PROYECTOS y los MISMOS filtros de ficheros que el
HACKEO: extensiones de código, sin node_modules/dist/minificados/secretos) y por cada commit cuenta líneas añadidas
y quitadas. Atribuye el commit a un agente por autor y trailers Co-authored-by (TrinityMBP16, MorfeoMacMini,
GrokBot/GrokBotBox, …); un commit de Claude Code sin nombre de agente se atribuye por la máquina del autor
(MacMini → Morfeo, MacBook Pro 16 → Neo). Lo demás queda «sin atribuir» (con su máquina si se sabe).

Uso: tools/lineas-commits.py [--dias 8] [--dry-run] [--url https://www.admira.live]
  Clones bare superficiales persistentes en /workspace/tmp/lineas-commits/. POST /api/consumos/lineas con
  X-Council-Token = CONSUMOS_LECTURAS_TOKEN (~/.config/admira/consumos-lecturas.token). Nunca se imprime.
"""
import argparse, importlib.util, json, os, re, subprocess, sys, time, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("hackeo_corpus", AQUI / "hackeo-corpus.py")
HC = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(HC)

# Nombres de agente por PALABRA (autor y Co-authored-by partidos en palabras: «LucasGrokBotBox» → lucas grok bot box).
AGENTES = {"neo": "Neo", "trinity": "Trinity", "morfeo": "Morfeo", "morpheus": "Morfeo", "oraculo": "Oráculo",
           "oráculo": "Oráculo", "oracle": "Oráculo", "smith": "Smith", "cypher": "Cypher", "niobe": "Niobe",
           "merovingio": "Merovingio", "link": "Link", "jobs": "Jobs", "wozniak": "Wozniak", "lucas": "Lucas",
           "disney": "Disney", "musk": "Musk", "huang": "Huang"}


def palabras(s):
    return [w.lower() for w in re.findall(r"[A-ZÁÉÍÓÚ]?[a-záéíóúñ]+|[A-Z]+(?![a-z])", s or "")]


def agente_por_nombre(s):
    w = palabras(s)
    for x in w:
        if x in AGENTES:
            return AGENTES[x]
    if any(a == "grok" and b == "bot" for a, b in zip(w, w[1:])) or (w[:2] == ["cursor", "agent"]):
        return "Grok Bot"  # GrokBot/GrokBotBox y los agentes de Cursor (Grok Bot del Consejo va por Cursor Pro)
    return None


MAQUINAS = [(r"macmini|mac-mini", "MacMini"), (r"macbook-?pro-?16|mbp16", "MacBook Pro 16"),
            (r"macbookpronegro14|macbook-?pro-?negro|mbp14", "MacBookProNegro14"), (r"macbookair", "MacBookAirPlata"),
            (r"grokbotbox|admiranext\.local", "GrokBotBox")]
# Claude Code sin nombre de agente → el agente Claude de esa máquina (orquestar-config.mjs).
CLAUDE_EN = {"MacMini": "Morfeo", "MacBook Pro 16": "Neo", "MacBookProNegro14": "Neo"}
CODEX_EN = {"MacMini": "Oráculo", "MacBook Pro 16": "Trinity"}


def agente_de(nombre, email, coautores, asunto=""):
    """→ (agente, maquina|None). coautores: lista de 'Nombre <email>'."""
    gente = [nombre] + [re.sub(r"\s*<.*", "", c) for c in coautores]
    for g in gente:
        ag = agente_por_nombre(g)
        if ag:
            return ag, None
    correos = " ".join([email or ""] + coautores)
    maq = next((m for pat, m in MAQUINAS if re.search(pat, correos, re.I)), None)
    if any(re.search(r"claude|anthropic", c, re.I) for c in coautores) and maq in CLAUDE_EN:
        return CLAUDE_EN[maq], maq
    if any(re.search(r"codex|openai", c, re.I) for c in coautores) and maq in CODEX_EN:
        return CODEX_EN[maq], maq
    return "sin atribuir", maq


def cuenta(ruta):
    p = Path(ruta)
    return p.suffix.lower() in HC.EXT and not HC.DIR_FUERA.search(ruta) and not HC.NOMBRE_SENSIBLE.search(ruta) \
        and not HC.MINIFICADO.search(ruta)


def git(*a, cwd=None):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True, errors="replace").stdout


def parsea_log(texto, shallow=()):
    """Salida de git log (formato de abajo + --numstat) → commits con líneas de código añadidas/quitadas."""
    out = []
    for bloque in texto.split("\x1e")[1:]:
        cab, _, resto = bloque.partition("\n")
        sha, ct, an, ae, co, asunto = (cab.split("\x1f") + [""] * 6)[:6]
        if sha in shallow:  # el borde del clon superficial «añade» el árbol entero: fuera
            continue
        add = dele = 0
        for l in resto.splitlines():
            m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", l)
            if not m or m.group(1) == "-":
                continue
            ruta = m.group(3)
            if "=>" in ruta:
                ruta = re.sub(r"\{[^}]*=> ([^}]*)\}", r"\1", ruta).split(" => ")[-1]
            if cuenta(ruta):
                add += int(m.group(1)); dele += int(m.group(2))
        if not add and not dele:
            continue
        coaut = [c.strip() for c in co.split("\x1d") if c.strip()]
        ag, maq = agente_de(an, ae, coaut, asunto)
        out.append({"s": sha[:7], "t": int(ct), "a": add, "d": dele, "g": ag, "m": maq})
    return out


FORMATO = "%x1e%H%x1f%ct%x1f%an%x1f%ae%x1f%(trailers:key=Co-authored-by,valueonly,separator=%x1d)%x1f%s"


def recoge(dias, base):
    vistos, commits, repos = set(), [], []
    for p in HC.PROYECTOS:
        repo = p["repo"]
        if repo in vistos:  # clearchannel-tv = admira.biz y clearchannel.tv: una sola vez
            continue
        vistos.add(repo)
        d = base / repo.split("/")[1]
        url = f"https://github.com/{repo}.git"
        try:
            if (d / "HEAD").exists():
                git("fetch", "-q", f"--shallow-since={dias + 1} days ago", "origin", "+HEAD:refs/heads/_principal", cwd=d)
            else:
                git("clone", "-q", "--bare", f"--shallow-since={dias + 1} days ago", url, str(d))
                git("fetch", "-q", "origin", "+HEAD:refs/heads/_principal", cwd=d)
            sh = set((d / "shallow").read_text().split()) if (d / "shallow").exists() else set()
            log = git("log", "_principal", "--no-merges", f"--since={dias} days ago", "--numstat", f"--format={FORMATO}", cwd=d)
            cs = parsea_log(log, sh)
            for c in cs:
                c["r"] = p["project"]
            commits += cs
            repos.append({"repo": repo, "proyecto": p["project"], "commits": len(cs)})
        except subprocess.CalledProcessError as e:
            repos.append({"repo": repo, "proyecto": p["project"], "error": (e.stderr or "")[-200:]})
    commits.sort(key=lambda c: c["t"])
    return {"ts": int(time.time()), "dias": dias, "metodo": "commits de la rama principal · mismos filtros que el HACKEO", "repos": repos, "commits": commits}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--url", default="https://www.admira.live")
    ap.add_argument("--base", default="/workspace/tmp/lineas-commits")
    a = ap.parse_args()
    base = Path(a.base); base.mkdir(parents=True, exist_ok=True)
    doc = recoge(a.dias, base)
    por = {}
    for c in doc["commits"]:
        por[c["g"]] = por.get(c["g"], 0) + c["a"]
    print(f"{len(doc['commits'])} commits · {sum(c['a'] for c in doc['commits'])} líneas añadidas · " +
          ", ".join(f"{k} {v}" for k, v in sorted(por.items(), key=lambda x: -x[1])))
    if a.dry_run:
        return
    tok = (Path.home() / ".config/admira/consumos-lecturas.token").read_text().strip()
    req = urllib.request.Request(a.url + "/api/consumos/lineas", data=json.dumps(doc).encode(), method="POST",
                                 headers={"content-type": "application/json", "x-council-token": tok, "user-agent": "lineas-commits/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print("POST", r.status, r.read()[:200].decode(errors="replace"))


if __name__ == "__main__":
    sys.exit(main())
