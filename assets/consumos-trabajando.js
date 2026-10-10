/* «Trabajando ahora» — franja en lo alto de /consumos (GrokBotBox, 09-10-2026 · r28).
 * Lee /api/flota/trabajando cada 10 s: una tarjeta por consejero/agente con retrato, nombre, máquina · motor/modelo,
 * foco/tarea, proyecto y encargo. Color: VERDE trabajando · AMARILLO con Carlos · GRIS parado («parado · hace X min ·
 * último: …») o «sin latido». Orden: verde, amarillo, gris. Sin datos: lo dice, nunca inventa.
 * r40: tokens honestos («≈ X tok/h (15 min × 4)» + real de la última hora; «sin medición» en vez de 0) y aviso en la
 * fila de resumen cuando la presencia viene de caché o no responde (faltan agentes).
 * r4 (Jensen, 10-10-2026): verde también con latido < 15 min + encargo en curso (Oráculo en OpenCode, Merovingio…);
 * nota «plan C gratis» / «gratis» en la ficha; ES/EN con ?lang=en; avisa a la Matriz de agentes («flota:trabajando»). */
(function (root) {
  'use strict';
  var API = '/api/flota/trabajando', POLL = 10000, ultimo = null;
  function en() {
    // r5: /consumos no carga admira-idioma.js al entrar: se mira también ?lang= y la preferencia guardada de la suite.
    var h = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (root.AdmiraIdioma) return h.indexOf('en') === 0;
    try { var q = new URL(location.href).searchParams.get('lang'); if (q) return /^en/i.test(q); } catch (e) {}
    try { var s = localStorage.getItem('admiranext_expert_lang') || localStorage.getItem('xtanco_lang'); if (s) return /^en/i.test(s); } catch (e) {}
    return h.indexOf('en') === 0;
  }
  function T(es, en_) { return en() ? en_ : es; }
  /** r4: nota de coste secundaria: el modelo principal manda; el plan C gratis solo se apunta. */
  function notaCoste(t) {
    if (t.gratis) return '<span class="tr-chip tr-gratis" title="' + esc(T('Solo late en runtimes gratuitos (OpenCode / DeepAgents / Nemotron): no reporta tokens', 'Only free runtimes (OpenCode / DeepAgents / Nemotron): no token reporting')) + '">' + T('gratis', 'free') + '</span>';
    if (t.planC) return '<span class="tr-chip tr-gratis" title="' + esc(T('Además tiene una instancia en el plan C gratis (OpenCode / Nemotron)', 'Also runs an instance on free plan C (OpenCode / Nemotron)')) + '">' + T('+ plan C gratis', '+ free plan C') + '</span>';
    return '';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    function f(x, d) { return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    if (n >= 1e6) return f(n / 1e6, 1) + ' M'; if (n >= 1e3) return f(n / 1e3, 0) + ' k'; return f(n, 0);
  }
  function hace(s) {
    if (s == null) return '';
    if (s < 90) return 'hace ' + Math.round(s) + ' s';
    if (s < 5400) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 172800) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' d';
  }
  function retrato(t) {
    var r = t.retrato, ini = esc(String(t.agente || '?').slice(0, 2));
    if (r && (r.cara || r.crop)) {
      // Recorte de la cara en la ilustración del Consejo («cara» del servidor; «crop» antiguo = cuerpo → 42 % de arriba).
      var c = r.cara || r.crop, h = r.cara ? c.h : c.h * 0.42, w = c.w;
      var sx = (10000 / w).toFixed(1), sy = (10000 / h).toFixed(1), px = (c.l / (100 - w) * 100).toFixed(2), py = (c.t / (100 - h) * 100).toFixed(2);
      return '<span class="tr-foto" role="img" aria-label="' + esc(t.agente) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:' + sx + '% ' + sy + '%;background-position:' + px + '% ' + py + '%"></span>';
    }
    if (r && r.img) return '<span class="tr-foto" role="img" aria-label="' + esc(t.agente) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:cover;background-position:center 25%"></span>';
    return '<span class="tr-foto tr-ini" aria-hidden="true">' + ini + '</span>';
  }
  /** r40: «≈ 2,5 M tok/h (15 min × 4) · 868 k última hora»; «sin medición» si no hay medición de tokens. */
  function tokens(t) {
    if (t.sinMedicion) return ' · <span class="tr-sinmed" title="' + esc(T('Este agente no tiene medición de tokens (sin pulso o a 0 todo el día): no es un 0 real', 'No token measurement for this agent: not a real 0')) + '">' + T('sin medición de tokens', 'no token measurement') + '</span>';
    var r = '';
    if (t.tokHora > 0) r += ' · ≈ ' + fmt(t.tokHora) + ' tok/h <small>(15 min × 4)</small>';
    if (t.tokUltimaHora != null && (t.tokHora > 0 || t.tokUltimaHora > 0)) r += ' · ' + fmt(t.tokUltimaHora) + ' última hora';
    return r;
  }
  /** r41: «con Carlos · MBP16». */
  function cc(t) { return T('con Carlos', 'with Carlos') + (t.conCarlosEn ? ' · ' + t.conCarlosEn : ''); }
  function aviso(d) {
    if (!d || d.presencia === 'ok') return '';
    if (d.presencia === 'cache') return ' · <span class="tr-aviso" title="Yokup no ha respondido: se usa la última presencia buena">⚠ presencia de hace ' + esc(hace(d.presenciaEdadS || 0).replace('hace ', '')) + '</span>';
    return ' · <span class="tr-aviso" title="Yokup no ha respondido y no hay presencia reciente: solo salen agentes con pulso de tokens">⚠ presencia sin respuesta: pueden faltar agentes</span>';
  }
  function tarjeta(t) {
    var motor = [t.motor, t.modelo && t.modelo !== t.motor ? t.modelo : ''].filter(Boolean).join(' · ');
    var que = t.tarea || t.foco || '';
    var linea;
    if (t.estado === 'gris') linea = t.motivo === 'sin latido' ? '<span class="tr-est">' + T('sin latido', 'no heartbeat') + '</span>' : '<span class="tr-est">' + T('parado', 'idle') + ' · ' + esc(hace(t.haceS)) + '</span>' + (que ? ' · ' + T('último', 'last') + ': ' + esc(que) : '');
    else linea = '<span class="tr-est">' + (t.estado === 'amarillo' ? esc(cc(t)) : T('trabajando', 'working')) + '</span>' + (t.enCurso > 0 ? ' · ' + t.enCurso + ' ' + T('en curso', 'in progress') : '') + tokens(t) + (que ? ' · ' + esc(que) : '');
    var fuera = t.fuera && t.fuera.length ? '<span class="tr-chip tr-fuera" title="' + esc(t.fuera.join(' · ')) + '">⚠ ' + T('de pago fuera de las 6', 'paid outside the 6') + '</span>' : '';
    var chips = fuera + notaCoste(t) + (t.proyecto ? '<span class="tr-chip">' + esc(t.proyecto) + '</span>' : '') + (t.encargo ? '<span class="tr-chip tr-enc">' + esc(t.encargo) + '</span>' : '');
    return '<li class="tr-card tr-' + esc(t.estado) + (t.fuera && t.fuera.length ? ' tr-rojo' : '') + '" title="' + esc(t.motivo + (t.foco ? ' — ' + t.foco : '') + (t.incluye && t.incluye.length ? ' · ' + T('incluye el consumo de ', 'includes the usage of ') + t.incluye.join(', ') : '')) + '">' + retrato(t) +
      '<span class="tr-txt"><b class="tr-nom"><i class="tr-punto" aria-hidden="true"></i>' + esc(t.agente) + '</b>' +
      '<small class="tr-maq">' + esc([t.maquina, motor].filter(Boolean).join(' · ') || '—') + '</small>' +
      '<small class="tr-que">' + linea + '</small>' + (chips ? '<span class="tr-chips">' + chips + '</span>' : '') + '</span></li>';
  }
  /** r43 (Carlos, 12:59): dos grupos, AGENTES y CONSEJEROS, cada uno con sus cuentas. Puro (testeable). */
  function grupos(ts) {
    var g = { agentes: [], consejeros: [] };
    (ts || []).forEach(function (t) { (t.grupo === 'consejeros' || (!t.grupo && t.consejero) ? g.consejeros : g.agentes).push(t); });
    function cuenta(l) {
      var v = l.filter(function (t) { return t.estado === 'verde'; }).length, a = l.filter(function (t) { return t.estado === 'amarillo'; }).length;
      return { trabajando: v, conCarlos: a, parados: l.length - v - a, total: l.length };
    }
    return [{ id: 'agentes', titulo: T('Agentes', 'Agents'), tarjetas: g.agentes, n: cuenta(g.agentes) },
            { id: 'consejeros', titulo: T('Consejeros', 'Councillors'), tarjetas: g.consejeros, n: cuenta(g.consejeros) }];
  }
  function cifras(n) {
    return '<b>' + n.trabajando + '</b> ' + T('trabajando', 'working') + ' · <b>' + n.conCarlos + '</b> ' + T('con Carlos', 'with Carlos') + ' · <b>' + n.parados + '</b> ' + T('parados', 'idle');
  }
  function chipsDe(l) {
    var vivos = l.filter(function (t) { return t.estado !== 'gris'; }), grises = l.filter(function (t) { return t.estado === 'gris'; });
    return vivos.map(function (t) { return '<span class="tr-chipa tr-' + esc(t.estado) + (t.fuera && t.fuera.length ? ' tr-rojo' : '') + '" title="' + esc(t.agente + ' · ' + (t.estado === 'amarillo' ? cc(t) : T('trabajando', 'working')) + ' · ' + (t.motor || '') + (t.planC ? T(' + plan C gratis', ' + free plan C') : t.gratis ? T(' · gratis', ' · free') : '')) + '">' + retrato(t) + '<i></i>' + esc(t.agente) + (t.estado === 'amarillo' && t.conCarlosEn ? ' <small>' + esc(t.conCarlosEn) + '</small>' : '') + (t.gratis || t.planC ? '<small class="tr-c">' + (t.gratis ? T('gratis', 'free') : '+C') + '</small>' : '') + '</span>'; }).join('') +
      (grises.length ? '<span class="tr-grises" title="' + esc(grises.map(function (t) { return t.agente; }).join(', ')) + '">' + grises.map(retrato).join('') + '<small>' + grises.length + ' ' + T('parados', 'idle') + '</small></span>' : '');
  }
  function pinta(d) {
    var ul = document.getElementById('trabajando-lista'), pie = document.getElementById('trabajando-pie'), res = document.getElementById('trabajando-resumen');
    if (!ul) return;
    var ts = d && d.ok ? d.tarjetas || [] : null;
    if (!ts) { ul.innerHTML = '<li class="tr-vacio">Sin datos de presencia ni de pulso ahora: no se enseña nadie.</li>'; return; }
    var gs = grupos(ts);
    // r43: una cabecera por grupo (ocupa toda la fila de la rejilla) con sus cuentas, y debajo sus tarjetas.
    ul.innerHTML = gs.map(function (g) {
      return '<li class="tr-grupo" id="trabajando-' + g.id + '"><b>' + esc(g.titulo) + '</b> <small>' + cifras(g.n) + '</small></li>' +
        (g.tarjetas.length ? g.tarjetas.map(tarjeta).join('') : '<li class="tr-vacio">' + T('Nadie en este grupo ahora.', 'Nobody in this group right now.') + '</li>');
    }).join('');
    // r31/r43: fila compacta (zona plegada), también por grupo.
    var ch = document.getElementById('trabajando-chips');
    if (ch) ch.innerHTML = gs.map(function (g) { return '<span class="tr-chipgrupo"><b class="tr-chiptit">' + esc(g.titulo) + '</b>' + chipsDe(g.tarjetas) + '</span>'; }).join('');
    if (res) res.innerHTML = gs.map(function (g) { return '<span class="tr-resgrupo">' + esc(g.titulo) + ': ' + cifras(g.n) + '</span>'; }).join(' — ') + aviso(d);
    if (pie) pie.innerHTML = 'Actualizado ' + new Date(d.generado).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }) + ' (Madrid) · verde = tokens en los últimos 15 min, latido «trabajando» de &lt; 2 min, CPU del propio proceso o latido de &lt; 15 min con encargo en curso (cualquier runtime, también el plan C gratis) · amarillo = con Carlos (pulso, o app de escritorio / tmux adjunto en el Mac que estás usando) · gris = parado · consejeros = los 16 del Consejo (leyendas y coetáneos) · fuentes: <a href="https://bot.yokup.com/api/presence">presencia de Yokup</a> + <a href="/api/consumos/velocidad">pulso de tokens</a>' + (d.presencia === 'cache' ? ' · ⚠ presencia de caché (hace ' + esc(String(d.presenciaEdadS)) + ' s)' : d.presencia !== 'ok' ? ' · ⚠ presencia sin respuesta' : '') + ' · cada 10 s';
  }
  function avisa(d) { ultimo = d; try { root.dispatchEvent(new CustomEvent('flota:trabajando', { detail: d })); } catch (e) {} return d; }
  function leer() { return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(avisa).then(pinta); }
  function arranca() {
    if (!document.getElementById('trabajando')) return;
    leer();
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
  }
  root.ConsumosTrabajando = { grupos: grupos, leer: leer, ultimo: function () { return ultimo; } };
  root.addEventListener && root.addEventListener('admira:languagechange', function () { if (ultimo) pinta(ultimo); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
