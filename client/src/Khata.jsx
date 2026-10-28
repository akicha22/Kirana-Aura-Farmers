import { useState, useEffect, useCallback } from 'react';
import { getCustomers, getCustomerStatement, recordCustomerTx } from './api';

export default function Khata({ onCustomerUpdated }) {
  const [data, setData] = useState({ customers: [], totalDue: 0, totalCustomers: 0, customersWithDue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterDueOnly, setFilterDueOnly] = useState(false);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('credit'); // 'credit' | 'payment'
  const [selectedCustName, setSelectedCustName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Statement modal state
  const [statementCust, setStatementCust] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const fetchKhata = useCallback(async () => {
    try {
      const res = await getCustomers();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKhata();
  }, [fetchKhata]);

  const openActionModal = (type, cust = null) => {
    setModalType(type);
    setSelectedCustName(cust ? cust.name : '');
    setPhoneInput(cust && cust.phone ? cust.phone : '');
    setAmountInput('');
    setModalError(null);
    setModalOpen(true);
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustName.trim()) {
      setModalError('Customer name is required.');
      return;
    }
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0) {
      setModalError('Please enter a valid amount greater than 0.');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      await recordCustomerTx({
        customerName: selectedCustName.trim(),
        amount: amt,
        type: modalType,
        phone: phoneInput.trim() || undefined,
      });
      setModalOpen(false);
      await fetchKhata();
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const viewStatement = async (cust) => {
    setStatementCust(cust);
    setStatementLoading(true);
    try {
      const res = await getCustomerStatement(cust.id);
      setStatementData(res);
    } catch {
      setStatementData(null);
    } finally {
      setStatementLoading(false);
    }
  };

  const filteredCustomers = (data.customers || []).filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search));
    const matchesDue = filterDueOnly ? c.balance > 0 : true;
    return matchesSearch && matchesDue;
  });

  return (
    <div className="khata-container">
      {/* Khata KPI Strip */}
      <div className="khata-stats-grid">
        <div className="khata-stat-card primary">
          <span className="stat-label">TOTAL CREDIT OUTSTANDING</span>
          <strong className="stat-number font-mono">₹{data.totalDue.toLocaleString('en-IN')}</strong>
          <small className="stat-subtext">Money owed by customers to Angadi</small>
        </div>
        <div className="khata-stat-card warn">
          <span className="stat-label">CUSTOMERS WITH DUE</span>
          <strong className="stat-number font-mono">{data.customersWithDue}</strong>
          <small className="stat-subtext">Accounts with active pending debt</small>
        </div>
        <div className="khata-stat-card neutral">
          <span className="stat-label">TOTAL KHATA ACCOUNTS</span>
          <strong className="stat-number font-mono">{data.totalCustomers}</strong>
          <small className="stat-subtext">Registered regular customers</small>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="khata-card">
        <div className="khata-card-header">
          <div>
            <h2>Customer Udhar &amp; Khata Book</h2>
            <p className="card-subtitle">
              Manage daily credits and payments. You can also type in chat like <code>Ramesh credit 200</code> or <code>Ramesh paid 100</code>.
            </p>
          </div>
          <div className="khata-actions">
            <button
              type="button"
              className="action-btn credit"
              onClick={() => openActionModal('credit')}
            >
              + Give Credit (Udhar)
            </button>
            <button
              type="button"
              className="action-btn payment"
              onClick={() => openActionModal('payment')}
            >
              ✓ Collect Payment (Jama)
            </button>
          </div>
        </div>

        {error && (
          <div className="banner error">
            Failed to load customers: {error}
            <button type="button" onClick={fetchKhata}>Retry</button>
          </div>
        )}

        <div className="khata-controls">
          <div className="stock-search-wrap">
            <input
              type="text"
              className="stock-search"
              placeholder="Search customer by name or phone..."
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
              className={`filter-chip ${!filterDueOnly ? 'active' : ''}`}
              onClick={() => setFilterDueOnly(false)}
            >
              All Customers ({data.totalCustomers})
            </button>
            <button
              type="button"
              className={`filter-chip ${filterDueOnly ? 'active' : ''}`}
              onClick={() => setFilterDueOnly(true)}
            >
              Dues Only ({data.customersWithDue})
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th className="num">Balance Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px' }}>Loading accounts...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#7a8c7e' }}>
                    No customer accounts found matching your filter.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const hasDue = cust.balance > 0;
                  return (
                    <tr key={cust.id} className={hasDue ? 'due-row' : ''}>
                      <td>
                        <strong>{cust.name}</strong>
                      </td>
                      <td className="muted-text font-mono">
                        {cust.phone || '—'}
                      </td>
                      <td className="num font-mono">
                        <span className={hasDue ? 'due-amount' : 'settled-amount'}>
                          ₹{cust.balance.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td>
                        {hasDue ? (
                          <span className="due-status-pill warn">Pending Due</span>
                        ) : (
                          <span className="due-status-pill clean">All Cleared</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-action-btns">
                          <button
                            type="button"
                            className="btn-tiny credit"
                            title="Add Credit"
                            onClick={() => openActionModal('credit', cust)}
                          >
                            + Udhar
                          </button>
                          <button
                            type="button"
                            className="btn-tiny payment"
                            title="Record Payment"
                            onClick={() => openActionModal('payment', cust)}
                          >
                            ✓ Jama
                          </button>
                          <button
                            type="button"
                            className="btn-tiny info"
                            title="View Statement"
                            onClick={() => viewStatement(cust)}
                          >
                            Statement
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit / Payment Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalType === 'credit' ? 'Record Credit Given (Udhar)' : 'Record Payment Received (Jama)'}</h3>
              <button type="button" className="close-x" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleActionSubmit} className="modal-form">
              {modalError && <div className="banner error">{modalError}</div>}
              <div className="form-group">
                <label>Customer Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={selectedCustName}
                  onChange={(e) => setSelectedCustName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Phone Number (Optional)</label>
                <input
                  type="tel"
                  placeholder="e.g. 9845012345"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="e.g. 200"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button
                  type="submit"
                  className={`btn-primary ${modalType === 'credit' ? 'btn-warn' : 'btn-accent'}`}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : modalType === 'credit' ? 'Confirm Credit' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {statementCust && (
        <div className="modal-backdrop" onClick={() => setStatementCust(null)}>
          <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Statement: {statementCust.name}</h3>
                <p className="statement-sub">
                  Current Balance Due: <strong className="font-mono">₹{statementCust.balance}</strong>
                  {statementCust.phone && <span> · Phone: {statementCust.phone}</span>}
                </p>
              </div>
              <button type="button" className="close-x" onClick={() => setStatementCust(null)}>✕</button>
            </div>
            <div className="statement-body">
              {statementLoading ? (
                <p style={{ textAlign: 'center', padding: '24px' }}>Loading transaction history...</p>
              ) : !statementData || !statementData.transactions || statementData.transactions.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px', color: '#77887b' }}>No recorded transactions yet.</p>
              ) : (
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Date &amp; Time</th>
                      <th>Type</th>
                      <th>Source</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="font-mono muted-text">
                          {new Date(tx.ts).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td>
                          {tx.type === 'credit_sale' ? (
                            <span className="due-status-pill warn">Credit Given</span>
                          ) : tx.type === 'payment' ? (
                            <span className="due-status-pill clean">Payment Made</span>
                          ) : (
                            <span className="due-status-pill">{tx.type}</span>
                          )}
                        </td>
                        <td className="muted-text">{tx.source || 'web'}</td>
                        <td className="num font-mono">
                          <strong style={{ color: tx.type === 'credit_sale' ? '#b45309' : '#15803d' }}>
                            {tx.type === 'credit_sale' ? '+₹' : '-₹'}{tx.amount}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
