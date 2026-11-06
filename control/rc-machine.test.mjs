import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { selectControlId, frameRequest, inputRequest, controlIdFor, canonicalControlUrl, esFalloPermisoCaptura } = require('../fleet-control/machine-id.js');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const machineId = readFileSync(new URL('../fleet-control/machine-id.js', import.meta.url));
const seal = createHash('sha256').update(machineId).digest('hex').slice(0, 12);

const census = [
  { id: 'macbookairplata', host: 'macbookairplata.tail48b61c.ts.net' },
  { id: 'macmini', host: 'macmini.tail48b61c.ts.net' },
];

test('el botón y el deep link eligen el id canónico sin cambiar el resto de tarjetas', () => {
  assert.equal(selectControlId('admira-macbookairplata', census), 'macbookairplata');
  assert.equal(selectControlId('macmini', census), 'macmini');
  assert.equal(selectControlId('admira-macbookairplata', []), 'admira-macbookairplata');
  assert.equal(frameRequest('admira-macbookairplata', census).query.machine, 'macbookairplata');
  assert.equal(inputRequest('MacBookAirPlata', census, { type: 'text', text: 'hola' }).body.machine, 'macbookairplata');
  assert.equal(inputRequest('macbookairgold', census, { type: 'text', text: 'hola' }).body.machine, 'macbookairgold');
  assert.equal(controlIdFor('admira-macbookairplata'), 'macbookairplata');
  assert.equal(controlIdFor({ id: 'admira-macbookairplata' }, 'macbookairplata'), 'macbookairplata');
  assert.equal(controlIdFor('admira-macbookairplata', 'macmini'), 'macbookairplata');
  assert.equal(controlIdFor('macbookair'), 'macbookair');
  assert.equal(canonicalControlUrl('https://admira.live/control/?rc=macbookairplata'), 'https://www.admira.live/control/?rc=macbookairplata');
  assert.equal(canonicalControlUrl('https://www.admira.live/control?rc=macbookairplata'), 'https://www.admira.live/control/?rc=macbookairplata');
  assert.equal(canonicalControlUrl('https://www.admira.live/control/?rc=macbookairplata'), null);
  assert.equal(canonicalControlUrl('https://example.test/control/'), null);
  assert.equal(esFalloPermisoCaptura('ERR_NO_CAPTURE'), true);
  assert.equal(esFalloPermisoCaptura({ error: 'capture_failed_or_no_permission' }), true);
  assert.equal(esFalloPermisoCaptura('sin respuesta en 12000 ms'), false);
  assert.equal(esFalloPermisoCaptura({ error: 'máquina desconocida' }), false);
});

test('la página publica el resolvedor, el censo del hub y un diagnóstico que no miente', () => {
  assert.match(html, new RegExp('/fleet-control/machine-id\\.js\\?v=20261106-r2-' + seal));
  assert.match(html, /data-rc="\$\{rcMachineId\(m\.id\)\}"/);
  assert.match(html, /machineId=rcMachineId\(machineId\)/);
  assert.match(html, /HUB_CENSUS=CENSO\.map/);
  assert.match(html, /classifyStatusFailure/);
  assert.match(html, /FLEET_MESH\.request\('\/health'/);
  assert.match(html, /el relay ya contestó; se reintenta despacio/);
  assert.doesNotMatch(html, /fetch\(API\+'\/health'/);
  assert.match(html, /content="AdmiraNeXT v\.06\.11\.2026\.r122\.09:40"/);
  assert.match(html, /canonicalControlUrl\(location\.href\)/);
});
