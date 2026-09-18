# Lector de balizas → mapa admira.live/ubicacion

Convierte una **baliza BLE de identificador fijo** (dentro del badge VIP) en un pin de nuestro mapa.
Escanea, y por cada baliza que ve la sube a `POST https://api.yokup.com/ubicacion/report` con la
**posición del lector** y una distancia estimada por señal (RSSI). Un lector por zona (sala, stand).

## Por qué baliza fija y no el MiTag/AirTag

Medido el 18-09-2026 desde el MacMini con `lector-mac.swift`: el MiTag Duo emparejado a **Google
Find Hub** emite tramas FMDN (`0xFEAA` frame `0x40`, un **EID efímero**) y **rota el identificador**:
se vio primero como `36c4369f…` y minutos después como `ae4418db…`. Es el diseño antirrastreo de
Google (y de Apple con AirTag): un tercero no puede resolver el EID a una identidad estable sin la
clave privada de la cuenta dueña. Por eso el MiTag/AirTag **no** puede ser el identificador del badge
en nuestro mapa. Una baliza iBeacon/Eddystone con **UUID fijo** sí: emite siempre el mismo id.

## Material (por recinto)

| Pieza | Qué comprar | Precio aprox. | Notas |
|---|---|---|---|
| Baliza del badge | iBeacon/Eddystone con UUID configurable y pila de botón (BlueCharm BC021, Feasycom, MOKO, KKM K6) | 5–12 € / ud | Meses de batería. Formato pegatina o tarjeta para meter en el badge. Se fija su UUID/major/minor con la app del fabricante. |
| Lector por zona | ESP32 (~6–10 €) o un Android viejo o una Raspberry Pi | 6–35 € / ud | Siempre enchufado. Uno por sala/stand. Reporta con las coordenadas fijas de esa zona. |
| Coste típico evento | 1 baliza por VIP + 1 lector por zona | — | Posición por **zona** (metros). Para posición fina: 3+ lectores por zona y trilateración por RSSI (fase 2). |

## Cómo se usa el lector de referencia (macOS, para pruebas)

```sh
# 1) nombres.json: mapea el UUID/id de cada baliza a un invitado
#    { "IDCORTO": { "invitado": "carlos-vip", "nombre": "Carlos", "vip": true } }
# 2) arrancar el lector: evento, lat, lng (0 0 = autoubicación por Wi-Fi), segundos, nombres.json
BLESCAN_OUT=/tmp/lector.txt open lector.app --args lector xperience-2026 41.39 2.16 3600 nombres.json
```

En producción el lector NO es el Mac: es un ESP32 o un Android con la misma lógica (escanear iBeacon
por UUID → `POST /ubicacion/report` con {evento, invitado=UUID mapeado, nombre, vip, lat/lng del
lector, acc≈distancia}). El mapa y la API no cambian: el lector reporta por la misma vía que el móvil
del invitado. Firmware ESP32 y app Android: pendientes de la fase de montaje.

## Estado

- Reference reader (macOS Swift) hecho y probado: mete balizas reales en el mapa (evidencia FLT-100579).
- Firmware ESP32 / app Android lectora: por hacer cuando se compre el hardware.
