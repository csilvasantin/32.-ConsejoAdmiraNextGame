/* Cliente del turno compartido de voz (/api/chat/turno-voz).
   Una página solo locuta cuando tiene el turno; las demás esperan o se callan. */
(function (root) {
  "use strict";
  var API = "/api/chat/turno-voz";
  var LS = "admira_voz_turno_cliente_v1";
  var MIN_MS = 1500, MAX_MS = 45000, CHAR_MS = 70, PAD_MS = 700;

  function clienteId() {
    try {
      var s = root.sessionStorage;
      var v = s && s.getItem(LS);
      if (v) return v;
      v = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      if (s) s.setItem(LS, v);
      return v;
    } catch (e) {
      return "c" + Date.now().toString(36);
    }
  }

  function estimarDuracionMs(texto) {
    var n = String(texto || "").trim().length;
    if (!n) return MIN_MS;
    return Math.min(MAX_MS, Math.max(MIN_MS, n * CHAR_MS + PAD_MS));
  }

  function cabeceras(credencial) {
    var h = { "content-type": "application/json", accept: "application/json" };
    if (credencial) h.Authorization = "Bearer " + credencial;
    return h;
  }

  function post(body, credencial) {
    return root.fetch(API, {
      method: "POST",
      cache: "no-store",
      headers: cabeceras(credencial),
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) {
        d = d || {};
        d.ok = false;
        d.status = r.status;
        return d;
      }).catch(function () { return { ok: false, status: r.status }; });
      return r.json();
    }).catch(function () { return { ok: false, status: 0 }; });
  }

  function get(credencial, id) {
    var q = id ? ("?cliente=" + encodeURIComponent(id)) : "";
    return root.fetch(API + q, {
      cache: "no-store",
      headers: cabeceras(credencial)
    }).then(function (r) {
      if (!r.ok) return { ok: false, status: r.status };
      return r.json();
    }).catch(function () { return { ok: false, status: 0 }; });
  }

  function sleep(ms) {
    return new Promise(function (resolve) { root.setTimeout(resolve, ms); });
  }

  function presencia(consejo, credencial, fuente) {
    return post({
      accion: "presencia",
      clienteId: clienteId(),
      fuente: fuente || "sala-voz",
      consejo: consejo || ""
    }, credencial);
  }

  function aguardarTurno(opts) {
    opts = opts || {};
    var id = clienteId();
    var fuente = opts.fuente || "otra";
    var mensajeId = String(opts.mensajeId || "");
    var cred = opts.credencial || "";
    var onPerdido = opts.onPerdido;
    var silencioSiSala = !!opts.silencioSiSala;
    var started = Date.now();
    var timer = null;

    function pararLatido() { if (timer) { root.clearInterval(timer); timer = null; } }

    function liberar() {
      pararLatido();
      return post({ accion: "liberar", mensajeId: mensajeId, clienteId: id, fuente: fuente }, cred);
    }

    function latir() {
      return post({
        accion: "latido",
        mensajeId: mensajeId,
        clienteId: id,
        fuente: fuente,
        consejo: opts.consejo || ""
      }, cred).then(function (r) {
        if (!r || r.concedido === false) {
          pararLatido();
          if (onPerdido) try { onPerdido(); } catch (e) {}
          return false;
        }
        return true;
      });
    }

    function loop() {
      if (Date.now() - started > 120000) return Promise.resolve({ concedido: false, timeout: true, liberar: liberar });
      var paso = silencioSiSala
        ? get(cred, id).then(function (st) {
            if (st && st.salaAbierta) return { skip: true, salaAbierta: true };
            return null;
          })
        : Promise.resolve(null);
      return paso.then(function (prev) {
        if (prev && prev.skip) return { concedido: false, salaAbierta: true, yaDicho: false, liberar: liberar };
        return post({
          accion: "pedir",
          mensajeId: mensajeId,
          clienteId: id,
          fuente: fuente,
          prioridad: opts.prioridad || "",
          duracionMs: opts.duracionMs || estimarDuracionMs(opts.texto || ""),
          consejo: opts.consejo || ""
        }, cred).then(function (r) {
          if (!r || r.ok === false) return sleep(800).then(loop);
          if (silencioSiSala && r.salaAbierta) {
            if (r.concedido) return liberar().then(function () {
              return { concedido: false, salaAbierta: true, liberar: liberar };
            });
            return { concedido: false, salaAbierta: true, liberar: liberar };
          }
          if (r.yaDicho) return { concedido: false, yaDicho: true, liberar: liberar };
          if (r.concedido) {
            timer = root.setInterval(function () { latir(); }, 1000);
            return { concedido: true, turno: r.turno, liberar: liberar, pararLatido: pararLatido };
          }
          var espera = Math.min(Math.max(200, Number(r.esperaMs) || 400), 1000);
          return sleep(espera).then(loop);
        });
      });
    }
    return loop();
  }

  root.AdmiraVozTurno = {
    clienteId: clienteId,
    estimarDuracionMs: estimarDuracionMs,
    presencia: presencia,
    aguardarTurno: aguardarTurno,
    get: get,
    post: post
  };
})(typeof window !== "undefined" ? window : globalThis);
