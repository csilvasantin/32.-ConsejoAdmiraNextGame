/*
 * Censo de la flota SIN datos de red (seguridad, 09-11-2026, auditoría PortAventuraNeXT, aprobado por Carlos).
 * Antes /machines.json, /data/machines.json y /docs/machines.json salían tal cual: IP de Tailscale,
 * MAC, usuarios y comandos SSH, FQDN de la tailnet y notas internas, para cualquiera.
 * Ahora:
 *   - sin token: solo lo que pintan los paneles (id, nombre, miembro, rol, estado, color...);
 *   - con token de máquina (Authorization: Bearer / X-Council-Token = COUNCIL_MACHINE_TOKEN o
 *     CONSUMOS_LECTURAS_TOKEN): el censo completo, como antes.
 * deploy.sh ya no publica los ficheros estáticos: el dato vive solo en este bundle.
 */
import { autorizado } from "./api/consumos/lecturas.js";

const PUBLICOS = ["id", "name", "member", "role", "machineRole", "status", "lastSeen", "unitType", "color", "platform", "location"];

export function sanear(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const machines = Array.isArray(d.machines) ? d.machines : [];
  return {
    team: d.team || "",
    updatedAt: d.updatedAt || null,
    machines: machines.map((m) => {
      const out = {};
      for (const k of PUBLICOS) if (m && m[k] != null) out[k] = m[k];
      return out;
    }),
  };
}

export function responder(doc, request, env) {
  const completo = autorizado(request, env) === true;
  const body = completo ? doc : sanear(doc);
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      vary: "Authorization, X-Council-Token",
    },
  });
}
