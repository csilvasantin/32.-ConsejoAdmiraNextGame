import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("ladoDe: consejero a la izquierda; deepagent y sin asignar a la derecha", () => {
  const w = {
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    localStorage: { getItem: () => null },
    document: { addEventListener() {} },
  };
  w.window = w;
  w.globalThis = w;
  vm.runInNewContext(readFileSync(new URL("./yk-quien.js", import.meta.url), "utf8"), w);
  vm.runInNewContext(readFileSync(new URL("./yk-misiones.js", import.meta.url), "utf8"), w);
  const L = w.YkMisiones.ladoDe;
  assert.equal(L({ assignee: "Musk" }), "consejeros");
  assert.equal(L({ assignee: "Elon Musk" }), "consejeros");
  assert.equal(L({ _agents: ["Jobs"] }), "consejeros");
  assert.equal(L({ assignee: "Merovingio" }), "agentes");
  assert.equal(L({ assignee: "Smith", _agents: ["Smith"] }), "agentes");
  assert.equal(L({ assignee: "" }), "agentes");
  assert.equal(L({}), "agentes");
  assert.equal(L({ assignee: "Trinity", _agents: ["Huang"] }), "consejeros");
});

test("markWorking pone pulso solo si está vivo y la misión va en curso", () => {
  function el(cls) {
    const classes = new Set(String(cls || "").split(/\s+/).filter(Boolean));
    const node = {
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      querySelector() { return node._img || null; },
    };
    return node;
  }
  const rows = {
    vivo: Object.assign(el("tk"), { dataset: { id: "a" }, _img: el("shot-img") }),
    parado: Object.assign(el("tk"), { dataset: { id: "b" }, _img: el("shot-img") }),
    resuelta: Object.assign(el("tk"), { dataset: { id: "c" }, _img: el("shot-img") }),
  };
  const doc = { addEventListener() {}, querySelectorAll: () => Object.values(rows) };
  const w = {
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    localStorage: { getItem: () => null },
    document: doc,
  };
  w.window = w;
  w.globalThis = w;
  vm.runInNewContext(readFileSync(new URL("./yk-quien.js", import.meta.url), "utf8"), w);
  vm.runInNewContext(readFileSync(new URL("./yk-misiones.js", import.meta.url), "utf8"), w);
  const tickets = [
    { id: "a", status: "in_progress", assignee: "Trinity", machine: "MacMini" },
    { id: "b", status: "open", assignee: "Trinity", machine: "MacMini" },
    { id: "c", status: "resolved", assignee: "Trinity", machine: "MacMini", visible_state: "resolved" },
  ];
  w.YkMisiones.markWorking(doc, tickets, { machines: new Set(["MacMini"]), personas: new Set(["trinity"]) });
  assert.equal(rows.vivo.classList.contains("pulso"), true);
  assert.equal(rows.vivo._img.classList.contains("working"), true);
  assert.equal(rows.parado.classList.contains("pulso"), false, "pendiente viva no late");
  assert.equal(rows.parado._img.classList.contains("working"), true);
  assert.equal(rows.resuelta.classList.contains("pulso"), false);
  assert.equal(rows.resuelta._img.classList.contains("working"), false);
});
