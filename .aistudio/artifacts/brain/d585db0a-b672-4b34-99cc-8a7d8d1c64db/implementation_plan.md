# Angadi: Smart Kirana Inventory, Khata & Profit/Loss System

Transforming the application into **Angadi**—an authentic, full-featured retail management companion for Indian kirana stores featuring expanded grocery inventory, conversational and visual customer credit (Khata) tracking, dynamic high-demand product indicators, and comprehensive daily/monthly Profit & Loss accounting.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed during the interactive clarification phase:
> 
> - **Customer Credit (Khata)**: Supported via **both** conversational chat commands (e.g. `"Ramesh credit 200"`, `"Ramesh paid 150"`) and direct visual controls in a dedicated Khata ledger (add customer, give credit, record payments).
> - **Profit & Loss Calculation**: Calculated using a **product cost price model** (`cost_price`) to compute true gross profit ($\text{Sales} - \text{COGS}$) alongside inventory restocking investments and write-offs for damaged/expired goods for both **Today** and **This Month**.
> - **Product Catalog**: Expanded to a full authentic grocery catalog including staples (Atta, Dal, Rice), dairy (Milk, Butter, Ghee), condiments & spices (Salt, Sugar, Haldi, Mirchi, Tea), and daily essentials (Soaps, Detergent, Snacks).

---

## 1. Overview & Core Concept

**Angadi** (meaning *traditional neighborhood store/shop* in South Indian languages) enables shopkeepers to effortlessly track stock, sales, customer debt, and profitability through natural language messages (chat or WhatsApp) and an interactive visual dashboard.

- **Primary Problem**: Shopkeepers lose hours calculating daily revenue manually, forget credit given to regular customers ("khata / udhar"), and struggle to gauge actual profit after accounting for damaged or expired stock.
- **Solution**: A unified, real-time platform where entering `"sold 2 milk, 1 atta"` or `"Ramesh credit 150"` immediately updates inventory levels, logs financial transactions, computes net profit/loss, and updates customer balances.

```
┌────────────────────────────────────────────────────────────────────────┐
│                                ANGADI                                  │
│                 Conversational Kirana & Khata System                   │
├───────────────────┬──────────────────────┬─────────────────────────────┤
│   INVENTORY &     │      CUSTOMER        │        PROFIT & LOSS        │
│   CHAT LEDGER     │     KHATA BOOK       │          ANALYTICS          │
│                   │                      │                             │
│ • Natural typing  │ • Outstanding dues   │ • Today vs This Month       │
│ • Instant stock   │ • One-click pay/due  │ • Sales Revenue             │
│ • "High Demand"   │ • Chat: "Ramesh      │ • Cost of Goods (COGS)      │
│   top-seller tag  │   credit ₹200"       │ • Damaged / Expired Loss    │
│ • Low stock alert │ • Statement history  │ • Net Gross Profit & Margin │
└───────────────────┴──────────────────────┴─────────────────────────────┘
```

---

## 2. User Experience & Visual Design

### Key Views & Navigation
1. **Top Bar**: Clean brand lockup with **Angadi** display wordmark, server status indicator, and a sleek 3-tab segmented navigation bar:
   - 📦 **Inventory & Chat** (Active stock, conversational assistant, quick chips)
   - 📒 **Customer Khata** (Customer credit book, total outstanding dues, payment settlement)
   - 📊 **Profit & Loss** (Daily & Monthly financial breakdown, margins, damage write-offs)
2. **Dynamic High Demand Tagging**:
   - Products with high sales velocity (calculated dynamically from `transactions` sales volume) display a clean, unboxed **High Demand** badge with sales count in the inventory table.
3. **P&L Financial Cards**:
   - Clean metric grid: **Gross Sales**, **Cost of Sales**, **Damaged / Expired Losses**, **Net Profit / Loss**, and **Profit Margin %**.
   - Period selector: **Today** vs. **This Month**.
   - Detailed ledger breakdown table showing exact itemized contributions.
4. **Customer Credit (Khata) View**:
   - KPI strip: **Total Customers**, **Total Credit Owed (₹)**, **Collected Today (₹)**.
   - Customer cards/table with customer name, contact/notes, current balance, last transaction date, and quick action buttons (`+ Credit`, `✓ Collect`).
   - Customer statement modal showing chronological credit sales and payments.

### Visual Styling & Anti-Slop Discipline
- **Palette**: Deep forest green (`#1b704b`), soft sage neutral canvas (`#f5f7f2`), warm stone card surfaces (`#ffffff`), and restrained alert ochre (`#b96e1b`) for low stock / pending debts.
- **Typography**: Clean display typography (`Manrope`) paired with readable body sans (`DM Sans`) and tabular numerals (`tabular-nums`) for currency and stock counts.
- **Zero-Pill Compliance**: Metadata formatted with clear text separators (`·` or `/`); no floating fake pills, decorative pulsing status dots, or unstyled borders.

---

## 3. Technical Architecture & Database Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Client (React 19)                            │
│    App.jsx  ──► [ Chat.jsx | StockTable.jsx | Khata.jsx | PnL.jsx ]    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Fetch (/api/*)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Express 5 Server (Node.js)                       │
│    /api/products   /api/chat   /api/khata   /api/pnl   /api/customers  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                         SQLite Database (WAL)                          │
│                                                                        │
│   • products (id, name, price, cost_price, stock, min_stock)           │
│   • product_aliases (alias, product_id)                                │
│   • customers (id, name, phone, balance)                               │
│   • transactions (id, batch_id, type, product_id, customer_id,        │
│                   qty, delta, amount, cost_amount, source, ts)         │
└────────────────────────────────────────────────────────────────────────┘
```

### Database Enhancements
1. **Products Table**: Add `cost_price REAL NOT NULL DEFAULT 0`.
2. **Transactions Table**: Add `cost_amount REAL DEFAULT 0` (for computing COGS at time of transaction).
3. **Customers Table**: Add `phone TEXT`, `notes TEXT`, `balance REAL NOT NULL DEFAULT 0`.
4. **Seed Catalog**: Expanded with 18 authentic kirana grocery products across all staple categories with aliases and realistic cost/selling price points.

### P&L Computation Logic
- **Today's Window**: `date(ts, 'localtime') = date('now', 'localtime')`
- **Month's Window**: `strftime('%Y-%m', ts, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`
- **Formulas**:
  - $\text{Total Revenue} = \sum_{\text{sold}} \text{amount}$
  - $\text{COGS} = \sum_{\text{sold}} (\text{qty} \times \text{cost\_price})$
  - $\text{Gross Profit} = \text{Total Revenue} - \text{COGS}$
  - $\text{Damaged Loss} = \sum_{\text{damaged}} (\text{qty} \times \text{cost\_price})$
  - $\text{Net Profit} = \text{Gross Profit} - \text{Damaged Loss}$
  - $\text{Stock Received Value} = \sum_{\text{received}} (\text{qty} \times \text{cost\_price})$

### Natural Language Parser & Engine Additions
- Recognizes credit/khata phrases:
  - `"credit 150 to Ramesh"`, `"Ramesh credit 150"`, `"udhar 200 Suresh"`
  - `"Ramesh paid 100"`, `"payment 100 Ramesh"`, `"jama 100 Ramesh"`
- All existing inventory commands (`sold`, `received`, `damaged`, `returned`, `undo`) preserved without regression.

---

## 4. Execution Plan & Phasing

1. **Database & Seed Evolution (`src/db.js`)**:
   - Alter/initialize tables with `cost_price` on products and `cost_amount` on transactions.
   - Seed expanded 18-item catalog with staples, spices, dairy, and snacks.
   - Seed initial customer records for instant Khata demonstration.
2. **Parser & Engine Updates (`src/parser.js`, `src/engine.js`, `src/ledger.js`)**:
   - Add credit and payment transaction parsing rules.
   - Add query functions for `listProductsWithDemand(db)`, `getPnL(db, period)`, `getCustomers(db)`, `recordCustomerTx(db, ...)`.
3. **Server API Endpoints (`src/server.js`)**:
   - `GET /api/products`: returns product list with `isHighDemand` flag and sales volume.
   - `GET /api/pnl?period=day|month`: returns breakdown of revenue, COGS, damage losses, net profit.
   - `GET /api/customers`: returns customer list with outstanding balances.
   - `POST /api/customers/transaction`: records visual credit or payment for a customer.
4. **Frontend Architecture & Components (`client/src/`)**:
   - Rename branding to **Angadi** across `index.html`, `metadata.json`, header, and welcome card.
   - Update `StockTable.jsx`: Add **High Demand** badge and display cost price & margins.
   - Build `Khata.jsx`: Customer credit management, due summary, and payment modal.
   - Build `PnL.jsx`: Daily & monthly profit/loss dashboard with financial metric cards and itemized logs.
   - Update `App.jsx`: Main navigation tabs (Inventory & Chat, Customer Khata, P&L Analytics) with shared auto-refresh.
5. **Testing & Verification**:
   - Run Node test suite to ensure all 70 existing test cases continue to pass.
   - Compile and verify dev server build.
