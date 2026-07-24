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
      if (url.endsWith("/auth")) return json({ session: "s-primary", exp: Date.now() + 60_000 });
      return json({ machines: [] });
    },
  });

  const out = await mesh.json("/status");
  assert.equal(out.data._mesh.relay.id, "primary");
  assert.equal(out.data._mesh.failover, false);
  assert.deepEqual(calls, [
    "https://primary.test/fleet/api/auth",
    "https://primary.test/fleet/api/status",
  ]);
});

test("conmuta al backup y acuña una sesión propia", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url) => {
      calls.push(url);
      if (url.startsWith("https://primary.test")) throw new Error("primary unreachable");
      if (url.endsWith("/auth")) return json({ session: "s-backup", exp: Date.now() + 60_000 });
      return json({ machines: [{ id: "dgx" }] });
    },
  });

  const out = await mesh.json("/status");
  assert.equal(out.data._mesh.relay.id, "backup");
  assert.equal(out.data._mesh.failover, true);
  assert.ok(calls.includes("https://backup.test/fleet/api/auth"));
  assert.ok(calls.includes("https://backup.test/fleet/api/status"));
});

test("conserva el mismo command id al reintentar por otro relay", async () => {
  const ids = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url, init = {}) => {
      if (url.endsWith("/auth")) return json({ session: "session-" + new URL(url).hostname, exp: Date.now() + 60_000 });
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
      if (url.endsWith("/auth")) return json({ session: "fixed", exp: Date.now() + 60_000 });
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
