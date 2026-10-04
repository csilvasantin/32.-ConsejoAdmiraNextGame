/**
 * /api/recorte — siluetas manuales de los consejeros (editor /recorte, modo Experto).
 *
 * GET  → { polys: { <gen>: { <persona>: [[x,y],...] } }, updatedAt }
 * PUT  → { gen, persona, points:[[x,y],...] | null }  (null = volver a la silueta automática)
 *
 * Coordenadas normalizadas 0..1 sobre el arte de la sala, así escalan con la imagen.
 * Persisten en KV (binding RECORTE_KV del proyecto Pages admira-live); sin KV la sala
 * sigue usando las siluetas automáticas de assets/council-silhouettes.js.
 * Cada guardado deja una copia con fecha (30 días) para poder volver atrás.
 */
const KEY = "recorte:v1";
const GENS = new Set(["leyendas", "coetaneos"]);
const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);

function headers(origin) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    vary: "Origin",
  };
  if (origin && (ALLOW.has(origin) || /^https:\/\/[a-z0-9-]+\.admira-live\.pages\.dev$/.test(origin))) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });

async function load(env) {
  const raw = await env.RECORTE_KV.get(KEY);
  try { const d = raw ? JSON.parse(raw) : null; if (d && d.polys) return d; } catch (e) {}
  return { polys: {}, updatedAt: null };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!env.RECORTE_KV) return json({ polys: {}, updatedAt: null, storage: "none" }, 200, origin);
  return json(await load(env), 200, origin);
}

export async function onRequestPut({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!env.RECORTE_KV) return json({ error: "sin almacenamiento" }, 503, origin);
  // Solo desde la propia web (el editor vive tras la verja de acceso).
  const self = new URL(request.url).origin;
  if (origin && origin !== self && !headers(origin)["access-control-allow-origin"]) return json({ error: "origen no permitido" }, 403, origin);
  if (!origin && !(request.headers.get("Referer") || "").startsWith(self)) return json({ error: "origen no permitido" }, 403, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "json inválido" }, 400, origin); }
  const gen = String(body && body.gen || "");
  const persona = String(body && body.persona || "").trim();
  if (!GENS.has(gen)) return json({ error: "gen inválida" }, 400, origin);
  if (!persona || persona.length > 60 || /[<>"&]/.test(persona)) return json({ error: "persona inválida" }, 400, origin);
  let points = body.points;
  if (points !== null) {
    if (!Array.isArray(points) || points.length < 3 || points.length > 300) return json({ error: "entre 3 y 300 puntos" }, 400, origin);
    points = points.map(p => [Number(p && p[0]), Number(p && p[1])]);
    if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1))
      return json({ error: "puntos fuera de 0..1" }, 400, origin);
    points = points.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
  }
  const doc = await load(env);
  const prev = JSON.stringify(doc);
  doc.polys[gen] = doc.polys[gen] || {};
  if (points === null) delete doc.polys[gen][persona]; else doc.polys[gen][persona] = points;
  doc.updatedAt = new Date().toISOString();
  await env.RECORTE_KV.put("recorte:hist:" + doc.updatedAt, prev, { expirationTtl: 60 * 60 * 24 * 30 });
  await env.RECORTE_KV.put(KEY, JSON.stringify(doc));
  return json(doc, 200, origin);
}
