/**
 * Lectura de PRs fusionados para el recuento de hoy (00:00 Europe/Madrid).
 * El Worker llama a api.github.com con User-Agent y Accept que GitHub exige;
 * si hay GITHUB_TOKEN se usa, si no, el repo público sigue siendo legible.
 * El resultado se guarda en KV 8 minutos (entre 5 y 10) para no pasar de
 * 60 peticiones/hora sin autenticar. Si GitHub sigue fallando (p. ej. 403
 * desde el datacenter o 404 de un repo privado sin token), se usa el
 * snapshot que deja tools/consejo-prs-hoy.mjs desde el box, sin inventar.
 */
export const GH = 'https://api.github.com';
export const GH_UA = 'admira-live-consejo';
export const GH_ACCEPT = 'application/vnd.github+json';
export const GH_API_VERSION = '2022-11-28';
export const REPOS_PR = Object.freeze([
  'csilvasantin/32.-ConsejoAdmiraNextGame',
  'csilvasantin/admira-next-web',
]);
export const KEY_PRS = 'consejo:prs-fusionados:v1';
/** Caché del Worker: 8 min, dentro del rango 5–10 que pide el recuento. */
export const CACHE_PRS_S = 8 * 60;
/** Un snapshot del job del box vale hasta 6 h, solo como respaldo del mismo día. */
export const TTL_JOB_S = 6 * 60 * 60;
export const MAX_PAGINAS = 3;

export function cabecerasGithub(token) {
  const h = {
    'User-Agent': GH_UA,
    Accept: GH_ACCEPT,
    'X-GitHub-Api-Version': GH_API_VERSION,
  };
  const t = String(token || '').trim();
  if (t) h.Authorization = 'Bearer ' + t;
  return h;
}

export function tokenGithub(env) {
  const t = String((env && (env.GITHUB_TOKEN || env.GH_TOKEN)) || '').trim();
  return t || null;
}

export function kvDe(env) {
  return (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
}

export function normalizarRepo(repo) {
  return String(repo || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/^\/+/, '');
}

export function normalizarPr(pr, repo) {
  if (!pr || typeof pr !== 'object') return null;
  const number = Number(pr.number);
  if (!Number.isFinite(number) || number <= 0) return null;
  const merged = pr.merged_at || pr.mergedAt || null;
  if (!merged) return null;
  const rama = String(pr.rama || pr.headRefName || (pr.head && (pr.head.ref || pr.head)) || pr.ref || '')
    .replace(/^refs\/heads\//, '');
  return {
    repo: normalizarRepo(repo || pr.repo || pr.repository || ''),
    number,
    title: String(pr.title || ''),
    merged_at: merged,
    rama,
  };
}

export function clavePr(pr) {
  if (!pr) return '';
  const repo = normalizarRepo(pr.repo);
  const n = Number(pr.number);
  return repo && n ? repo + '#' + n : '';
}

export function snapshotPrs({ prs, fuente, ahoraMs, errores, repos_ok } = {}) {
  const lista = (Array.isArray(prs) ? prs : []).map((p) => normalizarPr(p, p && p.repo)).filter(Boolean);
  return {
    actualizado: Number(ahoraMs) || Date.now(),
    fuente: fuente || 'github-api',
    prs: lista,
    repos_ok: repos_ok || {},
    errores: errores && Object.keys(errores).length ? errores : undefined,
  };
}

export function parsearSnapshot(raw) {
  if (raw == null) return null;
  let d = raw;
  if (typeof raw === 'string') {
    try { d = JSON.parse(raw); } catch (e) { return null; }
  }
  if (!d || typeof d !== 'object' || !Array.isArray(d.prs)) return null;
  const prs = d.prs.map((p) => normalizarPr(p, p && p.repo)).filter(Boolean);
  return {
    actualizado: Number(d.actualizado) || 0,
    fuente: d.fuente || 'kv',
    prs,
    repos_ok: d.repos_ok || {},
    errores: d.errores,
  };
}

export function snapshotUsable(snap, { ahoraMs, maxEdadS, diaS } = {}) {
  if (!snap || !Array.isArray(snap.prs)) return false;
  const ahora = Number(ahoraMs) || Date.now();
  if (maxEdadS != null && (!snap.actualizado || (ahora - snap.actualizado) / 1000 > maxEdadS)) return false;
  if (diaS && snap.actualizado && snap.actualizado / 1000 < diaS) return false;
  return true;
}

/** Unión por repo#n. En un mismo repo gana el snapshot que lo ha leído bien (no se mezcla con uno fallido). */
export function fusionarSnapshots(principal, reserva, reposFallidos) {
  const a = parsearSnapshot(principal);
  const b = parsearSnapshot(reserva);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b || !reposFallidos || !reposFallidos.length) return a;
  const fallidos = new Set(reposFallidos.map(normalizarRepo));
  const map = new Map();
  for (const p of a.prs) map.set(clavePr(p), p);
  for (const p of b.prs) {
    if (fallidos.has(normalizarRepo(p.repo))) map.set(clavePr(p), p);
  }
  return snapshotPrs({
    prs: [...map.values()],
    fuente: a.fuente,
    ahoraMs: a.actualizado,
    errores: { ...(b.errores || {}), ...(a.errores || {}) },
    repos_ok: { ...(b.repos_ok || {}), ...(a.repos_ok || {}) },
  });
}

export async function listarPrsRepo(fetchImpl, repo, { token, maxPaginas = MAX_PAGINAS, timeoutMs = 8000 } = {}) {
  const out = [];
  const f = fetchImpl || fetch;
  for (let page = 1; page <= maxPaginas; page++) {
    const url = GH + '/repos/' + repo + '/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=' + page;
    const r = await f(url, { headers: cabecerasGithub(token), signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(r.status + ' en ' + url);
    const lista = await r.json();
    if (!Array.isArray(lista) || lista.length === 0) break;
    for (const pr of lista) {
      const n = normalizarPr(pr, repo);
      if (n) out.push(n);
    }
    if (lista.length < 50) break;
  }
  return out;
}

export async function recogerPrsGithub({ fetchImpl, token, repos = REPOS_PR, timeoutMs = 8000 } = {}) {
  const errores = {};
  const repos_ok = {};
  const partes = await Promise.all((repos || []).map((repo) =>
    listarPrsRepo(fetchImpl, repo, { token, timeoutMs })
      .then((lista) => { repos_ok[repo] = true; return lista; })
      .catch((e) => {
        errores['pr_' + repo] = String(e.message || e);
        repos_ok[repo] = false;
        return null;
      }),
  ));
  if (partes.every((p) => p == null)) {
    return { prs: null, errores, repos_ok, repos_fallidos: repos.slice() };
  }
  return {
    prs: partes.filter(Boolean).flat(),
    errores,
    repos_ok,
    repos_fallidos: Object.entries(repos_ok).filter(([, ok]) => !ok).map(([r]) => r),
  };
}

export async function leerSnapshotKv(store) {
  if (!store || typeof store.get !== 'function') return null;
  try {
    const raw = await store.get(KEY_PRS);
    return parsearSnapshot(raw);
  } catch (e) {
    return null;
  }
}

export async function escribirSnapshotKv(store, snap, ttlS, waitUntil) {
  if (!store || typeof store.put !== 'function' || !snap) return false;
  const ttl = Math.max(60, Number(ttlS) || CACHE_PRS_S);
  const tarea = store.put(KEY_PRS, JSON.stringify(snap), { expirationTtl: ttl });
  try {
    if (waitUntil) waitUntil(Promise.resolve(tarea).catch(() => {}));
    else await tarea;
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 1) KV fresco (≤ 8 min, job o Worker).
 * 2) GitHub (UA + Accept, token si existe).
 * 3) Si un repo falla, se conservan los PRs de ese repo que ya hubiera en KV.
 * 4) Si GitHub falla del todo, KV del mismo día (hasta 6 h), sin inventar.
 */
export async function obtenerPrs({ fetchImpl, env, ahoraMs, waitUntil, kv } = {}) {
  const ahora = Number(ahoraMs) || Date.now();
  const store = kv || kvDe(env);
  const token = tokenGithub(env);
  const cached = await leerSnapshotKv(store);
  if (snapshotUsable(cached, { ahoraMs: ahora, maxEdadS: CACHE_PRS_S })) {
    return {
      prs: cached.prs,
      fuente: (cached.fuente || 'kv') + '+cache',
      cache: true,
      actualizado: cached.actualizado,
      errores: cached.errores,
      repos_ok: cached.repos_ok,
    };
  }
  const r = await recogerPrsGithub({ fetchImpl, token });
  if (r.prs != null) {
    let snap = snapshotPrs({
      prs: r.prs,
      fuente: token ? 'github-api+token' : 'github-api',
      ahoraMs: ahora,
      errores: r.errores,
      repos_ok: r.repos_ok,
    });
    if (r.repos_fallidos && r.repos_fallidos.length && cached) {
      snap = fusionarSnapshots(snap, cached, r.repos_fallidos) || snap;
    }
    await escribirSnapshotKv(store, snap, CACHE_PRS_S, waitUntil);
    return {
      prs: snap.prs,
      fuente: snap.fuente,
      cache: false,
      actualizado: snap.actualizado,
      errores: snap.errores,
      repos_ok: snap.repos_ok,
    };
  }
  if (snapshotUsable(cached, { ahoraMs: ahora, maxEdadS: TTL_JOB_S })) {
    return {
      prs: cached.prs,
      fuente: (cached.fuente || 'kv') + '+kv-stale',
      cache: true,
      actualizado: cached.actualizado,
      errores: { ...(cached.errores || {}), ...(r.errores || {}) },
      repos_ok: cached.repos_ok,
    };
  }
  return {
    prs: null,
    fuente: null,
    cache: false,
    actualizado: null,
    errores: r.errores,
    repos_ok: r.repos_ok,
  };
}

/** El job del box solo escribe una lista real; si no hay PRs leídos, no pisa el KV con un vacío inventado. */
export function snapshotDelJob(body, ahoraMs) {
  const d = parsearSnapshot(body);
  if (!d) return { ok: false, error: 'snapshot inválido: hace falta un array prs' };
  // Lista vacía solo se acepta si todos los repos_ok son true (cero real, no un fallo).
  const oks = Object.values(d.repos_ok || {});
  if (!d.prs.length && !(oks.length && oks.every(Boolean))) {
    return { ok: false, error: 'no se escribe un vacío si algún repo no se ha leído' };
  }
  return {
    ok: true,
    snap: snapshotPrs({
      prs: d.prs,
      fuente: 'box-job',
      ahoraMs: ahoraMs || Date.now(),
      errores: d.errores,
      repos_ok: d.repos_ok,
    }),
  };
}
