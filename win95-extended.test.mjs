import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(raiz, rel), "utf8");

test("el botón Extended existe, arranca en OFF por defecto y está debajo de Computer", () => {
  const js = src("assets/win95-crt.js");
  const css = src("assets/win95-crt.css");
  const html = src("windows95/index.html");

  assert.match(js, /crt-extended-toggle/);
  assert.match(js, /Extended: OFF/);
  assert.match(js, /Extended: ON/);
  assert.match(js, /admira-win95-extended/);
  assert.match(js, /KEY_EXT/);
  assert.match(js, /localStorage\.getItem\(KEY_EXT\) === "1"/);
  assert.doesNotMatch(js, /getItem\(KEY_EXT\) !== "0"/);
  assert.doesNotMatch(js, /admira-win95-extended"\) !== "0"/);

  const mon = js.indexOf('mon.id = "crt-monitor-toggle"');
  const comp = js.indexOf('comp.id = "crt-computer-toggle"');
  const ext = js.indexOf('ext.id = "crt-extended-toggle"');
  assert.ok(mon >= 0 && comp >= 0 && ext >= 0, "faltan los tres botones");
  assert.ok(mon < comp && comp < ext, "Extended debe declararse después de Computer");
  assert.match(js, /ui\.appendChild\(comp\);[\s\S]*ui\.appendChild\(ext\);/);

  const early = html.slice(html.indexOf("admira-win95-extended"), html.indexOf("admira-win95-extended") + 400);
  assert.match(html, /admira-win95-extended"\)==="1"/);
  assert.match(html, /classList\.add\("crt-extended"\)/);
  assert.doesNotMatch(early, /!== "0"/);

  assert.match(css, /#crt-ui\s*\{[^}]*flex-direction:\s*column/s);
});

test("Extended ON ocupa todo el viewport, oculta el CRT y Monitor ON lo desactiva", () => {
  const js = src("assets/win95-crt.js");
  const css = src("assets/win95-crt.css");
  const html = src("windows95/index.html");

  assert.match(css, /html\.crt-extended #crt-shell/);
  assert.match(css, /width:\s*100vw/);
  assert.match(css, /height:\s*100vh/);
  assert.match(css, /html\.crt-extended #crt-ui\s*\{[^}]*bottom:\s*40px/s);
  assert.match(css, /html\.crt-extended #desk/);
  assert.match(css, /html\.crt-extended \.win\.max/);
  assert.match(css, /html\.crt-extended #crt-monitor \.crt-grain/);

  assert.match(js, /classList\.toggle\("crt-extended", on\)/);
  assert.match(js, /classList\.add\("crt-frame-off"\)/);
  assert.match(js, /opts\.fromUser/);
  assert.match(js, /skipMonitorRestore/);
  assert.match(js, /win95ExtendedSet/);
  assert.match(js, /win95ExtendedOn/);
  assert.match(js, /shell\.style\.transform = "none"/);

  assert.match(html, /function applyDeskMetrics\(/);
  assert.match(html, /function clampAllWindows\(/);
  assert.match(html, /SCALE=1/);
  assert.match(html, /shell\.style\.transform='none'/);
  assert.match(html, /sw=off\?640:784, sh=off\?480:716/);
  assert.match(html, /el\.style\.width=DESK_W\+'px'; el\.style\.height=DESK_H\+'px'/);
  assert.match(html, /x=clamp\(x,0,DESK_W-72\); y=clamp\(y,0,DESK_H-48\)/);
  assert.match(html, /w=Math\.round\(Math\.min\(Math\.max\(w,min\.w\),DESK_W-l\)\)/);
});
