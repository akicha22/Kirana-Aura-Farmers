import { useState, useEffect, useCallback } from 'react';
import { getPnL } from './api';

export default function PnL() {
  const [period, setPeriod] = useState('day'); // 'day' | 'month'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPnL = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPnL(period);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchPnL();
  }, [fetchPnL]);

  const isProfitable = data && data.netProfit >= 0;

  return (
    <div className="pnl-container">
      {/* Header and Period Controls */}
      <div className="pnl-header-card">
        <div className="pnl-title-group">
          <h2>Profit &amp; Loss Statement</h2>
          <p className="pnl-subtitle">
            Accurate accounting calculating sold revenue, cost of goods (COGS), received stock, and expired/damaged losses.
          </p>
        </div>
        <div className="period-toggle">
          <button
            type="button"
            className={`period-btn ${period === 'day' ? 'active' : ''}`}
            onClick={() => setPeriod('day')}
          >
            Today's P&amp;L
          </button>
          <button
            type="button"
            className={`period-btn ${period === 'month' ? 'active' : ''}`}
            onClick={() => setPeriod('month')}
          >
            This Month
          </button>
        </div>
      </div>

      {error && (
        <div className="banner error">
          Failed to load financial records: {error}
          <button type="button" onClick={fetchPnL}>Retry</button>
        </div>
      )}

      {loading && !data ? (
        <div className="pnl-loading">Calculating store financials...</div>
      ) : data && (
        <>
          {/* Main KPI Overview */}
          <div className="pnl-stats-grid">
            {/* Net Profit Card - Highlighted */}
            <div className={`pnl-stat-card hero-card ${isProfitable ? 'profit' : 'loss'}`}>
              <div className="card-top-row">
                <span className="stat-label">FINAL NET {isProfitable ? 'PROFIT' : 'LOSS'} ({period === 'day' ? 'TODAY' : 'THIS MONTH'})</span>
                <span className={`status-badge ${isProfitable ? 'profit-badge' : 'loss-badge'}`}>
                  {isProfitable ? '✓ Net Gain' : '⚠ Net Loss'}
                </span>
              </div>
              <strong className="stat-number font-mono">
                {isProfitable ? '+' : ''}₹{data.netProfit.toLocaleString('en-IN')}
              </strong>
              <div className="stat-footnote">
                <span>Margin: <strong className="font-mono">{data.profitMargin}%</strong></span>
                <span className="dot-sep">·</span>
                <span>Gross: <strong className="font-mono">₹{data.grossProfit}</strong></span>
                <span className="dot-sep">·</span>
                <span>Damage Loss: <strong className="font-mono" style={{ color: '#dc2626' }}>-₹{data.damagedLoss}</strong></span>
              </div>
            </div>

            {/* Sales Revenue */}
            <div className="pnl-stat-card">
              <span className="stat-label">GROSS SALES REVENUE</span>
              <strong className="stat-number font-mono">₹{data.totalSales.toLocaleString('en-IN')}</strong>
              <small className="stat-subtext">From {data.totalSoldQty} units sold</small>
            </div>

            {/* Cost of Goods Sold */}
            <div className="pnl-stat-card">
              <span className="stat-label">COST OF GOODS SOLD (COGS)</span>
              <strong className="stat-number font-mono">₹{data.cogs.toLocaleString('en-IN')}</strong>
              <small className="stat-subtext">Product purchase wholesale cost</small>
            </div>

            {/* Damaged & Expired Loss */}
            <div className="pnl-stat-card danger">
              <span className="stat-label">DAMAGED &amp; EXPIRED LOSS</span>
              <strong className="stat-number font-mono" style={{ color: '#b91c1c' }}>
                ₹{data.damagedLoss.toLocaleString('en-IN')}
              </strong>
              <small className="stat-subtext">{data.totalDamageQty} units written off</small>
            </div>

            {/* Restocked / Received Value */}
            <div className="pnl-stat-card info">
              <span className="stat-label">INVENTORY RECEIVED</span>
              <strong className="stat-number font-mono">₹{data.totalReceivedValue.toLocaleString('en-IN')}</strong>
              <small className="stat-subtext">{data.totalReceivedQty} units added to shelves</small>
            </div>

            {/* Khata Credit Given */}
            <div className="pnl-stat-card neutral">
              <span className="stat-label">UDHAR GIVEN THIS {period.toUpperCase()}</span>
              <strong className="stat-number font-mono">₹{data.creditGiven.toLocaleString('en-IN')}</strong>
              <small className="stat-subtext">₹{data.paymentCollected} collected</small>
            </div>
          </div>

          {/* Itemized Tables Grid */}
          <div className="pnl-tables-grid">
            {/* Sales & Margin Breakdown */}
            <div className="pnl-card">
              <div className="pnl-card-title">
                <h3>Product Sales &amp; Margin Breakdown</h3>
                <span className="count-pill">{data.itemizedSales.length} products sold</span>
              </div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">Sold Qty</th>
                      <th className="num">Revenue</th>
                      <th className="num">COGS</th>
                      <th className="num">Gross Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.itemizedSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#748679' }}>
                          No sales recorded in this {period}.
                        </td>
                      </tr>
                    ) : (
                      data.itemizedSales.map((item, idx) => (
                        <tr key={idx}>
                          <td><strong>{item.name}</strong></td>
                          <td className="num font-mono">{item.qty}</td>
                          <td className="num font-mono">₹{item.revenue}</td>
                          <td className="num font-mono muted-text">₹{item.cogs}</td>
                          <td className="num font-mono" style={{ color: '#15803d', fontWeight: 700 }}>
                            +₹{item.profit}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Damaged & Expired Stock */}
            <div className="pnl-card">
              <div className="pnl-card-title">
                <h3>Damaged, Expired &amp; Lost Inventory</h3>
                <span className="count-pill warn">{data.itemizedDamages.length} write-offs</span>
              </div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">Units Lost</th>
                      <th className="num">Cost Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.itemizedDamages.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '24px', color: '#748679' }}>
                          Zero damaged or expired items in this {period}. Great job!
                        </td>
                      </tr>
                    ) : (
                      data.itemizedDamages.map((item, idx) => (
                        <tr key={idx}>
                          <td><strong>{item.name}</strong></td>
                          <td className="num font-mono">{item.qty}</td>
                          <td className="num font-mono" style={{ color: '#b91c1c', fontWeight: 700 }}>
                            -₹{item.loss}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
