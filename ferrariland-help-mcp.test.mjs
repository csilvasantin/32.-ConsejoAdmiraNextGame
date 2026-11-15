import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const leer = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');

test('t559u: Ferrari Land es una maqueta ilustrada más alta, con recorte transparente', () => {
  const cab = leer('assets/consejo-cabecera.js');
  const esc = leer('escena0-guion.mjs');
  assert.match(cab, /carlo-bonomi-ferrariland\.webp\?v=20261115-ferrariland/);
  assert.match(esc, /carlo-bonomi-ferrariland\.webp\?v=20261115-ferrariland/);
  assert.match(cab, /h: 12\.5/);
  assert.match(esc, /h: 12\.5/);
  assert.ok(existsSync(new URL('./assets/cabecera/carlo-bonomi-ferrariland.webp', import.meta.url)));
});

test('t559u: las misiones van ocultas desde el primer paint, en las dos mesas', () => {
  const home = leer('index.html');
  const e0 = leer('escena0/index.html');
  assert.match(home, /<html lang="es" class="misiones-off">/);
  assert.match(e0, /<html lang="es" class="misiones-off">/);
  assert.match(home, /id="misiones-off-first-paint"/);
  assert.match(e0, /id="misiones-off-first-paint"/);
  assert.match(home, /html\.misiones-off #papel-halos \.consejero-marker/);
  const globo = leer('council-globo.js');
  assert.match(globo, /localStorage\.getItem\(MISIONES_KEY\) === '1'/);
  assert.match(globo, /MISIONES_KEY = 'admira\.live\.misiones\.visibles\.v2'/);
});

test('t559u: /help y /ayuda del experto listan comandos reales y apuntan a /help/', async () => {
  const src = leer('assets/cli-ayuda.js');
  assert.match(src, /function catalogoExperto/);
  assert.match(src, /RE_HELP_EXPERTO/);
  assert.match(src, /version: 'r36'/);
  const vm = await import('node:vm');
  const fs = await import('node:fs');
  const ctx = vm.createContext({ module: { exports: {} }, exports: {}, console });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(new URL('./assets/cli-ayuda.js', import.meta.url), 'utf8'), ctx);
  const A = ctx.module.exports;
  assert.ok(A && A.catalogoExperto, 'catalogoExperto exportado');
  const es = A.catalogoExperto(false);
  const en = A.catalogoExperto(true);
  for (const s of [es, en]) {
    assert.match(s, /\/hablar/);
    assert.match(s, /\/talk/);
    assert.match(s, /\/conversacion/);
    assert.match(s, /\/counselor/);
    assert.match(s, /\/consejeros placas/);
    assert.match(s, /\/cabecera/);
    assert.match(s, /https:\/\/www\.admira\.live\/help\//);
    assert.match(s, /https:\/\/www\.admira\.live\/mcp\//);
    assert.match(s, /mcp\.admira\.live\/mcp/);
    assert.match(s, /clave en secretos del servidor|key in the server secrets/);
    assert.doesNotMatch(s, /sk-[A-Za-z0-9]{10,}/);
    assert.doesNotMatch(s, /Bearer [A-Za-z0-9._\-]{12,}/);
  }
  assert.match(es, /Ferrari Land/);
});

test('t559u: las páginas /help/ y /mcp/ existen y no publican secretos', () => {
  const help = leer('help/index.html');
  const mcp = leer('mcp/index.html');
  assert.match(help, /id="comandos"/);
  assert.match(help, /id="consejeros"/);
  assert.match(help, /\/hablar/);
  assert.match(help, /\/conversacion/);
  assert.match(help, /\/counselor/);
  assert.match(help, /\/consejeros placas/);
  assert.match(help, /clave está en los secretos del servidor/);
  assert.match(mcp, /https:\/\/mcp\.admira\.live\/mcp/);
  assert.match(mcp, /38/);
  for (const tool of [
    'agente_encargar', 'encargos_listar', 'encargo_estado', 'encargo_responder', 'encargo_anular',
    'consejero_bandeja', 'consejero_mensaje', 'consejero_preguntar', 'consejero_responder', 'consejero_latido',
    'telegram_bandeja', 'telegram_responder',
    'yokup_alta', 'yokup_evidencia', 'yokup_informe', 'yokup_mis_misiones', 'yokup_paso', 'yokup_presencia', 'yokup_quien_soy', 'yokup_ventana', 'yokup_decidir',
    'agora_decir', 'agentes_vivos', 'flota_estado', 'consejo_preguntar', 'consejo_consejeros'
  ]) {
    assert.match(mcp, new RegExp('<code>' + tool + '</code>'));
  }
  assert.equal((mcp.match(/<tr><td><code>[a-z0-9_]+<\/code>/g) || []).length, 38);
  assert.match(mcp, /clave en secretos del servidor/);
  assert.doesNotMatch(help, /sk-[A-Za-z0-9]{10,}/);
  assert.doesNotMatch(mcp, /sk-[A-Za-z0-9]{10,}/);
  assert.doesNotMatch(mcp, /Bearer [A-Za-z0-9._\-]{12,}/);
  assert.doesNotMatch(mcp, /AGORA_SYNC_KEY/);
});

test('t559u: /help pagina y /mcp están en los dos bundles de la home', () => {
  for (const f of ['app.js', 'app.flt-100529.js']) {
    const s = leer(f);
    assert.match(s, /helpPaginaMatch/);
    assert.match(s, /mcpPaginaMatch/);
    assert.match(s, /https:\/\/www\.admira\.live\/help\//);
    assert.match(s, /'\/conversacion', '\/conversation', '\/counselor'/);
    assert.match(s, /\/counselor · \/advisor/);
  }
});
