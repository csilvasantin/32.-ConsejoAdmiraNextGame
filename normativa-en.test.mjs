import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const es = readFileSync(new URL("./normativa.html", import.meta.url), "utf8");
const en = readFileSync(new URL("./assets/normativa-en.html", import.meta.url), "utf8");
const main = es.match(/<main class="wrap"[^>]*>\n([\s\S]*)\n<\/main>/)[1];
const tags = (s) => s.replace(/<!--[\s\S]*?-->/g, "").match(/<\/?[a-z0-9]+/g);

test("r15: el inglés de /normativa tiene la misma estructura, enlaces y anclas que el <main> castellano", () => {
  assert.deepEqual(tags(en), tags(main));
  const hrefs = (s) => s.match(/href="[^"]+"/g);
  assert.deepEqual(hrefs(en), hrefs(main));
  for (let i = 1; i <= 27; i++) { const id = 'id="n' + String(i).padStart(2, "0") + '"'; assert.ok(main.includes(id) && en.includes(id), id); }
});

test("r15: es una traducción, no el castellano copiado", () => {
  assert.match(en, /<h1>REGULATIONS<\/h1>/);
  assert.match(en, /Every published change, a new version/);
  const plain = en.replace(/<code[\s\S]*?<\/code>|<!--[\s\S]*?-->|«[^»]*»/g, "");
  for (const w of [" que ", " los ", " para ", " una ", " del "]) assert.equal(plain.includes(w), false, w);
});

test("r15: la página cambia el <main> con el idioma y el diccionario no lo toca", () => {
  assert.match(es, /<main class="wrap" data-no-traducir>/);
  assert.match(es, /\/assets\/normativa-en\?v=/);
  assert.match(es, /admira:languagechange/);
});
