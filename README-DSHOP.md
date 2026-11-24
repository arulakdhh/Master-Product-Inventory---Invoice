# D Shop: customer app for Dr Han Health Care

D Shop is the customer side of D Cart. Hospitals, surgeons, clinics/dealers and patients sign in with a login ID from DHH, browse products by type, see their price in the cart (Rate × your sell %, less their discount), confirm with GST, and track sales orders, challans, invoices and dues.

It uses the **same Firebase project as D Cart** (dhh-register). Nothing new to pay for.

## 1. Firebase (5 minutes)

1. **Turn on login IDs.** Firebase console → **dhh-register** → **Authentication → Sign-in method → Add new provider → Email/Password** → switch on the first toggle only → **Save**. (Google sign-in for D Cart stays as it is.)
2. **Add the D Shop rules.** **Firestore Database → Rules**. Open `firestore-dshop-rules.txt` from this zip, copy everything from `// ---------- D Shop` to the end, and paste it on the line just above `match /settings/{doc} {`. Keep your own email(s) in `owners()`. Click **Publish**.

## 2. GitHub (5 minutes)

Upload into your D Cart repository, keeping the folders:

| File | What it is |
|---|---|
| `index.html` | D Cart, now loading `shop-link.js` (replaces the old one) |
| `shop-link.js` | New: the **D Shop** panel in D Cart |
| `firestore.rules` | Full rules file with the D Shop part (for your records) |
| `dshop/` folder | New: the D Shop app (`index.html`, `app.js`, `manifest.webmanifest`, `sw.js`, two icons) |

To upload the folder: **Add file → Upload files**, then drag the whole `dshop` folder in. GitHub keeps the folder name.

D Shop's address is your D Cart address with `dshop/` at the end:
`https://arulakdhh.github.io/Master-Product-Inventory---Invoice/dshop/`

## 3. In D Cart

1. Press **Ctrl + Shift + R**. A new **D Shop** panel appears (admins see it at once; give other staff access under **Admin panel → Users & access → D Shop**).
2. **D Shop → Catalog:** the catalog publishes itself. Check the **GST %** (default 5) and the **Low** stock level, untick any product you don't want customers to see, and correct product types if needed. Prices come from your existing selling-price settings (Rate × sell %, default 200%).
3. **D Shop → Customers & logins → New customer and login:** name, type, discount %, the matching D Cart customer (so their invoices and dues show), a login ID. You get a **temporary password** shown once: send it with the D Shop address.
4. **D Shop → Orders in:** new orders appear here. **Make sales order** fills a sales order (oldest-expiry stock first, prices and discount as ordered). Save it, then make the challan and invoice from it as usual. The customer sees each step and document.
5. **D Shop → Payment advices:** customers' "I have paid" notes. Record the money in Payment Received as usual, then mark the advice **Checked**.

**Forgotten password:** Customers & logins → **New temp password** on their login. Their orders and history stay.

**Keep D Cart open sometimes:** customers can order at any time, but the catalog, order status, documents and dues update while someone with D Shop edit rights has D Cart open.

## 4. Customers: install on the phone

Open the D Shop address, sign in, then:
- **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

It then opens full screen with its own D Shop icon, like a normal app.

## What customers can and can't see

- They see: product names, codes, sizes, availability (In stock / Low / On request), their own price, their own orders, documents, dues.
- They never see: purchase rates, suppliers, divisions, other customers, stock counts or profit.
