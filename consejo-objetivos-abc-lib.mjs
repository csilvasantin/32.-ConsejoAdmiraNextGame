/**
 * Objetivos a/b/c de los proyectos del carrusel de Carlos (hover Y-3).
 *
 * No había fuente con el trío a/b/c por proyecto (las ideas de /objetivos y el
 * censo /projects son otro modelo). Este almacén vive en KV
 * (CONSUMOS_KV || RECORTE_KV, clave consejo:objetivos-abc:v1). El hover lee
 * GET /api/consejo/objetivos-abc en vivo. Un hueco vacío se muestra
 * «— sin definir —»; no se inventa texto.
 *
 * Titulares del carrusel (4 paneles):
 *   portaventura-next  PortAventuraNeXT  → Jobs
 *   admiranext         AdmiraNeXT        → Lucas
 *   alsea              Alsea             → Walt
 *   dia-a-dia          Día a día         → Woz
 * Cada noche a las 00:00 Europe/Madrid, cada consejero escribe las 3 mejoras
 * de SU proyecto (POST autenticado). Carlos puede editarlas en /objetivos;
 * una edición suya no se pisa si el titular vuelve a escribir después.
 */
export const KEY_OBJETIVOS_ABC = 'consejo:objetivos-abc:v1';
export const TEXTO_SIN_DEFINIR = '— sin definir —';

export const PLANTILLA_PROYECTOS = Object.freeze([
  Object.freeze({ id: 'portaventura-next', nombre: 'PortAventuraNeXT', titular: 'Jobs', activo: true, orden: 1 }),
  Object.freeze({ id: 'admiranext', nombre: 'AdmiraNeXT', titular: 'Lucas', activo: true, orden: 2 }),
  Object.freeze({ id: 'alsea', nombre: 'Alsea', titular: 'Walt', activo: true, orden: 3 }),
  Object.freeze({ id: 'dia-a-dia', nombre: 'Día a día', titular: 'Woz', activo: true, orden: 4 }),
]);

export const TITULARES = Object.freeze(Object.fromEntries(
  PLANTILLA_PROYECTOS.map((p) => [p.id, p.titular]),
));

const ALIAS_AUTOR = Object.freeze({
  jobs: 'Jobs', 'steve jobs': 'Jobs',
  lucas: 'Lucas', 'george lucas': 'Lucas',
  walt: 'Walt', disney: 'Walt', 'walt disney': 'Walt',
  woz: 'Woz', wozniak: 'Woz', 'steve wozniak': 'Woz',
  carlos: 'Carlos', 'carlos silva': 'Carlos',
});

export function slugProyecto(nombre, id) {
  const s = String(id || nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || 'proyecto';
}

export function autorDe(raw) {
  const k = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (!k) return '';
  return ALIAS_AUTOR[k] || String(raw).trim().slice(0, 40);
}

export function titularDe(id, nombre) {
  const sid = slugProyecto(nombre, id);
  return TITULARES[sid] || null;
}

export function textoObjetivo(valor) {
  const crudo = (valor && typeof valor === 'object') ? (valor.texto ?? valor.valor ?? '') : valor;
  const t = String(crudo == null ? '' : crudo).replace(/\s+/g, ' ').trim();
  return t || TEXTO_SIN_DEFINIR;
}

export function estaDefinido(valor) {
  return textoObjetivo(valor) !== TEXTO_SIN_DEFINIR;
}

function objetivoLimpio(valor) {
  const crudo = (valor && typeof valor === 'object') ? (valor.texto ?? valor.valor ?? '') : valor;
  return String(crudo == null ? '' : crudo).replace(/\s+/g, ' ').trim().slice(0, 280);
}

function firmaLimpia(slot, previa) {
  const base = previa && typeof previa === 'object' ? previa : {};
  const src = (slot && typeof slot === 'object') ? slot : {};
  const autor = autorDe(src.autor || src.quien || base.autor);
  const actualizado = Number(src.actualizado || src.ts || base.actualizado) || 0;
  if (!autor && !actualizado) return { autor: '', actualizado: 0 };
  return { autor, actualizado };
}

export function normalizarProyecto(raw, indice = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const nombre = String(src.nombre || src.name || src.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!nombre) return null;
  const objs = src.objetivos && typeof src.objetivos === 'object' ? src.objetivos : src;
  const firmasSrc = src.firmas && typeof src.firmas === 'object' ? src.firmas : {};
  const orden = Number.isFinite(Number(src.orden)) ? Number(src.orden) : indice + 1;
  const activo = src.activo !== false;
  const id = slugProyecto(nombre, src.id);
  const objetivos = {
    a: objetivoLimpio(objs.a ?? objs.A ?? src.objetivo_a),
    b: objetivoLimpio(objs.b ?? objs.B ?? src.objetivo_b),
    c: objetivoLimpio(objs.c ?? objs.C ?? src.objetivo_c),
  };
  const firmas = {
    a: firmaLimpia(objs.a, firmasSrc.a),
    b: firmaLimpia(objs.b, firmasSrc.b),
    c: firmaLimpia(objs.c, firmasSrc.c),
  };
  return {
    id,
    nombre,
    titular: src.titular ? (autorDe(src.titular) || String(src.titular)) : (titularDe(id, nombre) || ''),
    activo,
    orden,
    objetivos,
    firmas,
  };
}

export function plantillaInicial() {
  return PLANTILLA_PROYECTOS.map((p, i) => normalizarProyecto({ ...p, objetivos: { a: '', b: '', c: '' } }, i));
}

function asegurarPaneles(proyectos) {
  const byId = new Map(proyectos.map((p) => [p.id, p]));
  const out = proyectos.slice();
  for (const p of PLANTILLA_PROYECTOS) {
    if (!byId.has(p.id)) {
      out.push(normalizarProyecto({ ...p, objetivos: { a: '', b: '', c: '' } }, out.length));
    } else if (!byId.get(p.id).titular) {
      byId.get(p.id).titular = p.titular;
    }
  }
  return out;
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
    proyectos = asegurarPaneles(lista.map((p, i) => normalizarProyecto(p, i)).filter(Boolean));
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
    return { ...p, id, orden: i + 1, firmas: p.firmas || { a: { autor: '', actualizado: 0 }, b: { autor: '', actualizado: 0 }, c: { autor: '', actualizado: 0 } } };
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

function clonarProyectos(doc) {
  return normalizarDocumento(doc).proyectos.map((p) => ({
    ...p,
    objetivos: { ...p.objetivos },
    firmas: { a: { ...p.firmas.a }, b: { ...p.firmas.b }, c: { ...p.firmas.c } },
  }));
}

function stamp(firma, autor, ahora) {
  return { autor, actualizado: ahora || Date.now() };
}

/** Carlos (o el editor de /objetivos) sustituye lo que envía y firma como Carlos. */
export function aplicarCambio(doc, cambio, ahora = Date.now()) {
  const acc = cambio && typeof cambio === 'object' ? cambio : {};
  let proyectos = clonarProyectos(doc);
  const autor = autorDe(acc.autor || acc.quien) || 'Carlos';
  if (Array.isArray(acc.proyectos)) {
    const nuevos = acc.proyectos.map((p, i) => normalizarProyecto(p, i)).filter(Boolean);
    const prev = new Map(proyectos.map((p) => [p.id, p]));
    proyectos = asegurarPaneles(nuevos.map((n) => {
      const antes = prev.get(n.id);
      const firmas = { a: { autor: '', actualizado: 0 }, b: { autor: '', actualizado: 0 }, c: { autor: '', actualizado: 0 } };
      for (const k of ['a', 'b', 'c']) {
        if (antes && n.objetivos[k] === antes.objetivos[k] && antes.firmas[k] && antes.firmas[k].autor) {
          firmas[k] = { ...antes.firmas[k] };
        } else if (n.firmas[k] && n.firmas[k].autor && n.objetivos[k] && (n.firmas[k].autor !== 'Carlos' || n.objetivos[k] === (antes && antes.objetivos[k]))) {
          firmas[k] = { ...n.firmas[k] };
        } else if (n.objetivos[k] !== ((antes && antes.objetivos[k]) || '')) {
          firmas[k] = stamp(null, autor, ahora);
        } else if (antes) {
          firmas[k] = { ...antes.firmas[k] };
        }
      }
      return { ...n, titular: n.titular || (antes && antes.titular) || titularDe(n.id, n.nombre) || '', firmas };
    }));
  } else if (acc.borrar) {
    const id = slugProyecto('', acc.id || acc.borrar);
    proyectos = proyectos.filter((p) => p.id !== id);
  } else if (acc.proyecto || acc.nombre || acc.id) {
    const id = slugProyecto(acc.nombre, acc.id);
    const i = proyectos.findIndex((p) => p.id === id);
    const base = i >= 0 ? proyectos[i] : { objetivos: { a: '', b: '', c: '' }, firmas: { a: {}, b: {}, c: {} } };
    const n = normalizarProyecto({ ...base, ...acc, objetivos: { ...base.objetivos, ...(acc.objetivos || {}) }, firmas: base.firmas }, i >= 0 ? i : proyectos.length);
    if (n) {
      for (const k of ['a', 'b', 'c']) {
        if (n.objetivos[k] !== (base.objetivos[k] || '')) n.firmas[k] = stamp(null, autor, ahora);
        else if (base.firmas && base.firmas[k]) n.firmas[k] = { ...base.firmas[k] };
      }
      if (i >= 0) proyectos[i] = n;
      else proyectos.push(n);
    }
  }
  return normalizarDocumento({ proyectos, actualizado: ahora, fuente: 'kv' });
}

/**
 * Escritura de un titular (Jobs, Lucas, Walt, Woz) sobre SU proyecto.
 * No pisa un hueco firmado por Carlos, salvo `forzar: true`.
 * Un titular no puede escribir en el proyecto de otro.
 */
export function aplicarEscrituraTitular(doc, cambio, ahora = Date.now()) {
  const acc = cambio && typeof cambio === 'object' ? cambio : {};
  const autor = autorDe(acc.autor || acc.quien);
  const resultado = { escritos: [], conservados: [], conflictos: [], rechazados: [] };
  if (!autor || autor === 'Carlos') {
    const d = aplicarCambio(doc, { ...acc, autor: autor || 'Carlos' }, ahora);
    return { doc: d, ...resultado, escritos: ['carlos'] };
  }
  const proyectos = clonarProyectos(doc);
  const suyos = new Set(PLANTILLA_PROYECTOS.filter((p) => p.titular === autor).map((p) => p.id));
  let entradas = Array.isArray(acc.proyectos) ? acc.proyectos : null;
  if (!entradas) {
    if (acc.id || acc.nombre || acc.objetivos || acc.proyecto) entradas = [acc];
    else entradas = [];
  }
  if (!entradas.length && suyos.size === 1) {
    entradas = [{ id: [...suyos][0], objetivos: acc.objetivos || { a: acc.a, b: acc.b, c: acc.c } }];
  }
  const forzar = !!acc.forzar;
  for (const raw of entradas) {
    const plantilla = PLANTILLA_PROYECTOS.find((p) => p.id === slugProyecto(raw.nombre, raw.id))
      || PLANTILLA_PROYECTOS.find((p) => p.titular === autor);
    const n = normalizarProyecto({
      id: raw.id || (plantilla && plantilla.id),
      nombre: raw.nombre || raw.name || (plantilla && plantilla.nombre),
      objetivos: raw.objetivos || { a: raw.a, b: raw.b, c: raw.c },
    }, 0);
    const id = (n && n.id) || (plantilla && plantilla.id) || slugProyecto(raw.nombre, raw.id);
    if (!id || !suyos.has(id)) {
      resultado.rechazados.push({ id: id || null, autor, motivo: 'no es su proyecto' });
      continue;
    }
    const i = proyectos.findIndex((p) => p.id === id);
    if (i < 0) {
      resultado.rechazados.push({ id, autor, motivo: 'proyecto no encontrado' });
      continue;
    }
    const dest = proyectos[i];
    for (const k of ['a', 'b', 'c']) {
      const nuevo = n.objetivos[k];
      const antes = dest.objetivos[k] || '';
      const firmaAntes = dest.firmas[k] || { autor: '', actualizado: 0 };
      if (nuevo === antes) continue;
      const protegido = firmaAntes.autor === 'Carlos' && !!antes && !forzar;
      if (protegido) {
        const item = { id, letra: k, autor: 'Carlos', texto: antes, intento: nuevo };
        resultado.conservados.push(item);
        resultado.conflictos.push(item);
        continue;
      }
      dest.objetivos[k] = nuevo;
      dest.firmas[k] = stamp(null, autor, ahora);
      resultado.escritos.push({ id, letra: k, autor, texto: nuevo, actualizado: ahora });
    }
  }
  return { doc: normalizarDocumento({ proyectos, actualizado: ahora, fuente: 'kv' }), ...resultado };
}

export function aplicarPeticion(doc, cambio, ahora = Date.now()) {
  const acc = cambio && typeof cambio === 'object' ? cambio : {};
  const autor = autorDe(acc.autor || acc.quien);
  if (autor && autor !== 'Carlos') return aplicarEscrituraTitular(doc, acc, ahora);
  const siguiente = aplicarCambio(doc, { ...acc, autor: autor || 'Carlos' }, ahora);
  return { doc: siguiente, escritos: [], conservados: [], conflictos: [], rechazados: [] };
}
