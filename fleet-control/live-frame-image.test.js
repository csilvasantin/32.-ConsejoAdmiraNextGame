'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseFrameOptions, jpegDimensions, frameSize, optimizeLiveFrame } = require('./live-frame-image');
const { isPrivateServeRequest } = require('./private-network');

const options = (query) => parseFrameOptions(new URLSearchParams(query));
function fakeJpeg(width, height) {
  const b = Buffer.alloc(240);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8]).copy(b);
  b.writeUInt16BE(height, 7); b.writeUInt16BE(width, 9);
  return b;
}

test('frame settings accept fractional panel controls and default to 1600px / quality60', () => {
  assert.deepEqual(options(''), { scale: null, quality: 60, maxWidth: null, defaultWidth: 1600 });
  assert.equal(options('scale=0.5&q=0.6').quality, 60);
  assert.equal(options('scale=2&q=800').scale, 1);
  assert.equal(options('scale=-5&q=-5').quality, 20);
  assert.equal(options('scale=-5').scale, 0.1);
  for (const q of ['scale=NaN', 'q=Infinity', 'scale=0.5;rm', 'q=foo']) assert.throws(() => options(q), /no numérico/);
  assert.deepEqual(frameSize({ width: 2560, height: 1440 }, options('')), { width: 1600, height: 900, longEdge: 1600 });
  assert.deepEqual(frameSize({ width: 2560, height: 1440 }, options('scale=0.5')), { width: 1280, height: 720, longEdge: 1280 });
  assert.deepEqual(frameSize({ width: 1440, height: 2560 }, options('scale=0.5')), { width: 720, height: 1280, longEdge: 1280 });
  assert.deepEqual(frameSize({ width: 5120, height: 2880 }, options('scale=0.6&maxWidth=1600')), { width: 1600, height: 900, longEdge: 1600 });
  assert.equal(frameSize({ width: 5120, height: 2880 }, options('scale=1&maxWidth=2560')).width, 2560);
  assert.throws(() => options('maxWidth=NaN'), /no numérico/);
  assert.equal(frameSize({ width: 1000, height: 500 }, options('')).width, 1000);
});

test('dimension parsing does not accept truncated/malformed markers', () => {
  assert.deepEqual(jpegDimensions(fakeJpeg(2560, 1440)), { width: 2560, height: 1440 });
  assert.equal(jpegDimensions(Buffer.from('hello')), null);
  assert.equal(jpegDimensions(fakeJpeg(2560, 1440).subarray(0, 10)), null);
  const bad = fakeJpeg(2560, 1440); bad.writeUInt16BE(1, 4);
  assert.equal(jpegDimensions(bad), null);
});

test('each transform has private temporary files, safe numeric argv and cleanup', async () => {
  const paths = [];
  const mock = async (command, args) => {
    assert.equal(command, '/usr/bin/sips');
    assert.deepEqual(args.slice(0, 8), ['-Z', '1280', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60']);
    const input = args[8], output = args[10]; paths.push(input);
    assert.equal((await fs.stat(input)).mode & 0o777, 0o600);
    await fs.writeFile(output, fakeJpeg(1280, 720));
  };
  const frames = await Promise.all([1, 2].map(() => optimizeLiveFrame(fakeJpeg(2560, 1440), options('scale=0.5&q=0.6'), { runFile: mock })));
  assert.notEqual(paths[0], paths[1]);
  for (const result of frames) {
    assert.equal(result.transformed, true);
    assert.deepEqual(result.size, { width: 1280, height: 720 });
  }
  for (const file of paths) await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('a failed/unavailable transform preserves the fresh frame and cleans temporary files', async () => {
  const jpeg = fakeJpeg(2560, 1440); let dir;
  const result = await optimizeLiveFrame(jpeg, options(''), { runFile: async (_cmd, args) => {
    dir = path.dirname(args[8]); throw new Error('ENOENT');
  } });
  assert.equal(result.jpeg, jpeg);
  assert.equal(result.error, 'frame_transform_failed');
  assert.equal(result.transformed, false);
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
});

test('real sips reduces a 2560x1440 capture to 1280x720', { skip: process.platform !== 'darwin' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-test-'));
  try {
    const width = 2560, height = 1440, row = width * 3;
    const bmp = Buffer.alloc(54 + row * height);
    bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22);
    bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(row * height, 34);
    for (let i = 54; i < bmp.length; i++) bmp[i] = (i * 31 + Math.floor(i / row) * 17) % 256;
    const input = path.join(dir, 'source.bmp'), output = path.join(dir, 'source.jpg');
    await fs.writeFile(input, bmp);
    execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', input, '--out', output], { stdio: 'pipe' });
    const jpeg = await fs.readFile(output);
    const result = await optimizeLiveFrame(jpeg, options('scale=0.5&q=0.6'));
    assert.equal(result.transformed, true);
    assert.deepEqual(result.size, { width: 1280, height: 720 });
    assert.ok(result.jpeg.length < jpeg.length, `${result.jpeg.length} < ${jpeg.length}`);
    assert.ok(result.jpeg.length < jpeg.length / 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('health only reports private for a local Serve proxy with identity, never raw LAN / XFF', () => {
  const req = (peer, headers = {}) => ({ socket: { remoteAddress: peer }, headers });
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateServeRequest(req(peer, { 'tailscale-user-login': 'user@example.test' })), true);
    assert.equal(isPrivateServeRequest(req(peer)), false);
  }
  assert.equal(isPrivateServeRequest(req('192.168.1.3', { 'tailscale-user-login': 'user@example.test', 'x-forwarded-for': '127.0.0.1' })), false);
  assert.equal(isPrivateServeRequest(req('100.64.0.1', { 'tailscale-user-login': 'user@example.test' })), false);
});
