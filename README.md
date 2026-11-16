# Implant Product Register — source code

The web app that stores supplier invoice lines, issues permanent DHH Product IDs (PIDs) by division, tracks stock, and makes quotations, delivery challans and tax invoices for Dr Han Health Care Pvt Ltd.

Live copy: the "Implant Product Register" artifact on claude.ai (private to its owner).

## Folder layout

| Path | What it is |
|---|---|
| `app/index.html` | The whole app: page layout, styles, PID creation, product lists, analysis, invoice import, exports, database wiring |
| `app/sales.js` | Sales & stock: quotations, delivery challans, tax invoices, customers, company details, PDF output, sales exports |
| `app/parser.js` | Reads the Meril invoice PDF layout and returns header, lines and printed totals. Used in the browser and in Node |
| `app/seed.json` | The two invoices extracted first (9426313394 and 9426313395, 1,154 lines). Loaded by the "Load 1,154 lines" button |
| `app/lib/` | Third-party libraries, unchanged: pdf.js 3.11.174 (reads PDFs), jsPDF 2.5.1 and jsPDF-AutoTable 3.8.2 (make PDFs). SheetJS 0.18.5 (Excel) loads from cdnjs |
| `database/schema.sql` | The same data as MySQL tables, plus a `stock_by_pid` view |
| `tools/extract_invoice_pdf.py` | The Python extractor used to make the first Excel files (`python3 extract_invoice_pdf.py invoice.txt`, where the .txt comes from `pdftotext -layout`) |
| `tools/build_invoice_excel.py` | The script that built `Invoice_…_Product_Details.xlsx` (needs `openpyxl`; written for invoice 9426313395, so change the header/footer values for another invoice) |
| `local-testing/mock-db.js` | A fake in-memory database, so you can open the app locally without claude.ai (see below) |

## How the database works

The live app uses the **claude.ai artifact database**. It's a document store (JSON documents at slash-separated paths, similar to Firebase Firestore). The page reaches it through `await claude.use("db")`, and claude.ai provides that only when the page runs inside claude.ai. There is no server code and no SQL inside the live app.

Access rule declared on the artifact: everyone you share with can read, and only you (the owner) and Editors can write:

```json
{ "db": { "rules": [ { "path": "", "read": "view", "write": "admin" } ] }, "user": {}, "downloads": true }
```

### Collections and documents

| Path | Contents |
|---|---|
| `invoices/{invoiceNo}` | Invoice header: date, supplier, buyer, GSTINs, printed footer totals, `rowCount`, `chunkCount`, `sourceFile`, `importedAt`, `removedLines[]` |
| `chunks/{invoiceNo}_{000}` | `{invoiceNo, k, rows:[…]}`, up to 100 invoice lines per document (documents are capped at 256 KB). Each row: `sr, hsn, mat, desc, batch, serial, exp, uom, qty, mrp, rate, basic, disc, freight, taxable, igstRate, igst` |
| `registry/{invoiceNo}` | PIDs for that invoice: `{division, lines:{ "<sr>": {div, id, mat, batch, serial, issuedAt} }, retired:[…]}`. Kept separate from `chunks` so that re-importing an invoice never changes its PIDs |
| `settings/divisions` | `{list:[{code,name}]}`. Default: MLS, MHC, MED, MDG |
| `settings/counters` | `{counts:{MLS:n, MHC:n, …}}`. Last PID number per division. Only ever goes up |
| `sales/{TYPE}_{FY}_{SEQ}` | A quotation, challan or invoice: `type, no, date, status, customer{}, extra[], notes, lines[], totals{}, intra, fromDc, refId, refNo, company{}` (a copy of the company details at the time) |
| `customers/{id}` | Saved customers |
| `settings/company` | Company details printed on documents |
| `settings/salescounters` | `{counts:{"INV_26-27":n, "QTN_26-27":n, "DC_26-27":n}}` |
| `presets/{id}` | Saved column sets (e.g. a Tally layout) |

### Rules the code enforces

- **PIDs** are `division code + number` with at least 2 digits (MLS01 … MLS99, MLS100). Issuing takes a lease on `settings/counters`, so two devices can't take the same number. The counter is written *before* the registry, so a failure leaves a gap and never a duplicate. Deleting lines or invoices moves their PIDs to `retired[]`; they're never reused.
- **Stock**: available = received − sold. A sales line reduces stock if it's on a challan that isn't cancelled, or on an active invoice not made from a challan (`lineDeducts()` in `sales.js`). Saving checks availability; serial-numbered items are limited to qty 1. You can't delete purchase lines that are already sold.
- **Document numbers**: `DHH/{FY}/0001`, `DHH/QTN/{FY}/0001`, `DHH/DC/{FY}/0001`. FY runs April–March (`fyOf()` in `sales.js`). Issued under a lease on `settings/salescounters`.
- **GST**: if the customer's state code equals the company's (33, Tamil Nadu), use CGST + SGST at half the rate each; otherwise IGST.

## Running it on your own server

The app is plain HTML and JavaScript with no build step. Every database call is in two places:

- `index.html`: the `boot` block at the end (subscriptions), plus `saveInvoice`, `deleteInvoice`, `retirePids`, `deleteLines`, `createPids`, presets, divisions
- `sales.js`: `nextNumber`, `saveDoc`, `cancelDoc`, `saveCompany`, `deleteCustomer`

They all use one small interface:

```js
db.doc(path).set(obj) / .get() / .delete() / .onSnapshot(cb) / .acquire({holder, ttlMs})
db.collection(path).onSnapshot(cb)      // cb gets {docs:[{id, data()}], metadata:{fromCache}}
```

To run it outside claude.ai, provide a `window.claude` object whose `use("db")` returns something with that interface:

- **Firebase Firestore**: almost one-to-one (`doc`, `collection`, `set`, `get`, `onSnapshot`). Replace `acquire` with a Firestore transaction on the counter document.
- **Supabase or your own PHP/Node + MySQL API**: implement `set/get/delete` as REST calls to a table `documents(path VARCHAR PRIMARY KEY, data JSON)`. Implement `onSnapshot` as a poll every few seconds (or Supabase realtime). Implement `acquire` as `SELECT … FOR UPDATE` on the counter row. Or move to the relational tables in `database/schema.sql` and change the functions listed above.
- `use("downloads")` must return `{save({filename, data})}`; in a normal browser that can be a Blob plus `<a download>`.
- `use("user")` can return `null`.

`local-testing/mock-db.js` is a working example of that interface, held in memory.

### Try it locally

Add one line to `app/index.html`, just before `<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/…">`:

```html
<script src="../local-testing/mock-db.js"></script>
```

Then, from this folder (the one containing `app/` and `local-testing/`):

```bash
python3 -m http.server 8000
```

and open http://localhost:8000/app/index.html. Data disappears when you reload, so this is for testing only.

## Connecting your live website today

Without changing anything, use **Export & connect → Download SQL (MySQL)** in the app. Rename `.sql.txt` to `.sql` and import it with phpMyAdmin. It creates and updates `invoices`, `invoice_items` (with PID, division, sold and available quantities), `sales_documents` and `sales_items`. Re-importing replaces rows instead of duplicating them.
