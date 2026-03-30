# Diario - 2026-03-30

## Proyecto

AdmiraNext Team

## Trabajo realizado

- Se ha corregido la inconsistencia del estado `idle` para que datos, UI y API acepten el mismo conjunto de estados.
- Se ha creado una nueva pagina de alta autoservicio en `public/new-member.html`.
- El formulario recoge persona, maquina, acceso tecnico y checklist de onboarding en una sola ficha.
- La pagina guarda borrador local, genera vista previa en tiempo real y permite copiar un resumen o descargar la ficha en JSON.
- En modo servidor local, la ficha se registra directamente en `data/machines.json` mediante `POST /api/machines`.
- En GitHub Pages, el formulario funciona en modo exportacion para que el nuevo fichaje pueda rellenarlo sin depender del panel editable.
- La portada y el panel de control enlazan ya a la nueva entrada de alta.
- Se ha actualizado el despliegue de GitHub Pages para publicar la nueva pagina y su script.

## Estado actual

- Alta local prevista en `http://127.0.0.1:3030/new-member.html`.
- Alta publica prevista en `https://csilvasantin.github.io/AdmiraNext-Team/new-member.html`.
- El sistema ya permite incorporar una nueva maquina con menos friccion y sin carga manual inicial.
- Se ha añadido una URL guiada especifica para el lado creativo del consejo cuando el nuevo MacBook Air llega completamente limpio, sin Tailscale, GitHub ni bots instalados.
- La URL guiada incluye ya un bloque de 10 pasos con foco en permisos de macOS, Tailscale, GitHub CLI, onboarding y validacion final.
- La misma URL genera ahora un script `.command` de arranque express para automatizar Homebrew, `gh`, Python, Tailscale, clon de `onboarding` y lanzamiento del setup de bots con las pausas manuales justas.
- El arranque express instala tambien Google Chrome y lo fija como navegador por defecto para unificar el flujo operativo desde el primer uso.
- Se ha dado de alta una entrada provisional para `MacBook Air creativo`, en estado `maintenance`, con checklist vacia y foco en primer arranque para poder seguir el onboarding desde el panel.
