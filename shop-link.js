/* =====================================================================
   D Cart ↔ D Shop (customer app)
   Adds the "D Shop" panel and keeps the customer app's data up to date.
   Both apps use this register's Firebase project (dhh-register):
     shopCatalog/main     product list for customers: selling price only (from
                          Pricing settings: Rate × sell %), availability band.
                          Purchase rates never leave D Cart.
     shopCatalog/config   GST %, low-stock level, product types, hidden products
     shopCustomers/{cid}  customer name, type, discount %, linked D Cart customer
     shopLogins/{login}   login ID → sign-in address (read by the login screen)
     shopUsers/{uid}      one per login: customer, "must change password", active
     shopOrders/{id}      orders placed in D Shop (status written back from here)
     shopDocs/{saleId}    customer copy of linked sales orders / challans / invoices
     shopDues/{cid}       unpaid invoices of the linked D Cart customer
     shopAdvices/{id}     "I have paid" notes sent from D Shop
   Sync runs whenever someone with D Shop edit rights has D Cart open.
   ===================================================================== */
(function () {
  "use strict";
  if (!window.firebase || !window.FIREBASE_CONFIG) return;           // claude.ai copy: no customer app
  const DOMAIN = (window.FIREBASE_CONFIG.projectId || "dshop") + ".web.app";  // login IDs become <id>@<project>.web.app (never emailed)
  const TYPES = ["hospital", "surgeon", "clinic", "patient"];
  const TYPE_LABEL = { hospital: "Hospital", surgeon: "Surgeon / doctor", clinic: "Clinic / dealer", patient: "Patient / public" };
  const ORDER_ST = { sent: ["warn", "New"], confirmed: ["good", "Confirmed"], dispatched: ["good", "Dispatched"], billed: ["good", "Billed"], rejected: ["bad", "Can't supply"], cancelled: ["bad", "Cancelled"] };
  const PRODUCT_TYPES = ["Locking screws", "Cortex screws", "Cancellous & cannulated screws", "Other screws & bolts", "Plates", "Nails", "Washers", "Hip & joint", "Stents", "Balloon catheters", "Guide wires", "Sheaths & catheters", "Staplers & sutures", "Test kits", "Other products"];
  function guessType(desc) {
    const d = " " + String(desc || "").toUpperCase() + " ";
    if (/NAIL/.test(d)) return "Nails";
    if (/PLATE|[\s,]PL[\s,]|PL\s*[LR]\s|\bPL$/.test(d)) return "Plates";
    if (/STENT/.test(d)) return "Stents";
    if (/BALLOON|PTCA/.test(d)) return "Balloon catheters";
    if (/GUIDE ?WIRE/.test(d)) return "Guide wires";
    if (/SHEATH|INTRODUCER|CATHETER/.test(d)) return "Sheaths & catheters";
    if (/STAPLER|RELOAD|SUTURE/.test(d)) return "Staplers & sutures";
    if (/TEST|KIT/.test(d)) return "Test kits";
    if (/LOCK(ING)?\s*(CANCELLOUS\s*)?(SCREW|SC\b)|LOCKING SCREW/.test(d)) return "Locking screws";
    if (/CORTEX/.test(d)) return "Cortex screws";
    if (/CANNU|CANCELL?OU/.test(d)) return "Cancellous & cannulated screws";
    if (/SCREW|[\s,]SC[\s,]|BOLT/.test(d)) return "Other screws & bolts";
    if (/WASHER/.test(d)) return "Washers";
    if (/BI-?POLAR|STEM|SHELL|FEMORAL HEAD|\bCUP\b|LINER/.test(d)) return "Hip & joint";
    return "Other products";
  }
  // "3.5 Locking Screw,Self Tapping (TAN) L42" → family "3.5 Locking Screw,Self Tapping (TAN)", size "L42"
  function splitSize(desc) {
    const s = String(desc || "").trim(); const m = s.match(/^(.*?)[\s,]*\bL\s?(\d+(?:\.\d+)?)\s*(MM)?$/i);
    return m && m[1].length >= 6 ? { family: m[1].trim(), size: "L" + m[2] } : { family: s, size: "" };
  }

  const SH = { orders: {}, customers: {}, users: {}, logins: {}, advices: {}, dues: {}, docSig: {}, config: { gstPct: 5, lowAt: 3, types: {}, hidden: {} }, remoteCatSig: null,
    view: { orders: { st: "open", q: "", open: null }, cat: { q: "", type: "", page: 0, onlyHidden: false }, cust: { open: null }, pay: { st: "new" } }, subs: false, busy: "", note: "", lastTemp: null };
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + "." + s.length; };
  const nowIso = () => new Date().toISOString();
  const money = v => "₹" + inr(+v || 0);
  const canSeeShop = () => typeof canViewPanel === "function" && canViewPanel("shop");
  const canShop = () => typeof canEditPanel === "function" && canEditPanel("shop") && !!S.db;
  const shopMsg = (kind, t) => { const el = document.getElementById("shopMsg"); if (el) { msg(el, kind, t); el.scrollIntoView({ block: "nearest" }); } else msg($("globalmsg"), kind, t); };
  const custName = cid => (SH.customers[cid] || {}).name || "(removed customer)";

  /* ---------- panel ---------- */
  const P = { key: "shop", label: "D Shop", subs: [["shop-orders", "Orders in"], ["shop-cust", "Customers & logins"], ["shop-cat", "Catalog"], ["shop-pay", "Payment advices"]] };
  if (!PANELS.some(p => p.key === "shop")) { const ai = PANELS.findIndex(p => p.key === "admin"); PANELS.splice(ai < 0 ? PANELS.length : ai, 0, P); }
  if (typeof PERM_PANELS !== "undefined" && !PERM_PANELS.some(p => p.key === "shop")) PERM_PANELS.push(P);
  for (const [v] of P.subs) VIEW_SECTIONS[v] = ["tab-shop"];
  if (!ALL_SECTIONS.includes("tab-shop")) ALL_SECTIONS.push("tab-shop");
  const sec = document.createElement("section"); sec.id = "tab-shop"; sec.className = "hidden"; sec.style.cssText = "display:grid;gap:14px";
  (document.getElementById("tab-sales") || document.querySelector("main")).after(sec);
  const css = document.createElement("style");
  css.textContent = `#tab-shop td{vertical-align:top}#tab-shop .tmp{font-family:var(--font-mono);font-size:20px;font-weight:700;letter-spacing:.5px}#tab-shop .kvform input,#tab-shop .kvform select{padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}#tab-shop input.disc{width:80px;text-align:right}#tab-shop .lines td,#tab-shop .lines th{font-size:13px}#tab-shop .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}`;
  document.head.appendChild(css);
  const _renderOps = renderOps;
  renderOps = function () { if (S.tab && S.tab.startsWith("shop-")) { renderShop(); return true; } return _renderOps.apply(this, arguments); };

  /* ---------- subscriptions (start once the user may see the panel) ---------- */
  (function waitAccess() {
    if (!S.db || !S.me || !canSeeShop()) return setTimeout(waitAccess, 800);
    if (SH.subs) return; SH.subs = true;
    const db = S.db, rr = () => { if (S.tab && S.tab.startsWith("shop-")) renderShop(); };
    const col = (name, key) => db.collection(name).onSnapshot(s => { SH[key] = {}; s.docs.forEach(d => SH[key][d.id] = d.data()); rr(); scheduleSync(); }, e => { SH.err = e.message || e.code; rr(); });
    col("shopOrders", "orders"); col("shopCustomers", "customers"); col("shopUsers", "users"); col("shopLogins", "logins"); col("shopAdvices", "advices"); col("shopDues", "dues");
    db.doc("shopCatalog/config").onSnapshot(d => { const v = d.exists ? d.data() : {}; SH.config = { gstPct: v.gstPct != null ? +v.gstPct : 5, lowAt: v.lowAt != null ? +v.lowAt : 3, types: { ...(v.types || {}) }, hidden: { ...(v.hidden || {}) } }; rr(); scheduleSync(); }, () => {});
    db.doc("shopCatalog/main").onSnapshot(d => { SH.remoteCatSig = d.exists ? d.data().sig : null; SH.catCount = d.exists ? (d.data().list || []).length : 0; SH.catAt = d.exists ? d.data().updatedAt : ""; rr(); }, () => {});
  })();
  const _rebuild = rebuild; rebuild = function () { const r = _rebuild.apply(this, arguments); scheduleSync(); return r; };

  /* ---------- automatic sync: catalog, order status, documents, dues ---------- */
  let syncTimer = null, syncing = false;
  function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(syncAll, ms || 2500); }
  async function syncAll() {
    if (!canShop() || !S.loaded || syncing) return; syncing = true;
    try { await publishCatalog(false); await syncOrders(); await publishDues(); SH.syncErr = ""; }
    catch (e) { SH.syncErr = e.message || e.code || String(e); }
    finally { syncing = false; if (S.tab === "shop-cat") renderShop(); }
  }
  function catalogItems() {
    const C = SH.config, out = [];
    for (const m of S.master || []) {
      if (!m.mat || !m.desc || C.hidden[m.mat]) continue;
      const div = (m.divCodes || "").split(", ")[0] || ""; const rate = r2(+m.rate || 0);
      const price = typeof sellPrice === "function" ? sellPrice(m.mat, div, rate) : r2(rate * 2);
      if (!(price > 0)) continue;
      const av = +m.availQty || 0; const { family, size } = splitSize(m.desc);
      out.push({ mat: String(m.mat), desc: String(m.desc), family, size, type: C.types[m.mat] || guessType(m.desc), uom: String(m.uom || ""), hsn: String(m.hsn || ""), price: r2(price), avail: av > C.lowAt ? "ok" : av > 0 ? "low" : "req" });
    }
    return out.sort((a, b) => a.type.localeCompare(b.type) || a.family.localeCompare(b.family) || a.desc.localeCompare(b.desc, undefined, { numeric: true }));
  }
  async function publishCatalog(force) {
    const list = catalogItems(); const gstPct = +SH.config.gstPct || 0;
    const co = { name: S.company.name || "", address: S.company.address || "", phone: S.company.phone || "", email: S.company.email || "", gstin: S.company.gstin || "" };
    const sig = hash(JSON.stringify(list) + "|" + gstPct + "|" + JSON.stringify(co));
    if (!force && sig === SH.remoteCatSig) return;
    await S.db.doc("shopCatalog/main").set({ list, gstPct, company: co, sig, count: list.length, updatedAt: nowIso(), by: S.myEmail || "" });
    SH.remoteCatSig = sig;
  }
  // every sales document that came from this order: the ones linked to it, then any made from those (refId chain)
  function chainOf(order) {
    const ids = new Set((order.saleIds || []).filter(id => S.sales[id]));
    let grew = true; while (grew) { grew = false; for (const [id, d] of Object.entries(S.sales)) if (!ids.has(id) && d.refId && ids.has(d.refId)) { ids.add(id); grew = true; } }
    return [...ids].map(id => ({ id, ...S.sales[id] })).filter(d => d.status !== "cancelled").sort((a, b) => (a.createdAt || a.date || "").localeCompare(b.createdAt || b.date || ""));
  }
  function statusFromDocs(order, docs) {
    if (order.status === "rejected" || order.status === "cancelled") return order.status;
    if (docs.some(d => d.type === "INV")) return "billed";
    if (docs.some(d => d.type === "DC")) return "dispatched";
    if (docs.some(d => d.type === "SO" || d.type === "QTN")) return "confirmed";
    return order.status || "sent";
  }
  function docCopy(id, d, cid, orderId) {
    const drop = ["cost", "costValue", "profit", "sellPct", "purchaseInvoice", "purchaseSr", "key", "noStock"];
    const lines = (d.lines || []).map(l => { const o = {}; for (const [k, v] of Object.entries(l)) if (!drop.includes(k)) o[k] = v; return o; });
    const co = { ...(d.company || S.company) }; delete co.logo; delete co.bankAccount;
    const out = { id, cid, orderId, type: d.type, no: d.no, date: d.date, dueDate: d.dueDate || "", status: d.status || "", customer: d.customer || {}, intra: !!d.intra, opts: d.opts || {}, lines, totals: d.totals || {}, case: d.case || null, notes: d.notes || "", company: co };
    if (d.type === "INV" && typeof invoiceReceived === "function") { out.paid = invoiceReceived(id); out.balance = r2((d.totals?.grand || 0) - out.paid); }
    return out;
  }
  async function syncOrders() {
    for (const [oid, o] of Object.entries(SH.orders)) {
      const docs = chainOf(o); const st = statusFromDocs(o, docs);
      const dl = docs.map(d => ({ id: d.id, type: d.type, no: d.no, date: d.date }));
      if (st !== o.status || JSON.stringify(dl) !== JSON.stringify(o.docs || [])) {
        const hist = [...(o.history || [])]; if (st !== o.status) hist.push({ s: st, at: nowIso(), by: S.myEmail || "" });
        await S.db.doc("shopOrders/" + oid).update({ status: st, docs: dl, history: hist, updatedAt: nowIso() });
      }
      for (const d of docs) {
        const copy = docCopy(d.id, d, o.cid, oid); const sig = hash(JSON.stringify(copy));
        if (SH.docSig[d.id] === sig) continue;
        await S.db.doc("shopDocs/" + d.id).set({ ...copy, sig, updatedAt: nowIso() }); SH.docSig[d.id] = sig;
      }
    }
  }
  async function publishDues() {
    if (typeof invoiceBalance !== "function") return;
    for (const [cid, c] of Object.entries(SH.customers)) {
      if (!c.dcartId) continue;
      const list = Object.entries(S.sales).filter(([, d]) => d.type === "INV" && d.status !== "cancelled" && d.customerId === c.dcartId)
        .map(([id, d]) => ({ id, no: d.no, date: d.date, due: invDue(d), grand: r2(d.totals?.grand || 0), paid: invoiceReceived(id), balance: invoiceBalance(id) }))
        .filter(x => x.balance > 0.5).sort((a, b) => a.due.localeCompare(b.due));
      const sig = hash(JSON.stringify(list));
      if ((SH.dues[cid] || {}).sig === sig) continue;
      const today = todayIso();
      await S.db.doc("shopDues/" + cid).set({ cid, list, outstanding: r2(list.reduce((a, x) => a + x.balance, 0)), overdue: r2(list.filter(x => x.due < today).reduce((a, x) => a + x.balance, 0)), sig, updatedAt: nowIso() });
      for (const x of list) { const d = S.sales[x.id]; const copy = docCopy(x.id, d, cid, ""); const s2 = hash(JSON.stringify(copy)); if (SH.docSig[x.id] !== s2) { await S.db.doc("shopDocs/" + x.id).set({ ...copy, sig: s2, updatedAt: nowIso() }); SH.docSig[x.id] = s2; } }
    }
  }

  /* ---------- logins ---------- */
  function tempPassword() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; const r = crypto.getRandomValues(new Uint32Array(8)); let s = ""; for (let i = 0; i < 8; i++) s += a[r[i] % a.length]; return s.slice(0, 4) + "@" + s.slice(4) + (/\d/.test(s) ? "" : "7"); }
  let adminAuth = null;
  function secondAuth() {   // a separate sign-in, so creating a customer login doesn't sign you out of D Cart
    if (adminAuth) return adminAuth;
    const app = firebase.apps.find(a => a.name === "dshopAdmin") || firebase.initializeApp(window.FIREBASE_CONFIG, "dshopAdmin");
    adminAuth = app.auth(); try { adminAuth.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (e) {} return adminAuth;
  }
  async function createAuth(email, pw) {
    const a = secondAuth(); const cred = await a.createUserWithEmailAndPassword(email, pw); const uid = cred.user.uid; await a.signOut(); return uid;
  }
  const authErr = e => { const c = (e && e.code) || ""; if (/email-already-in-use/.test(c)) return "That login ID was used before. Choose another."; if (/operation-not-allowed/.test(c)) return "Email/password sign-in is switched off in Firebase. Turn it on: Firebase console → Authentication → Sign-in method → Email/Password → Enable."; if (/weak-password/.test(c)) return "Password too weak."; return (e && (e.message || e.code)) || String(e); };
  async function addLogin(cid, loginId, person) {
    loginId = String(loginId || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(loginId)) throw new Error("Login ID: 3–30 lowercase letters or numbers (dot, dash, underscore allowed).");
    const ex = await S.db.doc("shopLogins/" + loginId).get(); if (ex.exists) throw new Error("Login ID " + loginId + " is already used.");
    const pw = tempPassword(); const email = loginId + "@" + DOMAIN;
    const uid = await createAuth(email, pw).catch(e => { throw new Error(authErr(e)); });
    await S.db.doc("shopUsers/" + uid).set({ uid, loginId, email, name: person || "", cid, mustReset: true, active: true, createdAt: nowIso(), createdBy: S.myEmail || "" });
    await S.db.doc("shopLogins/" + loginId).set({ email, uid, cid, version: 1, updatedAt: nowIso() });
    return { loginId, pw };
  }
  // Firebase only lets a person change their own password, so a reset gives the login ID a fresh sign-in account
  async function resetLogin(loginId) {
    const L = SH.logins[loginId]; if (!L) throw new Error("Login not found.");
    const old = SH.users[L.uid] || {}; const v = (+L.version || 1) + 1; const pw = tempPassword(); const email = `${loginId}.r${v}@${DOMAIN}`;
    const uid = await createAuth(email, pw).catch(e => { throw new Error(authErr(e)); });
    await S.db.doc("shopUsers/" + uid).set({ uid, loginId, email, name: old.name || "", cid: L.cid, mustReset: true, active: true, createdAt: nowIso(), createdBy: S.myEmail || "", replaces: L.uid });
    if (SH.users[L.uid]) await S.db.doc("shopUsers/" + L.uid).update({ active: false, replacedAt: nowIso() });
    await S.db.doc("shopLogins/" + loginId).set({ email, uid, cid: L.cid, version: v, updatedAt: nowIso() });
    return { loginId, pw };
  }
  async function setLoginActive(loginId, on) {
    const L = SH.logins[loginId]; if (!L) return;
    await S.db.doc("shopUsers/" + L.uid).update({ active: !!on });
    if (on) await S.db.doc("shopLogins/" + loginId).set({ ...L, disabled: false, updatedAt: nowIso() }); else await S.db.doc("shopLogins/" + loginId).set({ ...L, disabled: true, updatedAt: nowIso() });
  }

  /* ---------- make a D Cart sales order from a D Shop order ---------- */
  function pickStock(mat, need) {
    const sold = soldMap(); const out = [];
    const rows = S.items.filter(r => r.mat === mat).map(r => ({ r, a: r2(r.qty - (sold[r.key] || 0)) })).filter(x => x.a > 0)
      .sort((x, y) => (toDate(x.r.exp) || 9e15) - (toDate(y.r.exp) || 9e15) || String(x.r.invoiceDate).localeCompare(String(y.r.invoiceDate)));
    for (const { r, a } of rows) { if (need <= 0) break; const q = Math.min(a, need); out.push({ key: r.key, qty: q }); need = r2(need - q); }
    return { out, short: need };
  }
  function makeSalesOrder(oid) {
    const o = SH.orders[oid]; if (!o) return;
    if (!canEditPanel("sellorder")) return shopMsg("bad", "You need edit rights on Sell Order to make the sales order.");
    const c = SH.customers[o.cid] || {}; const dc = c.dcartId ? S.customers[c.dcartId] : null;
    setView("sellorder", "sales-so"); newDoc("SO");
    const E = S.ed; E.shopOrder = oid;
    if (dc) { E.customerId = c.dcartId; E.cust = { name: dc.name || "", address: dc.address || "", gstin: dc.gstin || "", stateCode: dc.stateCode || "33", dl: dc.dl || "", phone: dc.phone || "" }; }
    else E.cust = { ...E.cust, name: c.name || o.custName || "" };
    E.opts = { ...E.opts, gstOn: +o.gstPct > 0, gstPct: +o.gstPct > 0 ? String(o.gstPct) : "", hospOn: +o.discount > 0, hospPct: +o.discount > 0 ? String(o.discount) : "" };
    E.case = { procedure: "", surgeon: (o.surgery || {}).surgeon || "", patient: (o.surgery || {}).patient || "" };
    E.yourRef = "D Shop " + (o.no || oid); E.notes = [o.deliverTo ? "Deliver to: " + o.deliverTo : "", (o.surgery || {}).date ? "Surgery date: " + dmy(o.surgery.date) : "", o.note || ""].filter(Boolean).join("\n");
    const short = [];
    for (const l of o.lines || []) {
      const { out, short: s } = pickStock(l.mat, +l.qty || 0);
      for (const p of out) { addLine(p.key); const L = E.lines.find(x => x.key === p.key); if (L) { L.qty = p.qty; L.rate = +l.price || L.rate; } }
      if (s > 0) short.push(`${s} × ${l.desc}`);
    }
    renderSales();
    if (short.length) edMsg("Not enough stock for: " + short.join("; ") + ". Add those later or tell the customer.", "warn");
    else edMsg(`Filled from D Shop order ${o.no || oid}: oldest-expiry stock first, prices and ${+o.discount || 0}% discount as ordered. Check and Save.`, "good");
  }
  const _saveDoc = saveDoc;
  saveDoc = async function (btn) {
    const oid = S.ed && S.ed.shopOrder;
    const r = await _saveDoc.apply(this, arguments);
    if (oid && !S.ed && S.salesView && SH.orders[oid]) {
      const o = SH.orders[oid]; const ids = [...new Set([...(o.saleIds || []), S.salesView])];
      try { await S.db.doc("shopOrders/" + oid).update({ saleIds: ids, updatedAt: nowIso() }); scheduleSync(500); } catch (e) { msg($("globalmsg"), "bad", "Saved, but couldn't link it to the D Shop order: " + (e.message || e.code)); }
    }
    return r;
  };

  /* ---------- views ---------- */
  function renderShop() {
    const el = document.getElementById("tab-shop"); if (!el) return;
    const head = `<div class="msg hidden" id="shopMsg"></div>${SH.err ? `<div class="msg bad">Can't read D Shop data: ${esc(SH.err)}. Publish the new Firestore rules (see README-DSHOP.md).</div>` : ""}`;
    const v = S.tab;
    el.innerHTML = head + (v === "shop-orders" ? ordersHtml() : v === "shop-cust" ? custHtml() : v === "shop-cat" ? catHtml() : payHtml());
    bind(el);
  }
  function ordTotals(o) { return o.totals || {}; }
  function ordersHtml() {
    const V = SH.view.orders; const all = Object.entries(SH.orders).map(([id, o]) => ({ id, ...o })).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const isOpen = o => ["sent", "confirmed", "dispatched"].includes(o.status);
    const q = V.q.toLowerCase();
    const list = all.filter(o => (V.st === "all" || (V.st === "open" ? isOpen(o) : o.status === V.st)) && (!q || [o.no, custName(o.cid), o.loginId, ...(o.lines || []).map(l => l.desc + " " + l.mat)].join(" ").toLowerCase().includes(q)));
    const open = V.open && SH.orders[V.open] ? orderDetail(V.open) : "";
    return `<div class="panel pad"><h2 style="margin:0 0 4px">Orders from D Shop</h2><p class="note" style="margin:0">Orders customers placed in the D Shop app. <b>Make sales order</b> opens a filled-in sales order here; when you save it (and later make the challan and invoice from it as usual), the customer sees each step and document in D Shop.</p></div>
      ${tiles([["New orders", inr(all.filter(o => o.status === "sent").length, 0)], ["Open orders", inr(all.filter(isOpen).length, 0)], ["Open value (₹)", inr(all.filter(isOpen).reduce((a, o) => a + (+ordTotals(o).grand || 0), 0))]])}
      ${open}
      <div class="panel"><div class="toolbar"><select data-sho="st">${[["open", "Open"], ["sent", "New"], ["billed", "Billed"], ["rejected", "Can't supply"], ["all", "All"]].map(([k, l]) => `<option value="${k}" ${V.st === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input type="search" data-sho="q" placeholder="Search order no., customer, product…" value="${esc(V.q)}"><span class="count">${list.length} order${list.length === 1 ? "" : "s"}</span></div>
      <div class="tablewrap"><table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Products</th><th class="num">Grand total (₹)</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.length ? list.map(o => `<tr><td class="code">${esc(o.no || o.id)}</td><td>${esc(dmy((o.createdAt || "").slice(0, 10)))}</td><td><b>${esc(custName(o.cid))}</b><br><span class="note">${esc(o.userName || o.loginId || "")}</span></td>
        <td style="max-width:340px;white-space:normal">${(o.lines || []).map(l => `${esc(l.qty)} × ${esc(l.desc)}`).join("<br>")}</td><td class="num">${inr(ordTotals(o).grand)}</td><td>${pill(...(ORDER_ST[o.status] || ["warn", o.status]))}</td>
        <td><button class="btn" data-shopen="${esc(o.id)}">Open</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty">${all.length ? "No orders match." : "No D Shop orders yet."}</td></tr>`}
      </tbody></table></div></div>`;
  }
  function orderDetail(oid) {
    const o = SH.orders[oid]; const c = SH.customers[o.cid] || {}; const t = ordTotals(o); const can = canShop();
    const docs = o.docs || []; const s = o.surgery || {};
    const stockOf = mat => { const m = (S.master || []).find(x => x.mat === mat); return m ? +m.availQty || 0 : 0; };
    const nowPrice = l => { const m = (S.master || []).find(x => x.mat === l.mat); if (!m) return null; const div = (m.divCodes || "").split(", ")[0] || ""; return typeof sellPrice === "function" ? sellPrice(m.mat, div, r2(+m.rate || 0)) : null; };
    const linkable = c.dcartId ? Object.entries(S.sales).filter(([id, d]) => d.customerId === c.dcartId && d.status !== "cancelled" && ["SO", "QTN", "DC", "INV"].includes(d.type) && !(o.saleIds || []).includes(id)).sort((a, b) => (b[1].date || "").localeCompare(a[1].date || "")).slice(0, 40) : [];
    return `<div class="panel pad" style="border-color:var(--accent)"><div class="row" style="justify-content:space-between"><h2 style="margin:0">D Shop order ${esc(o.no || oid)} · ${esc(custName(o.cid))}</h2><button class="btn" data-shclose>Close</button></div>
      <dl class="kv" style="margin-top:10px"><dt>Placed</dt><dd>${esc(new Date(o.createdAt).toLocaleString("en-IN"))} by ${esc(o.userName || "")} (${esc(o.loginId || "")})</dd>
        <dt>Customer</dt><dd>${esc(c.name || "")} · ${esc(TYPE_LABEL[c.type] || "")} · discount ${esc(o.discount || 0)}% ${c.dcartId ? "" : '<span class="pill warn">Not linked to a D Cart customer</span>'}</dd>
        ${o.deliverTo ? `<dt>Deliver to</dt><dd>${esc(o.deliverTo)}</dd>` : ""}${s.surgeon || s.patient || s.date ? `<dt>Surgery</dt><dd>${esc([s.surgeon, s.patient, s.date ? dmy(s.date) : ""].filter(Boolean).join(" · "))}</dd>` : ""}${o.note ? `<dt>Note</dt><dd>${esc(o.note)}</dd>` : ""}
        <dt>Status</dt><dd>${pill(...(ORDER_ST[o.status] || ["warn", o.status]))}${o.rejectReason ? " " + esc(o.rejectReason) : ""}</dd></dl>
      <div class="tablewrap" style="margin-top:10px"><table class="lines"><thead><tr><th>Code</th><th>Product</th><th class="num">Qty</th><th class="num">Price ordered</th><th class="num">Price now</th><th class="num">In stock</th><th class="num">Amount</th></tr></thead><tbody>
        ${(o.lines || []).map(l => { const np = nowPrice(l); const st = stockOf(l.mat); return `<tr><td class="code">${esc(l.mat)}</td><td>${esc(l.desc)}</td><td class="num">${esc(l.qty)}</td><td class="num">${inr(l.price)}</td><td class="num">${np == null ? "—" : Math.abs(np - l.price) > 0.5 ? `<b style="color:var(--warn)">${inr(np)}</b>` : inr(np)}</td><td class="num">${st < l.qty ? `<b style="color:var(--bad)">${inr(st, 0)}</b>` : inr(st, 0)}</td><td class="num">${inr(r2(l.qty * l.price))}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><td colspan="6" class="num">Item total</td><td class="num">${inr(t.gross)}</td></tr>${+t.disc ? `<tr><td colspan="6" class="num">Discount ${esc(o.discount)}%</td><td class="num">− ${inr(t.disc)}</td></tr>` : ""}<tr><td colspan="6" class="num">GST ${esc(o.gstPct)}%</td><td class="num">${inr(t.gst)}</td></tr>${+t.roundOff ? `<tr><td colspan="6" class="num">Round off</td><td class="num">${inr(t.roundOff)}</td></tr>` : ""}<tr><td colspan="6" class="num"><b>Grand total</b></td><td class="num"><b>${inr(t.grand)}</b></td></tr></tfoot></table></div>
      <div style="margin-top:10px"><b>Documents</b> ${docs.length ? docs.map(d => `<button class="btn" data-shdoc="${esc(d.id)}">${esc(d.no)}</button>`).join(" ") : '<span class="note">None yet.</span>'}</div>
      ${can && !["rejected", "cancelled"].includes(o.status) ? `<div class="row" style="margin-top:12px">
        ${!docs.length ? `<button class="btn primary" data-shmake="${esc(oid)}">Make sales order</button>` : ""}
        ${linkable.length ? `<select data-shlinksel="${esc(oid)}"><option value="">Link an existing D Cart document…</option>${linkable.map(([id, d]) => `<option value="${esc(id)}">${esc(d.no)} · ${esc(dmy(d.date))} · ₹${inr(d.totals?.grand)}</option>`).join("")}</select>` : ""}
        ${o.status === "sent" ? `<input data-shrej="${esc(oid)}" placeholder="Reason (optional)" style="min-width:200px"><button class="btn danger" data-shreject="${esc(oid)}">Can't supply</button>` : ""}</div>` : ""}
      ${!c.dcartId && can ? `<p class="note">Tip: link ${esc(c.name || "this customer")} to a D Cart customer under <b>Customers &amp; logins</b>, so their invoices and dues show in D Shop.</p>` : ""}</div>`;
  }
  function custHtml() {
    const can = canShop(); const custs = Object.entries(SH.customers).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const loginsOf = cid => Object.entries(SH.logins).filter(([, l]) => l.cid === cid).map(([id, l]) => ({ id, ...l, u: SH.users[l.uid] || {} }));
    const dcOpts = sel => `<option value="">— not linked —</option>` + Object.entries(S.customers).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || "")).map(([id, c]) => `<option value="${esc(id)}" ${sel === id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    const tmp = SH.lastTemp;
    return `<div class="panel pad"><h2 style="margin:0 0 4px">Customers, discounts and logins</h2><p class="note" style="margin:0">Each D Shop customer gets a discount % (taken off every product, before GST) and one or more logins. A new login gets a temporary password; the customer must set their own the first time they sign in. Link the customer to the same customer in D Cart so their invoices and dues show in D Shop.</p></div>
      ${tmp ? `<div class="panel pad" style="border-color:var(--good)"><h2 style="margin:0 0 6px">${tmp.isNew ? "Login created" : "New temporary password"}</h2>
        <div>Login ID: <b class="tmp">${esc(tmp.loginId)}</b> &nbsp; Temporary password: <b class="tmp">${esc(tmp.pw)}</b></div>
        <p class="note">Give these to the customer with the D Shop address <b>${esc(shopUrl())}</b>. The password is shown only now.</p><div class="row"><button class="btn" data-shcopy>Copy</button><button class="btn" data-shtmpclose>Done</button></div></div>` : ""}
      ${can ? `<div class="panel pad"><h2>New customer and login</h2><div class="kvform" style="max-width:560px">
        <label for="shN">Customer name</label><input id="shN" placeholder="e.g. City Care Hospital, Chennai">
        <label for="shT">Type</label><select id="shT">${TYPES.map(t => `<option value="${t}">${TYPE_LABEL[t]}</option>`).join("")}</select>
        <label for="shD">Discount %</label><input id="shD" type="number" min="0" max="90" step="0.5" value="0">
        <label for="shC">D Cart customer</label><select id="shC">${dcOpts("")}</select>
        <label for="shL">Login ID</label><input id="shL" placeholder="lowercase, e.g. citycare" autocapitalize="none">
        <label for="shP">Contact person</label><input id="shP" placeholder="Name of the person using this login"></div>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-shnew ${SH.busy ? "disabled" : ""}>${SH.busy === "new" ? "Creating…" : "Create customer and login"}</button></div></div>` : ""}
      <div class="panel"><div class="tablewrap"><table><thead><tr><th>Customer</th><th>Type</th><th>Discount %</th><th>D Cart customer</th><th>Logins</th><th></th></tr></thead><tbody>
      ${custs.length ? custs.map(c => { const ls = loginsOf(c.id); return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(TYPE_LABEL[c.type] || c.type)}</td>
        <td>${can ? `<input class="disc" type="number" min="0" max="90" step="0.5" value="${esc(c.discount || 0)}" data-shdisc="${esc(c.id)}" aria-label="Discount for ${esc(c.name)}">` : esc(c.discount || 0)}</td>
        <td>${can ? `<select data-shdc="${esc(c.id)}">${dcOpts(c.dcartId || "")}</select>` : esc((S.customers[c.dcartId] || {}).name || "—")}</td>
        <td>${ls.map(l => `<div style="margin-bottom:6px"><span class="code">${esc(l.id)}</span> ${esc(l.u.name || "")} ${l.disabled || l.u.active === false ? pill("bad", "Off") : l.u.mustReset ? pill("warn", "Temporary password") : pill("good", "Password set")}
          ${can ? `<button class="btn" data-shreset="${esc(l.id)}">New temp password</button> <button class="btn" data-shoff="${esc(l.id)}" data-on="${l.disabled ? 1 : 0}">${l.disabled ? "Switch on" : "Switch off"}</button>` : ""}</div>`).join("") || '<span class="note">No login</span>'}</td>
        <td>${can ? `<div class="row"><input placeholder="new login ID" data-shaddid="${esc(c.id)}" style="width:130px" autocapitalize="none"><input placeholder="person" data-shaddp="${esc(c.id)}" style="width:110px"><button class="btn" data-shadd="${esc(c.id)}">Add login</button></div>` : ""}</td></tr>`; }).join("") : `<tr><td colspan="6" class="empty">No D Shop customers yet.</td></tr>`}
      </tbody></table></div></div>`;
  }
  function catHtml() {
    const can = canShop(), C = SH.config, V = SH.view.cat;
    const rows = (S.master || []).filter(m => m.mat && m.desc).map(m => { const div = (m.divCodes || "").split(", ")[0] || ""; const rate = r2(+m.rate || 0); return { m, type: C.types[m.mat] || guessType(m.desc), price: typeof sellPrice === "function" ? sellPrice(m.mat, div, rate) : r2(rate * 2), hidden: !!C.hidden[m.mat], av: +m.availQty || 0 }; });
    const q = V.q.toLowerCase(); const f = rows.filter(r => (!V.type || r.type === V.type) && (!V.onlyHidden || r.hidden) && (!q || (r.m.mat + " " + r.m.desc).toLowerCase().includes(q)));
    const per = 50, pages = Math.max(1, Math.ceil(f.length / per)); if (V.page >= pages) V.page = pages - 1; const pg = f.slice(V.page * per, V.page * per + per);
    const types = [...new Set([...PRODUCT_TYPES, ...Object.values(C.types)])];
    const synced = SH.remoteCatSig ? `${inr(SH.catCount || 0, 0)} products published${SH.catAt ? " · " + new Date(SH.catAt).toLocaleString("en-IN") : ""}` : "Not published yet";
    return `<div class="panel pad"><h2 style="margin:0 0 4px">Catalog for D Shop</h2><p class="note" style="margin:0">Customers see products by type, with availability (In stock / Low / On request) and, in their cart, the selling price from your Pricing settings (Rate × sell %, default 200%) less their discount. Purchase rates, divisions and suppliers are never sent. The catalog updates automatically when stock or prices change while D Cart is open.</p>
      <div class="row" style="margin-top:10px"><span class="note">${esc(synced)}${SH.syncErr ? ` · <b style="color:var(--bad)">${esc(SH.syncErr)}</b>` : ""}</span>${can ? `<button class="btn" data-shpub>Publish now</button>` : ""}</div>
      ${can ? `<div class="kvform" style="max-width:420px;margin-top:10px"><label for="shGst">GST % added at checkout</label><input id="shGst" type="number" min="0" max="28" step="0.5" value="${esc(C.gstPct)}">
        <label for="shLow">"Low" when stock is at or below</label><input id="shLow" type="number" min="0" step="1" value="${esc(C.lowAt)}"></div><div class="row" style="margin-top:8px"><button class="btn" data-shcfg>Save settings</button></div>` : ""}</div>
      <div class="panel"><div class="toolbar"><input type="search" data-shc="q" placeholder="Search code or description…" value="${esc(V.q)}">
        <select data-shc="type"><option value="">All product types</option>${types.map(t => `<option ${V.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <label class="note"><input type="checkbox" data-shc="hid" ${V.onlyHidden ? "checked" : ""}> Hidden only</label><span class="count">${f.length} product${f.length === 1 ? "" : "s"}</span>
        ${pages > 1 ? `<button class="btn" data-shpg="-1" ${V.page ? "" : "disabled"}>‹</button><span class="note">${V.page + 1}/${pages}</span><button class="btn" data-shpg="1" ${V.page < pages - 1 ? "" : "disabled"}>›</button>` : ""}</div>
      <div class="tablewrap"><table><thead><tr><th>Show</th><th>Code</th><th>Description</th><th>Product type</th><th class="num">In stock</th><th class="num">Selling price (₹)</th></tr></thead><tbody>
      ${pg.map(r => `<tr><td><input type="checkbox" data-shshow="${esc(r.m.mat)}" ${r.hidden ? "" : "checked"} ${can ? "" : "disabled"} aria-label="Show ${esc(r.m.desc)} in D Shop"></td><td class="code">${esc(r.m.mat)}</td><td>${esc(r.m.desc)}</td>
        <td>${can ? `<select data-shtype="${esc(r.m.mat)}">${types.map(t => `<option ${r.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : esc(r.type)}</td><td class="num">${inr(r.av, 0)}</td><td class="num">${r.price > 0 ? inr(r.price) : '<span class="note">no price</span>'}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">No products.</td></tr>`}
      </tbody></table></div></div>`;
  }
  function payHtml() {
    const V = SH.view.pay; const all = Object.entries(SH.advices).map(([id, a]) => ({ id, ...a })).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    const list = all.filter(a => V.st === "all" || (a.status || "new") === V.st); const can = canEditPanel("payrecv") || canShop();
    return `<div class="panel pad"><h2 style="margin:0 0 4px">Payment advices from D Shop</h2><p class="note" style="margin:0">Customers tell you here that they have paid an invoice (UPI, NEFT or cheque, with the reference). Check your bank, record the money in <b>Payment Received</b> as usual, then mark the advice as checked.</p></div>
      <div class="panel"><div class="toolbar"><select data-shpay="st">${[["new", "New"], ["done", "Checked"], ["wrong", "Not received"], ["all", "All"]].map(([k, l]) => `<option value="${k}" ${V.st === k ? "selected" : ""}>${l}</option>`).join("")}</select><span class="count">${list.length}</span></div>
      <div class="tablewrap"><table><thead><tr><th>Sent</th><th>Customer</th><th>Invoice</th><th class="num">Amount (₹)</th><th>Mode / reference</th><th>Status</th></tr></thead><tbody>
      ${list.map(a => `<tr><td>${esc(new Date(a.at).toLocaleString("en-IN"))}</td><td>${esc(custName(a.cid))}<br><span class="note">${esc(a.userName || "")}</span></td><td class="code">${esc(a.invNo || "")}</td><td class="num">${inr(a.amount)}</td><td>${esc(a.mode || "")} ${esc(a.ref || "")}${a.date ? "<br><span class=note>paid " + esc(dmy(a.date)) + "</span>" : ""}</td>
        <td>${can ? `<select data-shadv="${esc(a.id)}">${[["new", "New"], ["done", "Checked"], ["wrong", "Not received"]].map(([k, l]) => `<option value="${k}" ${(a.status || "new") === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : esc(a.status || "new")}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nothing here.</td></tr>`}
      </tbody></table></div></div>`;
  }
  function shopUrl() { const p = location.pathname.replace(/[^/]*$/, ""); return location.origin + p + "dshop/"; }

  /* ---------- events ---------- */
  function bind(el) {
    if (el.dataset.shb) return; el.dataset.shb = "1";
    el.addEventListener("click", onClick); el.addEventListener("change", onChange); el.addEventListener("input", onInput);
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.sho === "q") { SH.view.orders.q = t.value; refocus(() => renderShop(), "[data-sho=q]"); }
    if (t.dataset.shc === "q") { SH.view.cat.q = t.value; SH.view.cat.page = 0; refocus(() => renderShop(), "[data-shc=q]"); }
  }
  function refocus(fn, sel) { clearTimeout(refocus.t); refocus.t = setTimeout(() => { fn(); const x = document.querySelector("#tab-shop " + sel); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250); }
  async function onChange(e) {
    const t = e.target, d = t.dataset;
    try {
      if (d.sho === "st") { SH.view.orders.st = t.value; renderShop(); }
      else if (d.shc === "type") { SH.view.cat.type = t.value; SH.view.cat.page = 0; renderShop(); }
      else if (d.shc === "hid") { SH.view.cat.onlyHidden = t.checked; SH.view.cat.page = 0; renderShop(); }
      else if (d.shpay === "st") { SH.view.pay.st = t.value; renderShop(); }
      else if (!canShop() && !d.shadv) return;
      else if (d.shdisc) { const v = Math.min(90, Math.max(0, +t.value || 0)); await S.db.doc("shopCustomers/" + d.shdisc).update({ discount: v, updatedAt: nowIso() }); shopMsg("good", `Discount for ${custName(d.shdisc)} set to ${v}%. It applies to their new orders.`); }
      else if (d.shdc !== undefined && d.shdc) { await S.db.doc("shopCustomers/" + d.shdc).update({ dcartId: t.value, updatedAt: nowIso() }); scheduleSync(500); }
      else if (d.shtype) { const types = { ...SH.config.types }; if (t.value === guessType((S.master.find(m => m.mat === d.shtype) || {}).desc)) delete types[d.shtype]; else types[d.shtype] = t.value; await saveConfig({ types }); }
      else if (d.shshow) { const hidden = { ...SH.config.hidden }; if (t.checked) delete hidden[d.shshow]; else hidden[d.shshow] = true; await saveConfig({ hidden }); }
      else if (d.shlinksel) { if (!t.value) return; const o = SH.orders[d.shlinksel]; await S.db.doc("shopOrders/" + d.shlinksel).update({ saleIds: [...new Set([...(o.saleIds || []), t.value])], updatedAt: nowIso() }); scheduleSync(300); shopMsg("good", "Linked. The customer will see it in D Shop shortly."); }
      else if (d.shadv) { await S.db.doc("shopAdvices/" + d.shadv).update({ status: t.value, checkedBy: S.myEmail || "", checkedAt: nowIso() }); }
    } catch (err) { shopMsg("bad", "Couldn't save: " + (err.message || err.code)); }
  }
  async function saveConfig(patch) {
    const C = { ...SH.config, ...patch };
    await S.db.doc("shopCatalog/config").set({ gstPct: +C.gstPct || 0, lowAt: +C.lowAt || 0, types: C.types, hidden: C.hidden, updatedAt: nowIso(), by: S.myEmail || "" });
    SH.config = C; scheduleSync(800);
  }
  async function onClick(e) {
    const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
    try {
      if (d.shopen) { SH.view.orders.open = d.shopen; renderShop(); document.getElementById("tab-shop").scrollIntoView({ block: "start" }); return; }
      if (d.shclose !== undefined) { SH.view.orders.open = null; renderShop(); return; }
      if (d.shpg) { SH.view.cat.page += +d.shpg; renderShop(); return; }
      if (d.shdoc) { setView(S.sales[d.shdoc]?.type === "INV" ? "invoice" : S.sales[d.shdoc]?.type === "DC" ? "dispatch" : "sellorder", S.sales[d.shdoc]?.type === "INV" ? "sales-inv" : S.sales[d.shdoc]?.type === "DC" ? "sales-dc" : "sales-so"); S.salesView = d.shdoc; renderSales(); return; }
      if (d.shtmpclose !== undefined) { SH.lastTemp = null; renderShop(); return; }
      if (d.shcopy !== undefined) { const t = SH.lastTemp; try { await navigator.clipboard.writeText(`D Shop: ${shopUrl()}\nLogin ID: ${t.loginId}\nTemporary password: ${t.pw}`); b.textContent = "Copied"; } catch (x) { b.textContent = "Copy blocked: note it down"; } return; }
      if (!canShop()) return shopMsg("bad", "You can view, but not change, D Shop. Ask an admin for edit rights on the D Shop panel.");
      if (d.shmake) { makeSalesOrder(d.shmake); return; }
      if (d.shreject) { const r = (document.querySelector(`[data-shrej="${CSS.escape(d.shreject)}"]`) || {}).value || ""; const o = SH.orders[d.shreject]; await S.db.doc("shopOrders/" + d.shreject).update({ status: "rejected", rejectReason: r, history: [...(o.history || []), { s: "rejected", at: nowIso(), by: S.myEmail || "" }], updatedAt: nowIso() }); shopMsg("good", "Marked as can't supply. The customer sees this in D Shop."); return; }
      if (d.shpub !== undefined) { b.disabled = true; b.textContent = "Publishing…"; await publishCatalog(true); await syncOrders(); await publishDues(); shopMsg("good", "D Shop catalog, orders and dues are up to date."); renderShop(); return; }
      if (d.shcfg !== undefined) { await saveConfig({ gstPct: Math.max(0, +$("shGst").value || 0), lowAt: Math.max(0, Math.floor(+$("shLow").value || 0)) }); shopMsg("good", "Saved. New orders use this GST %."); return; }
      if (d.shnew !== undefined) {
        const name = $("shN").value.trim(), type = $("shT").value, disc = Math.min(90, Math.max(0, +$("shD").value || 0)), dc = $("shC").value, login = $("shL").value, person = $("shP").value.trim();
        if (!name) return shopMsg("bad", "Enter the customer's name."); if (!login.trim()) return shopMsg("bad", "Enter a login ID.");
        SH.busy = "new"; renderShop();
        const cid = "sc" + Date.now().toString(36);
        await S.db.doc("shopCustomers/" + cid).set({ name, type, discount: disc, dcartId: dc, active: true, createdAt: nowIso(), createdBy: S.myEmail || "" });
        try { const r = await addLogin(cid, login, person); SH.lastTemp = { ...r, isNew: true }; }
        catch (err) { SH.busy = ""; renderShop(); return shopMsg("bad", `Customer saved, but the login wasn't created: ${err.message}. Add a login on the customer's row.`); }
        SH.busy = ""; renderShop(); scheduleSync(500); return;
      }
      if (d.shadd) { const id = document.querySelector(`[data-shaddid="${CSS.escape(d.shadd)}"]`).value, p = document.querySelector(`[data-shaddp="${CSS.escape(d.shadd)}"]`).value.trim(); b.disabled = true; const r = await addLogin(d.shadd, id, p); SH.lastTemp = { ...r, isNew: true }; renderShop(); return; }
      if (d.shreset) { if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again to confirm"; return; } b.disabled = true; const r = await resetLogin(d.shreset); SH.lastTemp = { ...r, isNew: false }; renderShop(); return; }
      if (d.shoff) { await setLoginActive(d.shoff, d.on === "1"); return; }
    } catch (err) { SH.busy = ""; shopMsg("bad", err.message || err.code || String(err)); renderShop(); }
  }
  window.DShopLink = { syncAll, publishCatalog, catalogItems, guessType, splitSize };
})();
