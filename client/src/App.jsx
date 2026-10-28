import { useCallback, useEffect, useState } from 'react';
import Chat from './Chat';
import StockTable from './StockTable';
import { getProducts } from './api';

export default function App() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('chat');

  const refresh = useCallback(async () => {
    try {
      setProducts(await getProducts());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const lowCount = products.filter((p) => p.low).length;

  return (
    <div className="app">
      <header>
        <h1>Kirana Chat Ledger</h1>
      </header>

      <nav className="tabs">
        <button type="button" className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button type="button" className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>
          Stock{lowCount > 0 && <span className="dot">{lowCount}</span>}
        </button>
      </nav>

      <main className="panels">
        <div className={`panel ${tab === 'chat' ? 'active' : ''}`}>
          <Chat onChange={refresh} />
        </div>
        <div className={`panel ${tab === 'stock' ? 'active' : ''}`}>
          <StockTable products={products} error={error} onRetry={refresh} />
        </div>
      </main>
    </div>
  );
}