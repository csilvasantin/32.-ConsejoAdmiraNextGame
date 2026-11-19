import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMesa, mesaDe, canalVacio, marcarPresente, mesasVivas, siguienteSpeaker,
  reservar, decir, promptDe, publicState, TEMA_DEFECTO, TEMA_AUTONOMO,
  CONTEXTO_PRESENTACION, esTemaPresentacion, PRESENTE_MS, MESAS,
} from './escena0-lib.mjs';

const T0 = 1_000_000;

test('parseMesa acepta leyendas/coetáneos y alias, y rechaza basura', () => {
  assert.equal(parseMesa('Leyendas'), 'leyendas');
  assert.equal(parseMesa('leyenda'), 'leyendas');
  assert.equal(parseMesa('legends'), 'leyendas');
  assert.equal(parseMesa('coetáneos'), 'coetaneos');
  assert.equal(parseMesa('Coetaneos'), 'coetaneos');
  assert.equal(parseMesa('peers'), 'coetaneos');
  assert.equal(parseMesa(''), null);
  assert.equal(parseMesa('jobs'), null);
  assert.equal(mesaDe('Steve Jobs'), 'leyendas');
  assert.equal(mesaDe('Elon Musk'), 'coetaneos');
  assert.equal(mesaDe('Mira Murati'), 'coetaneos');
  assert.equal(mesaDe('Tim Cook'), null);
});

test('una sola mesa viva: rotan entre ellos (nunca cruza a la otra)', () => {
  let d = marcarPresente(canalVacio(), 'leyendas', T0);
  assert.deepEqual(mesasVivas(d, T0), ['leyendas']);
  let s = siguienteSpeaker(d, T0);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Jobs' });
  d = decir(d, { mesa: 'leyendas', persona: 'Steve Jobs', texto: 'Empezamos.' }, T0 + 1).doc;
  s = siguienteSpeaker(d, T0 + 2);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Wozniak' });
  d = decir(d, { mesa: 'leyendas', persona: 'Steve Wozniak', texto: 'De acuerdo.' }, T0 + 3).doc;
  assert.equal(siguienteSpeaker(d, T0 + 4).persona, 'Walt Disney');
  // Coetáneos no está viva: no sale Elon
  assert.equal(siguienteSpeaker(d, T0 + 4).mesa, 'leyendas');
});

test('las dos mesas vivas: el turno alterna (Leyendas responde a Coetáneos y viceversa)', () => {
  let d = marcarPresente(canalVacio(), 'leyendas', T0);
  d = marcarPresente(d, 'coetaneos', T0);
  assert.deepEqual(mesasVivas(d, T0), ['leyendas', 'coetaneos']);
  assert.equal(publicState(d, T0).cruce, true);
  let s = siguienteSpeaker(d, T0);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Jobs' });
  d = decir(d, { mesa: s.mesa, persona: s.persona, texto: 'Propongo foco en producto.' }, T0 + 1).doc;
  s = siguienteSpeaker(d, T0 + 2);
  assert.deepEqual(s, { mesa: 'coetaneos', persona: 'Elon Musk' });
  d = decir(d, { mesa: s.mesa, persona: s.persona, texto: 'Y en inferencia barata.' }, T0 + 3).doc;
  s = siguienteSpeaker(d, T0 + 4);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Wozniak' });
  d = decir(d, { mesa: s.mesa, persona: s.persona, texto: 'Lo medimos en el Mac.' }, T0 + 5).doc;
  s = siguienteSpeaker(d, T0 + 6);
  assert.deepEqual(s, { mesa: 'coetaneos', persona: 'Jensen Huang' });
});

test('reservar bloquea a otro hablante hasta que dice o caduca', () => {
  let d = marcarPresente(canalVacio(), 'coetaneos', T0);
  const a = reservar(d, 'coetaneos', 'Elon Musk', T0);
  assert.equal(a.ok, true);
  const b = reservar(a.doc, 'coetaneos', 'Jensen Huang', T0 + 10);
  assert.equal(b.ok, false);
  assert.equal(b.error, 'ocupado');
  const mal = decir(a.doc, { mesa: 'coetaneos', persona: 'Jensen Huang', texto: 'colado' }, T0 + 11);
  assert.equal(mal.ok, false);
  const ok = decir(a.doc, { mesa: 'coetaneos', persona: 'Elon Musk', texto: 'Listos.' }, T0 + 12);
  assert.equal(ok.ok, true);
  assert.equal(ok.turno.texto, 'Listos.');
  assert.equal(ok.siguiente.persona, 'Jensen Huang');
});

test('un latido caducado deja de contar como mesa viva', () => {
  let d = marcarPresente(canalVacio(), 'leyendas', T0);
  d = marcarPresente(d, 'coetaneos', T0);
  assert.equal(mesasVivas(d, T0 + PRESENTE_MS + 1).length, 0);
  d = marcarPresente(d, 'leyendas', T0 + PRESENTE_MS + 2);
  assert.deepEqual(mesasVivas(d, T0 + PRESENTE_MS + 2), ['leyendas']);
});

test('prompt nombra el tema, a los de su mesa y a la otra pantalla', () => {
  const d = canalVacio('¿Qué pintamos en la sala?');
  const p0 = promptDe('Steve Jobs', d);
  assert.match(p0, /Leyendas/);
  assert.match(p0, /Steve Wozniak/);
  assert.match(p0, /Elon Musk/);
  assert.match(p0, /¿Qué pintamos en la sala\?/);
  const d2 = decir(d, { mesa: 'leyendas', persona: 'Steve Jobs', texto: 'Abrimos la sala.' }, T0).doc;
  const p1 = promptDe('Elon Musk', d2);
  assert.match(p1, /Steve Jobs: Abrimos la sala\./);
  assert.match(p1, /primera persona/);
  assert.equal(TEMA_DEFECTO.includes('AdmiraNeXT'), true);
  assert.ok(MESAS.leyendas.length === 4 && MESAS.coetaneos.length === 6);
});

test('escena0 · Carlos 15-11 19:42: «\\» abre la línea de modo experto dentro de la pantalla completa; /help', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /e\.key === '\\\\' \|\| e\.code === 'Backslash' \|\| e\.code === 'IntlBackslash'/);
  assert.match(js, /document\.fullscreenElement \|\| document\.webkitFullscreenElement/);
  assert.match(js, /inp\.addEventListener\('keydown', \(e\) => \{\n\s+e\.stopPropagation\(\);/, 'las teclas de la escena no llegan mientras se escribe');
  assert.match(js, /AYUDA_EXPERTO/);
});

test('escena0 · Carlos 15-11 21:47: mando remoto solo con la sala firmada (&mando=) y acuse con el resultado del modo experto', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /const MANDO_API = 'https:\/\/www\.portaventuranext\.com\/api\/mando\/escena0';/);
  assert.match(js, /\/\^\[a-z0-9\]\{2,16\}\\\.\[0-9a-f\]\{32\}\$\/\.test\(q\.get\('mando'\)/, 'sin sala firmada no escucha');
  assert.match(js, /if \(salaMando && \(mesa === 'leyendas' \|\| mesa === 'coetaneos'\)\) \{/);
  assert.match(js, /res = ejecutarExperto\(String\(o\.comando \|\| ''\)\);/, 'lo mismo que teclear en modo experto');
  assert.match(js, /return \{ ok: false, texto: 'Comando no reconocido: ' \+ texto \};/, 'el error real va en el acuse');
  assert.match(js, /credentials: 'omit'/, 'nunca manda cookies de admira.live al relé');
});

test('escena0 · Carlos 16-11: mando directo en el mismo ordenador (postMessage del lanzador que la abrió, sin relé)', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /const ORIGENES_LANZADOR = \['https:\/\/www\.portaventuranext\.com', 'https:\/\/portaventuranext\.com'\];/);
  assert.match(js, /e\.source !== window\.opener\) return;/, 'solo la ventana que la abrió');
  assert.match(js, /d\.tipo !== 'escena0-mando'/);
  assert.match(js, /res = ejecutarExperto\(d\.comando\);/, 'lo mismo que teclear en modo experto');
  assert.match(js, /tipo: 'escena0-acuse'/, 'acuse con el resultado real');
});

test('escena0 · Carlos 16-11 09:59: ask-one por el proxy del Mini primero y sin relleno fijo en bucle', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /'https:\/\/macmini\.tail48b61c\.ts\.net\/demo\/consejo\/ask-one',\n  'https:\/\/macmini\.tail48b61c\.ts\.net\/council\/api\/council\/ask-one'/, 'proxy antes que la API directa');
  assert.doesNotMatch(js, /Dejadme encajar lo que acabáis de decir/, 'nada de la misma frase para todos');
});

import { comandoSilencio, comandoAutonomo, comandoCerrar } from './escena0-lib.mjs';

test('comandos /silencio y /autonomo, con on/off o alternar', () => {
  assert.deepEqual(comandoSilencio('/silencio'), { tipo: 'silencio', on: null });
  assert.deepEqual(comandoSilencio('/silenciar on'), { tipo: 'silencio', on: true });
  assert.deepEqual(comandoSilencio('/mute off'), { tipo: 'silencio', on: false });
  assert.deepEqual(comandoSilencio('/voz'), { tipo: 'silencio', on: false });
  assert.equal(comandoSilencio('/consejero carlos silva'), null);
  assert.deepEqual(comandoAutonomo('/autónomo'), { tipo: 'autonomo', on: null });
  assert.deepEqual(comandoAutonomo('/consejo autonomo on'), { tipo: 'autonomo', on: true });
  assert.deepEqual(comandoAutonomo('/autonomo off'), { tipo: 'autonomo', on: false });
  assert.equal(comandoAutonomo('/consejero carlo bonomi'), null);
  assert.deepEqual(comandoCerrar('/cerrar'), { tipo: 'cerrar' });
  assert.deepEqual(comandoCerrar('/cerrar todo'), { tipo: 'cerrar' });
  assert.deepEqual(comandoCerrar('/close all'), { tipo: 'cerrar' });
  assert.deepEqual(comandoCerrar('/salir'), { tipo: 'cerrar' });
  assert.equal(comandoCerrar('/consejero carlos silva'), null);
  assert.equal(comandoCerrar('/silencio on'), null);
  assert.match(TEMA_AUTONOMO, /PortAventuraNeXT/);
  assert.match(TEMA_AUTONOMO, /Carlo Bononi/);
});

test('escena0 · Carlos 16-11 13:39: botones de silenciar y consejo autónomo junto a aparecer Carlos/Carlo', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  for (const s of ['btn-silencio', 'btn-autonomo', 'btn-carlos', 'btn-bonomi', 'Silenciar consejo', 'Consejo autónomo', 'Aparecer Carlos Silva', 'Aparecer Carlo Bonomi']) {
    assert.ok(html.includes(s), s);
  }
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /LS_SILENCIO/);
  assert.match(js, /localStorage\.setItem\(LS_SILENCIO/);
  assert.match(js, /comandoSilencio/);
  assert.match(js, /comandoAutonomo/);
  assert.match(js, /comandoCerrar/);
  assert.match(js, /cerrarVentanaShow/);
  assert.match(js, /TEMA_AUTONOMO/);
  assert.match(js, /arrancarConversacion/);
  assert.match(js, /cortarVoz/);
  assert.match(js, /\/silencio/);
  assert.match(js, /\/autonomo/);
  assert.match(js, /\/cerrar/);
});

test('el consejo autónomo debate la presentación de PortAventuraNeXT, no un tema genérico', () => {
  assert.equal(esTemaPresentacion(TEMA_AUTONOMO), true);
  assert.equal(esTemaPresentacion(TEMA_DEFECTO), false);
  assert.match(CONTEXTO_PRESENTACION, /World models/i);
  assert.match(CONTEXTO_PRESENTACION, /Retail Media\+/);
  assert.match(CONTEXTO_PRESENTACION, /Domain-specific language models/i);
  assert.match(CONTEXTO_PRESENTACION, /XperiencIA/);
  assert.match(CONTEXTO_PRESENTACION, /PortAventura University/);
  assert.match(CONTEXTO_PRESENTACION, /Imagineers/);
  assert.match(CONTEXTO_PRESENTACION, /Admira University/);
  assert.match(CONTEXTO_PRESENTACION, /5,3/);
  assert.match(CONTEXTO_PRESENTACION, /2,5/);
  assert.match(CONTEXTO_PRESENTACION, /Legado/);
  const p = promptDe('Steve Jobs', canalVacio(TEMA_AUTONOMO));
  assert.match(p, /CEO/);
  assert.match(p, /World models/i);
  assert.match(p, /Publi Data/);
  assert.match(p, /no inventéis otras cifras/i);
  const p2 = promptDe('Elon Musk', canalVacio(TEMA_AUTONOMO));
  assert.match(p2, /CEO/);
  assert.match(p2, /los Coetáneos/);
  const g = promptDe('Steve Jobs', canalVacio('¿Qué pintamos en la sala?'));
  assert.doesNotMatch(g, /Publi Data/);
});

test('Carlos 19-11: quitarPresente, idioma y temas del selector', async () => {
  const lib = await import('./escena0-lib.mjs');
  const T1 = 1_795_000_000_000;
  let d = lib.marcarPresente(lib.canalVacio(), 'leyendas', T1);
  d = lib.marcarPresente(d, 'coetaneos', T1);
  assert.deepEqual(lib.mesasVivas(d, T1 + 1), ['leyendas', 'coetaneos']);
  d = lib.quitarPresente(d, 'leyendas', T1 + 2);
  assert.deepEqual(lib.mesasVivas(d, T1 + 3), ['coetaneos']);
  assert.equal(lib.siguienteSpeaker(d, T1 + 3).mesa, 'coetaneos');
  assert.equal(lib.parseIdioma('EN'), 'en');
  assert.equal(lib.parseIdioma('español'), 'es');
  assert.equal(lib.parseIdioma('fr'), null);
  assert.match(lib.sufijoIdioma('en'), /English/);
  assert.equal(lib.sufijoIdioma('es'), '');
  assert.equal(lib.TEMAS_PRESET[0].tema, null, 'el primero es el tema actual (TEMA_AUTONOMO) por defecto');
  assert.ok(lib.MESAS.coetaneos.every((p) => lib.ANCLA.coetaneos[p] && lib.ROLES[p]));
});
