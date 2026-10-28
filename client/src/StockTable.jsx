export default function StockTable({ products, error, onRetry }) {
    const rows = [...products].sort(
      (a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)
    );
    const lowCount = products.filter((p) => p.low).length;
  
    return (
      <section className="stock">
        <h2>Stock</h2>
        {error && (
          <div className="banner error">
            Can't reach the server. <button type="button" onClick={onRetry}>Retry</button>
          </div>
        )}
        {!error && lowCount > 0 && (
          <div className="banner warn">⚠️ {lowCount} item{lowCount > 1 ? 's' : ''} running low</div>
        )}
        <table>
          <thead>
            <tr><th>Item</th><th className="num">In stock</th><th className="num">Min</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.low ? 'low' : ''}>
                <td>{p.name}{p.low && <span className="tag">LOW</span>}</td>
                <td className="num">{p.stock}</td>
                <td className="num">{p.min_stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }