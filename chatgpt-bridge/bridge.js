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
    // marcador POSITIVO de sesión (perfil/menú de cuenta o historial en el nav)
    const acct = await page.$('[data-testid="profile-button"], button[aria-haspopup="menu"], nav a[href^="/c/"]');
    if (acct) return true;
    // si NO hay marcador, mira si hay CTA de login claramente visible
    const loginCta = await page.$('button[data-testid="login-button"], a[data-testid="login-button"]');
    return !loginCta;
  } catch (_) { return false; }
}

// Algunas cuentas (con varias áreas de trabajo) muestran un selector "Iniciar un área
// de trabajo" antes del chat. Lo saltamos entrando al área PERSONAL (la suscripción).
async function selectWorkspaceIfNeeded() {
  // el selector "Iniciar un área de trabajo" puede renderizarse tarde → reintenta
  for (let i = 0; i < 8; i++) {
    let state;
    try {
      state = await page.evaluate(() => {
        const composer = document.querySelector('#prompt-textarea');
        const txt = document.body.innerText || '';
        const onPicker = /(Iniciar un área de trabajo|área de trabajo personal|tiene acceso a \d+ áreas|access to \d+ workspaces)/i.test(txt);
        return { hasComposer: !!composer, onPicker };
      });
    } catch (_) { state = { hasComposer: false, onPicker: false }; }
    if (state.hasComposer) return;          // ya estamos en el chat
    if (!state.onPicker) { await page.waitForTimeout(1000); continue; }  // aún cargando
    // estamos en el picker → clic en "Abrir" de la fila PERSONAL (la suscripción)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => /\b(abrir|open)\b/i.test(b.innerText || b.textContent || ''));
      if (!btns.length) return;
      const personal = btns.find(b => { let n = b, h = 0; while (n && h < 8) { if (/personal/i.test(n.innerText || n.textContent || '')) return true; n = n.parentElement; h++; } return false; });
      (personal || btns[btns.length - 1]).click();
    }).catch(() => {});
    await page.waitForSelector('#prompt-textarea', { timeout: 12000 }).catch(() => {});
  }
}

async function newChat() {
  try { await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (_) {}
  await page.waitForTimeout(1500);
  await selectWorkspaceIfNeeded();
}

// Diagnóstico: captura + estado del DOM (para depurar cuando algo falla).
async function snap() {
  try { await page.screenshot({ path: '/tmp/comic-debug.png' }); } catch (_) {}
  try {
    return await page.evaluate(() => {
      const asg = [...document.querySelectorAll('div[data-message-author-role="assistant"]')];
      const last = asg[asg.length - 1];
      const imgs = [...document.querySelectorAll('img')].map(i => ({ src: (i.currentSrc || i.src || '').slice(0, 90), w: i.naturalWidth, alt: (i.alt || '').slice(0, 30) }));
      return { url: location.href, assistants: asg.length, lastText: last ? (last.innerText || '').slice(0, 240) : '', imgs: imgs.slice(-14) };
    });
  } catch (_) { return {}; }
}

async function generateImage(prompt) {
  await ensureBrowser();
  try {
    await newChat();
    if (await page.$(SEL.challenge)) return { ok: false, reason: 'needsHuman', diag: await snap() };

    const ask = /\bimagen|\bimage|c[oó]mic|comic|dibuj|draw|ilustra|viñeta/i.test(prompt) ? prompt : ('Genera una sola imagen. ' + prompt);

    const composer = await page.waitForSelector('#prompt-textarea', { timeout: 25000 }).catch(() => null);
    if (!composer) return { ok: false, reason: 'no llegué al chat (¿selector de área de trabajo o login?)', diag: await snap() };
    await composer.click({ timeout: 8000 }).catch(() => {});
    await composer.focus().catch(() => {});
    try { await page.keyboard.insertText(ask); } catch (_) { try { await page.keyboard.type(ask); } catch (_) {} }
    await page.waitForTimeout(600);

    // cuenta las imágenes GENERADAS que ya hubiera, para esperar una NUEVA
    const genCount = () => page.evaluate(() => {
      const re = /estuary\/content|oaiusercontent|sdmnt|\/backend-api\/[^"']*content|\/files\//i;
      return [...document.querySelectorAll('img')].filter(im => im.naturalWidth > 256 && (re.test(im.currentSrc || im.src || '') || /imagen generada|generated image/i.test(im.alt || ''))).length;
    }).catch(() => 0);
    const before = await genCount();

    // enviar: Enter es lo más fiable; si el texto sigue en el composer, prueba el botón
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(900);
    const stillText = await page.evaluate(() => {
      const el = document.querySelector('#prompt-textarea, div.ProseMirror, div[contenteditable="true"]');
      return el ? (el.innerText || el.value || '').trim().length : 0;
    }).catch(() => 0);
    if (stillText > 0) { const b = await page.$(SEL.send); if (b) await b.click({ timeout: 8000 }).catch(() => {}); }

    // espera una imagen NUEVA renderizada (src http y tamaño real, no placeholder)
    let src = null;
    try {
      const handle = await page.waitForFunction(
        (beforeN) => {
          const re = /estuary\/content|oaiusercontent|sdmnt|\/backend-api\/[^"']*content|\/files\//i;
          const gen = [...document.querySelectorAll('img')].filter(im => im.naturalWidth > 256 && (re.test(im.currentSrc || im.src || '') || /imagen generada|generated image/i.test(im.alt || '')));
          if (gen.length > beforeN) { const im = gen[gen.length - 1]; return im.currentSrc || im.src; }
          return null;
        },
        before,
        { timeout: parseInt(process.env.CHATGPT_BRIDGE_WAIT_MS || '180000', 10), polling: 1500 }
      );
      src = await handle.jsonValue();
    } catch (_) { src = null; }

    if (!src) return { ok: false, reason: 'timeout: ChatGPT no devolvió imagen', diag: await snap() };

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
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e).slice(0, 140), diag: await snap() };
  }
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
