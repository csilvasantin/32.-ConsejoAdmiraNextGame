/**
 * GET /api/council/evidence?persona=Jobs|Steve%20Jobs
 * #5088 / FLT-101531 — última captura de evidencia del encargo vivo del consejero
 * (yokup proof_image / process), o «sin actividad» si no hay encargo abierto.
 * Fuentes públicas: mcp.admira.live/consejo/estado + api.yokup.com/fleet/missions.
 */
const ALLOW = new Set([
  "https://www.admira.live",
  "https://admira.live",
  "https://admira-live.pages.dev",
]);
const ESTADO = "https://mcp.admira.live/consejo/estado";
const MISSIONS = "https://api.yokup.com/fleet/missions?status=in_progress";

const ALIAS = {
  jobs: "Jobs",
  "steve jobs": "Jobs",
  wozniak: "Wozniak",
  "steve wozniak": "Wozniak",
  disney: "Disney",
  "walt disney": "Disney",
  lucas: "Lucas",
  "george lucas": "Lucas",
  musk: "Musk",
  "elon musk": "Musk",
  huang: "Huang",
  "jensen huang": "Huang",
};

function cors(origin) {
  const h = {
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Accept",
    "access-control-max-age": "600",
    vary: "Origin",
  };
  if (!origin || ALLOW.has(origin)) h["access-control-allow-origin"] = origin || "*";
  return h;
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, cors(origin)),
  });
}

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function aliasOf(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const key = s.toLowerCase();
  if (ALIAS[key]) return ALIAS[key];
  const last = s.split(/\s+/).pop().toLowerCase();
  return ALIAS[last] || null;
}

function mesaSeat(estado, alias) {
  const mesa = (estado && estado.mesa) || {};
  for (const gen of ["leyendas", "coetaneos"]) {
    for (const s of mesa[gen] || []) {
      const a = aliasOf(s.persona);
      if (a === alias) return s;
    }
  }
  return null;
}

// Agentes de cada silla además de <Alias>GrokBot (consejo/estado).
const CHAIR_AGENTS = { Musk: ["musk", "elon", "merovingio"], Huang: ["huang", "jensen", "cypher"] };
function missionOf(missions, alias) {
  const keys = CHAIR_AGENTS[alias] || [norm(alias)];
  const rows = (missions || []).filter((m) => {
    const who = norm(m.persona || "") + " " + norm(m.assignee || "");
    return keys.some((k) => who.includes(k));
  });
  rows.sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0));
  return rows[0] || null;
}

function imageOf(mission) {
  if (!mission) return { image: null, capturedAt: null };
  const process = String(mission.process_image || (mission.live_kind === "process" ? mission.live_shot : "") || "").trim();
  if (process) {
    let at = Number(mission.process_captured_at || mission.live_at || mission.updated_at || 0);
    if (at && at < 4102444800) at *= 1000;
    return { image: process, capturedAt: at || null };
  }
  const proof = String(mission.proof_image || "").trim();
  if (proof) {
    let at = Number(mission.updated_at || mission.created_at || 0);
    if (at && at < 4102444800) at *= 1000;
    return { image: proof, capturedAt: at || null };
  }
  // task-linked images if the public list ever exposes them
  for (const t of mission.tasks || []) {
    const img = String(t.image || t.proof_image || t.process_image || "").trim();
    if (img) {
      let at = Number(t.updated_at || t.created_at || 0);
      if (at && at < 4102444800) at *= 1000;
      return { image: img, capturedAt: at || null };
    }
  }
  return { image: null, capturedAt: null };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "";
  const url = new URL(request.url);
  const alias = aliasOf(url.searchParams.get("persona") || "");
  if (!alias) return json({ ok: false, error: "unsupported_persona" }, 400, origin);

  // #5113b: cada fuente con su plazo y allSettled — antes un timeout de
  // mcp.admira.live (consejo/estado) tumbaba todo con 502 aunque yokup respondiera.
  const getJson = async (u, ms, extra) => {
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(ms), headers: Object.assign({ accept: "application/json" }, extra || {}) });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
  };
  const [es, ms] = await Promise.allSettled([
    getJson(ESTADO, 6000),
    getJson(MISSIONS, 8000, { "user-agent": "admira-live-evidence" }),
  ]);
  const estado = es.status === "fulfilled" ? es.value : null;
  const missions = ms.status === "fulfilled" && Array.isArray(ms.value && ms.value.missions) ? ms.value.missions : [];
  if (!estado && ms.status !== "fulfilled") {
    return json({ ok: false, error: "upstream_unavailable", persona: alias, live: false, image: null }, 502, origin);
  }

  const seat = mesaSeat(estado, alias);
  const encargo = seat && seat.encargo ? seat.encargo : null;
  const live = !!(encargo && ["pending", "ack", "in_progress", "blocked"].includes(String(encargo.estado || "")));
  const mission = missionOf(missions, alias);
  const { image, capturedAt } = live || mission ? imageOf(mission) : { image: null, capturedAt: null };

  return json({
    ok: true,
    persona: alias,
    live: live || !!(mission && ["open", "in_progress", "assigned"].includes(String(mission.status || ""))),
    encargo: encargo
      ? { numero: encargo.numero, etiqueta: encargo.etiqueta, estado: encargo.estado, titulo: encargo.titulo }
      : null,
    mission: mission ? { id: mission.id, status: mission.status, subject: mission.subject } : null,
    image: image || null,
    capturedAt: capturedAt || null,
    label: !(live || mission) ? "sin actividad" : image ? "evidencia" : "sin captura",
  }, 200, origin);
}
