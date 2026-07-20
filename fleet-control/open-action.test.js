'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeWebUrl,
  parseOpenRequest,
  macOpenCommand,
  linuxOpenCommand,
  windowsOpenCommand
} = require('./open-action');

test('normaliza dominios sin protocolo a https', () => {
  assert.equal(normalizeWebUrl('www.marca.com'), 'https://www.marca.com/');
  assert.equal(normalizeWebUrl('marca.com/deportes'), 'https://marca.com/deportes');
  assert.equal(normalizeWebUrl('localhost:3000/panel'), 'http://localhost:3000/panel');
});

test('separa navegador y URL con nombres simples o entrecomillados', () => {
  const firefox = parseOpenRequest('firefox www.marca.com');
  assert.equal(firefox.app, 'firefox');
  assert.equal(firefox.browser.id, 'firefox');
  assert.equal(firefox.url, 'https://www.marca.com/');
  assert.equal(firefox.fullscreen, true);

  const chrome = parseOpenRequest('"Google Chrome" https://www.admira.live/control/');
  assert.equal(chrome.app, 'Google Chrome');
  assert.equal(chrome.browser.id, 'chrome');
  assert.equal(chrome.url, 'https://www.admira.live/control/');
});

test('mantiene el comportamiento de abrir solamente una app', () => {
  const request = parseOpenRequest('Safari');
  assert.equal(request.app, 'Safari');
  assert.equal(request.url, '');
  assert.equal(request.fullscreen, false);
});

test('rechaza protocolos no web', () => {
  assert.throws(() => normalizeWebUrl('file:///etc/passwd'), /solo se admiten/);
  assert.throws(() => normalizeWebUrl('javascript:alert(1)'), /solo se admiten/);
});

test('genera macOS con URL escapada, AXFullScreen y fallback verificado', () => {
  const command = macOpenCommand('Firefox https://example.com/?q=a&x=1');
  assert.match(command, /open -a 'Firefox' 'https:\/\/example\.com\/\?q=a&x=1'/);
  assert.match(command, /AXFullScreen/);
  assert.match(command, /if isFull is false then/);
  assert.match(command, /control down, command down/);
  assert.match(command, /fullscreen-requested/);
  assert.match(command, /OPEN_OSA_I.*-lt 20/);
  assert.equal((command.match(/open -a 'Firefox'/g) || []).length, 1);
  assert.doesNotMatch(command, /set value of attribute/);
});

test('genera Linux en modo kiosco para Firefox y Chromium', () => {
  const firefox = linuxOpenCommand('Firefox www.marca.com', 'GUI; ');
  assert.match(firefox, /GUI; /);
  assert.match(firefox, /'--kiosk' 'https:\/\/www\.marca\.com\/'/);

  const chrome = linuxOpenCommand('Chrome https://example.com', '');
  assert.match(chrome, /'--kiosk' '--no-first-run'/);
});

test('genera Windows con ejecutable y argumentos de kiosco', () => {
  const command = windowsOpenCommand('Edge www.marca.com');
  assert.match(command, /-EncodedCommand/);
  const encoded = command.split(' ').at(-1);
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.match(script, /msedge\.exe/);
  assert.match(script, /--kiosk/);
  assert.match(script, /https:\/\/www\.marca\.com\//);
});

test('el shell quoting impide ejecutar metacaracteres de la URL', () => {
  const command = macOpenCommand('Firefox https://example.com/?next=x;touch-pwned');
  assert.match(command, /'https:\/\/example\.com\/\?next=x;touch-pwned'/);
});
