export async function getProducts() {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error('Could not load products');
  return res.json();
}

export async function sendChat(sender, text) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender, text }),
  });
  return res.json();
}

export async function getPnL(period = 'day') {
  const res = await fetch(`/api/pnl?period=${encodeURIComponent(period)}`);
  if (!res.ok) throw new Error('Could not load profit & loss data');
  return res.json();
}

export async function getCustomers() {
  const res = await fetch('/api/customers');
  if (!res.ok) throw new Error('Could not load customer accounts');
  return res.json();
}

export async function getCustomerStatement(customerId) {
  const res = await fetch(`/api/customers/${customerId}/statement`);
  if (!res.ok) throw new Error('Could not load customer statement');
  return res.json();
}

export async function recordCustomerTx({ customerName, amount, type, phone }) {
  const res = await fetch('/api/customers/transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName, amount, type, phone }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to record transaction');
  }
  return res.json();
}