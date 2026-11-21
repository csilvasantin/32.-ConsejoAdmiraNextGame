import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.window = globalThis;
await import('./hablar-cmd.js');
const H = globalThis.AdmiraHablarCmd;
const integ = readFileSync(new URL('./council-integration.js', import.meta.url), 'utf8');
const gb = readFileSync(new URL('./council-grokbot.js', import.meta.url), 'utf8');

test('t1341u: /conversacion a vs b tema, con o sin tilde', () => {
  assert.deepEqual(H.parseLinea('/conversacion jobs vs elon PortAventuraNeXT'), { accion: 'conversacion', a: 'Steve Jobs', b: 'Elon Musk', tema: 'PortAventuraNeXT', turnos: 10 });
  assert.deepEqual(H.parseLinea('/conversación Steve Jobs vs Elon Musk el parque de Salou'), { accion: 'conversacion', a: 'Steve Jobs', b: 'Elon Musk', tema: 'el parque de Salou', turnos: 10 });
  assert.equal(H.parseLinea('/Conversacion woz contra disney IA').b, 'Walt Disney');
});

test('t1341u: /conversacion mal formada no se envía como texto', () => {
  assert.equal(H.parseLinea('/conversacion jobs vs elon').mensaje, 'conversacion-tema');
  assert.equal(H.parseLinea('/conversacion jobs elon tema').mensaje, 'conversacion-uso');
  assert.equal(H.parseLinea('/conversacion jobs vs jobs tema').mensaje, 'conversacion-mismo');
  assert.equal(H.parseLinea('/conversacion').accion, 'error');
});

test('t1341u: /conversacion arranca un duelo en el orquestador de Cloudflare, no un prompt a un GrokBot', () => {
  assert.match(integ, /accion:'duelo'/);
  assert.match(integ, /\/api\/consejo\/sesion/);
  assert.match(integ, /accion:'turno'/);
  assert.match(integ, /linea\.tema/);
  assert.ok(!/sendPreviewTexto\(prompt\)/.test(integ));
});

test('t1341u: @mención habla con otro consejero; sin nombre conocido es texto normal', () => {
  assert.deepEqual(H.parseLinea('@elon hola'), { accion: 'mencion', persona: 'Elon Musk', texto: 'hola' });
  assert.equal(H.parseLinea('@nadie hola'), null);
  assert.equal(H.parseLinea('hola @elon'), null);
});

test('t1341u: integración y selector de destinatario', () => {
  assert.match(integ, /linea\.accion==='conversacion'/);
  assert.match(integ, /linea\.accion==='mencion'/);
  assert.match(integ, /accion:'duelo'/);
  assert.match(gb, /data-chat-destinatario/);
  assert.match(gb, /for\(const name of Object\.keys\(PEOPLE\)\)/);
});
