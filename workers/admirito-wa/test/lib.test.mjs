import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyChallenge, verifySignature, hmacHex, parseMessages, parseAllowed, clampReply } from '../src/lib.js';

test('verifyChallenge acepta token correcto', () => {
  assert.equal(verifyChallenge('https://x/webhook?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=42', 'abc'), '42');
});
test('verifyChallenge rechaza token incorrecto o vacío', () => {
  assert.equal(verifyChallenge('https://x/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42', 'abc'), null);
  assert.equal(verifyChallenge('https://x/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=42', ''), null);
});
test('verifySignature HMAC SHA-256', async () => {
  const body = '{"a":1}';
  const sig = 'sha256=' + await hmacHex('s3cret', body);
  assert.equal(await verifySignature('s3cret', body, sig), true);
  assert.equal(await verifySignature('otro', body, sig), false);
  assert.equal(await verifySignature('s3cret', body + ' ', sig), false);
  assert.equal(await verifySignature('s3cret', body, null), false);
  assert.equal(await verifySignature('', body, sig), false);
});
test('parseMessages: texto, audio, imagen y otros', () => {
  const p = { entry: [{ changes: [{ field: 'messages', value: { messages: [
    { id: '1', from: '34600111222', type: 'text', text: { body: 'hola' } },
    { id: '2', from: '34600111222', type: 'audio', audio: { id: 'A', mime_type: 'audio/ogg; codecs=opus' } },
    { id: '3', from: '34600111222', type: 'image', image: { id: 'I', mime_type: 'image/jpeg', caption: 'mira' } },
    { id: '4', from: '34600111222', type: 'sticker', sticker: { id: 'S' } },
  ] } }, { field: 'statuses', value: {} }] }] };
  const m = parseMessages(p);
  assert.equal(m.length, 4);
  assert.deepEqual(m[0], { id: '1', from: '34600111222', type: 'text', text: 'hola' });
  assert.equal(m[1].mediaId, 'A');
  assert.equal(m[2].caption, 'mira');
  assert.equal(m[3].type, 'sticker');
});
test('parseMessages ignora statuses y payload vacío', () => {
  assert.deepEqual(parseMessages({}), []);
  assert.deepEqual(parseMessages({ entry: [{ changes: [{ field: 'messages', value: { statuses: [{}] } }] }] }), []);
});
test('parseAllowed normaliza números', () => {
  const s = parseAllowed('+34 600 111 222, 34611000000');
  assert.ok(s.has('34600111222'));
  assert.ok(s.has('34611000000'));
});
test('clampReply < 400 y sin markdown', () => {
  const r = clampReply('**Hola** ' + 'palabra '.repeat(200));
  assert.ok(r.length <= 400);
  assert.ok(!r.includes('*'));
});
