/** #5670: coste del proveedor declarado por la presencia, independiente del pagador/plan r6.
 * Una etiqueta Nemotron, DeepAgents u OpenCode, por sí sola, no prueba gratuidad.
 */
const normaliza = (s) => String(s || '').trim().toLowerCase();
const canonico = (s) => {
  const p = normaliza(s).replace(/[\s_-]+/g, '');
  return ({ openrouter: 'OpenRouter', nvidianim: 'NVIDIA NIM', nvidia: 'NVIDIA NIM', nim: 'NVIDIA NIM',
    opencode: 'OpenCode', opencodezen: 'OpenCode', xai: 'xAI', grok: 'xAI', grokcli: 'xAI', grokbot: 'xAI',
    openai: 'OpenAI', codex: 'OpenAI', anthropic: 'Anthropic', claude: 'Anthropic' })[p] || null;
};
export function costeDePresencia(fila = {}) {
  const model = normaliza(fila.model || fila.modelo);
  const runtime = normaliza(fila.runtime);
  const declarado = String(fila.proveedor || fila.provider || '').trim();
  let proveedor = null, fuente_coste = 'sin proveedor reconocido';
  if (declarado) { proveedor = canonico(declarado); fuente_coste = 'proveedor declarado'; }
  else if (/^(openai:|openrouter[:/])/.test(model)) { proveedor = 'OpenRouter'; fuente_coste = 'prefijo del modelo'; }
  else if (/^nvidia[:/]/.test(model)) { proveedor = /:free$/.test(model) ? 'OpenRouter' : 'NVIDIA NIM'; fuente_coste = 'prefijo del modelo'; }
  else if (/^opencode[:/]/.test(model)) { proveedor = 'OpenCode'; fuente_coste = 'prefijo del modelo'; }
  else if (/^(codex|claude|grok)/.test(runtime)) { proveedor = canonico(runtime.split(/[ (]/)[0]); fuente_coste = 'runtime'; }
  else if (/^opencode/.test(runtime) && /-free$/.test(model)) { proveedor = 'OpenCode'; fuente_coste = 'runtime y modelo -free'; }
  else if (/^(openai\/|gpt[- ]|o[134][- ])/.test(model)) { proveedor = 'OpenAI'; fuente_coste = 'modelo del proveedor'; }
  else if (/^(anthropic[:/]|claude[- ])/.test(model)) { proveedor = 'Anthropic'; fuente_coste = 'modelo del proveedor'; }
  else if (/^(xai[:/]|grok[- ])/.test(model)) { proveedor = 'xAI'; fuente_coste = 'modelo del proveedor'; }
  let coste = 'desconocido';
  if (proveedor === 'OpenRouter' && model) coste = /:free$/.test(model) ? 'gratis' : 'pago';
  else if (proveedor === 'NVIDIA NIM') coste = 'gratis';
  else if (proveedor === 'OpenCode' && model) coste = /-free$/.test(model) ? 'gratis' : 'pago';
  else if (['xAI', 'OpenAI', 'Anthropic'].includes(proveedor)) coste = 'pago';
  return { proveedor: proveedor || declarado || 'desconocido', coste, distintivo: coste.toUpperCase(), fuente_coste };
}
/** Resumen de varias superficies: nunca oculta pago ni atribuye gratis a datos incompletos. */
export function costeConjunto(instancias = []) {
  return instancias.some((i) => i.coste === 'pago') ? 'pago' :
    !instancias.length || instancias.some((i) => i.coste !== 'gratis') ? 'desconocido' : 'gratis';
}
