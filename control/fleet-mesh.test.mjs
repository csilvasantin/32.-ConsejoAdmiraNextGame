import test from "node:test";
import assert from "node:assert/strict";

await import("./fleet-mesh.js");
const { create } = globalThis.AdmiraFleetMesh;

const RELAYS = [
  { id: "primary", label: "Primary", base: "https://primary.test/fleet/api", priority: 10 },
  { id: "backup", label: "Backup", base: "https://backup.test/fleet/api", priority: 20 },
];

function store() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "content-type": "application/json" },
  });
}

test("usa el relay primario cuando está sano", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com" });
      return json({ machines: [] });
    },
  });

  const out = await mesh.json("/status");
  assert.equal(out.data._mesh.relay.id, "primary");
  assert.equal(out.data._mesh.failover, false);
  assert.deepEqual(calls, [
    "https://primary.test/fleet/api/auth/session",
    "https://primary.test/fleet/api/status",
  ]);
});

test("conmuta al backup cuando ese host ya tiene su cookie independiente", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url) => {
      calls.push(url);
      if (url.startsWith("https://primary.test")) throw new Error("primary unreachable");
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com" });
      return json({ machines: [{ id: "dgx" }] });
    },
  });

  const out = await mesh.json("/status");
  assert.equal(out.data._mesh.relay.id, "backup");
  assert.equal(out.data._mesh.failover, true);
  assert.ok(calls.includes("https://backup.test/fleet/api/auth/session"));
  assert.ok(calls.includes("https://backup.test/fleet/api/status"));
});

test("conserva el mismo command id al reintentar por otro relay", async () => {
  const ids = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url, init = {}) => {
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com" });
      ids.push(new Headers(init.headers).get("X-Fleet-Command-Id"));
      if (url.startsWith("https://primary.test")) return json({ error: "relay error" }, { status: 503 });
      return json({ rc: 0 });
    },
  });

  const out = await mesh.json("/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machine: "dgx", action: "sysinfo" }),
  });
  assert.equal(out.data._mesh.relay.id, "backup");
  assert.equal(ids.length, 2);
  assert.ok(ids[0]);
  assert.equal(ids[0], ids[1]);
});

test("fija una sesión interactiva al relay indicado", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com" });
      return json({ ok: true });
    },
  });

  const out = await mesh.json("/term/input", {
    method: "POST",
    relayId: "backup",
    body: "{}",
  });
  assert.equal(out.data._mesh.relay.id, "backup");
  assert.ok(calls.every((url) => url.startsWith("https://backup.test")));
});

// «signal is aborted without reason» era lo único que veía Carlos en el control
// remoto cuando un relay no contestaba, y el mensaje de arriba lo achacaba a la
// Grabación de pantalla del agente. El vencimiento tiene que decir su nombre.
function colgado({ respetaMotivo }) {
  return (url, init) => new Promise((resolve, reject) => {
    if (url.endsWith("/auth/session")) return resolve(json({ ok:true, email:"owner@example.com" }));
    init.signal.addEventListener("abort", () => {
      if (respetaMotivo) return reject(init.signal.reason);
      const err = new Error("signal is aborted without reason");
      err.name = "AbortError";
      reject(err);
    });
  });
}

test("un relay que no contesta se rechaza diciendo el tiempo de espera y el relay", async () => {
  const mesh = create({
    relays: [RELAYS[0]],
    store: store(),
    timeoutMs: 1000,
    getCredential: async () => "google",
    fetch: colgado({ respetaMotivo: true }),
  });

  const err = await mesh.request("/live/frame").then(() => null, (e) => e);
  assert.ok(err, "la petición tiene que fallar");
  assert.equal(err.fleetMeshTimeout, true);
  assert.match(err.message, /sin respuesta en 1000 ms · Primary/);
  assert.doesNotMatch(err.message, /aborted without reason/);
});

test("aunque el motor ignore el motivo del abort, el fallo sigue explicándose", async () => {
  const mesh = create({
    relays: [RELAYS[0]],
    store: store(),
    timeoutMs: 1000,
    getCredential: async () => "google",
    fetch: colgado({ respetaMotivo: false }),
  });

  const err = await mesh.request("/live/frame").then(() => null, (e) => e);
  assert.match(err.message, /sin respuesta en 1000 ms · Primary/);
  assert.equal(err.mesh.attempts[0].error, "sin respuesta en 1000 ms · Primary");
});
