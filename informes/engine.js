/* ══════════════════════════════════════════════════════════════════════════
   admira.live/informes — MOTOR DE INFORMES
   ─────────────────────────────────────────────────────────────────────────
   Principio rector (lo que separa un INFORME de una PRESENTACIÓN):

       LAS CIFRAS NO LAS INVENTA EL LLM.

   El motor calcula en JS, de forma determinista y auditable, todos los
   hechos numéricos. El LLM sólo REDACTA sobre hechos ya calculados, y
   después verificamos una a una las cifras que aparecen en su texto.
   Toda cifra que no exista en la base de hechos se marca como no
   verificada, a la vista del lector. Honestidad por construcción.

   Capas:
     1. INGESTA    → Table  {name, rows, fields, source}
     2. PERFILADO  → tipos de campo inferidos
     3. CÁLCULO    → Fact   {id, label, value, unit, formula, source, n}
     4. INSIGHTS   → hallazgos deterministas (concentración, tendencia, ...)
     5. NARRATIVA  → LLM (opcional) + verificación de cifras
     6. RENDER     → HTML/PDF/Deck/Audio (render.js)

   Sin dependencias externas. Todo vanilla, todo offline-capaz.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const WORKER = 'https://admira-telegram.csilvasantin.workers.dev';

  /* ─────────────────────────────────────────────────────────────────
     UTILIDADES
     ───────────────────────────────────────────────────────────────── */

  const nowSec = () => Math.floor(Date.now() / 1000);
  const DAY = 86400;

  function fmtNum(v, dec) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    if (dec === undefined) dec = Number.isInteger(v) ? 0 : 1;
    return v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtPct(v, dec) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return fmtNum(v, dec === undefined ? 1 : dec) + '%';
  }

  function fmtDate(epoch) {
    if (!epoch) return '—';
    const d = new Date(epoch * 1000);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function dayKey(epoch) {
    const d = new Date(epoch * 1000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function median(sorted) {
    if (!sorted.length) return null;
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ─────────────────────────────────────────────────────────────────
     1. INGESTA · DATOS VIVOS de admira.live
     ─────────────────────────────────────────────────────────────────
     Cada fetch registra su URL exacta como procedencia. Si una fuente
     falla, se registra el fallo y el informe continúa — nunca se
     inventa un dato para tapar un hueco.
     ───────────────────────────────────────────────────────────────── */

  async function getJSON(url, timeoutMs) {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs || 15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const LIVE_SOURCES = {
    tareas: {
      label: 'Tablero de tareas',
      hint: 'D1 · tabla tasks · todos los estados',
      async load(log) {
        // /api/public/tasks EXCLUYE 'done' salvo que se pida el estado explícitamente,
        // y topa en 200 filas. Barremos estado por estado para cobertura real.
        const states = ['todo', 'doing', 'blocked', 'done', 'pending'];
        const seen = new Map();
        const urls = [];
        for (const st of states) {
          const url = `${WORKER}/api/public/tasks?status=${st}&limit=200`;
          urls.push(url);
          try {
            const d = await getJSON(url);
            (d.tasks || []).forEach((t) => seen.set(t.id, t));
          } catch (e) {
            log('⚠ tareas/' + st + ': ' + e.message);
          }
        }
        const rows = Array.from(seen.values()).map((t) => ({
          id: t.id,
          titulo: t.title || '',
          asignado: t.assignee || '(sin asignar)',
          estado: t.status || '',
          proyecto: t.project || '(sin proyecto)',
          bloqueado_por: t.needs || '',
          actualizado: t.updated_at || 0,
        }));
        return {
          name: 'Tareas',
          rows,
          source: { label: 'Tablero central de tareas · D1', urls, truncated: rows.length >= 200 * states.length },
        };
      },
    },

    diario: {
      label: 'Diario de Silicio',
      hint: 'D1 · tabla diary · últimas entradas',
      async load(log, ctx) {
        // El endpoint topa en 200 y sólo pagina hacia delante (since = id >).
        // Ampliamos cobertura pidiendo además por persona conocida.
        const seen = new Map();
        const urls = [];
        const pull = async (url) => {
          urls.push(url);
          try {
            const d = await getJSON(url);
            (d.entries || []).forEach((e) => seen.set(e.id, e));
          } catch (e) { log('⚠ diario: ' + e.message); }
        };
        await pull(`${WORKER}/api/public/diary?limit=200`);
        for (const p of (ctx.personas || []).slice(0, 12)) {
          await pull(`${WORKER}/api/public/diary?limit=200&persona=${encodeURIComponent(p)}`);
        }
        const rows = Array.from(seen.values()).map((e) => ({
          id: e.id,
          persona: e.persona || '(anónimo)',
          runtime: e.runtime || '(desconocido)',
          tipo: e.kind || '',
          texto: e.text || '',
          fecha: e.date || 0,
        }));
        return {
          name: 'Diario',
          rows,
          source: { label: 'Diario de Silicio · D1', urls, truncated: true, truncNote: 'el endpoint público limita a 200 entradas por consulta' },
        };
      },
    },

    flota: {
      label: 'Flota / presencia',
      hint: 'D1 · tabla presence · un latido por agente',
      async load(log) {
        const url = `${WORKER}/api/presence`;
        let d = { presence: [] };
        try { d = await getJSON(url); } catch (e) { log('⚠ presencia: ' + e.message); }
        const t = nowSec();
        const rows = (d.presence || []).map((p) => ({
          persona: p.persona || '',
          maquina: p.machine || '',
          runtime: p.runtime || '',
          modo: p.mode || 'pasivo',
          proyecto: p.project || '(sin proyecto)',
          foco: p.focus || '',
          decisiones: Number(p.decisions) || 0,
          cpu: Number(p.cpu) || 0,
          segundos_desde_latido: p.updated ? t - p.updated : null,
          online: p.updated && (t - p.updated) < 180 ? 'sí' : 'no',
          ultimo_latido: p.updated || 0,
        }));
        return { name: 'Flota', rows, source: { label: 'Presencia de la flota · D1', urls: [url] } };
      },
    },

    dudas: {
      label: 'Dudas de agentes',
      hint: 'D1 · tabla dudas · preguntas al humano',
      async load(log) {
        const url = `${WORKER}/api/dudas`;
        let d = { dudas: [] };
        try { d = await getJSON(url); } catch (e) { log('⚠ dudas: ' + e.message); }
        const rows = (d.dudas || []).map((x) => ({
          id: x.id,
          agente: x.agente || '',
          maquina: x.maquina || '',
          proyecto: x.proyecto || '(sin proyecto)',
          estado: x.estado || '',
          pregunta: x.pregunta || '',
          creada: x.ts || 0,
          resuelta: x.resolved_at || 0,
        }));
        return { name: 'Dudas', rows, source: { label: 'Dudas de agentes · D1', urls: [url] } };
      },
    },
  };

  // log()  = qué está pasando ahora (se ve en la consola de la interfaz)
  // warn() = algo que el LECTOR del informe debe saber (va impreso en el documento)
  async function ingestLive(keys, log, warn) {
    const tables = [];
    const ctx = { personas: [] };
    // La flota primero: nos da la lista de personas para ampliar el diario.
    const ordered = keys.slice().sort((a, b) => (a === 'flota' ? -1 : b === 'flota' ? 1 : 0));
    for (const k of ordered) {
      const src = LIVE_SOURCES[k];
      if (!src) continue;
      log('· leyendo ' + src.label + '…');
      // Los fallos parciales de dentro de cada fuente (una consulta de 5 que peta)
      // también son cosa del lector: los marcamos con ⚠ y suben a advertencias.
      const srcLog = (m) => { log(m); if (/^\s*⚠/.test(m)) warn(m.replace(/^\s*⚠\s*/, '')); };
      try {
        const t = await src.load(srcLog, ctx);
        if (k === 'flota') ctx.personas = Array.from(new Set(t.rows.map((r) => r.persona).filter(Boolean)));
        if (t.rows.length) tables.push(t);
        else {
          log('  (sin filas en ' + src.label + ')');
          warn('La fuente «' + src.label + '» se consultó y no devolvió ningún registro. No aparece en el análisis.');
        }
      } catch (e) {
        log('⚠ ' + src.label + ' no disponible: ' + e.message);
        warn('La fuente «' + src.label + '» no se pudo leer (' + e.message + '). El informe se ha hecho sin ella.');
      }
    }
    return tables;
  }

  /* ─────────────────────────────────────────────────────────────────
     1b. INGESTA · FICHEROS (CSV / TSV / JSON / texto)
     ───────────────────────────────────────────────────────────────── */

  function parseDelimited(text, delim) {
    // Parser CSV completo: comillas dobles, escapes "" y saltos de línea dentro de campo.
    const rows = [];
    let field = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignora */ }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ''));
  }

  function tableFromText(name, text) {
    const trimmed = text.trim();

    // JSON (array de objetos, o objeto con un array dentro)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        let data = JSON.parse(trimmed);
        if (!Array.isArray(data)) {
          const arr = Object.values(data).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
          data = arr || [data];
        }
        if (Array.isArray(data) && data.length && typeof data[0] === 'object') {
          return { name, rows: data.map(flatten), source: { label: 'Fichero ' + name, urls: [] } };
        }
      } catch (_) { /* sigue con delimitado */ }
    }

    // Delimitado: detecta separador por la primera línea
    const first = trimmed.split('\n')[0] || '';
    const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t'
      : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const grid = parseDelimited(trimmed, delim);
    if (grid.length >= 2 && grid[0].length >= 2) {
      const header = grid[0].map((h, i) => (h || '').trim() || 'col' + (i + 1));
      const rows = grid.slice(1).map((r) => {
        const o = {};
        header.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i].trim(); });
        return o;
      });
      return { name, rows, source: { label: 'Fichero ' + name + ' (' + rows.length + ' filas)', urls: [] } };
    }

    // Texto plano / markdown → no es tabla: se devuelve como contexto documental
    return { name, rows: [], text: trimmed.slice(0, 20000), source: { label: 'Documento ' + name, urls: [] } };
  }

  function flatten(obj, prefix, out) {
    out = out || {}; prefix = prefix || '';
    for (const k of Object.keys(obj || {})) {
      const v = obj[k];
      const key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else if (Array.isArray(v)) out[key] = v.length;
      else out[key] = v;
    }
    return out;
  }

  /* ─────────────────────────────────────────────────────────────────
     2. PERFILADO · inferencia de tipos
     ───────────────────────────────────────────────────────────────── */

  const DATE_HINT = /(date|fecha|_at|updated|created|ts$|timestamp|latido)/i;

  function inferFields(rows) {
    if (!rows.length) return [];
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    return keys.map((key) => {
      const vals = rows.map((r) => r[key]).filter((v) => v !== '' && v !== null && v !== undefined);
      const n = vals.length;
      if (!n) return { key, type: 'vacio', filled: 0, distinct: 0 };

      const nums = vals.filter((v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v.replace(',', '.')))));
      const numeric = nums.length === n;
      const distinct = new Set(vals.map(String)).size;

      // Fecha: epoch plausible (2001-2100) en campo con nombre de fecha, o ISO parseable
      if (numeric && DATE_HINT.test(key)) {
        const asNum = vals.map((v) => Number(String(v).replace(',', '.')));
        const plausible = asNum.filter((v) => v > 1000000000 && v < 4102444800).length;
        if (plausible / n > 0.8) return { key, type: 'fecha', unit: 'epoch', filled: n, distinct };
      }
      if (!numeric && DATE_HINT.test(key)) {
        const ok = vals.filter((v) => !Number.isNaN(Date.parse(v))).length;
        if (ok / n > 0.8) return { key, type: 'fecha', unit: 'iso', filled: n, distinct };
      }
      if (numeric) return { key, type: 'numero', filled: n, distinct };

      const avgLen = vals.reduce((a, v) => a + String(v).length, 0) / n;
      if (distinct <= Math.max(30, n * 0.25) && avgLen <= 60) return { key, type: 'categoria', filled: n, distinct };
      return { key, type: 'texto', filled: n, distinct, avgLen: Math.round(avgLen) };
    });
  }

  function toEpoch(v, unit) {
    if (v === '' || v === null || v === undefined) return null;
    if (unit === 'iso') { const t = Date.parse(v); return Number.isNaN(t) ? null : Math.floor(t / 1000); }
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  /* ─────────────────────────────────────────────────────────────────
     3-4. CÁLCULO · hechos e insights deterministas
     ─────────────────────────────────────────────────────────────────
     Cada Fact lleva su FÓRMULA en texto: el lector puede rehacer la
     cuenta a mano. Eso es lo que convierte esto en un informe.
     ───────────────────────────────────────────────────────────────── */

  function analyzeTable(table) {
    const rows = table.rows || [];
    // Nombre legible para meterlo dentro de una frase: «campanas.csv» → «campanas»
    table.label = table.label || table.name.replace(/\.[a-z0-9]{1,5}$/i, '').toLowerCase();
    const fields = inferFields(rows);
    const facts = [];
    const charts = [];
    const insights = [];
    const src = table.source.label;
    let fid = 0;
    const F = (label, value, unit, formula) => {
      const f = { id: table.name.toLowerCase() + '-' + (++fid), label, value, unit: unit || '', formula, source: src, n: rows.length };
      facts.push(f); return f;
    };

    F(`${table.name} · registros analizados`, rows.length, 'filas', 'conteo de filas devueltas por la fuente');

    // ── Distribuciones categóricas ──
    const cats = fields.filter((f) => f.type === 'categoria' && f.distinct > 1 && f.distinct <= 30);
    for (const f of cats.slice(0, 5)) {
      const counts = new Map();
      rows.forEach((r) => {
        const v = r[f.key] === '' || r[f.key] === undefined ? '(vacío)' : String(r[f.key]);
        counts.set(v, (counts.get(v) || 0) + 1);
      });
      const items = Array.from(counts.entries()).map(([k, v]) => ({ label: k, value: v }))
        .sort((a, b) => b.value - a.value);
      const top = items[0];
      const pct = (top.value / rows.length) * 100;
      F(`${table.name} · ${f.key}: mayoritario «${top.label}»`, top.value, 'de ' + rows.length,
        `filas con ${f.key} = "${top.label}" ÷ total = ${top.value}/${rows.length} = ${fmtPct(pct)}`);
      charts.push({
        kind: items.length <= 6 ? 'donut' : 'bar',
        title: `${table.name} por ${f.key}`,
        items: items.slice(0, 12),
        total: rows.length,
        note: items.length > 12 ? `mostrando 12 de ${items.length} valores` : '',
      });

      // Insight: concentración (regla de Pareto sobre la categoría)
      let acc = 0, k = 0;
      for (const it of items) { acc += it.value; k++; if (acc / rows.length >= 0.8) break; }
      if (items.length >= 4 && k <= Math.ceil(items.length * 0.35)) {
        insights.push({
          kind: 'concentracion',
          text: `El ${fmtPct((acc / rows.length) * 100, 0)} de ${table.name.toLowerCase()} se concentra en ${k} de ${items.length} valores de «${f.key}» (${items.slice(0, k).map((i) => i.label).join(', ')}).`,
          weight: 3,
        });
      }
    }

    // ── Series temporales ──
    const dates = fields.filter((f) => f.type === 'fecha');
    for (const f of dates.slice(0, 2)) {
      const eps = rows.map((r) => toEpoch(r[f.key], f.unit)).filter((v) => v && v > 0);
      if (eps.length < 3) continue;
      eps.sort((a, b) => a - b);
      const byDay = new Map();
      eps.forEach((e) => { const k = dayKey(e); byDay.set(k, (byDay.get(k) || 0) + 1); });
      const series = Array.from(byDay.entries()).map(([k, v]) => ({ label: k, value: v }))
        .sort((a, b) => a.label.localeCompare(b.label));
      charts.push({ kind: 'line', title: `Actividad por día · ${table.name} (${f.key})`, items: series.slice(-60) });

      F(`${table.name}: primer registro`, fmtDate(eps[0]), '', `mínimo de ${f.key}`);
      F(`${table.name}: último registro`, fmtDate(eps[eps.length - 1]), '', `máximo de ${f.key}`);

      // ¿Es un conjunto VIVO o un histórico cerrado? Sólo tiene sentido hablar de
      // "esta semana" o de "estancamiento" si los datos llegan hasta hoy. Un export
      // de campañas de junio no está "estancado": simplemente ya terminó.
      const t = nowSec();
      const ultimo = eps[eps.length - 1];
      const esVivo = ultimo > t - 14 * DAY;
      const span = Math.max(1, Math.round((ultimo - eps[0]) / DAY));
      F(`${table.name}: periodo cubierto`, span, 'días', `de ${fmtDate(eps[0])} a ${fmtDate(ultimo)}`);

      if (esVivo) {
        // Tendencia 7d vs 7d anteriores — con los dos conteos a la vista
        const last7 = eps.filter((e) => e > t - 7 * DAY).length;
        const prev7 = eps.filter((e) => e <= t - 7 * DAY && e > t - 14 * DAY).length;
        F(`${table.name}: registros en los últimos 7 días`, last7, 'filas', `filas con ${f.key} posterior a ${fmtDate(t - 7 * DAY)}`);
        // Una variación porcentual sobre 1 ó 2 registros no es una tendencia, es ruido.
        // Sólo la afirmamos con muestra suficiente; si no, el dato queda en la ficha y ya.
        if (prev7 > 0) {
          const delta = ((last7 - prev7) / prev7) * 100;
          F(`${table.name}: variación semanal`, fmtPct(delta, 0), '', `(${last7} − ${prev7}) ÷ ${prev7} · últimos 7 días vs. los 7 anteriores`);
          if (last7 + prev7 >= 8) {
            insights.push({
              kind: delta >= 0 ? 'subida' : 'bajada',
              text: `La actividad de ${table.label} ${delta >= 0 ? 'sube' : 'baja'} un ${fmtPct(Math.abs(delta), 0)} respecto a la semana anterior (${last7} frente a ${prev7} registros).`,
              weight: Math.abs(delta) > 30 ? 4 : 2,
            });
          }
        }
        // Antigüedad: qué lleva parado dentro de un conjunto que por lo demás sigue vivo
        const stale = eps.filter((e) => e < t - 14 * DAY).length;
        if (stale > 0 && rows.length >= 10) {
          insights.push({
            kind: 'estancamiento',
            text: `${stale} de ${rows.length} registros de ${table.label} no se tocan desde hace más de 14 días (${fmtPct((stale / rows.length) * 100, 0)} del total).`,
            weight: stale / rows.length > 0.4 ? 4 : 2,
          });
        }
      } else {
        insights.push({
          kind: 'historico',
          text: `${table.label} es un conjunto cerrado: cubre ${span} días, del ${fmtDate(eps[0])} al ${fmtDate(ultimo)}, y no contiene nada de las últimas dos semanas. Las cifras describen ese periodo, no la situación de hoy.`,
          weight: 3,
        });
      }
    }

    // ── Numéricos ──
    const nums = fields.filter((f) => f.type === 'numero' && f.key !== 'id');
    for (const f of nums.slice(0, 6)) {
      const vals = rows.map((r) => toNum(r[f.key])).filter((v) => v !== null);
      if (vals.length < 2) continue;
      const sorted = vals.slice().sort((a, b) => a - b);
      const sum = vals.reduce((a, b) => a + b, 0);
      const avg = sum / vals.length;
      F(`${f.key} · total`, Math.round(sum * 100) / 100, '', `suma de ${vals.length} valores de ${f.key}`);
      F(`${f.key} · media`, Math.round(avg * 100) / 100, '', `${fmtNum(sum, 2)} ÷ ${vals.length} valores`);
      F(`${f.key} · mediana`, median(sorted), '', `valor central de ${vals.length} valores ordenados`);
      F(`${f.key} · máximo`, sorted[sorted.length - 1], '', `mayor de los ${vals.length} valores de ${f.key}`);
      const p90 = percentile(sorted, 90);
      if (p90 !== null && avg > 0 && p90 > avg * 3) {
        insights.push({
          kind: 'dispersion',
          text: `«${f.key}» está muy desequilibrado: el percentil 90 (${fmtNum(p90)}) triplica la media (${fmtNum(avg)}). Hay pocos casos que arrastran el conjunto.`,
          weight: 3,
        });
      }
      // Numérico por categoría principal
      const cat = cats[0];
      if (cat) {
        const agg = new Map();
        rows.forEach((r) => {
          const k = String(r[cat.key] || '(vacío)');
          const v = toNum(r[f.key]);
          if (v === null) return;
          const cur = agg.get(k) || { sum: 0, n: 0 };
          cur.sum += v; cur.n++; agg.set(k, cur);
        });
        const items = Array.from(agg.entries()).map(([k, a]) => ({ label: k, value: Math.round((a.sum / a.n) * 100) / 100 }))
          .sort((a, b) => b.value - a.value).slice(0, 10);
        // Una barra plana a cero no informa de nada: el dato ya está en la ficha de métricas.
        const varia = items.length > 1 && items[0].value !== items[items.length - 1].value && items[0].value !== 0;
        if (varia) charts.push({ kind: 'bar', title: `${f.key} medio por ${cat.key}`, items });
      }
    }

    // ── Campos de texto: sólo se listan, nunca se resumen a ojo ──
    const texts = fields.filter((f) => f.type === 'texto');

    return { table, fields, facts, charts, insights, textFields: texts.map((t) => t.key) };
  }

  /* ── Enriquecimientos de dominio para las tablas vivas ────────────
     Cosas que sólo tienen sentido sabiendo QUÉ es cada tabla.       */

  function enrich(analysis) {
    const { table } = analysis;
    const rows = table.rows;
    const add = (label, value, unit, formula) => analysis.facts.push({
      id: table.name.toLowerCase() + '-x' + analysis.facts.length,
      label, value, unit: unit || '', formula, source: table.source.label, n: rows.length,
    });

    if (table.name === 'Tareas' && rows.length) {
      const done = rows.filter((r) => r.estado === 'done').length;
      const doing = rows.filter((r) => r.estado === 'doing').length;
      const blocked = rows.filter((r) => r.estado === 'blocked' || r.bloqueado_por).length;
      const unassigned = rows.filter((r) => r.asignado === '(sin asignar)').length;
      add('Tareas cerradas', done, 'de ' + rows.length, `filas con estado = "done" ÷ total = ${done}/${rows.length}`);
      add('Tasa de cierre', fmtPct((done / rows.length) * 100), '', `${done} cerradas ÷ ${rows.length} totales`);
      add('En curso ahora', doing, 'tareas', 'filas con estado = "doing"');
      if (blocked) add('Bloqueadas o con dependencia', blocked, 'tareas', 'estado = "blocked" o campo bloqueado_por no vacío');
      if (unassigned) {
        analysis.insights.push({
          kind: 'riesgo',
          text: `Hay ${unassigned} tareas sin asignar (${fmtPct((unassigned / rows.length) * 100, 0)} del tablero). Sin dueño no hay avance medible.`,
          weight: unassigned / rows.length > 0.2 ? 4 : 2,
        });
      }
      if (doing > 0) {
        const perPerson = new Map();
        rows.filter((r) => r.estado === 'doing').forEach((r) => perPerson.set(r.asignado, (perPerson.get(r.asignado) || 0) + 1));
        const worst = Array.from(perPerson.entries()).sort((a, b) => b[1] - a[1])[0];
        if (worst && worst[1] >= 3) {
          analysis.insights.push({
            kind: 'riesgo',
            text: `${worst[0]} tiene ${worst[1]} tareas simultáneas en «doing». El trabajo en paralelo por encima de 2-3 frentes suele ser una cola disfrazada, no progreso.`,
            weight: 3,
          });
        }
      }
    }

    if (table.name === 'Flota' && rows.length) {
      const online = rows.filter((r) => r.online === 'sí').length;
      const auton = rows.filter((r) => r.modo === 'autonomo').length;
      add('Agentes con latido reciente', online, 'de ' + rows.length, 'último latido hace menos de 180 s');
      add('Agentes en modo autónomo', auton, 'de ' + rows.length, 'campo modo = "autonomo"');
      const maquinas = new Set(rows.map((r) => r.maquina).filter(Boolean)).size;
      add('Máquinas distintas', maquinas, 'equipos', 'valores únicos del campo maquina');
      if (online === 0) {
        analysis.insights.push({ kind: 'riesgo', text: 'Ningún agente ha latido en los últimos 180 segundos: la flota está parada o los latidos no llegan.', weight: 5 });
      } else if (online < rows.length / 2) {
        analysis.insights.push({
          kind: 'riesgo',
          text: `Sólo ${online} de ${rows.length} agentes tienen latido reciente. Más de la mitad de la flota está fuera de juego.`,
          weight: 4,
        });
      }
    }

    if (table.name === 'Dudas' && rows.length) {
      const abiertas = rows.filter((r) => r.estado === 'abierta').length;
      add('Dudas abiertas', abiertas, 'de ' + rows.length, 'filas con estado = "abierta"');
      const resueltas = rows.filter((r) => r.resuelta && r.creada);
      if (resueltas.length) {
        const avgH = resueltas.reduce((a, r) => a + (r.resuelta - r.creada), 0) / resueltas.length / 3600;
        add('Tiempo medio de respuesta', Math.round(avgH * 10) / 10, 'horas', `media de (resuelta − creada) sobre ${resueltas.length} dudas resueltas`);
      }
      if (abiertas > 0) {
        analysis.insights.push({ kind: 'riesgo', text: `${abiertas} dudas siguen abiertas: hay agentes esperando una decisión humana.`, weight: 4 });
      }
    }

    if (table.name === 'Diario' && rows.length) {
      const personas = new Set(rows.map((r) => r.persona)).size;
      add('Agentes que han escrito', personas, 'personas', 'valores únicos del campo persona');
      const t = nowSec();
      const hoy = rows.filter((r) => r.fecha > t - DAY).length;
      add('Entradas en las últimas 24 h', hoy, 'entradas', `filas con fecha posterior a ${fmtDate(t - DAY)}`);
    }

    return analysis;
  }

  /* ─────────────────────────────────────────────────────────────────
     5. NARRATIVA · el LLM redacta, nosotros verificamos
     ───────────────────────────────────────────────────────────────── */

  const COUNCIL = 'https://macmini.tail48b61c.ts.net/council';
  const COUNCIL_TOKEN = 'admira2026';

  function factsPayload(analyses) {
    return analyses.flatMap((a) => a.facts.map((f) => ({
      hecho: f.label,
      valor: typeof f.value === 'number' ? fmtNum(f.value) : String(f.value),
      unidad: f.unit,
      calculo: f.formula,
      fuente: f.source,
    })));
  }

  async function narrate(cfg, analyses, log) {
    const facts = factsPayload(analyses);
    const insights = analyses.flatMap((a) => a.insights).sort((a, b) => b.weight - a.weight).slice(0, 12);

    const body = {
      titulo: cfg.title,
      audiencia: cfg.audience,
      idioma: cfg.lang,
      contexto: cfg.prompt || '',
      hechos: facts.slice(0, 120),
      hallazgos: insights.map((i) => i.text),
      tablas: analyses.map((a) => ({ nombre: a.table.name, filas: a.table.rows.length, campos: a.fields.map((f) => f.key + ':' + f.type) })),
      documentos: (cfg.docs || []).map((d) => ({ nombre: d.name, extracto: (d.text || '').slice(0, 4000) })),
    };

    log('· pidiendo la redacción al Consejo…');
    const res = await fetch(COUNCIL + '/api/council/informe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Council-Token': COUNCIL_TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ── VERIFICACIÓN DE CIFRAS ──────────────────────────────────────
     Extraemos toda cifra del texto redactado y comprobamos que exista
     en la base de hechos. Lo que no cuadra se marca en el informe.  */

  function normalizeNum(s) {
    let t = String(s).trim().replace(/%$/, '');
    // 1.234,56 (es) → 1234.56 ; 1,234.56 (en) → 1234.56
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else t = t.replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function buildAllowedNumbers(analyses) {
    const set = new Set();
    const push = (n) => {
      if (n === null || n === undefined || !Number.isFinite(n)) return;
      set.add(Math.round(n * 100) / 100);
      set.add(Math.round(n));          // redondeo al entero
      set.add(Math.round(n * 10) / 10); // un decimal
    };
    const scan = (txt) => (String(txt).match(/\d+[\d.,]*/g) || []).forEach((m) => push(normalizeNum(m)));
    for (const a of analyses) {
      push(a.table.rows.length);
      for (const f of a.facts) {
        const n = typeof f.value === 'number' ? f.value : normalizeNum(f.value);
        push(n);
        scan(f.formula);   // la fórmula lleva los operandos: también son legítimos
      }
      for (const c of a.charts) (c.items || []).forEach((it) => push(it.value));
      // Los hallazgos los calculamos NOSOTROS: sus cifras («más de 14 días», «49 % del
      // total») son tan válidas como las de una métrica. Sin esto el verificador daba
      // falsos positivos en cuanto el redactor citaba bien un hallazgo.
      for (const i of a.insights) scan(i.text);
    }
    return set;
  }

  function verifyNarrative(text, allowed) {
    // Ignora años y cifras dentro de fechas: no son afirmaciones cuantitativas.
    const found = String(text).match(/\d+(?:[.,]\d+)*\s*%?/g) || [];
    const bad = [];
    for (const raw of found) {
      const n = normalizeNum(raw);
      if (n === null) continue;
      if (n >= 1900 && n <= 2100 && Number.isInteger(n)) continue; // años
      if (n <= 12 && Number.isInteger(n)) continue;                // números pequeños de redacción ("las 3 capas")
      const ok = allowed.has(Math.round(n * 100) / 100) || allowed.has(Math.round(n)) || allowed.has(Math.round(n * 10) / 10);
      if (!ok) bad.push(raw.trim());
    }
    return Array.from(new Set(bad));
  }

  /* ─────────────────────────────────────────────────────────────────
     PIPELINE COMPLETO
     ───────────────────────────────────────────────────────────────── */

  async function build(cfg, onStep) {
    const log = (m) => onStep && onStep(m);
    const warnings = [];
    const tables = [];

    // 1 · Ingesta
    if (cfg.live && cfg.live.length) {
      log('Ingesta · datos vivos de admira.live');
      const live = await ingestLive(cfg.live, log, (w) => warnings.push(w));
      tables.push(...live);
    }
    const docs = [];
    for (const f of (cfg.files || [])) {
      log('Ingesta · ' + f.name);
      const t = tableFromText(f.name, f.text);
      if (t.rows.length) tables.push(t);
      else { docs.push(t); warnings.push('«' + f.name + '» no es tabular: se usa como documento de contexto, sin métricas.'); }
    }
    cfg.docs = docs;

    if (!tables.length && !docs.length && !cfg.prompt) {
      throw new Error('No hay ninguna fuente con datos. Elige datos vivos, sube un fichero o escribe un contexto.');
    }

    // 2-4 · Perfilado, cálculo, insights
    log('Cálculo · midiendo ' + tables.length + ' conjunto(s) de datos');
    const analyses = tables.map((t) => enrich(analyzeTable(t)));

    // Si una fuente viene topada, el lector tiene que saberlo: el informe describe
    // una muestra, no el universo. Callarlo sería el error clásico del informe bonito.
    for (const t of tables) {
      if (t.source && t.source.truncated) {
        warnings.push(`«${t.name}» está limitada por el origen (${t.source.truncNote || 'tope de filas del endpoint'}): se han analizado ${t.rows.length} registros, que pueden no ser todos.`);
      }
    }

    const totalRows = tables.reduce((a, t) => a + t.rows.length, 0);
    const totalFacts = analyses.reduce((a, x) => a + x.facts.length, 0);
    log('  ' + totalRows + ' filas · ' + totalFacts + ' métricas calculadas');

    // 5 · Narrativa (opcional y degradable)
    let narrative = null, unverified = [], llmError = null;
    if (cfg.narrative !== false) {
      try {
        narrative = await narrate(cfg, analyses, log);
        const allowed = buildAllowedNumbers(analyses);
        const allText = [narrative.resumen_ejecutivo, ...(narrative.secciones || []).map((s) => s.texto), narrative.conclusion]
          .filter(Boolean).join('\n');
        unverified = verifyNarrative(allText, allowed);
        log(unverified.length
          ? '  ⚠ ' + unverified.length + ' cifra(s) de la narrativa no cuadran con los datos — se marcarán en el informe'
          : '  ✓ todas las cifras de la narrativa cuadran con los datos calculados');
      } catch (e) {
        llmError = e.message;
        warnings.push('La redacción automática no estuvo disponible (' + e.message + '). El informe se entrega con el análisis calculado, sin narrativa.');
        log('  ⚠ sin narrativa: ' + e.message);
      }
    }

    return {
      cfg,
      generatedAt: nowSec(),
      tables, analyses, docs,
      narrative, unverified, llmError, warnings,
      totals: { rows: totalRows, facts: totalFacts, tables: tables.length },
    };
  }

  global.InformeEngine = {
    build, analyzeTable, enrich, tableFromText, inferFields,
    LIVE_SOURCES, verifyNarrative, buildAllowedNumbers,
    fmtNum, fmtPct, fmtDate, esc, nowSec,
  };
})(window);
