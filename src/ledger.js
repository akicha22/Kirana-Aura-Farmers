const { randomUUID } = require('node:crypto');

const EFFECT = { sold: -1, damaged: -1, received: 1, returned: 1 };

class LedgerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => ({ ok: false, code, message });

// items: [{ productId, qty, type, amount? }]  -> all-or-nothing
function applyStock(db, items, { source = 'web' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return fail('NO_ITEMS', 'Nothing to record.');

  const batchId = randomUUID();
  const getP = db.prepare('SELECT * FROM products WHERE id = ?');
  const setStock = db.prepare('UPDATE products SET stock = ? WHERE id = ?');
  const insTx = db.prepare(`INSERT INTO transactions
    (batch_id, type, product_id, qty, delta, amount, cost_amount, source) VALUES (?,?,?,?,?,?,?,?)`);

  const run = db.transaction(() => {
    const changes = [];
    for (const it of items) {
      const sign = EFFECT[it.type];
      if (!sign) throw new LedgerError('BAD_TYPE', `Unknown action "${it.type}".`);
      if (!Number.isInteger(it.qty) || it.qty <= 0)
        throw new LedgerError('BAD_QTY', 'Quantity must be a whole number above 0.');
      const p = getP.get(it.productId);
      if (!p) throw new LedgerError('NO_PRODUCT', 'Unknown product.');

      const delta = sign * it.qty;
      const after = p.stock + delta;
      if (after < 0)
        throw new LedgerError('INSUFFICIENT_STOCK',
          `Only ${p.stock} ${p.name} in stock. Can't ${it.type === 'sold' ? 'sell' : 'remove'} ${it.qty}.`);

      const amount = it.amount ?? (it.type === 'sold' ? p.price * it.qty : null);
      const costAmount = (p.cost_price || 0) * it.qty;

      setStock.run(after, p.id);
      insTx.run(batchId, it.type, p.id, it.qty, delta, amount, costAmount, source);
      changes.push({ productId: p.id, name: p.name, type: it.type, qty: it.qty,
                     before: p.stock, after, amount, costAmount });
    }
    return changes;
  });

  try { return { ok: true, batchId, changes: run() }; }
  catch (e) { if (e instanceof LedgerError) return fail(e.code, e.message); throw e; }
}

// Reverses the most recent batch that hasn't been undone yet.
function undoLast(db, { source = 'web' } = {}) {
  const last = db.prepare(`
    SELECT batch_id FROM transactions
    WHERE type != 'reversal'
      AND id NOT IN (SELECT reverses_id FROM transactions WHERE reverses_id IS NOT NULL)
    ORDER BY id DESC LIMIT 1`).get();
  if (!last) return fail('NOTHING_TO_UNDO', 'Nothing to undo.');

  const rows = db.prepare(
    `SELECT * FROM transactions WHERE batch_id = ? AND type != 'reversal' ORDER BY id DESC`
  ).all(last.batch_id);

  const batchId = randomUUID();
  const getP = db.prepare('SELECT * FROM products WHERE id = ?');
  const setStock = db.prepare('UPDATE products SET stock = ? WHERE id = ?');
  const insTx = db.prepare(`INSERT INTO transactions
    (batch_id, type, product_id, qty, delta, amount, cost_amount, source, reverses_id) VALUES (?,?,?,?,?,?,?,?,?)`);

  const run = db.transaction(() => {
    const changes = [];
    for (const r of rows) {
      if (r.product_id) {
        const p = getP.get(r.product_id);
        const after = p.stock - r.delta;
        if (after < 0)
          throw new LedgerError('CANNOT_UNDO', `Can't undo: ${p.name} stock would go below 0.`);
        setStock.run(after, p.id);
        insTx.run(batchId, 'reversal', p.id, r.qty, -r.delta, r.amount ? -r.amount : null, r.cost_amount ? -r.cost_amount : 0, source, r.id);
        changes.push({ productId: p.id, name: p.name, undone: r.type, before: p.stock, after });
      } else if (r.customer_id) {
        // Reversing customer transaction
        const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.customer_id);
        if (cust) {
          const revDelta = r.type === 'credit_sale' ? -r.amount : r.amount;
          const newBal = cust.balance + revDelta;
          db.prepare('UPDATE customers SET balance = ? WHERE id = ?').run(newBal, cust.id);
          insTx.run(batchId, 'reversal', null, null, 0, -r.amount, 0, source, r.id);
          changes.push({ customerId: cust.id, name: cust.name, undone: r.type, newBalance: newBal });
        }
      }
    }
    return changes;
  });

  try { return { ok: true, batchId, changes: run() }; }
  catch (e) { if (e instanceof LedgerError) return fail(e.code, e.message); throw e; }
}

/* ---------- Customer Khata / Credit Management ---------- */

function getOrCreateCustomer(db, name, phone = null) {
  const cleanName = name.trim();
  let cust = db.prepare('SELECT * FROM customers WHERE name = ? COLLATE NOCASE').get(cleanName);
  if (!cust) {
    const ins = db.prepare('INSERT INTO customers (name, phone, balance) VALUES (?,?,0)');
    const id = ins.run(cleanName, phone).lastInsertRowid;
    cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }
  return cust;
}

function recordCustomerCredit(db, { customerName, amount, phone = null, source = 'web' }) {
  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return fail('BAD_CUSTOMER', 'Customer name is required.');
  }
  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return fail('BAD_AMOUNT', 'Credit amount must be greater than 0.');
  }

  const batchId = randomUUID();
  const run = db.transaction(() => {
    const cust = getOrCreateCustomer(db, customerName, phone);
    const newBalance = (cust.balance || 0) + amt;
    db.prepare('UPDATE customers SET balance = ? WHERE id = ?').run(newBalance, cust.id);
    db.prepare(`INSERT INTO transactions
      (batch_id, type, customer_id, amount, source) VALUES (?, 'credit_sale', ?, ?, ?)`
    ).run(batchId, cust.id, amt, source);
    return { customerId: cust.id, name: cust.name, amount: amt, balance: newBalance };
  });

  try {
    const res = run();
    return { ok: true, batchId, ...res };
  } catch (e) {
    return fail('TX_FAILED', e.message);
  }
}

function recordCustomerPayment(db, { customerName, amount, source = 'web' }) {
  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return fail('BAD_CUSTOMER', 'Customer name is required.');
  }
  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return fail('BAD_AMOUNT', 'Payment amount must be greater than 0.');
  }

  const batchId = randomUUID();
  const run = db.transaction(() => {
    const cust = getOrCreateCustomer(db, customerName);
    const newBalance = Math.max(0, (cust.balance || 0) - amt);
    db.prepare('UPDATE customers SET balance = ? WHERE id = ?').run(newBalance, cust.id);
    db.prepare(`INSERT INTO transactions
      (batch_id, type, customer_id, amount, source) VALUES (?, 'payment', ?, ?, ?)`
    ).run(batchId, cust.id, amt, source);
    return { customerId: cust.id, name: cust.name, amount: amt, balance: newBalance };
  });

  try {
    const res = run();
    return { ok: true, batchId, ...res };
  } catch (e) {
    return fail('TX_FAILED', e.message);
  }
}

function getCustomers(db) {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone, c.balance,
      (SELECT MAX(ts) FROM transactions WHERE customer_id = c.id) as last_tx_date,
      (SELECT COUNT(*) FROM transactions WHERE customer_id = c.id) as total_txs
    FROM customers c
    ORDER BY c.balance DESC, c.name ASC
  `).all();

  const totalDue = rows.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
  const totalCustomers = rows.length;
  const customersWithDue = rows.filter((c) => c.balance > 0).length;

  return { customers: rows, totalDue, totalCustomers, customersWithDue };
}

function getCustomerStatement(db, customerId) {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!cust) return null;

  const txs = db.prepare(`
    SELECT id, batch_id, type, amount, source, ts
    FROM transactions
    WHERE customer_id = ?
    ORDER BY id DESC
    LIMIT 50
  `).all(customerId);

  return { customer: cust, transactions: txs };
}

/* ---------- High Demand & Inventory Metrics ---------- */

function listProductsWithDemand(db) {
  const products = db.prepare(`
    SELECT p.id, p.name, p.price, p.cost_price, p.stock, p.min_stock,
      COALESCE((
        SELECT SUM(qty) FROM transactions
        WHERE product_id = p.id AND type = 'sold'
      ), 0) AS units_sold
    FROM products p
    ORDER BY p.name ASC
  `).all();

  // Determine top selling products for High Demand badge
  // High demand: products in the top sales bracket with >= 5 units sold
  const maxSold = Math.max(...products.map((p) => p.units_sold), 0);
  const threshold = Math.max(5, Math.floor(maxSold * 0.4));

  return products.map((p) => ({
    ...p,
    low: p.stock <= p.min_stock,
    isHighDemand: maxSold >= 5 && p.units_sold >= threshold,
    unitsSold: p.units_sold,
  }));
}

/* ---------- Profit & Loss Calculation ---------- */

function getPnL(db, period = 'day') {
  // SQLite date filters:
  // 'day': today's transactions
  // 'month': current month transactions
  const timeFilter = period === 'month'
    ? `(strftime('%Y-%m', ts) = strftime('%Y-%m', 'now') OR strftime('%Y-%m', ts, 'localtime') = strftime('%Y-%m', 'now', 'localtime'))`
    : `(date(ts) = date('now') OR date(ts, 'localtime') = date('now', 'localtime'))`;

  // Sales aggregates
  const salesRow = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS total_sales,
      COALESCE(SUM(cost_amount), 0) AS total_cogs,
      COALESCE(SUM(qty), 0) AS total_sold_qty,
      COUNT(*) AS tx_count
    FROM transactions
    WHERE type = 'sold' AND ${timeFilter}
  `).get();

  // Damaged / Expired items
  const damageRow = db.prepare(`
    SELECT
      COALESCE(SUM(cost_amount), 0) AS total_damage_loss,
      COALESCE(SUM(qty), 0) AS total_damage_qty
    FROM transactions
    WHERE type = 'damaged' AND ${timeFilter}
  `).get();

  // Received / Restocked items
  const receivedRow = db.prepare(`
    SELECT
      COALESCE(SUM(cost_amount), 0) AS total_received_value,
      COALESCE(SUM(qty), 0) AS total_received_qty
    FROM transactions
    WHERE type = 'received' AND ${timeFilter}
  `).get();

  // Credit sales & payments in period
  const creditRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'credit_sale' THEN amount ELSE 0 END), 0) AS credit_given,
      COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) AS payment_collected
    FROM transactions
    WHERE ${timeFilter}
  `).get();

  const totalSales = salesRow.total_sales;
  const cogs = salesRow.total_cogs;
  const grossProfit = totalSales - cogs;
  const damagedLoss = damageRow.total_damage_loss;
  const netProfit = grossProfit - damagedLoss;
  const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  // Itemized breakdown of sales
  const itemizedSales = db.prepare(`
    SELECT p.name,
      SUM(t.qty) as qty,
      SUM(t.amount) as revenue,
      SUM(t.cost_amount) as cogs,
      SUM(t.amount - t.cost_amount) as profit
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'sold' AND ${timeFilter}
    GROUP BY p.id
    ORDER BY revenue DESC
  `).all();

  // Itemized breakdown of damages
  const itemizedDamages = db.prepare(`
    SELECT p.name,
      SUM(t.qty) as qty,
      SUM(t.cost_amount) as loss
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'damaged' AND ${timeFilter}
    GROUP BY p.id
    ORDER BY loss DESC
  `).all();

  return {
    period,
    totalSales,
    cogs,
    grossProfit,
    damagedLoss,
    netProfit,
    profitMargin: Math.round(profitMargin * 10) / 10,
    totalSoldQty: salesRow.total_sold_qty,
    totalDamageQty: damageRow.total_damage_qty,
    totalReceivedValue: receivedRow.total_received_value,
    totalReceivedQty: receivedRow.total_received_qty,
    creditGiven: creditRow.credit_given,
    paymentCollected: creditRow.payment_collected,
    itemizedSales,
    itemizedDamages,
  };
}

module.exports = {
  applyStock,
  undoLast,
  recordCustomerCredit,
  recordCustomerPayment,
  getCustomers,
  getCustomerStatement,
  listProductsWithDemand,
  getPnL,
};