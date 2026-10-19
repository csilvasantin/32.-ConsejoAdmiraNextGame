import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("./equipos.js");
const E = globalThis.AdmiraEquipos;
const { onRequestGet, onRequestPost, aplicarAccion, KEY } = await import("../functions/api/control/equipos.js");

const AHORA = 1792398077; // 19-10-2026 10:21 CEST
// Censo real de admira-fleet (19-10-2026), recortado.
const CENSO = [
  { id: "admira-macmini", name: "Mac Mini (Carlos)", fqdn: "macmini.tail48b61c.ts.net", lastSeen: 1792397966 },
  { id: "admira-macstudio", name: "Mac Studio", fqdn: "", lastSeen: 1792398077 },
  { id: "admira-macstudiodecarlos", name: "Mac\u00a0Studio de Carlos", fqdn: "", lastSeen: 1792322508 },
  { id: "admira-macbookpro16", name: "MacBook Pro 16", fqdn: "macbook-pro-16.tail48b61c.ts.net", lastSeen: 1792397975 },
];

test("«Mac Studio de Carlos» se funde en «Mac Studio»: una sola ficha", () => {
  const r = E.depurar(CENSO, E.estadoVacio(), () => 0, AHORA * 1000);
  const ids = r.visibles.map((m) => m.id);
  assert.deepEqual(ids, ["admira-macmini", "admira-macstudio", "admira-macbookpro16"]);
  const ms = r.visibles.find((m) => m.id === "admira-macstudio");
  assert.deepEqual(ms.aliasDe, ["Mac\u00a0Studio de Carlos"]);
  assert.equal(r.fusionados[0].en, "admira-macstudio");
  // no muta el censo de entrada
  assert.equal(CENSO[1].aliasDe, undefined);
});

test("si el canónico no está en el censo, el alias NO desaparece (no se pierde un equipo)", () => {
  const r = E.depurar([CENSO[2]], E.estadoVacio(), () => 0, AHORA * 1000);
  assert.equal(r.visibles.length, 1);
});

test("eliminar oculta de forma persistente y una reconstrucción desde admira-fleet no lo resucita", () => {
  const m = CENSO[0];
  const ent = E.entradaOcultar(m, m.lastSeen, "csilva", AHORA * 1000);
  assert.equal(ent.vivo, true);
  const estado = E.aplicar(E.estadoVacio(), "ocultar", ent);
  const r = E.depurar(CENSO, estado, () => 0, AHORA * 1000);
  assert.ok(!r.visibles.some((x) => x.id === m.id));
  assert.equal(r.ocultos[0].id, m.id);
});

test("eliminado estando CALLADO + latido real posterior → reaparece marcado", () => {
  const viejo = { id: "admira-macbookairazul", name: "MacBookAirAzul", lastSeen: 1791380885 };
  const ent = E.entradaOcultar(viejo, viejo.lastSeen, "", AHORA * 1000);
  assert.equal(ent.vivo, false);
  const estado = E.aplicar(E.estadoVacio(), "ocultar", ent);
  // reconstrucción con el mismo lastSeen viejo: sigue oculto
  assert.equal(E.depurar([viejo], estado, () => 0, (AHORA + 3600) * 1000).visibles.length, 0);
  // vuelve a latir (presencia) una hora después
  const r = E.depurar([viejo], estado, () => AHORA + 3600, (AHORA + 3600) * 1000);
  assert.equal(r.visibles.length, 1);
  assert.ok(r.visibles[0].reaparecido);
});

test("eliminado estando VIVO → sigue oculto aunque siga latiendo", () => {
  const vivo = { id: "admira-macbookpro16", name: "MacBook Pro 16", lastSeen: AHORA - 20 };
  const estado = E.aplicar(E.estadoVacio(), "ocultar", E.entradaOcultar(vivo, vivo.lastSeen, "", AHORA * 1000));
  const r = E.depurar([{ ...vivo, lastSeen: AHORA + 900 }], estado, () => AHORA + 900, (AHORA + 900) * 1000);
  assert.equal(r.visibles.length, 0);
  assert.equal(r.ocultos[0].sigueLatiendo, true);
});

test("restaurar gana a un ocultar anterior al mezclar servidor y local", () => {
  const m = CENSO[3];
  const oc = E.aplicar(E.estadoVacio(), "ocultar", E.entradaOcultar(m, 0, "", AHORA * 1000));
  const rs = E.aplicar(oc, "restaurar", { id: m.id, nombre: m.name, at: (AHORA + 10) * 1000 });
  const mix = E.mezclar(oc, rs);
  assert.equal(E.depurar([m], mix, () => 0, AHORA * 1000).visibles.length, 1);
});

function kvFalso() {
  const datos = new Map();
  return { datos, get: async (k) => (datos.has(k) ? datos.get(k) : null), put: async (k, v) => { datos.set(k, v); } };
}
const req = (method, body, headers = {}) => new Request("https://www.admira.live/api/control/equipos", {
  method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });

test("API: ocultar desde la web persiste en KV y GET lo devuelve; sin origen/token se rechaza", async () => {
  const env = { RECORTE_KV: kvFalso() };
  const web = { Origin: "https://www.admira.live", "X-Admira-Control": "1" };
  let r = await onRequestPost({ request: req("POST", { accion: "ocultar", id: "admira-macstudiodecarlos", nombre: "Mac Studio de Carlos" }, web), env });
  assert.equal(r.status, 200);
  const g = await (await onRequestGet({ request: req("GET"), env })).json();
  assert.equal(g.ocultos.macstudiodecarlos.nombre, "Mac Studio de Carlos");
  assert.ok(env.RECORTE_KV.datos.has(KEY));
  r = await onRequestPost({ request: req("POST", { accion: "ocultar", id: "x1" }, { Origin: "https://evil.example", "X-Admira-Control": "1" }), env });
  assert.equal(r.status, 403);
  r = await onRequestPost({ request: req("POST", { accion: "ocultar", id: "x1" }), env });
  assert.equal(r.status, 401);
  r = await onRequestPost({ request: req("POST", { accion: "borrar", id: "x1" }, web), env });
  assert.equal(r.status, 400);
});

test("API: valida ids", () => {
  assert.ok(aplicarAccion({ ocultos: {} }, { accion: "ocultar", id: "../etc/passwd" }).error);
  assert.ok(aplicarAccion({ ocultos: {} }, { accion: "ocultar", id: "" }).error);
  assert.ok(aplicarAccion({ ocultos: {} }, { accion: "restaurar", id: "admira-macmini" }).estado.ocultos.macmini.restaurado);
});

test("/control carga equipos.js, depura el censo en los dos caminos y ofrece «Eliminar equipo»", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="\/control\/equipos\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /MACHINES=depurarEquipos\(FLEET_MACHINES\.slice\(\)\)/);
  assert.match(html, /MACHINES=depurarEquipos\(CENSO\)/);
  assert.match(html, /data-eliminar="\$\{m\.id\}"[^>]*>🗑 Eliminar equipo</);
  // el fondo de persona ya no se «restaura» como si fuera una captura
  assert.match(html, /!s\.classList\.contains\('isWall'\)/);
});
