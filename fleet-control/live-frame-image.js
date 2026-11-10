'use strict';

// Only /live/frame uses this transform. Screenshot actions and their original
// display geometry remain unchanged; input coordinates are normalized 0..1.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);

function numberOption(value, name, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean' || !Number.isFinite(Number(value))) throw new Error(name + ' no numérico');
  return Number(value);
}

function parseFrameOptions(params) {
  const rawScale = numberOption(params.get('scale'), 'scale', null);
  const rawQuality = numberOption(params.get('q'), 'q', 60);
  const rawWidth = numberOption(params.get('maxWidth'), 'maxWidth', null);
  return {
    scale: rawScale == null ? null : Math.min(1, Math.max(0.1, rawScale)),
    quality: Math.round(Math.min(95, Math.max(20, rawQuality > 0 && rawQuality <= 1 ? rawQuality * 100 : rawQuality))),
    maxWidth: rawWidth == null ? null : Math.round(Math.min(5120, Math.max(320, rawWidth))),
    defaultWidth: 1600
  };
}

function jpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let at = 2;
  while (at + 3 < buffer.length) {
    if (buffer[at++] !== 0xff) return null;
    while (buffer[at] === 0xff) at++;
    const marker = buffer[at++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (at + 2 > buffer.length) return null;
    const size = buffer.readUInt16BE(at);
    if (size < 2 || at + size > buffer.length) return null;
    if (sof.has(marker)) {
      if (size < 8) return null;
      const height = buffer.readUInt16BE(at + 3), width = buffer.readUInt16BE(at + 5);
      return width && height ? { width, height } : null;
    }
    at += size;
  }
  return null;
}

function frameSize(source, options) {
  // sips -Z constrains the long edge. Convert the requested width/scale to
  // that edge as well for portrait screens, without changing aspect ratio.
  const requested = options.scale == null ? Math.min(1, options.defaultWidth / source.width) : options.scale;
  const scale = options.maxWidth ? Math.min(requested, options.maxWidth / source.width) : requested;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
    longEdge: Math.max(1, Math.round(Math.max(source.width, source.height) * scale))
  };
}

async function optimizeLiveFrame(jpeg, options, deps = {}) {
  const source = jpegDimensions(jpeg);
  if (!source) return { jpeg, source, size: null, transformed: false, error: 'jpeg_dimensions_missing' };
  const size = frameSize(source, options);
  let dir;
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fleet-live-'));
    const input = path.join(dir, 'source.jpg'), output = path.join(dir, 'frame.jpg');
    await fs.writeFile(input, jpeg, { mode: 0o600 });
    await (deps.runFile || runFile)('/usr/bin/sips', [
      '-Z', String(size.longEdge), '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(options.quality), input, '--out', output
    ], { timeout: 3000, maxBuffer: 64 * 1024 });
    const result = await fs.readFile(output);
    const actual = jpegDimensions(result);
    if (!actual || result.length < 200) throw new Error('sips_output_invalid');
    return { jpeg: result, source, size: actual, transformed: true, quality: options.quality };
  } catch (error) {
    // A relay without sips, or a transient transform error, still delivers the
    // fresh captured frame. It must not make the mesh fail over to another hub.
    return { jpeg, source, size: source, transformed: false, error: 'frame_transform_failed' };
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { parseFrameOptions, jpegDimensions, frameSize, optimizeLiveFrame };
