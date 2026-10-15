#!/usr/bin/env python3
"""sello-siguiente.py <publicado> <repo> — el sello de la próxima publicación de admira.live.

EL SELLO SE GENERA, NO SE TECLEA (MorfeoMacMini, 15-10-2026). deploy.sh copiaba el sello del
<meta admiranext-version> de control/index.html; si nadie lo subía a mano, producción volvía a
anunciar la publicación anterior (el 15-10 a las 08:20 salió «v.14.10.2026.r48.08:15», la r48
del día antes, con contenido nuevo y las novedades de la víspera). Ahora:

  · fecha y hora: las de Madrid en el momento de publicar (v.DD.MM.AAAA.rN.HH:MM);
  · número: global, no diario (r37 el 11-10, r48 el 14-10). Es el siguiente al publicado en
    www.admira.live/version.json, salvo que el repo traiga uno mayor (alguien selló a mano
    esta publicación): entonces se respeta el del repo;
  · sin sello publicado legible (red caída): el siguiente al del repo, avisando por stderr.

Imprime «<sello> <clave-novedades>»: la clave es el sello del repo si es nuevo (sus novedades
son de esta publicación) o «-» si es viejo (no se repiten las de la anterior).
ADMIRA_SELLO_AHORA=AAAA-MM-DDTHH:MM fija el reloj (pruebas).
"""
import os, re, sys
from datetime import datetime
from zoneinfo import ZoneInfo

RX = re.compile(r"^v\.(\d{2})\.(\d{2})\.(\d{4})\.r(\d+)\.(\d{2}):(\d{2})$")


def numero(sello):
    m = RX.match(str(sello or "").strip())
    return int(m.group(4)) if m else None


def siguiente(publicado, repo, ahora):
    n_repo, n_pub = numero(repo), numero(publicado)
    if n_repo is None:
        raise ValueError("sello del repo no válido: %r" % repo)
    if n_pub is None:
        print("  ⚠ no pude leer el sello publicado; numero a partir del repo (%s)" % repo, file=sys.stderr)
        n = n_repo + 1
    else:
        n = max(n_pub + 1, n_repo)
    fresco = n_pub is not None and n_repo > n_pub
    return "v.%s.r%d.%s" % (ahora.strftime("%d.%m.%Y"), n, ahora.strftime("%H:%M")), (repo if fresco else "-")


def main(argv):
    if len(argv) != 3:
        print("uso: sello-siguiente.py <publicado> <repo>", file=sys.stderr)
        return 2
    fijo = os.environ.get("ADMIRA_SELLO_AHORA", "").strip()
    ahora = datetime.strptime(fijo, "%Y-%m-%dT%H:%M") if fijo else datetime.now(ZoneInfo("Europe/Madrid"))
    try:
        sello, clave = siguiente(argv[1], argv[2], ahora)
    except ValueError as e:
        print("✗ %s" % e, file=sys.stderr)
        return 1
    print(sello, clave)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
