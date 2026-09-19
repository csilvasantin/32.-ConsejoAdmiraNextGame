import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');

test('el hilo es POR CONSEJERO, no uno compartido por la mesa', () => {
  assert.match(src, /function claveHilo\(agent\)/);
  assert.match(src, /\(agent\.gen \|\| currentGen\) \+ ':' \+ agent\.persona/);
  // se abre ANTES de la bifurcación de GrokBot, si no el contexto sería del anterior
  const sel = src.slice(src.indexOf('function selectAgentByPersona'));
  const abre = sel.indexOf('abreHilo(claveHilo(agent))');
  const bifurca = sel.indexOf('CouncilInterface?.has(persona)');
  assert.ok(abre > 0 && abre < bifurca, 'abreHilo debe ir antes de la bifurcación');
});

test('cerrar la conversación ya NO borra la memoria', () => {
  const fn = src.slice(src.indexOf('function exitConversation'), src.indexOf('function exitConversation') + 700);
  assert.ok(!/conversationHistory = \[\]/.test(fn), 'cerrar no puede vaciar el hilo');
  assert.match(fn, /abreHilo\('mesa'\)/);
});

test('al modelo se le manda role+content limpio, y más de 6 turnos', () => {
  assert.match(src, /const CONTEXTO_TURNOS = 20;/);
  assert.ok(!/context: conversationHistory\.slice\(-6\)/.test(src), 'ya no se manda el array crudo');
  assert.match(src, /context: contextoParaApi\(\)/);
  const f = src.slice(src.indexOf('function contextoParaApi'), src.indexOf('function contextoParaApi') + 300);
  assert.match(f, /map\(e => \(\{ role: e\.role, content: e\.content \}\)\)/, 'sin metadatos de pintado');
});

test('guardar nunca puede romper la conversación', () => {
  const f = src.slice(src.indexOf('function guardaHilos'), src.indexOf('function guardaHilos') + 400);
  assert.match(f, /try \{[\s\S]*catch \(e\) \{\}/, 'ventana privada o cuota llena no deben lanzar');
});

test('el hilo tiene tope y /olvidar existe', () => {
  assert.match(src, /const HILO_MAX = 40;/);
  assert.match(src, /splice\(0, conversationHistory\.length - HILO_MAX\)/);
  assert.match(src, /olvidarMatch/);
  assert.match(src, /'\/olvidar'/);
  assert.match(src, /<strong>\/olvidar \[todo\]<\/strong>/);
});

test('repintar escapa lo que viene de localStorage y del modelo', () => {
  const f = src.slice(src.indexOf('function repintaHilo'), src.indexOf('function repintaHilo') + 1200);
  assert.match(f, /replace\(\/\[<>&\]\/g/, 'addConvEntry usa innerHTML: hay que escapar');
  assert.match(f, /esc\(cuerpo\)/);
});
