# Gen Zi Corner — Retail POS Redesign

React + CSS, Vite, Lucide, SweetAlert2 and JsBarcode. Frontend with device-local data and a cloud API adapter.

## Run

Use Node 20.19+ or 22.12+:

```sh
npm install
npm run dev
```

Demo login is prefilled. It is not production authentication.

```sh
npm run build
npm run preview
npm test
```

`dist/` includes the built app. Serve it at a domain root; do not open index.html using file://.

## Redesigned screens

- POS and Products use six product columns on desktop widths above 1350px, then four, three or two on smaller screens. Product photographs are bundled locally for offline use. Upload actual shop photos through product forms; included photos are illustrative demo stock.
- Products include picture cards, edit/delete controls and a complete stock/price table. All original local CRUD, checkout, held bills, returns, purchase receiving and keyboard interactions remain.
- Reports include Sales, Product, Inventory, Customer, Supplier, Purchase, Expense and Employee tabs, search, CSV exports, and real data totals. Today/month filters apply to sales and expenses; master-data reports show current snapshots.
- Expenses includes add/edit/delete forms and an operating expense report.
- Settings includes General, Receipt Customization, Label Printers and Security & User Roles. Receipt header, subtitle, contact visibility, logo, footer, width and automatic print-dialog opening are configurable.
- Barcode Studio supports mixed-product batches, per-product quantities, removal, clear batch, CODE128 previews, actual-size labels, roll and A4 formats. It prints all queued labels, not only visible preview labels.
- Light/dark modes, responsive sidebar, backup/restore, offline queue, and original gold logo.

## Printing

Save Settings first. Choose 58/80mm for receipts and 25–100mm for label dimensions. In Barcode Studio choose a product, copies, Add to print batch, then Roll or A4 sheet and Print.

Roll printing uses one page per label and exact configured paper dimensions. A4 uses configured columns and gaps. Ensure columns fit A4 usable width. Select matching paper stock in the driver, print at 100% scale, and disable headers/footers. Roll stock uses zero page margins. Test one label before a large batch and verify barcode scanning on physical stock. Printer display names are preferences; browsers require device selection in the print dialog. Direct/silent printing requires a local print bridge.

## Source structure

`src/components/` contains auth, common, layout, dashboard, pos (PosView, PaymentModal, ReceiptModal), products, categories, inventory, orders, customers, suppliers, expenses, employees, reports, settings, labels and offline folders. Each screen is a separate component. `App.jsx` owns shared state and actions. `domain.js` handles seed and billing calculations; `cloud.js` is the integration adapter.

## Data and backend integration

Data uses the existing `genzi-v1` localStorage key. Existing business records and uploaded images are retained. Only legacy bundled screenshot image URLs are replaced with illustrative catalogue photos. Receipt width is migrated from `80mm` to numeric `80`; settings defaults and expenses are added.

Device offline storage is not a production multi-user backend. Production requires real authentication, reset emails, server role enforcement, audited stock/returns, payment processing and cloud CRUD. Set `VITE_API_URL` as described in `.env.example`; `/sales/sync` must acknowledge receipt UUIDs through `{acceptedIds:[...]}` and enforce idempotency. Only acknowledged receipts become synced. Card entries record payment allocations; they do not charge cards.

Load the production app successfully online before offline use. The service worker caches visited assets and bundled catalogue photos; clearing browser data removes unsynced data. Export backups regularly. Synced receipt returns need a backend returns endpoint. Stock transfers and staff permissions remain integration work.

## Validation

Production build and four billing/stock tests pass. Nine screen components also pass a server-render smoke check, catching render-time reference errors. See VALIDATION.md. Interactive browser checks and physical label/receipt printer calibration remain unverified in this environment.

## Latest advanced textile features
See UPGRADE_NOTES.md for the new filters, stock count history, reorder planner, catalogue export, keyboard shortcuts, login image and validation limits.
