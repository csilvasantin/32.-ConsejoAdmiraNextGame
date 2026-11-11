/* Globo de estado sobre cada consejero y flecha de color sobre la cabeza.
 * Sin brillo ni halo en los papeles (t1219u): basta la flecha.
 * Datos: GET /api/consejo/estado (latido de consejero_latido + últimos done públicos).
 * Flecha, caja de hoy y globo leen un único mapa / instantánea por pintado.
 * Encima de la flecha, una caja centrada en su eje (cifra de hoy + proyecto
 * principal). El puesto va dentro del triángulo (la punta), grande, no en el
 * tallo ni en la caja. La flecha no pisa la caja.
 * Flag `activo` (y `nuncaFlecha` en Carlos Silva / Y-3, centro): fácil de reactivar.
 * Disney está en la silla que era de Schultz y sí lleva flecha (tiene bot).
 * Hover / foco teclado en escritorio; toque en móvil (se cierra tocando fuera).
 * Carlos Silva (Y-3): sin flecha. El globo muestra sus proyectos activos de uno
 * en uno, con objetivos a/b/c leídos en vivo de GET /api/consejo/objetivos-abc.
 * prefers-reduced-motion: halo y flecha sin animación. */
(function (root) {
  'use strict';

  const ENDPOINT = (root && root.ADMIRA_GLOBO_URL) || '/api/consejo/estado';
  const OBJETIVOS_URL = (root && root.ADMIRA_OBJETIVOS_ABC_URL) || '/api/consejo/objetivos-abc';
  const REUSE_MS = 20000;
  const COLORES = { trabajando: '#e23d3d', libre: '#3ddc84', desconocido: '#ffd60a' };
  const PAPEL = {
    leyendas: {
      'Steve Jobs': { activo: true, sobre: 'papel', puntos: [[18.162, 75.391], [21.397, 76.432], [25.588, 76.302], [27.5, 72.396], [29.559, 72.005], [30.147, 69.141], [25.662, 68.49], [25.588, 67.708], [24.338, 67.708], [23.971, 68.49], [21.324, 72.005], [20.074, 71.615]], flecha: { x: 10.368, y: 39.583 }, x: 24.154, y: 72.07, w: 11.985, h: 8.724 },
      'Steve Wozniak': { activo: true, sobre: 'papel', puntos: [[26.912, 61.458], [28.309, 62.5], [31.25, 62.5], [32.941, 60.156], [33.824, 59.115], [32.868, 58.594], [31.176, 58.724], [29.412, 58.464], [28.309, 58.333]], flecha: { x: 21.471, y: 31.51 }, x: 30.368, y: 60.416, w: 6.912, h: 4.167 },
      'Tim Cook': { activo: false, sobre: 'ninguno', puntos: [], flecha: null, x: 0, y: 0, w: 0, h: 0 },
      'Warren Buffett': { activo: false, sobre: 'papel', puntos: [[30, 51.823], [30.294, 52.734], [31.618, 52.344], [33.676, 52.344], [35.147, 53.125], [39.118, 54.427], [40.441, 53.125], [41.176, 51.823], [40.882, 50.651], [40.294, 50.391], [38.088, 50.391], [36.765, 51.042], [33.824, 50], [31.471, 50.521]], flecha: { x: 33.088, y: 24.479 }, x: 35.588, y: 52.213, w: 11.176, h: 4.427 },
      'Carlos Silva': { activo: true, nuncaFlecha: true, sobre: 'ninguno', puntos: [], flecha: { x: 50, y: 23.958 }, x: 0, y: 0, w: 0, h: 0 },
      'Walt Disney': { activo: true, sobre: 'papel', puntos: [[73.382, 63.932], [73.382, 64.714], [75.882, 64.714], [75.882, 65.234], [78.529, 65.234], [78.529, 64.062], [78.088, 63.021], [77.059, 62.24], [73.676, 63.411]], flecha: { x: 80, y: 32.292 }, x: 75.956, y: 63.737, w: 5.147, h: 2.994 },
      'Dieter Rams': { activo: false, sobre: 'papel', puntos: [[66.618, 59.375], [66.912, 58.854], [68.971, 58.594], [69.706, 58.464], [71.176, 58.203], [72.5, 58.203], [72.721, 61.849], [68.382, 62.37], [68.088, 61.458], [66.765, 60.547]], flecha: { x: 70.074, y: 23.958 }, x: 69.669, y: 60.287, w: 6.103, h: 4.167 },
      'Howard Schultz': { activo: false, sobre: 'ninguno', puntos: [], flecha: null, x: 0, y: 0, w: 0, h: 0 },
      'George Lucas': { activo: true, sobre: 'papel', puntos: [[72.279, 70.443], [75.588, 69.922], [77.059, 69.661], [78.235, 69.661], [79.265, 71.094], [81.25, 71.224], [82.5, 72.526], [79.118, 73.698], [73.529, 73.568], [72.279, 72.656]], flecha: { x: 90.735, y: 39.583 }, x: 77.389, y: 71.679, w: 10.221, h: 4.037 }
    },
    coetaneos: {
      'Elon Musk': { activo: true, sobre: 'placa', puntos: [[16.25, 85.833], [27.734, 85.833], [28.047, 86.25], [28.203, 87.222], [28.203, 91.111], [27.891, 92.361], [16.406, 92.361], [16.094, 91.806], [16.094, 86.389]], flecha: { x: 13.125, y: 42.778 }, x: 22.148, y: 89.097, w: 12.109, h: 6.528 },
      'Jensen Huang': { activo: true, sobre: 'placa', puntos: [[29.844, 68.611], [39.453, 68.472], [39.688, 68.889], [39.766, 70.139], [39.766, 73.056], [39.453, 73.889], [29.844, 73.889], [29.609, 73.333], [29.609, 69.167]], flecha: { x: 24.375, y: 41.389 }, x: 34.688, y: 71.18, w: 10.157, h: 5.417 },
      'Mira Murati': { activo: true, sobre: 'placa', puntos: [[41.25, 67.5], [50.2, 67.5], [50.547, 67.9], [50.547, 74.3], [50.2, 74.722], [41.25, 74.722], [41.0, 74.3], [41.0, 67.9]], flecha: { x: 38.5, y: 36.667 }, x: 45.898, y: 71.111, w: 9.297, h: 7.222 },
      'Jony Ive': { activo: true, sobre: 'placa', puntos: [[58.281, 62.778], [65.703, 62.639], [65.938, 63.056], [66.016, 64.167], [66.016, 66.389], [65.781, 67.083], [58.359, 67.083], [58.125, 66.667], [58.125, 63.194]], flecha: { x: 68.594, y: 39.444 }, x: 62.071, y: 64.861, w: 7.891, h: 4.444 },
      'John Lasseter': { activo: true, sobre: 'placa', puntos: [[66.953, 74.861], [77.188, 74.861], [77.5, 75.278], [77.578, 76.389], [77.578, 80.139], [77.266, 80.972], [67.031, 80.972], [66.797, 80.417], [66.797, 75.417]], flecha: { x: 76.563, y: 42.222 }, x: 72.188, y: 77.916, w: 10.781, h: 6.111 },
      'Ryan Reynolds': { activo: true, sobre: 'placa', puntos: [[73.359, 85.972], [84.844, 85.972], [85.078, 86.389], [85.078, 91.806], [84.844, 92.5], [73.359, 92.5], [73.047, 91.944], [72.812, 90.972], [72.812, 88.056], [73.047, 86.389]], flecha: { x: 88.75, y: 41.389 }, x: 78.945, y: 89.236, w: 12.266, h: 6.528 }
    }
  };
  const CSS = `
#papel-halos{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:visible}
#papel-halos svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;display:block}
#papel-halos .consejero-marker{position:absolute;z-index:4;display:flex;flex-direction:column;align-items:center;gap:10px;transform:translate(-50%,-100%);pointer-events:none;color:inherit}
#papel-halos .consejero-flecha{width:clamp(40px,9.2%,72px);aspect-ratio:80/88;line-height:normal;position:relative;flex:0 0 auto}
#papel-halos .consejero-flecha svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 1px rgba(0,0,0,.9)) drop-shadow(0 0 3px currentColor)}
#papel-halos .consejero-flecha .puesto{position:absolute;left:0;right:0;top:44%;height:50%;display:flex;align-items:center;justify-content:center;margin:0;padding:0;font:800 20px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#140e06;-webkit-text-stroke:0.4px rgba(243,230,196,.45);text-shadow:none;pointer-events:none;z-index:2}
#papel-halos .consejero-ranking{margin:0;padding:3px 8px 4px;background:rgba(20,14,6,.92);border:1px solid currentColor;border-radius:2px;color:inherit;font:700 12px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;text-align:center;display:flex;flex-direction:column;align-items:center;white-space:nowrap;text-shadow:0 1px 0 #140e06,-1px -1px 0 #140e06,1px -1px 0 #140e06,-1px 1px 0 #140e06,1px 1px 0 #140e06;pointer-events:auto;cursor:pointer}
#papel-halos .consejero-ranking .ranking-n{font-weight:800;font-size:13px;line-height:1.1}
#papel-halos .consejero-ranking .ranking-proy{font-weight:700;font-size:9px;line-height:1.2;letter-spacing:.01em;max-width:11em;overflow:hidden;text-overflow:ellipsis}
#papel-halos .consejero-ranking:focus-visible{outline:2px dashed #ffd75e;outline-offset:2px}
@keyframes flecha-rebote{0%,100%{transform:translateY(0)}50%{transform:translateY(12%)}}
.consejero-flecha{animation:flecha-rebote 1.2s ease-in-out infinite;transform-origin:center bottom}
@media (max-width:500px){
  #papel-halos .consejero-marker{gap:8px}
  #papel-halos .consejero-flecha{width:clamp(34px,10%,56px)}
  #papel-halos .consejero-flecha .puesto{font-size:16px}
  #papel-halos .consejero-ranking{padding:2px 6px 3px}
  #papel-halos .consejero-ranking .ranking-n{font-size:12px}
  #papel-halos .consejero-ranking .ranking-proy{font-size:8px}
}
@media (prefers-reduced-motion:reduce){.consejero-flecha{animation:none!important}}

.consejo-globo{position:absolute;z-index:20;max-width:220px;min-width:120px;padding:7px 10px 8px;background:#140e06;color:#f3e6c4;border:2px solid #c9a227;box-shadow:3px 3px 0 #000;font:11px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:none;transform:translate(-50%,-100%)}
.consejo-globo.globo-proyectos{max-width:280px;min-width:210px;padding:8px 10px 10px;pointer-events:auto;z-index:24;text-align:center}
.consejo-globo b{display:block;margin:0 0 3px;font:bold 9px/1.2 "Press Start 2P",monospace;color:#ffd75e;letter-spacing:.3px}
.consejo-globo.globo-proyectos b{text-align:center;letter-spacing:0;white-space:nowrap;width:100%}
.consejo-globo.globo-proyectos ol.gp-abc,.consejo-globo.globo-proyectos .gp-vacio{text-align:left}
.consejo-globo p{margin:0;word-break:break-word}
.consejo-globo .gp-nav{display:flex;align-items:center;gap:6px;margin:2px 0 7px}
.consejo-globo .gp-nav button{appearance:none;flex:0 0 auto;width:28px;height:28px;padding:0;background:#1a140a;color:#ffd75e;border:1px solid #c9a227;font:16px/1 sans-serif;cursor:pointer}
.consejo-globo .gp-nav button:focus-visible{outline:2px dashed #ffd75e;outline-offset:1px}
.consejo-globo .gp-nav .gp-nombre{flex:1;text-align:center;font:700 12px/1.25 system-ui,-apple-system,sans-serif;color:#fff3d0}
.consejo-globo .gp-nav .gp-pos{display:block;margin-top:2px;font:700 9px/1.2 system-ui,sans-serif;color:#c9a227}
.consejo-globo ol.gp-abc{margin:0;padding:0;list-style:none}
.consejo-globo ol.gp-abc li{margin:0 0 5px;padding:0;display:grid;grid-template-columns:1.3em 1fr;gap:4px;align-items:start}
.consejo-globo ol.gp-abc .letra{color:#ffd75e;font:bold 10px/1.35 "Press Start 2P",monospace}
.consejo-globo ol.gp-abc .txt{color:#f3e6c4;word-break:break-word}
.consejo-globo ol.gp-abc .txt.vacio{color:#9a8b6a;font-style:italic}
.consejo-globo.globo-proyectos .gp-firma{display:block;margin-top:2px;font:600 9px/1.2 system-ui,-apple-system,sans-serif;color:#9a8b6a;letter-spacing:.02em}
.consejo-globo .gp-vacio{margin:0;color:#9a8b6a}
.consejo-globo .consejero-ranking-globo{display:block;margin-top:4px;font:700 10px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;color:inherit;opacity:.95}
.consejo-globo .consejero-desglose-globo{display:block;margin-top:3px;font:600 9px/1.25 system-ui,-apple-system,sans-serif;color:#f3e6c4;opacity:.92}
.consejo-globo[data-estado=trabajando]{border-color:${COLORES.trabajando}}
.consejo-globo[data-estado=libre]{border-color:${COLORES.libre}}
.consejo-globo[data-estado=desconocido]{border-color:${COLORES.desconocido}}
.consejo-globo::after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-7px;border:7px solid transparent;border-top-color:#c9a227}
.consejo-globo::before{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:#140e06;z-index:1}
#body-hotspots .body-hotspot:focus-visible{outline:2px dashed #ffd75e;outline-offset:3px;stroke:#ffd75e}

.mac-hoy-lista{position:absolute;inset:6% 8% 8%;z-index:8;display:flex;flex-direction:column;background:#0b0b08;color:#7cff6b;border:2px solid #3a3a2a;font:10px/1.35 "VT323","Press Start 2P",ui-monospace,Menlo,monospace;overflow:hidden;box-shadow:inset 0 0 12px rgba(0,0,0,.6)}
.mac-hoy-lista header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;background:#111;border-bottom:1px solid #3a3a2a;color:#c8ffb0;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.mac-hoy-lista header b{font:inherit}
.mac-hoy-lista .desglose{padding:2px 6px 4px;color:#9fd88a;border-bottom:1px solid #3a3a2a}
.mac-hoy-lista .fuente{color:#7aa36c;margin-left:4px;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
.mac-hoy-lista button.cerrar{appearance:none;background:#1a1a12;color:#7cff6b;border:1px solid #7cff6b;padding:2px 6px;font:inherit;cursor:pointer}
.mac-hoy-lista ol{margin:0;padding:4px 6px 6px 22px;overflow:auto;flex:1;list-style:decimal}
.mac-hoy-lista li{margin:0 0 4px}
.mac-hoy-lista a{color:#b8ff9a;text-decoration:underline}
.mac-hoy-lista .hora{color:#9fd88a;margin-right:4px}
.mac-hoy-lista .vacio{padding:10px 8px;opacity:.85}
.mac-hoy-prop.has-lista .mac-hoy-glass > :not(.mac-hoy-lista){visibility:hidden}
/* La lista frontal vive en #mac-hoy-lista-crt, el mismo plano 512×342
   proyectado y recortado al cristal. No se toca left/top/transform/clip-path. */
.mac-hoy-lista-crt{display:none;overflow:hidden;pointer-events:auto;background:#030806;z-index:8}
.mac-hoy-front.on.has-lista{position:fixed;inset:0;z-index:40}
.mac-hoy-front.on.has-lista .mac-hoy-lista-crt{display:block}
.mac-hoy-front.on.has-lista #mac-hoy-pantalla,
.mac-hoy-front.on.has-lista .mac-hoy-logo-front,
.mac-hoy-front.on.has-lista .mac-hoy-front-shade{visibility:hidden}
.mac-hoy-front.on.has-lista .mac-hoy-front-stage .mac-hoy-crt-front{visibility:hidden}
#mac-hoy-lista-crt .mac-hoy-lista{position:absolute;inset:22px 28px 20px 30px;z-index:1;display:flex;flex-direction:column;overflow:hidden;background:transparent;border:0;box-shadow:none;color:#7cff6b;font:26px/1.35 VT323,"Press Start 2P",ui-monospace,Menlo,monospace;text-shadow:0 0 6px rgba(126,255,166,.9),0 0 16px rgba(70,240,132,.45)}
#mac-hoy-lista-crt .mac-hoy-lista header{flex:0 0 auto;align-items:flex-start;font:24px/1.35 VT323,"Press Start 2P",ui-monospace,Menlo,monospace;background:transparent;border-bottom:1px solid #3a5a3a;color:#c8ffd0;padding:2px 4px 8px}
#mac-hoy-lista-crt .mac-hoy-lista header b{flex:1;min-width:0}
#mac-hoy-lista-crt .mac-hoy-lista .desglose{flex:0 0 auto;font-size:22px;padding:4px 4px 6px;border-bottom:1px solid #3a5a3a}
#mac-hoy-lista-crt .mac-hoy-lista ol{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;font-size:24px;padding:6px 8px 10px 36px;scrollbar-color:#7cff6b #111}
#mac-hoy-lista-crt .mac-hoy-lista li{margin:0 0 6px}
#mac-hoy-lista-crt .mac-hoy-lista .fuente{font-size:18px}
#mac-hoy-lista-crt .mac-hoy-lista button.cerrar{flex:0 0 auto;font-size:20px;padding:2px 8px}
@media (max-width:640px){
  .mac-hoy-front.on.has-lista .mac-hoy-front-stage{width:min(94vw,520px)}
}
`;

  let datos = null, datosAt = 0, enVuelo = null, globo = null, abierto = null, hideT = null, wired = false;
  let objetivosAbc = null, objetivosAt = 0, carlosIdx = 0, carlosFijado = false, sobreGlobo = false;

  function doc() { return root.document; }
  function escena() { return doc() && doc().querySelector('.council-image'); }
  function genActual() {
    const el = escena();
    return (el && el.getAttribute('data-generation')) || 'leyendas';
  }
  function estilos() {
    const d = doc(); if (!d || d.getElementById('consejo-globo-css')) return;
    const st = d.createElement('style'); st.id = 'consejo-globo-css'; st.textContent = CSS; d.head.appendChild(st);
  }
  function key(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function sillaDe(persona) {
    if (!datos || !datos.mesa || !persona) return null;
    const k = key(persona);
    for (const gen of Object.keys(datos.mesa)) {
      const s = (datos.mesa[gen] || []).find((x) => key(x.persona) === k);
      if (s) return s;
    }
    return null;
  }
  function esCarlos(persona) { return key(persona) === 'carlossilva'; }
  function textoAbc(v) {
    const crudo = (v && typeof v === 'object') ? (v.texto ?? v.valor ?? '') : v;
    const t = String(crudo == null ? '' : crudo).replace(/\s+/g, ' ').trim();
    return t || '— sin definir —';
  }
  function horaFirma(ts) {
    if (!ts) return '';
    try {
      const d = new Date(Number(ts));
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function firmaAbc(proy, letra) {
    const f = proy && proy.firmas && proy.firmas[letra];
    const obj = proy && proy.objetivos && proy.objetivos[letra];
    const autor = (f && f.autor) || (obj && typeof obj === 'object' && (obj.autor || obj.quien)) || '';
    const ts = (f && f.actualizado) || (obj && typeof obj === 'object' && (obj.actualizado || obj.ts)) || 0;
    if (!autor && !ts) return '';
    const hora = horaFirma(ts);
    if (autor && hora) return autor + ' · ' + hora;
    return autor || hora;
  }
  function proyectosCarlos() {
    const lista = objetivosAbc && Array.isArray(objetivosAbc.proyectos) ? objetivosAbc.proyectos : [];
    return lista.filter((p) => p && p.nombre && p.activo !== false);
  }
  function cargarObjetivos(force) {
    if (!force && objetivosAbc && (Date.now() - objetivosAt) < REUSE_MS) return Promise.resolve(objetivosAbc);
    return fetch(OBJETIVOS_URL, { cache: 'no-store', headers: { accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { objetivosAbc = d && typeof d === 'object' ? d : { ok: false, proyectos: [] }; objetivosAt = Date.now(); return objetivosAbc; })
      .catch(() => {
        if (objetivosAbc) return objetivosAbc;
        objetivosAbc = { ok: false, proyectos: [], error: true };
        objetivosAt = Date.now();
        return objetivosAbc;
      });
  }

  /* Un solo mapa por pintado: flecha y papel/placa del mismo consejero no pueden divergir. */
  function mapaEstados() {
    const m = Object.create(null);
    if (!datos || !datos.mesa) return m;
    for (const gen of Object.keys(datos.mesa)) {
      for (const s of (datos.mesa[gen] || [])) {
        if (s && s.persona) m[key(s.persona)] = s.estado || 'desconocido';
      }
    }
    return m;
  }
  function estadoDe(persona, mapa) {
    return (mapa && mapa[key(persona)]) || 'desconocido';
  }

  function esActivo(p) { return !!(p && p.activo !== false); }
  function llevaFlecha(p) {
    if (!p || p.activo === false || p.nuncaFlecha) return false;
    const fl = p.flecha;
    return !!(fl && Number.isFinite(Number(fl.x)) && Number.isFinite(Number(fl.y)));
  }
  /* t1219u: reparto de Carlos, sustituye al de Jobs. Los coetáneos no tienen proyecto asignado. */
  const PROYECTO_PRINCIPAL = {
    'Steve Jobs': 'Día a día',
    'Steve Wozniak': 'Alsea',
    'Walt Disney': 'PortAventuraNeXT',
    'George Lucas': 'AdmiraNeXT',
  };
  function proyectoDe(persona) {
    return PROYECTO_PRINCIPAL[persona] || '';
  }
  function llevaHalo() { return false; }
  function flechaSvg(puesto) {
    const n = (puesto && Number(puesto) >= 1) ? String(puesto) : '';
    /* Flecha más ancha. El puesto va en un <span> HTML sobre el triángulo
     * (negro sobre el color), no en SVG: el texto SVG se perdía en la punta. */
    const svg = '<svg viewBox="0 0 80 88" focusable="false" aria-hidden="true"><path d="M40 84 L6 40 L24 40 L24 4 L56 4 L56 40 L74 40 Z" fill="currentColor" stroke="#140e06" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    const num = n ? '<span class="puesto">' + n + '</span>' : '';
    return svg + num;
  }

  function cargar(force) {
    if (!force && datos && Date.now() - datosAt < REUSE_MS) return Promise.resolve(datos);
    if (enVuelo) return enVuelo;
    const f = root.fetch && root.fetch.bind(root);
    if (!f) return Promise.reject(new Error('sin fetch'));
    enVuelo = f(ENDPOINT, { cache: 'no-store', headers: { accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => { if (!d || !d.ok || !d.mesa) throw new Error('sin mesa'); datos = d; datosAt = Date.now(); pintarHalos(); if (abierto) pintarGlobo(abierto.persona, abierto.anchor); return d; })
      .finally(() => { enVuelo = null; });
    return enVuelo;
  }

  function capaHalos() {
    const stage = escena(); if (!stage) return null;
    let c = doc().getElementById('papel-halos');
    if (!c) { c = doc().createElement('div'); c.id = 'papel-halos'; c.setAttribute('aria-hidden', 'true'); stage.appendChild(c); }
    return c;
  }
  /* Caja pintada del JPG, relativa a .council-image, teniendo en cuenta object-fit. */
  function cajaArte(stage) {
    if (!stage) return null;
    const img = stage.querySelector('#council-img, img');
    const sw = stage.clientWidth || 0, sh = stage.clientHeight || 0;
    if (!img) return { x: 0, y: 0, w: sw, h: sh };
    const sr = stage.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    let x = ir.left - sr.left, y = ir.top - sr.top, w = ir.width, h = ir.height;
    const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
    const cs = root.getComputedStyle ? root.getComputedStyle(img) : null;
    const fit = ((cs && cs.objectFit) || 'fill').toLowerCase();
    if (nw && nh && w && h && fit && fit !== 'fill' && fit !== 'none') {
      let sx, sy;
      if (fit === 'cover') { const s = Math.max(w / nw, h / nh); sx = s; sy = s; }
      else if (fit === 'scale-down') { const s = Math.min(1, w / nw, h / nh); sx = s; sy = s; }
      else { const s = Math.min(w / nw, h / nh); sx = s; sy = s; } /* contain */
      const cw = nw * sx, ch = nh * sy;
      x = ir.left - sr.left + (w - cw) / 2;
      y = ir.top - sr.top + (h - ch) / 2;
      w = cw; h = ch;
    }
    return { x, y, w, h };
  }
  function ajustarCapa(c) {
    const stage = escena(); if (!c || !stage) return;
    const box = cajaArte(stage);
    if (!box || !box.w || !box.h) {
      c.style.inset = '0';
      c.style.left = c.style.top = c.style.width = c.style.height = '';
      return;
    }
    c.style.inset = 'auto';
    c.style.left = box.x + 'px';
    c.style.top = box.y + 'px';
    c.style.width = box.w + 'px';
    c.style.height = box.h + 'px';
  }
  function puntosDe(p) {
    return (p && Array.isArray(p.puntos) && p.puntos.length >= 3) ? p.puntos : [];
  }
  function pintarHalos() {
    const d = doc(); if (!d) return;
    estilos();
    const c = capaHalos(); if (!c) return;
    ajustarCapa(c);
    const gen = genActual();
    const pos = PAPEL[gen] || {};
    c.replaceChildren();
    const estados = mapaEstados();
    Object.keys(pos).forEach((persona) => {
      const p = pos[persona];
      if (!llevaFlecha(p)) return;
      const fl = p.flecha;
      const estado = estadoDe(persona, estados);
      const silla = sillaDe(persona);
      const wrap = d.createElement('span');
      wrap.className = 'consejero-marker';
      wrap.setAttribute('data-persona', persona);
      wrap.setAttribute('data-estado', estado);
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.left = fl.x + '%';
      wrap.style.top = fl.y + '%';
      wrap.style.color = COLORES[estado] || COLORES.desconocido;
      const hoy = silla && silla.hoy;
      if (hoy && (hoy.etiqueta || hoy.n != null)) {
        const lab = d.createElement('span');
        lab.className = 'consejero-ranking';
        const cifra = d.createElement('span');
        cifra.className = 'ranking-n';
        cifra.textContent = hoy.etiqueta != null ? String(hoy.etiqueta) : (hoy.n == null ? '—' : String(hoy.n));
        lab.appendChild(cifra);
        const proy = proyectoDe(persona);
        if (proy) {
          const nom = d.createElement('span');
          nom.className = 'ranking-proy';
          nom.textContent = proy;
          lab.appendChild(nom);
        }
        lab.setAttribute('role', 'button');
        lab.setAttribute('tabindex', '0');
        lab.setAttribute('data-persona', persona);
        lab.title = 'Ver las misiones de hoy de ' + persona + ' en el Mac 1984';
        lab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); mostrarListaMac(persona); });
        lab.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault(); e.stopPropagation(); mostrarListaMac(persona);
        });
        wrap.appendChild(lab);
      }
      const el = d.createElement('span');
      el.className = 'consejero-flecha';
      el.innerHTML = flechaSvg(hoy && hoy.puesto);
      wrap.appendChild(el);
      c.appendChild(wrap);
    });
  }

  function textoEtiqueta(et) {
    const t = String(et || '');
    const d = doc();
    const compacto = !!(d && d.documentElement && d.documentElement.clientWidth <= 500);
    return compacto ? t.replace(/\s*hoy\s*·\s*/, '·') : t;
  }


  function colocarGlobo(anchor) {
    if (!globo || !anchor) return;
    const stage = escena(); if (!stage) return;
    const sr = stage.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const w = globo.offsetWidth || 160;
    const h = globo.offsetHeight || 48;
    let left = r.left + r.width / 2 - sr.left;
    let top = r.top - sr.top - 10;
    left = Math.max(w / 2 + 6, Math.min(sr.width - w / 2 - 6, left));
    if (top - h < 4) top = (r.bottom - sr.top) + h + 14;
    globo.style.left = left + 'px';
    globo.style.top = top + 'px';
  }
  function pintarGlobo(persona, anchor) {
    const d = doc(); if (!d || !persona) return;
    estilos();
    if (!globo) {
      globo = d.createElement('div');
      globo.className = 'consejo-globo';
      globo.id = 'consejo-globo';
      globo.setAttribute('role', 'tooltip');
      escena() && escena().appendChild(globo);
    }
    const s = sillaDe(persona);
    let estado, texto;
    const carlos = esCarlos(persona);
    if (s) {
      estado = s.estado || 'desconocido';
      texto = s.texto;
    } else if (carlos) {
      estado = 'libre';
      texto = '';
    } else {
      estado = 'desconocido';
      texto = enVuelo ? 'mirando…' : 'desconocido';
    }
    globo.hidden = false;
    globo.dataset.estado = estado;
    globo.dataset.persona = persona;
    globo.classList.toggle('globo-proyectos', carlos);
    globo.innerHTML = '';
    const b = d.createElement('b'); b.textContent = persona;
    globo.appendChild(b);
    if (carlos) {
      pintarProyectosCarlos(globo);
    } else {
      const p = d.createElement('p'); p.textContent = texto;
      globo.appendChild(p);
      const etiqueta = s && s.hoy && s.hoy.etiqueta;
      if (etiqueta) {
        const r = d.createElement('span');
        r.className = 'consejero-ranking-globo';
        r.textContent = etiqueta + ' hoy';
        globo.appendChild(r);
      }
      const desglose = s && s.hoy && s.hoy.desglose;
      if (desglose) {
        const g = d.createElement('span');
        g.className = 'consejero-desglose-globo';
        g.textContent = desglose;
        globo.appendChild(g);
      }
      globo.setAttribute('aria-label', persona + ': ' + texto + (etiqueta ? ' · ' + etiqueta + ' hoy' : '') + (desglose ? ' · ' + desglose : ''));
    }
    colocarGlobo(anchor);
    abierto = { persona, anchor };
    const hot = d.getElementById('body-hotspots');
    if (hot) {
      hot.querySelectorAll('[data-persona]').forEach((el) => {
        if (el.getAttribute('data-persona') === persona) el.setAttribute('aria-describedby', 'consejo-globo');
        else el.removeAttribute('aria-describedby');
      });
    }
  }
  function pintarProyectosCarlos(host) {
    const d = doc(); if (!d || !host) return;
    const lista = proyectosCarlos();
    const n = lista.length;
    if (objetivosAbc && objetivosAbc.error && !n) {
      const p = d.createElement('p');
      p.className = 'gp-vacio';
      p.textContent = 'No hay datos de proyectos.';
      host.appendChild(p);
      host.setAttribute('aria-label', 'Carlos Silva: no hay datos de proyectos');
      return;
    }
    if (!n) {
      const p = d.createElement('p');
      p.className = 'gp-vacio';
      p.textContent = 'Sin proyectos activos.';
      host.appendChild(p);
      host.setAttribute('aria-label', 'Carlos Silva: sin proyectos activos');
      return;
    }
    carlosIdx = ((carlosIdx % n) + n) % n;
    const proy = lista[carlosIdx];
    const nav = d.createElement('div');
    nav.className = 'gp-nav';
    const prev = d.createElement('button');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Proyecto anterior');
    prev.textContent = '◀';
    const next = d.createElement('button');
    next.type = 'button';
    next.setAttribute('aria-label', 'Proyecto siguiente');
    next.textContent = '▶';
    const nombre = d.createElement('div');
    nombre.className = 'gp-nombre';
    const tit = d.createElement('span');
    tit.textContent = proy.nombre;
    const pos = d.createElement('span');
    pos.className = 'gp-pos';
    pos.textContent = (carlosIdx + 1) + ' / ' + n + (proy.titular ? ' · ' + proy.titular : '');
    nombre.append(tit, pos);
    const paso = (dir) => (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      carlosIdx = ((carlosIdx + dir) % n + n) % n;
      if (abierto) pintarGlobo(abierto.persona, abierto.anchor);
    };
    prev.addEventListener('click', paso(-1));
    next.addEventListener('click', paso(1));
    nav.append(prev, nombre, next);
    host.appendChild(nav);
    const ol = d.createElement('ol');
    ol.className = 'gp-abc';
    const objs = (proy.objetivos && typeof proy.objetivos === 'object') ? proy.objetivos : {};
    ['a', 'b', 'c'].forEach((letra) => {
      const li = d.createElement('li');
      const lab = d.createElement('span');
      lab.className = 'letra';
      lab.textContent = letra + '.';
      const txt = d.createElement('span');
      const valor = textoAbc(objs[letra]);
      txt.className = 'txt' + (valor === '— sin definir —' ? ' vacio' : '');
      txt.textContent = valor;
      const firma = firmaAbc(proy, letra);
      if (firma) {
        const f = d.createElement('span');
        f.className = 'gp-firma';
        f.textContent = firma;
        txt.appendChild(f);
      }
      li.append(lab, txt);
      ol.appendChild(li);
    });
    host.appendChild(ol);
    const titular = proy.titular ? (' · ' + proy.titular) : '';
    host.setAttribute('aria-label', 'Carlos Silva: ' + proy.nombre + titular + ' (' + (carlosIdx + 1) + ' de ' + n + ')');
  }
  function mostrar(el) {
    if (!el) return;
    const persona = el.getAttribute('data-persona'); if (!persona) return;
    clearTimeout(hideT);
    if (esCarlos(persona) && esTactil()) carlosFijado = true;
    pintarGlobo(persona, el);
    const after = () => { if (abierto && abierto.persona === persona) pintarGlobo(persona, el); };
    cargar(false).then(after, after);
    if (esCarlos(persona)) cargarObjetivos(false).then(after, after);
  }
  function ocultar(forzar) {
    if (!forzar && (sobreGlobo || carlosFijado)) return;
    clearTimeout(hideT);
    hideT = setTimeout(() => {
      if (!forzar && (sobreGlobo || carlosFijado)) return;
      if (globo) globo.hidden = true;
      abierto = null;
      carlosFijado = false;
      sobreGlobo = false;
      const d = doc();
      if (d) d.querySelectorAll('#body-hotspots [aria-describedby="consejo-globo"]').forEach((el) => el.removeAttribute('aria-describedby'));
    }, 160);
  }
  function esTactil() {
    return !!(root.matchMedia && root.matchMedia('(hover: none), (pointer: coarse)').matches);
  }
  function prepararHotspots() {
    const d = doc(); if (!d) return;
    const c = d.getElementById('body-hotspots'); if (!c) return;
    c.querySelectorAll('[data-persona]').forEach((el) => {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
      const p = el.getAttribute('data-persona');
      if (p && !el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Estado de ' + p);
    });
  }

  function horaLista(unixS) {
    if (!unixS) return '--:--';
    try {
      return new Date(Number(unixS) * 1000).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '--:--'; }
  }
  function pintarListaEn(host, persona, silla) {
    if (!host) return null;
    let box = host.querySelector('.mac-hoy-lista');
    if (!box) {
      box = doc().createElement('div');
      box.className = 'mac-hoy-lista';
      host.appendChild(box);
    }
    const hoy = (silla && silla.hoy) || {};
    const items = (Array.isArray(hoy.misiones) ? hoy.misiones : []).filter((m) => m && m.fuente !== 'latido');
    const puesto = hoy.puesto ? (' · puesto ' + hoy.puesto) : '';
    const nFiltrado = items.length;
    const n = hoy.n == null ? '—' : String(nFiltrado);
    box.innerHTML = '';
    const head = doc().createElement('header');
    const b = doc().createElement('b');
    b.textContent = persona + ' · ' + n + ' hoy' + puesto;
    const btn = doc().createElement('button');
    btn.type = 'button';
    btn.className = 'cerrar';
    btn.textContent = 'Cerrar';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cerrarListaMac(); });
    head.append(b, btn);
    box.appendChild(head);
    if (hoy.desglose) {
      const dg = doc().createElement('div');
      dg.className = 'desglose';
      dg.textContent = hoy.desglose;
      box.appendChild(dg);
    }
    if (!items.length) {
      const p = doc().createElement('p');
      p.className = 'vacio';
      p.textContent = hoy.n == null ? 'No hay datos atribuibles de hoy.' : 'Ninguna misión cerrada hoy.';
      box.appendChild(p);
    } else {
      const ol = doc().createElement('ol');
      items.forEach((m) => {
        const li = doc().createElement('li');
        const hora = doc().createElement('span');
        hora.className = 'hora';
        hora.textContent = horaLista(m.cuando);
        li.appendChild(hora);
        if (m.url) {
          const a = doc().createElement('a');
          a.href = m.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = (m.titulo || 'misión') + (m.ref ? '  ' + m.ref : '');
          li.appendChild(a);
        } else {
          const span = doc().createElement('span');
          span.textContent = (m.titulo || 'misión') + (m.ref ? '  ' + m.ref : '');
          li.appendChild(span);
        }
        if (m.fuente) {
          const fu = doc().createElement('span');
          fu.className = 'fuente';
          fu.textContent = ({ inbox: 'encargo', latido: 'misión', yokup: 'Yokup', pr: 'PR' }[m.fuente] || m.fuente);
          li.appendChild(fu);
        }
        ol.appendChild(li);
      });
      box.appendChild(ol);
    }
    host.classList && host.closest && (host.closest('.mac-hoy-prop, .mac-hoy-front-stage, #mac-hoy-front') || host).classList.add('has-lista');
    const wrap = host.closest && (host.closest('.mac-hoy-prop') || host.closest('.mac-hoy-front-stage') || host.closest('#mac-hoy-front'));
    if (wrap) wrap.classList.add('has-lista');
    return box;
  }
  let listaAbierta = null;
  function hostListaCrt() {
    const d = doc(); if (!d) return null;
    let el = d.getElementById('mac-hoy-lista-crt');
    if (el) return el;
    const stage = d.querySelector('#mac-hoy-front .mac-hoy-front-stage');
    if (!stage) return null;
    el = d.createElement('div');
    el.id = 'mac-hoy-lista-crt';
    el.className = 'mac-hoy-lista-crt';
    const shade = stage.querySelector('.mac-hoy-front-shade');
    stage.insertBefore(el, shade || null);
    return el;
  }
  function pantallasMac() {
    const d = doc(); if (!d) return [];
    return [
      d.querySelector('#mac-hoy-glass'),
      hostListaCrt(),
    ].filter(Boolean);
  }
  function pintarListas(persona) {
    const silla = sillaDe(persona);
    pantallasMac().forEach((h) => pintarListaEn(h, persona, silla));
    const front = doc().getElementById('mac-hoy-front');
    if (front) front.classList.add('has-lista');
    const stage = doc().querySelector('#mac-hoy-front .mac-hoy-front-stage');
    if (stage) stage.classList.add('has-lista');
    const mac = root.MacHoy;
    if (mac && typeof mac.fitScreen === 'function') {
      try { mac.fitScreen(); } catch (e) {}
    }
  }
  function mostrarListaMac(persona) {
    const pantallas = pantallasMac();
    if (!pantallas.length) return;
    listaAbierta = persona;
    const mac = root.MacHoy;
    if (mac) {
      try { if (typeof mac.setVisible === 'function') mac.setVisible(true); } catch (e) {}
      try { if (typeof mac.openFront === 'function') mac.openFront(); } catch (e) {}
    }
    /* openFront pinta el mosaico en #mac-hoy-pantalla; la lista va al cristal, en otra capa. */
    pintarListas(persona);
  }
  function cerrarListaMac() {
    const d = doc(); if (!d) return;
    d.querySelectorAll('.mac-hoy-lista').forEach((el) => el.remove());
    d.querySelectorAll('.has-lista').forEach((el) => el.classList.remove('has-lista'));
    listaAbierta = null;
    const mac = root.MacHoy;
    if (mac) {
      try { if (typeof mac.closeFront === 'function') mac.closeFront(); } catch (e) {}
    }
  }

  function wire() {
    const d = doc(); if (!d || wired) return;
    wired = true;
    estilos();
    const frontClose = d.getElementById('mac-hoy-front-close');
    if (frontClose) {
      frontClose.addEventListener('click', () => { cerrarListaMac(); });
    }
    const front = d.getElementById('mac-hoy-front');
    if (front) {
      front.addEventListener('click', (e) => { if (e.target === front) cerrarListaMac(); });
    }
    const c = d.getElementById('body-hotspots');
    if (c) {
      c.addEventListener('mouseover', (e) => {
        if (esTactil()) return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (el) mostrar(el);
      });
      c.addEventListener('mouseout', (e) => {
        if (esTactil()) return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        ocultar();
      });
      c.addEventListener('click', (e) => {
        if (!esTactil()) return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        const persona = el.getAttribute('data-persona');
        if (abierto && abierto.persona === persona && globo && !globo.hidden) {
          if (esCarlos(persona) && carlosFijado) { carlosFijado = false; ocultar(true); return; }
          ocultar(true); return;
        }
        mostrar(el);
      });
      c.addEventListener('focusin', (e) => {
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (el) mostrar(el);
      });
      c.addEventListener('focusout', (e) => {
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        ocultar();
      });
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { ocultar(); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        e.preventDefault();
        if (abierto && abierto.persona === el.getAttribute('data-persona') && globo && !globo.hidden) ocultar();
        else mostrar(el);
      });
    }
    d.addEventListener('click', (e) => {
      if (!esTactil()) return;
      if (e.target.closest && e.target.closest('#body-hotspots [data-persona]')) return;
      if (e.target.closest && e.target.closest('#consejo-globo')) return;
      if (abierto) { carlosFijado = false; ocultar(true); }
    }, true);
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (listaAbierta) { cerrarListaMac(); return; } if (abierto) { carlosFijado = false; ocultar(true); } } });
    d.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest('#consejo-globo.globo-proyectos')) {
        sobreGlobo = true; clearTimeout(hideT);
      }
    });
    d.addEventListener('mouseout', (e) => {
      const g = e.target.closest && e.target.closest('#consejo-globo.globo-proyectos');
      if (!g) return;
      if (e.relatedTarget && g.contains(e.relatedTarget)) return;
      sobreGlobo = false;
      if (!carlosFijado) ocultar();
    });
    const stage = escena();
    if (stage && root.MutationObserver) {
      new root.MutationObserver(() => { prepararHotspots(); pintarHalos(); if (abierto) colocarGlobo(abierto.anchor); })
        .observe(stage, { attributes: true, attributeFilter: ['data-generation'] });
    }
    const hot = d.getElementById('body-hotspots');
    if (hot && root.MutationObserver) {
      new root.MutationObserver(() => { prepararHotspots(); pintarHalos(); })
        .observe(hot, { childList: true, subtree: true });
    }
    if (root.addEventListener) {
      root.addEventListener('resize', () => {
        const c = doc().getElementById('papel-halos');
        if (c) ajustarCapa(c);
        if (abierto) colocarGlobo(abierto.anchor);
      });
    }
    const img = escena() && escena().querySelector('#council-img, img');
    if (img && img.addEventListener) img.addEventListener('load', pintarHalos);
    if (root.ResizeObserver && escena()) {
      new root.ResizeObserver(() => {
        const c = doc().getElementById('papel-halos');
        if (c) ajustarCapa(c);
        if (abierto) colocarGlobo(abierto.anchor);
      }).observe(escena());
    }
  }

  function arrancar() {
    estilos();
    wire();
    prepararHotspots();
    cargar(true).then(pintarHalos, pintarHalos);
  }
  if (doc() && doc().readyState === 'loading') doc().addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  root.CouncilGlobo = { cargar, pintarHalos, mostrar, ocultar, sillaDe, mapaEstados, estadoDe };
})(typeof window !== 'undefined' ? window : globalThis);
