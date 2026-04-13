# 2026-04-13 · Multi-LLM, body hotspots y refinamiento de hitboxes

AdmiraNext Consejo — SCUMM Interface v26.13.04.6

## Trabajo realizado

### Motor LLM multi-proveedor
- Se ha sustituido la zona de "Proyectos" por un selector de Motor LLM con 4 modelos disponibles.
- Modelos gratuitos via Groq API: Llama 3.3 70B, DeepSeek R1, Gemma 2 9B. Modelo de pago: Claude Sonnet 4 via Anthropic API.
- Por defecto se selecciona un modelo gratuito (Llama 3.3 70B) para evitar consumo accidental de creditos.
- Los modelos de pago requieren password de administrador ("admira2026") antes de activarse.
- El backend (`council-api.py` v4.0) enruta las peticiones al proveedor correcto segun el modelo seleccionado.
- El tracking de presupuesto registra coste 0 para modelos gratuitos y coste real para Claude.
- Los informes de Telegram incluyen el nombre del modelo LLM y la etiqueta FREE/coste.
- Nuevo endpoint `/api/council/models` lista los modelos disponibles.

### Seleccion de consejeros por cuerpo
- Se pueden seleccionar consejeros haciendo clic sobre su silueta corporal en la imagen, no solo por el nameplate.
- Cada personaje tiene un body hotspot con glow azul al hover y glow verde al seleccionar.
- Los hotspots usan `border-radius` redondeado en la parte superior para forma organica (cabeza + torso).
- La seleccion por body y por nameplate esta sincronizada: clicar en cualquiera selecciona ambos.

### Refinamiento iterativo de hitboxes (5 iteraciones)
- Se han ajustado las dimensiones de los 8 body hotspots en 5 iteraciones sucesivas.
- El objetivo: cubrir solo la silueta del personaje (cabeza + pecho) sin coger la mesa ni los documentos.
- Valores finales: heights entre 17% (extremos) y 26% (centrales), widths entre 7-9%.
- Los hitboxes aplican identicamente a ambas generaciones (Leyendas y Coetaneos).

### Otros cambios
- El numero de version enlaza al video de Steve Jobs en YouTube.
- Se ha configurado la Groq API key en `.env` para acceso a modelos gratuitos.
- Workflow de deploy dual: editar `public/council-scumm.html`, copiar a raiz, commit y push.

## Estado actual

- La interfaz SCUMM permite seleccionar accion, consejero (por nameplate o cuerpo) y modelo LLM antes de lanzar una pregunta.
- Los 4 modelos LLM funcionan correctamente. Tim Cook respondio con exito via Llama 3.3 70B con coste 0.
- Los body hotspots cubren solo la silueta de cada personaje sin solapar mesa ni personajes adyacentes.
- El servidor API corre en puerto 8420 con soporte Anthropic + Groq.
- Version desplegada en GitHub Pages: v26.13.04.6.
