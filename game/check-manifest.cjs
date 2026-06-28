#!/usr/bin/env node
/**
 * check-manifest.js — Detecta desincronización entre game/manifest.json
 * (fuente única de verdad) y el juego real (council-scumm.html).
 *
 * Compara los VERBOS (botones .verb-btn data-verb) y las PERSONAS (const COUNCIL).
 * Sale con código != 0 si hay diferencias. Úsalo en un hook o en CI.
 *
 *   node game/check-manifest.js
 */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const GAME = path.join(DIR, "..", "index.html");
const MANIFEST = path.join(DIR, "manifest.json");

function fail(msg) { console.error("✗ " + msg); }
function ok(msg) { console.log("✓ " + msg); }

let html, manifest;
try { html = fs.readFileSync(GAME, "utf8"); }
catch (e) { console.error("No se pudo leer " + GAME + ": " + e.message); process.exit(2); }
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }
catch (e) { console.error("manifest.json inválido: " + e.message); process.exit(2); }

// --- Verbos en el juego: botones de la barra ---
const gameVerbs = new Set();
const btnRe = /<button[^>]*class="verb-btn[^"]*"[^>]*data-verb="([^"]+)"/g;
let mm;
while ((mm = btnRe.exec(html))) gameVerbs.add(mm[1]);

const manifestVerbs = new Set((manifest.verbs || []).map(v => v.id));

// --- Personas en el juego: SOLO dentro del array const COUNCIL ---
// (el juego tiene otras listas con campo persona: máquinas, generación Matrix, etc.)
const gamePersonas = new Set();
const cStart = html.indexOf("const COUNCIL = [");
let councilText = html;
if (cStart !== -1) {
  const open = html.indexOf("[", cStart);
  const close = html.indexOf("];", open);
  councilText = html.slice(open, close === -1 ? html.length : close);
}
const persRe = /persona:\s*"([^"]+)"/g;
while ((mm = persRe.exec(councilText))) gamePersonas.add(mm[1]);

const manifestPersonas = new Set([
  ...((manifest.council && manifest.council.leyendas) || []),
  ...((manifest.council && manifest.council.coetaneos) || []),
].map(c => c.persona));

function diff(label, game, mani) {
  const missingInManifest = [...game].filter(x => !mani.has(x));
  const extraInManifest = [...mani].filter(x => !game.has(x));
  if (!missingInManifest.length && !extraInManifest.length) {
    ok(`${label}: ${game.size} en el juego coinciden con el manifest.`);
    return true;
  }
  if (missingInManifest.length) fail(`${label}: en el juego pero NO en el manifest -> ${missingInManifest.join(", ")}`);
  if (extraInManifest.length) fail(`${label}: en el manifest pero NO en el juego -> ${extraInManifest.join(", ")}`);
  return false;
}

console.log("Comprobando manifest ↔ index.html …\n");
const okVerbs = diff("VERBOS", gameVerbs, manifestVerbs);
const okPersonas = diff("PERSONAS", gamePersonas, manifestPersonas);

if (okVerbs && okPersonas) {
  console.log("\n✓ Manifest sincronizado. Recuerda subir 'version'/'updated' si cambiaste el contrato.");
  process.exit(0);
}
console.error("\n✗ Manifest DESINCRONIZADO. Actualiza game/manifest.json (y el help se regenera solo).");
process.exit(1);
