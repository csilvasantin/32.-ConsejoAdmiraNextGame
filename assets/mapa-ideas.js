/* mapa-ideas.js — el Mapa del Tesoro del Consejo.
 *
 * Carlos, 2026-09-20: «cuando pulse crear, dibujar un mapa del tesoro como el de
 * Monkey Island, pero que pueda escribir encima con estilo pirata pero legible
 * las ideas que se me ocurran para debatir con el consejo».
 *
 * Tres decisiones que explican todo lo demás:
 *
 * 1. El mapa es un SVG (assets/mapa-tesoro.svg) y las ideas van ENCIMA en HTML.
 *    Podrían ser <text> dentro del SVG, pero entonces no se podrían seleccionar
 *    ni editar con el cursor como texto normal, y «escribir encima» dejaría de
 *    serlo. Van posicionadas en % para que sigan en su sitio a cualquier tamaño.
 *
 * 2. Las ideas se guardan en el navegador, NO en el backend. Son notas al vuelo:
 *    no valen una petición de red ni un token, que es justo lo contrario de lo
 *    que buscamos. Al Consejo sólo va la que Carlos decide mandar.
 *
 * 3. El orden en que se escriben dibuja la ruta. En un mapa del tesoro las
 *    ideas no son una lista: son el camino hasta la X. La última lleva el cofre.
 */

export const CLAVE = 'mapaTesoro.v1';
export const MAX_IDEAS = 40;
export const MAX_LARGO = 280;

/* Cada generación tiene su propio mapa: las ideas para las Leyendas no son las
   mismas que para los Coetáneos, y mezclarlas convertiría el mapa en un cajón. */
export function claveDe(gen) { return CLAVE + ':' + (gen || 'leyendas'); }

export function limpiaTexto(txt) {
  return String(txt == null ? '' : txt).replace(/\s+/g, ' ').trim().slice(0, MAX_LARGO);
}

/* Las coordenadas llegan de un clic y se guardan en %. Se dejan dentro de un
   margen para que una idea escrita en el borde no se salga del pergamino ni se
   meta debajo del marco. */
export function encajaPunto(x, y) {
  const corta = (v) => Math.max(4, Math.min(92, Number.isFinite(v) ? v : 50));
  return { x: corta(x), y: corta(y) };
}

let contador = 0;
export function nuevaIdea(texto, x, y, ahora = Date.now()) {
  const t = limpiaTexto(texto);
  if (!t) return null;
  const p = encajaPunto(x, y);
  return { id: 'i' + ahora.toString(36) + (contador++).toString(36), texto: t, x: p.x, y: p.y, ts: ahora };
}

/* Lo leído del almacén es dato de fuera: puede venir de otra versión, de otra
   pestaña o corrompido a mano. Se valida idea a idea y se tira lo que no cuadre
   en vez de dar por buena la lista entera. */
/* Number(null) y Number('') dan 0, no NaN: una coordenada que falta acabaría
   pegada al borde de arriba en vez de caer al centro, que es donde se ve y se
   puede recolocar. */
function aNumero(v) {
  return (v === null || v === undefined || v === '' || typeof v === 'boolean') ? NaN : Number(v);
}

export function saneaLista(bruto) {
  let datos = bruto;
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { return []; } }
  if (!Array.isArray(datos)) return [];
  const vistas = new Set();
  const out = [];
  for (const it of datos) {
    if (!it || typeof it !== 'object') continue;
    const texto = limpiaTexto(it.texto);
    if (!texto) continue;
    const id = typeof it.id === 'string' && it.id ? it.id : 'i' + out.length.toString(36);
    if (vistas.has(id)) continue;
    vistas.add(id);
    const p = encajaPunto(aNumero(it.x), aNumero(it.y));
    out.push({ id, texto, x: p.x, y: p.y, ts: Number(it.ts) || 0 });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

/* La ruta une las ideas en el orden en que se escribieron. Con una sola no hay
   camino que dibujar —una X suelta no es una ruta— y se devuelve vacía. */
export function puntosRuta(ideas) {
  const lista = Array.isArray(ideas) ? ideas : [];
  if (lista.length < 2) return [];
  return lista.map((i) => [i.x, i.y]);
}

/* Inclinación de cada nota. Escrita a mano, ninguna sale recta; pero tiene que
   ser SIEMPRE la misma para una idea dada, o al repintar el mapa bailarían. De
   ahí que salga del id y no de Math.random(). */
export function inclinacion(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
  return ((h % 9) - 4) * 0.55;          // entre -2.2 y +2.2 grados
}

/* El texto que se lleva al Consejo. Lleva las demás ideas como contexto: el
   Consejo debate MEJOR sabiendo qué más hay en el mapa, y escribirlo a mano cada
   vez sería absurdo. */
export function temaParaConsejo(idea, todas = []) {
  const t = limpiaTexto(idea && idea.texto);
  if (!t) return '';
  const otras = (Array.isArray(todas) ? todas : [])
    .filter((i) => i && i.id !== (idea && idea.id))
    .map((i) => limpiaTexto(i.texto))
    .filter(Boolean);
  if (!otras.length) return t;
  return t + ' (otras ideas del mapa: ' + otras.join('; ') + ')';
}

/* ── De aquí abajo, el DOM ─────────────────────────────────────────────────
   Separado a propósito: todo lo de arriba es lógica pura y se prueba sin
   navegador. */

export function leeIdeas(gen, almacen) {
  const store = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return [];
  try { return saneaLista(store.getItem(claveDe(gen))); } catch (e) { return []; }
}

export function guardaIdeas(gen, ideas, almacen) {
  const store = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try { store.setItem(claveDe(gen), JSON.stringify(saneaLista(ideas))); return true; }
  catch (e) { return false; }          // cuota llena o modo privado: no es motivo para romper el mapa
}

export function montaMapa(root = typeof document !== 'undefined' ? document : null) {
  if (!root || !root.querySelector) return null;
  const caja = root.querySelector('#mapa-tesoro');
  if (!caja || caja.__montado) return caja && caja.__api;
  caja.__montado = true;

  const lienzo = caja.querySelector('.mt-lienzo');
  const capa = caja.querySelector('.mt-ideas');
  const ruta = caja.querySelector('.mt-ruta');
  const contaje = caja.querySelector('.mt-contaje');
  const genActual = () => (typeof window !== 'undefined' && window.currentGenPublic) || 'leyendas';

  let ideas = leeIdeas(genActual());
  let editando = null;

  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  function guarda() { guardaIdeas(genActual(), ideas); }

  function pintaRuta() {
    const pts = puntosRuta(ideas);
    if (!ruta) return;
    ruta.innerHTML = '';
    if (!pts.length) return;
    const ns = 'http://www.w3.org/2000/svg';
    const linea = document.createElementNS(ns, 'polyline');
    linea.setAttribute('points', pts.map((p) => p[0] + ',' + p[1]).join(' '));
    linea.setAttribute('class', 'mt-ruta-linea');
    ruta.appendChild(linea);
    // El cofre va en la última idea: el tesoro está al final del camino. Un poco
    // por debajo, porque justo encima lo tapa la propia nota y no se veía.
    // Los brazos no son iguales en X e Y a propósito: con preserveAspectRatio
    // "none" una unidad vertical y una horizontal no miden lo mismo, y una X de
    // lados iguales saldría aplastada.
    const fin = [pts[pts.length - 1][0], Math.min(96, pts[pts.length - 1][1] + 3.6)];
    const x = document.createElementNS(ns, 'path');
    x.setAttribute('d', 'M' + (fin[0] - 1.3) + ' ' + (fin[1] - 2.3) + ' l2.6 4.6 M' + (fin[0] + 1.3) + ' ' + (fin[1] - 2.3) + ' l-2.6 4.6');
    x.setAttribute('class', 'mt-ruta-x');
    ruta.appendChild(x);
  }

  function pinta() {
    if (!capa) return;
    capa.innerHTML = ideas.map((i, n) => (
      '<div class="mt-nota" data-id="' + esc(i.id) + '" style="left:' + i.x + '%;top:' + i.y + '%;' +
        '--giro:' + inclinacion(i.id).toFixed(2) + 'deg">' +
        '<span class="mt-marca" title="Arrastra para moverla">' + (n + 1) + '</span>' +
        '<span class="mt-texto" role="textbox" tabindex="0">' + esc(i.texto) + '</span>' +
        '<span class="mt-acciones">' +
          '<button type="button" class="mt-al-consejo" title="Llevar esta idea al Consejo">al consejo</button>' +
          '<button type="button" class="mt-borrar" title="Borrar la idea">borrar</button>' +
        '</span>' +
      '</div>'
    )).join('');
    pintaRuta();
    if (contaje) {
      contaje.textContent = ideas.length
        ? ideas.length + (ideas.length === 1 ? ' idea en el mapa' : ' ideas en el mapa')
        : 'Pulsa en el mapa y escribe tu idea';
    }
  }

  // Escribir: se pulsa en el pergamino y sale el renglón donde se ha pulsado.
  function abreEscritura(xPct, yPct, idea) {
    cierraEscritura();
    const p = encajaPunto(xPct, yPct);
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.className = 'mt-escribe';
    campo.maxLength = MAX_LARGO;
    campo.placeholder = 'Escribe la idea y pulsa Enter';
    campo.value = idea ? idea.texto : '';
    campo.style.left = p.x + '%';
    campo.style.top = p.y + '%';
    capa.appendChild(campo);
    editando = { campo, x: p.x, y: p.y, id: idea ? idea.id : null };
    campo.focus();
    campo.select();
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmaEscritura(); }
      else if (e.key === 'Escape') { e.preventDefault(); cierraEscritura(); }
      e.stopPropagation();
    });
    campo.addEventListener('blur', () => confirmaEscritura());
  }

  function confirmaEscritura() {
    if (!editando) return;
    const { campo, x, y, id } = editando;
    editando = null;                       // antes de tocar el DOM: el blur reentra aquí
    const texto = limpiaTexto(campo.value);
    campo.remove();
    if (!texto) { pinta(); return; }
    if (id) {
      const idea = ideas.find((i) => i.id === id);
      if (idea) idea.texto = texto;
    } else if (ideas.length < MAX_IDEAS) {
      const nueva = nuevaIdea(texto, x, y);
      if (nueva) ideas.push(nueva);
    }
    guarda();
    pinta();
  }

  function cierraEscritura() {
    if (!editando) return;
    const campo = editando.campo;
    editando = null;
    campo.remove();
  }

  function pctDeEvento(e) {
    const r = lienzo.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  if (lienzo) {
    lienzo.addEventListener('click', (e) => {
      if (e.target.closest('.mt-nota') || e.target.closest('.mt-escribe')) return;
      const p = pctDeEvento(e);
      abreEscritura(p.x, p.y, null);
    });
  }

  if (capa) {
    capa.addEventListener('click', (e) => {
      const nota = e.target.closest('.mt-nota');
      if (!nota) return;
      const id = nota.dataset.id;
      const idea = ideas.find((i) => i.id === id);
      if (!idea) return;
      if (e.target.closest('.mt-borrar')) {
        e.stopPropagation();
        ideas = ideas.filter((i) => i.id !== id);
        guarda(); pinta();
        return;
      }
      if (e.target.closest('.mt-al-consejo')) {
        e.stopPropagation();
        const tema = temaParaConsejo(idea, ideas);
        if (typeof window !== 'undefined' && typeof window.debateIdea === 'function') {
          cierra();
          window.debateIdea(tema);
        }
        return;
      }
      if (e.target.closest('.mt-texto')) {
        e.stopPropagation();
        abreEscritura(idea.x, idea.y, idea);
      }
    });

    // Arrastrar por el número: mover una idea es recolocar el punto en la ruta.
    let llevando = null;
    capa.addEventListener('pointerdown', (e) => {
      const marca = e.target.closest('.mt-marca');
      if (!marca) return;
      const nota = marca.closest('.mt-nota');
      llevando = { id: nota.dataset.id, nota };
      nota.classList.add('moviendo');
      marca.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    capa.addEventListener('pointermove', (e) => {
      if (!llevando) return;
      const c = pctDeEvento(e);
      const p = encajaPunto(c.x, c.y);
      llevando.nota.style.left = p.x + '%';
      llevando.nota.style.top = p.y + '%';
    });
    const suelta = (e) => {
      if (!llevando) return;
      const c = pctDeEvento(e);
      const p = encajaPunto(c.x, c.y);
      const idea = ideas.find((i) => i.id === llevando.id);
      if (idea) { idea.x = p.x; idea.y = p.y; guarda(); }
      llevando.nota.classList.remove('moviendo');
      llevando = null;
      pintaRuta();
    };
    capa.addEventListener('pointerup', suelta);
    capa.addEventListener('pointercancel', suelta);
  }

  function abre() {
    ideas = leeIdeas(genActual());
    caja.classList.add('on');
    caja.removeAttribute('hidden');
    pinta();
  }
  function cierra() { cierraEscritura(); caja.classList.remove('on'); caja.setAttribute('hidden', ''); }

  const cerrar = caja.querySelector('.mt-cerrar');
  if (cerrar) cerrar.addEventListener('click', cierra);
  caja.addEventListener('click', (e) => { if (e.target === caja) cierra(); });
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && caja.classList.contains('on') && !editando) cierra();
    });
  }

  const api = {
    abre, cierra, pinta,
    ideas: () => ideas.slice(),
    abierto: () => caja.classList.contains('on'),
    vacia() { ideas = []; guarda(); pinta(); },
  };
  caja.__api = api;
  if (typeof window !== 'undefined') window.MapaTesoro = api;
  return api;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => montaMapa());
  else montaMapa();
}
