# 2026-03-31 · Control público: pastillas, publicación y versión

AdmiraNext Team

## Trabajo realizado

- Detectado que `AdmiraNext Control` en local sí cargaba el gráfico `matrix-pills.jpg`, pero la versión pública de GitHub Pages no lo estaba publicando.
- Confirmado que el workflow de Pages copiaba `teamwork.html` pero no copiaba `matrix-pills.jpg` al `_site`.
- Añadida la copia de `public/matrix-pills.jpg` en `.github/workflows/pages.yml`.
- Subida la versión visible de `AdmiraNext Control` de `v2.1.9` a `v2.1.10`.
- Alineado también el footer para que no muestre una versión antigua distinta de la cabecera.
- Actualizados los parámetros de caché en `teamwork.html` para CSS, JS e imagen a `20260331-2`.
- Sincronizada la versión en `public/teamwork.html` y `docs/teamwork.html`.
- Incrementada la versión del paquete a `0.1.1`.

## Verificación esperada

- La URL pública de `AdmiraNext Control` debe mostrar el gráfico de las pastillas igual que en local.
- La versión visible en la cabecera debe leerse como `v2.1.10`.
- El recurso `matrix-pills.jpg` debe existir en la publicación final de GitHub Pages.

## Offboarding

- Cambio preparado con versión nueva y caché invalidada.
- Pendiente comprobar tras publicar que la URL pública y la local coinciden visualmente.
