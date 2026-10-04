'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createYokupTickets, TICKET_RE } = require('./yokup-ticket');

const key = Buffer.alloc(32, 7);

test('un relay emite el ticket y otro lo canjea sin compartir memoria', () => {
  let now = 1_000_000;
  const emisor = createYokupTickets({ key, now: () => now });
  const canje = createYokupTickets({ key, now: () => now });
  const ticket = emisor.mint('CSilva@admira.com');
  assert.match(ticket, TICKET_RE);
  assert.equal(canje.consume(ticket), 'csilva@admira.com');
});

test('el ticket caduca y una firma de otro secreto no vale', () => {
  let now = 5_000;
  const tickets = createYokupTickets({ key, now: () => now });
  const ticket = tickets.mint('csilva@admira.com');
  now += 61_000;
  assert.equal(tickets.consume(ticket), '');
  const otro = createYokupTickets({ key: Buffer.alloc(32, 9), now: () => 5_000 });
  assert.equal(otro.consume(createYokupTickets({ key, now: () => 5_000 }).mint('csilva@admira.com')), '');
});

test('un ticket manipulado no devuelve el correo', () => {
  const tickets = createYokupTickets({ key, now: () => 5_000 });
  const ticket = tickets.mint('csilva@admira.com');
  const flipped = (ticket[0] === 'A' ? 'B' : 'A') + ticket.slice(1);
  assert.equal(tickets.consume(flipped), '');
  assert.equal(tickets.consume(''), '');
  assert.equal(tickets.mint('no-es-un-correo'), '');
});
