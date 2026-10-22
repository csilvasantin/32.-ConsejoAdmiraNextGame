import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

// Extrae el cuerpo de una función por nombre (llaves balanceadas).
function body(name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'falta ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(j, k + 1);
  }
}

function montar() {
  const COUNCIL = [
    { name: 'CEO', persona: 'Steve Jobs', gen: 'leyendas' },
    { name: 'CTO', persona: 'Steve Wozniak', gen: 'leyendas' },
    { name: 'CEO', persona: 'Elon Musk', gen: 'coetaneos' },
    { name: 'CTO', persona: 'Jensen Huang', gen: 'coetaneos' },
  ];
  const st = { currentGen: 'coetaneos', selectedAgent: null, html: '', lang: 'es' };
  const f = new Function('COUNCIL', 'st', `
    let agentePorDefecto = false;
    const cliT = (es, en) => st.lang === 'en' ? en : es;
    const _slEsc = s => String(s);
    const setSentenceHtml = h => { st.html = h.replace(/<[^>]+>/g, ''); };
    const setActionLine = t => { st.html = t; };
    function selectAgentByPersona(persona) {
      const agent = COUNCIL.find(m => m.gen === st.currentGen && m.persona === persona);
      if (!agent) return;
      agentePorDefecto = false;
      st.selectedAgent = agent;
    }
    function ceoDeMesa(gen) ${body('ceoDeMesa')}
    function elegirCeoPorDefecto() ${body('elegirCeoPorDefecto').replace(/currentGen/g, 'st.currentGen')}
    function cambiaMesa(gen) {
      st.currentGen = gen;
      const selectedAgent = st.selectedAgent, preguntarMode = true, currentVerb = 'preguntar';
      if (preguntarMode && currentVerb === 'preguntar' && (agentePorDefecto || !selectedAgent || selectedAgent.gen !== gen)) elegirCeoPorDefecto();
    }
    return { elegirCeoPorDefecto, selectAgentByPersona, cambiaMesa };
  `);
  return { st, api: f(COUNCIL, st) };
}

test('sin selección pregunta al CEO de la mesa activa y lo nombra', () => {
  const { st, api } = montar();
  api.elegirCeoPorDefecto();
  assert.equal(st.selectedAgent.persona, 'Elon Musk');
  assert.match(st.html, /^Preguntar a Elon Musk/);
});

test('al cambiar de mesa sin elección, el CEO por defecto cambia con ella', () => {
  const { st, api } = montar();
  st.lang = 'en';
  api.elegirCeoPorDefecto();
  api.cambiaMesa('leyendas');
  assert.equal(st.selectedAgent.persona, 'Steve Jobs');
  assert.match(st.html, /^Ask Steve Jobs/);
});

test('un clic en otro consejero se respeta al repintar', () => {
  const { st, api } = montar();
  api.elegirCeoPorDefecto();
  api.selectAgentByPersona('Jensen Huang');
  api.cambiaMesa('coetaneos');
  assert.equal(st.selectedAgent.persona, 'Jensen Huang');
});

test('app.js llama al CEO por defecto al entrar en Preguntar y al cambiar de mesa', () => {
  assert.match(body('enterPreguntarMode'), /elegirCeoPorDefecto\(\)/);
  assert.match(body('setGen'), /agentePorDefecto[^\n]*elegirCeoPorDefecto\(\)/);
  assert.match(body('selectAgentByPersona'), /agentePorDefecto = false/);
});
