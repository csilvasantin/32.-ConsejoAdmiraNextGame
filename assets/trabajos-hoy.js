/* trabajos-hoy.js — r248 (Carlos, 22-11-2026 11:46: «recuerda que estos son contadores de trabajos/misiones realizadas
 * cada dia, algo esta mal cuando nadie pasa de 1»). El «(N)» junto al nombre = TRABAJOS HECHOS HOY (día de Madrid):
 *   · misiones cerradas en done hoy en la bandeja de Yokup (t.hechasHoy, de /api/flota/trabajando), y
 *   · PRs fusionados hoy en GitHub con rama firmada por el agente (trinity/…, neo/…, woz/… → Wozniak…), una por rama
 *     (la misma rama fusionada en dos repos = un trabajo).
 * Una misión y sus PRs cuentan UNA vez: si la rama o el título del PR citan el número del encargo (neo/7658-…,
 * «(encargo 7658)»), el PR es esa misión; y si la rama es de OTRO agente que el destinatario del encargo, la misión se
 * le acredita a quien la hizo (la #7658 iba a Morfeo en el MBP16, pero allí solo corre el Claude de Neo y la cerró Neo
 * con neo/7658-gemelo-taza y neo/7658-gemelo-envio). La bandeja pública de Yokup solo guarda los encargos del bot-inbox:
 * el trabajo que Carlos pide directamente en la app (Codex / Claude) no pasa por ella y solo se ve en los PRs.
 * Los repos privados no salen en los eventos públicos de GitHub (no se cuentan: se dice en el pie).
 * Color (r247, misma regla): amarillo misión en curso < 24 h · verde lo último de hoy acabó bien (misión done o PR
 * fusionado) · rojo lo último de hoy acabó mal (failed / blocked) · gris nada hoy.
 * Uso: TrabajosHoy.combinar(tarjetas, eventosGitHub, ahoraMs) → copias con trabajosHoy, nHoyTotal, misionesLuz y
 * misionesDesglose recalculados; TrabajosHoy.asegurar(d) → Promise<d> (lee los eventos con caché compartida de 3 min). */
(function (root) {
  "use strict";
  var GH = "https://api.github.com/users/csilvasantin/events/public?per_page=100";
  var CACHE_MS = 180000, CLAVE = "admira:gh-eventos:v1";
  /** Prefijo de rama → nombre de la ficha (mismo nombre que /api/flota/trabajando). */
  var RAMA = { trinity: "Trinity", neo: "Neo", oraculo: "Oráculo", "oráculo": "Oráculo", morfeo: "Morfeo", niobe: "Niobe", smith: "Smith",
    merovingio: "Merovingio", link: "Link", whiterabbit: "WhiteRabbit", cypher: "Cypher", woz: "Wozniak", wozniak: "Wozniak", jobs: "Jobs",
    lucas: "Lucas", disney: "Disney", musk: "Musk", elon: "Musk", huang: "Huang", jensen: "Huang" };
  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function diaMadrid(ms) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); }
  /** Eventos de GitHub → PRs fusionados HOY (Madrid): [{ agente, rama, repo, pr, titulo, ts (s), encargo }]. */
  function prsHoy(eventos, ahoraMs) {
    var hoy = diaMadrid(ahoraMs), out = [], vistos = {};
    (Array.isArray(eventos) ? eventos : []).forEach(function (e) {
      if (!e || e.type !== "PullRequestEvent" || !e.payload || !e.created_at) return;
      var p = e.payload, pr = p.pull_request || {};
      if (!(p.action === "merged" || (p.action === "closed" && pr.merged))) return;
      var ms = Date.parse(e.created_at); if (!isFinite(ms) || diaMadrid(ms) !== hoy) return;
      var rama = String((pr.head && pr.head.ref) || "").replace(/^refs\/heads\//, ""), pre = norm(rama.split("/")[0]);
      var agente = rama.indexOf("/") > 0 ? RAMA[pre] : null; if (!agente) return;
      var repo = String((e.repo && e.repo.name) || "").split("/").pop(), num = p.number || pr.number || null;
      var k = repo + "#" + num; if (vistos[k]) return; vistos[k] = 1;
      var titulo = String(pr.title || "").trim();
      var m = rama.match(/\/(\d{4,6})(?:\D|$)/) || titulo.match(/encargo\s*#?(\d{4,6})/i);
      out.push({ agente: agente, rama: rama, repo: repo, pr: num, titulo: titulo || rama, ts: Math.floor(ms / 1000), encargo: m ? "#" + m[1] : null });
    });
    return out;
  }
  var MAL = /^(failed|error|blocked|rejected|fallida|bloqueada)$/;
  /** Combina las fichas con los PRs de hoy. No muta las fichas originales. */
  function combinar(tarjetas, eventos, ahoraMs) {
    var ts = (tarjetas || []).map(function (t) { var c = {}; for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) c[k] = t[k]; return c; });
    var por = {}; ts.forEach(function (t) { por[norm(t.agente)] = t; });
    var prs = prsHoy(eventos, ahoraMs);
    // 1) misiones hechas hoy por ficha (de la API) → lista de trabajos
    ts.forEach(function (t) { t._tr = Array.isArray(t.hechasHoy) ? t.hechasHoy.map(function (m) { return { tipo: "mision", id: m.id, titulo: m.titulo || "", ts: m.ts, maquina: m.maquina || null, prs: [] }; }) : null; });
    // 2) reasignar la misión al agente de la rama que la cita (si es otro) y colgarle sus PRs
    prs.forEach(function (p) {
      var dueño = por[norm(p.agente)]; if (!dueño) return;
      if (dueño._tr === null) dueño._tr = [];
      var hecho = false;
      if (p.encargo) ts.forEach(function (t) {
        if (hecho || !t._tr) return;
        for (var i = 0; i < t._tr.length; i++) if (t._tr[i].tipo === "mision" && t._tr[i].id === p.encargo) {
          var m = t._tr[i];
          if (t !== dueño) { t._tr.splice(i, 1); m.deDestinatario = t.agente; dueño._tr.push(m); }
          m.prs.push(p.repo + "#" + p.pr); m.ts = Math.max(m.ts || 0, p.ts); hecho = true; return;
        }
      });
      if (hecho) return;
      // PR sin misión: uno por rama (la misma rama en dos repos = un trabajo)
      for (var j = 0; j < dueño._tr.length; j++) if (dueño._tr[j].tipo === "pr" && dueño._tr[j].rama === p.rama) { dueño._tr[j].prs.push(p.repo + "#" + p.pr); dueño._tr[j].ts = Math.max(dueño._tr[j].ts, p.ts); return; }
      dueño._tr.push({ tipo: "pr", id: p.encargo, rama: p.rama, titulo: p.titulo, ts: p.ts, prs: [p.repo + "#" + p.pr] });
    });
    // 3) N, color y desglose
    ts.forEach(function (t) {
      var l = t._tr; delete t._tr;
      if (!l) return;
      l.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      t.trabajosHoy = l; t.nHoyTotal = l.length;
      var nm = l.filter(function (x) { return x.tipo === "mision"; }).length, np = l.length - nm;
      var d0 = t.misionesDesglose || {}, d = {}; for (var k in d0) if (Object.prototype.hasOwnProperty.call(d0, k)) d[k] = d0[k];
      var ultOk = l.length ? l[l.length - 1].ts || 0 : 0;
      var mal = d0.ultima && MAL.test(d0.ultima.estado || "") ? d0.ultima.ts || 0 : 0;
      var luz = (d0.enCurso || 0) > 0 ? "amarillo" : ultOk && ultOk >= mal ? "verde" : mal ? "rojo" : "gris";
      var partes = [l.length + (l.length === 1 ? " hecha" : " hechas") + (np ? " (" + nm + (nm === 1 ? " misión" : " misiones") + " + " + np + " PR)" : "")];
      String(d0.texto || "").split(" · ").slice(1).forEach(function (s) { if (s) partes.push(s); });
      d.hechas = l.length; d.misionesHechas = nm; d.prsHechos = np; d.luz = luz; d.texto = partes.join(" · ");
      t.misionesLuz = luz; t.misionesDesglose = d;
    });
    return ts;
  }
  /** Lee los eventos de GitHub (caché compartida entre páginas, 3 min) y enriquece d.tarjetas. Nunca rompe: sin GitHub,
   *  d queda con las misiones de la API (y d.trabajosGit = 'sin datos'). */
  var memo = null;
  function leerEventos(f) {
    var ahora = Date.now();
    if (memo && ahora - memo.t < CACHE_MS) return Promise.resolve(memo.ev);
    try { var c = JSON.parse(root.localStorage.getItem(CLAVE) || "null"); if (c && ahora - c.t < CACHE_MS && Array.isArray(c.ev)) { memo = c; return Promise.resolve(c.ev); } } catch (e) {}
    return f(GH, { headers: { accept: "application/vnd.github+json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (ev) {
      if (!Array.isArray(ev)) return memo ? memo.ev : null;
      var slim = ev.filter(function (e) { return e && e.type === "PullRequestEvent"; }).map(function (e) {
        var p = e.payload || {}, pr = p.pull_request || {};
        return { type: e.type, created_at: e.created_at, repo: { name: e.repo && e.repo.name }, payload: { action: p.action, number: p.number, pull_request: { merged: pr.merged, number: pr.number, title: pr.title, head: { ref: pr.head && pr.head.ref } } } };
      });
      memo = { t: Date.now(), ev: slim };
      try { root.localStorage.setItem(CLAVE, JSON.stringify(memo)); } catch (e) {}
      return slim;
    }).catch(function () { return memo ? memo.ev : null; });
  }
  function asegurar(d, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!d || !Array.isArray(d.tarjetas) || !f) return Promise.resolve(d);
    return leerEventos(f).then(function (ev) {
      var out = {}; for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
      out.tarjetas = combinar(d.tarjetas, ev || [], Date.now());
      out.trabajosGit = ev ? "ok" : "sin datos";
      return out;
    });
  }
  root.TrabajosHoy = { RAMA: RAMA, prsHoy: prsHoy, combinar: combinar, asegurar: asegurar, leerEventos: leerEventos, diaMadrid: diaMadrid };
})(typeof window !== "undefined" ? window : globalThis);
