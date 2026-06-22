#!/usr/bin/env node
/* ============================================================================
 * backup-gateway — multiplexor del RESPALDO del Consejo en este Mac
 * ----------------------------------------------------------------------------
 * El Mac Mini (hub) sirve en su funnel raíz varios backends. Aquí, como el `/`
 * del funnel de este Mac ya está ocupado, exponemos un ÚNICO puerto de funnel
 * (10000) → este gateway, que reparte por prefijo de ruta, conservando la MISMA
 * estructura que el Mini para que la web pueda hacer failover solo cambiando
 * el host:puerto base:
 *
 *   /fleet/*    → 127.0.0.1:9140  (fleet-control)
 *   /council/*  → 127.0.0.1:8077  (council-api.py, si está levantado)
 *   resto       → 127.0.0.1:3030  (node del Consejo: /api/*, /proofs/*, …)
 *
 * Sin dependencias. Arrancar:  node fleet-control/backup-gateway.js
 * ========================================================================== */
'use strict';
const http = require('http');

const PORT = parseInt(process.env.GW_PORT || '8088', 10);
const ROUTES = [
  { prefix: '/fleet', target: { host: '127.0.0.1', port: parseInt(process.env.FLEET_PORT || '9140', 10) } },
  { prefix: '/council', target: { host: '127.0.0.1', port: parseInt(process.env.COUNCIL_PY_PORT || '8077', 10) } },
];
const DEFAULT = { host: '127.0.0.1', port: parseInt(process.env.NODE_PORT || '3030', 10) };

function pick(path) {
  for (const r of ROUTES) if (path === r.prefix || path.startsWith(r.prefix + '/')) return r.target;
  return DEFAULT;
}

const server = http.createServer((req, res) => {
  // salud propia del gateway (sin proxy)
  if (req.url === '/__gw/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'backup-gateway', routes: ROUTES.map(r => r.prefix), default: DEFAULT.port }));
  }
  const target = pick(req.url.split('?')[0]);
  const opts = {
    host: target.host, port: target.port, method: req.method, path: req.url,
    headers: { ...req.headers, host: target.host + ':' + target.port },
  };
  const up = http.request(opts, (ur) => {
    res.writeHead(ur.statusCode || 502, ur.headers);
    ur.pipe(res);
  });
  up.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'backend no disponible', backend: target.port, detail: String(e.message || e) }));
  });
  up.setTimeout(30000, () => { up.destroy(new Error('timeout')); });
  req.pipe(up);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[backup-gateway] 127.0.0.1:' + PORT + ' → fleet:9140 council:8077 node:3030');
});
