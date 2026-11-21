/**
 * Actividad reciente de los deepagents en GitHub (r231 · Carlos, 21-11-2026 20:23: «Trinity publicó en admira.tv hace
 * 14 min y sale sin uso»). Trinity no late, pero sí firma su trabajo: sus ramas llevan su nombre («trinity/…»), igual que
 * Neo («neo/…»), Oráculo y Morfeo. Fuente: eventos públicos de GitHub del dueño de los repos (PR abiertos/fusionados y
 * push a ramas con prefijo de agente). Sin secretos: solo datos públicos. Pura (los tests la usan sin red).
 */
export const AGENTES = { trinity: "Trinity", neo: "Neo", oraculo: "Oráculo", "oráculo": "Oráculo", morfeo: "Morfeo" };

function agenteDeRama(rama) {
  const r = String(rama || "").replace(/^refs\/heads\//, "").toLowerCase();
  const pre = r.split("/")[0];
  return r.includes("/") && AGENTES[pre] ? AGENTES[pre] : null;
}

/** eventos de /users/:u/events/public → { Trinity: { ts, accion, repo, rama, pr }, … } con el más reciente de cada uno. */
export function actividadDeEventos(eventos) {
  const out = {};
  for (const e of Array.isArray(eventos) ? eventos : []) {
    if (!e || !e.created_at || !e.repo) continue;
    const p = e.payload || {};
    let rama = null, accion = null, pr = null;
    if (e.type === "PullRequestEvent" && p.pull_request) {
      rama = p.pull_request.head && p.pull_request.head.ref;
      accion = p.action === "closed" && p.pull_request.merged ? "merged" : p.action;
      pr = p.pull_request.number || p.number || null;
    } else if (e.type === "PushEvent" || e.type === "CreateEvent") {
      rama = e.type === "CreateEvent" ? (p.ref_type === "branch" ? p.ref : null) : p.ref;
      accion = e.type === "PushEvent" ? "push" : "rama creada";
    }
    const agente = agenteDeRama(rama);
    if (!agente) continue;
    const ts = Date.parse(e.created_at);
    if (!isFinite(ts)) continue;
    if (!out[agente] || out[agente].ts < ts) out[agente] = { ts, hora: new Date(ts).toISOString(), accion, repo: String(e.repo.name || "").split("/").pop(), rama: String(rama).replace(/^refs\/heads\//, ""), pr };
  }
  return out;
}
