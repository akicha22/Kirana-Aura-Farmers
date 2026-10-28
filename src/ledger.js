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
    (batch_id, type, product_id, qty, delta, amount, source) VALUES (?,?,?,?,?,?,?)`);

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
      setStock.run(after, p.id);
      insTx.run(batchId, it.type, p.id, it.qty, delta, amount, source);
      changes.push({ productId: p.id, name: p.name, type: it.type, qty: it.qty,
                     before: p.stock, after, amount });
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
    (batch_id, type, product_id, qty, delta, source, reverses_id) VALUES (?,?,?,?,?,?,?)`);

  const run = db.transaction(() => {
    const changes = [];
    for (const r of rows) {
      const p = getP.get(r.product_id);
      const after = p.stock - r.delta;
      if (after < 0)
        throw new LedgerError('CANNOT_UNDO', `Can't undo: ${p.name} stock would go below 0.`);
      setStock.run(after, p.id);
      insTx.run(batchId, 'reversal', p.id, r.qty, -r.delta, source, r.id);
      changes.push({ productId: p.id, name: p.name, undone: r.type, before: p.stock, after });
    }
    return changes;
  });

  try { return { ok: true, batchId, changes: run() }; }
  catch (e) { if (e instanceof LedgerError) return fail(e.code, e.message); throw e; }
}

module.exports = { applyStock, undoLast };