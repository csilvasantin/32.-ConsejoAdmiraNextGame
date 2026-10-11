/**
 * /api/visor/llave — llaves del visor /visor/ (r27). Solo con token de máquina (X-Council-Token / Bearer).
 * POST { accion: "nueva", nombre? } → { ok, llave }  (la llave se devuelve UNA vez; en KV solo queda su SHA-256)
 * POST { accion: "revocar" }         → { ok, revocadas }  (todas fuera al momento: el enlace deja de funcionar)
 * POST { accion: "listar" }          → { ok, llaves:[{nombre, creada, pista}] }
 */
import { autorizado } from "../consumos/lecturas.js";
import { sha256, llaveNueva, KEY_LLAVES } from "../../../visor-lib.mjs";

const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" } });
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

export async function onRequestPost({ request, env }) {
  const auth = autorizado(request, env);
  if (auth === null) return json({ ok: false, error: "cerrado: falta token de máquina" }, 503);
  if (!auth) return json({ ok: false, error: "no autorizado" }, 401);
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin almacén KV" }, 503);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  let doc = null;
  try { const r = await store.get(KEY_LLAVES); doc = r ? JSON.parse(r) : null; } catch (e) {}
  const llaves = doc && Array.isArray(doc.llaves) ? doc.llaves : [];
  const accion = String(body.accion || "");
  if (accion === "nueva") {
    const llave = llaveNueva();
    const nueva = { hash: await sha256(llave), nombre: String(body.nombre || "visor").slice(0, 40), creada: new Date().toISOString(), pista: llave.slice(0, 4) };
    await store.put(KEY_LLAVES, JSON.stringify({ llaves: [...llaves, nueva].slice(-5) }));
    return json({ ok: true, llave, nombre: nueva.nombre });
  }
  if (accion === "revocar") {
    await store.put(KEY_LLAVES, JSON.stringify({ llaves: [] }));
    return json({ ok: true, revocadas: llaves.length });
  }
  if (accion === "listar") return json({ ok: true, llaves: llaves.map(({ nombre, creada, pista }) => ({ nombre, creada, pista })) });
  return json({ ok: false, error: "accion: nueva | revocar | listar" }, 400);
}
