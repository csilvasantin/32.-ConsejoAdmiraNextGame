#!/usr/bin/env node
// clave-flota.mjs <Persona> <Equipo> — deriva la clave del MCP de admira.live de una pareja
// persona+equipo con la semilla MCP_FLOTA_SEED (misma HMAC que el worker). La semilla se
// lee de $MCP_FLOTA_SEED o de ~/.fleet/mcp-flota.seed (600). Solo para quien tenga la
// semilla (el Mac Mini): la flota lee su clave de la bóveda (MCP_KEY_<PERSONA>_<EQUIPO>).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { claveFlota } from '../src/yokup.js';
const [persona, equipo] = process.argv.slice(2);
if (!persona || !equipo) { console.error('uso: clave-flota.mjs <Persona> <Equipo>'); process.exit(2); }
let seed = process.env.MCP_FLOTA_SEED || '';
if (!seed) { try { seed = fs.readFileSync(path.join(os.homedir(), '.fleet', 'mcp-flota.seed'), 'utf8').trim(); } catch { /* sin semilla */ } }
if (!seed) { console.error('falta MCP_FLOTA_SEED (o ~/.fleet/mcp-flota.seed)'); process.exit(3); }
process.stdout.write(await claveFlota({ MCP_FLOTA_SEED: seed }, persona, equipo));
