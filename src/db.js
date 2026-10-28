const Database = require('better-sqlite3');

const SEED = [
  { name: 'Maggi Small',  price: 14,  stock: 40, min: 10, aliases: ['maggi', 'maggi small'] },
  { name: 'Maggi Family', price: 70,  stock: 20, min: 6,  aliases: ['maggi', 'maggi family'] },
  { name: 'Milk 1L',      price: 54,  stock: 12, min: 5,  aliases: ['milk'] },
  { name: 'Oil 1L',       price: 150, stock: 8,  min: 3,  aliases: ['oil'] },
  { name: 'Rice 5kg',     price: 320, stock: 15, min: 5,  aliases: ['rice', 'rice bag', 'rice bags'] },
  { name: 'Biscuits',     price: 10,  stock: 30, min: 10, aliases: ['biscuit', 'biscuits', 'parle-g'] },
];

function openDb(path = process.env.DB_PATH || 'kirana.db') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL CHECK (price >= 0),
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
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
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
      source TEXT NOT NULL DEFAULT 'web',
      reverses_id INTEGER REFERENCES transactions(id),
      ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))  -- UTC
    );
  `);

  const empty = db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0;
  if (empty) seed(db);
  return db;
}

function seed(db) {
  const addP = db.prepare('INSERT INTO products (name, price, stock, min_stock) VALUES (?,?,?,?)');
  const addA = db.prepare('INSERT INTO product_aliases (alias, product_id) VALUES (?,?)');
  db.transaction(() => {
    for (const p of SEED) {
      const id = addP.run(p.name, p.price, p.stock, p.min).lastInsertRowid;
      for (const a of p.aliases) addA.run(a, id);
    }
  })();
}

module.exports = { openDb };