/* Micrófono y confirmación de comandos de playlist en /players (12-11-2026).
 * Mismo trato que el panel de demos 0-3: voz, texto y confirmación antes de enviar.
 * Si un consejero está locutando, el resultado se ignora.
 */
(function (root) {
  "use strict";
  var doc = root.document;
  if (!doc) return;

  var path = (root.location && root.location.pathname) || "";
  if (/^\/(hola|sala-voz|escena0|chat)(\/|$)/.test(path)) return;

  var Speech = root.SpeechRecognition || root.webkitSpeechRecognition;
  var P = root.AdmiraPlaylistVoz;
  if (!P) return;

  var $ = function (id) { return doc.getElementById(id); };
  var pending = null;
  var listening = false;
  var recognition = null;

  function setStatus(text) {
    var el = $("playlist-voz-status");
    if (el) el.textContent = text || "";
  }

  function propose(parsed) {
    var confirm = $("playlist-voz-confirm");
    if (!parsed || !parsed.ok) {
      pending = null;
      if (confirm) confirm.classList.remove("is-on");
      setStatus((parsed && parsed.mensaje) || "No he entendido el comando.");
      return;
    }
    pending = parsed;
    var understood = $("playlist-voz-understood");
    if (understood) understood.textContent = P.textoComando(parsed) + " ¿La envío?";
    if (confirm) confirm.classList.add("is-on");
    setStatus("");
    var yes = $("playlist-voz-yes");
    if (yes) yes.focus();
  }

  function sendPending() {
    if (!pending || !pending.ok) return;
    var pedido = pending;
    var ctrl = root.AdmiraPlayersPlaylist;
    if (!ctrl || typeof ctrl.ejecutar !== "function") {
      setStatus("Esta página no tiene un reproductor de playlist al que enviar el comando.");
      return;
    }
    var res = ctrl.ejecutar(pedido.cmd);
    pending = null;
    var confirm = $("playlist-voz-confirm");
    if (confirm) confirm.classList.remove("is-on");
    if (res && res.ok) {
      setStatus("Enviado: " + pedido.resumen + (res.screen ? " · " + res.screen : "") + ".");
    } else {
      setStatus((res && res.mensaje) || "No se ha podido enviar el comando.");
    }
  }

  function cancelPending() {
    pending = null;
    var confirm = $("playlist-voz-confirm");
    if (confirm) confirm.classList.remove("is-on");
    setStatus("Cancelado.");
  }

  function understandText() {
    var input = $("playlist-voz-text");
    propose(P.parseComando(input ? input.value : "", { ttsSpeaking: P.ttsActiva() }));
  }

  function startVoice() {
    var btn = $("playlist-voz-mic");
    if (!btn) return;
    if (!Speech) {
      btn.disabled = true;
      setStatus("Este navegador no tiene reconocimiento de voz (pasa en Firefox). Usa el texto o abre esta página en Chrome.");
      return;
    }
    if (P.ttsActiva()) {
      setStatus("Espera a que termine de hablar el consejero.");
      return;
    }
    if (listening && recognition) {
      recognition.stop();
      return;
    }
    recognition = new Speech();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = function () {
      listening = true;
      btn.setAttribute("aria-pressed", "true");
      btn.textContent = "Escuchando…";
      setStatus("Te escucho…");
    };
    recognition.onend = function () {
      listening = false;
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "Micrófono";
    };
    recognition.onerror = function (event) {
      var map = { "not-allowed": "No hay permiso de micrófono.", "no-speech": "No he oído nada.", network: "Fallo de red al reconocer la voz." };
      setStatus(map[event.error] || "No se ha podido reconocer la voz.");
    };
    recognition.onresult = function (event) {
      if (P.ttsActiva()) {
        setStatus("Ignorado: ahora mismo habla un consejero.");
        return;
      }
      var said = (event.results[0] && event.results[0][0] && event.results[0][0].transcript) || "";
      var input = $("playlist-voz-text");
      if (input) input.value = said;
      propose(P.parseComando(said, { ttsSpeaking: P.ttsActiva() }));
    };
    try { recognition.start(); }
    catch (e) { setStatus("No se ha podido arrancar el micrófono."); }
  }

  function wire() {
    var box = $("playlist-voz");
    if (!box) return;
    var send = $("playlist-voz-send");
    var mic = $("playlist-voz-mic");
    var yes = $("playlist-voz-yes");
    var no = $("playlist-voz-no");
    var input = $("playlist-voz-text");
    if (send) send.addEventListener("click", understandText);
    if (mic) mic.addEventListener("click", startVoice);
    if (yes) yes.addEventListener("click", sendPending);
    if (no) no.addEventListener("click", cancelPending);
    if (input) input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey || !event.shiftKey)) {
        event.preventDefault();
        understandText();
      }
    });
    if (!Speech && mic) {
      mic.disabled = true;
      setStatus("Este navegador no tiene reconocimiento de voz (pasa en Firefox). Puedes pedirlo por escrito o en Chrome.");
    }
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", wire);
  else wire();
})(typeof window !== "undefined" ? window : this);
