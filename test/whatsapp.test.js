const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { openDb } = require('../src/db');
const { createApp } = require('../src/server');

const NUM = '919999900001';

async function boot(overrides = {}) {
  const db = openDb(':memory:');
  const sent = [];
  const config = {
    verifyToken: 'tok', appSecret: '', token: '', phoneNumberId: '',
    graphVersion: 'v24.0', allowed: new Set([NUM]), ...overrides,
  };
  const app = createApp(db, { whatsapp: { config, send: async (to, body) => { sent.push({ to, body }); } } });
  const server = app.listen(0);
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    sent,
    stock: (n) => db.prepare('SELECT stock FROM products WHERE name=?').get(n).stock,
    close: () => { server.close(); server.closeAllConnections(); },
  };
}

const payload = (messages) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages } }] }],
});
const text = (id, from, body) => ({ from, id, type: 'text', text: { body } });
const post = (base, body, headers = {}) => fetch(base + '/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('GET verification returns the challenge only for the right token', async () => {
  const t = await boot();
  try {
    const ok = await fetch(t.base + '/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=12345');
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '12345');
    const bad = await fetch(t.base + '/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1');
    assert.equal(bad.status, 403);
  } finally { t.close(); }
});

test('a WhatsApp sale updates stock and replies to the sender', async () => {
  const t = await boot();
  try {
    const res = await post(t.base, payload([text('wamid.1', NUM, 'sold 3 maggi small, 2 milk')]));
    assert.equal(res.status, 200);
    assert.equal(t.stock('Maggi Small'), 37);
    assert.equal(t.stock('Milk 1L'), 10);
    assert.equal(t.sent.length, 1);
    assert.equal(t.sent[0].to, NUM);
    assert.match(t.sent[0].body, /Maggi Small 40 → 37/);
  } finally { t.close(); }
});

test('the same WhatsApp message id is applied only once', async () => {
  const t = await boot();
  try {
    const p = payload([text('wamid.dup', NUM, 'sold 3 milk')]);
    await post(t.base, p);
    await post(t.base, p);
    assert.equal(t.stock('Milk 1L'), 9);
    assert.equal(t.sent.length, 1);
  } finally { t.close(); }
});

test('numbers that are not allowed are ignored completely', async () => {
  const t = await boot();
  try {
    const res = await post(t.base, payload([text('wamid.x', '911111111111', 'sold 3 milk')]));
    assert.equal(res.status, 200);
    assert.equal(t.stock('Milk 1L'), 12);
    assert.equal(t.sent.length, 0);
  } finally { t.close(); }
});

test('non-text messages get a polite reply and change nothing', async () => {
  const t = await boot();
  try {
    await post(t.base, payload([{ from: NUM, id: 'wamid.img', type: 'image', image: { id: 'abc' } }]));
    assert.match(t.sent[0].body, /text message/);
    assert.equal(t.stock('Milk 1L'), 12);
  } finally { t.close(); }
});

test('delivery status updates are accepted and ignored', async () => {
  const t = await boot();
  try {
    const res = await post(t.base, {
      entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }],
    });
    assert.equal(res.status, 200);
    assert.equal(t.sent.length, 0);
  } finally { t.close(); }
});

test('the "which Maggi?" flow works over WhatsApp', async () => {
  const t = await boot();
  try {
    await post(t.base, payload([text('wamid.a', NUM, 'sold 3 maggi')]));
    assert.match(t.sent[0].body, /Which "maggi"/);
    assert.equal(t.stock('Maggi Small'), 40);
    await post(t.base, payload([text('wamid.b', NUM, 'small')]));
    assert.equal(t.stock('Maggi Small'), 37);
    assert.equal(t.stock('Maggi Family'), 20);
  } finally { t.close(); }
});

test('with an app secret set, unsigned or wrongly signed requests are rejected', async () => {
  const t = await boot({ appSecret: 'shh' });
  try {
    const body = JSON.stringify(payload([text('wamid.s1', NUM, 'sold 3 milk')]));

    const unsigned = await post(t.base, body);
    assert.equal(unsigned.status, 403);
    const wrong = await post(t.base, body, { 'X-Hub-Signature-256': 'sha256=deadbeef' });
    assert.equal(wrong.status, 403);
    assert.equal(t.stock('Milk 1L'), 12);

    const sig = 'sha256=' + crypto.createHmac('sha256', 'shh').update(body).digest('hex');
    const ok = await post(t.base, body, { 'X-Hub-Signature-256': sig });
    assert.equal(ok.status, 200);
    assert.equal(t.stock('Milk 1L'), 9);
  } finally { t.close(); }
});