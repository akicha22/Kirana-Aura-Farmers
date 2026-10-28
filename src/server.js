require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { createEngine, listProducts } = require('./engine');

function createApp(db) {
  const app = express();
  const engine = createEngine(db);
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/products', (req, res) => res.json(listProducts(db)));

  app.post('/api/chat', (req, res) => {
    const { sender, text } = req.body || {};
    if (typeof sender !== 'string' || !sender.trim() || sender.length > 64 || typeof text !== 'string') {
      return res.status(400).json({ kind: 'error', reply: 'Something went wrong. Please try again.' });
    }
    try {
      res.json(engine.handleMessage({ sender: sender.trim(), text, source: 'web' }));
    } catch (e) {
      console.error(e);
      res.status(500).json({ kind: 'error', reply: 'Could not save that. Nothing was changed. Please try again.' });
    }
  });

  // Serves the React build (created in the next step) so one process handles everything.
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, req, res, next) => {  // e.g. malformed JSON
    res.status(400).json({ kind: 'error', reply: 'Something went wrong. Please try again.' });
  });
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp(openDb()).listen(port, () => console.log(`Kirana Chat Ledger running on http://localhost:${port}`));
}

module.exports = { createApp };