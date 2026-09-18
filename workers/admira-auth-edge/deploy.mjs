// Deployment guard: tests + real authorization dependency + protected live health.
// Credentials only travel over stdin/HTTPS, never as process arguments or output.
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
process.chdir(dirname(fileURLToPath(import.meta.url)));
function run(command, args, input) {
  const result = spawnSync(command, args, {encoding:'utf8', input, stdio:input ? ['pipe','inherit','inherit'] : 'inherit'});
  if (result.error || result.status !== 0) throw new Error('Deployment step failed: ' + command);
}
function secret(name, file) {
  const value = String(process.env[name] || readFileSync(process.env[name+'_FILE'] || file, 'utf8')).trim();
  if (!value || /[\r\n]/.test(value)) throw new Error('Missing or invalid ' + name);
  return value;
}
async function check(url, headers, predicate, label) {
  const response = await fetch(url, {headers, redirect:'error', signal:AbortSignal.timeout(15000)});
  if (!response.ok || !predicate(await response.json())) throw new Error(label + ' failed (HTTP ' + response.status + ')');
  console.log(label + ': OK');
}
try {
  const auth = secret('AUTH_EDGE_SHARED_SECRET', join(homedir(), '.fleet/auth-edge-shared-secret'));
  if (process.argv.includes('--check-only')) {
    await check('https://www.admira.live/auth/health', {Authorization:'Bearer '+auth}, x => x.ok === true && x.authorization === 'ready', 'Auth Edge → private whitelist');
  } else {
    run(process.execPath, ['--test','test/index.test.mjs']);
    const whitelist = secret('WHITELIST_MACHINE_TOKEN', join(homedir(), 'fleet-control/.whitelist-machine-token'));
    await check('https://whitelist.admira.store/list', {'X-Whitelist-Token':whitelist}, x => Array.isArray(x.superusers) && x.superusers.every(v => typeof v === 'string'), 'Private whitelist preflight');
    run('npx', ['--yes','wrangler','secret','put','WHITELIST_MACHINE_TOKEN'], whitelist+'\n');
    run('npx', ['--yes','wrangler','deploy']);
    await check('https://www.admira.live/auth/health', {Authorization:'Bearer '+auth}, x => x.ok === true && x.authorization === 'ready', 'Auth Edge → private whitelist');
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
