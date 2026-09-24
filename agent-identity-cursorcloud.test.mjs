import assert from "node:assert/strict";
await import("./yk-agent-identity.js");
const id = globalThis.ykAgentIdentity;

assert.equal(id.display("Arquitecto", "CursorCloud"), "ArquitectoCursorCloud");
assert.equal(id.display("Arquitecto", "cursor cloud"), "ArquitectoCursorCloud");
assert.equal(id.display("architect", "cursor"), "ArquitectoCursorCloud");
assert.equal(id.display("elarquitecto", "architectcloud"), "ArquitectoCursorCloud");
assert.equal(id.suffix("CursorCloud"), "CursorCloud");
assert.equal(id.suffix("cursor-cloud"), "CursorCloud");
assert.equal(id.parse("ArquitectoCursorCloud").persona, "Arquitecto");
assert.equal(id.parse("ArquitectoCursorCloud").suffix, "CursorCloud");
assert.equal(id.display("Arquitecto", ""), "ArquitectoSINMAQ");
assert.equal(id.display("Smith", "MacMini"), "SmithMacMini");
assert.equal(id.display("SmithMini", ""), "SmithMacMini");
console.log("agent-identity CursorCloud: ok");
