/* informe-pdf.js — genera el PDF de un parte de misión, entero en el navegador.
 *
 * Por qué a mano y no con una librería: el PDF tiene que poder salir del perímetro de
 * Yokup y abrirse en cualquier sitio, así que las capturas van DENTRO del fichero, no
 * enlazadas. Eso se consigue con canvas→JPEG→DCTDecode, que PDF admite tal cual. Y sin
 * CDN: una dependencia externa en una página tras verja es una pieza más que se puede
 * caer y que nadie mira hasta que falla.
 *
 * Las imágenes viven en el worker (/media/…) y responden con Access-Control-Allow-Origin:*
 * → se pueden dibujar en un canvas sin contaminarlo y exportarlas. Si algún día se quita
 * ese CORS, el PDF seguirá saliendo pero sin capturas (se avisa dentro del documento, que
 * es mejor que un hueco mudo).
 *
 * Uso:  await window.informePDF(tarea)   → descarga informe-<mision>-<code>.pdf
 */
(function () {
  "use strict";

  // ── A4 en puntos (1 pt = 1/72") ──────────────────────────────────────────────────
  var PW = 595.28, PH = 841.89, MG = 48, CW = PW - MG * 2;

  // ── Bytes ────────────────────────────────────────────────────────────────────────
  // El PDF mezcla texto y JPEG binario: se construye como lista de trozos de bytes y
  // los desplazamientos del xref se cuentan en BYTES, nunca en caracteres.
  function latin1(str) {
    // Helvetica + WinAnsiEncoding cubre Latin-1. Lo que no entre (emoji, CJK) se
    // translitera o cae a '?': mejor un parte legible que un PDF roto.
    // Latin-1 SÍ tiene tildes y ñ: las etiquetas van en español correcto. Lo que no cabe
    // son los signos tipográficos finos y los emoji.
    var map = { "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "→": "->", "←": "<-", "✅": "[ok]", "❌": "[x]", "⚠": "[!]", "✔": "[ok]", "•": "-", "\t": "    " };
    var out = [];
    // Recorrer por PUNTO DE CÓDIGO: indexando por unidad UTF-16 los emoji nunca casan con
    // el mapa (son pares suplentes) y se colaban como '?' suelto.
    var cps = Array.from(str);
    for (var i = 0; i < cps.length; i++) {
      var ch = cps[i], c = ch.codePointAt(0);
      if (map[ch] !== undefined) { for (var j = 0; j < map[ch].length; j++) out.push(map[ch].charCodeAt(j)); continue; }
      if (c === 13) continue;
      if (c === 10) { out.push(10); continue; }
      if (c < 32) continue;
      if (c <= 255) { out.push(c); continue; }
      // Emoji, pictogramas, selectores de variación y juntadores: son decorativos, así que
      // se quitan sin rastro. Un '?' en mitad de la frase ensucia más que la ausencia.
      if (c === 0xfe0f || c === 0xfe0e || c === 0x200d ||
          (c >= 0x2190 && c <= 0x2bff) || (c >= 0x1f000 && c <= 0x1ffff) ||
          (c >= 0x2600 && c <= 0x27bf) || (c >= 0xe000 && c <= 0xf8ff)) continue;
      out.push(63); // resto de caracteres fuera de Latin-1 (p. ej. CJK): '?' honesto
    }
    // Los emoji quitados dejan dobles espacios: se compactan sin tocar los saltos de línea.
    var s2 = [];
    for (var k = 0; k < out.length; k++) {
      if (out[k] === 32 && s2.length && s2[s2.length - 1] === 32) continue;
      s2.push(out[k]);
    }
    return new Uint8Array(s2);
  }
  function bytes(s) { return latin1(s); }
  function pdfStr(s) { return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }

  // ── Medida de texto: canvas con la MISMA familia que usará el PDF ────────────────
  var _mc = document.createElement("canvas").getContext("2d");
  function width(txt, size, bold) {
    _mc.font = (bold ? "bold " : "") + size + "px Helvetica, Arial, sans-serif";
    return _mc.measureText(txt).width;
  }
  function wrap(txt, size, bold, max) {
    var out = [];
    String(txt == null ? "" : txt).split(/\n/).forEach(function (para) {
      if (!para.trim()) { out.push(""); return; }
      var line = "";
      para.split(/\s+/).forEach(function (w) {
        // una palabra sola más ancha que la caja (una URL larga): partirla por fuerza
        while (width(w, size, bold) > max) {
          var cut = w.length;
          while (cut > 1 && width(w.slice(0, cut), size, bold) > max) cut--;
          if (line) { out.push(line); line = ""; }
          out.push(w.slice(0, cut)); w = w.slice(cut);
        }
        var probe = line ? line + " " + w : w;
        if (width(probe, size, bold) > max) { out.push(line); line = w; }
        else line = probe;
      });
      if (line) out.push(line);
    });
    return out;
  }

  // ── Imagen → JPEG embebible ──────────────────────────────────────────────────────
  function loadJPEG(url) {
    return new Promise(function (resolve) {
      if (!url) return resolve(null);
      var img = new Image();
      img.crossOrigin = "anonymous";           // sin esto el canvas se contamina y toDataURL revienta
      var done = false;
      var fin = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { fin(null); }, 12000);   // una captura lenta no bloquea el parte
      img.onerror = function () { fin(null); };
      img.onload = function () {
        try {
          // Tope de 1400 px de ancho: por encima solo engorda el fichero sin verse mejor.
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) return fin(null);
          var k = Math.min(1, 1400 / w);
          var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
          var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
          var cx = cv.getContext("2d");
          cx.fillStyle = "#0a1620"; cx.fillRect(0, 0, cw, ch);   // JPEG no tiene alfa
          cx.drawImage(img, 0, 0, cw, ch);
          var b64 = cv.toDataURL("image/jpeg", 0.82).split(",")[1];
          var bin = atob(b64), arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          fin({ data: arr, w: cw, h: ch });
        } catch (e) { fin(null); }   // canvas contaminado (CORS retirado) → parte sin captura
      };
      img.src = url;
    });
  }

  // ── Documento ────────────────────────────────────────────────────────────────────
  function Doc() {
    this.pages = [];      // { ops:[], imgs:[{name,img}] }
    this.newPage();
  }
  Doc.prototype.newPage = function () {
    this.page = { ops: [], imgs: [] };
    this.pages.push(this.page);
    this.y = PH - MG;
    return this.page;
  };
  Doc.prototype.room = function (h) { if (this.y - h < MG + 26) this.newPage(); };
  Doc.prototype.rgb = function (hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };
  Doc.prototype.text = function (txt, o) {
    o = o || {};
    var size = o.size || 10.5, bold = !!o.bold, lead = o.lead || size * 1.42;
    var col = this.rgb(o.color || "#111820"), max = o.max || CW, x = o.x == null ? MG : o.x;
    var lines = wrap(txt, size, bold, max);
    for (var i = 0; i < lines.length; i++) {
      this.room(lead);
      if (lines[i]) {
        this.page.ops.push("BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " +
          col[0].toFixed(3) + " " + col[1].toFixed(3) + " " + col[2].toFixed(3) + " rg " +
          "1 0 0 1 " + x.toFixed(2) + " " + (this.y - size).toFixed(2) + " Tm (" + pdfStr(lines[i]) + ") Tj ET");
      }
      this.y -= lead;
    }
    return this;
  };
  Doc.prototype.gap = function (h) { this.y -= (h == null ? 8 : h); return this; };
  Doc.prototype.rect = function (x, y, w, h, hex) {
    var c = this.rgb(hex);
    this.page.ops.push("q " + c[0].toFixed(3) + " " + c[1].toFixed(3) + " " + c[2].toFixed(3) +
      " rg " + x.toFixed(2) + " " + y.toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2) + " re f Q");
  };
  Doc.prototype.rule = function (hex) { this.room(10); this.rect(MG, this.y, CW, 0.7, hex || "#c9d6de"); this.y -= 10; };
  // Alto que ocupará la imagen ya escalada a la caja.
  Doc.prototype.imgH = function (img) {
    if (!img) return 0;
    var w = Math.min(CW, img.w), h = img.h * (w / img.w);
    var maxH = PH - MG * 2 - 60;
    if (h > maxH) h = maxH;
    return h;
  };
  // Bloque de evidencia INDIVISIBLE: título + captura + pie. Sin esto el título se queda
  // huérfano al final de una página y la imagen aparece sola en la siguiente, con un hueco
  // enorme en medio (pasó en la primera prueba).
  Doc.prototype.evidencia = function (titulo, img, pie) {
    if (!img) return this;
    var alto = 14 + 5 + this.imgH(img) + 4 + 11;
    if (this.y - alto < MG + 26) this.newPage();
    this.text(titulo, { size: 9.5, bold: true, color: "#11202a" });
    this.gap(5);
    this.image(img, pie);
    return this;
  };
  Doc.prototype.image = function (img, cap) {
    if (!img) return this;
    var w = Math.min(CW, img.w), h = img.h * (w / img.w);
    var maxH = PH - MG * 2 - 60;
    if (h > maxH) { h = maxH; w = img.w * (h / img.h); }
    if (this.y - h < MG + 26) this.newPage();
    var name = "I" + this.pages.length + "_" + this.page.imgs.length;
    this.page.imgs.push({ name: name, img: img });
    this.page.ops.push("q " + w.toFixed(2) + " 0 0 " + h.toFixed(2) + " " + MG.toFixed(2) + " " +
      (this.y - h).toFixed(2) + " cm /" + name + " Do Q");
    this.y -= h + 4;
    if (cap) this.text(cap, { size: 8, color: "#6b7c88" });
    return this;
  };

  // ── Serializar ───────────────────────────────────────────────────────────────────
  Doc.prototype.build = function (meta) {
    var objs = [], chunks = [];
    var add = function (body) { objs.push(body); return objs.length; };   // 1-indexado

    var catalog = add(null), pagesObj = add(null);
    var f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    var f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    var kids = [], self = this;
    this.pages.forEach(function (pg) {
      var xo = [];
      pg.imgs.forEach(function (it) {
        var id = add({ img: it.img });
        xo.push("/" + it.name + " " + id + " 0 R");
      });
      var content = add({ stream: pg.ops.join("\n") });
      var pid = add("<< /Type /Page /Parent " + pagesObj + " 0 R /MediaBox [0 0 " + PW + " " + PH + "] " +
        "/Resources << /Font << /F1 " + f1 + " 0 R /F2 " + f2 + " 0 R >>" +
        (xo.length ? " /XObject << " + xo.join(" ") + " >>" : "") + " >> " +
        "/Contents " + content + " 0 R >>");
      kids.push(pid + " 0 R");
    });

    objs[catalog - 1] = "<< /Type /Catalog /Pages " + pagesObj + " 0 R >>";
    objs[pagesObj - 1] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + this.pages.length + " >>";
    var info = add("<< /Title (" + pdfStr(meta.title) + ") /Author (Yokup · AdmiraNeXT) " +
      "/Creator (yokup.com/informes) /Subject (" + pdfStr(meta.subject || "") + ") >>");

    var len = 0, push = function (b) { chunks.push(b); len += b.length; };
    push(bytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));

    var offsets = [];
    objs.forEach(function (body, i) {
      offsets.push(len);
      push(bytes((i + 1) + " 0 obj\n"));
      if (body && body.img) {
        push(bytes("<< /Type /XObject /Subtype /Image /Width " + body.img.w + " /Height " + body.img.h +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + body.img.data.length + " >>\nstream\n"));
        push(body.img.data);            // JPEG crudo: PDF lo entiende con DCTDecode
        push(bytes("\nendstream"));
      } else if (body && body.stream !== undefined) {
        var s = bytes(body.stream);
        push(bytes("<< /Length " + s.length + " >>\nstream\n"));
        push(s);
        push(bytes("\nendstream"));
      } else {
        push(bytes(body));
      }
      push(bytes("\nendobj\n"));
    });

    var xref = len;
    var x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (o) { x += ("0000000000" + o).slice(-10) + " 00000 n \n"; });
    x += "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalog + " 0 R /Info " + info + " 0 R >>\n" +
      "startxref\n" + xref + "\n%%EOF\n";
    push(bytes(x));

    var out = new Uint8Array(len), at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return new Blob([out], { type: "application/pdf" });
  };

  // ── El parte ─────────────────────────────────────────────────────────────────────
  var ST = { pending: "Pendiente", in_progress: "En curso", done: "Hecha" };
  var OWN = { principal: "Agente principal", subagente: "Subagente", infraagente: "Infraagente" };
  function ms(v) { v = +v || 0; return v > 4102444800 ? v : v * 1000; }
  function fecha(v) {
    var t = ms(v); if (!t) return "-";
    var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " a las " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function campo(doc, etq, val) {
    if (val == null || val === "" ) return;
    doc.room(15);
    var y0 = doc.y;
    doc.page.ops.push("BT /F2 8.5 Tf 0.42 0.49 0.53 rg 1 0 0 1 " + MG + " " + (y0 - 8.5).toFixed(2) +
      " Tm (" + pdfStr(etq.toUpperCase()) + ") Tj ET");
    var lines = wrap(String(val), 10, false, CW - 132);
    for (var i = 0; i < lines.length; i++) {
      if (i) doc.room(13);
      doc.page.ops.push("BT /F1 10 Tf 0.07 0.09 0.12 rg 1 0 0 1 " + (MG + 132) + " " +
        (doc.y - 10).toFixed(2) + " Tm (" + pdfStr(lines[i]) + ") Tj ET");
      doc.y -= 13;
    }
    doc.y -= 3;
  }

  window.informePDF = async function (t) {
    var mid = t.mission_id || "?", code = t.code || "";
    var titulo = t.subject || t.title || "Informe de misión";

    // Las capturas primero: si tardan, que tarde ANTES de montar nada.
    // El worker sólo publica `process_image` cuando live_kind='process'. Usar
    // live_shot directamente convertiría un final-fallback degradado en una
    // captura de proceso dentro del PDF, aunque la tabla lo oculte correctamente.
    var proc = await loadJPEG(t.process_image);
    var shot = await loadJPEG(t.image);

    var doc = new Doc();

    // Cabecera
    doc.rect(0, PH - 96, PW, 96, "#02080d");
    doc.page.ops.push("BT /F2 17 Tf 0.47 0.95 1 rg 1 0 0 1 " + MG + " " + (PH - 48) + " Tm (YOKUP) Tj ET");
    doc.page.ops.push("BT /F1 9 Tf 0.46 0.67 0.73 rg 1 0 0 1 " + (MG + 62) + " " + (PH - 48) + " Tm (INFORME DE MISIÓN) Tj ET");
    doc.page.ops.push("BT /F1 8.5 Tf 0.30 0.48 0.53 rg 1 0 0 1 " + MG + " " + (PH - 68) + " Tm (" +
      pdfStr("Parte del infraagente · generado desde yokup.com/informes") + ") Tj ET");
    var badge = (ST[t.status] || t.status || "").toUpperCase();
    if (badge) {
      var bw = width(badge, 8.5, true) + 18;
      doc.rect(PW - MG - bw, PH - 56, bw, 17, t.status === "done" ? "#1d5c37" : t.status === "in_progress" ? "#1b4a63" : "#5c4a12");
      doc.page.ops.push("BT /F2 8.5 Tf 1 1 1 rg 1 0 0 1 " + (PW - MG - bw + 9) + " " + (PH - 50.5) + " Tm (" + pdfStr(badge) + ") Tj ET");
    }
    doc.y = PH - 96 - 26;

    doc.text(mid + (code ? "  ·  " + code : ""), { size: 9.5, bold: true, color: "#3a8fa6" });
    doc.gap(2);
    doc.text(titulo, { size: 16, bold: true, color: "#0d1720", lead: 20 });
    doc.gap(10);
    doc.rule("#dbe5ea");

    // Ficha
    doc.text("Datos de la misión", { size: 8.5, bold: true, color: "#6b7c88" });
    doc.gap(6);
    campo(doc, "Misión", mid);
    campo(doc, "Tarea", code);
    var machine=t.machine||t.target_machine||t.loc||t.mission_machine||(t.mission&&t.mission.machine)||"";
    var rawAgent=t.agent_identity||t.owner||"";
    var agent=(window.ykAgentIdentity?window.ykAgentIdentity.reportDisplay(rawAgent,machine):rawAgent)||"-";
    campo(doc, "Agente", agent + (OWN[t.owner] ? "  (" + OWN[t.owner] + ")" : ""));
    campo(doc, "Ejecutor", t.assignee);
    campo(doc, "Estado", ST[t.status] || t.status);
    campo(doc, "Origen", t.source === "fleet" ? "Flota" : t.source);
    campo(doc, "Pantalla", t.screen);
    campo(doc, "Ubicación", t.loc);
    campo(doc, "Creada", fecha(t.mission_created));
    campo(doc, "Reportada", fecha(t.updated_at));
    doc.gap(6);
    doc.rule("#dbe5ea");

    // El parte, ENTERO (en la tabla se ve recortado a 4 líneas)
    doc.gap(2);
    doc.text("Informe", { size: 8.5, bold: true, color: "#6b7c88" });
    doc.gap(7);
    doc.text(t.report || "(sin texto de informe)", { size: 11, color: "#11202a", lead: 16.5 });
    doc.gap(12);

    // Pruebas
    if (proc || shot) {
      // El rótulo de sección también tiene que viajar con su primera captura: si no, se
      // queda solo al pie de una página con un palmo de blanco debajo.
      var primera = proc || shot;
      var altoCab = 10 + 12 + 8;                                   // regla + rótulo + hueco
      var altoPrim = 14 + 5 + doc.imgH(primera) + 4 + 11;          // bloque de evidencia
      if (doc.y - (altoCab + altoPrim) < MG + 26) doc.newPage();
      doc.rule("#dbe5ea");
      doc.text("Evidencias", { size: 8.5, bold: true, color: "#6b7c88" });
      doc.gap(8);
      if (proc) { doc.evidencia("Proceso · el CLI trabajando la misión", proc, "Captura del proceso durante la ejecución."); doc.gap(12); }
      if (shot) { doc.evidencia("Captura de prueba · el resultado", shot, "Captura del resultado final."); doc.gap(12); }
    }
    if ((t.process_image && !proc) || (t.image && !shot)) {
      doc.text("Nota: alguna captura no pudo incrustarse (no fue accesible al generar el PDF).", { size: 8.5, color: "#8a6a2a" });
      doc.gap(6);
    }

    // Pie en todas las páginas
    var total = doc.pages.length, gen = fecha(Date.now());
    doc.pages.forEach(function (pg, i) {
      pg.ops.push("q 0.85 0.89 0.91 rg " + MG + " " + (MG + 16) + " " + CW + " 0.6 re f Q");
      pg.ops.push("BT /F1 7.5 Tf 0.52 0.58 0.62 rg 1 0 0 1 " + MG + " " + MG + " Tm (" +
        pdfStr("Yokup · AdmiraNeXT   " + mid + (code ? " " + code : "") + "  ·  generado el " + gen) + ") Tj ET");
      var pag = "Página " + (i + 1) + " de " + total;
      pg.ops.push("BT /F1 7.5 Tf 0.52 0.58 0.62 rg 1 0 0 1 " + (PW - MG - width(pag, 7.5, false)).toFixed(2) + " " + MG + " Tm (" + pdfStr(pag) + ") Tj ET");
    });

    var blob = doc.build({ title: "Informe " + mid + (code ? " " + code : ""), subject: titulo });
    var name = ("informe-" + mid + (code ? "-" + code : "")).replace(/[^\w.-]+/g, "-") + ".pdf";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    return name;
  };
})();
