const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../src/db');
const { applyStock, undoLast } = require('../src/ledger');

const fresh = () => openDb(':memory:');
const pid = (db, n) => db.prepare('SELECT id FROM products WHERE name=?').get(n).id;
const stock = (db, n) => db.prepare('SELECT stock FROM products WHERE name=?').get(n).stock;

test('sold 3 Maggi Small deducts exactly 3', () => {
  const db = fresh();
  const r = applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty: 3, type: 'sold' }]);
  assert.equal(r.ok, true);
  assert.deepEqual([r.changes[0].before, r.changes[0].after], [40, 37]);
  assert.equal(stock(db, 'Maggi Small'), 37);
  assert.equal(db.prepare('SELECT delta FROM transactions').get().delta, -3);
});

test('multi-item message updates both products', () => {
  const db = fresh();
  const r = applyStock(db, [
    { productId: pid(db, 'Maggi Small'), qty: 3, type: 'sold' },
    { productId: pid(db, 'Milk 1L'), qty: 2, type: 'sold' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(stock(db, 'Maggi Small'), 37);
  assert.equal(stock(db, 'Milk 1L'), 10);
});

test('received 20 Maggi Small adds 20', () => {
  const db = fresh();
  applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty: 20, type: 'received' }]);
  assert.equal(stock(db, 'Maggi Small'), 60);
});

test('insufficient stock is rejected and nothing changes', () => {
  const db = fresh();
  const r = applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty: 999, type: 'sold' }]);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INSUFFICIENT_STOCK');
  assert.equal(stock(db, 'Maggi Small'), 40);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 0);
});

test('multi-item is all-or-nothing', () => {
  const db = fresh();
  const r = applyStock(db, [
    { productId: pid(db, 'Maggi Small'), qty: 3, type: 'sold' },
    { productId: pid(db, 'Milk 1L'), qty: 999, type: 'sold' },
  ]);
  assert.equal(r.ok, false);
  assert.equal(stock(db, 'Maggi Small'), 40);
});

test('bad quantities are rejected', () => {
  const db = fresh();
  for (const qty of [0, -5, 1.5, NaN, '3']) {
    const r = applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty, type: 'sold' }]);
    assert.equal(r.code, 'BAD_QTY');
  }
  assert.equal(stock(db, 'Maggi Small'), 40);
});

test('undo restores stock and writes a reversal row', () => {
  const db = fresh();
  applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty: 3, type: 'sold' }]);
  const u = undoLast(db);
  assert.equal(u.ok, true);
  assert.equal(stock(db, 'Maggi Small'), 40);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions WHERE type='reversal'").get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 2); // history kept
  assert.equal(undoLast(db).code, 'NOTHING_TO_UNDO');
});

test('undo walks backwards one batch at a time', () => {
  const db = fresh();
  applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty: 3, type: 'sold' }]);
  applyStock(db, [{ productId: pid(db, 'Milk 1L'), qty: 2, type: 'sold' }]);
  undoLast(db);
  assert.equal(stock(db, 'Milk 1L'), 12);
  assert.equal(stock(db, 'Maggi Small'), 37);
  undoLast(db);
  assert.equal(stock(db, 'Maggi Small'), 40);
});

test('data survives closing and reopening the database file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kirana-'));
  const file = path.join(dir, 'test.db');
  let db = openDb(file);
  applyStock(db, [{ productId: pid(db, 'Maggi Small'), qty: 3, type: 'sold' }]);
  db.close();
  db = openDb(file);
  assert.equal(stock(db, 'Maggi Small'), 37); // not re-seeded back to 40
  db.close();
});