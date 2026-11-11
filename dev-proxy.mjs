#!/usr/bin/env node
/**
 * Dev proxy #7546 — sirve la rama local y reenvía /api/* y /auth/* a producción.
 *
 * Por qué hace falta: /hola usa URLs relativas (`/api/chat/sesion`, `/api/chat/hilo`,
 * `/api/chat/enviar`). Un `python3 -m http.server` en 127.0.0.1:8746 no tiene esos
 * endpoints, y el navegador no enviará a localhost la cookie de sesión de
 * www.admira.live (`__Host-admira_chat` es host-only y Secure). Este proxy:
 *   1) sirve los estáticos de la rama (código nuevo de /hola);
 *   2) reenvía /api/* y /auth/* a https://www.admira.live, reescribiendo Origin/Host
 *      para que el Worker acepte la petición;
 *   3) traduce `__Host-admira_chat` ↔ `admira_chat` para que la sesión funcione en HTTP local.
 *
 * No registra valores de cookies ni Authorization. No guarda secretos.
 *
 * Uso (en el MacStudio, no lo lanza este bot):
 *   cd /tmp/woz-7546-pwa
 *   git fetch origin woz/7546-fase1-pwa && git checkout woz/7546-fase1-pwa && git pull --ff-only origin woz/7546-fase1-pwa
 *   node dev-proxy.mjs --root /tmp/woz-7546-pwa --port 8746
 *   adb reverse tcp:8746 tcp:8746
 *   En el Fold 8: http://localhost:8746/hola/
 *
 * Entra con la cuenta de Google de Carlos en esa página (la sesión de www.admira.live
 * no viaja sola a localhost). La verja (auth-gate) habla con fleet.admira.live; si
 * aparece, inicia sesión ahí o usa el botón de Google de /hola cuando la página se vea.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PORT = Number(arg("--port", "8746"));
const ROOT = path.resolve(arg("--root", process.cwd() === "/" ? here : process.cwd()));
const BACKEND = String(arg("--backend", "https://www.admira.live")).replace(/\/$/, "");
const BACKEND_HOST = new URL(BACKEND).host;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
};

const COOKIE_HOST = "__Host-admira_chat";
const COOKIE_LOCAL = "admira_chat";

function shouldProxy(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname === "/auth" || pathname.startsWith("/auth/");
}

function rewriteCookieHeader(cookie) {
  if (!cookie) return "";
  return String(cookie).replace(/(?:^|;\s*)admira_chat=/g, (m) => m.replace("admira_chat=", COOKIE_HOST + "="));
}

function rewriteSetCookie(list) {
  return (list || []).map((sc) => {
    if (!sc) return sc;
    let out = String(sc).replace(/^__Host-admira_chat=/i, COOKIE_LOCAL + "=");
    out = out.replace(/;\s*Secure/gi, "");
    out = out.replace(/;\s*Domain=[^;]*/gi, "");
    return out;
  });
}

function safeJoin(root, urlPath) {
  let rel = decodeURIComponent((urlPath || "/").split("?")[0] || "/").replace(/\\/g, "/");
  if (rel.includes("\0")) return null;
  const file = path.normalize(path.join(root, rel));
  const base = path.resolve(root);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

async function proxy(req, res) {
  const headers = { ...req.headers };
  headers.host = BACKEND_HOST;
  if (headers.origin) headers.origin = BACKEND;
  if (headers.referer) {
    try {
      const u = new URL(headers.referer);
      headers.referer = BACKEND + u.pathname + u.search + u.hash;
    } catch (e) {
      headers.referer = BACKEND + "/";
    }
  }
  if (headers.cookie) headers.cookie = rewriteCookieHeader(headers.cookie);
  delete headers["accept-encoding"];
  delete headers.connection;
  delete headers["keep-alive"];
  delete headers["proxy-connection"];
  delete headers["transfer-encoding"];
  delete headers["content-length"];

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await fetch(BACKEND + req.url, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    redirect: "manual",
  });

  const out = {};
  r.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (key === "set-cookie" || key === "content-encoding" || key === "content-length" || key === "transfer-encoding") return;
    out[k] = v;
  });
  const raw = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  const cookies = rewriteSetCookie(raw);
  if (cookies.length) out["set-cookie"] = cookies;
  const buf = Buffer.from(await r.arrayBuffer());
  res.writeHead(r.status, out);
  res.end(buf);
  console.log(req.method, req.url, "→", BACKEND, r.status);
}

function serveStatic(req, res) {
  const u = new URL(req.url, "http://127.0.0.1");
  let file = safeJoin(ROOT, u.pathname);
  if (!file) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("bad path");
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const idx = path.join(file, "index.html");
    if (fs.existsSync(idx)) file = idx;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (shouldProxy(pathname)) {
    proxy(req, res).catch((e) => {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("proxy error");
      console.error(req.method, req.url, "proxy fail:", e && e.message);
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Admira Live dev-proxy #7546");
  console.log("  estáticos:", ROOT);
  console.log("  /api/* y /auth/* →", BACKEND);
  console.log("  abre: http://127.0.0.1:" + PORT + "/hola/");
  console.log("  cookie de sesión: se reescribe para HTTP local; no se registra su valor.");
});
