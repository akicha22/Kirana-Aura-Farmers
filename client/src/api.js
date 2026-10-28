export async function getProducts() {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Could not load products');
    return res.json();
  }
  
  // The server returns { kind, reply } even for 400/500, so we always read the JSON.
  // If the server is unreachable, fetch/json throws and the caller shows an honest error.
  export async function sendChat(sender, text) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, text }),
    });
    return res.json();
  }