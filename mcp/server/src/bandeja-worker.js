/* Worker que solo aloja el Durable Object de la bandeja (ver bandeja-do.js).
 * No tiene rutas públicas: admira-live-mcp le habla por el binding BANDEJA. */
export { BandejaConsejo } from './bandeja-do.js';
export default { fetch: () => new Response('admira-live-bandeja: sin rutas públicas', { status: 404 }) };
