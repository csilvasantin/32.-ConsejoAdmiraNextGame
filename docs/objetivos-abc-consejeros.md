# Escritura nocturna de a, b y c en el globo de Carlos

Cada noche a las 00:00 Europe/Madrid, el titular de cada proyecto escribe
tres mejoras (a, b y c) en el carrusel del hover de Carlos Silva (figura Y-3
de la mesa de leyendas).

## Paneles (nombres e ids exactos)

| Orden | id | Nombre en el globo | Titular |
|------:|----|--------------------|---------|
| 1 | `portaventura-next` | PortAventuraNeXT | Walt (Disney) |
| 2 | `admiranext` | AdmiraNeXT | Lucas |
| 3 | `alsea` | Alsea | Woz |
| 4 | `dia-a-dia` | Día a día | Jobs |

El carrusel admite el 4.º panel; las flechas ◀ ▶ recorren los cuatro en círculo.

## Vía de escritura

- **URL:** `POST https://www.admira.live/api/consejo/objetivos-abc`
- **Auth:** cabecera `X-Council-Token` o `Authorization: Bearer`, con el mismo
  secreto que ya usa el Consejo para escribir (`CONSUMOS_LECTURAS_TOKEN` o
  `COUNCIL_MACHINE_TOKEN`; en la bóveda, `TOKEN_CONSEJO_SILICIO`). Es la clave
  MCP / de máquina que ya se usa en `/api/consejo/foco`. No hay un tool
  específico en el conector admira-live; este POST es la vía sencilla.
- **Lectura** (el globo, sin token): `GET https://www.admira.live/api/consejo/objetivos-abc`
  (`cache: no-store`).

### JSON de un titular (Jobs, Lucas, Walt o Woz)

El campo `autor` identifica quién escribe. Solo puede tocar **su** proyecto.
Si omite `id`, se usa el panel que le corresponde.

```json
{
  "autor": "walt",
  "id": "portaventura-next",
  "objetivos": {
    "a": "Primera mejora del día",
    "b": "Segunda mejora",
    "c": "Tercera mejora"
  }
}
```

Alias de `autor`: `jobs` / `Steve Jobs`; `lucas` / `George Lucas`;
`walt` / `disney` / `Walt Disney`; `woz` / `wozniak` / `Steve Wozniak`.

Ejemplos por consejero:

- Walt: `"autor": "walt"` (alias `disney`), `"id": "portaventura-next"`
- Lucas: `"autor": "lucas", "id": "admiranext"`
- Woz: `"autor": "woz"` (alias `wozniak`), `"id": "alsea"`
- Jobs: `"autor": "jobs", "id": "dia-a-dia"`

La respuesta incluye `escritos`, `conservados`, `conflictos` y `rechazados`.
Cada hueco queda firmado con `firmas.{a|b|c} = { autor, actualizado }`
(epoch ms). El globo lo muestra en pequeño, en hora Europe/Madrid.

### Carlos, desde la pestaña Objetivos

El editor de `/objetivos` (bloque «Proyectos de Carlos · a, b y c») envía
`{ "autor": "carlos", "proyectos": [ ... ] }` con el mismo token. Carlos
puede cambiar textos, orden y paneles cuando quiera.

## Conflictos si el titular escribe después de Carlos

- Si un hueco está vacío o lo firmó el propio titular, la escritura nocturna
  entra y se actualiza autor y hora.
- Si el hueco lo firmó **Carlos** y el texto nuevo sería distinto, **se
  conserva el de Carlos**. El POST sigue siendo 200; ese hueco sale en
  `conflictos` y `conservados`. Los demás huecos del mismo proyecto sí se
  escriben.
- Un titular que apunta al proyecto de otro aparece en `rechazados`
  (`no es su proyecto`) y no se modifica nada de ese panel.
- Escape documentado: `"forzar": true` en el mismo POST sí pisa el texto de
  Carlos. No lo use el cron de las 00:00; solo un arreglo explícito.

El almacén es KV (`CONSUMOS_KV` o `RECORTE_KV`, clave
`consejo:objetivos-abc:v1`). No se inventan textos: un hueco vacío se pinta
«— sin definir —».
