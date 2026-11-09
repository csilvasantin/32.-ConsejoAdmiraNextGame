import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function extraer(nombre) {
  const i = html.indexOf("function " + nombre + "(");
  assert.ok(i >= 0, "falta " + nombre);
  let d = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") d++;
    else if (html[k] === "}" && --d === 0) return html.slice(i, k + 1);
  }
  throw new Error("sin cierre " + nombre);
}

function entorno({ machines }) {
  const toasts = [], abiertos = [];
  const fn = new Function("MACHINES", "toast", "window", "rcMachineId", "fmtAge", "ultimaSenalEquipo",
    extraer("alcanzable") + extraer("motivoSinRuta") + extraer("abrirRcDesdePrevio") +
    "return {alcanzable, motivoSinRuta, abrirRcDesdePrevio};");
  const window = { openRemoteControl: (id, name) => abiertos.push([id, name]) };
  const api = fn(machines, (k, t, s) => toasts.push([k, t, s]), window, (id) => id, () => "hace 1h", () => 1);
  return { api, toasts, abiertos };
}

test("clic en el previo abre el control remoto de ESA máquina, directo", () => {
  const { api, abiertos, toasts } = entorno({ machines: [{ id: "macstudio", name: "Mac Studio", online: true }] });
  api.abrirRcDesdePrevio("macstudio");
  assert.deepEqual(abiertos, [["macstudio", "Mac Studio"]]);
  assert.equal(toasts.length, 0);
});

test("previo de una máquina que el hub no alcanza: aviso honesto, sin abrir nada", () => {
  for (const m of [
    { id: "macmini", name: "Mac Mini", online: false },
    { id: "macmini", name: "Mac Mini", online: true, viaPresence: true },
    { id: "macmini", name: "Mac Mini", online: true, viaGracia: true },
    { id: "macmini", name: "Mac Mini", online: true, degraded: true, viaFleet: true },
  ]) {
    const { api, abiertos, toasts } = entorno({ machines: [m] });
    assert.equal(api.alcanzable(m), false);
    api.abrirRcDesdePrevio("macmini");
    assert.equal(abiertos.length, 0);
    assert.match(toasts[0][2], /offline — el control remoto necesita la máquina despierta/);
  }
});

test("el delegado de #cards atiende el previo y ya no hay lightbox ni cursor zoom-in", () => {
  assert.match(html, /const previo=e\.target\.closest\('\.shot\[data-m\]'\)/);
  assert.match(html, /abrirRcDesdePrevio\(previo\.dataset\.m\)/);
  assert.doesNotMatch(html, /\.shot\{[^}]*cursor:zoom-in/);
  assert.doesNotMatch(html, /box\.onclick=\(\)=>\{ \$\('#lbImg'\)/);
});

test("tarjeta inalcanzable: OFFLINE explícito, sin «SIN CAPTURA · fondo de persona» ni botón de control remoto", () => {
  assert.match(html, /alcanzable\(m\)\?'':' sinruta'/);
  assert.match(html, /💤 OFFLINE · no responde al control/);
  assert.match(html, /if\(mm && !alcanzable\(mm\)\)\{[\s\S]{0,400}box\.classList\.remove\('isWall'\)/);
  assert.match(html, /\$\{alcanzable\(m\)\?`<button data-rc=/);
  const { api } = entorno({ machines: [] });
  assert.match(api.motivoSinRuta({ degraded: true, viaFleet: true }), /sin relay de control · último latido hace 1h \(admira-fleet\)/);
});
