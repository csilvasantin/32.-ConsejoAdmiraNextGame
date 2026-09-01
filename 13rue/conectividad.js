/* Ciclo de vida del edificio compartido: WebSocket → sondeo → motor local. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Conectividad13 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function create(options) {
    options = options || {};
    var fetchFn = options.fetch;
    var WebSocketCtor = options.WebSocket;
    var setIntervalFn = options.setInterval || setInterval;
    var clearIntervalFn = options.clearInterval || clearInterval;
    var setTimeoutFn = options.setTimeout || setTimeout;
    var clearTimeoutFn = options.clearTimeout || clearTimeout;
    var pollMs = options.pollMs || 1500;
    var localMs = options.localMs || 1400;
    var connectMs = options.connectMs || 6000;
    var onMode = options.onMode || function () {};
    var onPoll = options.onPoll || function () {};
    var onMessage = options.onMessage || function () {};
    var onLocalTick = options.onLocalTick || function () {};

    var pausado = true;
    var intentoConexion = 0;
    var modo = "pausa";
    var ws = null;
    var negociando = null;
    var timer = null;

    function vigente(intento) {
      return !pausado && intento === intentoConexion;
    }

    function cambiaModo(nuevo, mensaje) {
      modo = nuevo;
      onMode(nuevo, mensaje || "");
    }

    function limpiaTimer(intento) {
      if (!timer) return;
      if (intento != null && timer.intento !== intento) return;
      clearIntervalFn(timer.handle);
      timer = null;
    }

    function instalaTimer(intento, tipo, fn, ms) {
      if (!vigente(intento)) return false;
      limpiaTimer();
      timer = { intento:intento, tipo:tipo, handle:setIntervalFn(fn, ms) };
      return true;
    }

    function cierraSocket(socket) {
      if (!socket) return;
      try { socket.close(); } catch (_) {}
    }

    function sondea(intento) {
      if (!vigente(intento)) return Promise.resolve(false);
      return fetchFn(options.bus + "/state", { cache:"no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          // La respuesta puede pertenecer a una conexión anterior que ya fue pausada.
          if (!vigente(intento)) return false;
          onPoll(data, intento);
          return true;
        });
    }

    function empiezaLocal(intento) {
      if (!vigente(intento)) return false;
      limpiaTimer();
      cambiaModo("local", "worker no disponible · motor local (respaldo)");
      instalaTimer(intento, "local", function () {
        if (vigente(intento)) onLocalTick(intento);
      }, localMs);
      if (vigente(intento)) onLocalTick(intento);
      return true;
    }

    function falloDeSondeo(intento) {
      if (!vigente(intento)) return false;
      // Dos fetches periódicos pueden solaparse; solo el primero cambia de modo.
      if (modo !== "sondeo") return false;
      limpiaTimer(intento);
      return empiezaLocal(intento);
    }

    function empiezaSondeo(intento) {
      if (!vigente(intento)) return Promise.resolve(false);
      limpiaTimer();
      cambiaModo("sondeo", "conexión perdida · volviendo al sondeo");
      return sondea(intento).then(function (ok) {
        // Revalidar después del fetch: Pausar/Reanudar puede haber cambiado el intento.
        if (!ok || !vigente(intento)) return false;
        return instalaTimer(intento, "sondeo", function () {
          if (!vigente(intento)) {
            limpiaTimer(intento);
            return;
          }
          sondea(intento).catch(function () { falloDeSondeo(intento); });
        }, pollMs);
      });
    }

    function conecta(intento) {
      return new Promise(function (resolve, reject) {
        if (!vigente(intento)) return reject(new Error("intento obsoleto"));

        var socket;
        try { socket = new WebSocketCtor(options.wsUrl); }
        catch (error) { return reject(error); }

        var abierto = false;
        var terminado = false;
        var pendiente = { intento:intento, socket:socket, timeout:null, cancel:null };
        negociando = pendiente;

        function limpiaPendiente() {
          if (pendiente.timeout != null) clearTimeoutFn(pendiente.timeout);
          pendiente.timeout = null;
          if (negociando === pendiente) negociando = null;
        }

        function resuelve(valor) {
          if (terminado) return;
          terminado = true;
          limpiaPendiente();
          resolve(valor);
        }

        function rechaza(error) {
          if (terminado) return;
          terminado = true;
          limpiaPendiente();
          reject(error);
        }

        pendiente.cancel = function () {
          // Rechazar antes de close garantiza que onclose síncrono no deje la promesa viva.
          rechaza(new Error("conexión cancelada"));
          cierraSocket(socket);
        };

        pendiente.timeout = setTimeoutFn(function () {
          rechaza(new Error("timeout"));
          cierraSocket(socket);
        }, connectMs);

        socket.onopen = function () {
          abierto = true;
          if (terminado || !vigente(intento)) {
            rechaza(new Error("intento obsoleto"));
            cierraSocket(socket);
            return;
          }
          // Nunca debe sobrevivir un sondeo/local anterior al recuperar WebSocket.
          limpiaTimer();
          ws = socket;
          cambiaModo("vivo");
          resuelve(true);
        };

        socket.onerror = function () {
          if (!abierto) {
            rechaza(new Error("ws error"));
            cierraSocket(socket);
          }
        };

        socket.onclose = function () {
          if (ws === socket) ws = null;
          if (!abierto) {
            rechaza(new Error("ws cerrado antes de conectar"));
            return;
          }
          // Tras open la promesa ya está resuelta; el cierre remoto inicia el relevo.
          if (!vigente(intento)) return;
          empiezaSondeo(intento).catch(function () { falloDeSondeo(intento); });
        };

        socket.onmessage = function (message) {
          if (vigente(intento)) onMessage(message, intento);
        };
      });
    }

    function play() {
      if (!pausado) return Promise.resolve(false);
      pausado = false;
      var intento = ++intentoConexion;
      cambiaModo("conectando", "conectando al edificio…");
      return conecta(intento)
        .catch(function () {
          if (!vigente(intento)) return false;
          return empiezaSondeo(intento);
        })
        .catch(function () { return falloDeSondeo(intento); });
    }

    function pause() {
      // Primero invalida la generación; ningún callback antiguo puede instalar timers.
      pausado = true;
      intentoConexion++;
      limpiaTimer();

      var pendiente = negociando;
      negociando = null;
      if (pendiente && pendiente.cancel) pendiente.cancel();

      var activo = ws;
      ws = null;
      cierraSocket(activo);
      cambiaModo("pausa", "desconectado · el edificio sigue sin ti");
      return true;
    }

    function pollNow() {
      return sondea(intentoConexion);
    }

    function snapshot() {
      return {
        pausado:pausado,
        intento:intentoConexion,
        modo:modo,
        socket:!!ws,
        negociando:!!negociando,
        timer:timer ? timer.tipo : null,
        timerIntento:timer ? timer.intento : null
      };
    }

    return {
      play:play,
      pause:pause,
      pollNow:pollNow,
      isPaused:function () { return pausado; },
      hasSocket:function () { return !!ws; },
      snapshot:snapshot
    };
  }

  return { create:create };
});
