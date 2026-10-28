# Kirana Chat Ledger — Aura Farmers

A lightweight kirana inventory ledger. Record sales, incoming stock, damaged items, returns, and undo the last update using natural-language messages. The React dashboard shows live stock and low-stock warnings. WhatsApp integration is optional.

## Run locally (Windows PowerShell)

**Requirements:** Node.js 20.19+ (or a current supported Node.js release) and npm.

1. Clone the repository and open its folder:
   ```powershell
   git clone https://github.com/akicha22/Kirana-Aura-Farmers.git
   cd Kirana-Aura-Farmers
   ```
2. Install backend and frontend dependencies:
   ```powershell
   npm.cmd run setup
   ```
3. Build the frontend and start the app:
   ```powershell
   npm.cmd start
   ```
4. Open **http://localhost:3000**. You can also check **http://localhost:3000/api/health**; it should return `{"ok":true}`.

Using `npm.cmd` in PowerShell also avoids common PowerShell script-execution-policy errors involving `npm.ps1`.

The local dashboard and stock ledger work without WhatsApp credentials. The first run creates `kirana.db` and seeds sample products. Later runs reuse the same database, so stock changes persist. To reset demo data, stop the server and delete `kirana.db` (and its `kirana.db-shm` / `kirana.db-wal` files if present). This deletes local ledger history.

## Try these messages

- `sold 3 maggi small, 2 milk`
- `received 20 rice bags`
- `damaged 1 oil`
- `returned 2 biscuits`
- `sold 3 biscuits for 25`
- `undo`

For `sold 3 maggi`, the app asks which Maggi product you mean before changing stock. The example catalog and starting quantities are demo data in `src/db.js`.

## Development mode

Run the backend and frontend in separate terminals:

Terminal 1:
```powershell
npm.cmd run dev
```

Terminal 2:
```powershell
npm.cmd run dev:client
```

Open the Vite URL shown in Terminal 2 (normally **http://localhost:5173**). API calls are proxied to the backend on port 3000.

Run the backend tests with:
```powershell
npm.cmd test
```

## Optional: connect WhatsApp Cloud API

1. Copy the example environment file:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Edit `.env` with values from your Meta WhatsApp Cloud API app:
   - `VERIFY_TOKEN`: a secret phrase you choose and also enter in the Meta webhook setup.
   - `ALLOWED_NUMBERS`: allowed sender phone number(s), country code included, digits only. Separate multiple numbers with commas.
   - `WHATSAPP_TOKEN`: a valid access token.
   - `PHONE_NUMBER_ID`: the WhatsApp Cloud API phone-number ID (not the displayed phone number).
   - `WHATSAPP_APP_SECRET`: the Meta app secret. Set it to enforce webhook request-signature verification; leave blank only for local webhook testing.
   - `GRAPH_VERSION`: the Graph API version configured for your app.
3. Start the app using `npm.cmd start`.
4. Expose port 3000 through your tunnel and configure the Meta callback URL as `https://YOUR-TUNNEL-URL/webhook`. Set the same `VERIFY_TOKEN` in Meta and subscribe to the `messages` webhook field.
5. Verify the callback with Meta's webhook setup. The local health endpoint is `/api/health`; the WhatsApp verification route is `/webhook`.

**Important:** Never commit `.env`, access tokens, app secrets, or real customer data. WhatsApp messages from numbers not listed in `ALLOWED_NUMBERS` are ignored. Test with demo data before relying on the ledger in a real shop.

## Project layout

- `src/server.js` — Express API and static frontend hosting
- `src/parser.js` — natural-language stock update parser
- `src/engine.js` and `src/ledger.js` — conversation flow, stock updates, and undo
- `src/db.js` — SQLite schema and demo catalog
- `src/whatsapp.js` — WhatsApp webhook and outbound replies
- `client/` — React + Vite dashboard
- `test/` — parser, ledger, engine, and webhook tests
