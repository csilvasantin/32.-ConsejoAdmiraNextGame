/**
 * Recuadro de conversación entre dos consejeros (12-11-2026, Carlos).
 * Agrupa mensajes seguidos del mismo par, hora de inicio y de fin de la
 * conversación, hora de cada frase en el color del hablante, y detecta el
 * hablante real cuando un mensaje EN DIRECTO se firmó con la clave de otro
 * (p. ej. de=Musk con «Hola, Carlos, soy Steve Jobs»).
 */
import {
  sillaDe, nombreDe, horaMadrid, textoFraseVisible, esFraseDirecto,
  textoDe, tsDe, esAgente, LEYENDAS, COETANEOS,
} from "./sala-voz-lib.mjs";

export const COLOR = Object.freeze({
  Musk: "#39f",
  Jobs: "#f93",
  Huang: "#76b900",
  Wozniak: "#4ec3e0",
  Disney: "#e23d28",
  Lucas: "#f5c518",
  Cook: "#a2aaad",
  Buffett: "#c5a000",
  Rams: "#c65d3a",
  Schultz: "#00704a",
  Ive: "#8aa0b3",
  Shotwell: "#ee6524",
  Murati: "#9b7dff",
  Porat: "#3db8c5",
  Lasseter: "#ff8ec6",
  Ratti: "#5cc8ff",
  Reynolds: "#e23b4c",
  Y: "#e8e8e8",
});

const CORTO = Object.freeze({
  Musk: "Elon", Huang: "Jensen", Wozniak: "Woz",
});

export function cortoDe(s) {
  const k = sillaDe(s);
  if (!k) return String(s || "");
  return CORTO[k] || k;
}

export function colorDe(s) {
  const k = sillaDe(s);
  return (k && COLOR[k]) || "#d0d0d0";
}

export function esConsejeroSilla(s) {
  const k = sillaDe(s);
  return !!(k && (LEYENDAS.includes(k) || COETANEOS.includes(k) || k === "Y"));
}

/** Hablante declarado en el texto («soy Steve Jobs», «Jobs:» al inicio). */
export function detectarHablante(texto) {
  const t = textoFraseVisible(texto);
  if (!t) return "";
  const soy = t.match(/\bsoy\s+([^.,;:!?]+)/i);
  if (soy) {
    const s = sillaDe(soy[1].trim());
    if (s) return s;
  }
  const etiqueta = t.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,3})\s*:\s/);
  if (etiqueta) {
    const s = sillaDe(etiqueta[1].trim());
    if (s) return s;
  }
  return "";
}

export function hablanteDe(m) {
  const det = detectarHablante(textoDe(m));
  if (det) return det;
  return sillaDe(m && m.de) || "";
}

export function interlocutorDe(m) {
  const h = hablanteDe(m);
  const de = sillaDe(m && m.de);
  const para = sillaDe(m && m.para);
  if (para && para !== h) return para;
  if (de && de !== h) return de;
  return para || de || "";
}

export function parClave(m) {
  const h = hablanteDe(m);
  const de = sillaDe(m && m.de);
  const para = sillaDe(m && m.para);
  const s = [...new Set([h, de, para].filter((x) => x && esConsejeroSilla(x)))].sort();
  if (s.length >= 2) return s[0] + "|" + s[1];
  return s[0] || "";
}

export function esDialogoConsejeros(m) {
  if (!m || esAgente(m)) return false;
  if (!textoFraseVisible(textoDe(m))) return false;
  const s = new Set([hablanteDe(m), sillaDe(m.de), sillaDe(m.para)].filter((x) => esConsejeroSilla(x)));
  return s.size >= 2;
}

export function fraseVista(m) {
  const h = hablanteDe(m);
  return {
    id: m && m.id,
    hablante: h,
    nombre: nombreDe(h),
    corto: cortoDe(h),
    color: colorDe(h),
    hora: horaMadrid(tsDe(m)),
    texto: textoFraseVisible(textoDe(m)),
    directo: esFraseDirecto(textoDe(m), m),
    para: interlocutorDe(m),
    mensaje: m,
  };
}

function cerrarGrupo(g) {
  if (!g) return g;
  g.horaDesde = horaMadrid(g.desde);
  g.horaHasta = horaMadrid(g.hasta);
  g.titulo = (g.par || "").split("|").filter(Boolean).map(cortoDe).join(" ↔ ");
  g.frases = (g.mensajes || []).map(fraseVista);
  return g;
}

/** Agrupa mensajes sueltos (array de mensajes entre consejeros). */
export function agruparConversaciones(mensajes) {
  const grupos = [];
  for (const m of mensajes || []) {
    if (!esDialogoConsejeros(m)) {
      if (m) grupos.push({ tipo: "suelto", mensajes: [m], frases: [fraseVista(m)] });
      continue;
    }
    const par = parClave(m);
    const last = grupos[grupos.length - 1];
    const ts = tsDe(m);
    if (last && last.tipo === "grupo" && last.par === par) {
      last.mensajes.push(m);
      if (ts) last.hasta = ts;
    } else {
      grupos.push({
        tipo: "grupo",
        par,
        mensajes: [m],
        desde: ts,
        hasta: ts,
      });
    }
  }
  return grupos.map((g) => (g.tipo === "grupo" ? cerrarGrupo(g) : g));
}

/**
 * Agrupa los ítems {tipo:'entre', m} consecutivos del mismo par
 * en el mix de mergePorHora (hilo + transcripción).
 */
export function agruparMix(mix) {
  const out = [];
  for (const it of mix || []) {
    if (!it || it.tipo !== "entre" || !esDialogoConsejeros(it.m)) {
      out.push(it);
      continue;
    }
    const par = parClave(it.m);
    const last = out[out.length - 1];
    const ts = (it.ts != null ? it.ts : tsDe(it.m)) || 0;
    if (last && last.tipo === "grupo" && last.par === par) {
      last.mensajes.push(it.m);
      if (ts) last.hasta = ts;
    } else {
      out.push({
        tipo: "grupo",
        par,
        mensajes: [it.m],
        desde: ts,
        hasta: ts,
        ts,
      });
    }
  }
  return out.map((it) => (it && it.tipo === "grupo" ? cerrarGrupo(it) : it));
}

export {
  sillaDe, nombreDe, horaMadrid, textoFraseVisible, esFraseDirecto, textoDe, tsDe,
};
