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

  function pinta(d) {
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
