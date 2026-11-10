/*
 * SEGURIDAD (09-11-2026, auditoría PortAventuraNeXT, OK Carlos). Estos ficheros ya no salen en el
 * despliegue (deploy.sh), pero la caché del borde seguía entregando la copia vieja de las URL exactas
 * durante días (s-maxage=604800). Una Function se ejecuta antes que esa caché: 404 sin contenido.
 */
export const noPublicar = () => new Response('No encontrado\n', {
  status: 404,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
});
