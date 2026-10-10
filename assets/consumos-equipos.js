/* Zona «Equipos» de /consumos (GrokBotBox, 10-10-2026 · regla de Carlos: dos equipos, uno por cuenta).
 * Lee /api/equipos cada 60 s y pinta dos tarjetas: quién lo lleva hoy, miembros, tokens de hoy, cupo del día
 * (margen ÷ días al reset) con semáforo, tokens por línea y encargos activos. Sin dato → se dice, no se inventa. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var RET = {
    Jobs: { img: '/avatars/jobs.jpg' }, Wozniak: { img: '/avatars/wozniak.jpg' }, Lucas: { img: '/avatars/lucas.jpg' }, Disney: { img: '/avatars/disney.jpg' },
    Neo: { img: '/avatars/neo.jpg' }, Trinity: { img: '/avatars/trinity.jpg' }, Morfeo: { img: '/avatars/morfeo.jpg' }, 'Oráculo': { img: '/avatars/oraculo.png' },
    Musk: { img: '/assets/council-coetaneos.jpg', cara: { l: 9, t: 44, w: 9, h: 16 } }, Huang: { img: '/assets/council-coetaneos.jpg', cara: { l: 21.65, t: 44.5, w: 8.5, h: 15.1 } }
  };
  function foto(persona, nombre, cls) {
    var r = RET[persona], ini = esc(persona === 'Carlos' ? 'CS' : String(nombre || persona || '?').slice(0, 2));
    cls = 'tr-foto ' + (cls || '');
    if (r && r.cara) {
      var c = r.cara, sx = (10000 / c.w).toFixed(1), sy = (10000 / c.h).toFixed(1), px = (c.l / (100 - c.w) * 100).toFixed(2), py = (c.t / (100 - c.h) * 100).toFixed(2);
      return '<span class="' + cls + '" role="img" aria-label="' + esc(nombre) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:' + sx + '% ' + sy + '%;background-position:' + px + '% ' + py + '%"></span>';
    }
    if (r) return '<span class="' + cls + '" role="img" aria-label="' + esc(nombre) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:cover;background-position:center 25%"></span>';
    return '<span class="' + cls + ' tr-ini" aria-label="' + esc(nombre) + '">' + ini + '</span>';
  }
  var n = function (x) { return Number(x || 0).toLocaleString('es-ES'); };
  var tk = function (x) { x = Number(x || 0); return x >= 1e6 ? (x / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' M' : x >= 1e3 ? Math.round(x / 1e3).toLocaleString('es-ES') + ' k' : n(x); };
  var pc = function (x) { return (Math.round(x * 10) / 10).toLocaleString('es-ES') + ' %'; };
  var fecha = function (iso) { try { return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)); } catch (e) { return iso; } };
  var LUZ = { verde: 'verde', amarillo: 'amarillo', rojo: 'rojo', sin: 'sin' };

  function cabeceraCupo(p) {
    var prev = p.prevision !== null && p.prevision !== undefined ? '<small class="eq-prev">Previsión al ritmo medio (no es gasto medido): <b class="eq-' + LUZ[p.semaforoPrevision || 'sin'] + '">~' + pc(p.prevision) + '</b> del cupo · ' + esc(p.cuentaPrevision) + '</small>' : '';
    if (p.pctCupo !== null && p.pctCupo !== undefined) return '<b class="eq-big eq-' + LUZ[p.semaforo] + '">' + pc(p.pctCupo) + '</b><small>del cupo de hoy gastado · ' + esc(p.cuentaPct) + ' (la más apretada)</small>' + prev;
    return '<b class="eq-big eq-sin">sin medir</b><small>ninguna cuenta del equipo tiene lectura desde las 00:00: el gasto de hoy aún no se puede medir</small>' + prev;
  }
  function filaCuenta(c) {
    var cupo = c.cupoDia !== null && c.cupoDia !== undefined ? pc(c.cupoDia).replace(' %', ' pts') + '/día' : '—';
    var reset = c.reset ? 'reset ' + fecha(c.reset) + (c.diasReset !== null ? ' (' + String(c.diasReset).replace('.', ',') + ' d)' : '') : 'reset desconocido';
    return '<li><span class="cu-dot ' + (c.semaforo === 'amarillo' ? 'ambar' : c.semaforo) + '" title="' + (c.pctCupo !== null && c.pctCupo !== undefined ? pc(c.pctCupo) + ' del cupo' : 'gasto de hoy sin medir') + '"></span><span class="eq-cn"><b>' + esc(c.nombre) + '</b> <small>' + esc(reset) + '</small></span><span class="eq-cupo">' + esc(cupo) + '</span><span class="eq-ct">' + esc(c.texto) + '</span></li>';
  }
  function tarjeta(e) {
    var h = e.hoy || {}, p = e.presupuesto || {}, t = e.tokens || {}, l = e.lineas || {}, enc = e.encargos;
    var miembros = function (l, extra) { return l.map(function (m) { return '<span class="eq-m" title="' + esc(m.nombre + (m.plan ? ' · ' + m.plan : '')) + '">' + foto(m.persona, m.nombre, 'eq-mini') + esc(m.nombre) + (m.plan ? ' <small>' + esc(m.plan) + '</small>' : '') + '</span>'; }).join('') + (extra ? ' <small class="eq-plan">' + esc(extra) + '</small>' : ''); };
    var tokDet = (t.filas || []).map(function (f) { return esc(f.nombre) + ' ' + tk(f.tokHoy) + (f.nota ? ' (' + esc(f.nota) + ')' : ''); }).join(' · ');
    if (t.sinMedida && t.sinMedida.length) tokDet += (tokDet ? ' · ' : '') + 'sin medida: ' + esc(t.sinMedida.join(', '));
    var linDet = (l.filas || []).map(function (f) { return esc(f.nombre) + ' ' + n(f.lineas); }).join(' · ');
    return '<article class="eq-card" data-equipo="' + esc(e.id) + '">' +
      '<div class="eq-top"><div><h3 class="eq-nom">' + esc(e.nombre) + '</h3><p class="eq-cuenta">' + esc(e.cuenta) + ' · ' + esc(e.maquina) + '</p></div></div>' +
      '<div class="eq-lleva' + (h.esCarlos ? ' eq-carlos' : '') + '">' + foto(h.lleva, h.llevaNombre, 'eq-foto') + '<div><small>Lo lleva hoy</small><b>' + esc(h.llevaNombre || '—') + '</b><p>' + esc(h.motivo || '') + '</p>' +
      (h.esCarlos ? '<p class="eq-orq">Orquestador: ' + esc(h.orquestadorNombre) + (h.respaldoActivo ? ' — sin latido, de respaldo ' + esc(h.respaldo === 'Jobs' ? 'Jobs' : h.respaldo) : '') + '</p>' : '') + '</div></div>' +
      '<p class="eq-rot">Consejeros</p><div class="eq-ms">' + miembros(e.consejeros || [], e.planConsejeros) + '</div>' +
      '<p class="eq-rot">Agentes</p><div class="eq-ms">' + miembros(e.agentes || []) + '</div>' +
      '<div class="eq-kpis">' +
        '<div class="eq-kpi"><small>Tokens hoy</small><b class="eq-big">' + tk(t.total) + '</b><p>' + (tokDet || 'sin pulso de ningún miembro') + '</p></div>' +
        '<div class="eq-kpi"><small>Tokens por línea de código</small><b class="eq-big">' + (e.tokPorLinea ? n(e.tokPorLinea) : '—') + '</b><p>' + (l.total ? n(l.total) + ' líneas hoy' + (linDet ? ': ' + linDet : '') : 'sin líneas hoy de miembros del equipo') + (e.tokPorLinea || !l.total ? '' : ' · sin tokens medidos para dividir') + '</p></div>' +
        '<div class="eq-kpi"><small>Encargos activos</small><b class="eq-big">' + (enc ? n(enc.total) : '—') + '</b><p>' + (enc ? n(enc.enCurso) + ' en curso · ' + n(enc.pendientes) + ' pendientes' + (Object.keys(enc.porPersona || {}).length ? ' · ' + Object.keys(enc.porPersona).map(function (k) { return esc(k) + ' ' + enc.porPersona[k]; }).join(', ') : '') : 'la bandeja no responde') + '</p></div>' +
      '</div>' +
      '<div class="eq-cupo-box"><p class="eq-rot">Presupuesto del día <small>(margen de las 00:00 ÷ días hasta el reset)</small></p><div class="eq-cupo-cab">' + cabeceraCupo(p) + '</div>' +
      '<ul class="eq-cuentas">' + (p.cuentas || []).map(filaCuenta).join('') + '</ul></div>' +
      '</article>';
  }
  function pinta(d) {
    var lista = document.getElementById('equipos-lista'), res = document.getElementById('equipos-resumen'), pie = document.getElementById('equipos-pie');
    if (!lista) return;
    if (!d || !d.ok) { lista.innerHTML = '<p class="nota">No se pudo leer /api/equipos.</p>'; if (res) res.textContent = 'sin datos'; return; }
    lista.innerHTML = d.equipos.map(tarjeta).join('');
    if (res) res.innerHTML = d.equipos.map(function (e) {
      var p = e.presupuesto || {}, v = p.pctCupo !== null && p.pctCupo !== undefined ? pc(p.pctCupo) + ' del cupo' : 'cupo de hoy sin medir';
      return '<b>' + esc(e.hoy.llevaNombre) + '</b> lleva ' + esc(e.nombre.replace(/^Equipo /, '')) + ' <span class="eq-' + LUZ[p.semaforo || 'sin'] + '">(' + esc(v) + ')</span>';
    }).join(' · ');
    if (pie) pie.textContent = (d.hoy.fijado === 'post' ? 'Fijado hoy por ' + (d.hoy.autor || '¿?') : d.hoy.fijado === 'inicial' ? 'Reparto de hoy: regla de Carlos (10-oct)' : 'Sin fijar para hoy: cada equipo con su orquestador') +
      ' · cambiar: POST /api/equipos/hoy · ' + (d.criterio ? d.criterio.semaforo : '') + ' · Actualizado ' + fecha(d.generado) + '.';
  }
  function carga() { fetch('/api/equipos', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(pinta).catch(function () { pinta(null); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carga); else carga();
  setInterval(carga, 60000);
})();
