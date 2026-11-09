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
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com", csrf:"csrf-primary" });
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
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com", csrf:"csrf-backup" });
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
  const csrf = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url, init = {}) => {
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com", csrf:url.includes("primary")?"csrf-primary":"csrf-backup" });
      ids.push(new Headers(init.headers).get("X-Fleet-Command-Id"));
      csrf.push(new Headers(init.headers).get("X-Fleet-CSRF"));
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
  assert.deepEqual(csrf, ["csrf-primary", "csrf-backup"]);
});

test("fija una sesión interactiva al relay indicado", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    getCredential: async () => "google",
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/auth/session")) return json({ ok:true, email:"owner@example.com", csrf:"csrf-backup" });
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
    if (url.endsWith("/auth/session")) return resolve(json({ ok:true, email:"owner@example.com", csrf:"csrf-value" }));
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

test("un 400 de censo no se reintenta en otro relay", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/auth/session")) return json({ ok: true, email: "owner@example.com", csrf: "csrf-value" });
      return json({ error: "máquina desconocida", retry: false, relay: false }, { status: 400 });
    },
  });

  const response = await mesh.request("/live/frame?machine=admira-macbookairplata");
  assert.equal(response.status, 400);
  assert.ok(calls.every((url) => url.startsWith("https://primary.test")));
  assert.equal(calls.filter((url) => url.includes("/live/frame")).length, 1);
});

test("un 502 de fotograma se queda en el relay que tiene la sesión", async () => {
  const calls = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/auth/session")) return json({ ok: true, email: "owner@example.com", csrf: "csrf-value" });
      if (url.startsWith("https://primary.test")) return json({ error: "relay no disponible" }, { status: 502 });
      return json({ ok: true });
    },
  });

  const out = await mesh.json("/live/frame?machine=macbookairplata");
  assert.equal(out.response.status, 502);
  assert.equal(out.data._mesh.relay.id, "primary");
  assert.equal(out.data._mesh.sticky, true);
  assert.ok(calls.filter((url) => url.includes("/live/frame")).every((url) => url.startsWith("https://primary.test")));
});

test("un censo lento no aparta el relay que ya tiene la sesión", async () => {
  const seen = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    timeoutMs: 400,
    cooldownMs: 60000,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/auth/session")) {
        if (url.startsWith("https://backup.test")) return json({ ok: false }, { status: 401 });
        return json({ ok: true, email: "owner@example.com", csrf: "csrf-value" });
      }
      if (url.includes("/status")) {
        seen.push(new URL(url).host);
        await new Promise((resolve, reject) => {
          const signal = init.signal;
          if (signal) signal.addEventListener("abort", () => reject(signal.reason || new Error("aborted")));
        });
      }
      seen.push("frame:" + new URL(url).host);
      return json({ ok: true });
    },
  });

  await mesh.json("/status").then(() => { throw new Error("el censo no debía resolverse"); }, () => {});
  const frame = await mesh.request("/live/frame?machine=macbookairplata");
  assert.deepEqual(seen.filter((item) => item === "primary.test"), ["primary.test"]);
  assert.equal(seen.includes("backup.test"), false);
  assert.equal(frame.__admiraMesh.relay.id, "primary");
  assert.equal(frame.__admiraMesh.failover, false);
});

test("el fotograma no salta a un relay sin la cookie cuando el de la sesión no contesta", async () => {
  const frames = [];
  const mesh = create({
    relays: RELAYS,
    store: store(),
    timeoutMs: 400,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/auth/session")) return json({ ok: true, email: "owner@example.com", csrf: "csrf-value" });
      if (url.includes("/live/frame")) {
        frames.push(new URL(url).host);
        if (url.startsWith("https://primary.test")) {
          await new Promise((resolve, reject) => {
            const signal = init.signal;
            if (signal) signal.addEventListener("abort", () => reject(signal.reason || new Error("aborted")));
          });
        }
      }
      return json({ ok: true });
    },
  });

  const err = await mesh.request("/live/frame?machine=macbookairplata").then(() => null, (e) => e);
  assert.equal(err.fleetMeshTimeout, true);
  assert.deepEqual(frames, ["primary.test"]);
});

test("una caída de red del fotograma sí prueba el otro relay", async () => {
  const mesh = create({
    relays: RELAYS,
    store: store(),
    fetch: async (url) => {
      if (url.endsWith("/auth/session")) return json({ ok: true, email: "owner@example.com", csrf: "csrf-value" });
      if (url.startsWith("https://primary.test") && url.includes("/live/frame")) throw new Error("network down");
      return json({ ok: true });
    },
  });

  const frame = await mesh.request("/live/frame?machine=macmini");
  assert.equal(frame.__admiraMesh.relay.id, "backup");
  assert.equal(frame.__admiraMesh.failover, true);
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

const PUBLIC_BASE = "https://fleet.admira.live/api";
const PRIVATE_BASE = "https://macmini.tail48b61c.ts.net/fleet/api";
const PRIVATE_RELAYS = globalThis.AdmiraFleetMesh.DEFAULT_RELAYS.slice(0, 2);
const health = (privateRoute) => json({ ok: true, service: "fleet-control", relay: { id: "hub-macmini" }, network: { private: privateRoute } });

test("una ruta privada con sesión propia sustituye a la puerta pública ya activa", async () => {
  const calls = [];
  let releaseHealth;
  const pendingHealth = new Promise((resolve) => { releaseHealth = resolve; });
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url, init = {}) => {
      calls.push({ url, credentials: init.credentials, csrf: new Headers(init.headers).get("X-Fleet-CSRF") });
      if (url === PRIVATE_BASE + "/health") return pendingHealth;
      if (url === PUBLIC_BASE + "/health") return health(false);
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: url.startsWith(PRIVATE_BASE) ? "private-csrf" : "public-csrf" });
      return json({ ok: true });
    },
  });
  // El sondeo directo no detiene ni el primer estado ni el primer fotograma.
  const first = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(first.__admiraMesh.relay.id, "proxy");
  releaseHealth(health(true));
  await mesh.probeAll();
  const direct = await mesh.request("/input", { method: "POST", body: "{}" });
  assert.equal(direct.__admiraMesh.relay.id, "macmini");
  assert.ok(calls.some((c) => c.url === PRIVATE_BASE + "/auth/session" && c.credentials === "include"));
  assert.equal(calls.find((c) => c.url === PRIVATE_BASE + "/input").csrf, "private-csrf");
  assert.equal(calls.some((c) => c.url === PRIVATE_BASE + "/input" && c.csrf === "public-csrf"), false);
});

test("un nombre ts.net por Funnel no se trata como ruta privada", async () => {
  const calls = [];
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/health")) return health(false);
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "public-csrf" });
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
  assert.equal(calls.includes(PRIVATE_BASE + "/auth/session"), false);
  assert.equal(calls.some((url) => url.startsWith(PRIVATE_BASE + "/live/frame")), false);
});

test("una ruta privada sin su cookie conserva la sesión de la puerta pública", async () => {
  const calls = [];
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url === PRIVATE_BASE + "/auth/session") return json({ ok: false }, { status: 401 });
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "public-csrf" });
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
  assert.equal(calls.some((url) => url.startsWith(PRIVATE_BASE + "/live/frame")), false);
});

test("LNA denegado no retrasa ni cambia el relay público", async () => {
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      if (url.startsWith(PRIVATE_BASE)) throw new TypeError("Local Network Access denied");
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "public-csrf" });
      return health(false);
    },
  });
  await mesh.probeAll();
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
});

test("el sondeo privado colgado tiene un límite breve y no bloquea la lectura pública", async () => {
  let aborted = false;
  const mesh = create({
    relays: PRIVATE_RELAYS,
    privateProbeMs: 500,
    fetch: async (url, init) => {
      if (url.startsWith(PRIVATE_BASE)) return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => { aborted = true; reject(init.signal.reason); });
      });
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "public-csrf" });
      return health(false);
    },
  });
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
  assert.equal(aborted, false, "la lectura pública termina antes del sondeo privado");
  await mesh.probeAll();
  assert.equal(aborted, true);
});

test("si cae el relay privado acreditado, el fotograma vuelve al público", async () => {
  let privateDown = false;
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "csrf-" + new URL(url).host });
      if (privateDown && url.startsWith(PRIVATE_BASE)) throw new Error("tailnet disconnected");
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  assert.equal((await mesh.request("/live/frame?machine=macstudio")).__admiraMesh.relay.id, "macmini");
  privateDown = true;
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
  assert.deepEqual(frame.__admiraMesh.attempts.map((a) => a.relay), ["macmini", "proxy"]);
});

test("una sesión privada de agente sigue sin permitir escrituras por failover", async () => {
  const mutations = [];
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url, init = {}) => {
      if (init.method === "POST") mutations.push(url);
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url === PRIVATE_BASE + "/auth/session") return json({ ok: true, agent: true, readOnly: true, csrf: "ignored" });
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "public-csrf" });
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  assert.equal(mesh.agentReadOnly(), true);
  await assert.rejects(mesh.request("/input", { method: "POST", body: "{}" }), /solo lectura/);
  assert.deepEqual(mutations, []);
});

test("el puente usa CSRF humano y consume una vez el ticket antes de autenticar el host privado", async () => {
  const calls = [];
  let privateCookie = false;
  const ticket = "opaque-single-use-ticket";
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url === PRIVATE_BASE + "/auth/session") return privateCookie
        ? json({ ok: true, csrf: "private-csrf" }) : json({ ok: false }, { status: 401 });
      if (url === PUBLIC_BASE + "/auth/session") return json({ ok: true, csrf: "public-csrf" });
      if (url === PUBLIC_BASE + "/auth/relay-ticket") return json({ ok: true, ticket, relay: "hub-macmini" });
      if (url === PRIVATE_BASE + "/auth/relay-ticket/consume") {
        assert.equal(JSON.parse(init.body).ticket, ticket);
        privateCookie = true;
        return json({ ok: true });
      }
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "macmini");
  const issues = calls.filter((c) => c.url === PUBLIC_BASE + "/auth/relay-ticket");
  const consumes = calls.filter((c) => c.url === PRIVATE_BASE + "/auth/relay-ticket/consume");
  assert.equal(issues.length, 1);
  assert.equal(consumes.length, 1);
  assert.equal(issues[0].init.method, "POST");
  assert.equal(new Headers(issues[0].init.headers).get("X-Fleet-CSRF"), "public-csrf");
  assert.equal(consumes[0].init.credentials, "include");
  assert.equal(consumes[0].init.redirect, "error");
  assert.equal(calls.filter((c) => c.url === PRIVATE_BASE + "/auth/session").length, 2);
  assert.equal(calls.some((c) => c.url.includes(ticket)), false);
  assert.equal(JSON.stringify(mesh.snapshot()).includes(ticket), false);
});

test("el puente no convierte una sesión de agente público en sesión humana privada", async () => {
  const tickets = [];
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      if (url.includes("relay-ticket")) tickets.push(url);
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url === PRIVATE_BASE + "/auth/session") return json({ ok: false }, { status: 401 });
      if (url === PUBLIC_BASE + "/auth/session") return json({ ok: true, agent: true, readOnly: true, csrf: "ignore-this" });
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  assert.equal((await mesh.request("/live/frame?machine=macstudio")).__admiraMesh.relay.id, "proxy");
  assert.equal(mesh.agentReadOnly(), true);
  assert.deepEqual(tickets, []);
});

test("si el navegador bloquea el consumo privado, el puente falla cerrado y sigue por la puerta pública", async () => {
  const tickets = [];
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      if (url.includes("relay-ticket")) tickets.push(url);
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url === PRIVATE_BASE + "/auth/session") return json({ ok: false }, { status: 401 });
      if (url === PUBLIC_BASE + "/auth/session") return json({ ok: true, csrf: "public-csrf" });
      if (url === PUBLIC_BASE + "/auth/relay-ticket") return json({ ok: true, ticket: "do-not-log", relay: "hub-macmini" });
      if (url.endsWith("/auth/relay-ticket/consume")) throw new Error("blocked do-not-log");
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  const frame = await mesh.request("/live/frame?machine=macstudio");
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
  assert.deepEqual(tickets, [PUBLIC_BASE + "/auth/relay-ticket", PRIVATE_BASE + "/auth/relay-ticket/consume"]);
  assert.equal(JSON.stringify(mesh.snapshot()).includes("do-not-log"), false);
});

test("un ticket emitido por otro hub no se entrega al relay privado", async () => {
  let consumed = false;
  const mesh = create({
    relays: PRIVATE_RELAYS,
    fetch: async (url) => {
      if (url.endsWith("/health")) return health(url.startsWith(PRIVATE_BASE));
      if (url === PRIVATE_BASE + "/auth/session") return json({ ok: false }, { status: 401 });
      if (url === PUBLIC_BASE + "/auth/session") return json({ ok: true, csrf: "public-csrf" });
      if (url === PUBLIC_BASE + "/auth/relay-ticket") return json({ ok: true, ticket: "other-hub-ticket", relay: "hub-mbp16" });
      if (url.endsWith("/auth/relay-ticket/consume")) consumed = true;
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  assert.equal((await mesh.request("/live/frame?machine=macstudio")).__admiraMesh.relay.id, "proxy");
  assert.equal(consumed, false);
});

test("un sondeo privado fallido durante un fotograma pendiente conserva su failover por timeout", async () => {
  let privateHealthDown = false;
  let frameStarted;
  const pendingFrame = new Promise((resolve) => { frameStarted = resolve; });
  const mesh = create({
    relays: PRIVATE_RELAYS,
    timeoutMs: 500,
    fetch: async (url, init = {}) => {
      if (url === PRIVATE_BASE + "/health") {
        if (privateHealthDown) throw new Error("tailnet disconnected");
        return health(true);
      }
      if (url === PUBLIC_BASE + "/health") return health(false);
      if (url.endsWith("/auth/session")) return json({ ok: true, csrf: "csrf-" + new URL(url).host });
      if (url.startsWith(PRIVATE_BASE + "/live/frame")) {
        frameStarted();
        return new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        });
      }
      return json({ ok: true });
    },
  });
  await mesh.probeAll();
  const framePromise = mesh.request("/live/frame?machine=macstudio");
  await pendingFrame;
  privateHealthDown = true;
  await mesh.probeAll();
  assert.equal(mesh.snapshot().relays.find((r) => r.relay.id === "macmini").state.privateUntil, 0);
  const frame = await framePromise;
  assert.equal(frame.__admiraMesh.relay.id, "proxy");
  assert.deepEqual(frame.__admiraMesh.attempts.map((a) => a.relay), ["macmini", "proxy"]);
});
