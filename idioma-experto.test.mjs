import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// /idioma ESP | ENG en ⌘ Experto de admira.live — mismo contrato que admira.store
// (assets/xpace-shell.js · languageCommand). MorfeoMacMini, 05-10-2026.
const read = f => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const SRC = read('admira-idioma.js');
const APP = read('app.flt-100529.js');
const BAR = read('admira-bar.js');
const HOME = read('index.html');

// ── DOM mínimo: lo justo para que admira-idioma.js lea, guarde y traduzca ──
function el(text, attrs = {}) {
  const a = { ...attrs };
  return {
    textContent: text, attrs: a,
    getAttribute: k => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    hasAttribute: k => k in a,
  };
}
function browser({ href = 'https://www.admira.live/', storage = new Map(), nodes = [] } = {}) {
  const events = [];
  const doc = {
    readyState: 'complete',
    documentElement: { lang: 'es' },
    addEventListener() {},
    querySelectorAll: sel => nodes.filter(n => sel.split(',').some(s => n.hasAttribute(s.trim().slice(1, -1)))),
  };
  const ctx = {
    document: doc, URL, events,
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) },
    location: { href },
    history: { state: null, replaceState(_s, _t, url) { ctx.location.href = url; } },
    dispatchEvent: e => events.push(e),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, doc, storage, I: ctx.AdmiraIdioma };
}

test('contrato de admira.store: ESP/ENG, es/en y /language, sin distinguir mayúsculas', () => {
  const { I } = browser();
  for (const [line, lang] of [['/idioma ESP', 'es'], ['/idioma ENG', 'en'], ['/idioma eng', 'en'], ['/idioma esp', 'es'],
    ['/idioma es', 'es'], ['/IDIOMA En', 'en'], ['/language en', 'en'], ['/language ESP', 'es']]) {
    const r = I.command(line, 'es');
    assert.equal(r.ok, true, line); assert.equal(r.change, true, line); assert.equal(r.language, lang, line);
  }
  // Mismos mensajes que xpace-shell.js
  assert.equal(I.command('/idioma ENG', 'es').message, 'Interface language: English.');
  assert.equal(I.command('/idioma ESP', 'en').message, 'Idioma de la interfaz: castellano.');
  assert.equal(I.command('/help', 'es'), null);
  assert.equal(I.command('hola', 'es'), null);
});

test('argumento inválido: mensaje claro con el uso y no cambia nada (español/english tampoco valen en admira.store)', () => {
  const { I, storage, doc } = browser();
  for (const bad of ['/idioma xx', '/idioma español', '/idioma english', '/idioma ENG ESP']) {
    const r = I.run(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.message, /no es un idioma\. Usa \/idioma ESP \(castellano\) o \/idioma ENG \(inglés\)\./, bad);
  }
  assert.equal(storage.size, 0);
  assert.equal(doc.documentElement.lang, 'es');
  assert.match(I.command('/idioma xx', 'en').message, /is not a language\. Use \/idioma ESP \(Spanish\) or \/idioma ENG \(English\)\./);
});

test('/idioma sin argumento dice el idioma actual y cómo cambiarlo', () => {
  const { I } = browser();
  const es = I.run('/idioma');
  assert.equal(es.ok, true); assert.equal(es.query, true);
  assert.equal(es.message, 'Idioma actual: castellano. Usa /idioma ESP (castellano) o /idioma ENG (inglés).');
  I.run('/idioma ENG');
  assert.equal(I.run('/idioma').message, 'Current language: English. Use /idioma ESP (Spanish) or /idioma ENG (English).');
});

test('persistencia: xtanco_lang, ?lang= en la URL, <html lang>, evento y traducción declarativa', () => {
  const storage = new Map();
  const link = el('🎯 Objetivos', { 'data-en': '🎯 Goals', title: 'Objetivos', 'data-en-title': 'Goals' });
  const input = el('', { placeholder: 'escribe aquí', 'data-en-placeholder': 'type here' });
  const a = browser({ storage, nodes: [link, input] });
  a.I.run('/idioma ENG');
  assert.equal(storage.get('xtanco_lang'), 'en');
  assert.equal(a.doc.documentElement.lang, 'en');
  assert.equal(new URL(a.ctx.location.href).searchParams.get('lang'), 'en');
  assert.equal(a.ctx.events.at(-1).type, 'admira:languagechange');
  assert.equal(a.ctx.events.at(-1).detail.lang, 'en');
  assert.equal(link.textContent, '🎯 Goals');
  assert.equal(link.getAttribute('title'), 'Goals');
  assert.equal(input.getAttribute('placeholder'), 'type here');

  // Otra página (o una recarga) del mismo origen arranca ya en inglés.
  const link2 = el('🎯 Objetivos', { 'data-en': '🎯 Goals' });
  const b = browser({ storage, href: 'https://www.admira.live/control/', nodes: [link2] });
  assert.equal(b.I.lang(), 'en');
  assert.equal(b.doc.documentElement.lang, 'en');
  assert.equal(link2.textContent, '🎯 Goals');

  // Volver a castellano restaura el original exacto.
  a.I.run('/idioma ESP');
  assert.equal(link.textContent, '🎯 Objetivos');
  assert.equal(link.getAttribute('title'), 'Objetivos');
  assert.equal(input.getAttribute('placeholder'), 'escribe aquí');
  assert.equal(storage.get('xtanco_lang'), 'es');
});

test('una ?lang= explícita en la URL manda en una visita nueva', () => {
  const storage = new Map([['xtanco_lang', 'en']]);
  const { I, doc } = browser({ storage, href: 'https://www.admira.live/?lang=es' });
  assert.equal(I.lang(), 'es');
  assert.equal(doc.documentElement.lang, 'es');
  assert.equal(storage.get('xtanco_lang'), 'es');
});

// ── /help: todo comando registrado aparece en la ayuda ──
function between(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, 'no encuentro ' + from);
  return src.slice(a, b);
}

test('home: cada comando de CLI_COMMANDS sale en /help (y /idioma está registrado)', () => {
  const list = APP.match(/const CLI_COMMANDS = \[([\s\S]*?)\];/);
  assert.ok(list, 'falta CLI_COMMANDS');
  const cmds = [...list[1].matchAll(/'(\/[^']+)'/g)].map(m => m[1]);
  assert.ok(cmds.includes('/idioma') && cmds.includes('/language'));
  const help = between(APP, 'function showCliHelp()', 'function showAgoraMatrixHelp');
  const missing = cmds.filter(c => !help.includes(c));
  assert.deepEqual(missing, [], 'comandos registrados que no salen en /help: ' + missing.join(' '));
});

test('consola local de la barra: /help nombra todo lo que entiende', () => {
  const list = BAR.match(/var CONSOLA_LOCAL = \[([^\]]*)\]/);
  assert.ok(list, 'falta CONSOLA_LOCAL');
  const cmds = [...list[1].matchAll(/"(\/[^"]+)"/g)].map(m => m[1]);
  const help = between(BAR, 'function consolaLocal', '\n  }\n');
  // /idioma llega por helpLine() del módulo; lo demás está literal en la ayuda.
  const { I } = browser();
  const text = help + I.helpLine('es') + I.helpLine('en');
  const missing = cmds.filter(c => !text.includes(c));
  assert.deepEqual(missing, [], 'la consola local no anuncia: ' + missing.join(' '));
});

test('el intérprete de la home despacha /idioma en local, antes que /help y sin red', () => {
  const fn = between(APP, 'function handleCliCommand(raw)', 'const helpMatch');
  assert.match(fn, /\/\^\\\/\(idioma\|language\)\(\\s\|\$\)\/i/);
  assert.match(fn, /window\.AdmiraIdioma\.run\(text\)/);
  assert.doesNotMatch(fn, /fetch\(|sendMessage|telegram/i);
});

// ── La barra común, traducida igual en la home y en las subpáginas ──
test('barra de subpáginas: todo enlace y grupo lleva su inglés', () => {
  for (const block of [between(BAR, 'var MENU = [', '\n  ];'), between(BAR, 'var ADV = [', '\n  ];')]) {
    const items = [...block.matchAll(/\{ t: "([^"]+)",\s*en: "([^"]+)"/g)];
    const all = [...block.matchAll(/\{ t: "/g)];
    assert.equal(items.length, all.length, 'hay rótulos sin en:');
  }
  assert.match(BAR, /\{ t: "Avanzado ▾", en: "Advanced ▾", items: ADV \}/);
  assert.match(BAR, /\(i\.en \? ' data-en="' \+ i\.en \+ '"' : ""\)/);
  for (const t of ['Avanzado · panel izquierdo', 'Opciones · panel derecho', 'Menú avanzado y consola · abajo'])
    assert.match(BAR, new RegExp('title: "' + t + '", en: "'));
});

test('barra idéntica: la home y admira-bar.js traducen cada sección con el mismo texto', () => {
  const bar = new Map([...BAR.matchAll(/\{ t: "([^"]+)",\s*en: "([^"]+)"/g)].map(m => [m[1], m[2]]));
  const top = between(HOME, '<div class="top-bar">', '<div class="pf-toggles">');
  const links = [...top.matchAll(/<a [^>]*class="version-badge"[^>]*>([^<]+)<\/a>/g)];
  assert.ok(links.length >= 8);
  for (const m of links) {
    const en = m[0].match(/data-en="([^"]+)"/);
    assert.ok(en, 'sin data-en: ' + m[1]);
    if (bar.has(m[1])) assert.equal(en[1], bar.get(m[1]), m[1]);
  }
  for (const id of ['pf-ic-opcion', 'pf-ic-avanzado', 'pf-ic-experto'])
    assert.match(HOME, new RegExp('id="' + id + '"[^>]*data-en-title="[^"]+"[^>]*data-en-aria-label="[^"]+"'));
});

test('carga: la home pide el módulo en el <head> y la barra lo pide con su mismo ?v= sellado', () => {
  const head = HOME.slice(0, HOME.indexOf('</head>'));
  assert.match(head, /<script src="\/admira-idioma\.js"><\/script>/);
  assert.ok(head.indexOf('admira-idioma.js') < HOME.indexOf('app.flt-100529.js'));
  assert.match(BAR, /"\/admira-idioma\.js" \+ \(v \? "\?v=" \+ encodeURIComponent\(v\) : ""\)/);
  assert.match(read('deploy.sh'), /ASSETS = \("admira-bar\.js", "casa-nav\.css", "admira-idioma\.js"\)/);
  assert.match(read('_headers'), /\/admira-idioma\.js\n  Cache-Control: public, max-age=300, must-revalidate/);
});
