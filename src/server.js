require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { createEngine, listProducts } = require('./engine');
const {
  getPnL,
  getCustomers,
  getCustomerStatement,
  recordCustomerCredit,
  recordCustomerPayment,
} = require('./ledger');
const { createWhatsAppRouter, configFromEnv, makeSender } = require('./whatsapp');

function createApp(db, opts = {}) {
  const app = express();
  const engine = createEngine(db);

  // keep the raw body: the WhatsApp signature check needs the exact bytes
  app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Angadi' }));
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

  // Profit and Loss endpoint (day or month)
  app.get('/api/pnl', (req, res) => {
    const period = req.query.period === 'month' ? 'month' : 'day';
    try {
      res.json(getPnL(db, period));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to calculate profit & loss' });
    }
  });

  // Customer Khata endpoints
  app.get('/api/customers', (req, res) => {
    try {
      res.json(getCustomers(db));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.get('/api/customers/:id/statement', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid customer id' });
    try {
      const statement = getCustomerStatement(db, id);
      if (!statement) return res.status(404).json({ error: 'Customer not found' });
      res.json(statement);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch customer statement' });
    }
  });

  app.post('/api/customers/transaction', (req, res) => {
    const { customerName, amount, type, phone } = req.body || {};
    if (!customerName || !amount || !['credit', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'customerName, valid amount, and type (credit/payment) are required' });
    }
    try {
      const result = type === 'credit'
        ? recordCustomerCredit(db, { customerName, amount: parseFloat(amount), phone, source: 'web' })
        : recordCustomerPayment(db, { customerName, amount: parseFloat(amount), source: 'web' });
      if (!result.ok) return res.status(400).json({ error: result.message });
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to record customer transaction' });
    }
  });

  // WhatsApp webhook: must come before the static-file catch-all below
  const waConfig = opts.whatsapp?.config ?? configFromEnv();
  const waSend = opts.whatsapp?.send ?? makeSender(waConfig);
  app.use('/webhook', createWhatsAppRouter({ db, engine, config: waConfig, send: waSend }));

  // Serves the React build so one process handles everything.
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|webhook).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    console.warn(`[Angadi] Warning: ${dist} not found. Run npm run build first.`);
  }

  app.use((err, req, res, next) => {  // e.g. malformed JSON
    res.status(400).json({ kind: 'error', reply: 'Something went wrong. Please try again.' });
  });
  return app;
}

if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || 3000;
  createApp(openDb()).listen(port, '0.0.0.0', () => console.log(`Angadi server running on http://0.0.0.0:${port}`));
}

module.exports = { createApp };