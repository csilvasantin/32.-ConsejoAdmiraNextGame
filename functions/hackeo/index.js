/*
 * /hackeo — ruta propia y estable del control HACKEO para demos (Carlos, 19-11-2026).
 * Redirige a /control/?hackeo=1: misma página y mismo login de Google (auth-gate.js) que
 * FleetControl, así que no expone nada sin sesión. Abre el panel con 🕶️ HACKEO resaltado;
 * el hackeo no arranca solo, se lanza con un clic. Conserva los parámetros que lleguen.
 */
export function onRequest({ request }) {
  const de = new URL(request.url);
  const a = new URL("/control/", de.origin);
  de.searchParams.forEach((v, k) => a.searchParams.append(k, v));
  if (!a.searchParams.has("hackeo")) a.searchParams.set("hackeo", "1");
  return new Response(null, { status: 302, headers: { location: a.pathname + a.search, "cache-control": "no-store" } });
}
