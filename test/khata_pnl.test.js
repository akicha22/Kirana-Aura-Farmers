const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createEngine } = require('../src/engine');
const {
  recordCustomerCredit,
  recordCustomerPayment,
  getCustomers,
  getPnL,
  listProductsWithDemand,
  applyStock,
} = require('../src/ledger');

test('Customer Khata: credit and payment via ledger', () => {
  const db = openDb(':memory:');

  // Record credit for customer
  const c1 = recordCustomerCredit(db, { customerName: 'Ramesh', amount: 300 });
  assert.equal(c1.ok, true);
  assert.equal(c1.balance, 300);

  // Add more credit
  const c2 = recordCustomerCredit(db, { customerName: 'Ramesh', amount: 150 });
  assert.equal(c2.balance, 450);

  // Customer pays part of the due
  const p1 = recordCustomerPayment(db, { customerName: 'Ramesh', amount: 200 });
  assert.equal(p1.ok, true);
  assert.equal(p1.balance, 250);

  // Check customer list
  const list = getCustomers(db);
  assert.equal(list.totalCustomers, 1);
  assert.equal(list.totalDue, 250);
  assert.equal(list.customers[0].name, 'Ramesh');
});

test('Customer Khata: conversational chat commands', () => {
  const db = openDb(':memory:');
  const engine = createEngine(db);

  const res1 = engine.handleMessage({ sender: 'shopkeeper', text: 'Ramesh credit 250' });
  assert.equal(res1.kind, 'updated');
  assert.match(res1.reply, /Credit Recorded/);
  assert.match(res1.reply, /250/);

  const res2 = engine.handleMessage({ sender: 'shopkeeper', text: 'Ramesh paid 100' });
  assert.equal(res2.kind, 'updated');
  assert.match(res2.reply, /Payment Received/);
  assert.match(res2.reply, /150/); // 250 - 100 = 150 remaining
});

test('Profit and Loss: calculates sales, cogs, damage loss, and net profit', () => {
  const db = openDb(':memory:');

  const atta = db.prepare('SELECT id, price, cost_price FROM products WHERE name = ?').get('Aashirvaad Atta 5kg');
  assert.ok(atta);
  assert.equal(atta.price, 245);
  assert.equal(atta.cost_price, 210);

  // Sell 2 units of Atta: Revenue = 490, Cost = 420, Profit = 70
  applyStock(db, [{ productId: atta.id, qty: 2, type: 'sold' }]);

  // Damage 1 unit of Atta: Loss = 210
  applyStock(db, [{ productId: atta.id, qty: 1, type: 'damaged' }]);

  const pnl = getPnL(db, 'day');
  assert.equal(pnl.totalSales, 490);
  assert.equal(pnl.cogs, 420);
  assert.equal(pnl.grossProfit, 70);
  assert.equal(pnl.damagedLoss, 210);
  assert.equal(pnl.netProfit, -140); // 70 - 210 = -140
  assert.equal(pnl.totalSoldQty, 2);
  assert.equal(pnl.totalDamageQty, 1);
});

test('High demand tag: flags products with top sales volume', () => {
  const db = openDb(':memory:');
  const milk = db.prepare('SELECT id FROM products WHERE name = ?').get('Milk 1L');
  assert.ok(milk);

  // Sell 10 units of milk
  applyStock(db, [{ productId: milk.id, qty: 10, type: 'sold' }]);

  const products = listProductsWithDemand(db);
  const milkItem = products.find((p) => p.name === 'Milk 1L');
  assert.equal(milkItem.isHighDemand, true);
  assert.equal(milkItem.unitsSold, 10);
});
