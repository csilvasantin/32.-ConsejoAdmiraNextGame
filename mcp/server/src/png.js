/*
 * Pinta un transcript de sesión como PNG de terminal (superficie agent).
 * El contrato de evidencia vive en el TEXTO (PETICIÓN / $ / salida / misión);
 * la imagen es el papel donde se imprime, igual que el pane de tmux.
 *
 * En Cloudflare Workers no hay PIL: se dibuja un bitmap 5×7 y se empaqueta PNG
 * con deflate (CompressionStream, o node:zlib en los tests).
 */

const PW = 5, PH = 7, SX = 2, SY = 2, PAD = 10, LH = PH * SY + 4, COLS = 108;

// 5×7, una columna = 7 bits (LSB = fila de arriba). 95 glifos 32–126.
const FONT = decodeFont(
  '000000000000002e00000006000600003e143e0000143e0a00003208260000142a3400000006000000001c220000221c0000000a040a0000081c08000020100000000808080000002000000030080600003e223e0000243e2000003a2a2e00002a2a3e00000e083e00002e2a3a00003e2a3a0000023a0600003e2a3e00002e2a3e000000140000002014000000081422000014141400002214080000022a0600003e2a2e00003c0a3c00003e2a1400001c222200003e221c00003e2a2200003e0a0200001c223a00003e083e0000223e22000010201e00003e083600003e202000003e0c3e00003e1c3e00001c221c00003e0a0400001c323c00003e0a340000242a120000023e0200003e203e00001e201e00003e183e000036083600000638060000322a2600003e22220000060830000022223e00000402040000202020000002040000003c0a3c00003e2a1400001c222200003e221c00003e2a2200003e0a0200001c223a00003e083e0000223e22000010201e00003e083600003e202000003e0c3e00003e1c3e00001c221c00003e0a0400001c323c00003e0a340000242a120000023e0200003e203e00001e201e00003e183e000036083600000638060000322a260000083e220000003e000000223e08000008140800',
);

function decodeFont(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 10) {
    const cols = [];
    for (let c = 0; c < 5; c++) cols.push(parseInt(hex.slice(i + c * 2, i + c * 2 + 2), 16));
    out.push(cols);
  }
  return out;
}

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function u32(n) {
  return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

function chunk(type, data) {
  const t = Uint8Array.from(type, (ch) => ch.charCodeAt(0));
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0); body.set(data, t.length);
  const crc = u32(crc32(body));
  const out = new Uint8Array(8 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(crc, 4 + body.length);
  return out;
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'function') {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    const reader = cs.readable.getReader();
    const parts = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const { deflateSync } = await import('node:zlib');
  return deflateSync(bytes);
}

function concat(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function glyph(ch) {
  const code = ch.codePointAt(0) || 32;
  if (code >= 32 && code <= 126) return FONT[code - 32] || FONT[0];
  const plain = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const p = (plain.codePointAt(0) || 32);
  if (p >= 32 && p <= 126) return FONT[p - 32] || FONT[0];
  return FONT[0];
}

function paint(lines) {
  const rows = lines.slice(-34).map((l) => l.replace(/\t/g, '    ').slice(0, COLS));
  const width = PAD * 2 + COLS * (PW * SX + 1);
  const height = PAD * 2 + Math.max(1, rows.length) * LH;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) { rgb[i] = 2; rgb[i + 1] = 8; rgb[i + 2] = 13; }
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 3;
    rgb[o] = 200; rgb[o + 1] = 240; rgb[o + 2] = 255;
  };
  rows.forEach((line, r) => {
    const y0 = PAD + r * LH;
    for (let i = 0; i < line.length; i++) {
      const cols = glyph(line[i]);
      const x0 = PAD + i * (PW * SX + 1);
      for (let c = 0; c < PW; c++) {
        const bits = cols[c] || 0;
        for (let row = 0; row < PH; row++) {
          if (bits & (1 << row)) {
            for (let dy = 0; dy < SY; dy++) {
              for (let dx = 0; dx < SX; dx++) set(x0 + c * SX + dx, y0 + row * SY + dy);
            }
          }
        }
      }
    }
  });
  return { width, height, rgb };
}

export async function pngDeLineas(texto) {
  const lines = String(texto || '').split(/\r?\n/);
  const { width, height, rgb } = paint(lines);
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1);
  }
  const z = await deflate(raw);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  return concat([sig, chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))]);
}

export function esPng(bytes) {
  return bytes && bytes.length > 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
}
