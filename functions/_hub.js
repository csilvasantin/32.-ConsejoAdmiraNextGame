// Guardia del Mac Mini (2026-11-20): el Funnel solo atiende peticiones que traen
// X-Admira-Hub. La clave vive como secreto HUB_GUARDIA (Pages / worker), nunca en el código.
export const MINI = "https://macmini.tail48b61c.ts.net";
export function conHub(env, headers = {}) {
  const k = env && env.HUB_GUARDIA;
  return k ? Object.assign({}, headers, { "x-admira-hub": k }) : headers;
}
