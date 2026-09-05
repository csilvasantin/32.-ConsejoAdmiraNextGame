// probe-yokup.mjs <tool> '<json>' — llama al MCP de yokup.com con la credencial de ~/.fleet/mcp/yokup-<Actor>.json (YOKUP_MCP_FILE)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'node:fs'; import os from 'node:os';
const cred = JSON.parse(fs.readFileSync(process.env.YOKUP_MCP_FILE || `${os.homedir()}/.fleet/mcp/yokup-MorfeoMacMini.json`, 'utf8'));
const t = new StreamableHTTPClientTransport(new URL(cred.endpoint), { requestInit: { headers: { Authorization: 'Bearer ' + cred.token } } });
const c = new Client({ name: 'morfeo-probe-yokup', version: '1.0' });
await c.connect(t);
const tool = process.argv[2];
if (!tool) { const { tools } = await c.listTools(); console.log(tools.map((x) => x.name).join(' ')); }
else { const r = await c.callTool({ name: tool, arguments: JSON.parse(process.argv[3] || '{}') }); console.log((r.content[0] && r.content[0].text || JSON.stringify(r)).slice(0, Number(process.env.MAX || 2500))); }
await c.close();
