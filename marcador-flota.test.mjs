// El marcador de la flota se muda de yokup.com a admira.live (Carlos, 16-09-2026):
// yokup se queda con el terreno y la gestión vive aquí, en modo avanzado.
// Se prueba la vista con datos de mentira —nada de red— y que esté cableada en los dos
// sitios por los que Carlos la abre: el CLI y el riel AVANZADO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./marcador.html', import.meta.url), 'utf8');
const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

class Nodo { constructor(){ this.innerHTML=''; this.textContent=''; this.onclick=null; } }
function monta(respuestas){
  const nodos = {}, pedidas = [];
  const ctx = vm.createContext({
    document: { querySelector: (sel) => (nodos[sel] ||= new Nodo()) },
    Date, Math, JSON, Intl, Number, String, Map, Promise, Array, Object, console,
    setInterval: () => 0,
    fetch: async (url) => {
      const ruta = String(url).replace('https://api.yokup.com', '');
      pedidas.push(ruta);
      const r = respuestas[ruta];
      if (r instanceof Error) return { ok: false, status: 503 };
      return { ok: true, status: 200, json: async () => r };
    },
  });
  vm.runInContext(script, ctx);
  return { nodos, pedidas };
}
const espera = () => new Promise((r) => setTimeout(r, 10));

const TRABAJO = {
  ok: true, mode: 'recent', running_count: 0,
  participants: [{ agent: 'NeoMBP16', executor: 'SubNeoMBP16', machine: 'MBP16', kind: 'task',
    reference: 'DCL-abc:a', title: 'Marcador de la flota', state: 'assigned_stale', active_at: Date.now() - 60000 }],
  observations: [
    { process_state: 'open', activity_state: 'unverified', reason: 'no_linked_work' },
    { process_state: 'open', activity_state: 'unverified', reason: 'no_linked_work' },
    { process_state: 'closed', activity_state: 'unverified', reason: 'sin proceso' },
  ],
};
const MARCADOR = { day: '2026-09-16', scores: [
  { agent: 'Neo', objective_points: 100, window_points: 0, mission_points: 100, missions: 5, windows: 0 },
  { agent: 'Trinity', objective_points: 40, window_points: 0, mission_points: 0, missions: 1, windows: 0 },
  { agent: 'Trinity', objective_points: 40, window_points: 0, mission_points: 0, missions: 1, windows: 0 },
]};
const TODO = { '/highscore/active-work': TRABAJO, '/highscore/daily': MARCADOR };

test('la vista lee el marcador y el trabajo vivo, y nada más', async () => {
  const { pedidas } = monta(TODO); await espera();
  assert.deepEqual(pedidas.sort(), ['/highscore/active-work', '/highscore/daily']);
});

test('ordena por total y no se cree el orden en que llegan', async () => {
  const { nodos } = monta(TODO); await espera();
  // Sólo las filas de la tabla: el aviso de arriba también lleva <b> y colarlo aquí
  // convertiría la prueba en un colador.
  assert.deepEqual([...nodos['#marcador'].innerHTML.matchAll(/<td><b>([^<]+)<\/b><\/td>/g)].map((m) => m[1]), ['Neo', 'Trinity', 'Trinity']);
  assert.match(nodos['#marcador'].innerHTML, /<td class="n">200<\/td>/);
});

test('avisa de que el marcador agrupa por persona: Trinity sale dos veces', async () => {
  const { nodos } = monta(TODO); await espera();
  assert.match(nodos['#marcador'].innerHTML, /Trinity ×2/);
  assert.match(nodos['#marcador'].innerHTML, /no se suman/);
});

test('con sesiones abiertas y cero trabajando lo denuncia con el motivo', async () => {
  const { nodos } = monta(TODO); await espera();
  assert.match(nodos['#diagnostico'].innerHTML, /Nadie figura trabajando/);
  assert.match(nodos['#diagnostico'].innerHTML, /2 sesión\(es\) abierta\(s\)/);
  assert.match(nodos['#diagnostico'].innerHTML, /no_linked_work ×2/);
});

test('un trabajo rancio se llama rancio, no «en curso»', async () => {
  const { nodos } = monta(TODO); await espera();
  assert.match(nodos['#diagnostico'].innerHTML, /rancio/);
  assert.match(nodos['#trabajando'].innerHTML, /assigned_stale/);
});

test('si Yokup falla se dice, y lo que sí cargó se pinta', async () => {
  const { nodos } = monta({ ...TODO, '/highscore/daily': new Error('caído') }); await espera();
  assert.match(nodos['#fallo'].innerHTML, /No he podido leer Yokup entero/);
  assert.match(nodos['#fallo'].innerHTML, /HTTP 503/);
  assert.match(nodos['#trabajando'].innerHTML, /NeoMBP16/);
});

test('se abre desde el CLI con /marcador y con /flota', () => {
  assert.match(app, /text\.match\(\/\^\\\/\(marcador\|flota\)\$\/i\)/);
  assert.match(app, /window\.open\("\/marcador\.html", "_blank"\)/);
  assert.match(app, /'\/marcador', '\/flota'/, 'y el autocompletado los conoce');
});

test('y desde el riel AVANZADO, en el grupo Flota', () => {
  const riel = index.slice(index.indexOf('<div class="rail-group">Flota</div>'));
  assert.match(riel.slice(0, 400), /href="\/marcador\.html"/);
  assert.match(riel.slice(0, 400), /CLI: \/marcador/);
});

test('la vista no se indexa: enseña nombres y trabajo interno', () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
});
