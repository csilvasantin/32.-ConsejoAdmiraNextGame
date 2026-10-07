#!/usr/bin/env python3
"""Corpus del HACKEO · modo CÓDIGO (Carlos, 07-10-2026).

Cada panel del HACKEO teclea código REAL de un proyecto AdmiraNeXT. Este script
clona (superficial) los repos públicos de los 9 proyectos (5 Admira + 4 startup) y escribe, en el
directorio de salida:

  index.json        totales por proyecto (ficheros y líneas de código) + suma
  <clave>.json      muestra de ficheros fuente reales para teclear

SIN SECRETOS, por construcción:
  · fuera ficheros sensibles por nombre (.env*, .dev.vars, *.pem, *.key, id_rsa,
    *secret*, *credential*, *token*, *password*, keystores, wrangler.toml…);
  · en la muestra se cae cualquier línea que case con un patrón de secreto (claves
    de API, JWT, tokens de GitHub/Slack/Telegram/Google/AWS/Stripe, bloques PEM,
    asignaciones a key/secret/token/password y cadenas largas tipo hash/base64).

«Líneas de código» = líneas NO vacías de los ficheros fuente (html, js, mjs, ts,
css, py, sh…), sin node_modules, dist, vendor ni minificados.

Uso:  python3 tools/hackeo-corpus.py <dir_salida>
"""
import hashlib, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path

# Orden = orden de asignación a los paneles: 1-5 Admira, 6-9 sus versiones startup
# (Carlos, 07-10-2026), y vuelta a empezar. «par» = el proyecto Admira equivalente.
# admira.tv no tiene versión startup con repo propio: se omite.
PROYECTOS = [
    {"key": "studio", "project": "admira.studio", "repo": "csilvasantin/admira-studio", "familia": "admira"},
    {"key": "store",  "project": "admira.store",  "repo": "csilvasantin/admira-store",  "familia": "admira"},
    {"key": "tv",     "project": "admira.tv",     "repo": "csilvasantin/admira-tv",     "familia": "admira"},
    {"key": "app",    "project": "admira.app",    "repo": "csilvasantin/admira-app",    "familia": "admira"},
    # admira.biz se sirve desde el proyecto Pages clearchannel-tv (multi-dominio)
    {"key": "biz",    "project": "admira.biz",    "repo": "csilvasantin/clearchannel-tv", "familia": "admira"},
    {"key": "pixeria",      "project": "pixeria.com",     "repo": "csilvasantin/pixeria",        "familia": "startup", "par": "studio"},
    {"key": "xpaceos",      "project": "xpaceos.com",     "repo": "csilvasantin/xpaceos",        "familia": "startup", "par": "store"},
    # mismo repo que admira.biz: sus líneas NO se suman otra vez
    {"key": "clearchannel", "project": "clearchannel.tv", "repo": "csilvasantin/clearchannel-tv", "familia": "startup", "par": "biz"},
    {"key": "yokup",        "project": "yokup.com",       "repo": "csilvasantin/tool",           "familia": "startup", "par": "app"},
]

EXT = {".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".scss",
       ".py", ".sh", ".swift", ".kt", ".java", ".go", ".rs", ".php", ".rb", ".sql",
       ".vue", ".svelte"}
DIR_FUERA = re.compile(r"(^|/)(node_modules|vendor|vendors|third_party|dist|build|\.git|"
                       r"\.wrangler|\.next|\.cache|coverage|__pycache__|\.runtime)(/|$)", re.I)
NOMBRE_SENSIBLE = re.compile(r"(^|/)(\.env[^/]*|\.dev\.vars|id_rsa[^/]*|id_ed25519[^/]*|"
                             r"wrangler\.toml|[^/]*\.(pem|key|p12|pfx|keystore|jks|crt)|"
                             r"[^/]*(secret|credential|token|password|passwd)[^/]*)$", re.I)
MINIFICADO = re.compile(r"\.min\.[a-z]+$|[-.]bundle\.js$|\.map$", re.I)
SECRETO = re.compile("|".join([
    r"-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)",
    r"\bsk-[A-Za-z0-9_-]{16,}", r"\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}",
    r"\bAKIA[0-9A-Z]{16}\b", r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}", r"github_pat_[A-Za-z0-9_]{20,}",
    r"\bxox[abprs]-[A-Za-z0-9-]{10,}", r"\bAIza[0-9A-Za-z_-]{30,}", r"\b\d{8,10}:AA[A-Za-z0-9_-]{30,}",
    r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.", r"\bya29\.[A-Za-z0-9_-]{20,}",
    r"(?i:api[_-]?key|apikey|secret|token|passw(or)?d|pwd|bearer|authorization|private[_-]?key|"
    r"client[_-]?secret|access[_-]?key)[\"']?\s*[:=]\s*[\"'`][^\"'`\s]{6,}",
    r"(?i:bearer)\s+[A-Za-z0-9._~+/-]{16,}",
    r"\b[0-9a-fA-F]{32,}\b", r"[A-Za-z0-9+/_-]{40,}={0,2}",
    r"(?i:mongodb|postgres(ql)?|mysql|redis|amqp)://[^\s\"']+:[^\s\"']+@",
]))

# RÓTULO ASCII del proyecto (Carlos, 07-10-2026): fijo arriba de cada ventana del modo
# CÓDIGO y al inicio de cada bloque en los Terminales reales. Fuente propia de 5 filas
# (sin dependencias: no hay figlet en las máquinas), comprimida a 3 filas con medios
# bloques ▀▄█ para que el «píxel» salga cuadrado.
_FUENTE = {
 "A": ".##.|#..#|####|#..#|#..#", "B": "###.|#..#|###.|#..#|###.", "C": ".###|#...|#...|#...|.###",
 "D": "###.|#..#|#..#|#..#|###.", "E": "####|#...|###.|#...|####", "F": "####|#...|###.|#...|#...",
 "G": ".###|#...|#.##|#..#|.###", "H": "#..#|#..#|####|#..#|#..#", "I": "###|.#.|.#.|.#.|###",
 "J": "..##|...#|...#|#..#|.##.", "K": "#..#|#.#.|##..|#.#.|#..#", "L": "#...|#...|#...|#...|####",
 "M": "#...#|##.##|#.#.#|#...#|#...#", "N": "#...#|##..#|#.#.#|#..##|#...#", "O": ".##.|#..#|#..#|#..#|.##.",
 "P": "###.|#..#|###.|#...|#...", "Q": ".##.|#..#|#..#|#.##|.###", "R": "###.|#..#|###.|#.#.|#..#",
 "S": ".###|#...|.##.|...#|###.", "T": "#####|..#..|..#..|..#..|..#..", "U": "#..#|#..#|#..#|#..#|.##.",
 "V": "#...#|#...#|#...#|.#.#.|..#..", "W": "#...#|#...#|#.#.#|##.##|#...#", "X": "#...#|.#.#.|..#..|.#.#.|#...#",
 "Y": "#...#|.#.#.|..#..|..#..|..#..", "Z": "####|...#|.##.|#...|####", ".": ".|.|.|.|#", " ": "..|..|..|..|..",
 "0": ".##.|#..#|#..#|#..#|.##.", "1": ".#.|##.|.#.|.#.|###", "2": "###.|...#|.##.|#...|####",
}


def rotulo(texto: str) -> list:
    filas = [""] * 5
    for i, ch in enumerate(texto.upper()):
        g = _FUENTE.get(ch, _FUENTE[" "]).split("|")
        for r in range(5):
            filas[r] += ("." if i else "") + g[r]
    filas.append("." * len(filas[0]))
    medio = {("#", "#"): "\u2588", ("#", "."): "\u2580", (".", "#"): "\u2584", (".", "."): " "}
    return ["".join(medio[(a, b)] for a, b in zip(filas[r], filas[r + 1])).rstrip() for r in (0, 2, 4)]


MAX_LINEAS_FICHERO = 400       # por fichero en la muestra (tramo)
PRESUPUESTO = 320_000          # bytes de muestra por proyecto
MIN_LINEAS = 25


def sh(*a, cwd=None):
    return subprocess.run(a, cwd=cwd, check=True, capture_output=True, text=True).stdout


def elegibles(raiz: Path):
    for rel in sh("git", "ls-files", cwd=raiz).splitlines():
        p = Path(rel)
        if p.suffix.lower() not in EXT or DIR_FUERA.search(rel) or NOMBRE_SENSIBLE.search(rel) \
           or MINIFICADO.search(rel):
            continue
        f = raiz / rel
        try:
            if not f.is_file() or f.stat().st_size > 1_500_000:
                continue
            txt = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        lineas = [l.replace("\t", "  ").rstrip() for l in txt.splitlines()]
        llenas = [l for l in lineas if l.strip()]
        if not llenas:
            continue
        if sum(len(l) for l in llenas) / len(llenas) > 220:   # minificado / generado
            continue
        yield rel, llenas, hashlib.sha1("\n".join(llenas).encode("utf-8", "replace")).hexdigest()


def proyecto(p: dict, tmp: Path) -> dict:
    dst = tmp / p["repo"].replace("/", "__")
    if not dst.exists():                           # un repo compartido se clona una vez
        sh("git", "clone", "-q", "--depth", "1", f"https://github.com/{p['repo']}.git", str(dst))
    commit = sh("git", "rev-parse", "--short", "HEAD", cwd=dst).strip()
    con_hash = list(elegibles(dst))
    p["_hashes"] = {h: len(l) for _, l, h in con_hash}
    ficheros = [(r, l) for r, l, _ in con_hash]
    total = sum(len(l) for _, l in ficheros)
    # muestra: orden estable pero variado (hash del nombre), ficheros con chicha
    candidatos = sorted((f for f in ficheros if len(f[1]) >= MIN_LINEAS),
                        key=lambda f: hashlib.sha1(f[0].encode()).hexdigest())
    muestra, usado, caidas = [], 0, 0
    for rel, llenas in candidatos:
        limpias = []
        for l in llenas:
            if SECRETO.search(l):
                caidas += 1
                continue
            limpias.append(l[:160])
        if len(limpias) < MIN_LINEAS:
            continue
        if len(limpias) > MAX_LINEAS_FICHERO:
            a = int(hashlib.sha1(rel.encode()).hexdigest(), 16) % (len(limpias) - MAX_LINEAS_FICHERO + 1)
            limpias = limpias[a:a + MAX_LINEAS_FICHERO]
        coste = sum(len(l) + 4 for l in limpias) + len(rel) + 40
        if usado + coste > PRESUPUESTO:
            continue
        muestra.append({"path": rel, "lines_total": len(llenas), "lines": limpias})
        usado += coste
    return {**p, "domain": "www." + p["project"], "commit": commit, "banner": rotulo(p["project"]),
            "files_total": len(ficheros), "lines_total": total,
            "sample_files": len(muestra), "sample_lines": sum(len(m["lines"]) for m in muestra),
            "lines_redacted": caidas, "files": muestra}


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "control/hackeo-corpus")
    out.mkdir(parents=True, exist_ok=True)
    ahora = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    idx = []
    # SIN DUPLICAR (Carlos, 07-10-2026): el Σ cuenta cada fichero idéntico UNA vez, en el
    # primer proyecto (por orden) que lo tiene. Así ni un repo compartido (clearchannel.tv =
    # admira.biz) ni un espejo (admira.store ← xpaceos) inflan el total.
    visto, repo_de = {}, {}
    with tempfile.TemporaryDirectory() as t:
        for p in PROYECTOS:
            d = proyecto(dict(p), Path(t))
            hashes = d.pop("_hashes")
            d["generated"] = ahora
            propios = {h: n for h, n in hashes.items() if h not in visto}
            comparte = {}
            for h, n in hashes.items():
                if h in visto:
                    comparte[visto[h]] = comparte.get(visto[h], 0) + n
            for h in propios:
                visto[h] = d["key"]
            d["files_unique"], d["lines_unique"] = len(propios), sum(propios.values())
            d["shares_repo_with"] = repo_de.get(d["repo"], "")
            repo_de.setdefault(d["repo"], d["project"])
            nombre = {q["key"]: q["project"] for q in PROYECTOS}
            d["shares_lines_with"] = {nombre[k]: v for k, v in sorted(comparte.items(), key=lambda kv: -kv[1])}
            (out / f"{p['key']}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            resumen = {k: d.get(k) for k in ("key", "project", "domain", "repo", "commit", "familia", "par",
                                             "files_total", "lines_total", "files_unique", "lines_unique",
                                             "shares_repo_with", "shares_lines_with", "sample_files", "sample_lines")}
            idx.append(resumen)
            print(f"  ✓ {d['project']:<16} {d['repo']:<30} {d['files_total']:>5} fich · {d['lines_total']:>7} lín"
                  f" · únicas {d['lines_unique']:>7}" + (f" · comparte repo con {d['shares_repo_with']}" if d['shares_repo_with'] else "")
                  + (" · comparte " + ", ".join(f"{k} {v}" for k, v in d["shares_lines_with"].items()) if d["shares_lines_with"] else ""))
    tot = {"generated": ahora, "projects": idx,
           "files_total_all": sum(p["files_unique"] for p in idx),
           "lines_total_all": sum(p["lines_unique"] for p in idx),
           "lines_total_bruto": sum(p["lines_total"] for p in idx)}
    (out / "index.json").write_text(json.dumps(tot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  ✓ AdmiraNeXT (sin duplicar): {tot['files_total_all']} ficheros · {tot['lines_total_all']} líneas"
          f" (sumando a lo bruto serían {tot['lines_total_bruto']})")


if __name__ == "__main__":
    main()
