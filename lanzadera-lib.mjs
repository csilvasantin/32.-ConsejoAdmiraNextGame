/**
 * Lanzadera de presentaciones (Carlos, 26-nov-2026, t430u y t431u):
 *   https://www.admira.live/lanzadera/
 *
 * Dos zonas:
 *   1. Sala de reuniones de Terminator — Demo AdmiraNeXT.com y Demo
 *      PortAventuraNeXT.com: las Leyendas en la Philips 86BDL3650Q del
 *      MacBook Air Rosa y el consumo en el «PC Monitor» del MacBook Air
 *      Crema. El Plata queda fuera mientras no esté conectado. «Sala en
 *      negro» pone esas pantallas en una página negra, sin apagar nada.
 *      El apagado por zona (t454u) reutiliza esa página negra, con
 *      confirmación, y nunca apaga el Studio ni el Mini.
 *   2. Zona interactiva de Terminator (calle Planeta) — «Demo AdmiraNeXT»
 *      (player interactivo de admira.tv controlado desde AdmiraDesk) y
 *      «Modo demo PortAventuraNeXT».
 * Puro (sin DOM): lo usan la página, la CLI y los tests.
 */
import { formatHoraInicio, etiquetaMision } from './consejo-autonomo-leyendas.mjs';

export { formatHoraInicio, etiquetaMision };

export const URL_LANZADERA = '/lanzadera/';
export const URL_PUBLICA_LANZADERA = 'https://www.admira.live/lanzadera/';
export const URL_CONSUMOS = 'https://www.admira.live/consumos';
export const URL_CANAL = 'https://admira.tv/canal.html?screen=';
export const URL_ADMIRADESK = 'https://www.admira.store/control/admiradesk/';
export const URL_DEMO_PAN = 'https://www.admiranext.com/demo/PortAventuraNeXT/';
export const URL_DEMO_PAN_PLAYER = 'https://www.admiranext.com/demo/player';

/** Destinos de flota. Los machineId salen de ListMachines (26-nov-2026). */
export const URL_SALA_NEGRO = 'https://www.admira.live/lanzadera/negro.html';

export const MAQUINA_ROSA = Object.freeze({
  etiqueta: 'MacBookAirRosa',
  machineId: 'bc1275fb-b0a7-427b-a644-b0c11a2176f8',
  papel: 'Consejo de las Leyendas en la pantalla externa Philips 86BDL3650Q (único externo, a la derecha del portátil). Se identifica por nombre, no por posición.',
  display: Object.freeze({ nombre: '86BDL3650Q' }),
});

export const MAQUINA_CREMA = Object.freeze({
  etiqueta: 'MacBookAirCrema',
  machineId: 'c2f6f787-09fe-4d2b-a890-068ca4a426d0',
  papel: 'Panel de Consumos en la pantalla extendida grande de arriba (EDID «PC Monitor», 4K). Se identifica por nombre, no por posición.',
  display: Object.freeze({ nombre: 'PC Monitor' }),
});

export const MAQUINA_PLATA = Object.freeze({
  etiqueta: 'MacBookAirPlata',
  machineId: 'f52231d0-b9c0-44d2-8cde-c8646cfb27f6',
  alterno: 'acc7080f-9993-4d21-a285-bd549c2db0f2',
  papel: 'Queda fuera de la lanzadera mientras no esté conectado.',
  excluida: true,
  motivoExclusion: 'Sin conexión en ListMachines; queda fuera hasta que vuelva a conectarse. No se sustituye por otra máquina.',
});

export const MAQUINA_CREMA_PORTATIL = Object.freeze({
  etiqueta: 'MacBookAirCrema',
  machineId: MAQUINA_CREMA.machineId,
  papel: 'Pantalla integrada del portátil del Crema. En el apagado de la sala de reuniones se pone en negro.',
  display: Object.freeze({
    nombre: 'Color LCD',
    alias: Object.freeze(['Built-in Color LCD', 'Built-in Retina', 'Built-in Liquid Retina', 'Liquid Retina Display']),
  }),
});

/** Equipos que jamás se apagan ni se reinician desde la lanzadera. */
export const MAQUINAS_PROTEGIDAS = Object.freeze([
  Object.freeze({ etiqueta: 'MacMini', machineId: '2eb88abd-0f50-45e6-a554-9c83751732aa' }),
  Object.freeze({ etiqueta: 'MacStudio', machineId: '28007674-5a52-4836-b7cb-b1d66dc5099c' }),
]);

export function esMaquinaProtegida(machineId) {
  const id = String(machineId || '');
  return MAQUINAS_PROTEGIDAS.some((m) => m.machineId === id);
}

/**
 * Zona interactiva de Terminator (fuente: control/admiradesk/lanzadera.json
 * y tools/streamdeck-bridge/previos.json). machineId solo cuando ListMachines
 * confirma la etiqueta AdmiraNeXT0N; 03 y 04 quedan con machineId null
 * porque esas ids aparecen hoy con otra etiqueta.
 */
export const MAQUINAS_ZONA_INTERACTIVA = Object.freeze([
  Object.freeze({ e: '01', etiqueta: 'AdmiraNeXT01', machineId: '7d817289-d0a8-45ea-965a-0a8271b0c0d5', pantalla: 'admiranext01-a', grupo: 'PC' }),
  Object.freeze({ e: '02', etiqueta: 'AdmiraNeXT02', machineId: '42f77bdb-332d-4505-bedd-212335668648', pantalla: 'admiranext02-a', grupo: 'PC' }),
  Object.freeze({ e: '03', etiqueta: 'AdmiraNeXT03', machineId: null, pantalla: 'admiranext03-a', grupo: 'PC', pendiente: 'ListMachines no muestra ahora una máquina con la etiqueta AdmiraNeXT03.' }),
  Object.freeze({ e: '04', etiqueta: 'AdmiraNeXT04', machineId: null, pantalla: 'admiranext04-a', grupo: 'PC', pendiente: 'ListMachines no muestra ahora una máquina con la etiqueta AdmiraNeXT04.' }),
  Object.freeze({ e: '05', etiqueta: 'AdmiraNeXT05', machineId: '511f89a1-49a0-4e7e-a78a-41480b790b8b', pantalla: 'admiranext05-a', grupo: 'PC' }),
  Object.freeze({ e: '01V', etiqueta: 'AdmiraNeXT01 · vertical', machineId: '7d817289-d0a8-45ea-965a-0a8271b0c0d5', pantalla: 'admiranext01-b', grupo: 'vertical' }),
  Object.freeze({ e: '03V', etiqueta: 'AdmiraNeXT03 · vertical', machineId: null, pantalla: 'admiranext03-b', grupo: 'vertical', pendiente: 'La vertical 03V vive en el PC 03, cuya machineId no está confirmada hoy.' }),
  Object.freeze({ e: '05V', etiqueta: 'AdmiraNeXT05 · vertical', machineId: '511f89a1-49a0-4e7e-a78a-41480b790b8b', pantalla: 'admiranext05-b', grupo: 'vertical' }),
]);

export const DEMOS = Object.freeze({
  admiranext: Object.freeze({
    id: 'admiranext',
    zona: 'sala',
    titulo: 'Demo AdmiraNeXT.com',
    tituloEn: 'AdmiraNeXT.com Demo',
    tema: 'admiranext',
    urlLeyendas: 'https://www.admira.live/?autonomo=leyendas&tema=admiranext',
    urlConsumos: URL_CONSUMOS,
    fuentes: Object.freeze([
      'https://www.admiranext.com/',
      'https://www.admiranext.com/filosofia',
      'https://www.admiranext.com/mcp/',
      'https://www.admiranext.com/impacto/',
      'https://www.admiranext.com/marcablanca/',
    ]),
  }),
  pan: Object.freeze({
    id: 'pan',
    zona: 'sala',
    titulo: 'Demo PortAventuraNeXT.com',
    tituloEn: 'PortAventuraNeXT.com Demo',
    tema: 'pan',
    urlLeyendas: 'https://www.admira.live/?autonomo=leyendas&tema=pan',
    urlConsumos: URL_CONSUMOS,
    fuentes: Object.freeze(['https://www.portaventuranext.com/']),
  }),
  interactivo: Object.freeze({
    id: 'interactivo',
    zona: 'interactiva',
    titulo: 'Demo AdmiraNeXT',
    tituloEn: 'AdmiraNeXT Demo',
    urlControl: URL_ADMIRADESK,
    controlEtiqueta: 'AdmiraDesk',
    urlPlayerPlantilla: URL_CANAL,
    fuentes: Object.freeze([
      URL_ADMIRADESK,
      'https://admira.tv/canal.html?screen=admiranext01-a',
    ]),
  }),
  'pan-interactivo': Object.freeze({
    id: 'pan-interactivo',
    zona: 'interactiva',
    titulo: 'Modo demo PortAventuraNeXT',
    tituloEn: 'PortAventuraNeXT demo mode',
    urlControl: URL_DEMO_PAN,
    controlEtiqueta: 'Modo demo PortAventuraNeXT',
    urlPlayer: URL_DEMO_PAN_PLAYER,
    fuentes: Object.freeze([
      URL_DEMO_PAN,
      URL_DEMO_PAN_PLAYER,
    ]),
  }),
  negro: Object.freeze({
    id: 'negro',
    zona: 'sala',
    titulo: 'Sala en negro',
    tituloEn: 'Room in black',
    reset: true,
    urlLeyendas: URL_SALA_NEGRO,
    urlConsumos: URL_SALA_NEGRO,
    fuentes: Object.freeze([URL_SALA_NEGRO]),
  }),
});

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[¿?¡!.,;:"'“”‘’]+/g, ' ')
    .replace(/[^a-z0-9./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function idDeResto(resto) {
  const s = String(resto || '').trim();
  if (!s) return null;
  const compact = s.replace(/\s+/g, '');

  if (/^(negro|salaennegro|salanegro)$/.test(compact)
      || /sala\s+(en\s+)?negro/.test(s)
      || /^(reset(?:sala)?|ponersalaennegro)$/.test(compact)) {
    return 'negro';
  }
  if (/modo\s*(demo\s*)?(de\s*)?portaventura/.test(s)
      || /portaventura(?:next)?(?:\.com)?\s*interactivo/.test(s)
      || /interactivo\s*(de\s*)?portaventura/.test(s)
      || /^(pan-interactivo|paninteractivo|modoportaventura|mododemoportaventura|mododemoportaventuranext)$/.test(compact)) {
    return 'pan-interactivo';
  }
  if (/admiradesk|player\s*interactivo|zona\s*interactiva/.test(s)
      || /admiranext\s*interactivo/.test(s)
      || /interactivo/.test(s)
      || /^(admiradesk|player|interactivo|admiranext-interactivo)$/.test(compact)) {
    return 'interactivo';
  }
  if (/admiranext(?:[\s.]*com|punto\s*com)/.test(s) || compact === 'admiranext.com' || compact === 'admiranextcom') return 'admiranext';
  if (/portaventuranext(?:[\s.]*com)?/.test(s) || compact === 'portaventuranext.com' || compact === 'portaventuranextcom') return 'pan';
  if (/^(admiranext)$/.test(compact)) return 'admiranext';
  if (/^(pan|portaventura|portaventuranext)$/.test(compact)) return 'pan';
  return null;
}

/**
 * Reconoce la selección o la orden de voz/CLI.
 * Sala: «Demo AdmiraNeXT.com», «/demo admiranext», «/demo portaventura».
 * Zona interactiva: «Demo AdmiraNeXT» se pulsa en el botón (id interactivo);
 * por voz/CLI: «player interactivo», «/demo interactivo», «admiradesk»,
 * «modo demo PortAventuraNeXT», «/demo modo portaventura».
 * «/lanzadera» y «/demo» (solo) abren la lanzadera. No dispara si la frase
 * es una pregunta larga que solo menciona la demo.
 */
export function parseComandoDemo(texto) {
  const raw = String(texto == null ? '' : texto).trim();
  if (!raw) return null;
  const s = norm(raw).replace(/^\//, '');

  const apaga = parseComandoApagar(raw);
  if (apaga) return apaga;

  if (/^(lanzadera|launcher|lanzadera de presentaciones|presentaciones)$/.test(s)) {
    return { tipo: 'lanzadera', demo: null };
  }

  if (/^(sala(?:\s+en)?\s+negro|reset(?:\s+(?:de\s+la\s+|de\s+)?sala)?|poner(?:\s+la)?\s+sala\s+en\s+negro)$/.test(s)) {
    return { tipo: 'demo', demo: DEMOS.negro };
  }

  if (/(?:^|\s)(?:(?:lanza|lanzar|abre|abrir|elige|elegir|selecciona|selecciono|seleccionar|pon|poner|quiero|muestra|mostrar|arranca|arrancar|inicia|iniciar)\s+)?(?:el\s+)?modo demo(?:\s+de)?\s+portaventura/.test(s)
      || /^modo demo(?:\s+de)?\s+portaventura/.test(s)) {
    return { tipo: 'demo', demo: DEMOS['pan-interactivo'] };
  }
  if (/^(?:(?:lanza|lanzar|abre|abrir|elige|elegir|selecciona|selecciono|seleccionar|pon|poner|quiero|muestra|mostrar|arranca|arrancar|inicia|iniciar)\s+)?(?:el\s+)?(?:player interactivo|admiradesk)(?:\s+de\s+admiranext)?$/.test(s)) {
    return { tipo: 'demo', demo: DEMOS.interactivo };
  }

  const pref = '(?:(?:lanza|lanzar|abre|abrir|elige|elegir|selecciona|selecciono|seleccionar|pon|poner|quiero|muestra|mostrar|arranca|arrancar|inicia|iniciar)\\s+)?(?:la\\s+)?';
  const m = s.match(new RegExp('^' + pref + 'demo\\s*(?:de\\s+)?(.+)?$'));
  if (!m) return null;

  const resto = String(m[1] || '').trim();
  if (!resto || /^(help|ayuda|\?|lista|list)$/.test(resto)) {
    return { tipo: 'lanzadera', demo: null };
  }
  const id = idDeResto(resto);
  if (!id) return { tipo: 'lanzadera', demo: null, desconocido: resto };
  return { tipo: 'demo', demo: DEMOS[id] };
}

export function demoPorId(id) {
  const s = String(id || '').trim().toLowerCase();
  if (DEMOS[s]) return DEMOS[s];
  const alt = idDeResto(s);
  return (alt && DEMOS[alt]) || null;
}

export function urlLanzaderaDemo(id) {
  const d = demoPorId(id);
  if (!d) return URL_LANZADERA;
  return URL_LANZADERA + '?demo=' + encodeURIComponent(d.id);
}

export function urlLanzaderaDesdeComando(texto) {
  const cmd = parseComandoDemo(texto);
  if (!cmd) return null;
  if (cmd.tipo === 'demo' && cmd.demo) return urlLanzaderaDemo(cmd.demo.id);
  if (cmd.tipo === 'apagar' && cmd.apagado) return URL_LANZADERA + '?apagar=' + encodeURIComponent(cmd.apagado.id);
  if (cmd.tipo === 'encender' && cmd.encendido) return URL_LANZADERA + '?encender=' + encodeURIComponent(cmd.encendido.id);
  if (cmd.tipo === 'lanzadera') return URL_LANZADERA;
  return null;
}

function destinosInteractivos(demo) {
  return MAQUINAS_ZONA_INTERACTIVA.map((m) => Object.freeze({
    ...m,
    url: demo.urlPlayer || (URL_CANAL + m.pantalla),
  }));
}

export function planDeLanzamiento(demo, inicio) {
  const d = typeof demo === 'string' ? demoPorId(demo) : demo;
  if (!d) return null;
  const hora = typeof inicio === 'string' ? inicio : formatHoraInicio(inicio || new Date());
  const base = {
    demo: d,
    zona: d.zona,
    inicio: hora,
    etiqueta: etiquetaMision(hora, 'es'),
    etiquetaEn: etiquetaMision(hora, 'en'),
    cursor: 'El cursor no se oculta nunca: si se mueve el ratón, tiene que reaparecer.',
    noEncimarPlayer: true,
    noRobarFoco: 'Sin quitar el foco del ordenador que está usando Carlos y sin abrir nada encima del player.',
  };
  if (d.zona === 'interactiva') {
    return {
      ...base,
      control: {
        etiqueta: d.controlEtiqueta,
        url: d.urlControl,
      },
      players: destinosInteractivos(d),
    };
  }
  return {
    ...base,
    reset: !!d.reset,
    verificarConCaptura: true,
    rosa: {
      ...MAQUINA_ROSA,
      url: d.urlLeyendas,
    },
    crema: {
      ...MAQUINA_CREMA,
      url: d.urlConsumos,
    },
  };
}

function textoDisplay(d) {
  return [d && d.nombre, d && d.name, d && d.localizedName, d && d.edid, d && d.productName]
    .filter(Boolean).join(' ').toLowerCase();
}

/**
 * Localiza una pantalla por machineId + nombre EDID. Nunca cae a otra
 * pantalla ni a un índice de posición.
 */
export function localizarDisplay(inventario, destino) {
  const nombre = destino && destino.display && destino.display.nombre;
  if (!nombre) return { error: 'El destino no tiene pantalla identificada por nombre.' };
  const maquinas = Array.isArray(inventario) ? inventario : [];
  const ids = [destino.machineId, destino.alterno].filter(Boolean);
  const m = maquinas.find((x) => ids.includes(x.machineId));
  if (!m) {
    return { error: 'No está conectado el ' + (destino.etiqueta || 'equipo') + '.' };
  }
  const claves = [nombre].concat((destino.display && destino.display.alias) || []).map((n) => String(n || '').toLowerCase()).filter(Boolean);
  const d = (m.displays || []).find((x) => {
    const bag = textoDisplay(x);
    return claves.some((clave) => bag.includes(clave));
  });
  if (!d) {
    return { error: 'No está conectada la pantalla ' + nombre + ' del ' + (destino.etiqueta || 'equipo') + '. No se abre en otra pantalla.' };
  }
  return { display: d, machineId: m.machineId };
}

export function validarPlanContraInventario(plan, inventario) {
  if (!plan) return { ok: false, errores: ['No hay plan.'] };
  const destinos = [];
  if (plan.rosa) destinos.push(['rosa', plan.rosa]);
  if (plan.crema) destinos.push(['crema', plan.crema]);
  const errores = [];
  const localizados = {};
  for (const [k, dest] of destinos) {
    const r = localizarDisplay(inventario, dest);
    if (r.error) errores.push(r.error);
    else localizados[k] = r;
  }
  return { ok: errores.length === 0, errores, localizados };
}

/** Solo se marca la demo en marcha cuando hay captura de cada pantalla destino. */
export function puedeMarcarEnMarcha(plan, verificacion) {
  if (!plan) return false;
  const needed = [];
  if (plan.rosa) needed.push('rosa');
  if (plan.crema) needed.push('crema');
  const pantallas = (verificacion && verificacion.pantallas) || [];
  return needed.every((k) => pantallas.some((p) => p.destino === k && p.ok === true));
}


export const APAGADOS = Object.freeze({
  reuniones: Object.freeze({
    id: 'reuniones',
    zona: 'sala',
    titulo: 'Apagar sala de reuniones Terminator',
    tituloEn: 'Turn off the Terminator meeting room',
    restaurar: 'admiranext',
  }),
  interactivos: Object.freeze({
    id: 'interactivos',
    zona: 'interactiva',
    titulo: 'Apagar sala de interactivos Terminator',
    tituloEn: 'Turn off the Terminator interactive room',
    restaurar: 'interactivo',
  }),
  todo: Object.freeze({
    id: 'todo',
    zona: 'ambas',
    titulo: 'Apagar todo',
    tituloEn: 'Turn everything off',
    restaurar: 'todo',
  }),
});

export const ENCENDIDOS = Object.freeze({
  reuniones: Object.freeze({ id: 'reuniones', zona: 'sala', titulo: 'Encender sala de reuniones Terminator', tituloEn: 'Restore the Terminator meeting room', demo: 'admiranext' }),
  interactivos: Object.freeze({ id: 'interactivos', zona: 'interactiva', titulo: 'Encender sala de interactivos Terminator', tituloEn: 'Restore the Terminator interactive room', demo: 'interactivo' }),
  todo: Object.freeze({ id: 'todo', zona: 'ambas', titulo: 'Encender todo', tituloEn: 'Restore everything', demo: 'todo' }),
});

const PROTECCIONES_ES = Object.freeze([
  'Nunca se apaga ni se reinicia el Mac Studio ni el Mac Mini.',
  'El cursor no se oculta nunca: no se duermen las pantallas, se reutiliza Sala en negro.',
  'No se cierran los ojos remotos (Firefox en el Rosa) ni se toca el portátil del Rosa.',
  'No se cierran las sesiones de Grok Bot ni de los agentes.',
]);

const PROTECCIONES_EN = Object.freeze([
  'The Mac Studio and the Mac Mini are never shut down or restarted.',
  'The cursor is never hidden: displays are not put to sleep; Sala en negro is reused.',
  'Remote eyes (Firefox on the Rosa) stay open and the Rosa laptop is left alone.',
  'Grok Bot and agent sessions are not closed.',
]);

function destinoApagado(base, extra) {
  const d = { ...base, ...extra, url: extra.url || URL_SALA_NEGRO };
  if (esMaquinaProtegida(d.machineId)) {
    throw new Error('Un destino de apagado no puede ser el Mac Studio ni el Mac Mini.');
  }
  return Object.freeze(d);
}

export function destinosApagadoReuniones() {
  return Object.freeze([
    destinoApagado(MAQUINA_ROSA, {
      id: 'rosa-philips',
      rol: 'Philips 86BDL3650Q del Rosa: las Leyendas pasan a Sala en negro. No se toca el portátil (ojos remotos ni sesiones).',
    }),
    destinoApagado(MAQUINA_CREMA, {
      id: 'crema-arriba',
      rol: 'PC Monitor de arriba del Crema: Consumos en Sala en negro.',
    }),
    destinoApagado(MAQUINA_CREMA_PORTATIL, {
      id: 'crema-portatil',
      rol: 'Pantalla del portátil del Crema en Sala en negro.',
    }),
    destinoApagado(MAQUINA_PLATA, {
      id: 'plata',
      siConectado: true,
      rol: 'Pantalla del Plata en Sala en negro, solo si está conectado. Si no, se anota y no se sustituye por otro equipo.',
    }),
  ]);
}

export function destinosApagadoInteractivos() {
  const players = MAQUINAS_ZONA_INTERACTIVA.map((m) => Object.freeze({
    ...m,
    id: 'player-' + m.e,
    url: URL_SALA_NEGRO,
    rol: 'Player de ' + m.etiqueta + ' en Sala en negro.',
    tipo: 'player',
  }));
  const desk = Object.freeze({
    id: 'admiradesk',
    etiqueta: 'AdmiraDesk',
    url: URL_ADMIRADESK,
    tipo: 'control',
    rol: 'Se cierra o se pone en negro el control de la demo. No se apaga ningún equipo.',
  });
  return Object.freeze([...players, desk]);
}

export function apagadoPorId(id) {
  const s = String(id || '').trim().toLowerCase();
  if (APAGADOS[s]) return APAGADOS[s];
  if (/^(reunion|reuniones|sala-reuniones|sala de reuniones)$/.test(s)) return APAGADOS.reuniones;
  if (/^(interactivo|interactivos|sala-interactivos|sala de interactivos)$/.test(s)) return APAGADOS.interactivos;
  if (/^(todo|all|ambas)$/.test(s)) return APAGADOS.todo;
  return null;
}

export function encendidoPorId(id) {
  const s = String(id || '').trim().toLowerCase();
  if (ENCENDIDOS[s]) return ENCENDIDOS[s];
  const a = apagadoPorId(s);
  return (a && ENCENDIDOS[a.id]) || null;
}

/**
 * Voz y CLI del apagado y del encendido.
 * «/apagar reuniones», «/apagar interactivos», «/apagar todo»,
 * «apagar sala de reuniones», «/encender reuniones», «/restaurar todo».
 * Un «/apagar» solo abre la lanzadera, no apaga nada.
 */
export function parseComandoApagar(texto) {
  const raw = String(texto == null ? '' : texto).trim();
  if (!raw) return null;
  if (/\?$/.test(raw) && raw.length > 40) return null;
  const s = norm(raw).replace(/^\//, '');
  if (/^(no\s+)?(quiero\s+)?(que\s+)?no\s+apagues/.test(s)) return null;

  const enc = s.match(/^(encender|restaurar|prender|reanudar sala)(?:\s+(?:la\s+)?(?:sala\s+(?:de\s+)?)?)?(reuniones?|interactivos?|interactiva|todo|all)?$/);
  if (enc) {
    const zona = enc[2] || '';
    if (!zona || /todo|all/.test(zona)) return { tipo: 'encender', encendido: ENCENDIDOS.todo };
    if (/interact/.test(zona)) return { tipo: 'encender', encendido: ENCENDIDOS.interactivos };
    if (/reunion/.test(zona)) return { tipo: 'encender', encendido: ENCENDIDOS.reuniones };
    return { tipo: 'lanzadera', demo: null };
  }
  if (/^restaurar(?:\s+(?:la\s+)?sala(?:\s+de)?\s+(reuniones?|interactivos?))?$/.test(s)
      || /^encender(?:\s+(?:la\s+)?sala(?:\s+de)?\s+(reuniones?|interactivos?))$/.test(s)) {
    if (/interact/.test(s)) return { tipo: 'encender', encendido: ENCENDIDOS.interactivos };
    if (/reunion/.test(s)) return { tipo: 'encender', encendido: ENCENDIDOS.reuniones };
  }

  if (!/^(apagar|apagado|shutdown|apaga)\b/.test(s) && !/^apagar\b/.test(s)) return null;
  if (/^(apagar|apagado|shutdown|apaga)$/.test(s)) {
    return { tipo: 'lanzadera', demo: null, apagar: true };
  }
  if (/\btodo\b|\ball\b|ambas salas|todas las salas/.test(s)) {
    return { tipo: 'apagar', apagado: APAGADOS.todo };
  }
  if (/interactivo/.test(s)) {
    return { tipo: 'apagar', apagado: APAGADOS.interactivos };
  }
  if (/reunion/.test(s)) {
    return { tipo: 'apagar', apagado: APAGADOS.reuniones };
  }
  return { tipo: 'lanzadera', demo: null, apagar: true, desconocido: s };
}

export function planDeApagado(id, inicio) {
  const a = typeof id === 'string' || !id ? apagadoPorId(id) : id;
  if (!a) return null;
  const hora = typeof inicio === 'string' ? inicio : formatHoraInicio(inicio || new Date());
  let destinos = [];
  if (a.id === 'reuniones' || a.id === 'todo') destinos = destinos.concat(destinosApagadoReuniones());
  if (a.id === 'interactivos' || a.id === 'todo') destinos = destinos.concat(destinosApagadoInteractivos());
  if (destinos.some((d) => esMaquinaProtegida(d.machineId))) {
    throw new Error('Un destino de apagado no puede ser el Mac Studio ni el Mini.');
  }
  return {
    tipo: 'apagado',
    apagado: a,
    zona: a.zona,
    inicio: hora,
    etiqueta: etiquetaMision(hora, 'es') + ' · ' + a.titulo,
    etiquetaEn: etiquetaMision(hora, 'en') + ' · ' + a.tituloEn,
    requiereConfirmacion: true,
    confirmado: false,
    urlNegro: URL_SALA_NEGRO,
    dormirPantalla: false,
    cursor: 'El cursor no se oculta nunca: si se mueve el ratón, tiene que reaparecer.',
    protecciones: PROTECCIONES_ES,
    proteccionesEn: PROTECCIONES_EN,
    destinos: Object.freeze(destinos),
    restaurar: a.restaurar,
    marca: 'AdmiraNeXT',
  };
}

export function urlLanzaderaApagar(id) {
  const a = apagadoPorId(id);
  if (!a) return URL_LANZADERA;
  return URL_LANZADERA + '?apagar=' + encodeURIComponent(a.id);
}
