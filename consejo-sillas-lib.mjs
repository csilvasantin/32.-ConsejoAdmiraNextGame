/**
 * Mapa canónico de las 16 sillas del Consejo de Silicio (8 roles × 2 generaciones).
 * Fuente única para ask, sesión autónoma, MCP y entre-consejeros.
 * Nombres: Carlo Ratti (no Carlos), Mira Murati es COO coetánea; Gwynne Shotwell ya no está en la mesa.
 */
export const ROLES = Object.freeze(['CEO', 'CTO', 'COO', 'CFO', 'CCO', 'CDO', 'CXO', 'CSO']);
export const GENERACIONES = Object.freeze(['leyendas', 'coetaneos']);

export const CONSEJEROS = Object.freeze([
  { rol: 'CEO', cargo: 'Chief Executive Officer', lado: 'racional', leyendas: 'Steve Jobs', coetaneos: 'Elon Musk' },
  { rol: 'CTO', cargo: 'Chief Technology Officer', lado: 'racional', leyendas: 'Steve Wozniak', coetaneos: 'Jensen Huang' },
  { rol: 'COO', cargo: 'Chief Operations Officer', lado: 'racional', leyendas: 'Tim Cook', coetaneos: 'Mira Murati' },
  { rol: 'CFO', cargo: 'Chief Financial Officer', lado: 'racional', leyendas: 'Warren Buffett', coetaneos: 'Ruth Porat' },
  { rol: 'CCO', cargo: 'Chief Creative Officer', lado: 'creativo', leyendas: 'Walt Disney', coetaneos: 'John Lasseter' },
  { rol: 'CDO', cargo: 'Chief Design Officer', lado: 'creativo', leyendas: 'Dieter Rams', coetaneos: 'Jony Ive' },
  { rol: 'CXO', cargo: 'Chief Experience Officer', lado: 'creativo', leyendas: 'Howard Schultz', coetaneos: 'Carlo Ratti' },
  { rol: 'CSO', cargo: 'Chief Storytelling Officer', lado: 'creativo', leyendas: 'George Lucas', coetaneos: 'Ryan Reynolds' },
]);

/** Clave corta de silla para hilos / entre-consejeros / GrokBot. */
export const SILLA_CLAVE = Object.freeze({
  'Steve Jobs': 'Jobs',
  'Steve Wozniak': 'Wozniak',
  'Tim Cook': 'Cook',
  'Warren Buffett': 'Buffett',
  'Walt Disney': 'Disney',
  'Dieter Rams': 'Rams',
  'Howard Schultz': 'Schultz',
  'George Lucas': 'Lucas',
  'Elon Musk': 'Musk',
  'Jensen Huang': 'Huang',
  'Mira Murati': 'Murati',
  'Ruth Porat': 'Porat',
  'John Lasseter': 'Lasseter',
  'Jony Ive': 'Ive',
  'Carlo Ratti': 'Ratti',
  'Ryan Reynolds': 'Reynolds',
});

const ALIAS = Object.freeze({
  jobs: 'Steve Jobs', stevejobs: 'Steve Jobs', steve: 'Steve Jobs',
  wozniak: 'Steve Wozniak', woz: 'Steve Wozniak', stevewozniak: 'Steve Wozniak',
  cook: 'Tim Cook', timcook: 'Tim Cook', tim: 'Tim Cook',
  buffett: 'Warren Buffett', warrenbuffett: 'Warren Buffett', warren: 'Warren Buffett',
  disney: 'Walt Disney', waltdisney: 'Walt Disney', walt: 'Walt Disney',
  rams: 'Dieter Rams', dieter: 'Dieter Rams', dierrams: 'Dieter Rams',
  schultz: 'Howard Schultz', howard: 'Howard Schultz', howardschultz: 'Howard Schultz',
  lucas: 'George Lucas', georgelucas: 'George Lucas', george: 'George Lucas',
  musk: 'Elon Musk', elon: 'Elon Musk', elonmusk: 'Elon Musk',
  huang: 'Jensen Huang', jensen: 'Jensen Huang', jensenhuang: 'Jensen Huang',
  murati: 'Mira Murati', mira: 'Mira Murati', miramurati: 'Mira Murati',
  porat: 'Ruth Porat', ruth: 'Ruth Porat', ruthporat: 'Ruth Porat',
  lasseter: 'John Lasseter', johnlasseter: 'John Lasseter', john: 'John Lasseter',
  ive: 'Jony Ive', jony: 'Jony Ive', jonyive: 'Jony Ive',
  ratti: 'Carlo Ratti', carlo: 'Carlo Ratti', carloratti: 'Carlo Ratti',
  // typo histórico en consejo_bots: no redirigir «Carlos Silva».
  carlosratti: 'Carlo Ratti',
  reynolds: 'Ryan Reynolds', ryan: 'Ryan Reynolds', ryanreynolds: 'Ryan Reynolds',
});

const plano = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function listarConsejeros(generacion) {
  const gens = generacion ? [generacion] : GENERACIONES;
  const out = [];
  for (const g of gens) {
    for (const c of CONSEJEROS) {
      const persona = c[g];
      out.push({
        rol: c.rol, cargo: c.cargo, lado: c.lado, generacion: g, persona,
        silla: SILLA_CLAVE[persona],
        ficha: `https://www.admira.live/consejero.html?p=${persona.toLowerCase().replace(/\s+/g, '-')}`,
      });
    }
  }
  return out;
}

export function fichaDe(personaORol, generacion) {
  const gen = GENERACIONES.includes(generacion) ? generacion : null;
  const nombre = personaCanonica(personaORol);
  if (nombre) {
    const g = gen || generacionDe(nombre);
    const fila = CONSEJEROS.find((c) => c[g] === nombre);
    if (!fila) return null;
    return {
      rol: fila.rol, cargo: fila.cargo, lado: fila.lado, generacion: g, persona: nombre,
      silla: SILLA_CLAVE[nombre],
      ficha: `https://www.admira.live/consejero.html?p=${nombre.toLowerCase().replace(/\s+/g, '-')}`,
    };
  }
  const rol = String(personaORol || '').toUpperCase();
  if (gen && ROLES.includes(rol)) {
    const fila = CONSEJEROS.find((c) => c.rol === rol);
    const persona = fila[gen];
    return {
      rol: fila.rol, cargo: fila.cargo, lado: fila.lado, generacion: gen, persona,
      silla: SILLA_CLAVE[persona],
      ficha: `https://www.admira.live/consejero.html?p=${persona.toLowerCase().replace(/\s+/g, '-')}`,
    };
  }
  return null;
}

export function personaCanonica(texto) {
  const crudo = String(texto || '').trim();
  if (!crudo) return null;
  if (SILLA_CLAVE[crudo]) return crudo;
  const p = plano(crudo);
  if (ALIAS[p]) return ALIAS[p];
  const porClave = Object.entries(SILLA_CLAVE).find(([, k]) => plano(k) === p);
  if (porClave) return porClave[0];
  const porNombre = Object.keys(SILLA_CLAVE).find((n) => plano(n) === p);
  return porNombre || null;
}

export function generacionDe(persona) {
  const n = personaCanonica(persona);
  if (!n) return null;
  const fila = CONSEJEROS.find((c) => c.leyendas === n || c.coetaneos === n);
  if (!fila) return null;
  return fila.leyendas === n ? 'leyendas' : 'coetaneos';
}

export function rolDe(persona) {
  const n = personaCanonica(persona);
  if (!n) return null;
  const fila = CONSEJEROS.find((c) => c.leyendas === n || c.coetaneos === n);
  return fila ? fila.rol : null;
}

export function personasDe(generacion) {
  return CONSEJEROS.map((c) => c[generacion]);
}

/** Claves de entre-consejeros (sillas con hilo o bandeja). Incluye Lasseter, Ive, Murati, Reynolds. */
export const ENTRE_CONSEJEROS = Object.freeze({
  jobs: 'Jobs', wozniak: 'Wozniak', lucas: 'Lucas', disney: 'Disney',
  musk: 'Musk', elon: 'Musk', huang: 'Huang', jensen: 'Huang',
  lasseter: 'Lasseter', ive: 'Ive', jony: 'Ive',
  murati: 'Murati', mira: 'Murati',
  reynolds: 'Reynolds', ryan: 'Reynolds',
  cook: 'Cook', buffett: 'Buffett', rams: 'Rams', schultz: 'Schultz',
  porat: 'Porat', ratti: 'Ratti', carlo: 'Ratti',
  y: 'Y',
});
