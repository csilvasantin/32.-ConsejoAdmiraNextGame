import test from "node:test";
import assert from "node:assert/strict";
import { cabeceras } from "./chat-hilo-http.mjs";

test("CORS del chat permite el modo experto de admiranext.com (Bearer, no cookie)", () => {
  for (const origin of ["https://www.admiranext.com", "https://admiranext.com", "https://www.admira.live", "https://admira.live"]) {
    const h = cabeceras(origin, "POST, OPTIONS");
    assert.equal(h["access-control-allow-origin"], origin, origin);
    assert.match(h["access-control-allow-headers"], /Authorization/);
    assert.match(h["access-control-allow-methods"], /POST/);
  }
  const no = cabeceras("https://evil.example", "POST, OPTIONS");
  assert.equal(no["access-control-allow-origin"], undefined);
});
