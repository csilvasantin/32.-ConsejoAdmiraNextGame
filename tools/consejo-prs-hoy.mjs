#!/usr/bin/env node
/**
 * Job del box: lee los PRs fusionados de hoy en
 * csilvasantin/32.-ConsejoAdmiraNextGame (público) y
 * csilvasantin/admira-next-web (privado) y los escribe en KV
 * vía POST /api/consejo/prs-hoy.
 *
 * Idempotente: cada ejecución pisa con la lista real del momento.
 * Si un repo no se puede leer, no se escribe un vacío inventado.
 * No imprime tokens. Usa `gh api` (sesión local) o, si no hay gh,
 * api.github.com con User-Agent admira-live-consejo (el repo privado
 * quedará fuera si no hay token, y no se inventa).
 *
 * Uso:
 *   node tools/consejo-prs-hoy.mjs [--dry-run] [--url https://www.admira.live]
 *
 * Token de escritura: ~/.config/admira/consumos-lecturas.token
 * (el mismo CONSUMOS_LECTURAS_TOKEN / TOKEN_CONSEJO_SILICIO).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  REPOS_PR, cabecerasGithub, recogerPrsGithub, snapshotPrs, snapshotDelJob, normalizarPr,
} from '../consejo-prs-lib.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(homedir(), '.config/admira/consumos-lecturas.token');

function args() {
  const out = { dry: false, url: 'https://www.admira.live' };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dry-run') out.dry = true;
    else if (a[i] === '--url' && a[i + 1]) out.url = a[++i].replace(/\/$/, '');
  }
  return out;
}

function tokenConsejo() {
  if (!existsSync(TOKEN_PATH)) return null;
  const t = readFileSync(TOKEN_PATH, 'utf8').trim();
  return t || null;
}

function ghApi(pathname) {
  const r = spawnSync('gh', ['api', pathname, '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: admira-live-consejo'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'gh api falló').trim().split('\n')[0];
    throw new Error((r.status === 127 ? 'gh no está' : err) + ' (' + pathname + ')');
  }
  return JSON.parse(r.stdout);
}

function ghDisponible() {
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  return r.status === 0;
}

async function recogerConGh(repos) {
  const errores = {};
  const repos_ok = {};
  const partes = [];
  for (const repo of repos) {
    try {
      const acc = [];
      for (let page = 1; page <= 3; page++) {
        const lista = ghApi('repos/' + repo + '/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=' + page);
        if (!Array.isArray(lista) || lista.length === 0) break;
        for (const pr of lista) {
          const n = normalizarPr(pr, repo);
          if (n) acc.push(n);
        }
        if (lista.length < 50) break;
      }
      repos_ok[repo] = true;
      partes.push(acc);
    } catch (e) {
      errores['pr_' + repo] = String(e.message || e);
      repos_ok[repo] = false;
      partes.push(null);
    }
  }
  if (partes.every((p) => p == null)) return { prs: null, errores, repos_ok };
  return { prs: partes.filter(Boolean).flat(), errores, repos_ok };
}

async function main() {
  const opt = args();
  const ahora = Date.now();
  const viaGh = ghDisponible();
  const r = viaGh
    ? await recogerConGh(REPOS_PR)
    : await recogerPrsGithub({ fetchImpl: fetch, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null });
  if (r.prs == null) {
    console.error('no se ha leído ningún repo; no se escribe (no se inventa un 0)');
    for (const [k, v] of Object.entries(r.errores || {})) console.error(k + ': ' + v);
    process.exit(1);
  }
  const snap = snapshotPrs({
    prs: r.prs,
    fuente: 'box-job',
    ahoraMs: ahora,
    errores: r.errores,
    repos_ok: r.repos_ok,
  });
  const chequeo = snapshotDelJob(snap, ahora);
  if (!chequeo.ok) {
    console.error(chequeo.error);
    process.exit(1);
  }
  const porRepo = {};
  for (const p of snap.prs) {
    porRepo[p.repo] = (porRepo[p.repo] || 0) + 1;
  }
  console.log('leídos', snap.prs.length, 'PRs con merged_at (aún sin filtrar el día) vía', viaGh ? 'gh' : 'api.github.com');
  for (const repo of REPOS_PR) {
    console.log(' ', repo, r.repos_ok[repo] ? 'ok · ' + (porRepo[repo] || 0) : 'FALLO · ' + (r.errores['pr_' + repo] || ''));
  }
  if (opt.dry) {
    console.log('--dry-run: no se POST');
    return;
  }
  const token = tokenConsejo();
  if (!token) {
    console.error('falta ' + TOKEN_PATH + ' (CONSUMOS_LECTURAS_TOKEN); no se escribe');
    process.exit(1);
  }
  const res = await fetch(opt.url + '/api/consejo/prs-hoy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Council-Token': token },
    body: JSON.stringify(chequeo.snap),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error('POST ' + res.status + ' ' + (body.error || res.statusText));
    process.exit(1);
  }
  console.log('escrito en KV · n=' + body.n + ' · fuente=' + body.fuente + ' · actualizado=' + body.actualizado);
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
