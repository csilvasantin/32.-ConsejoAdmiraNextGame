import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  plOficiales, plResolve, plAnadirItem, plQuitarItem, plReordenarLista,
  plNormalizeState, plClave, clampWinLeft, PL_DEFAULT, PL_STORE,
} from "./win95-playlist-lib.mjs";

const html = readFileSync(new URL("./windows95/index.html", import.meta.url), "utf8");

const tags = [
  { tag: "win95", piezas: [
    { id: "a", titulo: "Uno", tipo: "video", url: "https://api.admira.store/a.mp4" },
    { id: "b", titulo: "Dos", tipo: "video", url: "https://api.admira.store/b.mp4" },
    { id: "c", titulo: "Tres", tipo: "video", url: "https://api.admira.store/c.mp4" },
    { id: "d", titulo: "Cuatro", tipo: "video", url: "https://api.admira.store/d.mp4" },
    { id: "e", titulo: "Cinco", tipo: "video", url: "https://api.admira.store/e.mp4" },
  ]},
  { tag: "AdmiraMediaPlayer", piezas: [
    { id: "z", titulo: "Otra", tipo: "video", url: "https://api.admira.store/z.mp4" },
  ]},
];

test("playlist oficial Win95: 5 piezas y no mezcla otros hashtags", () => {
  const list = plOficiales(tags, "win95");
  assert.equal(list.length, 5);
  assert.deepEqual(list.map((p) => p.id), ["a", "b", "c", "d", "e"]);
  assert.equal(plResolve(tags, plNormalizeState({}), "win95").length, 5);
  assert.equal(plResolve(tags, plNormalizeState({}), "AdmiraMediaPlayer").map((p) => p.id).join(), "z");
});

test("añadir cápsula, reordenar y quitar no toca el catálogo oficial", () => {
  let st = plNormalizeState({ selected: "win95" });
  st = plAnadirItem(tags, st, "win95", { id: "lib1", titulo: "Local", tipo: "audio", url: "https://api.admira.store/l.mp3" });
  let list = plResolve(tags, st, "win95");
  assert.equal(list.length, 6);
  assert.equal(list[5].id, "lib1");
  const keys = list.map(plClave);
  st = plReordenarLista(st, "win95", keys, 5, 0);
  list = plResolve(tags, st, "win95");
  assert.equal(list[0].id, "lib1");
  assert.equal(list[1].id, "a");
  st = plQuitarItem(tags, st, "win95", "b");
  list = plResolve(tags, st, "win95");
  assert.equal(list.map((p) => p.id).join(), "lib1,a,c,d,e");
  assert.equal(plOficiales(tags, "win95").map((p) => p.id).join(), "a,b,c,d,e", "el oficial no se borra");
  // quitar la añadida no la deja en removed oficial
  st = plQuitarItem(tags, st, "win95", "lib1");
  list = plResolve(tags, st, "win95");
  assert.equal(list.map((p) => p.id).join(), "a,c,d,e");
});

test("clamp horizontal estricto: la ventana no sale del escritorio 640", () => {
  assert.equal(clampWinLeft(-80, 200, 640), 0);
  assert.equal(clampWinLeft(500, 200, 640), 440);
  assert.equal(clampWinLeft(600, 200, 640), 440);
  assert.equal(clampWinLeft(40 - 200, 200, 640), 0);
  assert.equal(clampWinLeft(100, 200, 640), 100);
  assert.equal(clampWinLeft(0, 800, 640), 0);
});

test("t1400u está cableado en index.html", () => {
  assert.match(html, /function clampWinLeft\(left,w\)/);
  assert.match(html, /function clampWinHoriz\(el\)/);
  assert.doesNotMatch(html, /40-win\.offsetWidth,600/);
  assert.doesNotMatch(html, /clamp\(l,40-w,600\)/);
  assert.match(html, /id="napArtist" type="text"/);
  assert.match(html, /id="napTitle" type="text"/);
  assert.doesNotMatch(html, /qs\('#napArtist'\)\.textContent='admira'/);
  assert.match(html, /napSetField\(qs\('#napArtist'\),''\)/);
  assert.match(html, /\['Añadir',58\]/);
  assert.match(html, /function napPedirAnadir\(i\)/);
  assert.match(html, /function napRenderHome\(\)/);
  assert.match(html, /id="napHome"/);
  assert.match(html, /id="napPlSel"/);
  assert.match(html, /function plReordenar\(/);
  assert.match(html, /function plQuitar\(/);
  assert.match(html, /class="btn nap-x"/);
  assert.match(html, new RegExp(PL_STORE));
  assert.match(html, /plResolve\(typeof plSelected/);
  assert.match(html, /Arrow|type="text"/);
  assert.match(html, /function napKey\(e\)/);
  assert.match(html, /ae\.id==='napArtist'\|\|ae\.id==='napTitle'/);
  assert.doesNotMatch(html, /NAP\.field\.textContent=NAP\.field\.textContent\.slice\(0,-1\)/);
  assert.match(html, /data-tab="home"/);
  assert.equal(PL_DEFAULT, "win95");
});
