/**
 * GET /api/win95/emision — inventario saneado de piezas públicas de
 * admira.tv para el player virtual-win95 (hashtags #win95 y #genero95).
 * No es un proxy abierto: pantalla y tags van fijos, y solo se devuelven
 * campos públicos (título, tipo, duración, URL https de hosts Admira).
 * Sin secretos. /api/* no pasa por la verja HTML, así que aquí se exige
 * cookie de la puerta o sesión de Google del visitante. 401 si no hay sesión.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";

const SCREEN = "virtual-win95";
const TAGS = ["win95", "genero95"];
const UPSTREAM = "https://admira.tv/api/emision";
const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: CABECERAS });
}

function hostOk(hostname) {
  const h = String(hostname || "");
  return (
    h === "api.admira.store" ||
    h === "admira.store" ||
    h === "admira.tv" ||
    h === "www.admira.tv" ||
    h === "admira.studio" ||
    h === "www.admira.studio" ||
    /\.admira\.(store|tv|studio)$/.test(h)
  );
}

function urlPublica(u) {
  if (typeof u !== "string" || !u) return "";
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return "";
    if (!hostOk(x.hostname)) return "";
    return x.toString();
  } catch {
    return "";
  }
}

function piezaPublica(p) {
  if (!p || typeof p !== "object") return null;
  const url = urlPublica(p.url);
  if (!url) return null;
  const tipo = String(p.tipo || p.medio || "").slice(0, 40);
  if (tipo && !/^(video|imagen|image|html|url|audio)$/i.test(tipo)) {
    // Se admite igualmente: el player solo reproduce si el recurso abre.
  }
  return {
    id: String(p.id || p.stockId || "").slice(0, 80),
    titulo: String(p.titulo || "").slice(0, 200),
    tipo: tipo || "video",
    duracion: Number(p.duracion) > 0 ? Number(p.duracion) : 0,
    url,
  };
}

async function autorizado(request, env) {
  const d = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (d) return true;
  return !!(await emailGoogle(request, env));
}

async function leerTag(tag, fetchImpl) {
  const u = `${UPSTREAM}?screen=${encodeURIComponent(SCREEN)}&tag=${encodeURIComponent(tag)}`;
  const r = await fetchImpl(u, {
    headers: { accept: "application/json", "user-agent": "admira.live-win95" },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return { tag, total: 0, piezas: [], aviso: `admira.tv ${r.status}` };
  const d = await r.json();
  const raw = Array.isArray(d && d.piezas) ? d.piezas : [];
  const piezas = raw.map(piezaPublica).filter(Boolean).slice(0, 50);
  const avisos = Array.isArray(d && d.avisos) ? d.avisos : [];
  const aviso = avisos.map((a) => (a && (a.es || a.en)) || "").filter(Boolean)[0] || "";
  return { tag, total: piezas.length, piezas, aviso: aviso.slice(0, 240) };
}

export async function onRequestGet({ request, env, fetch: fetchImpl }) {
  if (!(await autorizado(request, env))) return json({ ok: false, error: "sesion" }, 401);
  const f = fetchImpl || fetch;
  try {
    const tags = await Promise.all(TAGS.map((t) => leerTag(t, f)));
    return json({ ok: true, screen: SCREEN, tags, at: new Date().toISOString() });
  } catch (e) {
    const name = e && e.name ? e.name : "error";
    return json({ ok: false, error: "admira.tv no contesta (" + name + ")" }, 502);
  }
}
