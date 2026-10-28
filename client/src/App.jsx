import { useCallback, useEffect, useState } from 'react';
import Chat from './Chat';
import StockTable from './StockTable';
import Khata from './Khata';
import PnL from './PnL';
import { getProducts, getCustomers, getPnL } from './api';

export default function App() {
  const [products, setProducts] = useState([]);
  const [khataSummary, setKhataSummary] = useState({ totalDue: 0, customersWithDue: 0 });
  const [todayPnL, setTodayPnL] = useState(null);
  const [error, setError] = useState(false);
  const [mainView, setMainView] = useState('inventory'); // 'inventory' | 'khata' | 'pnl'

  // Mobile sub-tab for inventory view (chat vs stock)
  const [mobileSubTab, setMobileSubTab] = useState('chat');

  const refreshAll = useCallback(async () => {
    try {
      const [prods, khata, pnl] = await Promise.all([
        getProducts(),
        getCustomers().catch(() => ({ totalDue: 0, customersWithDue: 0 })),
        getPnL('day').catch(() => null),
      ]);
      setProducts(prods);
      setKhataSummary(khata);
      setTodayPnL(pnl);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 5000);
    return () => clearInterval(t);
  }, [refreshAll]);

  const lowCount = products.filter((p) => p.low).length;
  const totalUnits = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const highDemandCount = products.filter((p) => p.isHighDemand).length;

  return (
    <div className="app">
      {/* Top Bar with Angadi Branding and Primary Nav */}
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>ಅ</span></div>
          <div className="brand-copy">
            <h1>Angadi <span>अंगडी</span></h1>
            <p>SMART KIRANA <i /> KHATA &amp; PROFIT LEDGER</p>
          </div>
        </div>

        {/* 3-Zone Clean Navigation Links */}
        <nav className="main-nav" aria-label="Primary navigation">
          <button
            type="button"
            className={`nav-link ${mainView === 'inventory' ? 'active' : ''}`}
            onClick={() => setMainView('inventory')}
          >
            📦 Shelf &amp; Chat
          </button>
          <button
            type="button"
            className={`nav-link ${mainView === 'khata' ? 'active' : ''}`}
            onClick={() => setMainView('khata')}
          >
            📒 Customer Khata
            {khataSummary.customersWithDue > 0 && (
              <span className="nav-badge warn">{khataSummary.customersWithDue}</span>
            )}
          </button>
          <button
            type="button"
            className={`nav-link ${mainView === 'pnl' ? 'active' : ''}`}
            onClick={() => setMainView('pnl')}
          >
            📊 Profit &amp; Loss
            {todayPnL && (
              <span className={`nav-badge ${todayPnL.netProfit >= 0 ? 'profit' : 'loss'}`}>
                {todayPnL.netProfit >= 0 ? '+₹' : '-₹'}{Math.abs(todayPnL.netProfit)}
              </span>
            )}
          </button>
        </nav>

        <div className="topbar-right">
          <span className={'server-pill ' + (error ? 'offline' : '')}>
            <i /> {error ? 'Offline' : 'Angadi Live'}
          </span>
          <div className="avatar" title="Angadi Kirana Store">AG</div>
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <section className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">ANGADI · YOUR STORE, IN CONTROL</p>
          <h2>Track sales. Settle Khata.<br /><span>See your real profit.</span></h2>
          <p className="welcome-description">
            Your neighborhood kirana companion. Record sales, track customer udhar, detect high-demand staples, and calculate true net profit including damaged items.
          </p>
        </div>
        <div className="welcome-card">
          <div className="welcome-art" aria-hidden="true">
            <span className="art-sun" />
            <span className="art-leaf leaf-one">✳</span>
            <span className="art-leaf leaf-two">✳</span>
            <span className="art-bag">ಅ</span>
          </div>
          <div className="welcome-card-copy">
            <span className="mini-label">ANGADI STORE LEDGER</span>
            <strong>Simpler counts.<br />Better business.</strong>
            <span className="art-caption"><i /> Always balanced. Ready for the day.</span>
          </div>
        </div>
      </section>

      {/* Store Overview Metric Cards */}
      <section className="stats-grid" aria-label="Store summary">
        <article className="stat-card" onClick={() => setMainView('inventory')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon icon-products" aria-hidden="true">▦</div>
          <div className="stat-content">
            <span className="stat-label">PRODUCTS ON SHELF</span>
            <strong>{String(products.length).padStart(2, '0')}</strong>
            <small>{totalUnits.toLocaleString('en-IN')} units total</small>
          </div>
        </article>

        <article
          className={'stat-card' + (highDemandCount > 0 ? ' stat-demand' : '')}
          onClick={() => setMainView('inventory')}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-icon icon-demand" aria-hidden="true">★</div>
          <div className="stat-content">
            <span className="stat-label">HIGH DEMAND ITEMS</span>
            <strong>{String(highDemandCount).padStart(2, '0')}</strong>
            <small>Selling the fastest</small>
          </div>
        </article>

        <article
          className={'stat-card' + (khataSummary.customersWithDue > 0 ? ' stat-alert' : '')}
          onClick={() => setMainView('khata')}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-icon icon-khata" aria-hidden="true">₹</div>
          <div className="stat-content">
            <span className="stat-label">OUTSTANDING UDHAR</span>
            <strong className="font-mono">₹{khataSummary.totalDue.toLocaleString('en-IN')}</strong>
            <small>{khataSummary.customersWithDue} customer{khataSummary.customersWithDue === 1 ? '' : 's'} owe money</small>
          </div>
          {khataSummary.customersWithDue > 0 && <span className="alert-dot" aria-label="Pending dues" />}
        </article>

        <article
          className={'stat-card' + (todayPnL && todayPnL.netProfit < 0 ? ' stat-alert' : '')}
          onClick={() => setMainView('pnl')}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-icon icon-profit" aria-hidden="true">↗</div>
          <div className="stat-content">
            <span className="stat-label">TODAY'S NET PROFIT</span>
            <strong className="font-mono" style={{ color: todayPnL && todayPnL.netProfit < 0 ? '#b91c1c' : '#15803d' }}>
              {todayPnL ? `${todayPnL.netProfit >= 0 ? '+' : ''}₹${todayPnL.netProfit}` : '₹0'}
            </strong>
            <small>{todayPnL ? `Margin ${todayPnL.profitMargin}%` : 'Daily margin'}</small>
          </div>
        </article>
      </section>

      {/* Main View Switcher Content */}
      {mainView === 'inventory' && (
        <>
          {/* Mobile switcher between Chat & Stock */}
          <nav className="tabs" aria-label="Dashboard sections">
            <button
              type="button"
              className={mobileSubTab === 'chat' ? 'on' : ''}
              onClick={() => setMobileSubTab('chat')}
            >
              <span aria-hidden="true">✎</span> Chat ledger
            </button>
            <button
              type="button"
              className={mobileSubTab === 'stock' ? 'on' : ''}
              onClick={() => setMobileSubTab('stock')}
            >
              <span aria-hidden="true">▦</span> Shelf stock ({products.length})
              {lowCount > 0 && <span className="dot">{lowCount}</span>}
            </button>
          </nav>

          <main className="panels">
            <div className={'panel ' + (mobileSubTab === 'chat' ? 'active' : '')}>
              <Chat onChange={refreshAll} />
            </div>
            <div className={'panel ' + (mobileSubTab === 'stock' ? 'active' : '')}>
              <StockTable products={products} error={error} onRetry={refreshAll} />
            </div>
          </main>
        </>
      )}

      {mainView === 'khata' && (
        <main className="panel-full">
          <Khata onCustomerUpdated={refreshAll} />
        </main>
      )}

      {mainView === 'pnl' && (
        <main className="panel-full">
          <PnL />
        </main>
      )}

      {/* Footer */}
      <footer className="footer">
        <span><span className="footer-mark">✳</span> Angadi · Traditional Kirana Ledger</span>
        <span>Every sale. Every rupee. In your control.</span>
      </footer>
    </div>
  );
}
