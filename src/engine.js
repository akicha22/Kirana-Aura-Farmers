const { parseMessage } = require('./parser');
const { applyStock, undoLast } = require('./ledger');

const PENDING_TTL_MS = 10 * 60 * 1000;
const money = (n) => '₹' + (Number.isInteger(n) ? n : n.toFixed(2));
const arrow = (c) => `${c.name} ${c.before} → ${c.after}`;

function listProducts(db) {
  return db.prepare('SELECT id, name, price, stock, min_stock FROM products ORDER BY name')
    .all()
    .map((p) => ({ ...p, low: p.stock <= p.min_stock }));
}

function createEngine(db, { now = Date.now } = {}) {
  const pendingBySender = new Map();
  const getProduct = db.prepare('SELECT name, stock, min_stock FROM products WHERE id = ?');

  const question = (p) => {
    const q = p.pending[0];
    return `Which "${q.phrase}" (qty ${p.items[q.index].qty})? Reply with a number:\n` +
      q.options.map((o, i) => `${i + 1}) ${o.name} (₹${o.price})`).join('\n');
  };

  const ask = (p, prefix = '') => ({
    kind: 'ask',
    reply: prefix + question(p),
    options: p.pending[0].options,
  });

  const getFresh = (sender) => {
    const p = pendingBySender.get(sender);
    if (p && p.expires < now()) { pendingBySender.delete(sender); return null; }
    return p || null;
  };

  function resolveChoice(text, q) {
    const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      return n >= 1 && n <= q.options.length ? q.options[n - 1] : 'invalid';
    }
    if (t.length >= 3) {
      const hits = q.options.filter((o) => {
        const name = o.name.toLowerCase();
        return name === t || name.split(' ').includes(t);
      });
      if (hits.length === 1) return hits[0];
    }
    return null; // not an answer: treat as a new message
  }

  function lowStockLines(changes) {
    const ids = [...new Set(changes.map((c) => c.productId))];
    return ids.map((id) => getProduct.get(id))
      .filter((p) => p.stock <= p.min_stock)
      .map((p) => `⚠️ Low stock: ${p.name} (${p.stock} left, reorder at ${p.min_stock})`);
  }

  function apply(items, source) {
    const res = applyStock(db, items, { source });
    if (!res.ok) return { kind: 'error', reply: res.message };

    const lines = [`Updated: ${res.changes.map(arrow).join(', ')}`];
    let explicit = false;
    items.forEach((it, i) => {
      const c = res.changes[i];
      if (c.type === 'sold' && it.amount != null) {
        explicit = true;
        lines.push(`${c.name}: ${money(it.amount)} total (${money(it.amount / c.qty)} each)`);
      }
    });
    const soldTotal = res.changes.filter((c) => c.type === 'sold')
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    if (soldTotal > 0 && !explicit) lines.push(`Sales: ${money(soldTotal)}`);
    lines.push(...lowStockLines(res.changes));

    return { kind: 'updated', reply: lines.join('\n'), changes: res.changes };
  }

  function handleMessage({ sender, text, source = 'web' }) {
    const p = getFresh(sender);
    if (p) {
      if (/^\s*(cancel|no|nahi|stop)\s*[.!]*\s*$/i.test(text)) {
        pendingBySender.delete(sender);
        return { kind: 'info', reply: 'Cancelled. Nothing was changed.' };
      }
      const choice = resolveChoice(text, p.pending[0]);
      if (choice === 'invalid') {
        return ask(p, `Please reply with a number from 1 to ${p.pending[0].options.length}.\n`);
      }
      if (choice) {
        const q = p.pending.shift();
        p.items[q.index].productId = choice.id;
        p.items[q.index].name = choice.name;
        p.expires = now() + PENDING_TTL_MS;
        if (p.pending.length) return ask(p);
        pendingBySender.delete(sender);
        return apply(p.items, source);
      }
      pendingBySender.delete(sender); // a different message: forget the old question
    }

    const parsed = parseMessage(text, db);
    switch (parsed.kind) {
      case 'undo': {
        const r = undoLast(db, { source });
        if (!r.ok) return { kind: 'error', reply: r.message };
        return { kind: 'undo', reply: `Undone: ${r.changes.map(arrow).join(', ')}`, changes: r.changes };
      }
      case 'error':
        return { kind: 'error', reply: parsed.message };
      case 'ask': {
        const np = { items: parsed.items, pending: parsed.pending, expires: now() + PENDING_TTL_MS };
        pendingBySender.set(sender, np);
        return ask(np);
      }
      default:
        return apply(parsed.items, source);
    }
  }

  return { handleMessage };
}

module.exports = { createEngine, listProducts };