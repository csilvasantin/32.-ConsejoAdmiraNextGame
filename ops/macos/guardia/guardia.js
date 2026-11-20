// Guardia AdmiraNeXT: Funnel (Tailscale-Funnel-Request) exige X-Admira-Hub; tailnet pasa.
const http = require("http"), net = require("net"), fs = require("fs"), crypto = require("crypto"), path = require("path");
const KEYFILE = path.join(process.env.HOME, ".fleet/hub-guardia.key");
const LOG = path.join(process.env.HOME, "guardia/guardia.log");
let KEY = Buffer.from(fs.readFileSync(KEYFILE, "utf8").trim());
fs.watchFile(KEYFILE, { interval: 5000 }, () => { try { KEY = Buffer.from(fs.readFileSync(KEYFILE, "utf8").trim()); } catch {} });
// mount -> [host, port, prefijoUpstream]  (replica exacta del serve original)
const RUTAS = {
  "/__root": [18789, ""], "/claw-gateway": [18789, ""], "/api": [3030, "/api"], "/proofs": [3030, "/proofs"],
  "/demo": [3032, ""], "/council": [8420, ""], "/pixtube": [8420, ""], "/suno": [3777, ""], "/admira": [9132, ""],
};
let n = 0, denied = 0;
function log(s) { try { const st = fs.statSync(LOG); if (st.size > 5e6) fs.renameSync(LOG, LOG + ".1"); } catch {} fs.appendFile(LOG, new Date().toISOString() + " " + s + "\n", () => {}); }
function ok(h) {
  if (!h["tailscale-funnel-request"]) return true; // tailnet
  const v = h["x-admira-hub"]; if (!v) return false;
  const b = Buffer.from(String(v)); return b.length === KEY.length && crypto.timingSafeEqual(b, KEY);
}
function destino(url) {
  const m = url.match(/^(\/[^/?#]+)(.*)$/); if (!m || !RUTAS[m[1]]) return null;
  const [port, pre] = RUTAS[m[1]]; let rest = m[2] || "/"; if (rest[0] === "?") rest = "/" + rest;
  return { port, path: (pre + rest) || "/", mount: m[1] };
}
function limpiar(h) { const o = { ...h }; delete o["x-admira-hub"]; return o; }
const srv = http.createServer((req, res) => {
  const d = destino(req.url);
  if (!d) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
  if (!ok(req.headers)) { denied++; log(`DENY ${req.method} ${d.mount}`); res.writeHead(401, { "content-type": "text/plain", "cache-control": "no-store" }); return res.end("unauthorized"); }
  const up = http.request({ host: "127.0.0.1", port: d.port, method: req.method, path: d.path, headers: limpiar(req.headers) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on("error", () => { if (!res.headersSent) { res.writeHead(502, { "content-type": "text/plain" }); } res.end("bad gateway"); });
  req.pipe(up);
});
srv.on("upgrade", (req, sock, head) => {
  const d = destino(req.url);
  if (!d || !ok(req.headers)) { denied++; log(`DENY WS ${req.url.split("?")[0].slice(0, 40)}`); sock.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); return; }
  const up = net.connect(d.port, "127.0.0.1", () => {
    const h = limpiar(req.headers); let s = `${req.method} ${d.path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(h)) for (const x of [].concat(v)) s += `${k}: ${x}\r\n`;
    up.write(s + "\r\n"); if (head && head.length) up.write(head); up.pipe(sock); sock.pipe(up);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
srv.listen(9161, "127.0.0.1", () => log("guardia arriba :9161"));
