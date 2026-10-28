const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { openDb } = require('../src/db');
const { createEngine } = require('../src/engine');
const { createApp } = require('../src/server');

function setup(opts) {
  const db = openDb(':memory:');
  const engine = createEngine(db, opts);
  const say = (text, sender = 'u1') => engine.handleMessage({ sender, text });
  const stock = (n) => db.prepare('SELECT stock FROM products WHERE name=?').get(n).stock;
  return { db, say, stock };
}
const pick = (r, name) => String(r.options.findIndex((o) => o.name === name) + 1);

test('multi-item sale updates stock and shows before → after', () => {
  const { say, stock } = setup();
  const r = say('sold 3 maggi small, 2 milk');
  assert.equal(r.kind, 'updated');
  assert.match(r.reply, /Maggi Small 40 → 37/);
  assert.match(r.reply, /Milk 1L 12 → 10/);
  assert.equal(stock('Maggi Small'), 37);
  assert.equal(stock('Milk 1L'), 10);
});

test('ambiguous maggi changes nothing until answered by number', () => {
  const { say, stock } = setup();
  const r = say('sold 3 maggi');
  assert.equal(r.kind, 'ask');
  assert.equal(r.options.length, 2);
  assert.equal(stock('Maggi Small'), 40);
  assert.equal(stock('Maggi Family'), 20);
  const r2 = say(pick(r, 'Maggi Family'));
  assert.equal(r2.kind, 'updated');
  assert.equal(stock('Maggi Family'), 17);
  assert.equal(stock('Maggi Small'), 40);
});

test('ambiguity can be answered with a word', () => {
  const { say, stock } = setup();
  say('sold 3 maggi');
  assert.equal(say('small').kind, 'updated');
  assert.equal(stock('Maggi Small'), 37);
});

test('two ambiguous items are asked one after the other', () => {
  const { say, stock } = setup();
  assert.equal(say('sold 3 maggi, 2 maggi').kind, 'ask');
  assert.equal(say('small').kind, 'ask');
  assert.equal(say('family').kind, 'updated');
  assert.equal(stock('Maggi Small'), 37);
  assert.equal(stock('Maggi Family'), 18);
});

test('pending questions are separate for each sender', () => {
  const { say, stock } = setup();
  say('sold 3 maggi', 'A');
  assert.equal(say('1', 'B').kind, 'error');
  assert.equal(say('small', 'A').kind, 'updated');
  assert.equal(stock('Maggi Small'), 37);
});

test('an invalid choice asks again and keeps the question', () => {
  const { say, stock } = setup();
  const r = say('sold 3 maggi');
  const again = say('7');
  assert.equal(again.kind, 'ask');
  assert.match(again.reply, /1 to 2/);
  assert.equal(say(pick(r, 'Maggi Small')).kind, 'updated');
  assert.equal(stock('Maggi Small'), 37);
});

test('cancel drops the pending question', () => {
  const { say, stock } = setup();
  say('sold 3 maggi');
  assert.equal(say('cancel').kind, 'info');
  assert.equal(say('small').kind, 'error');
  assert.equal(stock('Maggi Small'), 40);
});

test('a new message replaces the pending question', () => {
  const { say, stock } = setup();
  say('sold 3 maggi');
  assert.equal(say('sold 2 milk').kind, 'updated');
  assert.equal(say('small').kind, 'error');
  assert.equal(stock('Maggi Small'), 40);
  assert.equal(stock('Milk 1L'), 10);
});

test('pending question expires after 10 minutes', () => {
  let t = 0;
  const { say, stock } = setup({ now: () => t });
  say('sold 3 maggi');
  t += 11 * 60 * 1000;
  assert.equal(say('1').kind, 'error');
  assert.equal(stock('Maggi Small'), 40);
});

test('insufficient stock is refused with no change', () => {
  const { say, stock } = setup();
  const r = say('sold 500 milk');
  assert.equal(r.kind, 'error');
  assert.match(r.reply, /Only 12/);
  assert.equal(stock('Milk 1L'), 12);
});

test('undo reverses the last update', () => {
  const { say, stock } = setup();
  say('sold 2 milk');
  const r = say('undo');
  assert.equal(r.kind, 'undo');
  assert.equal(stock('Milk 1L'), 12);
  assert.equal(say('undo').kind, 'error');
});

test('low stock warning appears when stock reaches the minimum', () => {
  const { say } = setup();
  const r = say('sold 5 oil');
  assert.match(r.reply, /Low stock: Oil 1L/);
});

test('typed amount is echoed as total and per unit', () => {
  const { say } = setup();
  const r = say('sold 3 biscuits Rs. 30');
  assert.match(r.reply, /₹30 total \(₹10 each\)/);
});

test('parser errors come back as friendly replies', () => {
  const { say } = setup();
  assert.match(say('sold 3 chocolate').reply, /chocolate/);
});

test('HTTP: chat, products and bad input', async () => {
  const app = createApp(openDb(':memory:'));
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(base + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    const bad = await post({ text: 'sold 1 milk' });
    assert.equal(bad.status, 400);

    const ok = await (await post({ sender: 's1', text: 'sold 3 maggi small, 2 milk' })).json();
    assert.equal(ok.kind, 'updated');

    const products = await (await fetch(base + '/api/products')).json();
    const milk = products.find((p) => p.name === 'Milk 1L');
    assert.equal(milk.stock, 10);
    assert.equal(milk.low, false);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});