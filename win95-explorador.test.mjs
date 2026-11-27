import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redactar, construirFicheros, desdeMensaje, desdeEncargo, ordenPar } from "./win95-comunicaciones-lib.mjs";
import { onRequestGet, construir } from "./functions/api/win95/comunicaciones.js";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-25T20:00:00Z"); // 21:00 en Madrid

test("redactar: fuera tokens, contraseñas, IPs, MACs y claves; la prosa se queda", () => {
  const t = redactar("ip 192.168.1.20 · mac aa:bb:cc:dd:ee:ff · token=abcd1234xyz · password: hunter22 · ghp_abcdefghijk1234 · https://x.test/a?token=zz · Authorization: Bearer abc.def.ghijkl · 0123456789abcdef0123456789abcdef");
  for (const fuga of ["192.168.1.20", "aa:bb:cc:dd:ee:ff", "abcd1234xyz", "hunter22", "ghp_abcdefghijk1234", "token=zz", "abc.def.ghijkl", "0123456789abcdef0123456789abcdef"]) assert.ok(!t.includes(fuga), fuga);
  assert.equal(redactar("el token del servidor, clave para Musk a las 20:15 (#7722.11.25)"), "el token del servidor, clave para Musk a las 20:15 (#7722.11.25)");
});

test("solo consejero ↔ consejero: agentes, Carlos y uno mismo quedan fuera", () => {
  assert.equal(desdeMensaje({ id: 1, de: "Jobs", para: "Neo", de_tipo: "consejero", para_tipo: "agente", texto: "x", hora: AHORA }), null);
  assert.equal(desdeEncargo({ id: 2, from_name: "status-web · NeoMacStudio", target_persona: "JobsGrokBot", text: "x", ts: AHORA / 1000 }), null);
  assert.equal(desdeEncargo({ id: 3, from_name: "Huang", target_persona: "Huang", text: "x", ts: AHORA / 1000 }), null);
  const e = desdeEncargo({ id: 7699, from_name: "Jobs GrokBot", target_persona: "Huang", text: "[MCP x → y]\nhola", ts: AHORA / 1000, status: "done" });
  assert.equal(e.de, "Steve Jobs"); assert.equal(e.para, "Jensen Huang"); assert.equal(e.ref, "#7699"); assert.equal(e.texto, "hola");
  assert.deepEqual(ordenPar("Jensen Huang", "Steve Jobs"), ["Steve Jobs", "Jensen Huang"]);
});

test("ficheros: un .txt por conversación + resumen del día, hora de Madrid, sin secretos", () => {
  const f = construirFicheros({
    mensajes: [
      { id: "m1", de: "Musk", para: "Jobs", texto: "Prueba viva, clave: s3cr3tito", hora: AHORA - 3600e3, leido: true },
      { id: "m2", de: "Jobs", para: "Musk", texto: "Recibido desde 10.0.0.7", hora: AHORA - 1800e3 },
      { id: "m3", de: "Jobs", para: "Musk", texto: "viejo", hora: AHORA - 40 * 86400e3 },
    ],
    encargos: [{ id: 7699, from_name: "Jobs", target_persona: "Huang", text: "PR de Morfeo", ts: (AHORA - 600e3) / 1000, status: "pending" }],
  }, AHORA);
  assert.deepEqual(f.map((x) => x.nombre), ["Consejo 25-11-2026.txt", "Jobs-Huang.txt", "Jobs-Musk.txt"]);
  const jm = f.find((x) => x.nombre === "Jobs-Musk.txt");
  assert.equal(jm.mensajes, 2, "lo de hace 40 días no entra");
  assert.match(jm.texto, /25-11-2026 20:00 · Musk → Jobs · mensaje · leído/);
  assert.match(jm.texto, /25-11-2026 20:30 · Jobs → Musk/);
  assert.ok(!jm.texto.includes("s3cr3tito") && !jm.texto.includes("10.0.0.7"));
  assert.equal(f[0].mensajes, 3);
  assert.match(f[1].texto, /encargo #7699 · pendiente/);
  for (const x of f) { assert.ok(x.tamano > 0); assert.ok(x.modificado > 0); }
});

test("/api/win95/comunicaciones: sin sesión 401; nunca reenvía el token al cliente", async () => {
  const r = await onRequestGet({ request: new Request("https://www.admira.live/api/win95/comunicaciones"), env: {}, fetchImpl: async () => new Response("{}") });
  assert.equal(r.status, 401);
  const vistos = [];
  const fetchImpl = async (url, init) => {
    vistos.push([String(url), init && init.headers && init.headers["x-mensajes-token"]]);
    if (String(url).includes("/consejero/mensajes")) return Response.json({ mensajes: [{ id: "a", de: "Huang", para: "Jobs", texto: "ok", hora: new Date(AHORA - 60e3).toISOString() }] });
    return Response.json({ items: [] });
  };
  const d = await construir({ env: { CONSEJERO_MENSAJES_TOKEN: "tok-secreto-123" }, fetchImpl, ahora: AHORA });
  assert.equal(d.ok, true);
  assert.ok(vistos.some(([u, t]) => u.includes("/consejero/mensajes") && t === "tok-secreto-123"), "el token va al Worker");
  assert.ok(!JSON.stringify(d).includes("tok-secreto-123"), "y nunca vuelve en el JSON");
  assert.ok(d.ficheros.some((x) => x.nombre === "Jobs-Huang.txt"));
});

test("Explorador 95: Ver con Iconos grandes, pequeños, Lista y Detalles; cabeceras que ordenan", () => {
  assert.match(html, /id="dm-view">Ver/);
  assert.match(html, /id="dm-arrange">Organizar iconos/);
  for (const v of ["Iconos grandes", "Iconos pequeños", "Lista", "Detalles"]) assert.ok(html.includes("'" + v + "'"), v);
  // t1389u: orden Nombre | Tamaño | Modificado | Tipo, anchos compartidos y separadores arrastrables
  assert.match(html, /DET_COLS=\[\['name','Nombre',\d+\],\['size','Tamaño',\d+\],\['date','Modificado',\d+\],\['type','Tipo',\d+\]\]/);
  assert.match(html, /\.dethead \.colgrip\{[^}]*cursor:col-resize[^}]*touch-action:none/);
  assert.match(html, /\.icon \.dc-date\{order:3;width:var\(--c-date\)\}/);
  assert.match(html, /\.dethead \.h-date\{width:var\(--c-date\)\}/);
  assert.match(html, /setPointerCapture/);
  assert.match(html, /setFolderView\(id,\{sort:c\[0\],dir:cv\.sort===c\[0\]\?-cv\.dir:1\}\)/, "clic en cabecera: asc/desc");
  for (const k of ["por nombre", "por tipo", "por tamaño", "por fecha"]) assert.ok(html.includes("'" + k + "'"), k);
  assert.match(html, /FVIEW_KEY='admira-win95-vistas-v2'/);
});

test("Explorador 95: Léeme.txt y las aplicaciones se arrastran a carpetas; solo Mi PC y la Papelera son fijos", () => {
  assert.match(html, /function isFixedDef\(d\)\{ return !!d&&d\.kind==='app'&&\(d\.id==='mypc'\|\|d\.id==='trash'\); \}/);
  assert.match(html, /function moveItemTo\(el, parent, x, y\)\{\n  var d=el\._def; if\(!d\|\|!canMoveDef\(d\)\)/);
  assert.match(html, /if\(d\.kind==='app'\) APPST\[d\.id\]=\{parent:parent\};/);
  assert.match(html, /document\.elementFromPoint/, "el destino respeta la ventana que está delante");
  assert.match(html, /soltar en el escritorio: sale de la carpeta si venía de una/);
});

test("Papelera 95: botón derecho, Restaurar, Eliminar con confirmación y Vaciar; lo del sistema solo se oculta", () => {
  assert.match(html, /function openTrashIconMenu\(/);
  assert.match(html, /\{l:'Vaciar Papelera de reciclaje',dis:!TRASH\.length,fn:emptyTrashAsk\}/);
  assert.match(html, /\{l:'Restaurar',b:1,fn:function\(\)\{ trashRestore\(i\); \}\}/);
  assert.match(html, /¿Está seguro de que desea eliminar «'\+nm\+'»\?/);
  assert.match(html, /¿Está seguro de que desea eliminar estos '\+TRASH\.length\+' elementos\?/);
  assert.match(html, /if\(def\.remote\)\{ HIDDEN\[def\.id\]=1; return; \}/);
  assert.match(html, /if\(HIDDEN\[LEYENDAS_SEED_ID\]\) return;/);
  assert.match(html, /else if\(!d\.remote\)\{ delete FS\[d\.id\]; delete DOCS\[d\.docId\|\|d\.id\]; \}/, "lo tirado sale de su carpeta");
  assert.match(html, /ICONS\[full\?'trashFull':'trash'\]/);
});

test("Miscelánea: comunicaciones del Consejo de solo lectura, se refrescan al abrir la carpeta", () => {
  assert.match(html, /COMMS_URL='\/api\/win95\/comunicaciones'/);
  assert.match(html, /credentials:'same-origin'/);
  assert.match(html, /if\(id===MISC_ID\)\{ loadComms\(true\); loadMisiones\(true\); \}/);
  assert.match(html, /var ro=remote\|\|sys\|\|isDeepSys\(d\)\|\|\(isLeyendasDoc\(d\)&&!d\.leyendasLocal\);/);
  assert.match(html, /plainName\(it\.name\)==='miscelanea'/);
  assert.match(html, /<script src="\/auth-gate\.js"><\/script>/);
});

test("Miscelánea: Estilo comunicaciones ICQGram.txt es un fichero de sistema de solo lectura", () => {
  assert.match(html, /ESTILO_SEED_ID='doc-estilo-icqgram'/);
  assert.match(html, /ESTILO_SEED_NAME='Estilo comunicaciones ICQGram\.txt'/);
  assert.match(html, /function ensureEstiloDoc\(/);
  assert.match(html, /function isEstiloDoc\(d\)/);
  assert.match(html, /parent:spec\.parent\|\|MISC_ID/);
  assert.match(html, /x\.parent=MISC_ID/);
  assert.match(html, /function canMoveDef\(d\)\{ return !!d&&!isFixedDef\(d\)&&!d\.remote&&!isMiscSysDoc\(d\)&&!isDeepSys\(d\); \}/);
  assert.match(html, /var ro=remote\|\|sys\|\|isDeepSys\(d\)\|\|\(isLeyendasDoc\(d\)&&!d\.leyendasLocal\);/);
  assert.match(html, /id===LEYENDAS_SEED_ID\|\|isMiscSysId\(id\)\|\|id==='fld-misc'/);
  assert.match(html, /norma de Carlos \(estilo ICQGram\)/);
});

test("Miscelánea: traspaso del Consejo (cómo funciona, encargos y normas) es de solo lectura", () => {
  assert.match(html, /function isMiscSysDoc\(d\)/);
  assert.match(html, /function ensureMiscSysOne\(/);
  assert.match(html, /id:'doc-como-funciona-win95'/);
  assert.match(html, /name:'Cómo funciona Win95 Xperience\.txt'/);
  assert.match(html, /id:'doc-encargos-abiertos'/);
  assert.match(html, /name:'Encargos y misiones abiertas\.txt'/);
  assert.match(html, /id:'doc-normas-consejo'/);
  assert.match(html, /name:'Normas del Consejo para nuevos consejeros\.txt'/);
  assert.match(html, /id="como-funciona-win95-seed"/);
  assert.match(html, /id="encargos-abiertos-seed"/);
  assert.match(html, /id="normas-consejo-seed"/);
  assert.match(html, /documento del Consejo en Miscelánea/);
  assert.match(html, /for\(var i=0;i<MISC_TRASPASO\.length;i\+\+\) ensureMiscSysOne\(MISC_TRASPASO\[i\]\)/);
});

test("Miscelánea: ElonMusk es subcarpeta de consejero con la misión del día", () => {
  assert.match(html, /id:'fld-elonmusk'/);
  assert.match(html, /name:'ElonMusk'/);
  assert.match(html, /mission:'XperienceWin95'/);
  assert.match(html, /id:'doc-elon-mision-20261126'/);
  assert.match(html, /name:'2026-11-26\.txt'/);
  assert.match(html, /folder:'fld-elonmusk'/);
  assert.match(html, /id="mision-elon-20261126-seed"/);
  assert.match(html, /function isMiscSysDoc\(d\)/);
  assert.match(html, /function ensureMiscSysOne\(/);
  assert.match(html, /retireMiscSysDoc\('doc-elon-mision'\)/);
  assert.doesNotMatch(html, /name:'Elon - Misión\.txt'/);
  assert.doesNotMatch(html, /id="elon-mision-seed"/);
});

test("Miscelánea: JensenHuang es subcarpeta de consejero con la misión del día", () => {
  assert.match(html, /id:'fld-jensenhuang'/);
  assert.match(html, /name:'JensenHuang'/);
  assert.match(html, /mission:'ModoDemoAdmiraNeXT'/);
  assert.match(html, /id:'doc-jensen-mision-20261126'/);
  assert.match(html, /name:'2026-11-26\.txt'/);
  assert.match(html, /folder:'fld-jensenhuang'/);
  assert.match(html, /id="mision-jensen-20261126-seed"/);
  assert.match(html, /Modo demo AdmiraNeXT en la zona Terminator/);
  assert.match(html, /MBACrema/);
  assert.match(html, /function isMiscSysDoc\(d\)/);
});

test("Miscelánea: subcarpetas genéricas de consejero (SteveWozniak, ElonMusk, JensenHuang y misión en la barra)", () => {
  assert.match(html, /var MISC_SUBFOLDERS=/);
  assert.match(html, /var MISC_SUBDOCS=/);
  assert.match(html, /function ensureMiscSysFolder\(/);
  assert.match(html, /function ensureMiscSubfolders\(/);
  assert.match(html, /ensureMiscSubfolders\(\);/);
  assert.match(html, /function miscFolderTitle\(/);
  assert.match(html, /function miscFolderSpec\(/);
  assert.match(html, /function folderMissionOf\(/);
  assert.match(html, /c\.principal&&c\.principal\.titulo/);
  assert.match(html, /id:'fld-stevewozniak'/);
  assert.match(html, /name:'SteveWozniak'/);
  assert.match(html, /mission:'Win95 Xperience'/);
  assert.match(html, /id:'fld-elonmusk'/);
  assert.match(html, /name:'ElonMusk'/);
  assert.match(html, /mission:'XperienceWin95'/);
  assert.match(html, /id:'fld-jensenhuang'/);
  assert.match(html, /name:'JensenHuang'/);
  assert.match(html, /mission:'ModoDemoAdmiraNeXT'/);
  assert.match(html, /id:'doc-woz-mision-20261126'/);
  assert.match(html, /id:'doc-woz-mision-20261127'/);
  assert.match(html, /id:'doc-elon-mision-20261126'/);
  assert.match(html, /id:'doc-jensen-mision-20261126'/);
  assert.match(html, /name:'2026-11-26\.txt'/);
  assert.match(html, /name:'2026-11-27\.txt'/);
  assert.match(html, /folder:'fld-stevewozniak'/);
  assert.match(html, /folder:'fld-elonmusk'/);
  assert.match(html, /folder:'fld-jensenhuang'/);
  assert.match(html, /id="mision-woz-20261126-seed"/);
  assert.match(html, /id="mision-woz-20261127-seed"/);
  assert.match(html, /id="mision-elon-20261126-seed"/);
  assert.match(html, /id="mision-jensen-20261126-seed"/);
  assert.match(html, /Win95 Xperience en admira\.live/);
  assert.match(html, /Napster v2\.0 Transfer/);
  assert.match(html, /qs\('\.t',w\)\.textContent=miscFolderTitle\(it\)/);
  assert.match(html, /addTask\('fw-'\+id,miscFolderTitle\(it\),'folder'/);
  assert.match(html, /for\(var s=0;s<MISC_SUBFOLDERS\.length;s\+\+\) if\(MISC_SUBFOLDERS\[s\]\.id===id\) return true/);
  // SteveJobs vive en la hidratación de misiones (padre: miscelanea), no en MISC_SUBFOLDERS.
  assert.doesNotMatch(html, /MISC_SUBFOLDERS=\[[^;]*fld-stevejobs/);
  assert.match(html, /function ensureSteveJobs\(/);
  assert.match(html, /['"]fld-stevejobs['"]/);
});
