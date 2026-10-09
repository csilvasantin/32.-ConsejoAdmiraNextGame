/* Lecturas de /consumos: % del plan gastado por cuenta y agente, últimos 14 días (GrokBotBox, 09-10-2026).
   Los datos salen de /api/consumos/lecturas (la cuenta ya viene hecha: deltas, quema por 12 h,
   proyección al 100 % y recomendación). Canónicas: 00:00 y 12:00 de Madrid. */
(function () {
  const API = "/api/consumos/lecturas";
  const caja = document.getElementById("lecturas-cuerpo");
  if (!caja) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => (x === null || x === undefined ? "—" : String(Math.round(Number(x) * 100) / 100).replace(".", ",") + " %");
  const fecha = (ts) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts)).replace(",", "");
  const COLORES = ["#78f3ff", "#ffd866", "#88ffaa", "#ff9ad5", "#b9a7ff", "#ffb38a"];

  function grafica(series, dias) {
    const W = 840, Hh = 220, P = 34, fin = Date.now(), ini = fin - dias * 864e5;
    const x = (t) => P + ((t - ini) / (fin - ini)) * (W - 2 * P);
    const y = (v) => Hh - P + (-(v / 100)) * (Hh - 2 * P);
    let s = '<svg viewBox="0 0 ' + W + " " + Hh + '" class="graf" role="img" aria-label="% del plan gastado, últimos ' + dias + ' días">';
    for (const v of [0, 25, 50, 75, 100]) s += '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="rej"/><text x="4" y="' + (y(v) + 4) + '" class="eje">' + v + "</text>";
    for (let d = 0; d <= dias; d += 2) { const t = fin - d * 864e5; s += '<text x="' + (x(t) - 14) + '" y="' + (Hh - 10) + '" class="eje">' + esc(fecha(t).slice(0, 5)) + "</text>"; }
    series.forEach((se, i) => {
      const c = COLORES[i % COLORES.length];
      const pts = se.deltas.map((l) => x(Date.parse(l.ts)).toFixed(1) + "," + y(l.pct).toFixed(1));
      if (pts.length > 1) s += '<polyline fill="none" stroke="' + c + '" stroke-width="2.5" points="' + pts.join(" ") + '"/>';
      se.deltas.forEach((l) => { s += '<circle cx="' + x(Date.parse(l.ts)).toFixed(1) + '" cy="' + y(l.pct).toFixed(1) + '" r="' + (l.canonica ? 4.5 : 3) + '" fill="' + (l.canonica ? c : "none") + '" stroke="' + c + '"><title>' + esc((se.agente || se.cuenta) + " · " + fecha(l.ts) + " · " + pct(l.pct)) + "</title></circle>"; });
    });
    return s + "</svg>";
  }


  const LUZ = { rojo: "Rojo", ambar: "Ámbar", verde: "Verde", sin: "Sin lectura" };
  function pintaCuentas(d) {
    const top = document.getElementById("reco-top"), rk = document.getElementById("ranking"), grid = document.getElementById("cuentas");
    if (!top || !grid) return;
    top.textContent = d.recomendacionCuentas || "Sin lecturas todavía.";
    rk.innerHTML = (d.ranking || []).map((r) => "<li>" + r.puesto + ". <b>" + esc(r.nombre) + "</b> · " + (r.margen === null ? "sin lectura" : "margen " + pct(r.margen)) + (r.proveedor ? " · " + esc(r.proveedor) : "") + "</li>").join("");
    grid.innerHTML = (d.cuentas || []).map((c) => {
      const luz = LUZ[c.semaforo] ? c.semaforo : "sin";
      let h = '<article class="card"><div class="top"><div><h2 class="nombre">' + esc(c.nombre) + (c.proveedor ? ' <span class="prov" title="' + esc(c.etiqueta || "") + '">' + esc(c.proveedor) + "</span>" : "") + '</h2><p class="cuenta">' + esc(c.cuenta + " · " + c.plan + (c.consejeros.length ? " · " + c.consejeros.join(", ") : "")) + '</p></div><span class="luz ' + luz + '">' + LUZ[luz] + "</span></div>";
      if (c.pct === null && (c.tokens || c.pulso)) {
        // r27: Cursor Pro — sin % del plan; tokens de hoy (pulso) y por bloque de 12 h (lecturas solo de tokens).
        const fmtT = (n) => (n == null ? "—" : n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString("es-ES") + " M" : n >= 1e3 ? Math.round(n / 1e3).toLocaleString("es-ES") + " k" : String(n));
        const pu = c.pulso, ret = pu && pu.agentes.length ? Math.max(...pu.agentes.map((a) => a.retrasoS || 0)) : null;
        h += '<p class="cifra">' + (pu ? fmtT(pu.tokHoy) : "—") + '</p><p class="unidad">tokens hoy' + (pu ? " · " + esc(pu.agentes.map((a) => a.agente).join(", ")) : " · sin export de Cursor hoy") + "</p>";
        if (ret != null) h += '<p class="unidad sec">Cursor · datos con ~' + (ret >= 3600 ? (Math.round(ret / 360) / 10).toLocaleString("es-ES") + " h" : Math.max(1, Math.round(ret / 60)) + " min") + " de retraso · + " + fmtT(pu.cacheHoy) + " de lectura de caché aparte</p>";
        if (c.nota) h += '<p class="frase">' + esc(c.nota) + "</p>";
        const bl = (c.tokens && c.tokens.bloques) || [];
        if (bl.length) {
          const mx = Math.max(1, ...bl.map((b) => b.total));
          h += '<div class="barras" title="tokens por bloque de 12 h">' + bl.map((b) => '<span style="height:' + Math.max(3, (b.total / mx) * 100) + '%" title="' + esc(fecha(b.ts) + ": " + fmtT(b.total) + " tokens" + (b.nota ? " · " + b.nota : "")) + '"></span>').join("") + "</div>";
          h += '<p class="tok-cursor">Último bloque de 12 h (' + esc(fecha(bl[bl.length - 1].ts)) + "): <b>" + fmtT(bl[bl.length - 1].total) + "</b> tokens" + (bl[bl.length - 1].nota ? " · " + esc(bl[bl.length - 1].nota) : "") + "</p>";
        } else h += '<p class="cuando">Bloques de 12 h: aún no hay lecturas de tokens de las 00:00/12:00.</p>';
        return h + "</article>";
      }
      if (c.pct === null) {
        h += '<p class="cifra">sin lectura</p>' + (c.pista ? '<p class="frase">' + esc(c.pista) + "</p>" : "") + (c.resetSemanal ? '<p class="frase">Reset semanal: ' + esc(c.resetSemanal) + "</p>" : "") + "</article>";
        return h;
      }
      const p = c.proyeccion || {};
      h += '<p class="cifra">' + pct(c.pct) + '</p><p class="unidad">usado · manda «' + esc(c.manda) + "»</p>";
      if (c.secundario) h += '<p class="unidad sec">' + esc(c.secundario.agente) + ": " + (c.secundario.pct === null ? "sin lectura" : pct(c.secundario.pct)) + (c.secundario.reset ? " · reset " + esc(fecha(c.secundario.reset)) : "") + "</p>";
      h += '<p class="frase">' + (c.reset ? "Reset: " + esc(fecha(c.reset)) + (c.cupoDia !== null ? " · cupo " + pct(c.cupoDia) + " al día" : "") : "Sin hora de reset en la lectura") + "</p>";
      h += '<p class="cta">' + (p.agotaAntes ? '<span class="agota">' + esc(p.texto) + "</span>, antes del reset" : p.llega100 ? "Al ritmo actual (" + pct(p.ritmoDia) + "/día" + (p.base === "semana" ? ", media de la semana" : "") + ") llegaría al 100 % el " + esc(fecha(p.llega100)) : "Falta otra lectura para saber el ritmo") + "</p>";
      h += '<ul class="limites">' + c.series.map((s) => "<li><b>" + esc(s.agente || s.cuenta) + "</b>: " + pct(s.pct) + (s.ultima.reset ? " · reset " + esc(fecha(s.ultima.reset)) : "") + " · " + esc(fecha(s.ultima.ts)) + (s.proy && s.proy.agotaAntes ? ' · <span class="agota">' + esc(s.proy.texto) + "</span>" : "") + "</li>").join("") + "</ul>";
      const bl = (c.series.find((s) => (s.agente || s.cuenta) === c.manda) || {}).bloques || [];
      if (bl.length) {
        const mx = Math.max(5, ...bl.map((b) => b.gasto));
        h += '<div class="barras" title="% gastado por bloque de 12 h">' + bl.slice(-28).map((b) => '<span class="' + (b.reinicio ? "rei" : "") + '" style="height:' + Math.max(3, (b.gasto / mx) * 100) + '%" title="' + esc(fecha(b.desde) + " → " + fecha(b.hasta) + ": " + pct(b.gasto) + (b.reinicio ? " (tras reset)" : "")) + '"></span>').join("") + "</div>";
      } else h += '<p class="cuando">Bloques de 12 h: aún no hay dos lecturas de las 00:00/12:00.</p>';
      const r = c.reparto || {};
      if (r.estado === "ok") h += '<div class="reparto">Reparto por partes de tokens (' + r.partes + ' partes de Yokup):<table>' + r.filas.map((f) => "<tr><td>" + esc(f.consejero) + "</td><td>" + pct(f.pct) + "</td><td>" + f.cuota + " % de los tokens</td></tr>").join("") + "</table></div>";
      else if (r.estado !== "no aplica") h += '<p class="reparto">Reparto por consejero: ' + esc(r.estado) + (r.motivo ? " (" + esc(r.motivo) + ")" : "") + ".</p>";
      return h + "</article>";
    }).join("");
  }
  function pinta(d) {
    pintaCuentas(d);
    const series = Array.isArray(d.series) ? d.series : [];
    if (!series.length) { caja.innerHTML = '<p class="nota">Sin lecturas todavía.</p>'; return; }
    let h = "";
    if (d.recomendacion) h += '<p class="reco">' + esc(d.recomendacion.texto) + "</p>";
    h += '<div class="leyenda">' + series.map((se, i) => '<span><i style="background:' + COLORES[i % COLORES.length] + '"></i>' + esc((se.agente ? se.agente + " · " : "") + se.cuenta + (se.grupo ? " (" + se.grupo + ")" : "")) + "</span>").join("") + "</div>";
    h += grafica(series, d.dias || 14);
    h += '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Cuenta · agente</th><th>Último %</th><th>Quema / 12 h</th><th>Llega al 100 %</th><th>Última lectura</th></tr></thead><tbody>';
    for (const se of series) {
      const fin = se.llega100 ? fecha(se.llega100) + " (en " + Math.round(se.horasA100) + " h)" : (se.quema12h === null ? "falta otra lectura" : "no sube");
      h += "<tr><td>" + esc((se.agente ? se.agente + " · " : "") + se.cuenta) + "</td><td>" + pct(se.pct) + "</td><td>" + pct(se.quema12h) + "</td><td>" + esc(fin) + "</td><td>" + esc(fecha(se.ultima.ts)) + (se.vieja ? " ⚠" : "") + "</td></tr>";
    }
    h += "</tbody></table></div>";
    h += '<details class="hist"><summary>Todas las lecturas (' + series.reduce((n, s) => n + s.deltas.length, 0) + ")</summary><div class=\"tabla-wrap\"><table class=\"tabla\"><thead><tr><th>Cuándo (Madrid)</th><th>Cuenta · agente</th><th>%</th><th>Δ</th><th>Quema / 12 h</th><th>Tokens</th><th>Fuente · quién</th></tr></thead><tbody>";
    const todas = series.flatMap((se) => se.deltas).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    for (const l of todas) {
      const tk = l.tokens ? (l.tokens.total ?? ((l.tokens.entrada || 0) + (l.tokens.salida || 0) + (l.tokens.cache || 0))).toLocaleString("es-ES") : "—";
      h += "<tr><td>" + esc(fecha(l.ts)) + (l.canonica ? " ●" : "") + "</td><td>" + esc((l.agente ? l.agente + " · " : "") + l.cuenta) + "</td><td>" + pct(l.pct) + "</td><td>" + (l.reinicio ? "reinicio" : pct(l.delta)) + "</td><td>" + pct(l.quema12h) + "</td><td>" + esc(tk) + "</td><td>" + esc(l.fuente + " · " + l.autor) + "</td></tr>";
    }
    h += "</tbody></table></div></details>";
    caja.innerHTML = h;
  }

  function carga() {
    fetch(API + "?dias=14", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(pinta)
      .catch(() => { caja.innerHTML = '<p class="nota">No se han podido abrir las lecturas.</p>'; });
  }

  const form = document.getElementById("lectura-form");
  if (form) {
    const tok = form.querySelector('[name="token"]');
    try { tok.value = localStorage.getItem("consumos.token") || ""; } catch (e) {}
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const cuerpo = { cuenta: f.get("cuenta"), grupo: f.get("grupo"), agente: f.get("agente"), pct: Number(String(f.get("pct")).replace(",", ".")), fuente: "manual", autor: f.get("autor") };
      if (f.get("tokens")) cuerpo.tokens = Number(f.get("tokens"));
      try { localStorage.setItem("consumos.token", String(f.get("token") || "")); } catch (e) {}
      const msg = document.getElementById("lectura-msg");
      fetch(API, { method: "POST", headers: { "content-type": "application/json", "X-Council-Token": String(f.get("token") || "") }, body: JSON.stringify(cuerpo) })
        .then((r) => r.json().then((j) => ({ r, j })))
        .then(({ r, j }) => { msg.textContent = r.ok ? "Lectura guardada." : "No se guardó: " + (j.error || r.status); if (r.ok) carga(); })
        .catch(() => { msg.textContent = "No se guardó: sin conexión."; });
    });
  }
  carga();
})();
