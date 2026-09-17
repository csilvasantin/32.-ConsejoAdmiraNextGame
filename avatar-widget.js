// Yokup · Copiloto Avatar — CONSUMIDOR FINO del avatar digital de Admira.
// La cabeza, el render, el lip-sync y la voz viven en digitalavatar.ai (fuente única):
// cualquier mejora/evolución que se haga allí llega SOLA a este asistente. Aquí solo se
// enchufa el CEREBRO de Yokup (contexto de incidencias: tickets D1 + KB + MTTR).
import { mount } from "https://digitalavatar.ai/embed.js";

mount({
  brainUrl: "https://api.yokup.com/copilot",
  title: "Admira · copiloto",
  greeting: "Hola, soy Admira. Puedo contarte el estado de las incidencias o ayudarte a resolver una avería.",
  placeholder: "Escribe o pulsa el micro…",
  lang: "es-ES",
  accent: "#78f3ff",
  // voiceUrl: (opcional) cuando digitalavatar.ai exponga un endpoint texto→voz premium,
  //           se añade aquí y el copiloto hablará con esa voz + lip-sync por audio real.
});
