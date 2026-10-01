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
 * Su deepagent es Merovingio (Grok CLI en la GrokBot box): no es Smith.
 *
 * Huang (Jensen Huang, CTO, lado racional, generación coetáneos) tampoco tiene
 * MacBook. Su deepagent es Cypher (DeepAgents en la GrokBot box; modelo
 * nvidia/nemotron-3-ultra-550b-a55b, NVIDIA Nemotron 3 Ultra en
 * integrate.api.nvidia.com). No es ArquitectoCursorCloud.
 */

export const SILLAS = {
  Wozniak: { rol: 'CTO', lado: 'racional', generacion: 'leyendas',  maquina: 'MacBookAirPlata', fleet_id: 'admira-macbookairplata', alias: ['MBAPlata', 'MBA Plata'] },
  Jobs:    { rol: 'CEO', lado: 'racional', generacion: 'leyendas',  maquina: 'MacBookAirAzul',  fleet_id: 'admira-macbookairazul',  alias: ['MBAAzul', 'MBA Azul', 'Luna', 'admira-macbookairluna'] },
  Lucas:   { rol: 'CSO', lado: 'creativo', generacion: 'leyendas',  maquina: 'MacBookAirRosa',  fleet_id: 'admira-macbookairrosa',  alias: ['MBARosa', 'MBA Rosa'] },
  Disney:  { rol: 'CCO', lado: 'creativo', generacion: 'leyendas',  maquina: 'MacBookAirCrema', fleet_id: 'admira-macbookaircrema', alias: ['MBACrema', 'MBA Crema', 'Carla', 'admira-macbook-carla'] },
  Musk:    { rol: 'CEO', lado: 'racional', generacion: 'coetaneos', maquina: 'GrokBot', fleet_id: '', alias: ['Elon', 'Elon Musk'], deepagent: 'Merovingio', deepagent_maquina: 'GrokBotBox', deepagent_runtime: 'Grok CLI' },
  Huang:   { rol: 'CTO', lado: 'racional', generacion: 'coetaneos', maquina: 'GrokBot', fleet_id: '', alias: ['Jensen', 'Jensen Huang'], deepagent: 'Cypher', deepagent_maquina: 'GrokBotBox', deepagent_runtime: 'DeepAgents', deepagent_model: 'nvidia/nemotron-3-ultra-550b-a55b' },
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
  const porNombre = CONSEJEROS_GROKBOT.find((c) => n === c.toLowerCase() || n.includes(c.toLowerCase()));
  if (porNombre) return porNombre;
  const p = plano(crudo);
  for (const [nombre, s] of Object.entries(SILLAS)) {
    if ((s.alias || []).some((a) => plano(a) === p)) return nombre;
  }
  return null;
}
