#!/usr/bin/env python3
"""Corpus del HACKEO · modo CÓDIGO (Carlos, 07-10-2026).

Cada panel del HACKEO teclea código REAL de un proyecto AdmiraNeXT. Este script
clona (superficial) los repos públicos de los 5 proyectos y escribe, en el
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

PROYECTOS = [  # orden = orden de asignación a los paneles (1º ordenador → studio…)
    {"key": "studio", "project": "admira.studio", "repo": "csilvasantin/admira-studio"},
    {"key": "store",  "project": "admira.store",  "repo": "csilvasantin/admira-store"},
    {"key": "tv",     "project": "admira.tv",     "repo": "csilvasantin/admira-tv"},
    {"key": "app",    "project": "admira.app",    "repo": "csilvasantin/admira-app"},
    # admira.biz se sirve desde el proyecto Pages clearchannel-tv (multi-dominio)
    {"key": "biz",    "project": "admira.biz",    "repo": "csilvasantin/clearchannel-tv"},
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
        yield rel, llenas


def proyecto(p: dict, tmp: Path) -> dict:
    dst = tmp / p["key"]
    sh("git", "clone", "-q", "--depth", "1", f"https://github.com/{p['repo']}.git", str(dst))
    commit = sh("git", "rev-parse", "--short", "HEAD", cwd=dst).strip()
    ficheros = list(elegibles(dst))
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
    return {**p, "domain": "www." + p["project"], "commit": commit,
            "files_total": len(ficheros), "lines_total": total,
            "sample_files": len(muestra), "sample_lines": sum(len(m["lines"]) for m in muestra),
            "lines_redacted": caidas, "files": muestra}


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "control/hackeo-corpus")
    out.mkdir(parents=True, exist_ok=True)
    ahora = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    idx = []
    with tempfile.TemporaryDirectory() as t:
        for p in PROYECTOS:
            d = proyecto(p, Path(t))
            d["generated"] = ahora
            (out / f"{p['key']}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            resumen = {k: d[k] for k in ("key", "project", "domain", "repo", "commit", "files_total",
                                         "lines_total", "sample_files", "sample_lines")}
            idx.append(resumen)
            print(f"  ✓ {d['project']:<14} {d['repo']:<32} {d['files_total']:>5} ficheros · "
                  f"{d['lines_total']:>8} líneas · muestra {d['sample_files']} ficheros "
                  f"({d['lines_redacted']} líneas sensibles fuera)")
    tot = {"generated": ahora, "projects": idx,
           "files_total_all": sum(p["files_total"] for p in idx),
           "lines_total_all": sum(p["lines_total"] for p in idx)}
    (out / "index.json").write_text(json.dumps(tot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  ✓ AdmiraNeXT: {tot['files_total_all']} ficheros · {tot['lines_total_all']} líneas")


if __name__ == "__main__":
    main()
