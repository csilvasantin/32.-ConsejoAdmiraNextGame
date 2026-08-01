/* ══════════════════════════════════════════════════════════════════════════
   admira.live/informes — RENDERIZADORES
   ─────────────────────────────────────────────────────────────────────────
   Un mismo modelo → cuatro salidas:
     · informe HTML interactivo (documento autónomo, imprimible como PDF)
     · resumen ejecutivo de una página
     · deck de slides
     · guion de audio (lo locuta el navegador con speechSynthesis)

   Gráficos: SVG generado a mano, sin librerías ni CDN. Así el documento
   descargado funciona sin red, para siempre.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const E = global.InformeEngine;
  const esc = E.esc, fmtNum = E.fmtNum, fmtDate = E.fmtDate;

  // Paleta categórica: contrastes distinguibles también en impresión b/n
  const PALETTE = ['#78f3ff', '#ffd866', '#a78bfa', '#4ade80', '#fb7185', '#38bdf8', '#f59e0b', '#c084fc', '#2dd4bf', '#f87171', '#94a3b8', '#facc15'];

  /* ─────────────────────────────────────────────────────────────────
     GRÁFICOS · SVG puro
     ───────────────────────────────────────────────────────────────── */

  function chartBar(items, opts) {
    opts = opts || {};
    const w = 720, rowH = 30, padL = opts.padL || 170, padR = 70;
    const h = items.length * rowH + 16;
    const max = Math.max(...items.map((i) => i.value), 1);
    const bars = items.map((it, i) => {
      const y = i * rowH + 8;
      const bw = Math.max(2, ((w - padL - padR) * it.value) / max);
      const c = PALETTE[i % PALETTE.length];
      const label = String(it.label).length > 24 ? String(it.label).slice(0, 23) + '…' : String(it.label);
      return `<g>
        <text x="${padL - 10}" y="${y + 14}" text-anchor="end" class="lbl">${esc(label)}</text>
        <rect x="${padL}" y="${y + 3}" width="${bw}" height="16" rx="3" fill="${c}" opacity=".85"/>
        <text x="${padL + bw + 8}" y="${y + 15}" class="val">${esc(fmtNum(it.value))}</text>
      </g>`;
    }).join('');
    return svgWrap(w, h, bars);
  }

  function chartDonut(items, total) {
    const size = 260, r = 100, cx = size / 2, cy = size / 2, stroke = 34;
    const sum = total || items.reduce((a, i) => a + i.value, 0) || 1;
    let acc = 0;
    const circ = 2 * Math.PI * r;
    const arcs = items.map((it, i) => {
      const frac = it.value / sum;
      const dash = `${circ * frac} ${circ * (1 - frac)}`;
      const off = circ * (1 - acc) + circ * 0.25;
      acc += frac;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PALETTE[i % PALETTE.length]}"
        stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${off}" opacity=".9"/>`;
    }).join('');
    const legend = items.map((it, i) => {
      const pct = ((it.value / sum) * 100).toFixed(1).replace('.', ',');
      return `<div class="lg-item"><span class="lg-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <span class="lg-name">${esc(it.label)}</span><span class="lg-val">${esc(fmtNum(it.value))} · ${pct}%</span></div>`;
    }).join('');
    return `<div class="donut-wrap">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="chart" role="img">
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="big">${esc(fmtNum(sum))}</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="lbl">total</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>`;
  }

  function chartLine(items) {
    const w = 720, h = 200, padL = 46, padB = 30, padT = 14, padR = 12;
    if (items.length < 2) return '<p class="muted">Serie demasiado corta para dibujar una tendencia.</p>';
    const max = Math.max(...items.map((i) => i.value), 1);
    const iw = w - padL - padR, ih = h - padB - padT;
    const pt = (it, i) => [padL + (iw * i) / (items.length - 1), padT + ih - (ih * it.value) / max];
    const pts = items.map(pt);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = path + ` L${pts[pts.length - 1][0].toFixed(1)} ${padT + ih} L${pts[0][0].toFixed(1)} ${padT + ih} Z`;
    const grid = [0, 0.5, 1].map((f) => {
      const y = padT + ih - ih * f;
      return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="grid"/>
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="lbl">${esc(fmtNum(max * f, 0))}</text>`;
    }).join('');
    const step = Math.ceil(items.length / 7);
    // La primera y la última etiqueta se anclan hacia dentro, si no se salen del lienzo.
    const xlabels = items.map((it, i) => {
      if (i % step !== 0 && i !== items.length - 1) return '';
      const anchor = i === 0 ? 'start' : i === items.length - 1 ? 'end' : 'middle';
      return `<text x="${pts[i][0].toFixed(1)}" y="${h - 8}" text-anchor="${anchor}" class="lbl">${esc(it.label.slice(5))}</text>`;
    }).join('');
    const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#78f3ff"><title>${esc(items[i].label)}: ${esc(fmtNum(items[i].value))}</title></circle>`).join('');
    return svgWrap(w, h, `${grid}<path d="${area}" fill="url(#lgrad)" opacity=".35"/>
      <path d="${path}" fill="none" stroke="#78f3ff" stroke-width="2.2" stroke-linejoin="round"/>${dots}${xlabels}`,
      `<defs><linearGradient id="lgrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#78f3ff" stop-opacity=".7"/><stop offset="100%" stop-color="#78f3ff" stop-opacity="0"/>
      </linearGradient></defs>`);
  }

  function svgWrap(w, h, inner, defs) {
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMinYMin meet" class="chart" role="img">${defs || ''}${inner}</svg>`;
  }

  function renderChart(c) {
    const body = c.kind === 'donut' ? chartDonut(c.items, c.total)
      : c.kind === 'line' ? chartLine(c.items)
        : chartBar(c.items);
    return `<figure class="fig">
      <figcaption>${esc(c.title)}${c.note ? ` <span class="muted">· ${esc(c.note)}</span>` : ''}</figcaption>
      ${body}
    </figure>`;
  }

  /* ─────────────────────────────────────────────────────────────────
     ESTILO del documento autónomo (pantalla + impresión)
     ───────────────────────────────────────────────────────────────── */

  const DOC_CSS = `
:root{--bg:#02080d;--panel:#06121a;--panel2:#081a24;--ink:#dff8ff;--mut:#75aab9;
  --brand:#78f3ff;--accent:#ffd866;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--line:rgba(120,243,255,.18)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.62;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background-image:radial-gradient(ellipse at 12% -8%,rgba(120,243,255,.09),transparent 55%)}
.doc{max-width:900px;margin:0 auto;padding:48px 28px 90px}
.cover{border-bottom:1px solid var(--line);padding-bottom:26px;margin-bottom:34px}
.kicker{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;
  text-transform:uppercase;color:var(--brand);margin-bottom:14px}
h1{font-size:36px;line-height:1.15;letter-spacing:-.025em;margin:0 0 14px;font-weight:800}
.meta{font:12px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mut)}
.meta b{color:var(--ink);font-weight:600}
h2{font-size:21px;margin:44px 0 6px;letter-spacing:-.015em;font-weight:700}
h2::before{content:"";display:block;width:38px;height:2px;background:var(--brand);margin-bottom:12px}
h3{font-size:15px;margin:26px 0 8px;color:var(--brand);font-weight:700}
p{margin:0 0 14px}
.lead{font-size:17px;color:var(--ink);opacity:.95}
.muted{color:var(--mut)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:22px 0 8px}
.kpi{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);
  border-radius:12px;padding:15px 16px}
.kpi .k-l{font:600 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
.kpi .k-v{font-size:29px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.kpi .k-u{font-size:12px;color:var(--mut);font-weight:600;margin-left:5px}
.kpi .k-f{font:10px/1.5 ui-monospace,Menlo,monospace;color:var(--mut);opacity:.8;margin-top:8px;
  padding-top:8px;border-top:1px dashed rgba(120,243,255,.16)}
.fig{margin:24px 0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.fig figcaption{font:600 11px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;
  color:var(--mut);margin-bottom:14px}
.chart .lbl{font:10px ui-monospace,Menlo,monospace;fill:var(--mut)}
.chart .val{font:600 11px ui-monospace,Menlo,monospace;fill:var(--ink)}
.chart .big{font:800 26px -apple-system,sans-serif;fill:var(--ink)}
.chart .grid{stroke:rgba(120,243,255,.14);stroke-width:1}
.donut-wrap{display:flex;gap:26px;align-items:center;flex-wrap:wrap}
.legend{flex:1;min-width:220px}
.lg-item{display:flex;align-items:center;gap:9px;font-size:13px;padding:4px 0}
.lg-dot{width:10px;height:10px;border-radius:3px;flex:none}
.lg-name{flex:1;color:var(--ink)}
.lg-val{font:11px ui-monospace,Menlo,monospace;color:var(--mut)}
ul.find{list-style:none;margin:14px 0;padding:0}
ul.find li{position:relative;padding:11px 14px 11px 40px;margin-bottom:8px;background:var(--panel);
  border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:0 9px 9px 0}
ul.find li::before{content:"▸";position:absolute;left:16px;top:11px;color:var(--brand);font-weight:700}
ul.find li.riesgo{border-left-color:var(--bad)} ul.find li.riesgo::before{content:"!";color:var(--bad)}
ul.find li.subida{border-left-color:var(--ok)} ul.find li.subida::before{content:"↑";color:var(--ok)}
ul.find li.bajada{border-left-color:var(--warn)} ul.find li.bajada::before{content:"↓";color:var(--warn)}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:14px 0}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
td.num{text-align:right;font-family:ui-monospace,Menlo,monospace}
.note{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.32);border-radius:10px;
  padding:13px 16px;margin:18px 0;font-size:13.5px}
.note.bad{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.32)}
.note b{color:var(--accent)}
.unver{background:rgba(248,113,113,.16);border-bottom:1.5px dotted var(--bad);padding:0 2px;border-radius:2px}
.prov{font:11px/1.7 ui-monospace,Menlo,monospace;color:var(--mut)}
.prov li{margin-bottom:6px;word-break:break-all}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);
  font:11px/1.8 ui-monospace,Menlo,monospace;color:var(--mut)}
.badge{display:inline-block;font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.08em;
  text-transform:uppercase;padding:3px 8px;border-radius:5px;border:1px solid var(--line);color:var(--brand)}

@media print{
  /* Papel: se redefinen las VARIABLES, no cada regla. Así nada se queda con un color
     del tema oscuro sobre blanco — que es el clásico texto cian ilegible en el PDF. */
  :root{--bg:#fff;--panel:#fff;--panel2:#fff;--ink:#111;--mut:#4a5c63;
    --brand:#0b6b7a;--accent:#8a6100;--ok:#1a7f37;--warn:#8a6100;--bad:#c0392b;--line:#c9d6db}
  @page{size:A4;margin:16mm 14mm}
  body{background:#fff;background-image:none;font-size:10.5pt}
  .doc{max-width:none;padding:0}
  h1{font-size:24pt} h2{font-size:14pt;margin-top:22pt} h3{font-size:11pt}
  .kpi,.fig,ul.find li,.note{background:#fff;break-inside:avoid}
  .kpi .k-v{font-size:19pt}
  .kpi .k-f{border-top-color:#dbe4e8}
  .chart .grid{stroke:#dbe4e8}
  .note{background:#fffaf0} .note.bad{background:#fff5f5}
  .unver{background:#ffe9e9}
  .fig,figure,table,.kpis{break-inside:avoid}
  h2,h3{break-after:avoid}
  a{text-decoration:none}
}`;

  /* ─────────────────────────────────────────────────────────────────
     INFORME COMPLETO · documento autónomo
     ───────────────────────────────────────────────────────────────── */

  function markUnverified(text, unverified) {
    let out = esc(text || '');
    for (const u of unverified) {
      const safe = esc(u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('(?<![\\d>])' + safe + '(?![\\d<])', 'g'),
        `<span class="unver" title="Esta cifra no aparece en los datos calculados">${esc(u)}</span>`);
    }
    return out.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  }

  /* Elige los hechos que MERECE la pena destacar. Un "mayoritario «Morfeo» = 4" no es
     un indicador de dirección; "tasa de cierre = 45,2 %" sí. Misma selección para el
     informe, el deck y el guion de audio: un solo criterio, sin divergencias. */
  function pickFacts(analyses, limit) {
    const DESTACA = /^(Tareas cerradas|Tasa de cierre|En curso|Agentes|Dudas|Máquinas|Bloqueadas|Entradas|Tiempo medio)/i;
    const RELLENO = /(mayoritario|primer registro|último registro|periodo cubierto|registros analizados)/i;
    const order = (f) => (DESTACA.test(f.label) ? 0 : RELLENO.test(f.label) ? 2 : 1);
    return analyses.flatMap((a) => a.facts)
      .map((f, i) => ({ f, i }))
      .sort((x, y) => order(x.f) - order(y.f) || x.i - y.i)
      .slice(0, limit || 8).map((x) => x.f);
  }

  function kpiCards(analyses, limit) {
    return pickFacts(analyses, limit).map((f) => `
      <div class="kpi">
        <div class="k-l">${esc(f.label)}</div>
        <div class="k-v">${esc(typeof f.value === 'number' ? fmtNum(f.value) : f.value)}${f.unit ? `<span class="k-u">${esc(f.unit)}</span>` : ''}</div>
        <div class="k-f">= ${esc(f.formula)}</div>
      </div>`).join('');
  }

  function dataTable(a, maxRows) {
    const rows = a.table.rows.slice(0, maxRows || 25);
    if (!rows.length) return '';
    const cols = a.fields.filter((f) => f.type !== 'vacio').slice(0, 7).map((f) => f.key);
    const head = cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const body = rows.map((r) => '<tr>' + cols.map((c) => {
      const f = a.fields.find((x) => x.key === c);
      let v = r[c];
      if (f && f.type === 'fecha') v = fmtDate(Number(v));
      const s = String(v === undefined || v === null ? '' : v);
      return `<td${f && f.type === 'numero' ? ' class="num"' : ''}>${esc(s.length > 70 ? s.slice(0, 69) + '…' : s)}</td>`;
    }).join('') + '</tr>').join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      ${a.table.rows.length > rows.length ? `<p class="muted">Mostrando ${rows.length} de ${a.table.rows.length} filas. La descarga JSON incluye el conjunto completo.</p>` : ''}`;
  }

  function reportHTML(model) {
    const { cfg, analyses, narrative, unverified, warnings, totals, generatedAt } = model;
    const title = (narrative && narrative.titulo) || cfg.title || 'Informe';
    const insights = analyses.flatMap((a) => a.insights).sort((a, b) => b.weight - a.weight);

    const sections = (narrative && narrative.secciones || []).map((s) => `
      <h3>${esc(s.titulo || '')}</h3>
      <p>${markUnverified(s.texto || '', unverified)}</p>`).join('');

    const provenance = analyses.map((a) => `
      <li><b>${esc(a.table.name)}</b> — ${esc(a.table.source.label)} · ${a.table.rows.length} filas
        ${(a.table.source.urls || []).length ? '<br>' + a.table.source.urls.map((u) => esc(u)).join('<br>') : ''}
        ${a.table.source.truncNote ? `<br><i>Límite: ${esc(a.table.source.truncNote)}</i>` : ''}</li>`).join('');

    const charts = analyses.flatMap((a) => a.charts).map(renderChart).join('');

    const warnBlock = warnings.length ? `<div class="note"><b>Advertencias de la generación</b><br>${warnings.map(esc).join('<br>')}</div>` : '';
    const unverBlock = unverified.length ? `<div class="note bad"><b>${unverified.length} cifra(s) sin respaldo en los datos</b><br>
      La redacción automática menciona ${unverified.map((u) => '<code>' + esc(u) + '</code>').join(', ')}, que no aparecen en ninguna métrica calculada.
      Van resaltadas en rojo en el texto. Trátalas como no fiables.</div>` : '';
    const noLlm = model.llmError
      ? `<div class="note bad"><b>Informe sin narrativa</b><br>
         El redactor no estuvo disponible (${esc(model.llmError)}). Todo lo que sigue está calculado
         directamente de los datos: las métricas, los gráficos y los hallazgos son íntegros.</div>`
      : (!narrative ? `<div class="note"><b>Informe sólo de datos</b><br>
         Se ha pedido expresamente sin redacción automática: aquí no hay ni una frase escrita por un modelo.
         Todo lo que sigue son cifras calculadas y reglas aplicadas sobre ellas.</div>` : '');

    return `<!doctype html><html lang="${cfg.lang === 'en' ? 'en' : 'es'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${DOC_CSS}</style></head><body><article class="doc">

<header class="cover">
  <div class="kicker">Informe · AdmiraNeXT</div>
  <h1>${esc(title)}</h1>
  <div class="meta">
    Generado el <b>${esc(new Date(generatedAt * 1000).toLocaleString('es-ES'))}</b><br>
    <b>${totals.rows}</b> filas analizadas · <b>${totals.facts}</b> métricas calculadas · <b>${totals.tables}</b> fuente(s)<br>
    Audiencia: <b>${esc(cfg.audience)}</b>
    ${narrative ? '' : ' · <span class="badge">sin narrativa</span>'}
    ${unverified.length ? ' · <span class="badge" style="color:#f87171">cifras marcadas</span>' : narrative ? ' · <span class="badge" style="color:#4ade80">cifras verificadas</span>' : ''}
  </div>
</header>

${noLlm}${unverBlock}${warnBlock}

<h2>Resumen ejecutivo</h2>
${narrative && narrative.resumen_ejecutivo
        ? `<p class="lead">${markUnverified(narrative.resumen_ejecutivo, unverified)}</p>`
        : `<p class="lead">Este informe recoge ${totals.rows} registros de ${totals.tables} fuente(s) y calcula ${totals.facts} métricas.
           ${model.llmError ? 'Sin redactor disponible, los' : 'Sin redacción automática, los'} indicadores y hallazgos de más abajo son el resumen.</p>`}

<h2>Indicadores</h2>
<div class="kpis">${kpiCards(analyses, 8)}</div>
<p class="muted">Cada indicador muestra la fórmula con la que se ha obtenido. Puedes rehacer la cuenta con los datos del anexo.</p>

${insights.length ? `<h2>Hallazgos</h2>
<ul class="find">${insights.map((i) => `<li class="${esc(i.kind)}">${esc(i.text)}</li>`).join('')}</ul>
<p class="muted">Hallazgos calculados por reglas sobre los datos (concentración, tendencia, estancamiento, dispersión, riesgo). No los redacta un modelo de lenguaje.</p>` : ''}

${charts ? `<h2>Gráficos</h2>${charts}` : ''}

${sections ? `<h2>Análisis</h2>${sections}` : ''}

${narrative && narrative.recomendaciones && narrative.recomendaciones.length ? `<h2>Recomendaciones</h2>
<ul class="find">${narrative.recomendaciones.map((r) => `<li>${markUnverified(r, unverified)}</li>`).join('')}</ul>` : ''}

${narrative && narrative.conclusion ? `<h2>Conclusión</h2><p>${markUnverified(narrative.conclusion, unverified)}</p>` : ''}

<h2>Anexo · datos y procedencia</h2>
<p class="muted">De dónde sale cada cifra. Sin esto, un informe es una opinión con gráficos.</p>
<ul class="prov">${provenance}</ul>
${analyses.map((a) => `<h3>${esc(a.table.name)}</h3>${dataTable(a, 20)}`).join('')}

<footer>
  admira.live/informes · motor de informes de AdmiraNeXT<br>
  Las métricas y los gráficos se calculan en el navegador a partir de los datos citados arriba.
  ${narrative ? 'La narrativa la redacta un modelo de lenguaje sobre esas métricas ya calculadas, y toda cifra que escribe se verifica contra ellas.' : ''}
</footer>
</article></body></html>`;
  }

  /* ─────────────────────────────────────────────────────────────────
     RESUMEN EJECUTIVO · una página
     ───────────────────────────────────────────────────────────────── */

  function summaryHTML(model) {
    const { cfg, analyses, narrative, unverified, generatedAt, totals } = model;
    const title = (narrative && narrative.titulo) || cfg.title || 'Informe';
    const insights = analyses.flatMap((a) => a.insights).sort((a, b) => b.weight - a.weight).slice(0, 5);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · resumen</title>
<style>${DOC_CSS}</style></head><body><article class="doc">
<header class="cover"><div class="kicker">Resumen ejecutivo · 1 página</div><h1>${esc(title)}</h1>
<div class="meta">${esc(new Date(generatedAt * 1000).toLocaleString('es-ES'))} · <b>${totals.rows}</b> filas · <b>${totals.facts}</b> métricas</div></header>
${narrative && narrative.resumen_ejecutivo ? `<p class="lead">${markUnverified(narrative.resumen_ejecutivo, unverified)}</p>` : ''}
<div class="kpis">${kpiCards(analyses, 4)}</div>
${insights.length ? `<h2>Lo que importa</h2><ul class="find">${insights.map((i) => `<li class="${esc(i.kind)}">${esc(i.text)}</li>`).join('')}</ul>` : ''}
${narrative && narrative.recomendaciones && narrative.recomendaciones.length
        ? `<h2>Siguiente paso</h2><ul class="find">${narrative.recomendaciones.slice(0, 3).map((r) => `<li>${markUnverified(r, unverified)}</li>`).join('')}</ul>` : ''}
<footer>admira.live/informes · el informe completo incluye gráficos, análisis y anexo de procedencia.</footer>
</article></body></html>`;
  }

  /* ─────────────────────────────────────────────────────────────────
     DECK · los mismos datos como presentación
     ───────────────────────────────────────────────────────────────── */

  function deckHTML(model) {
    const { cfg, analyses, narrative, unverified, generatedAt, totals } = model;
    const title = (narrative && narrative.titulo) || cfg.title || 'Informe';
    const insights = analyses.flatMap((a) => a.insights).sort((a, b) => b.weight - a.weight).slice(0, 6);
    const charts = analyses.flatMap((a) => a.charts).slice(0, 6);
    const secs = (narrative && narrative.secciones || []).slice(0, 6);

    const slides = [];
    slides.push(`<section class="s cover"><div class="kick">AdmiraNeXT · Informe</div>
      <h1>${esc(title)}</h1>
      <p class="sub">${esc(new Date(generatedAt * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }))}
      · ${totals.rows} filas · ${totals.facts} métricas</p></section>`);

    if (narrative && narrative.resumen_ejecutivo) {
      slides.push(`<section class="s"><h2>En una frase</h2><p class="big">${markUnverified(narrative.resumen_ejecutivo.split(/(?<=\.)\s/)[0], unverified)}</p></section>`);
    }

    const kpis = pickFacts(analyses, 4);
    if (kpis.length) {
      slides.push(`<section class="s"><h2>Los números</h2><div class="kpis">${kpis.map((f) => `
        <div class="kpi"><div class="k-l">${esc(f.label)}</div>
        <div class="k-v">${esc(typeof f.value === 'number' ? fmtNum(f.value) : f.value)}<span class="k-u">${esc(f.unit)}</span></div></div>`).join('')}</div></section>`);
    }

    charts.forEach((c) => slides.push(`<section class="s"><h2>${esc(c.title)}</h2>${renderChart(c).replace(/<figcaption>[\s\S]*?<\/figcaption>/, '')}</section>`));

    if (insights.length) {
      slides.push(`<section class="s"><h2>Hallazgos</h2><ul class="find">${insights.map((i) => `<li class="${esc(i.kind)}">${esc(i.text)}</li>`).join('')}</ul></section>`);
    }
    secs.forEach((s) => slides.push(`<section class="s"><h2>${esc(s.titulo || '')}</h2><p>${markUnverified(s.texto || '', unverified)}</p></section>`));

    if (narrative && narrative.recomendaciones && narrative.recomendaciones.length) {
      slides.push(`<section class="s"><h2>Qué hacer</h2><ul class="find">${narrative.recomendaciones.map((r) => `<li>${markUnverified(r, unverified)}</li>`).join('')}</ul></section>`);
    }
    slides.push(`<section class="s cover"><div class="kick">Fin</div><h1>Gracias</h1>
      <p class="sub">Datos: ${analyses.map((a) => esc(a.table.source.label)).join(' · ')}</p></section>`);

    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · deck</title>
<style>${DOC_CSS}
html,body{height:100%;overflow:hidden}
body{scroll-snap-type:y mandatory;overflow-y:scroll;padding:0}
.s{min-height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;
  padding:7vh 8vw;border-bottom:1px solid var(--line);position:relative}
.s.cover{align-items:flex-start}
.s h1{font-size:clamp(32px,6vw,66px)}
.s h2{font-size:clamp(20px,3vw,32px);margin:0 0 26px}
.s h2::before{width:52px;height:3px}
.s p{font-size:clamp(15px,1.7vw,20px);max-width:60ch}
.s p.big{font-size:clamp(20px,3vw,34px);line-height:1.4;font-weight:600;max-width:22ch}
.s .kick{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;text-transform:uppercase;color:var(--brand);margin-bottom:20px}
.s .sub{color:var(--mut);font-size:15px}
.s .fig{background:transparent;border:none;padding:0}
.s ul.find li{font-size:clamp(14px,1.5vw,18px)}
.nav{position:fixed;right:18px;bottom:16px;font:11px ui-monospace,Menlo,monospace;color:var(--mut);z-index:9}
@media print{html,body{overflow:visible;height:auto}.s{min-height:auto;break-after:page;padding:0 0 26pt}.nav{display:none}}
</style></head><body>
${slides.join('\n')}
<div class="nav">↓ desplázate · ${slides.length} slides · admira.live/informes</div>
</body></html>`;
  }

  /* ─────────────────────────────────────────────────────────────────
     GUION DE AUDIO
     ───────────────────────────────────────────────────────────────── */

  function audioScript(model) {
    const { cfg, analyses, narrative, totals } = model;
    const title = (narrative && narrative.titulo) || cfg.title || 'Informe';
    const insights = analyses.flatMap((a) => a.insights).sort((a, b) => b.weight - a.weight).slice(0, 4);
    const kpis = pickFacts(analyses, 4);
    const parts = [`${title}.`];
    parts.push(`Informe generado sobre ${totals.rows} registros de ${totals.tables} fuentes, con ${totals.facts} métricas calculadas.`);
    if (narrative && narrative.resumen_ejecutivo) parts.push(narrative.resumen_ejecutivo);
    if (kpis.length) {
      parts.push('Indicadores principales.');
      kpis.forEach((f) => parts.push(`${f.label}: ${typeof f.value === 'number' ? fmtNum(f.value) : f.value} ${f.unit}.`));
    }
    if (insights.length) {
      parts.push('Hallazgos.');
      insights.forEach((i) => parts.push(i.text));
    }
    if (narrative && narrative.recomendaciones) {
      parts.push('Recomendaciones.');
      narrative.recomendaciones.slice(0, 3).forEach((r) => parts.push(r));
    }
    if (narrative && narrative.conclusion) parts.push('Conclusión. ' + narrative.conclusion);
    return parts.join('\n\n');
  }

  global.InformeRender = { reportHTML, summaryHTML, deckHTML, audioScript, renderChart, pickFacts, DOC_CSS, PALETTE };
})(window);
