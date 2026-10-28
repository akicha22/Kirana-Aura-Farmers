const crypto = require('node:crypto');
const express = require('express');

function configFromEnv(env = process.env) {
  return {
    verifyToken: env.VERIFY_TOKEN || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    token: env.WHATSAPP_TOKEN || '',
    phoneNumberId: env.PHONE_NUMBER_ID || '',
    graphVersion: env.GRAPH_VERSION || 'v24.0',
    allowed: new Set(
      (env.ALLOWED_NUMBERS || '').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean)
    ),
  };
}

function makeSender(cfg) {
  return async function send(to, body) {
    if (!cfg.token || !cfg.phoneNumberId) {
      console.warn('[whatsapp] token/phone id not set, reply not sent');
      return;
    }
    const res = await fetch(
      `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      }
    );
    if (!res.ok) console.error('[whatsapp] send failed:', res.status, await res.text());
  };
}

function validSignature(req, secret) {
  const got = Buffer.from(req.get('x-hub-signature-256') || '');
  const want = Buffer.from(
    'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex')
  );
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function createWhatsAppRouter({ db, engine, config, send }) {
  db.exec(`CREATE TABLE IF NOT EXISTS processed_messages (
    wamid TEXT PRIMARY KEY,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`);
  const seen = db.prepare('SELECT 1 FROM processed_messages WHERE wamid = ?');
  const mark = db.prepare('INSERT OR IGNORE INTO processed_messages (wamid) VALUES (?)');
  const router = express.Router();

  // Meta calls this once when you save the webhook in the dashboard.
  router.get('/', (req, res) => {
    const ok = req.query['hub.mode'] === 'subscribe' &&
      config.verifyToken && req.query['hub.verify_token'] === config.verifyToken;
    if (!ok) return res.sendStatus(403);
    res.status(200).type('text/plain').send(String(req.query['hub.challenge']));
  });

  router.post('/', (req, res) => {
    if (config.appSecret && !validSignature(req, config.appSecret)) return res.sendStatus(403);

    const outbound = [];
    for (const entry of req.body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const m of change.value?.messages ?? []) {   // "statuses" (delivery receipts) are ignored
          const from = String(m.from || '').replace(/\D/g, '');
          if (!m.id || !from || seen.get(m.id)) continue;  // duplicate delivery: skip

          if (!config.allowed.has(from)) {
            mark.run(m.id);
            console.warn('[whatsapp] ignored a message from a number that is not allowed');
            continue;
          }
          let reply;
          try {
            reply = m.type === 'text' && m.text?.body
              ? engine.handleMessage({ sender: `wa:${from}`, text: m.text.body, source: 'whatsapp' }).reply
              : 'Please send a text message, for example "sold 3 maggi, 2 milk".';
          } catch (e) {
            console.error(e);
            reply = 'Could not save that. Nothing was changed. Please try again.';
          }
          mark.run(m.id);
          outbound.push([from, reply]);
        }
      }
    }

    // fire-and-forget: Meta wants a quick 200, and a failed reply must not undo a saved update
    for (const [to, body] of outbound) {
      send(to, body).catch((e) => console.error('[whatsapp] send error:', e.message));
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = { createWhatsAppRouter, configFromEnv, makeSender };