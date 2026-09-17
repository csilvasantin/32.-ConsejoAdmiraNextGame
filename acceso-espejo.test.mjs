// La puerta del espejo: en admira.live la sesión de Yokup se abre con el flujo de
// VENTANA (popup), no con el de redirección contra yokup.com. Aquí se fija lo que no
// puede cambiar sin darse cuenta: a qué host se le manda la cookie, que el token nunca
// pasa por JavaScript y que la página no se enseña antes de saber si hay sesión.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fuente = await readFile(new URL('./acceso-espejo.js', import.meta.url), 'utf8');

// Un navegador de mentira, lo justo para que el guion arranque sin red ni DOM real.
function navegador({ sesion = null } = {}) {
  const pedidas = [];
  const nodo = () => ({ id: '', src: '', textContent: '', innerHTML: '', classList: { add() {}, remove() {} },
    appendChild() {}, addEventListener() {}, remove() {}, querySelector: () => null, set onload(_) {}, set onerror(_) {} });
  const ctx = {
    document: { documentElement: { classList: { add() {}, remove() {} } }, head: nodo(), body: nodo(),
      createElement: nodo, getElementById: () => null, querySelector: () => null, addEventListener() {} },
    location: { reload() {}, origin: 'https://www.admira.live' },
    localStorage: { setItem() {}, getItem: () => null },
    Promise, JSON, String, Object, setTimeout, console,
    fetch: async (url, init) => {
      pedidas.push({ url: String(url), init: init || {} });
      if (String(url).endsWith('/auth/session')) {
        return sesion ? { ok: true, json: async () => sesion } : { ok: false, json: async () => ({ ok: false }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fuente, ctx);
  return { ctx, pedidas };
}
const respira = () => new Promise((r) => setTimeout(r, 10));

test('la cookie sólo viaja al worker de Yokup, y no a un dominio que se le parezca', () => {
  const { ctx } = navegador();
  const { esDelWorker, WORKER } = ctx.__ykEspejoTest;
  assert.equal(WORKER, 'https://api.yokup.com');
  for (const bueno of ['https://api.yokup.com', 'https://api.yokup.com/auth/session', 'https://api.yokup.com?x=1']) {
    assert.equal(esDelWorker(bueno), true, bueno + ' debería recibir la cookie');
  }
  for (const malo of ['https://api.yokup.com.evil.net/auth/session', 'https://otro.example/', 'http://api.yokup.com/x',
                      'https://bot.yokup.com/api/presence']) {
    assert.equal(esDelWorker(malo), false, malo + ' NO debería recibir la cookie');
  }
});

test('con sesión abierta, la página se destapa y no se pide login', async () => {
  const { pedidas } = navegador({ sesion: { ok: true, email: 'csilva@admira.com' } });
  await respira();
  assert.deepEqual(pedidas.map((p) => p.url), ['https://api.yokup.com/auth/session']);
  assert.equal(pedidas[0].init.credentials, 'include', 'la comprobación de sesión tiene que llevar la cookie');
});

test('las peticiones al worker esperan a la sesión y van con credenciales', async () => {
  const { ctx, pedidas } = navegador({ sesion: { ok: true, email: 'csilva@admira.com' } });
  await respira();
  await ctx.fetch('https://api.yokup.com/tasks/all?scope=fleet');
  const ultima = pedidas[pedidas.length - 1];
  assert.match(ultima.url, /\/tasks\/all/);
  assert.equal(ultima.init.credentials, 'include');
});

test('lo que no es del worker pasa intacto: no se le cuela la cookie', async () => {
  const { ctx, pedidas } = navegador({ sesion: { ok: true, email: 'csilva@admira.com' } });
  await respira();
  await ctx.fetch('https://bot.yokup.com/api/presence');
  const ultima = pedidas[pedidas.length - 1];
  assert.match(ultima.url, /bot\.yokup\.com/);
  assert.equal(ultima.init.credentials, undefined, 'a bot.yokup.com no se le manda la sesión');
});

test('es el flujo de ventana, no el de redirección de yokup', () => {
  assert.match(fuente, /flow: "popup"/);
  assert.match(fuente, /ux_mode: "popup"/);
  // Nada de `login_uri:` ni `ux_mode: "redirect"` en el código: el flujo de ventana no
  // necesita callback propio, que es justo lo que nos ahorra dar de alta una URI nueva.
  // (Los comentarios sí nombran el callback de yokup, para explicar por qué NO se usa.)
  const codigo = fuente.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  assert.equal(/login_uri\s*:/.test(codigo), false, 'el flujo de ventana no usa callback propio');
  assert.equal(/ux_mode:\s*"redirect"/.test(codigo), false);
  assert.match(fuente, /state_cookie_domain: "admira\.live"/);
});

test('el token de sesión no pasa por JavaScript ni se guarda', () => {
  // Lo único que se guarda es el correo, para pintarlo. La sesión vive en una cookie
  // HttpOnly de api.yokup.com que este guion no puede leer.
  const guardados = [...fuente.matchAll(/localStorage\.setItem\(([^,]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(guardados, ['"yk_email"']);
  assert.equal(/localStorage\.setItem\("yk_session/.test(fuente), false);
});

test('la página no se enseña antes de saber si hay sesión', () => {
  assert.match(fuente, /classList\.add\("yk-locked"\)/);
  assert.match(fuente, /html\.yk-locked body\{visibility:hidden!important\}/);
});

test('un correo fuera de la lista se dice con esas palabras, no con un error genérico', () => {
  assert.match(fuente, /not_allowed/);
  assert.match(fuente, /no está en la lista de acceso/);
});
