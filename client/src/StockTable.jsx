import { useState } from 'react';

export default function StockTable({ products, error, onRetry }) {
  const [search, setSearch] = useState('');
  const [filterLow, setFilterLow] = useState(false);
  const [filterDemand, setFilterDemand] = useState(false);

  let filtered = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesLow = filterLow ? p.low : true;
    const matchesDemand = filterDemand ? p.isHighDemand : true;
    return matchesSearch && matchesLow && matchesDemand;
  });

  const rows = [...filtered].sort(
    (a, b) => Number(b.low) - Number(a.low) || (b.unitsSold || 0) - (a.unitsSold || 0) || a.name.localeCompare(b.name)
  );

  const lowCount = products.filter((p) => p.low).length;
  const highDemandCount = products.filter((p) => p.isHighDemand).length;

  return (
    <section className="stock">
      <div className="stock-header">
        <div>
          <h2>Shelf Inventory ({products.length} items)</h2>
          <p className="stock-subtitle">Live stock counts with automatic high demand and low threshold alerts</p>
        </div>
      </div>

      {error && (
        <div className="banner error">
          Can't reach the server. <button type="button" onClick={onRetry}>Retry</button>
        </div>
      )}

      {!error && lowCount > 0 && (
        <div className="banner warn">
          ⚠️ {lowCount} product{lowCount > 1 ? 's' : ''} running low on stock. Please restock soon.
        </div>
      )}

      <div className="stock-controls">
        <div className="stock-search-wrap">
          <input
            type="text"
            className="stock-search"
            placeholder="Search products (e.g. Atta, Dal, Maggi, Milk)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="clear-btn" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <div className="filter-group">
          <button
            type="button"
            className={`filter-chip ${filterLow ? 'active' : ''}`}
            onClick={() => setFilterLow(!filterLow)}
          >
            Low Stock ({lowCount})
          </button>
          <button
            type="button"
            className={`filter-chip ${filterDemand ? 'active' : ''}`}
            onClick={() => setFilterDemand(!filterDemand)}
          >
            ★ High Demand ({highDemandCount})
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Item &amp; Status</th>
              <th className="num">Price</th>
              <th className="num">Cost</th>
              <th className="num">In Stock</th>
              <th className="num">Min</th>
              <th className="num">Sold</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: '#88988b' }}>
                  No products found matching "{search}".
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className={p.low ? 'low' : ''}>
                  <td>
                    <div className="product-cell">
                      <span className="product-name">{p.name}</span>
                      <div className="tag-row">
                        {p.isHighDemand && (
                          <span className="tag demand" title="High sales volume based on customer transactions">
                            ★ High Demand
                          </span>
                        )}
                        {p.low && (
                          <span className="tag low-tag">
                            LOW STOCK
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="num font-mono">₹{p.price}</td>
                  <td className="num font-mono muted-num">₹{p.cost_price || Math.round(p.price * 0.82)}</td>
                  <td className="num font-mono font-bold">{p.stock}</td>
                  <td className="num font-mono muted-num">{p.min_stock}</td>
                  <td className="num font-mono demand-num">{p.unitsSold || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}