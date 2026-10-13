/**
 * GET /api/visor/etiqueta — línea de escritorio del mosaico (#5824).
 * Solo máquina detectada en vivo y foco. Sin terminal, sin misión, sin llave:
 * el /visor/ completo sigue cerrado. Sirve para ver el recuadro en un preview.
 */
import { vista, lineaEscritorio } from "../../../visor-lib.mjs";
import { vivosPorAgente, PRESENCIA_URL } from "../../../interface-seleccion.mjs";

const HEAD = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };

export async function onRequestGet() {
  const ahora = Date.now();
  let vivos = [];
  try {
    const r = await fetch(PRESENCIA_URL, { headers: { "user-agent": "admira.live/visor-etiqueta" } });
    const d = await r.json();
    const ahoraS = Number(d && d.now) ? (Number(d.now) > 4102444800 ? Number(d.now) / 1000 : Number(d.now)) : ahora / 1000;
    vivos = vivosPorAgente(Array.isArray(d && d.presence) ? d.presence : [], ahoraS);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "sin presencia" }), { status: 502, headers: HEAD });
  }
  const fichas = vista([], ahora, { grupo: 6, vivos }).fichas.filter((f) => f.modo === "edge").map((f) => ({
    sesion: f.sesion,
    equipoDeclarado: f.equipoDeclarado || null,
    foco: f.foco || "",
    estado: f.estado,
    linea: lineaEscritorio(f),
    sinDatos: f.sinDatos || null,
  }));
  return new Response(JSON.stringify({ ok: true, fichas, generado: new Date(ahora).toISOString() }), { headers: HEAD });
}
