/* /historico (mejora 5, 23-10-2026): qué hizo un agente o un proyecto hoy / ayer / semana / mes. ES/EN (?lang=en).
 * Sin datos de un periodo: «sin datos todavía». Nunca se inventa: lo dice /api/consumos/historico. */
(function () {
  'use strict';
  var EN = (function () { try { var q = new URL(location.href).searchParams.get('lang'); if (q) return /^en/i.test(q); var s = localStorage.getItem('admiranext_expert_lang') || localStorage.getItem('xtanco_lang'); return !!s && /^en/i.test(s); } catch (e) { return false; } })();
  function T(es, en) { return EN ? en : es; }
  var PER = { hoy: T('Hoy', 'Today'), ayer: T('Ayer', 'Yesterday'), semana: T('Esta semana (lunes–hoy)', 'This week (Monday–today)'), mes: T('Este mes (día 1–hoy)', 'This month (1st–today)') };
  var SIN = T('sin datos todavía', 'no data yet');
  var url = new URL(location.href), tipo = url.searchParams.get('tipo') === 'proyecto' ? 'proyecto' : 'agente', nombre = url.searchParams.get('nombre') || '';
  var listas = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', EN ? '.' : ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n); }
  function hora(s) { return s ? new Date(s * 1000).toLocaleString(EN ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
  function cob(x) { return x && x.cobertura === 'parcial' ? ' <span class="nota">(' + T('parcial · datos desde ', 'partial · data since ') + esc(x.datosDesde) + ')</span>' : ''; }
  function lista(arr, f) { return arr.length ? '<ul>' + arr.slice(0, 40).map(f).join('') + '</ul>' + (arr.length > 40 ? '<p class="nota">+' + (arr.length - 40) + '</p>' : '') : '<p class="nota">' + T('ninguno', 'none') + '</p>'; }
  function enc(e) { return '<li>' + esc(e.etiqueta || ('#' + e.id)) + ' · ' + esc(e.titulo) + ' <span class="nota">' + esc(hora(e.cuando)) + (tipo === 'proyecto' && e.persona ? ' · ' + esc(e.persona) : '') + '</span></li>'; }
  function per(p) {
    var h = '<section class="per"><h2>' + esc(PER[p.id] || p.id) + '</h2><div class="rango">' + esc(p.desde === p.hasta ? p.desde : p.desde + ' → ' + p.hasta) + ' (Madrid)</div>';
    h += '<h3>' + T('Tokens', 'Tokens') + '</h3>' + (p.tokens ? '<div class="cifra">' + fmt(p.tokens.total) + '</div><div class="nota">' + p.tokens.diasConDatos + '/' + p.tokens.dias + T(' días con datos · ', ' days with data · ') + esc((p.tokens.fuentes || []).join(', ')) + '</div>' + cob(p.tokens) : '<p class="sin">' + SIN + '</p>');
    h += '<h3>' + T('Encargos aceptados', 'Tasks accepted') + cob(p.encargos) + '</h3>' + (p.encargos ? lista(p.encargos.aceptados, enc) : '<p class="sin">' + SIN + '</p>');
    h += '<h3>' + T('Encargos cerrados', 'Tasks closed') + '</h3>' + (p.encargos ? lista(p.encargos.cerrados, enc) : '<p class="sin">' + SIN + '</p>');
    h += '<h3>' + T('Misiones', 'Missions') + cob(p.misiones) + '</h3>' + (p.misiones ? lista(p.misiones.lista, function (m) { return '<li>' + esc(m.id) + ' · ' + esc(m.titulo) + ' <span class="nota">' + esc(m.estado) + ' · ' + esc(hora(m.cuando)) + (tipo === 'proyecto' && m.quien ? ' · ' + esc(m.quien) : '') + '</span></li>'; }) : '<p class="sin">' + SIN + '</p>');
    return h + '</section>';
  }
  function pinta() {
    document.getElementById('b-agente').className = tipo === 'agente' ? 'on' : '';
    document.getElementById('b-proyecto').className = tipo === 'proyecto' ? 'on' : '';
    var sel = document.getElementById('sel'), l = listas ? (tipo === 'agente' ? listas.agentes : listas.proyectos) : [];
    sel.innerHTML = '<option value="">' + esc(T('— elige —', '— pick one —')) + '</option>' + l.map(function (n) { return '<option' + (n === nombre ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
  }
  function carga() {
    var rej = document.getElementById('rejilla'), est = document.getElementById('estado');
    history.replaceState(null, '', '/historico?tipo=' + tipo + (nombre ? '&nombre=' + encodeURIComponent(nombre) : '') + (EN ? '&lang=en' : ''));
    if (!nombre) { rej.innerHTML = ''; est.textContent = T('Elige un agente o un proyecto.', 'Pick an agent or a project.'); return; }
    est.textContent = T('Cargando… (las misiones de Yokup tardan hasta ~40 s la primera vez)', 'Loading… (Yokup missions can take ~40 s the first time)');
    fetch('/api/consumos/historico?tipo=' + tipo + '&nombre=' + encodeURIComponent(nombre)).then(function (r) { return r.json(); }).then(function (d) {
      est.textContent = '';
      rej.innerHTML = (d.periodos || []).map(per).join('');
      var f = d.fuentes || {};
      document.getElementById('pie').textContent = T('Fuentes: libro histórico KV desde ', 'Sources: KV history ledger since ') + (f.libro || T('hoy', 'today')) + T(' · partes de Yokup (~31 días) · bandeja de encargos de Yokup (80 últimos) + libro de encargos · misiones de Yokup (', ' · Yokup reports (~31 days) · Yokup task inbox (last 80) + task ledger · Yokup missions (') + (f.misiones || 0) + ')';
    }).catch(function () { est.textContent = T('No se pudo cargar el histórico.', 'Could not load the history.'); });
  }
  document.getElementById('titulo').textContent = T('Histórico', 'History');
  document.getElementById('volver').textContent = T('← Consumos', '← Usage');
  document.getElementById('b-agente').textContent = T('Agentes', 'Agents');
  document.getElementById('b-proyecto').textContent = T('Proyectos', 'Projects');
  ['b-agente', 'b-proyecto'].forEach(function (id) { document.getElementById(id).onclick = function () { tipo = this.getAttribute('data-tipo'); nombre = ''; pinta(); carga(); }; });
  document.getElementById('sel').onchange = function () { nombre = this.value; carga(); };
  pinta(); carga();
  fetch('/api/consumos/historico').then(function (r) { return r.json(); }).then(function (d) { listas = d; pinta(); }).catch(function () {});
})();
