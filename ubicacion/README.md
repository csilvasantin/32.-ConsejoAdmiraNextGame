# admira.live/ubicacion · invitados en vivo

Carlos, 18-09-2026 · FLT-100564 (mapa + badge web), FLT-100567 (historial), FLT-100568 (iOS/Android y etiquetas).

## Qué hay

- **/ubicacion/** — mapa de operador (tras la verja de Google): pines en vivo, recorridos, lista, «Invitar» (enlace + QR por invitado).
- **/ubicacion/invitado** — badge web del invitado (sin verja): comparte la posición del móvil cada 4 s mientras la página está abierta.
- **API** (api.yokup.com, worker yokup-rtc): `POST /ubicacion/report`, `GET /ubicacion/live?evento=`, `GET /ubicacion/historial?evento=&invitado=&desde=&hasta=`. Vivo = 90 s; historial muestreado (≥ 8 m o ≥ 30 s) y purgado a los 30 días.

## iPhone y Android

Funciona en Safari (iOS) y Chrome (Android) sin instalar nada: geolocalización del navegador en alta precisión. Con «Añadir a pantalla de inicio» queda a pantalla completa como una app (manifiesto PWA + metas de iOS).

**Límite real, común a iPhone y Android:** una web no puede ubicar en segundo plano. Si el invitado bloquea el móvil o cambia de app, deja de reportar y desaparece del mapa a los 90 s. Para ubicación en segundo plano hace falta una **app nativa** (iOS: permiso «Siempre» + Background Location; Android: servicio en primer plano). La página lo dice al invitado y mantiene la pantalla despierta cuando el navegador lo permite (Safari ≥ 16.4, Chrome).

## MiTag Duo y AirTag: la verdad técnica

Las dos etiquetas trabajan con las redes **Apple Find My** y **Google Find Hub**. Por diseño de Apple y de Google:

1. **No hay API de terceros.** La posición de una etiqueta solo la ve la app Find My / Find Hub de la cuenta a la que está emparejada. Ninguna web ni app de Admira puede leerla.
2. **No es tiempo real.** La etiqueta no tiene GPS ni red: la localizan de rebote los iPhone/Android de desconocidos que pasan cerca. En un recinto con poca gente ajena, la posición puede tardar minutos u horas en refrescarse.
3. **Su Bluetooth rota el identificador** cada pocos minutos (antirrastreo). Un lector propio detecta «hay una etiqueta Find My cerca», pero no puede saber de forma fiable **cuál** es. Con AirTag es imposible por diseño; con MiTag Duo en modo Find My / Find Hub, igual.

Lo que **sí** aportan: badge físico VIP, y que el propio invitado recupere el badge si lo pierde. Si el **evento** es dueño de las etiquetas (todas emparejadas a un Apple ID o una cuenta Google de Admira), el equipo ve todos los badges en la app Find My / Find Hub, con las tres limitaciones anteriores: no en nuestro mapa, no en tiempo real, y con tope de 32 accesorios por Apple ID.

## DECISIÓN (Carlos, 18-09-2026): balizas de identificador fijo

Comprobado empíricamente con la MiTag Duo real (lector BLE desde el MacMini): emparejada a Google
Find Hub emite un EID que **rota** (`36c4369f…` → `ae4418db…` en minutos), diseño antirrastreo de
Google. Ni el MiTag ni el AirTag pueden ser el identificador del badge en nuestro mapa. **Se tira por
balizas iBeacon/Eddystone de UUID fijo** dentro del badge + lectores propios por zona. El lector→mapa
está probado en vivo (mete balizas reales en el mapa). Material y lector de referencia en
[`ubicacion/lector/`](lector/README.md).

## Si se quiere ubicar por badge SIN móvil (decisión de Carlos)

La única vía que funciona en tiempo real y en nuestro mapa es un **RTLS propio**: balizas BLE con identificador estable (iBeacon/Eddystone, ~5–10 € la unidad, meses de batería) en el badge, y **lectores propios** repartidos por el recinto (ESP32 ~8 € o Raspberry Pi, o un móvil Android como lector) que reportan a la misma API la señal de cada baliza. Da posición por **zona** (sala, stand, pasillo) con precisión de metros, no de centímetros. El backend y el mapa actuales lo admiten sin cambios de contrato: un lector reporta por `/ubicacion/report` igual que el móvil. Coste: hardware + una tarde de montaje y calibración por recinto.

| Fuente | iOS | Android | Tiempo real | En nuestro mapa | Sin móvil |
|---|---|---|---|---|---|
| Móvil del invitado (hecho) | ✅ | ✅ | ✅ (4 s) | ✅ | ❌ |
| AirTag / MiTag en Find My · Find Hub | app de Apple | app de Google | ❌ | ❌ | ✅ |
| Balizas BLE propias + lectores (propuesta) | ✅ | ✅ | ✅ | ✅ | ✅ |

## Privacidad

Solo viajan `{evento, invitado, nombre, vip, lat, lng, acc}`. La lectura es pública para quien conozca el slug del evento (úsese uno no adivinable); v2: exigir sesión. El invitado comparte solo mientras la página está abierta y se le dice.
