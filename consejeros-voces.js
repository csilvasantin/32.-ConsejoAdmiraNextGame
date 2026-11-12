/* VOCES DEL CONSEJO (Lasseter · CCO, 11-11-2026, misión de Carlos):
 * una voz propia y estable para cada uno de los 16 consejeros.
 *
 * Motor: la síntesis de voz del propio navegador (Web Speech API). Gratis, sin
 * claves y sin servidor (máxima «gratis primero»). NO se clona ni se imita la voz
 * real de nadie: cada consejero recibe una voz de serie distinta del sistema
 * (macOS, Chrome, Edge, Windows, Android…) más su tono y su ritmo.
 *
 * Orden de resolución de la voz de un consejero:
 *   1. personalización LOCAL de este navegador  (localStorage admira_voces_v1)
 *   2. personalización COMPARTIDA del equipo   (api.yokup.com /prefs/customize → customize.voices)
 *   3. CASTING de serie (abajo): lista de voces preferidas por nombre
 *   4. respaldo: una voz es-* del género del casting, repartida para que no se repitan
 * Si la voz elegida no existe en este equipo, se pasa al siguiente nivel.
 *
 * Uso (script clásico, también importable desde node:test):
 *   AdmiraVoces.speak("Steve Jobs", "texto", { onstart, onend })
 *   AdmiraVoces.preview("steve-jobs")        → frase de prueba con su voz
 *   AdmiraVoces.stop()
 *   AdmiraVoces.profile("Walt Disney")      → { voice, rate, pitch, lang, … }
 *   AdmiraVoces.portadaOn()                  → ¿locutar las respuestas en la portada?
 */
(function (root) {
  "use strict";

  var LS_KEY = "admira_voces_v1";
  var LS_PORTADA = "admira_voces_portada";
  var SHARED_URL = "https://api.yokup.com/prefs/customize";

  function slug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function plain(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // ── CASTING DE SERIE ────────────────────────────────────────────────────────
  // prefer: fragmentos del NOMBRE de voz, en orden. Cubren macOS (Jorge, Mónica,
  // Eddy, Reed, Rocko, Grandpa, Shelley, Sandy, Flo, Juan, Paulina, Diego…),
  // Edge/Windows (Microsoft Álvaro/Elvira Online (Natural), Pablo, Helena, Laura…)
  // y Chrome (Google español). La parte de idioma se comprueba con «lang».
  var CASTING = [
    // ── Leyendas ──
    // PROVISIONAL (Carlos, 12-11-2026 11:28 Madrid): voz femenina para
    // diferenciarlo rápido de Elon (Reed). Luego se pondrá su voz real. No usar Eddy.
    { persona: "Steve Jobs", role: "CEO", gen: "leyendas", genero: "f", lang: "es-ES", rate: 0.95, pitch: 1.05,
      prefer: ["Monica", "Paulina", "Marisol", "Shelley", "Sandy", "Flo", "Elvira", "Helena", "Laura", "Grandma"],
      prioridad: 1,
      timbre: "Provisional: voz femenina (Mónica) para distinguirlo al vuelo de Elon. Luego, su voz real.",
      frase: "Hola, soy Steve Jobs. Menos ruido y más foco: ¿qué vamos a crear hoy?" },
    { persona: "Steve Wozniak", role: "CTO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 1.06, pitch: 1.14,
      prefer: ["Pablo", "Juan", "Reed", "Alonso", "Gonzalo"],
      timbre: "Cálido y juguetón, un punto agudo; el ingeniero que se ríe construyendo.",
      frase: "¡Hola! Soy Woz. Si es elegante por dentro, lo demás llega solo. ¿Qué construimos?" },
    { persona: "Tim Cook", role: "COO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 0.95, pitch: 1.0,
      prefer: ["Juan", "Jorge", "Pablo", "Alvaro"],
      timbre: "Medido y amable; tono plano, sin prisa, de disciplina tranquila.",
      frase: "Soy Tim Cook. La excelencia operativa es disciplina. Dime el reto." },
    { persona: "Warren Buffett", role: "CFO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 0.86, pitch: 0.84,
      prefer: ["Lorenzo", "Jorge", "Diego", "Grandpa"],
      timbre: "Mayor, pausado y campechano; grave y con paciencia.",
      frase: "Soy Warren Buffett. El tiempo es amigo del buen negocio. ¿Dónde ponemos el capital?" },
    { persona: "Walt Disney", role: "CCO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 0.94, pitch: 1.04,
      prefer: ["Grandpa", "Rocko", "Alvaro", "Jorge"],
      timbre: "Abuelo cuentacuentos: cálido, envolvente, sonrisa en la voz.",
      frase: "Hola, soy Walt Disney. Si puedes soñarlo, puedes hacerlo. ¿Qué historia contamos?" },
    { persona: "Dieter Rams", role: "CDO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 0.88, pitch: 0.94,
      prefer: ["Eddy", "Pablo", "Jorge", "Alvaro"],
      timbre: "Seco, sobrio y exacto; pocas palabras, cada una en su sitio.",
      frase: "Soy Dieter Rams. Menos, pero mejor." },
    { persona: "Howard Schultz", role: "CXO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 1.0, pitch: 1.02,
      prefer: ["Alonso", "Juan", "Jorge", "Pablo"],
      timbre: "Persuasivo y cercano; la voz de quien te invita a quedarte.",
      frase: "Soy Howard Schultz. No vendemos café: creamos un tercer lugar. ¿Qué experiencia damos?" },
    { persona: "George Lucas", role: "CSO", gen: "leyendas", genero: "m", lang: "es-ES", rate: 0.9, pitch: 0.78,
      prefer: ["Rocko", "Alvaro", "Jorge", "Diego"],
      timbre: "Grave y narrativo; el que abre la saga en una galaxia muy lejana.",
      frase: "Soy George Lucas. Un buen relato sobrevive a todo. ¿Cuál es el mito que contamos?" },
    // ── Coetáneos ──
    { persona: "Elon Musk", role: "CEO", gen: "coetaneos", genero: "m", lang: "es-ES", rate: 1.2, pitch: 1.3,
      prefer: ["Reed", "Gonzalo", "Eddy", "Tomas", "Juan", "Diego"], prioridad: 2, evita: ["steve-jobs"],
      timbre: "Rápido y agudo, ideas que se atropellan: nunca suena como Jobs.",
      frase: "Soy Elon. Pensemos desde los primeros principios. ¿Qué límite rompemos?" },
    { persona: "Jensen Huang", role: "CTO", gen: "coetaneos", genero: "m", lang: "es-ES", rate: 1.1, pitch: 1.08,
      prefer: ["Jorge", "Juan", "Tomas", "Eddy"],
      timbre: "Enérgico y entusiasta; el keynote que nunca baja el ritmo.",
      frase: "¡Soy Jensen! Cuanto más cómputo, más lejos llegamos. ¿Qué escalamos?" },
    { persona: "Mira Murati", role: "COO", gen: "coetaneos", genero: "f", lang: "es-ES", rate: 1.04, pitch: 1.0,
      prefer: ["Elvira", "Monica", "Laura", "Google espanol", "Shelley"],
      timbre: "Firme y precisa; investigadora que convierte el modelo en producto.",
      frase: "Soy Mira Murati. La inteligencia se construye con rigor. ¿Qué vamos a entrenar y hasta dónde?" },
    { persona: "Ruth Porat", role: "CFO", gen: "coetaneos", genero: "f", lang: "es-ES", rate: 0.96, pitch: 0.94,
      prefer: ["Ximena", "Helena", "Monica", "Paulina", "Sandy", "Google espanol"],
      timbre: "Analítica y serena; registro medio-grave, números claros.",
      frase: "Soy Ruth Porat. Crecer, pero con cabeza. ¿Qué números sostienen esta idea?" },
    { persona: "John Lasseter", role: "CCO", gen: "coetaneos", genero: "m", lang: "es-ES", rate: 1.08, pitch: 1.16,
      prefer: ["Eddy", "Reed", "Tomas", "Juan"],
      timbre: "Entusiasta y cálido; camisa hawaiana en la voz.",
      frase: "¡Hola! Soy John Lasseter. El arte humaniza la tecnología. ¿Qué vamos a emocionar?" },
    { persona: "Jony Ive", role: "CDO", gen: "coetaneos", genero: "m", lang: "es-ES", rate: 0.86, pitch: 1.0,
      prefer: ["Pablo", "Jorge", "Alvaro", "Eddy"],
      timbre: "Suave y lento, casi en confidencia; cuidado en cada sílaba.",
      frase: "Soy Jony Ive. El cuidado se nota en lo que no se ve." },
    { persona: "Carlos Ratti", role: "CXO", gen: "coetaneos", genero: "m", lang: "es-ES", rate: 1.02, pitch: 1.06,
      prefer: ["Diego", "Lorenzo", "Tomas", "Juan"],
      timbre: "Vivo y mediterráneo; el urbanista que gesticula al hablar.",
      frase: "Soy Carlo Ratti. La ciudad es un organismo vivo. ¿Qué espacio activamos?" },
    { persona: "Ryan Reynolds", role: "CSO", gen: "coetaneos", genero: "m", lang: "es-ES", rate: 1.12, pitch: 1.04,
      prefer: ["Alonso", "Carlos", "Juan", "Reed"],
      timbre: "Ágil e irónico; remata cada frase con un guiño.",
      frase: "Soy Ryan Reynolds. Si no es memorable, no existe. ¿Cómo lo hacemos viral?" },
  ];
  var BY_SLUG = {};
  CASTING.forEach(function (c) { c.slug = slug(c.persona); BY_SLUG[c.slug] = c; });

  // Nombres de voces de serie habituales, para adivinar el género de una voz
  // del sistema en el respaldo (cuando no hay ninguna preferida instalada).
  var FEMENINAS = ["monica", "paulina", "elvira", "laura", "helena", "ximena", "dalia", "elena", "salome",
    "paloma", "catalina", "sabina", "shelley", "sandy", "flo", "grandma", "google espanol", "marisol",
    "lucia", "conchita", "penelope", "mia", "lupe", "abril", "irene", "estrella", "triz", "vera"];
  var MASCULINAS = ["jorge", "juan", "diego", "carlos", "alvaro", "pablo", "eddy", "reed", "rocko",
    "grandpa", "gonzalo", "tomas", "alonso", "lorenzo", "sebastian", "alex", "mateo", "manuel",
    "enrique", "miguel", "andres", "raul", "dario", "arnau", "jordi", "sergio"];
  function generoDe(v) {
    var n = plain(v && v.name);
    for (var i = 0; i < FEMENINAS.length; i++) if (n.indexOf(FEMENINAS[i]) >= 0) return "f";
    for (var j = 0; j < MASCULINAS.length; j++) if (n.indexOf(MASCULINAS[j]) >= 0) return "m";
    return "";
  }

  // ── Voces del navegador ─────────────────────────────────────────────────────
  var synth = root.speechSynthesis || null;
  var voices = [];
  var listeners = [];
  var voicesKnown = false;
  function loadVoices() {
    if (voicesPinned) return voices;
    try { voices = synth ? (synth.getVoices() || []) : []; } catch (e) { voices = []; }
    if (voices.length) voicesKnown = true;
    return voices;
  }
  // Al cargar una versión nueva, corta cualquier cola en curso (voz del sistema incluida).
  if (synth) {
    try { synth.cancel(); } catch (e) {}
    loadVoices();
    try {
      var prev = synth.onvoiceschanged;
      synth.onvoiceschanged = function (ev) {
        loadVoices(); resolved = null;
        listeners.forEach(function (fn) { try { fn(voices); } catch (e) {} });
        if (typeof prev === "function") try { prev.call(synth, ev); } catch (e) {}
      };
    } catch (e) {}
  }
  function onVoices(fn) { listeners.push(fn); }
  var voicesPinned = false;
  function setVoicesForTest(list) { voices = list || []; resolved = null; voicesKnown = true; voicesPinned = true; }
  function spanish(list) { return list.filter(function (v) { return /^es([-_]|$)/i.test(v.lang || ""); }); }
  function findByName(list, name) {
    if (!name) return null;
    for (var i = 0; i < list.length; i++) if (list[i].voiceURI === name || list[i].name === name) return list[i];
    return null;
  }
  // primera voz cuyo nombre contiene el fragmento; misma variante de idioma antes
  function findPreferred(list, frag, lang) {
    var f = plain(frag), base = String(lang || "es-ES").toLowerCase().replace("_", "-");
    var hits = list.filter(function (v) { return plain(v.name).indexOf(f) >= 0; });
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      function score(v) {
        var l = String(v.lang || "").toLowerCase().replace("_", "-"), n = plain(v.name);
        return (l === base ? 0 : 2) + (/natural|enhanced|mejorad|premium/.test(n) ? 0 : 1);
      }
      return score(a) - score(b);
    });
    return hits[0];
  }

  // Reparto de serie para TODA la mesa a la vez: así, en el respaldo, dos
  // consejeros no caen en la misma voz mientras queden voces libres.
  var resolved = null;
  function resolveAll() {
    if (resolved) return resolved;
    var all = voices.slice(), es = spanish(all), pool = es.length ? es : all;
    var used = {}, out = {};
    // Por RONDAS: primero la 1.ª preferencia de cada uno, luego la 2.ª… Así la voz
    // «de firma» de un consejero no se la lleva otro que la tenía de 3.ª opción.
    // Jobs y Elon (los de /hola) eligen antes que nadie, cada uno su lista completa:
    // así Jobs no acaba en una voz de reserva (p. ej. Eddy es-MX) porque otro se
    // llevó su grave «de firma» en la 1.ª ronda.
    CASTING.filter(function (c) { return c.prioridad; })
      .sort(function (a, b) { return a.prioridad - b.prioridad; })
      .forEach(function (c) {
        for (var i = 0; i < c.prefer.length && !out[c.slug]; i++) {
          var cand = findPreferred(pool, c.prefer[i], c.lang);
          if (cand && !used[cand.voiceURI || cand.name]) { used[cand.voiceURI || cand.name] = 1; out[c.slug] = { voice: cand, via: "casting" }; }
        }
      });
    var rondas = Math.max.apply(null, CASTING.map(function (c) { return c.prefer.length; }));
    for (var r = 0; r < rondas; r++) {
      CASTING.forEach(function (c) {
        if (out[c.slug] || !c.prefer[r]) return;
        var cand = findPreferred(pool, c.prefer[r], c.lang);
        if (cand && !used[cand.voiceURI || cand.name]) {
          used[cand.voiceURI || cand.name] = 1;
          out[c.slug] = { voice: cand, via: "casting" };
        }
      });
    }
    // 12-11-2026 11:36 Madrid (Carlos): solo las voces de su lista (preferidas + respaldos).
    // Si ninguna está instalada, silencio. NUNCA la voz por defecto del sistema
    // (Google español, Samantha, «Spanish (Spain)», etc. si no están en su lista).
    CASTING.forEach(function (c) {
      if (out[c.slug]) return;
      for (var j = 0; j < c.prefer.length; j++) {
        var compartida = findPreferred(pool, c.prefer[j], c.lang);
        if (compartida) {
          var ck = compartida.voiceURI || compartida.name;
          used[ck] = (used[ck] || 0) + 1;
          out[c.slug] = { voice: compartida, via: "casting" };
          return;
        }
      }
      out[c.slug] = { voice: null, via: "sin-voces" };
    });
    // «evita»: Elon nunca con la misma voz que Jobs mientras exista otra voz en español.
    CASTING.forEach(function (c) {
      (c.evita || []).forEach(function (otro) {
        var a = out[c.slug], b = out[otro];
        if (!a || !b || !a.voice || !b.voice || (a.voice.voiceURI || a.voice.name) !== (b.voice.voiceURI || b.voice.name)) return;
        var prohibida = b.voice.voiceURI || b.voice.name;
        var resto = pool.filter(function (v) { return (v.voiceURI || v.name) !== prohibida; });
        if (!resto.length) return;
        var pref = null;
        for (var i = 0; i < c.prefer.length && !pref; i++) pref = findPreferred(resto, c.prefer[i], c.lang);
        var mismo = resto.filter(function (v) { return generoDe(v) === c.genero; });
        var elegida = pref || (mismo.length ? mismo : resto).slice().sort(function (x, y) {
          return (used[x.voiceURI || x.name] || 0) - (used[y.voiceURI || y.name] || 0);
        })[0];
        out[c.slug] = { voice: elegida, via: a.via };
      });
    });
    resolved = out;
    return out;
  }

  // ── Personalización (local + compartida) ───────────────────────────────────
  var shared = {};
  function readLocal() {
    try { var d = JSON.parse(root.localStorage.getItem(LS_KEY) || "{}"); return d && typeof d === "object" ? d : {}; }
    catch (e) { return {}; }
  }
  function writeLocal(d) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(d || {})); } catch (e) {} }
  // PROVISIONAL: la voz femenina de Jobs gana sobre personalizaciones anteriores
  // (Jorge en localStorage admira_voces_v1 o api.yokup.com/prefs/customize).
  // Una personalización NUEVA, hecha ya con este sello (p. ej. en /voces), sí se respeta.
  // El resto de consejeros no se toca.
  var JOBS_SLUG = "steve-jobs";
  var JOBS_SELLO = "femenina-provisional-20261112";
  function clean(o) {
    var r = {};
    if (!o || typeof o !== "object") return r;
    if (typeof o.voice === "string" && o.voice) r.voice = o.voice.slice(0, 200);
    if (isFinite(o.rate)) r.rate = clamp(+o.rate, 0.5, 2);
    if (isFinite(o.pitch)) r.pitch = clamp(+o.pitch, 0, 2);
    if (typeof o.sello === "string" && o.sello) r.sello = o.sello.slice(0, 80);
    return r;
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function override(key) {
    var local = readLocal()[key], sh = shared[key];
    var r = {};
    [sh, local].forEach(function (o) { var c = clean(o); for (var k in c) r[k] = c[k]; });
    if (key === JOBS_SLUG && r.sello !== JOBS_SELLO) return {};
    return r;
  }
  function setOverride(persona, data) {
    var key = slug(persona), d = readLocal();
    var c = clean(data);
    if (key === JOBS_SLUG && (c.voice || c.rate != null || c.pitch != null)) c.sello = JOBS_SELLO;
    if (c.voice || c.rate != null || c.pitch != null) d[key] = c; else delete d[key];
    writeLocal(d);
  }
  function resetOverride(persona) { var d = readLocal(); delete d[slug(persona)]; writeLocal(d); }
  function localOverrides() { return readLocal(); }

  var sharedReady = null;
  function loadShared(fetchImpl) {
    var f = fetchImpl || root.fetch;
    if (!f) return Promise.resolve(shared);
    sharedReady = Promise.resolve(f(SHARED_URL, { cache: "no-store" }))
      .then(function (r) { return r && r.json ? r.json() : r; })
      .then(function (d) {
        var v = d && d.customize && d.customize.voices;
        shared = (v && typeof v === "object") ? v : {};
        return shared;
      })
      .catch(function () { return shared; });
    return sharedReady;
  }
  // Guarda para todo el equipo: lee el doc compartido ENTERO, cambia solo
  // «voices» y lo devuelve tal cual (agentes, máquinas y tablero intactos).
  function saveShared(map, fetchImpl) {
    var f = fetchImpl || root.fetch;
    var limpio = {};
    Object.keys(map || {}).forEach(function (k) {
      if (!BY_SLUG[k]) return;
      var c = clean(map[k]); if (Object.keys(c).length) limpio[k] = c;
    });
    return Promise.resolve(f(SHARED_URL, { cache: "no-store" }))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok === false || !d.customize || typeof d.customize !== "object") throw new Error("no se pudo leer la personalización compartida");
        var doc = d.customize;
        doc.voices = limpio;
        return f(SHARED_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customize: doc }) });
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || "no se pudo guardar");
        shared = limpio;
        return limpio;
      });
  }

  // ── Perfil final de un consejero ───────────────────────────────────────────
  function casting(persona) { return BY_SLUG[slug(persona)] || null; }
  function profile(persona) {
    var c = casting(persona);
    if (!c) return null;
    var o = override(c.slug);
    var auto = resolveAll()[c.slug] || { voice: null, via: "sin-voces" };
    var v = null, via = auto.via;
    if (o.voice) { v = findByName(voices, o.voice); if (v) via = "personalizada"; }
    if (!v) v = auto.voice;
    return {
      persona: c.persona, slug: c.slug, role: c.role, gen: c.gen, genero: c.genero,
      lang: (v && v.lang) || c.lang,
      voice: v, voiceName: v ? v.name : "", via: via,
      rate: o.rate != null ? o.rate : c.rate,
      pitch: o.pitch != null ? o.pitch : c.pitch,
      timbre: c.timbre, frase: c.frase, prefer: c.prefer.slice(),
      custom: !!(o.voice || o.rate != null || o.pitch != null),
    };
  }

  // Trozos ≤ 220 caracteres por frases: Chrome corta las locuciones largas (~15 s).
  function chunks(text, max) {
    max = max || 220;
    var t = String(text || "").replace(/[*_#`>]+/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var frases = t.match(/[^.!?…;:]+[.!?…;:]*["»”)]*\s*/g) || [t], out = [], cur = "";
    frases.forEach(function (f) {
      f = f.trim(); if (!f) return;
      while (f.length > max) {
        var cut = f.lastIndexOf(" ", max); if (cut < 40) cut = max;
        if (cur) { out.push(cur); cur = ""; }
        out.push(f.slice(0, cut).trim()); f = f.slice(cut).trim();
      }
      if ((cur + " " + f).trim().length > max) { if (cur) out.push(cur); cur = f; }
      else cur = (cur + " " + f).trim();
    });
    if (cur) out.push(cur);
    return out;
  }

  var current = null;
  function stop() {
    current = null;
    try { if (synth) synth.cancel(); } catch (e) {}
  }
  function speakWith(p, trozos, opts) {
    if (!p || !p.voice || !trozos.length) return false;
    stop();
    var token = {}; current = token;
    var i = 0, started = false;
    function next() {
      if (current !== token) return;
      if (i >= trozos.length) { current = null; if (opts.onend) opts.onend(); return; }
      var u = new root.SpeechSynthesisUtterance(trozos[i++]);
      // Sin u.voice el navegador usa la voz del sistema: nunca locutar en ese caso.
      u.voice = p.voice;
      u.lang = p.voice.lang || p.lang || "es-ES";
      u.rate = p.rate; u.pitch = p.pitch;
      if (opts.volume != null) u.volume = opts.volume;
      u.onstart = function () { if (!started) { started = true; if (opts.onstart) opts.onstart(p); } };
      u.onend = next;
      u.onerror = function (e) {
        if (current !== token) return;
        current = null;
        if (opts.onerror) opts.onerror(e); else if (opts.onend) opts.onend();
      };
      synth.speak(u);
    }
    next();
    return true;
  }
  function speak(persona, text, opts) {
    opts = opts || {};
    if (!synth || !root.SpeechSynthesisUtterance) { if (opts.onerror) opts.onerror(new Error("sin síntesis de voz")); return false; }
    if (!casting(persona)) { if (opts.onerror) opts.onerror(new Error("no es un consejero")); return false; }
    var trozos = chunks(text, opts.max);
    if (!trozos.length) return false;
    loadVoices();
    function attempt() {
      var p = profile(persona);
      if (!p || !p.voice) return false;
      return speakWith(p, trozos, opts);
    }
    var ok = (voices.length || voicesKnown) ? attempt() : false;
    if (ok) return true;
    if (voicesKnown || voices.length) {
      if (opts.onerror) opts.onerror(new Error("sin voz asignada"));
      return false;
    }
    // Voces aún no listas (Chrome/Safari): esperar un momento; si no hay voz de su lista, silencio.
    var token = {}; current = token;
    var done = false;
    function once() {
      if (done || current !== token) return;
      done = true;
      voicesKnown = true;
      loadVoices(); resolved = null;
      if (current !== token) return;
      if (!attempt()) {
        current = null;
        if (opts.onerror) opts.onerror(new Error("sin voz asignada"));
      }
    }
    onVoices(once);
    try { if (typeof root.setTimeout === "function") root.setTimeout(once, 1200); } catch (e) { once(); }
    return true;
  }
  function preview(persona, opts) {
    var c = casting(persona); if (!c) return false;
    return speak(c.persona, c.frase, opts);
  }
  function speaking() { return !!current; }
  function supported() { return !!(synth && root.SpeechSynthesisUtterance); }
  function available() { return voices.slice(); }

  function portadaOn() { try { return root.localStorage.getItem(LS_PORTADA) === "1"; } catch (e) { return false; } }
  function setPortada(on) { try { root.localStorage.setItem(LS_PORTADA, on ? "1" : "0"); } catch (e) {} }

  var api = {
    CASTING: CASTING, slug: slug, casting: casting, profile: profile, speak: speak, preview: preview,
    stop: stop, speaking: speaking, supported: supported, available: available, spanish: function () { return spanish(voices); },
    onVoices: onVoices, loadShared: loadShared, saveShared: saveShared, ready: function () { return sharedReady || Promise.resolve(shared); },
    setOverride: setOverride, resetOverride: resetOverride, localOverrides: localOverrides,
    sharedOverrides: function () { return JSON.parse(JSON.stringify(shared)); },
    portadaOn: portadaOn, setPortada: setPortada, chunks: chunks, generoDe: generoDe,
    _setVoicesForTest: setVoicesForTest, JOBS_SELLO: JOBS_SELLO, tieneVozAsignada: function (persona) { var p = profile(persona); return !!(p && p.voice); },
  };
  root.AdmiraVoces = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  // la personalización compartida se pide una vez al cargar (GET abierto)
  if (root.document && root.fetch) loadShared();
})(typeof window !== "undefined" ? window : globalThis);
