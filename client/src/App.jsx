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
  const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>क</span></div>
          <div className="brand-copy">
            <h1>Kirana <span>Aura</span></h1>
            <p>SMART INVENTORY <i /> AURA FARMERS</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className={'server-pill ' + (error ? 'offline' : '')}>
            <i /> {error ? 'Connection issue' : 'Inventory dashboard'}
          </span>
          <div className="avatar" title="Aura Farmers">AF</div>
        </div>
      </header>

      <section className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">YOUR STORE, IN CONTROL</p>
          <h2>Every sale. Every shelf.<br /><span>All in one place.</span></h2>
          <p className="welcome-description">
            A simpler way to track your kirana store. Just type what happened and let your ledger do the counting.
          </p>
        </div>
        <div className="welcome-card">
          <div className="welcome-art" aria-hidden="true">
            <span className="art-sun" />
            <span className="art-leaf leaf-one">✳</span>
            <span className="art-leaf leaf-two">✳</span>
            <span className="art-bag">▤</span>
          </div>
          <div className="welcome-card-copy">
            <span className="mini-label">MADE FOR EVERYDAY BUSINESS</span>
            <strong>Less paperwork.<br />More peace of mind.</strong>
            <span className="art-caption"><i /> Simple. Clear. Ready for the day.</span>
          </div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Inventory summary">
        <article className="stat-card">
          <div className="stat-icon icon-products" aria-hidden="true">▦</div>
          <div className="stat-content">
            <span className="stat-label">PRODUCTS TRACKED</span>
            <strong>{String(products.length).padStart(2, '0')}</strong>
            <small>In your catalogue</small>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon icon-units" aria-hidden="true">↗</div>
          <div className="stat-content">
            <span className="stat-label">UNITS ON HAND</span>
            <strong>{totalUnits.toLocaleString('en-IN')}</strong>
            <small>Across all products</small>
          </div>
        </article>
        <article className={'stat-card' + (lowCount > 0 ? ' stat-alert' : '')}>
          <div className="stat-icon icon-alert" aria-hidden="true">!</div>
          <div className="stat-content">
            <span className="stat-label">LOW-STOCK ALERTS</span>
            <strong>{String(lowCount).padStart(2, '0')}</strong>
            <small>{lowCount > 0 ? 'Items need attention' : 'Everything looks stocked'}</small>
          </div>
          {lowCount > 0 && <span className="alert-dot" aria-label="Low stock alert" />}
        </article>
      </section>

      <nav className="tabs" aria-label="Dashboard sections">
        <button type="button" className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
          <span aria-hidden="true">✎</span> Chat ledger
        </button>
        <button type="button" className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>
          <span aria-hidden="true">▦</span> Stock overview
          {lowCount > 0 && <span className="dot">{lowCount}</span>}
        </button>
      </nav>

      <main className="panels">
        <div className={'panel ' + (tab === 'chat' ? 'active' : '')}>
          <Chat onChange={refresh} />
        </div>
        <div className={'panel ' + (tab === 'stock' ? 'active' : '')}>
          <StockTable products={products} error={error} onRetry={refresh} />
        </div>
      </main>

      <footer className="footer">
        <span><span className="footer-mark">✳</span> Kirana Aura <span className="footer-separator">/</span> by Aura Farmers</span>
        <span>Keep your store moving.</span>
      </footer>
    </div>
  );
}
