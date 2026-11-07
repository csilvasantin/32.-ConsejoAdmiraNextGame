// El sello de admira.live se GENERA al publicar (MorfeoMacMini, 15-10-2026): tools/sello-siguiente.py.
// El 15-10 a las 08:20 producción salió con «v.14.10.2026.r48.08:15», el sello de la víspera, porque
// deploy.sh lo copiaba del <meta> de control/index.html y nadie lo había subido.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const sello = (publicado, repo, ahora = '2026-10-15T08:40') => {
  const r = spawnSync('python3', ['tools/sello-siguiente.py', publicado, repo], { env: { ...process.env, ADMIRA_SELLO_AHORA: ahora }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
};

test('el caso del 15-10: con la r48 de ayer publicada y el repo sin subir, sale la r49 de hoy y sin novedades viejas', () => {
  assert.deepEqual(sello('v.14.10.2026.r48.08:15', 'v.14.10.2026.r48.08:15'), { code: 0, out: 'v.15.10.2026.r49.08:40 -', err: '' });
});

test('el número es global, no diario: el mismo día sigue contando y al cambiar de día no vuelve a r1', () => {
  assert.equal(sello('v.15.10.2026.r49.08:40', 'v.14.10.2026.r48.08:15', '2026-10-15T11:05').out, 'v.15.10.2026.r50.11:05 -');
  assert.equal(sello('v.15.10.2026.r50.11:05', 'v.14.10.2026.r48.08:15', '2026-10-16T00:03').out, 'v.16.10.2026.r51.00:03 -');
});

test('si alguien selló a mano el repo por encima de lo publicado, se respeta su número y sus novedades', () => {
  assert.equal(sello('v.14.10.2026.r48.08:15', 'v.15.10.2026.r52.08:30').out, 'v.15.10.2026.r52.08:40 v.15.10.2026.r52.08:30');
  assert.equal(sello('v.14.10.2026.r48.08:15', 'v.15.10.2026.r49.08:30').out, 'v.15.10.2026.r49.08:40 v.15.10.2026.r49.08:30');
});

test('sin sello publicado legible numera desde el repo y lo avisa; un sello de repo roto para el despliegue', () => {
  const r = sello('', 'v.14.10.2026.r48.08:15');
  assert.equal(r.out, 'v.15.10.2026.r49.08:40 -');
  assert.match(r.err, /no pude leer el sello publicado/);
  assert.equal(sello('v.14.10.2026.r48.08:15', 'v14-10').code, 1);
});

test('el meta de /control que hay en main lo acepta deploy.sh y la siguiente publicación incrementa', () => {
  const html = fs.readFileSync(new URL('./control/index.html', import.meta.url), 'utf8');
  const match = html.match(/admiranext-version" content="AdmiraNeXT (v\.[^"]+)"/);
  assert.ok(match, 'deploy.sh exige AdmiraNeXT v.DD.MM.AAAA.rN.HH:MM');
  const repo = match[1];
  assert.equal(repo, 'v.07.11.2026.r123.16:15');
  assert.equal(sello(repo, repo, '2026-11-07T16:20').code, 0);
  assert.equal(sello(repo, repo, '2026-11-07T16:20').out, 'v.07.11.2026.r124.16:20 -');
});

test('deploy.sh usa el sello generado (no el <meta> a pelo) y no repite las novedades de un sello viejo', () => {
  const sh = fs.readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  assert.match(sh, /read -r SELLO NOVEDADES_CLAVE < <\(python3 tools\/sello-siguiente\.py "\$PUBLICADO" "\$SELLO_REPO"\)/);
  assert.match(sh, /https:\/\/www\.admira\.live\/version\.json/);
  assert.doesNotMatch(sh, /^SELLO="\$\(sed /m, 'el sello ya no se copia del <meta>');
  assert.match(sh, /if \$r != "-" then \.\[\$r\] else null end/);
  assert.match(sh, /--arg v "\$SELLO"/, 'version.json y el <meta> de todas las páginas llevan el sello generado');
  // Sin novedades propias: los commits desde lo publicado, antes que el «default» (de una publicación concreta).
  assert.match(sh, /git log --no-merges --format=%s "\$GIT_PUBLICADO\.\.HEAD"/);
  assert.match(sh, /\(if \$c != \[\] then \$c else null end\) \/\/ \.default/);
  assert.match(sh, /fleet-control\/machine-id\.js/);
  assert.match(sh, /controlIdFor/);
});
