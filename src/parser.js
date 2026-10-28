const MAX_QTY = 10000;
const MAX_LEN = 300;
const HELP = 'I didn\'t understand that. Try: "sold 3 maggi small, 2 milk" or "received 20 rice bags".';

const NUMWORDS = new Map(Object.entries({
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
  eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', fifteen: '15',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100',
}));

const FILLERS = new Set([
  'i', 'we', 'the', 'some', 'just', 'please', 'today', 'of',
  'packets', 'packet', 'pkts', 'pkt', 'pcs', 'pc', 'pieces', 'piece', 'units', 'unit',
]);

const VERB_GROUPS = {
  sold:     ['sold', 'sell', 'sale', 'sales', 'bech diya', 'bech di', 'becha', 'bechi', 'gone', 'bik gaya'],
  received: ['received', 'receive', 'got', 'arrived', 'stocked', 'restocked', 'added', 'aaya'],
  damaged:  ['damaged', 'damage', 'broken', 'broke', 'expired', 'spoiled', 'spoilt', 'wasted', 'kharab'],
  returned: ['returned', 'return', 'wapas'],
};
const VERB_LOOKUP = new Map();
for (const [type, words] of Object.entries(VERB_GROUPS))
  for (const w of words) VERB_LOOKUP.set(w, type);

const verbAlt = [...VERB_LOOKUP.keys()]
  .sort((a, b) => b.length - a.length)          // longest first: "bech diya" before "bech di"
  .map((w) => w.replace(/ /g, '\\s+'))
  .join('|');
const LEAD_VERB = new RegExp(`^(${verbAlt})\\b\\s*`);
const TRAIL_VERB = new RegExp(`\\s*\\b(${verbAlt})$`);

const AMOUNT_RES = [
  /\b(?:rs|inr|rupees?)\s*(\d+(?:\.\d+)?)/,      // rs 30, rupees 30
  /(\d+(?:\.\d+)?)\s*(?:rs|inr|rupees?)\b/,      // 30 rs
  /\bfor\s+(\d+(?:\.\d+)?)\b/,                   // for 30
];
const SPLIT_RE = /\s*(?:,|;|&|\+|\band\b|\baur\b)\s*/;
const UNDO_RE = /^\s*(undo|undo last|cancel last)\s*[.!]*\s*$/i;
const isNum = (t) => /^-?\d+(\.\d+)?$/.test(t);
const clean = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const err = (message, issues = [message]) => ({ kind: 'error', message, issues });

/* ---------- step 1: text -> raw items (no database) ---------- */

function normalize(text) {
  let s = text.toLowerCase().replace(/₹/g, ' rs ');
  s = s.replace(/\brs\b\.?/g, ' rs ').replace(/\brs(?=\d)/g, ' rs ');
  s = s.replace(/\brs\s*(\d{1,3}(?:,\d{3})+)/g, (_, n) => ' rs ' + n.replace(/,/g, '')); // Rs 1,200
  s = s.replace(/(\d)\s*x\b/g, '$1 ').replace(/\bx\s*(\d)/g, ' $1');                      // 3x / x3
  return s.replace(/[^a-z0-9\s,;&+.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toTokens(s) {
  return s.split(/\s+/).filter(Boolean)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !FILLERS.has(t))
    .map((t) => NUMWORDS.get(t) ?? t);
}

function parseSegment(seg) {
  let s = seg.trim();
  if (!s) return null;

  let amount = null;
  for (const re of AMOUNT_RES) {
    const m = s.match(re);
    if (m) { amount = parseFloat(m[1]); s = s.replace(m[0], ' '); break; }
  }

  let str = toTokens(s).join(' ');
  let type = null, verbPos = null;
  let m = str.match(LEAD_VERB);
  if (m) { type = VERB_LOOKUP.get(m[1]); verbPos = 'lead'; str = str.slice(m[0].length); }
  m = str.match(TRAIL_VERB);
  if (m) {
    if (!type) { type = VERB_LOOKUP.get(m[1]); verbPos = 'trail'; }
    str = str.slice(0, m.index);
  }

  const tokens = str.split(' ').filter(Boolean);
  let qtyTok = null;
  if (tokens.length && isNum(tokens[0])) qtyTok = tokens.shift();
  else if (tokens.length > 1 && isNum(tokens[tokens.length - 1])) qtyTok = tokens.pop();

  const phrase = tokens.join(' ');
  if (!type && qtyTok == null && !phrase && amount === null) return null;
  return { type, verbPos, qtyTok, phrase, amount, raw: seg.trim() };
}

function fillVerbs(raws) {
  // "3 maggi, 2 milk gone": a trailing verb also covers the untyped items before it
  for (let i = raws.length - 1; i > 0; i--) {
    if (raws[i].verbPos === 'trail')
      for (let j = i - 1; j >= 0 && !raws[j].type; j--) raws[j].type = raws[i].type;
  }
  // "sold 3 maggi, 2 milk": a leading verb carries forward
  let last = null;
  for (const r of raws) { if (r.type) last = r.type; else if (last) r.type = last; }
}

/* ---------- step 2: raw items -> products (reads the database) ---------- */

function osa(a, b) { // edit distance where swapping two letters counts as one edit
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

function loadCatalog(db) {
  const byId = new Map(db.prepare('SELECT id, name, price FROM products').all().map((p) => [p.id, p]));
  const keys = new Map(); // text -> Set(productId)
  const add = (k, id) => {
    k = clean(k);
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k).add(id);
  };
  for (const p of byId.values()) add(p.name, p.id);
  for (const a of db.prepare('SELECT alias, product_id FROM product_aliases').all()) add(a.alias, a.product_id);
  return { byId, keys };
}

function matchPhrase(phrase, cat) {
  const p = clean(phrase);
  if (!p) return [];
  let ids = cat.keys.get(p);
  if (!ids && p.endsWith('s')) ids = cat.keys.get(p.slice(0, -1));
  if (ids) return [...ids];

  if (p.length < 4) return [];                       // too short to fuzzy-match safely
  const maxDist = p.length >= 8 ? 2 : 1;
  let best = Infinity, found = new Set();
  for (const [key, set] of cat.keys) {
    if (key.length < 4 || Math.abs(key.length - p.length) > maxDist) continue;
    const d = osa(p, key);
    if (d > maxDist) continue;
    if (d < best) { best = d; found = new Set(set); }
    else if (d === best) set.forEach((id) => found.add(id));
  }
  return [...found];
}

function parseCustomerTx(text) {
  const s = text.trim();
  // 1. Credit / Udhar
  // e.g. "credit 200 to Ramesh", "credit 200 Ramesh", "udhar 200 Ramesh", "khata 200 Ramesh"
  let m = s.match(/^(?:credit|udhar|khata)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s+(?:to\s+|for\s+)?([a-zA-Z\s]+)$/i);
  if (m) return { kind: 'customer_tx', action: 'credit', amount: parseFloat(m[1]), customerName: m[2].trim() };

  // e.g. "Ramesh credit 200", "Ramesh udhar 200", "Ramesh khata 200"
  m = s.match(/^([a-zA-Z\s]+?)\s+(?:credit|udhar|khata)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i);
  if (m) return { kind: 'customer_tx', action: 'credit', amount: parseFloat(m[2]), customerName: m[1].trim() };

  // e.g. "credit Ramesh 200", "udhar Ramesh 200"
  m = s.match(/^(?:credit|udhar|khata)\s+([a-zA-Z\s]+?)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i);
  if (m) return { kind: 'customer_tx', action: 'credit', amount: parseFloat(m[2]), customerName: m[1].trim() };

  // 2. Payment / Jama
  // e.g. "Ramesh paid 150", "Ramesh jama 150", "Ramesh payment 150"
  m = s.match(/^([a-zA-Z\s]+?)\s+(?:paid|jama|gave|payment)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i);
  if (m) return { kind: 'customer_tx', action: 'payment', amount: parseFloat(m[2]), customerName: m[1].trim() };

  // e.g. "paid 150 Ramesh", "payment 150 from Ramesh", "jama 150 Ramesh"
  m = s.match(/^(?:payment|jama|paid)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s+(?:from\s+|by\s+)?([a-zA-Z\s]+)$/i);
  if (m) return { kind: 'customer_tx', action: 'payment', amount: parseFloat(m[1]), customerName: m[2].trim() };

  // e.g. "payment Ramesh 150", "jama Ramesh 150"
  m = s.match(/^(?:payment|jama|paid)\s+([a-zA-Z\s]+?)\s+(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i);
  if (m) return { kind: 'customer_tx', action: 'payment', amount: parseFloat(m[2]), customerName: m[1].trim() };

  return null;
}

/* ---------- public API ---------- */

function parseMessage(text, db) {
  if (typeof text !== 'string' || !text.trim()) return err(HELP);
  if (text.length > MAX_LEN) return err('That message is too long. Please send shorter updates.');
  if (UNDO_RE.test(text)) return { kind: 'undo' };

  const custTx = parseCustomerTx(text);
  if (custTx) return custTx;

  const raws = normalize(text).split(SPLIT_RE).map(parseSegment).filter(Boolean);
  if (raws.length === 0 || raws.every((r) => !r.type && r.qtyTok == null)) return err(HELP);
  fillVerbs(raws);

  const issues = [];
  for (const r of raws) {
    r.ok = false;
    if (!r.phrase) { issues.push(`I couldn't find a product in "${r.raw}".`); continue; }
    if (!r.type) { issues.push(`What happened with "${r.raw}"? Start with sold, received, damaged or returned.`); continue; }
    if (r.qtyTok == null) { issues.push(`How many ${r.phrase}? Try "${r.type} 2 ${r.phrase}".`); continue; }
    const q = Number(r.qtyTok);
    if (!Number.isInteger(q)) issues.push(`Use whole numbers only ("${r.qtyTok}").`);
    else if (q <= 0) issues.push(`Quantity must be more than 0 ("${r.qtyTok}").`);
    else if (q > MAX_QTY) issues.push(`${q} looks too big. Please check the number.`);
    else if (r.amount !== null && !(r.amount > 0)) issues.push('Amount must be more than 0.');
    else { r.qty = q; r.ok = true; }
  }

  const cat = loadCatalog(db);
  const items = [], pending = [];
  for (const r of raws.filter((x) => x.ok)) {
    const ids = matchPhrase(r.phrase, cat);
    if (ids.length === 0) { issues.push(`I don't have "${r.phrase}" in your products.`); continue; }
    const base = { qty: r.qty, type: r.type, amount: r.amount };
    if (ids.length === 1) {
      const p = cat.byId.get(ids[0]);
      items.push({ productId: p.id, name: p.name, ...base });
    } else {
      items.push({ productId: null, name: null, ...base });
      pending.push({
        index: items.length - 1,
        phrase: r.phrase,
        options: ids.map((id) => ({ id, name: cat.byId.get(id).name, price: cat.byId.get(id).price })),
      });
    }
  }

  if (issues.length) return err(issues.join('\n'), issues);   // all-or-nothing
  if (pending.length) {
    const q = pending[0];
    const list = q.options.map((o, i) => `${i + 1}) ${o.name} (₹${o.price})`).join('\n');
    return {
      kind: 'ask',
      question: `Which "${q.phrase}" (qty ${items[q.index].qty})? Reply with a number:\n${list}`,
      pending,
      items,
    };
  }
  return { kind: 'stock', items };
}

module.exports = { parseMessage };