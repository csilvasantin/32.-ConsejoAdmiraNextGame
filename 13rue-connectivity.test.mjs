import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

function loadConnectivity() {
  const context = { module:{ exports:{} }, exports:{}, globalThis:{} };
  vm.runInNewContext(source("./13rue/conectividad.js"), context);
  return context.module.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, bad) => { resolve = ok; reject = bad; });
  return { promise, resolve, reject };
}

function response(tick = 1) {
  return {
    ok:true,
    status:200,
    json:async () => ({ tick, log:[], state:{ fridge:4 } })
  };
}

function fakeTimers() {
  let next = 1;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    intervals,
    timeouts,
    setInterval(fn, ms) { const id = next++; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn, ms) { const id = next++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    fireIntervals() { for (const item of [...intervals.values()]) item.fn(); }
  };
}

function harness(fetchPlan = []) {
  const sockets = [];
  const timers = fakeTimers();
  const polls = [];
  const modes = [];
  let localTicks = 0;

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.closed = false;
      sockets.push(this);
    }
    open() { if (this.onopen) this.onopen(); }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (this.onclose) this.onclose();
    }
    remoteClose() { this.close(); }
  }

  const fetchCalls = [];
  function fakeFetch(url) {
    fetchCalls.push(url);
    if (!fetchPlan.length) return Promise.resolve(response(fetchCalls.length));
    const next = fetchPlan.shift();
    return typeof next === "function" ? next(url) : next;
  }

  const controller = loadConnectivity().create({
    bus:"https://bus.test",
    wsUrl:"wss://bus.test/ws",
    fetch:fakeFetch,
    WebSocket:FakeWebSocket,
    setInterval:timers.setInterval,
    clearInterval:timers.clearInterval,
    setTimeout:timers.setTimeout,
    clearTimeout:timers.clearTimeout,
    pollMs:15,
    localMs:14,
    connectMs:60,
    onMode:(mode) => modes.push(mode),
    onPoll:(data) => polls.push(data.tick),
    onLocalTick:() => { localTicks += 1; }
  });

  return {
    controller,
    sockets,
    timers,
    polls,
    modes,
    fetchCalls,
    localTicks:() => localTicks
  };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

test("Implementar y Enjambre hablan por el proxy same-origin", () => {
  for (const path of ["./13rue/implementar.html", "./13rue/enjambre.html"]) {
    const html = source(path);
    assert.match(html, /BUS\s*=\s*["']\/13rue\/api\/hablar["']/,
      `${path} debe usar /13rue/api/hablar`);
    assert.doesNotMatch(html, /incubadora-bus\.csilvasantin\.workers\.dev\/hablar/,
      `${path} no debe saltarse el proxy same-origin`);
  }
});

test("index conecta el controlador generacional", () => {
  const html = source("./13rue/index.html");
  const controller = source("./13rue/conectividad.js");
  assert.match(html, /src="conectividad\.js\?v=/);
  assert.match(html, /window\.Conectividad13\.create/);
  assert.match(html, /conexion\.isPaused\(\)\?play\(\):pause\(\)/);
  assert.match(controller, /socket\.onopen[\s\S]*?limpiaTimer\(\);[\s\S]*?ws = socket;/,
    "al abrir WebSocket se limpian timers anteriores antes de publicarlo");
});

test("abrir → pausar cierra el WebSocket activo y también el que negocia", async () => {
  const active = harness();
  const opened = active.controller.play();
  active.sockets[0].open();
  assert.equal(await opened, true);
  assert.equal(active.controller.snapshot().modo, "vivo");
  assert.equal(active.timers.timeouts.size, 0, "open limpia el timeout de negociación");

  active.controller.pause();
  assert.equal(active.sockets[0].closed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(active.controller.snapshot())), {
    pausado:true, intento:2, modo:"pausa", socket:false, negociando:false,
    timer:null, timerIntento:null
  });

  const pending = harness();
  const negotiating = pending.controller.play();
  assert.equal(pending.controller.snapshot().negociando, true);
  pending.controller.pause();
  assert.equal(pending.sockets[0].closed, true, "Pausar cierra el socket aún sin onopen");
  assert.equal(await negotiating, false, "la promesa negociadora siempre queda resuelta");
  assert.equal(pending.timers.timeouts.size, 0);

  const earlyClose = harness([Promise.resolve(response(3))]);
  const closing = earlyClose.controller.play();
  earlyClose.sockets[0].remoteClose();
  assert.equal(await closing, true, "un cierre antes de open rechaza WS y completa el fallback");
  assert.equal(earlyClose.controller.snapshot().negociando, false);
  assert.equal(earlyClose.controller.snapshot().timer, "sondeo");
});

test("cierre remoto → polling instala un único timer de sondeo", async () => {
  const h = harness([Promise.resolve(response(7))]);
  const opened = h.controller.play();
  h.sockets[0].open();
  await opened;

  h.sockets[0].remoteClose();
  await flush();

  assert.equal(h.controller.snapshot().modo, "sondeo");
  assert.equal(h.controller.snapshot().timer, "sondeo");
  assert.equal(h.controller.snapshot().timerIntento, 1);
  assert.deepEqual(h.polls, [7]);
  assert.equal(h.timers.intervals.size, 1);
});

test("si el polling periódico falla, detiene su timer y cae a local", async () => {
  const h = harness([
    Promise.resolve(response(8)),
    Promise.reject(new Error("poll caído"))
  ]);
  const opened = h.controller.play();
  h.sockets[0].open();
  await opened;
  h.sockets[0].remoteClose();
  await flush();
  assert.equal(h.controller.snapshot().timer, "sondeo");

  h.timers.fireIntervals();
  await flush();

  assert.equal(h.controller.snapshot().modo, "local");
  assert.equal(h.controller.snapshot().timer, "local");
  assert.equal(h.timers.intervals.size, 1, "el timer de sondeo fue sustituido, no acumulado");
  assert.equal(h.localTicks(), 1, "el motor local arranca inmediatamente");
});

test("fallback pendiente → pausar → reanudar no instala timer obsoleto", async () => {
  const oldPoll = deferred();
  const h = harness([oldPoll.promise]);
  const first = h.controller.play();
  h.sockets[0].open();
  await first;
  h.sockets[0].remoteClose();
  assert.equal(h.controller.snapshot().modo, "sondeo");
  assert.equal(h.controller.snapshot().timer, null, "el primer fetch aún está pendiente");

  h.controller.pause();
  const second = h.controller.play();
  h.sockets[1].open();
  assert.equal(await second, true);
  assert.equal(h.controller.snapshot().modo, "vivo");

  oldPoll.resolve(response(9));
  await flush();

  assert.equal(h.controller.snapshot().intento, 3);
  assert.equal(h.controller.snapshot().modo, "vivo");
  assert.equal(h.controller.snapshot().timer, null);
  assert.deepEqual(h.polls, [], "la respuesta del intento 1 no llega a la conexión 3");
  assert.equal(h.timers.intervals.size, 0);
});
