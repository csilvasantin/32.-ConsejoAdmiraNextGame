import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  GUION_PAN, parseGuion, parseCabecera, CABECERAS, CABECERA_POS, textoTurno, bolsasGuion, promptGuion, mesaDeGuion, msLectura,
} from './escena0-guion.mjs';
import { ANCLA } from './escena0-lib.mjs';

test('el guion de PortAventuraNeXT es consejero vs consejero: alterna Leyendas y Coetáneos', () => {
  assert.equal(parseGuion('pan'), GUION_PAN);
  assert.equal(parseGuion('PortAventuraNeXT'), GUION_PAN);
  assert.equal(parseGuion('otro'), null);
  const mesas = GUION_PAN.turnos.map((t) => mesaDeGuion(t.persona));
  assert.ok(mesas.every(Boolean), 'todos los que hablan tienen mesa');
  assert.ok(mesas.includes('leyendas') && mesas.includes('coetaneos'));
  // Todos tienen ancla para el globo en su mesa
  for (const t of GUION_PAN.turnos) assert.ok(ANCLA[mesaDeGuion(t.persona)][t.persona], t.persona);
  assert.match(GUION_PAN.turnos[0].texto, /el parque que se cuenta solo/);
  assert.equal(GUION_PAN.cierre, 'portaventuranext.com');
});

test('cabecera: Carlo Bonomi por nombre o alias, sin cargo; off la vacía', () => {
  for (const v of ['bonomi', 'Carlo Bonomi', 'carlo-bonomi', 'CARLO']) assert.equal(parseCabecera(v).nombre, 'Carlo Bonomi');
  for (const v of ['', 'off', 'no', null]) assert.equal(parseCabecera(v), null);
  assert.equal(parseCabecera('pepe'), null);
  assert.equal(Object.keys(CABECERAS['carlo-bonomi']).includes('cargo'), false, 'no se inventa cargo');
  assert.equal(CABECERA_POS.mesa, 'coetaneos');
});

test('el turno nombra al invitado de cabecera (o a Carlos si no hay)', () => {
  const t = GUION_PAN.turnos.find((x) => x.texto.includes('{cabecera}'));
  assert.match(textoTurno(t, parseCabecera('bonomi')), /^Carlo, la cabecera es tuya/);
  assert.match(textoTurno(t, null), /^Carlos, la cabecera es tuya/);
  const b = bolsasGuion(GUION_PAN, parseCabecera('bonomi'));
  assert.equal(b['Elon Musk'].length, 3);
  assert.ok(!JSON.stringify(b).includes('{cabecera}'));
});

test('prompt de IA: la idea fija del guion y quién escucha en la cabecera', () => {
  const p = promptGuion(GUION_PAN, 1, parseCabecera('bonomi'), [{ persona: 'George Lucas', texto: 'Hola' }]);
  assert.match(p, /Carlo Bonomi/);
  assert.match(p, /George Lucas: Hola/);
  assert.match(p, /cincuenta de colas/);
  assert.equal(msLectura(''), 4000);
  assert.equal(msLectura('x'.repeat(1000)), 11000);
});

test('la home y escena0 comparten ficha y posición de la cabecera', () => {
  const ctx = {}; ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctx);
  const lib = ctx.CouncilCabeceraLib;
  assert.deepEqual({ ...lib.POS }, { ...CABECERA_POS });
  assert.equal(lib.CABECERAS['carlo-bonomi'].foto, CABECERAS['carlo-bonomi'].foto);
  assert.equal(lib.CABECERAS['carlo-bonomi'].nombre, 'Carlo Bonomi');
});

test('/cabecera en la home: pone, alterna, quita y rechaza desconocidos', () => {
  const ctx = {}; ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctx);
  const lib = ctx.CouncilCabeceraLib;
  const m = {}; const e = lib.crearEstado({ getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; } });
  let r = lib.comando('/cabecera Carlo Bonomi', e);
  assert.equal(r.ok, true); assert.equal(r.gen, 'coetaneos'); assert.equal(e.get(), 'carlo-bonomi');
  assert.equal(m[lib.KEY], 'carlo-bonomi');
  r = lib.comando('/cabecera off', e); assert.equal(e.get(), null); assert.equal(m[lib.KEY], undefined);
  r = lib.comando('/cabecera', e); assert.equal(e.get(), 'carlo-bonomi');
  r = lib.comando('/cabecera', e); assert.equal(e.get(), null);
  r = lib.comando('/cabecera pepe', e); assert.equal(r.ok, false);
  assert.equal(lib.comando('/consejero todos', e), null);
});

test('la home carga el módulo y app.js / app.flt atienden /cabecera', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<script defer src="assets\/consejo-cabecera\.js\?v=[^"]+"><\/script>[\s\S]{0,200}<script defer src="app\.flt-100529\.js/);
  for (const f of ['./app.js', './app.flt-100529.js']) {
    const js = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(js, /window\.CouncilCabecera\.comando\(text\)/, f);
    assert.match(js, /window\.CouncilCabecera\.sync\(currentGen\)/, f);
    assert.match(js, /'\/cabecera'/, f);
  }
});

test('escena0: el flujo de demo y la cabecera están cableados en la página', () => {
  const html = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="cabecera"/); assert.match(html, /id="rotulo"/);
  assert.match(html, /\?flujo=pan&amp;cabecera=bonomi/);
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /from '\/escena0-guion\.mjs(\?v=[^']+)?'/);
  assert.match(js, /parseGuion\(q\.get\('flujo'\)\)/);
  assert.match(js, /parseCabecera\(q\.get\('cabecera'\)\)/);
  assert.match(js, /1 · Consejo de Leyendas/);
  assert.match(js, /2 · Consejo de Coetáneos/);
});

test('guion Carlos Silva ↔ Carlo Bonomi: 12 turnos, alterna mesas, sin IA ni voz y sin cargo inventado', async () => {
  const { GUION_CARLOS_BONOMI: G, anclaGuion, PERSONAS_GUION } = await import('./escena0-guion.mjs');
  assert.equal(parseGuion('carlos-bonomi'), G);
  assert.equal(parseGuion('pan'), GUION_PAN, 'el guion pan sigue igual');
  assert.equal(G.turnos.length, 12);
  assert.ok(G.soloGuion && G.sinVoz);
  assert.equal(parseCabecera(G.cabecera).nombre, 'Carlo Bonomi');
  G.turnos.forEach((t, i) => {
    assert.equal(t.persona, i % 2 ? 'Carlos Silva' : 'Carlo Bonomi', 'turno ' + (i + 1));
    const m = mesaDeGuion(t.persona);
    assert.equal(m, t.persona === 'Carlos Silva' ? 'leyendas' : 'coetaneos');
    assert.ok(anclaGuion(m, t.persona), 'globo con ancla');
    assert.ok(t.texto.length <= 200, 'líneas cortas');
  });
  assert.equal(anclaGuion('coetaneos', 'Carlos Silva'), null);
  assert.match(G.turnos[11].texto, /Studio/);
  assert.match(G.turnos[11].texto, /Si no emociona, no se escala/);
  assert.ok(!/CEO|presidente|director|fundador/i.test(G.turnos.filter((t) => t.persona === 'Carlo Bonomi').map((t) => t.texto).join(' ')));
  assert.equal(Object.keys(PERSONAS_GUION).length, 2);
});

test('escena0: ?guion= manda sobre ?flujo=pan y el guion de personas reales no llama a la IA ni a la voz', () => {
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /guionQ \|\| parseGuion\(q\.get\('flujo'\)\)/);
  assert.match(js, /!\(guion && guion\.soloGuion\)/);
  assert.match(js, /guion\.sinVoz/);
  assert.match(js, /anclaGuion\(mesaVista, persona\)/);
  const html = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  assert.match(html, /guion=carlos-bonomi/);
});

test('bilingüe: ?lang=es|en|both (por defecto both) solo en el guion Carlos ↔ Bonomi; los 12 turnos tienen inglés', async () => {
  const { GUION_CARLOS_BONOMI: G, parseLang, lineasTurno } = await import('./escena0-guion.mjs');
  assert.equal(parseLang(null, G), 'both');
  assert.equal(parseLang('EN', G), 'en');
  assert.equal(parseLang('es', G), 'es');
  assert.equal(parseLang('en', GUION_PAN), 'es', 'el guion pan sigue en castellano');
  for (const t of G.turnos) {
    assert.ok(t.en && t.en.length > 10 && t.en.length <= 200, t.en);
    assert.deepEqual(lineasTurno(t, null, 'both').map((l) => l.lang), ['es', 'en']);
    assert.deepEqual(lineasTurno(t, null, 'en').map((l) => l.lang), ['en']);
  }
  assert.match(G.turnos[11].en, /Studio entrance/);
  assert.match(G.turnos[11].en, /If it doesn't move people, we don't scale it/);
  assert.deepEqual(lineasTurno(GUION_PAN.turnos[0], null, 'both').map((l) => l.lang), ['es']);
});

test('cajas del flujo: la zona de cada mesa no pisa caras, placas ni logo, en 1920×1080, 1600×900 y 1280×720', async () => {
  const { ZONAS_GLOBO, OBSTACULOS, cajaGlobo, anchoGlobo, obstaculosPx, seSolapan, PERSONAS_GUION, GUION_CARLOS_BONOMI } = await import('./escena0-guion.mjs');
  const artes = { leyendas: [1360, 768], coetaneos: [1280, 720] };
  const quien = [...GUION_PAN.turnos, ...GUION_CARLOS_BONOMI.turnos];
  for (const [W, H] of [[1920, 1080], [1600, 900], [1280, 720]]) {
    for (const t of quien) {
      const mesa = mesaDeGuion(t.persona);
      const [nw, nh] = artes[mesa]; const s = Math.min(W / nw, H / nh);
      const box = { x: (W - nw * s) / 2, y: (H - nh * s) / 2, w: nw * s, h: nh * s };
      const z = ZONAS_GLOBO[mesa];
      const gh = ((z.y1 - z.y0) / 100) * box.h - 0.5; // la caja más alta que cabe
      const a = (ANCLA[mesa] || {})[t.persona] || PERSONAS_GUION[t.persona].ancla;
      const c = cajaGlobo(mesa, a.x, box, anchoGlobo(mesa, box), gh);
      assert.ok(c.cabe);
      const choque = obstaculosPx(mesa, box).filter((o) => seSolapan(c, o)).map((o) => o.id);
      assert.deepEqual(choque, [], `${W}x${H} ${t.persona}`);
      assert.ok(c.left >= 0 && c.left + c.w <= W && c.top >= 0 && c.top + c.h <= H);
    }
  }
  assert.ok(OBSTACULOS.coetaneos.some((o) => o.id === 'cara Carlo Bonomi'));
  assert.ok(OBSTACULOS.leyendas.some((o) => o.id === 'cara Carlos Silva'));
});

test('escena0: una sola caja por turno en el flujo (sin barra), funde antes de la siguiente, inglés en la caja', () => {
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /if \(flujo\) \{ bar\.hidden = true; return; \}/);
  assert.match(js, /await ocultarGloboFlujo\(\)/);
  assert.match(js, /parseLang\(q\.get\('lang'\), guion\)/);
  const html = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="globo-en" lang="en"/);
  assert.match(html, /escena0\.js\?v=2026111[4-9]-[a-z0-9]+/);
  const css = readFileSync(new URL('./escena0/escena0.css', import.meta.url), 'utf8');
  assert.match(css, /#globo\.flujo-caja\.fuera \{ opacity:0/);
});

test('guion Gartner · 3 tendencias (World Models, DSLM, MAS) para PortAventuraNeXT: Carlos ↔ Bonomi, 14 turnos bilingües, cifras tal como las dan los PDF', async () => {
  const { GUION_GARTNER: G, GUION_CARLOS_BONOMI: CB, parseLang, lineasTurno } = await import('./escena0-guion.mjs');
  assert.equal(parseGuion('gartner'), G);
  assert.equal(parseGuion('carlos-bonomi'), CB);
  assert.equal(CB.turnos.length, 12);
  assert.equal(G.turnos.length, 14);
  assert.ok(G.soloGuion && G.sinVoz && G.bilingue);
  assert.equal(G.cierreTitulo, 'PortAventuraNeXT');
  assert.equal(parseGuion('gartner3'), G);
  assert.equal(parseLang(null, G), 'both');
  G.turnos.forEach((t, i) => {
    assert.equal(t.persona, i % 2 ? 'Carlos Silva' : 'Carlo Bonomi', 'turno ' + (i + 1));
    assert.ok(t.en && t.en.length > 10);
    assert.deepEqual(lineasTurno(t, null, 'both').map((l) => l.lang), ['es', 'en']);
  });
  const en = G.turnos.map((t) => t.en).join(' ');
  for (const frase of [/40% of robotics applications will incorporate world models/, /less than 1% in 2025/, /training costs will fall tenfold within three years/, /simulate future states, predict outcomes and understand the consequences of their actions before execution/, /30% of GenAI workloads to run DSLMs on-premises or on-device by 2028/, /70% of MAS to use narrowly specialized agents by 2027, improving accuracy but increasing coordination complexity/]) assert.match(en, frase);
  // Orden pedido por Carlos: World Models → DSLM → MAS; y honestidad sobre la lista (DSLM y MAS son de 2026).
  const iWM = en.indexOf('What is a world model'), iDS = en.indexOf('domain-specific language models, trained'), iMA = en.indexOf('Third: multiagent systems');
  assert.ok(iWM > 0 && iWM < iDS && iDS < iMA);
  assert.match(en, /world models are on the 2027 list; the other two come from the 2026 list/);
  assert.ok(!/CEO|presidente|director|fundador/i.test(G.turnos.filter((t) => t.persona === 'Carlo Bonomi').map((t) => t.texto + t.en).join(' ')));
  const html = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  assert.match(html, /guion=gartner&amp;cabecera=bonomi">Demo · Gartner · 3 tendencias PortAventuraNeXT · Carlos Silva ↔ Carlo Bonomi/);
});

test('neón «PortAventuraNeXT» en la mesa de los Coetáneos: solo en el flujo de escena0 y en la home con ?demo=pan', async () => {
  const { LOGO_DEMO } = await import('./escena0-guion.mjs');
  const { existsSync } = await import('node:fs');
  assert.equal(LOGO_DEMO.mesa, 'coetaneos');
  assert.ok(existsSync(new URL('.' + LOGO_DEMO.foto.split('?')[0], import.meta.url)));
  const ctx = {}; ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctx);
  assert.deepEqual({ ...ctx.CouncilCabeceraLib.LOGO }, { ...LOGO_DEMO }, 'home y escena0 usan el mismo parche');
  const cab = readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8');
  assert.match(cab, /hasAttribute\('data-demo-pan'\)/, 'la home normal sigue con AdmiraNext');
  const demo = readFileSync(new URL('./assets/consejo-demo.js', import.meta.url), 'utf8');
  assert.ok(demo.indexOf("setAttribute('data-demo-pan'") > demo.indexOf("if (!/^(pan|consejo|portaventura|portaventuranext)$/.test(modo)) return;"), 'solo con ?demo=pan');
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /if \(!flujo \|\| mesaVista !== LOGO_DEMO\.mesa/);
});
