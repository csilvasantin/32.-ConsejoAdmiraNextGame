import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, safeReturn, mintCookie, readSession, autorizado, OWNERS } from './functions/_live-gate.js';
import { onRequest } from './functions/_middleware.js';

const LISTA = { emails: ['editor@admira.com', ...OWNERS], superusers: [...OWNERS] };

function envFor(lista = LISTA) {
  return {
    LIVE_GATE_SIGNING_KEY: 'live-gate-test-key-32bytes-minimum',
    WHITELIST_MACHINE_TOKEN: 'secret-token',
    LIVE_GATE_FETCH: async (url) => {
      if (String(url).includes('tokeninfo')) {
        return Response.json({
          aud: '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com',
          iss: 'accounts.google.com',
          email_verified: true,
          email: 'csilva@admira.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        });
      }
      return Response.json(lista);
    },
  };
}

async function cookieFor(email, superuser = true) {
  const set = await mintCookie(envFor(), { email, superuser });
  return set.split(';')[0];
}

function req(path, { method = 'GET', cookie = '', body } = {}) {
  return new Request('https://www.admira.live' + path, {
    method,
    headers: {
      cookie,
      origin: 'https://www.admira.live',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('solo /control /usuarios /presentar /acceso son hard-gate', () => {
  assert.equal(kindOf('/control'), 'control');
  assert.equal(kindOf('/control/'), 'control');
  assert.equal(kindOf('/usuarios.html'), 'usuarios');
  assert.equal(kindOf('/presentar'), 'presentar');
  assert.equal(kindOf('/'), '');
  assert.equal(kindOf('/auth-gate.js'), '');
  assert.equal(kindOf('/13rue/api/hablar'), '');
});

test('safeReturn no abre redirecciones', () => {
  assert.equal(safeReturn('https://evil.example/'), '/presentar');
  assert.equal(safeReturn('/control/'), '/control/');
  assert.equal(safeReturn('//evil'), '/presentar');
});

test('GET /control sin cookie no sirve el HTML', async () => {
  const res = await onRequest({
    request: req('/control/'),
    env: envFor(),
    next: async () => new Response('<html>CONTROL SECRETO</html>'),
  });
  assert.equal(res.status, 401);
  const text = await res.text();
  assert.match(text, /hard gate/i);
  assert.doesNotMatch(text, /CONTROL SECRETO/);
});

test('GET / (marketing/consejo) no pasa por el hard-gate', async () => {
  const res = await onRequest({
    request: req('/'),
    env: envFor(),
    next: async () => new Response('HOME PUBLIC'),
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'HOME PUBLIC');
});

test('editor en whitelist entra a Presentar interno, no a /control', async () => {
  const cookie = await cookieFor('editor@admira.com', false);
  const presentar = await onRequest({
    request: req('/presentar', { cookie }),
    env: envFor(),
    next: async () => new Response('PRESENTAR OK'),
  });
  assert.equal(presentar.status, 200);
  assert.equal(await presentar.text(), 'PRESENTAR OK');
  const control = await onRequest({
    request: req('/control/', { cookie }),
    env: envFor(),
    next: async () => new Response('CONTROL SECRETO'),
  });
  assert.equal(control.status, 403);
  assert.doesNotMatch(await control.text(), /CONTROL SECRETO/);
});

test('superusuario entra a /control y /usuarios', async () => {
  const cookie = await cookieFor('csilva@admira.com', true);
  const control = await onRequest({
    request: req('/control/', { cookie }),
    env: envFor(),
    next: async () => new Response('CONTROL OK'),
  });
  assert.equal(control.status, 200);
  const usuarios = await onRequest({
    request: req('/usuarios', { cookie }),
    env: envFor(),
    next: async () => new Response('USERS OK'),
  });
  assert.equal(usuarios.status, 200);
});

test('POST /acceso con Google válido deja cookie HttpOnly', async () => {
  const res = await onRequest({
    request: req('/acceso', { method: 'POST', body: { credential: 'fake', return_to: '/presentar' } }),
    env: envFor(),
    next: async () => new Response('no'),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  const set = res.headers.get('set-cookie') || '';
  assert.match(set, /__Host-live_session=/);
  assert.match(set, /HttpOnly/i);
  const session = await readSession(new Request('https://www.admira.live/presentar', { headers: { cookie: set.split(';')[0] } }), envFor());
  assert.equal(session.email, 'csilva@admira.com');
  assert.equal(session.superuser, true);
});

test('autorizado: OWNERS entran; extraño no', () => {
  assert.equal(autorizado({ email: 'csilva@admira.com', superuser: true }, LISTA, 'control').ok, true);
  assert.equal(autorizado({ email: 'intruso@cliente.test', superuser: false }, LISTA, 'presentar').ok, false);
});
