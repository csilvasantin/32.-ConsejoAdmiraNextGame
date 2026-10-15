/*
 * sillas.js — las sillas de GrokBot con carné, en un solo sitio.
 *
 * De aquí salen la identidad (MCP_KEYS → <Persona>GrokBot), el enum `como`,
 * /salud consejeros_con_carne, el censo de flota.js y el filtro de telegram.js.
 * Un coetáneo nuevo (Shotwell, Porat, Lasseter, Ive, Ratti, Reynolds)
 * se añade en este objeto cuando tenga clave y webhook: el resto lo importa.
 *
 * Musk (Elon Musk, CEO, lado racional, generación coetáneos) no tiene MacBook.
 * `maquina: 'GrokBot'` dice dónde vive el bot. Ese mismo nombre es el equipo
 * de despertar de TODAS las sillas, así que flota.js no lo trata como silla
 * exclusiva al resolver «encargar a esta máquina».
 * Su deepagent es Merovingio (Grok CLI en el Mac Mini desde el 15-10-2026; antes en la GrokBot box): no es Smith.
 *
 * Huang (Jensen Huang, CTO, lado racional, generación coetáneos) tampoco tiene
 * MacBook. Su deepagent es Cypher (DeepAgents en la GrokBot box; modelo
 * nvidia/nemotron-3-ultra-550b-a55b, NVIDIA Nemotron 3 Ultra en
 * integrate.api.nvidia.com). No es ArquitectoCursorCloud.
 *
 * Y (CTO de admira.live, lado racional, generación coetáneos) tampoco tiene
 * MacBook. El 10-oct generó los fondos de las cápsulas con FLUX en el MacBook
 * Pro 16. Entra en el censo del marcador. Sin deepagent publicado y sin
 * webhook: no se inventa ninguno.
 */

export const SILLAS = {
  Wozniak: { rol: 'CTO', lado: 'racional', generacion: 'leyendas',  maquina: 'MacBookAirPlata', fleet_id: 'admira-macbookairplata', alias: ['MBAPlata', 'MBA Plata'] },
  Jobs:    { rol: 'CEO', lado: 'racional', generacion: 'leyendas',  maquina: 'MacBookAirAzul',  fleet_id: 'admira-macbookairazul',  alias: ['MBAAzul', 'MBA Azul', 'Luna', 'admira-macbookairluna'] },
  Lucas:   { rol: 'CSO', lado: 'creativo', generacion: 'leyendas',  maquina: 'MacBookAirRosa',  fleet_id: 'admira-macbookairrosa',  alias: ['MBARosa', 'MBA Rosa'] },
  Disney:  { rol: 'CCO', lado: 'creativo', generacion: 'leyendas',  maquina: 'MacBookAirCrema', fleet_id: 'admira-macbookaircrema', alias: ['MBACrema', 'MBA Crema', 'Carla', 'admira-macbook-carla'] },
  Musk:    { rol: 'CEO', lado: 'racional', generacion: 'coetaneos', maquina: 'GrokBot', fleet_id: '', alias: ['Elon', 'Elon Musk'], deepagent: 'Merovingio', deepagent_maquina: 'MacMini', deepagent_runtime: 'Grok CLI' },
  Huang:   { rol: 'CTO', lado: 'racional', generacion: 'coetaneos', maquina: 'GrokBot', fleet_id: '', alias: ['Jensen', 'Jensen Huang'], deepagent: 'Cypher', deepagent_maquina: 'GrokBotBox', deepagent_runtime: 'DeepAgents', deepagent_model: 'nvidia/nemotron-3-ultra-550b-a55b' },
  Y:       { rol: 'CTO', lado: 'racional', generacion: 'coetaneos', maquina: 'GrokBot', fleet_id: '', alias: [] },
};

/** Orden estable: el de este objeto. Lo consumen yokup, flota y telegram. */
export const CONSEJEROS_GROKBOT = Object.keys(SILLAS);

const plano = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * «Musk», «Elon Musk», «elon» → Musk. «Huang», «Jensen Huang», «jensen» → Huang.
 * «Steve Wozniak» → Wozniak.
 * El apellido corto manda (es la persona del diccionario de yokup). Un alias
 * se compara entero: «elon» es el alias de Musk, no un trozo suelto dentro de otro nombre.
 */
export function sillaCanonica(persona) {
  const crudo = String(persona || '').trim();
  if (!crudo) return null;
  const n = crudo.toLowerCase();
  // Un nombre de una letra («Y») solo casa entero: si no, «Trinity» y «Cypher»
  // contienen esa letra y se los tragaría la silla.
  const porNombre = CONSEJEROS_GROKBOT.find((c) => {
    const clave = c.toLowerCase();
    return n === clave || (clave.length >= 3 && n.includes(clave));
  });
  if (porNombre) return porNombre;
  const p = plano(crudo);
  for (const [nombre, s] of Object.entries(SILLAS)) {
    if ((s.alias || []).some((a) => plano(a) === p)) return nombre;
  }
  return null;
}
