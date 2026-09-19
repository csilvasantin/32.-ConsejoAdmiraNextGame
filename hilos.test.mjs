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

test('saltar a un consejero de GrokBot no deja en pantalla el hilo del anterior', () => {
  const sel = src.slice(src.indexOf('function selectAgentByPersona'));
  const rama = sel.slice(sel.indexOf("CouncilInterface?.has(persona)"), sel.indexOf("markCouncilConsulted"));
  assert.match(rama, /conv-racional/);
  assert.match(rama, /conv-creativo/);
  assert.match(rama, /innerHTML = ""/);
});

test('streaming: se pinta en vivo, sin duplicar y sin innerHTML del modelo', () => {
  assert.match(src, /async function askOneAgentStream/);
  // SSE de verdad: eventos separados por línea en blanco, montados desde trozos de red
  assert.match(src, /buffer\.indexOf\("\\n\\n"\)/);
  assert.match(src, /getReader\(\)/);
  // el texto del modelo NUNCA por innerHTML mientras se pinta en vivo
  const f = src.slice(src.indexOf('function pintaParcial'), src.indexOf('function cierraParcial'));
  assert.match(f, /_entradaViva\.txt\.textContent = texto/);
  assert.ok(!/innerHTML = texto/.test(f));
  // si el streaming no sale, se cae al camino de siempre
  assert.match(src, /if \(!reply\) \{ cierraParcial\(\); reply = await askOneAgentAPI/);
  // y no se pinta dos veces la misma respuesta
  assert.match(src, /if \(pintadoEnVivo\) \{ pintaParcial\(panelId, agent, reply\.content\); cierraParcial\(\); \}/);
});

test('la sala privada usa GrokBot cuando la silla lo tiene (no gasta tokens)', () => {
  const f = src.slice(src.indexOf('async function sendPrivateMessage'), src.indexOf('async function sendPrivateMessage') + 1600);
  assert.match(f, /CouncilInterface\?\.has\(meetingAdvisor\.persona\)/);
  const viaGrok = f.indexOf('CouncilInterface.send(meetingAdvisor.persona, text)');
  const viaApi  = f.indexOf('askOneAgentAPI(text, meetingAdvisor.name)');
  assert.ok(viaGrok > 0 && viaGrok < viaApi, 'GrokBot primero; la API es el ultimo recurso');
});

test('el rótulo distingue el que se puede usar del que está pendiente', () => {
  assert.match(src, /const porGrokBot = !!window\.CouncilInterface\?\.has\(p\.persona\)/);
  assert.match(src, /np-via-libre/);
  assert.match(src, /np-via-pago/);
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /\.np-via-libre \{ color: #7fe28d; \}/, 'el usable, en verde vivo');
  assert.match(html, /\.np-via-pago \{ color: #b99a5e; \}/, 'el pendiente, apagado');
});

test('a un consejero sin silla en GrokBot NO se le pregunta: se avisa', () => {
  assert.match(src, /function consejeroPendiente\(agent\)/);
  assert.match(src, /!window\.CouncilInterface\?\.has\(agent\.persona\)/);
  // las tres puertas por las que se podia colar una consulta de pago
  assert.match(src, /if \(consejeroPendiente\(selectedAgent\)\) \{ avisoPendiente\(selectedAgent\); return; \}/);
  assert.match(src, /if \(consejeroPendiente\(meetingAdvisor\)\) \{[^}]*avisoPendiente\(meetingAdvisor, "sala"\); return; \}/);
  assert.match(src, /if \(consejeroPendiente\(agent\)\) \{ avisoPendiente\(agent\); return; \}/);
  // y el aviso dice QUE pasa y QUE hacer mientras tanto
  assert.match(src, /pendiente de crearla/);
  assert.match(src, /Jobs, Wozniak, Disney, Lucas/);
});

test('el consejero pendiente se ve apagado antes de escribirle', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /\.np\.np-pago \{ opacity: \.55/);
  assert.match(src, /title="Pendiente de crear su silla en GrokBot/);
});

test('el camino de pago está bloqueado en un solo sitio', () => {
  assert.match(src, /const API_DE_PAGO_BLOQUEADA = true;/);
  // el corte va DENTRO de askCouncilAPI, que es por donde pasan todas las vias
  const f = src.slice(src.indexOf('async function askCouncilAPI'), src.indexOf('async function askCouncilAPI') + 600);
  assert.match(f, /if \(API_DE_PAGO_BLOQUEADA\)/);
  assert.match(f, /return null;/);
  // y el aviso dice a quien SI se puede preguntar
  assert.match(f, /Jobs, Wozniak, Disney, Lucas/);
});

test('DEBATIR se limita a las sillas de GrokBot y no paga', () => {
  const f = src.slice(src.indexOf('async function runSimulation'), src.indexOf('async function runSimulation') + 2600);
  assert.match(f, /filter\(m => window\.CouncilInterface\?\.has\(m\.persona\)\)/);
  assert.match(f, /CouncilInterface\.send\(m\.persona, prompt\)/);
  // sale antes de tocar la API, y suelta el cerrojo del debate al salir
  const envia = f.indexOf('CouncilInterface.send(m.persona, prompt)');
  const paga  = f.indexOf('askCouncilAPI(prompt)');
  assert.ok(envia > 0 && envia < paga, 'GrokBot antes que la API');
  assert.match(f, /debateRunning = false;\s*\n\s*return;/);
});

test('el aviso de pausa no se disfraza de error de red', () => {
  const f = src.slice(src.indexOf('async function simulateCouncilResponse'), src.indexOf('async function simulateCouncilResponse') + 900);
  assert.match(f, /if \(API_DE_PAGO_BLOQUEADA\)/, 'cortar antes de que el llamante invente un fallo');
  assert.match(f, /Mesa en pausa/);
  assert.ok(!/Modo offline/.test(f));
});

test('el rótulo y el campo comparten una sola fila', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  // recortar desde el MARCADO, no desde la primera aparición del texto (que es el CSS)
  const ini = html.indexOf('<div class="scumm-bar">');
  const fila = html.slice(ini, html.indexOf('<div class="scumm-bottom">', ini));
  const orden = ['id="sentence-line"', 'id="action-input"', 'class="action-send"', 'id="scumm-fold"']
    .map(t => fila.indexOf(t));
  assert.ok(orden.every(i => i > 0), 'los cuatro van en la misma fila: ' + JSON.stringify(orden));
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'y en ese orden');
  // el rótulo cede el sitio al campo y desaparece si está vacío
  assert.match(html, /\.sentence-line:empty \{ display: none; \}/);
  assert.match(html, /flex: 0 1 auto; max-width: 42%/);
});

test('el menú SCUMM nace visible y sin parpadeo', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(!/<div class="scumm-bar scumm-collapsed">/.test(html), 'no debe nacer plegado');
  assert.match(html, /<div class="scumm-bar">/);
  // clave nueva: quien lo hubiera plegado antes vuelve a verlo una vez
  assert.match(src, /localStorage\.getItem\('scummCollapsed\.v2'\)/);
  assert.match(src, /localStorage\.setItem\('scummCollapsed\.v2'/);
});

test('el panel se llama DeepAgents Team', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<b>📡 DeepAgents Team<\/b>/);
  assert.ok(!/<b>📡 AgoraMatrix · Consejo<\/b>/.test(html));
});
