/**
 * Lanzadera · de plan a ejecución real (Carlos, 27-nov-2026, t1452u/t1456u).
 *
 * Puro (sin red ni DOM): lo usan /api/lanzadera/ejecutar, /api/lanzadera/estado,
 * /api/lanzadera/cola, la página /lanzadera y los tests.
 *
 * Reglas:
 *   · El Mac Studio y el Mac Mini nunca se apagan, ni se reinician, ni reciben órdenes.
 *   · Cada orden se encola por pantalla para el equipo que la pinta. El equipo la recoge
 *     con su token de máquina (GET /api/lanzadera/cola) y abre Chrome en segundo plano,
 *     sin robar el foco y sin tocar players, kiosco, ni estado.json.
 *   · Resultado honesto por pantalla:
 *       despachado   → el equipo tiene machineId y latido reciente en el censo de flota.
 *       sin_conexion → tiene machineId pero no hay latido reciente (Rosa, Crema, 01–05…).
 *       pendiente_id → 03, 04 y 03V: su machineId no está confirmada.
 *   · «En marcha» solo cuando el propio equipo confirma (acuse con ok) una orden de demo.
 *     Un despacho sin acuse es «Despachado · sin confirmar», nunca «En marcha».
 */
import {
  MAQUINA_ROSA,
  MAQUINA_CREMA,
  MAQUINA_CREMA_PORTATIL,
  MAQUINA_PLATA,
  MAQUINAS_HORIZONTALES,
  MAQUINAS_MUPIS,
  MAQUINAS_PROTEGIDAS,
  DEMOS,
  URL_SALA_NEGRO,
  URL_LANZADERA,
  esMaquinaProtegida,
  urlPantallaDemo,
} from './lanzadera-lib.mjs';

export const ZONAS = Object.freeze(['reuniones', 'interactivos', 'mupis', 'todo']);
export const ACCIONES = Object.freeze(['admiranext', 'portaventura', 'negro', 'apagar', 'encender']);
export const ZONAS_REALES = Object.freeze(['reuniones', 'interactivos', 'mupis']);
export const ZONA_TITULO = Object.freeze({
  reuniones: 'Sala de reuniones',
  interactivos: 'Zona interactiva',
  mupis: 'Mupis verticales',
});
export const ZONA_TITULO_EN = Object.freeze({
  reuniones: 'Meeting room',
  interactivos: 'Interactive zone',
  mupis: 'Vertical mupis',
});
export const KV_KEY = 'lanzadera:estado:v1';
/** Latido reciente en el censo de flota (bot.yokup.com/api/presence). */
export const LATIDO_MAX_S = 15 * 60;
/** Una orden sin recoger caduca a los 30 min (se queda anotada, ya no se ejecuta). */
export const ORDEN_VIDA_MS = 30 * 60 * 1000;

export const ESTADOS = Object.freeze({
  en_marcha: { es: 'En marcha', en: 'Running' },
  en_negro: { es: 'En negro', en: 'Black' },
  despachado: { es: 'Despachado · sin confirmar', en: 'Dispatched · unconfirmed' },
  sin_conexion: { es: 'Sin conexión', en: 'Offline' },
  pendiente_id: { es: 'Pendiente ID', en: 'Pending ID' },
  sin_orden: { es: 'Sin orden', en: 'No order' },
  error: { es: 'Error', en: 'Error' },
});

const INSTRUCCION = 'Abrir la URL en Chrome, en segundo plano y a pantalla completa en la pantalla indicada, sin robar el foco del equipo que esté usando Carlos, sin poner nada encima del player y sin ocultar el cursor. No tocar players del show, kiosco, puertos de servicio ni estado.json.';
const INSTRUCCION_NEGRO = 'Abrir Sala en negro en Chrome, en segundo plano, en la pantalla indicada. No apagar ni dormir el equipo, no ocultar el cursor, no cerrar sesiones ni ojos remotos.';

export function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function validarPeticion(body) {
  const b = body && typeof body === 'object' ? body : {};
  const zona = String(b.zona || '').trim().toLowerCase();
  const accion = String(b.accion || '').trim().toLowerCase();
  if (!ZONAS.includes(zona)) return { ok: false, error: 'zona: ' + ZONAS.join(' | ') };
  if (!ACCIONES.includes(accion)) return { ok: false, error: 'accion: ' + ACCIONES.join(' | ') };
  if (b.machineId && esMaquinaProtegida(b.machineId)) return { ok: false, error: 'equipo protegido: el Mac Studio y el Mac Mini no reciben órdenes de la lanzadera' };
  return { ok: true, zona, accion };
}

function demoDe(zona, accion) {
  const a = accion === 'encender' ? 'admiranext' : accion;
  if (zona === 'reuniones') return { admiranext: DEMOS.admiranext, portaventura: DEMOS.pan, negro: DEMOS.negro }[a] || null;
  if (zona === 'interactivos') return { admiranext: DEMOS.interactivo, portaventura: DEMOS['pan-interactivo'] }[a] || null;
  if (zona === 'mupis') return { admiranext: DEMOS.mupis, portaventura: DEMOS['pan-mupis'], negro: DEMOS['negro-mupis'] }[a] || null;
  return null;
}

function pantalla(base, extra) {
  const p = { ...base, ...extra };
  if (esMaquinaProtegida(p.machineId)) throw new Error('La lanzadera nunca da órdenes al Mac Studio ni al Mac Mini.');
  return Object.freeze(p);
}

/** Pantallas de una zona para una acción, con la URL que debe abrir cada una. */
export function pantallasDeZona(zona, accion) {
  const negro = accion === 'negro' || accion === 'apagar';
  const demo = negro ? null : demoDe(zona, accion);
  if (zona === 'reuniones') {
    const urlRosa = negro ? URL_SALA_NEGRO : demo.urlLeyendas;
    const urlCrema = negro ? URL_SALA_NEGRO : demo.urlConsumos;
    const lista = [
      pantalla(MAQUINA_ROSA, { id: 'rosa-philips', zona, maquina: MAQUINA_ROSA.etiqueta, nombre: 'Rosa · Philips 86BDL3650Q', url: urlRosa }),
      pantalla(MAQUINA_CREMA, { id: 'crema-arriba', zona, maquina: MAQUINA_CREMA.etiqueta, nombre: 'Crema · PC Monitor', url: urlCrema }),
    ];
    if (accion === 'apagar') {
      // Como en el apagado de siempre: portátil del Crema y, solo si está conectado, el Plata.
      lista.push(pantalla(MAQUINA_CREMA_PORTATIL, { id: 'crema-portatil', zona, maquina: MAQUINA_CREMA.etiqueta, nombre: 'Crema · portátil', url: URL_SALA_NEGRO }));
      lista.push(pantalla(MAQUINA_PLATA, { id: 'plata', zona, maquina: MAQUINA_PLATA.etiqueta, nombre: 'Plata (si está conectado)', url: URL_SALA_NEGRO, siConectado: true }));
    }
    return lista;
  }
  const maquinas = zona === 'mupis' ? MAQUINAS_MUPIS : MAQUINAS_HORIZONTALES;
  return maquinas.map((m) => pantalla(m, {
    id: 'player-' + m.e,
    zona,
    nombre: m.grupo === 'vertical' ? 'Mupi ' + m.e : 'AdmiraNeXT' + m.e,
    url: negro ? URL_SALA_NEGRO : urlPantallaDemo(demo, m.pantalla),
  }));
}

export function planDeEjecucion(zona, accion, ahora = Date.now()) {
  const zonas = zona === 'todo' ? ZONAS_REALES : [zona];
  const pantallas = [];
  for (const z of zonas) pantallas.push(...pantallasDeZona(z, accion));
  return {
    zona,
    accion,
    zonas,
    creado: ahora,
    negro: accion === 'negro' || accion === 'apagar',
    pantallas,
  };
}

/**
 * Censo de flota a partir de bot.yokup.com/api/presence: equipos con latido reciente.
 * Devuelve Set de nombres normalizados (macbookairrosa, admiranext01, …).
 */
export function censoDesdePresencia(d, ahoraS = Math.floor(Date.now() / 1000)) {
  const vivos = new Set();
  const lista = d && Array.isArray(d.presence) ? d.presence : [];
  for (const e of lista) {
    const t = Number(e && e.updated) || 0;
    if (e && e.machine && ahoraS - t < LATIDO_MAX_S) vivos.add(norm(e.machine));
  }
  for (const m of (d && Array.isArray(d.control_machines) ? d.control_machines : [])) {
    const t = Number(m && (m.updated || m.ts)) || 0;
    if (m && m.machine && t && ahoraS - t < LATIDO_MAX_S) vivos.add(norm(m.machine));
  }
  return vivos;
}

/** Resultado honesto por pantalla para un plan, según el censo. */
export function resolverDespacho(plan, censo, censoOk = true) {
  const vivos = censo instanceof Set ? censo : new Set();
  return plan.pantallas.map((p) => {
    if (esMaquinaProtegida(p.machineId)) throw new Error('equipo protegido');
    let resultado;
    let motivo;
    if (!p.machineId) {
      resultado = 'pendiente_id';
      motivo = p.pendiente || 'machineId sin confirmar.';
    } else if (!censoOk) {
      resultado = 'sin_conexion';
      motivo = 'El censo de flota no ha respondido; no se da por despachado.';
    } else if (vivos.has(norm(p.maquina || p.etiqueta))) {
      resultado = 'despachado';
      motivo = 'Encolado para ' + (p.maquina || p.etiqueta) + ', que tiene latido reciente. Falta su acuse.';
    } else {
      resultado = 'sin_conexion';
      motivo = (p.maquina || p.etiqueta) + ' no tiene latido en el censo de flota (últimos 15 min).';
    }
    return Object.freeze({
      id: p.id,
      zona: p.zona,
      nombre: p.nombre,
      maquina: p.maquina || p.etiqueta,
      url: p.url,
      resultado,
      motivo,
    });
  });
}

export function ordenesParaCola(plan, resultados, ahora = Date.now()) {
  const porId = new Map(plan.pantallas.map((p) => [p.id, p]));
  return resultados.filter((r) => r.resultado === 'despachado').map((r) => {
    const p = porId.get(r.id);
    return Object.freeze({
      orden: 'lz-' + ahora.toString(36) + '-' + r.id,
      pantalla: r.id,
      zona: r.zona,
      maquina: r.maquina,
      machineId: p.machineId,
      display: p.display ? p.display.nombre : (p.pantalla || null),
      url: r.url,
      accion: plan.accion,
      negro: plan.negro,
      instruccion: plan.negro ? INSTRUCCION_NEGRO : INSTRUCCION,
      noRobarFoco: true,
      creado: ahora,
      caduca: ahora + ORDEN_VIDA_MS,
    });
  });
}

export function estadoVacio() {
  return { version: 1, actualizado: 0, pantallas: {}, zonas: {}, cola: [] };
}

/** Aplica un despacho al estado guardado (último estado por pantalla y por zona). */
export function anotarDespacho(estado, plan, resultados, ahora = Date.now()) {
  const e = estado && typeof estado === 'object' ? { ...estadoVacio(), ...estado } : estadoVacio();
  const pantallas = { ...e.pantallas };
  for (const r of resultados) {
    pantallas[r.id] = {
      id: r.id, zona: r.zona, nombre: r.nombre, maquina: r.maquina,
      accion: plan.accion, url: r.url, resultado: r.resultado, motivo: r.motivo,
      despachadoEn: ahora, acuse: null,
    };
  }
  const zonas = { ...e.zonas };
  for (const z of plan.zonas) zonas[z] = { zona: z, accion: plan.accion, en: ahora };
  const vivas = (e.cola || []).filter((o) => o.caduca > ahora && !resultados.some((r) => r.id === o.pantalla));
  const cola = vivas.concat(ordenesParaCola(plan, resultados, ahora)).slice(-60);
  return { ...e, actualizado: ahora, pantallas, zonas, cola };
}

/** Acuse del equipo: confirma (o no) que abrió la orden. Solo así se llega a «en marcha». */
export function anotarAcuse(estado, acuse, ahora = Date.now()) {
  const e = estado && typeof estado === 'object' ? { ...estadoVacio(), ...estado } : estadoVacio();
  const id = String(acuse && acuse.pantalla || '');
  const actual = e.pantallas[id];
  if (!actual) return { error: 'pantalla sin orden' };
  const orden = String(acuse.orden || '');
  const enCola = (e.cola || []).find((o) => o.pantalla === id);
  if (enCola && orden && enCola.orden !== orden) return { error: 'orden antigua' };
  const pantallas = { ...e.pantallas, [id]: { ...actual, acuse: { ok: acuse.ok === true, en: ahora, nota: String(acuse.nota || '').slice(0, 160) } } };
  const cola = (e.cola || []).filter((o) => o.pantalla !== id);
  return { estado: { ...e, actualizado: ahora, pantallas, cola } };
}

export function ordenesDeMaquina(estado, maquina, ahora = Date.now()) {
  const k = norm(maquina);
  return ((estado && estado.cola) || []).filter((o) => o.caduca > ahora && norm(o.maquina) === k);
}

/** Estado visible de una pantalla: nunca «en marcha» sin acuse ok del equipo. */
export function estadoVisible(registro, vivos, censoOk, base) {
  if (!base.machineId) return { estado: 'pendiente_id', motivo: base.pendiente || 'machineId sin confirmar.' };
  const vivo = censoOk && vivos.has(norm(base.maquina || base.etiqueta));
  if (!registro) return vivo ? { estado: 'sin_orden', motivo: 'Con latido; sin orden de la lanzadera todavía.' } : { estado: 'sin_conexion', motivo: censoOk ? 'Sin latido en el censo de flota (15 min).' : 'El censo de flota no ha respondido.' };
  if (registro.acuse && registro.acuse.ok === true) {
    const negro = registro.accion === 'negro' || registro.accion === 'apagar';
    return { estado: negro ? 'en_negro' : 'en_marcha', motivo: 'Confirmado por el equipo.', accion: registro.accion, en: registro.acuse.en };
  }
  if (registro.acuse && registro.acuse.ok === false) return { estado: 'error', motivo: registro.acuse.nota || 'El equipo no pudo abrirla.', accion: registro.accion };
  if (!vivo) return { estado: 'sin_conexion', motivo: censoOk ? 'Sin latido en el censo de flota (15 min).' : 'El censo de flota no ha respondido.', accion: registro.accion };
  if (registro.resultado === 'despachado') return { estado: 'despachado', motivo: 'Orden encolada; falta el acuse del equipo.', accion: registro.accion, en: registro.despachadoEn };
  return { estado: registro.resultado === 'pendiente_id' ? 'pendiente_id' : 'sin_conexion', motivo: registro.motivo, accion: registro.accion };
}

/** Todas las pantallas de las tres zonas, sin recortar. */
export function inventarioPantallas() {
  return [
    ...pantallasDeZona('reuniones', 'apagar'),
    ...pantallasDeZona('interactivos', 'admiranext'),
    ...pantallasDeZona('mupis', 'admiranext'),
  ];
}

const PRIORIDAD = ['error', 'sin_conexion', 'pendiente_id', 'despachado', 'sin_orden', 'en_negro', 'en_marcha'];

export function construirEstado(estado, vivos, censoOk, ahora = Date.now()) {
  const e = estado && typeof estado === 'object' ? estado : estadoVacio();
  const set = vivos instanceof Set ? vivos : new Set();
  const pantallas = inventarioPantallas().map((p) => {
    const v = estadoVisible(e.pantallas && e.pantallas[p.id], set, censoOk, p);
    return {
      id: p.id, zona: p.zona, nombre: p.nombre, maquina: p.maquina || p.etiqueta,
      estado: v.estado, etiqueta: ESTADOS[v.estado].es, etiquetaEn: ESTADOS[v.estado].en,
      motivo: v.motivo, accion: v.accion || null, en: v.en || null,
    };
  });
  const zonas = ZONAS_REALES.map((z) => {
    const ps = pantallas.filter((p) => p.zona === z);
    const cuenta = {};
    for (const p of ps) cuenta[p.estado] = (cuenta[p.estado] || 0) + 1;
    const todasMarcha = ps.every((p) => p.estado === 'en_marcha');
    const todasNegro = ps.every((p) => p.estado === 'en_negro');
    let estadoZona = todasMarcha ? 'en_marcha' : todasNegro ? 'en_negro' : (PRIORIDAD.find((k) => cuenta[k]) || 'sin_orden');
    if (estadoZona === 'en_marcha' && !todasMarcha) estadoZona = 'despachado';
    return {
      zona: z, titulo: ZONA_TITULO[z], tituloEn: ZONA_TITULO_EN[z],
      estado: estadoZona, etiqueta: ESTADOS[estadoZona].es, etiquetaEn: ESTADOS[estadoZona].en,
      cuenta, total: ps.length,
      ultimaOrden: (e.zonas && e.zonas[z]) || null,
    };
  });
  return {
    ok: true,
    generado: ahora,
    censo: censoOk ? 'ok' : 'sin respuesta',
    protegidos: MAQUINAS_PROTEGIDAS.map((m) => m.etiqueta),
    zonas,
    pantallas,
    lanzadera: URL_LANZADERA,
  };
}

/** Respuesta de /ejecutar sin machineId ni detalles internos. */
export function respuestaEjecucion(plan, resultados) {
  return {
    ok: true,
    zona: plan.zona,
    accion: plan.accion,
    creado: plan.creado,
    pantallas: resultados.map((r) => ({ id: r.id, zona: r.zona, nombre: r.nombre, maquina: r.maquina, resultado: r.resultado, motivo: r.motivo })),
    resumen: resultados.reduce((acc, r) => { acc[r.resultado] = (acc[r.resultado] || 0) + 1; return acc; }, {}),
    enMarcha: false,
    aviso: 'Nada queda «en marcha» hasta que cada equipo confirma su orden.',
  };
}

/** Defensa: nada de IPs, MACs, correos ni tokens en lo que sale al navegador. */
export function contieneSecreto(s) {
  const t = String(s || '');
  return /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(t)
    || /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i.test(t)
    || /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i.test(t)
    || /ghp_|ssh-ed25519|Bearer\s/i.test(t);
}
