import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRunCommand, applyCrtCommand, HELP_TEXT,
} from './win95-experto-lib.mjs';

const raiz = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(raiz, rel), 'utf8');
const html = src('windows95/index.html');
const js = src('assets/win95-crt.js');
const css = src('assets/win95-crt.css');

function fakeApi(state) {
  return {
    isOn: (f) => !!state[f],
    set: (f, on) => { state[f] = !!on; },
  };
}

test('el logo nuevo de Winamp está referenciado y el archivo existe con transparencia', () => {
  const amp = join(raiz, 'windows95/icons/amp.png');
  const badge = join(raiz, 'windows95/icons/amp-badge.png');
  const logo = join(raiz, 'windows95/icons/amp-logo.png');
  assert.ok(existsSync(amp), 'falta windows95/icons/amp.png');
  assert.ok(existsSync(badge), 'falta windows95/icons/amp-badge.png');
  assert.ok(existsSync(logo), 'falta windows95/icons/amp-logo.png');
  assert.match(html, /amp:'icons\/amp\.png/);
  assert.match(html, /icons\/amp-badge\.png/);
  assert.match(html, /class="alogo"/);
  assert.doesNotMatch(html, /class="alogo"[^>]*>W</);
  assert.match(html, /image-rendering:'\+render\+/);

  const buf = readFileSync(amp);
  assert.equal(buf.slice(0, 8).toString('binary'), '\x89PNG\r\n\x1a\n');
  // IHDR + color type 6 (RGBA) somewhere in the first chunks is typical;
  // also require a tRNS or actual 8-bit RGBA: look for IHDR color type byte.
  const ihdr = buf.indexOf(Buffer.from('IHDR'));
  assert.ok(ihdr >= 0, 'PNG sin IHDR');
  // After 'IHDR' come width(4), height(4), bitDepth(1), colorType(1). 6 = RGBA.
  const ct = buf[ihdr + 13];
  assert.equal(ct, 6, 'amp.png debe ser RGBA (color type 6)');
  assert.ok(buf.length > 8 * 1024, 'el logo nuevo no puede ser el icono pixel 32×32 antiguo');
});

test('las 4 cajas cuadradas Monitor/Computer/Extended/Entrelazado ya no se muestran', () => {
  assert.doesNotMatch(js, /mon\.id = "crt-monitor-toggle"/);
  assert.doesNotMatch(js, /comp\.id = "crt-computer-toggle"/);
  assert.doesNotMatch(js, /ext\.id = "crt-extended-toggle"/);
  assert.doesNotMatch(js, /ent\.id = "crt-entrelazado-toggle"/);
  assert.doesNotMatch(js, /ui\.appendChild\(mon\)/);
  assert.doesNotMatch(js, /ui\.appendChild\(comp\)/);
  assert.doesNotMatch(js, /ui\.appendChild\(ext\)/);
  assert.doesNotMatch(js, /ui\.appendChild\(ent\)/);
  assert.doesNotMatch(html, /id="crt-monitor-toggle"/);
  assert.doesNotMatch(html, /id="crt-computer-toggle"/);
  assert.doesNotMatch(html, /id="crt-extended-toggle"/);
  assert.doesNotMatch(html, /id="crt-entrelazado-toggle"/);
  assert.match(css, /#crt-monitor-toggle/);
  assert.match(css, /#crt-computer-toggle/);
  assert.match(css, /#crt-extended-toggle/);
  assert.match(css, /#crt-entrelazado-toggle/);
  assert.match(css, /display:\s*none\s*!important/);
  // La lógica real se conserva.
  assert.match(js, /function aplicar\(/);
  assert.match(js, /function aplicarExtended\(/);
  assert.match(js, /function aplicarEntrelazado\(/);
  assert.match(js, /function apagarEquipo\(/);
  assert.match(js, /win95CrtSet/);
  assert.match(js, /win95ExtendedSet/);
  assert.match(js, /win95EntrelazadoSet/);
  assert.match(js, /win95ComputerSet/);
});

test('Ejecutar muestra la línea de toggles y la etiqueta Ejecutar: en lugar de Abrir:', () => {
  assert.match(html, /Pruebe <b>demo<\/b>, <b>matrix<\/b>, <b>win95<\/b> o <b>ayuda<\/b>\./);
  assert.match(html, /Ejecuta <b>Monitor<\/b>, <b>Computer<\/b>, <b>Extended<\/b> o <b>Entrelazado<\/b>\./);
  assert.match(html, /<span class="run-open-lbl"><u>E<\/u>jecutar:<\/span>/);
  assert.doesNotMatch(html, /<u>A<\/u>brir:/);
});

test('ejecutar monitor, computer, extended y entrelazado invierte el estado actual', () => {
  const defaults = { monitor: true, computer: true, extended: false, entrelazado: true };
  const variants = {
    monitor: ['monitor', '/Monitor', 'MONITOR', 'Monitór'],
    computer: ['computer', '/computer', 'Computer'],
    extended: ['extended', '/Extended', 'EXTENDED'],
    entrelazado: ['entrelazado', '/Entrelazado', 'ENTRELazado'],
  };

  for (const [feature, raws] of Object.entries(variants)) {
    for (const raw of raws) {
      const parsed = parseRunCommand(raw);
      assert.equal(parsed.ok, true, raw);
      assert.equal(parsed.action, 'crt', raw);
      assert.equal(parsed.feature, feature, raw);
      assert.equal(parsed.mode, 'toggle', raw);
      const state = { ...defaults };
      const before = state[feature];
      const out = applyCrtCommand(parsed, fakeApi(state));
      assert.equal(out.ok, true, raw);
      assert.equal(state[feature], !before, raw + ' debe invertir');
      assert.equal(out.on, !before, raw);
      assert.match(out.message, new RegExp('^(Monitor|Computer|Extended|Entrelazado): (ON|OFF)$'), raw);
      assert.equal(out.message.endsWith(out.on ? 'ON' : 'OFF'), true, raw);
    }
    // Segundo toggle devuelve al original
    const state = { ...defaults };
    applyCrtCommand(parseRunCommand(feature), fakeApi(state));
    applyCrtCommand(parseRunCommand(feature), fakeApi(state));
    assert.equal(state[feature], defaults[feature], feature + ' ida y vuelta');
  }
});

test('monitor on / monitor off (y el resto) fuerzan el estado, y ayuda los documenta', () => {
  const state = { monitor: true, computer: true, extended: false, entrelazado: true };
  const api = fakeApi(state);
  let out = applyCrtCommand(parseRunCommand('monitor off'), api);
  assert.equal(state.monitor, false);
  assert.equal(out.message, 'Monitor: OFF');
  out = applyCrtCommand(parseRunCommand('/monitor on'), api);
  assert.equal(state.monitor, true);
  assert.equal(out.message, 'Monitor: ON');
  out = applyCrtCommand(parseRunCommand('extended on'), api);
  assert.equal(state.extended, true);
  assert.equal(out.message, 'Extended: ON');
  out = applyCrtCommand(parseRunCommand('entrelazado off'), api);
  assert.equal(state.entrelazado, false);
  assert.equal(out.message, 'Entrelazado: OFF');
  out = applyCrtCommand(parseRunCommand('computer off'), api);
  assert.equal(state.computer, false);
  assert.equal(out.message, 'Computer: OFF');

  assert.match(HELP_TEXT, /PANTALLA \(alternan ON\/OFF\)/);
  assert.match(HELP_TEXT, /^\s+monitor\b/m);
  assert.match(HELP_TEXT, /^\s+computer\b/m);
  assert.match(HELP_TEXT, /^\s+extended\b/m);
  assert.match(HELP_TEXT, /^\s+entrelazado\b/m);
  const help = parseRunCommand('ayuda');
  assert.equal(help.action, 'help');
  assert.match(help.text, /monitor/);
  assert.match(help.text, /entrelazado/);
});

test('index.html despacha los toggles de Ejecutar a la lógica real de win95-crt.js', () => {
  assert.match(html, /r\.action==='crt'/);
  assert.match(html, /function crtRuntime\(/);
  assert.match(html, /win95CrtSet/);
  assert.match(html, /win95ExtendedSet/);
  assert.match(html, /win95EntrelazadoSet/);
  assert.match(html, /win95ComputerSet/);
  assert.match(html, /applyCrtCommand/);
  assert.match(html, /fb\.classList\.add\('run-ok'\)/);
  assert.match(js, /window\.win95ComputerSet/);
  assert.match(js, /window\.win95ComputerOn/);
  assert.match(js, /function encenderEquipo\(/);
});
