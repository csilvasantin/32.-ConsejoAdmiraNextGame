/**
 * /13rue/api/hablar — proxy de mismo origen hacia el bus de La Incubadora.
 *
 * POR QUÉ EXISTE. El front llamaba directo a incubadora-bus.csilvasantin.workers.dev.
 * Los ISP españoles bloquean *.workers.dev en el navegador (ver la nota de flota
 * "workers-dev-bloqueo-es"), así que hablar con los agentes —la función estrella de
 * 13rue— estaba MUERTA justo para el público objetivo, mientras funcionaba
 * perfectamente desde fuera de España. Un fallo que no se ve desde donde se prueba.
 *
 * Con este proxy el navegador solo habla con admira.live; quien va a workers.dev es
 * el edge de Cloudflare, que no está sujeto al bloqueo del ISP del visitante.
 */

const BUS = "https://incubadora-bus.csilvasantin.workers.dev/hablar";
const LIMITE = 16 * 1024; // el cuerpo es un prompt y un JSON de estado, no un fichero

export async function onRequestPost({ request }) {
  let cuerpo;
  try {
    cuerpo = await request.text();
  } catch {
    return json({ ok: false, error: "no se pudo leer la petición" }, 400);
  }
  if (cuerpo.length > LIMITE) {
    return json({ ok: false, error: "petición demasiado grande" }, 413);
  }

  try {
    const r = await fetch(BUS, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cuerpo,
      // el bus tarda ~5 s en contestar; damos margen sin dejarlo colgado
      signal: AbortSignal.timeout(25000),
    });
    const texto = await r.text();
    return new Response(texto, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    // el front ya sabe pintar {ok:false,error}; que el fallo sea legible y no un 502 mudo
    return json({ ok: false, error: "el bus no contesta (" + (e && e.name ? e.name : "error") + ")" }, 502);
  }
}

// Un GET aquí es casi siempre alguien probando a mano: que diga qué es.
export function onRequestGet() {
  return json({ ok: false, error: "usa POST", que_es: "proxy de mismo origen al bus de La Incubadora" }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
