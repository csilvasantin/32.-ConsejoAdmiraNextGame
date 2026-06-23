#!/usr/bin/env node
/* ============================================================================
 * ChatGPT bridge — genera imágenes con TU SUSCRIPCIÓN de ChatGPT (sin API key).
 * ----------------------------------------------------------------------------
 * Dirige tu Chrome REAL (canal 'chrome') con un perfil dedicado, así la sesión
 * de ChatGPT (login de la suscripción) persiste y se reusa. Expone un HTTP local
 * que recibe un prompt, lo manda a chatgpt.com, espera la imagen generada y la
 * devuelve en base64. Lo consume comic.js del Consejo (motor 'navegador'/'better').
 *
 * Uso:
 *   node bridge.js           → arranca el servidor + abre Chrome (login persistente)
 *   node bridge.js --login   → solo abre ChatGPT para que loguees la primera vez
 *
 * Env (opcional):
 *   CHATGPT_BRIDGE_PORT     (def 9189)
 *   CHATGPT_BRIDGE_PROFILE  (def ~/.admira-chatgpt-profile)
 *   CHATGPT_BRIDGE_ORIGIN   (def *  — CORS; puedes fijar https://www.admira.live)
 *
 * NOTA: automatiza la web de ChatGPT. Es tu cuenta/suscripción; si ChatGPT lanza
 * un captcha/verificación, resuélvelo tú en la ventana (el puente no lo hace).
 * Los selectores de abajo (SEL) pueden cambiar si OpenAI altera su UI: ajústalos aquí.
 * ========================================================================== */
'use strict';
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const PORT = parseInt(process.env.CHATGPT_BRIDGE_PORT || '9189', 10);
const PROFILE_DIR = process.env.CHATGPT_BRIDGE_PROFILE || path.join(os.homedir(), '.admira-chatgpt-profile');
const ALLOW_ORIGIN = process.env.CHATGPT_BRIDGE_ORIGIN || '*';
const CHATGPT_URL = 'https://chatgpt.com/';

// Selectores de la UI de ChatGPT (ajústalos aquí si OpenAI cambia su web).
const SEL = {
  composer: '#prompt-textarea, div[contenteditable="true"][data-virtualkeyboard]',
  composerAny: '#prompt-textarea, div.ProseMirror, div[contenteditable="true"]',
  send: 'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="Enviar"]',
  assistantImg: 'div[data-message-author-role="assistant"] img',
  challenge: 'iframe[src*="challenges.cloudflare"], #challenge-stage, [data-testid="captcha"]',
};

let ctx = null, page = null, busy = false;

async function ensureBrowser() {
  // reutiliza si sigue vivo; relanza si se cerró la ventana/el contexto
  if (ctx && page && !page.isClosed()) return;
  try { if (ctx) await ctx.close(); } catch (_) {}
  ctx = null; page = null;
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
  });
  ctx.on('close', () => { ctx = null; page = null; });
  page = ctx.pages()[0] || await ctx.newPage();
  try { await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (_) {}
}

async function isLoggedIn() {
  try {
    if (!page) return false;
    const composer = await page.$(SEL.composerAny);
    if (!composer) return false;
    // chatgpt.com deslogueado muestra el composer PERO también botones de login/signup.
    const loggedOut = await page.$('a[href*="/auth/login"], button[data-testid="login-button"], [data-testid="signup-button"], a[href*="auth0"]');
    return !loggedOut;
  } catch (_) { return false; }
}

async function newChat() {
  try { await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (_) {}
  await page.waitForTimeout(1200);
}

async function generateImage(prompt) {
  await ensureBrowser();
  await newChat();

  if (await page.$(SEL.challenge)) return { ok: false, reason: 'needsHuman' };  // captcha/verificación
  if (!(await isLoggedIn())) return { ok: false, reason: 'needLogin' };

  // asegura que le pedimos una IMAGEN
  const ask = /\bimagen|\bimage|c[oó]mic|comic|dibuj|draw|ilustra|viñeta/i.test(prompt) ? prompt : ('Genera una sola imagen. ' + prompt);

  const composer = await page.waitForSelector(SEL.composerAny, { timeout: 20000 });
  await composer.click();
  try { await page.keyboard.insertText(ask); } catch (_) { await page.keyboard.type(ask); }
  await page.waitForTimeout(400);

  const before = await page.$$eval(SEL.assistantImg, els => els.length).catch(() => 0);

  const sendBtn = await page.$(SEL.send);
  if (sendBtn) { try { await sendBtn.click(); } catch (_) { await page.keyboard.press('Enter'); } }
  else { await page.keyboard.press('Enter'); }

  // espera una imagen NUEVA, ya renderizada (src http y tamaño real, no placeholder)
  let src = null;
  try {
    const handle = await page.waitForFunction(
      (args) => {
        const imgs = [...document.querySelectorAll(args.sel)];
        const fresh = imgs.slice(args.before);
        const ok = fresh.find(im => im.src && /^https?:/.test(im.src) && im.naturalWidth > 256 && !/spinner|loading/i.test(im.src));
        return ok ? ok.src : null;
      },
      { sel: SEL.assistantImg, before },
      { timeout: 180000, polling: 1500 }
    );
    src = await handle.jsonValue();
  } catch (_) { src = null; }

  if (!src) return { ok: false, reason: 'timeout: ChatGPT no devolvió imagen (¿el prompt no pedía imagen, o tardó demasiado?)' };

  // descarga la imagen DENTRO de la sesión (cookies) → base64
  const b64 = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u); if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
    } catch (e) { return null; }
  }, src).catch(() => null);

  if (!b64) return { ok: false, reason: 'no se pudo descargar la imagen generada', src };
  return { ok: true, b64, src };
}

// ── HTTP ──
function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const u = new URL(req.url, 'http://x');

  if (req.method === 'GET' && u.pathname === '/health') {
    (async () => {
      let logged = false;
      try { await ensureBrowser(); logged = await isLoggedIn(); } catch (_) {}
      send(res, 200, { ok: true, loggedIn: logged, busy, profile: PROFILE_DIR });
    })();
    return;
  }

  if (req.method === 'POST' && u.pathname === '/comic') {
    if (busy) return send(res, 429, { ok: false, reason: 'ocupado: hay otra imagen generándose' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let prompt = '';
      try { prompt = String(JSON.parse(body || '{}').prompt || ''); } catch (_) {}
      if (!prompt.trim()) return send(res, 400, { ok: false, reason: 'falta prompt' });
      busy = true;
      try { const out = await generateImage(prompt); send(res, 200, out); }
      catch (e) { send(res, 500, { ok: false, reason: String((e && e.message) || e) }); }
      finally { busy = false; }
    });
    return;
  }

  send(res, 404, { ok: false, reason: 'not found' });
});

(async () => {
  const loginOnly = process.argv.includes('--login');
  try { await ensureBrowser(); } catch (e) {
    console.error('✗ No se pudo abrir Chrome:', e.message);
    console.error('  ¿Tienes Google Chrome instalado? ¿Hiciste `npm install` en chatgpt-bridge/?');
    process.exit(1);
  }
  const logged = await isLoggedIn();
  if (loginOnly) {
    console.log(logged
      ? '✅ Ya estás logueado en ChatGPT en este perfil. Cierra con Ctrl+C; luego arranca `npm start`.'
      : '🔓 Abierto chatgpt.com. Loguéate con tu cuenta (suscripción) en la ventana de Chrome. Cuando veas el chat, listo. (Ctrl+C para salir)');
    return;
  }
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`🟢 ChatGPT bridge → http://127.0.0.1:${PORT}`);
    console.log(`   perfil: ${PROFILE_DIR}  ·  login: ${logged ? 'OK ✅' : 'FALTA ⚠️  (corre `npm run login` y loguéate una vez)'}`);
    console.log('   endpoints: GET /health · POST /comic {prompt}');
    console.log('   lo usa comic.js del Consejo (motor «navegador/better»). Ctrl+C para parar.');
  });
})();
