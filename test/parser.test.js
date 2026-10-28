const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { parseMessage } = require('../src/parser');

const db = openDb(':memory:');
const brief = (r) => r.items.map((i) => [i.name, i.qty, i.type, i.amount ?? null]);

const STOCK_CASES = [
  ['sold 3 Maggi Small', [['Maggi Small', 3, 'sold', null]]],
  ['sold 3 maggi small, 2 milk', [['Maggi Small', 3, 'sold', null], ['Milk 1L', 2, 'sold', null]]],
  ['sold 3 maggi small, 2 milk and 1 oil',
    [['Maggi Small', 3, 'sold', null], ['Milk 1L', 2, 'sold', null], ['Oil 1L', 1, 'sold', null]]],
  ['3 maggi small gone', [['Maggi Small', 3, 'sold', null]]],
  ['I sold three packets of Maggi Small', [['Maggi Small', 3, 'sold', null]]],
  ['  SOLD   3   MILK ', [['Milk 1L', 3, 'sold', null]]],
  ['received 20 rice bags', [['Rice 5kg', 20, 'received', null]]],
  ['damaged 1 oil', [['Oil 1L', 1, 'damaged', null]]],
  ['returned 2 biscuits', [['Biscuits', 2, 'returned', null]]],
  ['sold 3 biscuits Rs. 30', [['Biscuits', 3, 'sold', 30]]],
  ['sold 3 biscuits ₹30', [['Biscuits', 3, 'sold', 30]]],
  ['sold 3 biscuits for 25', [['Biscuits', 3, 'sold', 25]]],
  ['bech diya 2 milk', [['Milk 1L', 2, 'sold', null]]],
  ['sold milk 2', [['Milk 1L', 2, 'sold', null]]],
  ['sold 3 mlik', [['Milk 1L', 3, 'sold', null]]],
  ['sold 3 maggi smal', [['Maggi Small', 3, 'sold', null]]],
  ['sold 2 oils', [['Oil 1L', 2, 'sold', null]]],
  ['sold 2 milk, received 20 rice', [['Milk 1L', 2, 'sold', null], ['Rice 5kg', 20, 'received', null]]],
  ['3 maggi small, 2 milk gone', [['Maggi Small', 3, 'sold', null], ['Milk 1L', 2, 'sold', null]]],
  ['sold 2 rice 5kg', [['Rice 5kg', 2, 'sold', null]]],
];

for (const [input, expected] of STOCK_CASES) {
  test(`stock: "${input}"`, () => {
    const r = parseMessage(input, db);
    assert.equal(r.kind, 'stock', JSON.stringify(r));
    assert.deepEqual(brief(r), expected);
  });
}

test('ambiguous "maggi" asks which one and resolves nothing', () => {
  const r = parseMessage('sold 3 maggi', db);
  assert.equal(r.kind, 'ask');
  assert.deepEqual(r.pending[0].options.map((o) => o.name).sort(), ['Maggi Family', 'Maggi Small']);
  assert.match(r.question, /Which/);
  assert.equal(r.items[0].productId, null);
});

test('a typo that fits both maggis also asks', () => {
  assert.equal(parseMessage('sold 3 magi', db).kind, 'ask');
});

test('multi-item with one ambiguous item keeps the resolved one', () => {
  const r = parseMessage('sold 3 maggi, 2 milk', db);
  assert.equal(r.kind, 'ask');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[1].name, 'Milk 1L');
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0].index, 0);
});

const ERROR_CASES = [
  'sold -5 maggi small', 'sold 0 milk', 'sold 2.5 milk', 'sold 3 chocolate',
  'sold maggi small', '3 milk', 'hello', '', '   ', 'sold 99999 milk',
  'sold 3 milk, 3 chocolate', 'received 2 milk, 5 chocolate',
];
for (const input of ERROR_CASES) {
  test(`error: "${input}"`, () => {
    const r = parseMessage(input, db);
    assert.equal(r.kind, 'error', JSON.stringify(r));
    assert.ok(r.message.length > 0);
  });
}

test('unknown product is named in the error', () => {
  assert.match(parseMessage('sold 3 milk, 3 chocolate', db).message, /chocolate/);
});

test('undo is recognised', () => {
  assert.equal(parseMessage('undo', db).kind, 'undo');
  assert.equal(parseMessage('Undo!', db).kind, 'undo');
});

test('parsing never writes to the database', () => {
  assert.equal(db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 0);
  assert.equal(db.prepare("SELECT stock FROM products WHERE name='Milk 1L'").get().stock, 12);
});