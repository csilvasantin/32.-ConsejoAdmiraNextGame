/**
 * Objetivos a/b/c de los proyectos activos de Carlos (hover Y-3 en la mesa).
 *
 * No existía una fuente con exactamente tres objetivos (a, b, c) por proyecto:
 * la pestaña /objetivos lista ideas de Yokup (GET api.yokup.com/ideas y /projects)
 * y el censo no trae el trío a/b/c. Esta pieza es el almacén mínimo, editable
 * desde la misma pestaña Objetivos, persistido en KV (CONSUMOS_KV || RECORTE_KV,
 * clave consejo:objetivos-abc:v1). El hover lee GET /api/consejo/objetivos-abc
 * en vivo. No se inventan textos: un hueco vacío se muestra «— sin definir —».
 *
 * Plantilla inicial (solo nombres, sin objetivos): PortAventuraNeXT, AdmiraNeXT
 * y Alsea, en ese orden, hasta que Carlos edite, reordene o quite proyectos.
 */
export const KEY_OBJETIVOS_ABC = 'consejo:objetivos-abc:v1';
export const TEXTO_SIN_DEFINIR = '— sin definir —';

export const PLANTILLA_PROYECTOS = Object.freeze([
  Object.freeze({ id: 'portaventura-next', nombre: 'PortAventuraNeXT', activo: true, orden: 1 }),
  Object.freeze({ id: 'admiranext', nombre: 'AdmiraNeXT', activo: true, orden: 2 }),
  Object.freeze({ id: 'alsea', nombre: 'Alsea', activo: true, orden: 3 }),
]);

export function slugProyecto(nombre, id) {
  const s = String(id || nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || 'proyecto';
}

export function textoObjetivo(valor) {
  const t = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  return t || TEXTO_SIN_DEFINIR;
}

export function estaDefinido(valor) {
  return textoObjetivo(valor) !== TEXTO_SIN_DEFINIR;
}

function objetivoLimpio(valor) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim().slice(0, 280);
}

export function normalizarProyecto(raw, indice = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const nombre = String(src.nombre || src.name || src.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!nombre) return null;
  const objs = src.objetivos && typeof src.objetivos === 'object' ? src.objetivos : src;
  const orden = Number.isFinite(Number(src.orden)) ? Number(src.orden) : indice + 1;
  const activo = src.activo !== false;
  return {
    id: slugProyecto(nombre, src.id),
    nombre,
    activo,
    orden,
    objetivos: {
      a: objetivoLimpio(objs.a ?? objs.A ?? src.objetivo_a),
      b: objetivoLimpio(objs.b ?? objs.B ?? src.objetivo_b),
      c: objetivoLimpio(objs.c ?? objs.C ?? src.objetivo_c),
    },
  };
}

export function plantillaInicial() {
  return PLANTILLA_PROYECTOS.map((p, i) => normalizarProyecto({ ...p, objetivos: { a: '', b: '', c: '' } }, i));
}

export function normalizarDocumento(raw) {
  const lista = Array.isArray(raw && raw.proyectos) ? raw.proyectos
    : Array.isArray(raw) ? raw
    : null;
  let proyectos;
  let fuente;
  if (!lista || !lista.length) {
    proyectos = plantillaInicial();
    fuente = 'plantilla';
  } else {
    proyectos = lista.map((p, i) => normalizarProyecto(p, i)).filter(Boolean);
    if (!proyectos.length) {
      proyectos = plantillaInicial();
      fuente = 'plantilla';
    } else {
      fuente = (raw && raw.fuente) || 'kv';
    }
  }
  proyectos.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es'));
  const vistos = new Set();
  proyectos = proyectos.map((p, i) => {
    let id = p.id;
    if (vistos.has(id)) id = id + '-' + (i + 1);
    vistos.add(id);
    return { ...p, id, orden: i + 1 };
  });
  return {
    proyectos,
    fuente,
    actualizado: Number(raw && raw.actualizado) || 0,
  };
}

export function proyectosActivos(doc) {
  const d = normalizarDocumento(doc);
  return d.proyectos.filter((p) => p.activo);
}

export function indiceCircular(actual, dir, n) {
  const len = Number(n) || 0;
  if (len <= 0) return 0;
  const i = Number.isFinite(Number(actual)) ? Number(actual) : 0;
  const paso = Number(dir) || 0;
  return ((i + paso) % len + len) % len;
}

export function aplicarCambio(doc, cambio) {
  const d = normalizarDocumento(doc);
  const acc = cambio && typeof cambio === 'object' ? cambio : {};
  let proyectos = d.proyectos.map((p) => ({ ...p, objetivos: { ...p.objetivos } }));
  if (Array.isArray(acc.proyectos)) {
    proyectos = acc.proyectos.map((p, i) => normalizarProyecto(p, i)).filter(Boolean);
  } else if (acc.borrar) {
    const id = slugProyecto('', acc.id || acc.borrar);
    proyectos = proyectos.filter((p) => p.id !== id);
  } else if (acc.proyecto || acc.nombre || acc.id) {
    const n = normalizarProyecto({ ...proyectos.find((p) => p.id === slugProyecto(acc.nombre, acc.id)), ...acc, objetivos: { ...(proyectos.find((p) => p.id === slugProyecto(acc.nombre, acc.id)) || {}).objetivos, ...(acc.objetivos || {}) } }, proyectos.length);
    if (n) {
      const i = proyectos.findIndex((p) => p.id === n.id);
      if (i >= 0) proyectos[i] = n;
      else proyectos.push(n);
    }
  }
  return normalizarDocumento({ proyectos, actualizado: Date.now(), fuente: 'kv' });
}
