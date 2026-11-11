/* Admira Live · service worker mínimo de /hola/ (#7546 Fase 1).
 * Solo pass-through de red: no abre Cache Storage ni guarda respuestas.
 * El manejador fetch es el que hace instalable la PWA en Chrome.
 *
 * Fase 2 (Capacitor, no se implementa aquí): identificador com.admira.live,
 * detección de «Hola Admira» en segundo plano y login nativo de Google
 * (el inicio de sesión en una vista web incrustada lo bloquea Google).
 */
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function (event) {
  event.respondWith(fetch(event.request));
});
