const Database = require('better-sqlite3');

const SEED = [
  { name: 'Maggi Small',         price: 14,  cost: 11,  stock: 40, min: 10, aliases: ['maggi', 'maggi small'] },
  { name: 'Maggi Family',        price: 70,  cost: 58,  stock: 20, min: 6,  aliases: ['maggi', 'maggi family'] },
  { name: 'Milk 1L',             price: 54,  cost: 48,  stock: 12, min: 5,  aliases: ['milk', 'doodh'] },
  { name: 'Oil 1L',              price: 150, cost: 130, stock: 8,  min: 3,  aliases: ['oil', 'tel'] },
  { name: 'Rice 5kg',            price: 320, cost: 275, stock: 15, min: 5,  aliases: ['rice', 'rice bag', 'rice bags', 'chawal'] },
  { name: 'Biscuits',            price: 10,  cost: 8,   stock: 30, min: 10, aliases: ['biscuit', 'biscuits', 'parle-g'] },
  { name: 'Aashirvaad Atta 5kg', price: 245, cost: 210, stock: 20, min: 5,  aliases: ['atta', 'aashirvaad atta', 'flour', 'gehu atta'] },
  { name: 'Toor Dal 1kg',        price: 160, cost: 135, stock: 25, min: 6,  aliases: ['toor dal', 'dal', 'tuvar dal', 'arhar dal'] },
  { name: 'Sugar 1kg',           price: 48,  cost: 40,  stock: 35, min: 8,  aliases: ['sugar', 'cheeni', 'chini', 'shakkar'] },
  { name: 'Tata Salt 1kg',       price: 28,  cost: 22,  stock: 45, min: 10, aliases: ['salt', 'tata salt', 'namak'] },
  { name: 'Red Label Tea 250g',  price: 140, cost: 115, stock: 18, min: 4,  aliases: ['tea', 'chai', 'red label', 'chai patti'] },
  { name: 'Amul Butter 100g',    price: 58,  cost: 50,  stock: 22, min: 5,  aliases: ['butter', 'amul butter', 'makhan'] },
  { name: 'Amul Ghee 500ml',     price: 360, cost: 310, stock: 10, min: 3,  aliases: ['ghee', 'amul ghee', 'desi ghee'] },
  { name: 'Turmeric Powder 200g',price: 45,  cost: 34,  stock: 25, min: 5,  aliases: ['turmeric', 'haldi', 'turmeric powder'] },
  { name: 'Chilli Powder 200g',  price: 55,  cost: 42,  stock: 25, min: 5,  aliases: ['chilli', 'mirchi', 'lal mirch', 'chilli powder'] },
  { name: 'Dettol Soap',         price: 38,  cost: 30,  stock: 30, min: 8,  aliases: ['soap', 'dettol', 'sabun'] },
  { name: 'Surf Excel 500g',     price: 85,  cost: 70,  stock: 18, min: 4,  aliases: ['surf', 'surf excel', 'detergent'] },
  { name: 'Lays Chips',          price: 20,  cost: 16,  stock: 35, min: 10, aliases: ['lays', 'chips', 'wafers'] },
];

const SEED_CUSTOMERS = [
  { name: 'Ramesh Kumar', phone: '9845012345', balance: 350 },
  { name: 'Priya Sharma', phone: '9876543210', balance: 120 },
  { name: 'Suresh Patel', phone: '9823098765', balance: 680 },
  { name: 'Anita Devi',   phone: '9844112233', balance: 0 },
];

function openDb(path = process.env.DB_PATH || 'kirana.db') {
  const isMemory = path === ':memory:';
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL CHECK (price >= 0),
      cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      min_stock INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS product_aliases (
      alias TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      PRIMARY KEY (alias, product_id)
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT,
      balance REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,                -- one user message = one batch
      type TEXT NOT NULL CHECK (type IN
        ('sold','received','damaged','returned','reversal','credit_sale','payment')),
      product_id INTEGER REFERENCES products(id),
      customer_id INTEGER REFERENCES customers(id),
      qty INTEGER CHECK (qty IS NULL OR qty > 0),
      delta INTEGER NOT NULL DEFAULT 0,      -- signed stock effect
      amount REAL,
      cost_amount REAL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'web',
      reverses_id INTEGER REFERENCES transactions(id),
      ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))  -- UTC
    );
  `);

  // Migrate existing schema if columns are missing
  try { db.exec('ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0;'); } catch (_) {}
  try { db.exec('ALTER TABLE customers ADD COLUMN phone TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE customers ADD COLUMN balance REAL NOT NULL DEFAULT 0;'); } catch (_) {}
  try { db.exec('ALTER TABLE transactions ADD COLUMN cost_amount REAL DEFAULT 0;'); } catch (_) {}

  // Update existing products with realistic cost_price if zero
  const updateCost = db.prepare('UPDATE products SET cost_price = ? WHERE id = ? AND cost_price = 0');
  const getPByName = db.prepare('SELECT id, cost_price FROM products WHERE name = ?');
  for (const p of SEED) {
    const existing = getPByName.get(p.name);
    if (existing && existing.cost_price === 0) {
      updateCost.run(p.cost, existing.id);
    }
  }

  const empty = db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0;
  if (empty) {
    seed(db, isMemory);
  } else {
    // If database already existed with fewer products, backfill the new products
    syncNewSeedProducts(db);
  }

  // Ensure initial customers exist in persistent storage
  const custCount = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
  if (custCount === 0 && !isMemory) {
    const insCust = db.prepare('INSERT INTO customers (name, phone, balance) VALUES (?,?,?)');
    const insTx = db.prepare(`INSERT INTO transactions (batch_id, type, customer_id, amount, source) VALUES (?,?,?,?,?)`);
    db.transaction(() => {
      for (const c of SEED_CUSTOMERS) {
        const id = insCust.run(c.name, c.phone, c.balance).lastInsertRowid;
        if (c.balance > 0) {
          insTx.run('seed-khata', 'credit_sale', id, c.balance, 'seed');
        }
      }
    })();
  }

  return db;
}

function syncNewSeedProducts(db) {
  const getP = db.prepare('SELECT id FROM products WHERE name = ?');
  const addP = db.prepare('INSERT INTO products (name, price, cost_price, stock, min_stock) VALUES (?,?,?,?,?)');
  const addA = db.prepare('INSERT OR IGNORE INTO product_aliases (alias, product_id) VALUES (?,?)');

  db.transaction(() => {
    for (const p of SEED) {
      let row = getP.get(p.name);
      let id;
      if (!row) {
        id = addP.run(p.name, p.price, p.cost, p.stock, p.min).lastInsertRowid;
      } else {
        id = row.id;
      }
      for (const a of p.aliases) addA.run(a, id);
    }
  })();
}

function seed(db, isMemory = false) {
  const addP = db.prepare('INSERT INTO products (name, price, cost_price, stock, min_stock) VALUES (?,?,?,?,?)');
  const addA = db.prepare('INSERT INTO product_aliases (alias, product_id) VALUES (?,?)');
  const insCust = db.prepare('INSERT INTO customers (name, phone, balance) VALUES (?,?,?)');
  const insTx = db.prepare(`INSERT INTO transactions
    (batch_id, type, product_id, customer_id, qty, delta, amount, cost_amount, source) VALUES (?,?,?,?,?,?,?,?,?)`);

  db.transaction(() => {
    const prodMap = new Map();
    for (const p of SEED) {
      const id = addP.run(p.name, p.price, p.cost, p.stock, p.min).lastInsertRowid;
      prodMap.set(p.name, { id, price: p.price, cost: p.cost });
      for (const a of p.aliases) addA.run(a, id);
    }

    if (!isMemory) {
      for (const c of SEED_CUSTOMERS) {
        const custId = insCust.run(c.name, c.phone, c.balance).lastInsertRowid;
        if (c.balance > 0) {
          insTx.run('seed-khata', 'credit_sale', null, custId, null, 0, c.balance, 0, 'seed');
        }
      }

      // Seed some initial sales so High Demand tag and P&L have immediate realistic activity
      const sampleSales = [
        { name: 'Milk 1L', qty: 15 },
        { name: 'Maggi Small', qty: 25 },
        { name: 'Biscuits', qty: 20 },
        { name: 'Aashirvaad Atta 5kg', qty: 8 },
        { name: 'Sugar 1kg', qty: 12 },
      ];

      for (const s of sampleSales) {
        const p = prodMap.get(s.name);
        if (p) {
          insTx.run('seed-sales', 'sold', p.id, null, s.qty, -s.qty, p.price * s.qty, p.cost * s.qty, 'seed');
        }
      }

      // Seed a couple of damaged items for realistic P&L
      const milk = prodMap.get('Milk 1L');
      if (milk) {
        insTx.run('seed-damage', 'damaged', milk.id, null, 1, -1, 0, milk.cost * 1, 'seed');
      }
    }
  })();
}

module.exports = { openDb, SEED };