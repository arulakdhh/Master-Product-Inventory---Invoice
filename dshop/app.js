/* D Shop — customer app for Dr Han Health Care.
   Uses the same Firebase project as D Cart (settings in ../firebase-config.js).
   Customers sign in with the login ID + password DHH gives them. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const inr = n => "₹" + (+n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = iso => iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  const fmtDT = iso => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const AV = { ok: ["In stock", "av-ok"], low: ["Low", "av-low"], req: ["On request", "av-req"] };
  const avPill = a => `<span class="pill ${(AV[a] || AV.req)[1]}">${(AV[a] || AV.req)[0]}</span>`;
  const ST = { sent: ["Sent to DHH", "st-sent"], confirmed: ["Order confirmed", "st-confirmed"], dispatched: ["Dispatched", "st-dispatched"], billed: ["Billed", "st-billed"], rejected: ["Can't supply", "st-callback"], cancelled: ["Cancelled", "st-callback"] };
  const stPill = s => `<span class="pill ${(ST[s] || ST.sent)[1]}">${(ST[s] || [s])[0]}</span>`;
  const FLOW = ["sent", "confirmed", "dispatched", "billed"];
  const TYPES = { hospital: { label: "Hospital", dues: true, goods: true }, surgeon: { label: "Surgeon / doctor", dues: false, goods: true }, clinic: { label: "Clinic / dealer", dues: true, goods: false }, patient: { label: "Patient / public", dues: false, goods: false } };
  const KIND = { SO: "Sales order", QTN: "Quotation", DC: "Delivery challan", INV: "Tax invoice" };
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cart: '<path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    back: '<path d="m15 18-6-6 6-6"/>', doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>'
  };
  const ico = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICON[n]}</svg>`;
  const SHORT = t => (t || "?").split(/[\s&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  /* ---------- Firebase ---------- */
  const cfg = window.FIREBASE_CONFIG;
  if (!window.firebase || !cfg || !cfg.apiKey || /PASTE/.test(cfg.apiKey)) { document.getElementById("app").innerHTML = '<div class="card pad empty">D Shop isn\'t set up yet: the Firebase settings are missing.</div>'; return; }
  firebase.initializeApp(cfg);
  const auth = firebase.auth(), fs = firebase.firestore();
  try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}

  const D = { user: null, me: null, cust: null, catalog: null, orders: {}, docs: {}, dues: null, advices: {}, state: "loading", err: "", unsubs: [] };
  function stopSubs() { D.unsubs.forEach(u => { try { u(); } catch (e) {} }); D.unsubs = []; }
  const loadErr = e => { D.err = (e && (e.message || e.code)) || String(e); route(); };

  auth.onAuthStateChanged(async u => {
    stopSubs(); Object.assign(D, { user: u, me: null, cust: null, catalog: null, orders: {}, docs: {}, dues: null, advices: {}, err: "" });
    if (!u) { D.state = "login"; return route(); }
    D.state = "loading"; route();
    try {
      const snap = await fs.doc("shopUsers/" + u.uid).get();
      if (!snap.exists || snap.data().active === false) { D.state = "login"; D.loginErr = "This login has been switched off. Please call DHH."; await auth.signOut(); return; }
      D.me = { uid: u.uid, ...snap.data() };
      if (D.me.mustReset) { D.state = "reset"; return route(); }
      startApp();
    } catch (e) { D.state = "login"; D.loginErr = niceErr(e); route(); try { await auth.signOut(); } catch (x) {} }
  });
  function startApp() {
    D.state = "app"; const cid = D.me.cid; const rr = () => { if (!document.querySelector("#app input:focus, #app textarea:focus")) route(); else renderNav(currentRoute()); };
    D.unsubs.push(fs.doc("shopCustomers/" + cid).onSnapshot(s => { D.cust = s.exists ? { id: cid, ...s.data() } : { id: cid, name: "", type: "patient", discount: 0 }; rr(); }, loadErr));
    D.unsubs.push(fs.doc("shopCatalog/main").onSnapshot(s => { D.catalog = s.exists ? s.data() : { list: [], gstPct: 5 }; D.fam = null; rr(); }, loadErr));
    D.unsubs.push(fs.collection("shopOrders").where("cid", "==", cid).onSnapshot(s => { D.orders = {}; s.docs.forEach(d => D.orders[d.id] = d.data()); rr(); }, loadErr));
    D.unsubs.push(fs.collection("shopDocs").where("cid", "==", cid).onSnapshot(s => { D.docs = {}; s.docs.forEach(d => D.docs[d.id] = d.data()); rr(); }, loadErr));
    D.unsubs.push(fs.doc("shopDues/" + cid).onSnapshot(s => { D.dues = s.exists ? s.data() : { list: [] }; rr(); }, () => { D.dues = { list: [] }; }));
    D.unsubs.push(fs.collection("shopAdvices").where("cid", "==", cid).onSnapshot(s => { D.advices = {}; s.docs.forEach(d => D.advices[d.id] = d.data()); rr(); }, () => {}));
    route();
  }
  function niceErr(e) {
    const c = (e && e.code) || "";
    if (/wrong-password|invalid-credential|user-not-found|invalid-login|invalid-email/.test(c)) return "Login ID or password is not right.";
    if (/too-many-requests/.test(c)) return "Too many tries. Wait a few minutes and try again.";
    if (/network/.test(c)) return "No internet connection. Check it and try again.";
    if (/permission/.test(c)) return "This login isn't allowed. Please call DHH.";
    if (/requires-recent-login/.test(c)) return "Please sign out and sign in again, then change the password.";
    return (e && e.message) || "Something went wrong. Try again.";
  }

  /* ---------- data helpers ---------- */
  const caps = () => TYPES[(D.cust || {}).type] || TYPES.patient;
  const items = () => (D.catalog && D.catalog.list) || [];
  const item = mat => items().find(i => i.mat === mat);
  function families() {
    if (D.fam) return D.fam; const m = new Map();
    for (const it of items()) { const k = it.type + "|" + it.family; if (!m.has(k)) m.set(k, { key: k, type: it.type, name: it.family, items: [] }); m.get(k).items.push(it); }
    for (const f of m.values()) { f.items.sort((a, b) => a.desc.localeCompare(b.desc, undefined, { numeric: true })); f.avail = f.items.some(i => i.avail === "ok") ? "ok" : f.items.some(i => i.avail === "low") ? "low" : "req"; f.id = encodeURIComponent(f.key); }
    D.fam = [...m.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return D.fam;
  }
  const typesList = () => [...new Set(families().map(f => f.type))];
  const cartKey = () => "dshop-cart-" + (D.me ? D.me.uid : "");
  function cart() { if (!D._cart || D._cartFor !== cartKey()) { let c = null; try { c = JSON.parse(localStorage.getItem(cartKey()) || "null"); } catch (e) {} D._cart = c || { items: [], patient: "", surgeon: "", date: "", deliverTo: "", note: "" }; D._cartFor = cartKey(); } return D._cart; }
  function saveCart() { try { localStorage.setItem(cartKey(), JSON.stringify(cart())); } catch (e) {} }
  const cartCount = () => D.state === "app" ? cart().items.reduce((n, i) => n + i.qty, 0) : 0;
  function cartLines() { return cart().items.map(i => ({ ...i, it: item(i.mat) })).filter(l => l.it).map(l => ({ mat: l.mat, qty: l.qty, desc: l.it.desc, uom: l.it.uom || "", hsn: l.it.hsn || "", price: +l.it.price || 0, avail: l.it.avail })); }
  function totals(lines, discPct, gstPct) {   // same steps as a D Cart sales order: discount, then GST, rounded to the rupee
    const gross = r2(lines.reduce((n, l) => n + r2(l.price * l.qty), 0));
    const disc = r2(gross * (+discPct || 0) / 100); const taxable = r2(gross - disc); const gst = r2(taxable * (+gstPct || 0) / 100);
    const exact = r2(taxable + gst); const grand = Math.round(exact);
    return { gross, disc, taxable, gst, exact, roundOff: r2(grand - exact), grand };
  }
  const myOrders = () => Object.entries(D.orders).map(([id, o]) => ({ id, ...o })).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  /* ---------- toast / modal ---------- */
  function toast(m) { const r = $("#toast-root"); r.innerHTML = `<div class="toast">${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => (r.innerHTML = ""), 2800); }
  function modal(html) { $("#modal-root").innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`; const f = $("#modal-root input, #modal-root button"); if (f) f.focus(); }
  function closeModal() { $("#modal-root").innerHTML = ""; }

  /* ---------- nav ---------- */
  function navItems() { const c = caps(); return [["home", "Home", "home"], ["catalog", "Catalog", "grid"], ["cart", "Cart", "cart"], ["orders", "Orders", "box"], c.dues ? ["dues", "Dues", "card"] : ["account", "Account", "user"]]; }
  function renderNav(r) {
    const on = D.state === "app"; const bottom = $("#bottomnav");
    $(".search").style.display = on ? "" : "none"; bottom.style.display = on ? "" : "none";
    if (!on) { $("#topnav").innerHTML = ""; bottom.innerHTML = ""; return; }
    const its = navItems(), n = cartCount();
    bottom.innerHTML = its.map(([k, l, i]) => `<a href="#${k}" class="${r === k ? "on" : ""}" ${r === k ? 'aria-current="page"' : ""}>${ico(i)}${l}${k === "cart" && n ? `<span class="badge-dot">${n}</span>` : ""}</a>`).join("");
    const t = its.filter(([k]) => k !== "cart" && k !== "home"); if (!t.some(([k]) => k === "account")) t.push(["account", "Account", "user"]);
    $("#topnav").innerHTML = t.map(([k, l]) => `<a href="#${k}" class="${r === k ? "on" : ""}">${l}</a>`).join("") + `<a href="#cart" class="reqbtn">Cart${n ? ` (${n})` : ""}</a>`;
  }

  /* ---------- views ---------- */
  function vLogin() {
    return `<div class="card pad stack" style="max-width:420px;margin:24px auto;gap:14px">
      <h1 class="display" style="font-size:26px">Sign in to D Shop</h1>
      <div class="small muted">Use the login ID and password Dr Han Health Care gave you. The first time, you'll be asked to set your own password.</div>
      <form id="loginform" class="stack" novalidate>
        <label class="field">Login ID<input name="loginid" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label class="field">Password<input name="pw" type="password" autocomplete="current-password" required></label>
        <div id="loginerr" class="small err" role="alert">${esc(D.loginErr || "")}</div>
        <button class="btn primary block" type="submit">Sign in</button>
      </form>
      <div class="small muted">Forgot your password? Call DHH and ask for a new temporary password.</div></div>`;
  }
  function vReset() {
    return `<div class="card pad stack" style="max-width:420px;margin:24px auto;gap:14px">
      <h1 class="display" style="font-size:24px">Set your own password</h1>
      <div class="small muted">Hello ${esc(D.me.name || D.me.loginId)}. You signed in with a temporary password. Choose a new one to continue.</div>
      <form id="resetform" class="stack" novalidate>
        <label class="field">New password<input name="p1" type="password" autocomplete="new-password" required></label>
        <label class="field">Type it again<input name="p2" type="password" autocomplete="new-password" required></label>
        <div class="tiny muted">At least 8 characters, with a letter and a number.</div>
        <div id="reseterr" class="small err" role="alert"></div>
        <button class="btn primary block" type="submit">Save password and continue</button>
      </form><button class="btn ghost" data-logout>Sign out</button></div>`;
  }
  function vLoading() { return `<div class="empty">${D.err ? `<b>Couldn't load your data.</b><br>${esc(D.err)}` : "Loading…"}</div>`; }
  function vHome() {
    const c = caps(), cu = D.cust || {}, o = myOrders();
    const open = o.filter(x => ["sent", "confirmed", "dispatched"].includes(x.status)).length;
    const goods = goodsRows().reduce((n, r) => n + r.pending, 0);
    const due = ((D.dues || {}).list || []).length;
    const k = [`<a href="#orders" class="card pad kpi"><b>${open}</b><span class="tiny muted">Open orders</span></a>`];
    if (c.goods) k.push(`<a href="#orders-goods" class="card pad kpi"><b>${goods}</b><span class="tiny muted">Items at hospital, not billed</span></a>`);
    if (c.dues) k.push(`<a href="#dues" class="card pad kpi warn"><b>${due}</b><span class="tiny">Invoices to pay</span></a>`);
    const recent = []; o.forEach(x => (x.lines || []).forEach(l => { if (!recent.includes(l.mat) && item(l.mat)) recent.push(l.mat); }));
    return `<div class="stack" style="gap:22px">
      <div><h1 class="display" style="font-size:26px">Hello, ${esc(D.me.name || D.me.loginId)}</h1><div class="muted small">${esc(cu.name || "")}${cu.type ? " · " + esc(TYPES[cu.type].label) : ""}</div></div>
      <div class="grid kpis">${k.join("")}</div>
      <section class="stack"><div class="row between"><h2>Products</h2><a href="#catalog" class="small strong">Full catalog</a></div>
        ${items().length ? `<div class="grid types">${typesList().map(t => { const n = families().filter(f => f.type === t).length; return `<a href="#catalog-${encodeURIComponent(t)}" class="card pad row"><span class="thumb" style="width:42px;height:42px;font-size:13px;flex-shrink:0">${SHORT(t)}</span><span><b class="tname">${esc(t)}</b><span class="tiny muted">${n} product${n > 1 ? "s" : ""}</span></span></a>`; }).join("")}</div>` : `<div class="card empty">The catalog is being prepared. Please check again soon.</div>`}</section>
      ${recent.length ? `<section class="stack"><h2>Order again</h2><div class="card list">${recent.slice(0, 5).map(m => { const it = item(m); return `<div class="row" style="padding:10px 14px"><div style="flex:1;min-width:0"><b class="small">${esc(it.desc)}</b><div class="tiny muted">${esc(it.mat)}</div></div>${avPill(it.avail)}<button class="btn sm" data-add="${esc(m)}" aria-label="Add ${esc(it.desc)} to cart">+ Add</button></div>`; }).join("")}</div></section>` : ""}
    </div>`;
  }
  let catState = { type: "ALL", avail: { ok: true, low: true, req: true } };
  function vCatalog(arg) {
    if (arg !== undefined) catState.type = decodeURIComponent(arg) || "ALL";
    const q = ($("#q").value || "").trim().toLowerCase();
    const list = families().filter(f => (q || catState.type === "ALL" || f.type === catState.type) && (!q || (f.name + " " + f.type + " " + f.items.map(i => i.mat + " " + i.desc).join(" ")).toLowerCase().includes(q)) && f.items.some(i => catState.avail[i.avail]));
    const title = q ? `Results for “${esc(q)}”` : catState.type === "ALL" ? "All products" : esc(catState.type);
    return `<div class="layout">
      <aside class="side card pad stack" style="gap:16px">
        <div class="stack" style="gap:8px"><div class="label">Product type</div>
          <select id="typesel" aria-label="Product type"><option value="ALL">All products</option>${typesList().map(t => `<option ${catState.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="stack" style="gap:8px"><div class="label">Availability</div>
          ${Object.keys(AV).map(a => `<label class="row small" style="gap:10px"><input type="checkbox" data-av="${a}" ${catState.avail[a] ? "checked" : ""}>${AV[a][0]}</label>`).join("")}</div>
      </aside>
      <section class="content stack">
        <div class="row between wrap"><h1 class="display" style="font-size:24px">${title}</h1><span class="small muted">${list.length} product${list.length === 1 ? "" : "s"}</span></div>
        ${list.length ? `<div class="grid cards">${list.slice(0, 240).map(f => `<div class="card pad stack" style="gap:8px">
          <a href="#product-${f.id}" class="thumb" style="height:90px;font-size:22px" aria-hidden="true" tabindex="-1">${SHORT(f.type)}</a>
          <a href="#product-${f.id}" class="pname">${esc(f.name)}</a>
          <div class="tiny muted">${esc(f.type)}${f.items.length > 1 ? ` · ${f.items.length} sizes` : ""}</div>
          <div>${avPill(f.avail)}</div>
          ${f.items.length > 1 ? `<a href="#product-${f.id}" class="btn sm">Choose size</a>` : `<button class="btn sm" data-add="${esc(f.items[0].mat)}">Add to cart</button>`}</div>`).join("")}</div>${list.length > 240 ? '<div class="small muted">Showing the first 240. Search to narrow down.</div>' : ""}` : `<div class="card empty">No products match. Try another word or product type.</div>`}
      </section></div>`;
  }
  let pState = { fid: null, mat: null, qty: 1 };
  function vProduct(fid) {
    const f = families().find(x => x.id === fid || x.key === decodeURIComponent(fid || "")); if (!f) return `<div class="card empty">Product not found. <a href="#catalog">Back to catalog</a></div>`;
    if (pState.fid !== f.id || !f.items.some(i => i.mat === pState.mat)) pState = { fid: f.id, mat: f.items[0].mat, qty: 1 };
    const v = item(pState.mat);
    return `<div class="stack" style="gap:18px;max-width:900px">
      <a href="#catalog-${encodeURIComponent(f.type)}" class="row small strong" style="gap:4px">${ico("back", 18)}${esc(f.type)}</a>
      <div class="layout">
        <div class="thumb" style="flex:1 1 260px;height:220px;font-size:34px" aria-hidden="true">${SHORT(f.type)}</div>
        <div class="stack" style="flex:1 1 320px;gap:14px">
          <h1 class="display" style="font-size:24px;line-height:1.2">${esc(f.name)}</h1>
          <div class="small muted">Code ${esc(v.mat)}${v.hsn ? " · HSN " + esc(v.hsn) : ""}${v.uom ? " · per " + esc(v.uom) : ""}</div>
          ${f.items.length > 1 ? `<div class="stack" style="gap:8px"><div class="small strong">Size</div><div class="row wrap" style="gap:8px">${f.items.map(x => `<button class="chip ${x.mat === v.mat ? "on" : ""} av-${x.avail}" data-variant="${esc(x.mat)}" aria-pressed="${x.mat === v.mat}" title="${esc(x.desc)} · ${AV[x.avail][0]}">${esc(x.size || x.desc)}</button>`).join("")}</div></div>` : ""}
          <div class="small">${esc(v.desc)}</div>
          <div class="row small">Availability: ${avPill(v.avail)}${v.avail === "req" ? '<span class="tiny muted">DHH will confirm supply time</span>' : ""}</div>
          <div class="small muted">Your price is shown in the cart.</div>
          <div class="row wrap"><div class="qty"><button data-pq="-1" aria-label="Less">−</button><span aria-live="polite">${pState.qty}</span><button data-pq="1" aria-label="More">+</button></div>
            <button class="btn primary" style="flex:1;min-width:180px" data-add="${esc(v.mat)}" data-q="${pState.qty}">Add to cart</button></div>
        </div></div></div>`;
  }
  function vCart() {
    const c = cart(), cu = D.cust || {}, lines = cartLines(); const gp = +(D.catalog || {}).gstPct || 0;
    const gone = c.items.filter(i => !item(i.mat));
    if (!lines.length) return `<div class="card empty stack" style="align-items:center"><h1 class="display" style="font-size:22px;color:var(--ink)">Your cart is empty</h1><div>Add products from the catalog to see your price.</div><a class="btn primary" href="#catalog">Browse catalog</a></div>`;
    const t = totals(lines, cu.discount, gp);
    return `<div class="layout">
      <section class="content stack">
        <h1 class="display" style="font-size:24px">Cart <span class="muted" style="font-weight:400;font-size:18px">(${cartCount()} items)</span></h1>
        ${gone.length ? `<div class="demo">${gone.length} item${gone.length > 1 ? "s are" : " is"} no longer in the catalog and won't be ordered.</div>` : ""}
        <div class="card list">${lines.map(l => `<div class="stack" style="padding:12px 14px;gap:8px">
          <div class="row between" style="align-items:flex-start"><div style="min-width:0"><b style="font-size:14.5px">${esc(l.desc)}</b><div class="tiny muted">${esc(l.mat)}</div><div style="margin-top:4px">${avPill(l.avail)}</div></div>
            <div style="text-align:right;white-space:nowrap"><b>${inr(l.price * l.qty)}</b><div class="tiny muted">${inr(l.price)} each</div></div></div>
          <div class="row between"><div class="qty"><button data-iq="${esc(l.mat)}|-1" aria-label="Less">−</button><span>${l.qty}</span><button data-iq="${esc(l.mat)}|1" aria-label="More">+</button></div>
            <button class="btn sm ghost" data-rm="${esc(l.mat)}">Remove</button></div></div>`).join("")}</div>
        <div class="card pad stack" style="gap:6px">
          <div class="row between small"><span>Item total</span><span>${inr(t.gross)}</span></div>
          ${+cu.discount ? `<div class="row between small good"><span>Your discount (${esc(cu.discount)}%)</span><span>− ${inr(t.disc)}</span></div>` : ""}
          <div class="row between small"><span>Amount before GST</span><b>${inr(t.taxable)}</b></div>
          <div class="tiny muted">Prices exclude GST. ${gp}% GST is added when you confirm.</div></div>
      </section>
      <aside class="side card pad stack" style="max-width:420px;flex-basis:320px">
        <h2 style="font-size:16px">Surgery and delivery details</h2>
        <label class="field">Patient name / IP no.<input data-f="patient" value="${esc(c.patient)}" placeholder="Optional"></label>
        <div class="grid two"><label class="field">Surgeon<input data-f="surgeon" value="${esc(c.surgeon || (cu.type === "surgeon" ? cu.name : ""))}"></label>
          <label class="field">Surgery date<input type="date" data-f="date" value="${esc(c.date)}"></label></div>
        <label class="field">Deliver to<input data-f="deliverTo" value="${esc(c.deliverTo)}" placeholder="e.g. Ortho OT, Cath lab"></label>
        <label class="field">Note for DHH<textarea data-f="note" placeholder="Optional">${esc(c.note)}</textarea></label>
        <button class="btn primary block" id="review">Review and confirm</button>
      </aside></div>`;
  }
  function confirmModal() {
    const c = cart(), cu = D.cust || {}, lines = cartLines(), gp = +(D.catalog || {}).gstPct || 0, t = totals(lines, cu.discount, gp);
    modal(`<div class="stack" style="gap:12px">
      <div class="row between"><h2 class="display" style="font-size:20px">Confirm your order</h2><button class="btn sm ghost" data-close>Back</button></div>
      <div class="small muted">${esc(cu.name || "")}${c.deliverTo ? " · " + esc(c.deliverTo) : ""}</div>
      <div class="card list small">${lines.map(l => `<div class="row between" style="padding:8px 12px"><span>${esc(l.desc)} × ${l.qty}</span><span style="white-space:nowrap">${inr(l.price * l.qty)}</span></div>`).join("")}</div>
      <div class="stack" style="gap:6px">
        <div class="row between small"><span>Item total</span><span>${inr(t.gross)}</span></div>
        ${+cu.discount ? `<div class="row between small good"><span>Discount (${esc(cu.discount)}%)</span><span>− ${inr(t.disc)}</span></div>` : ""}
        <div class="row between small"><span>Amount before GST</span><span>${inr(t.taxable)}</span></div>
        <div class="row between small"><span>GST ${gp}%</span><span>+ ${inr(t.gst)}</span></div>
        ${t.roundOff ? `<div class="row between small muted"><span>Round off</span><span>${t.roundOff > 0 ? "+" : "−"} ${inr(Math.abs(t.roundOff))}</span></div>` : ""}
        <div class="row between total"><b>Grand total</b><b class="display">${inr(t.grand)}</b></div></div>
      <div id="ordererr" class="small err" role="alert"></div>
      <button class="btn primary block" id="placeorder">Confirm order · ${inr(t.grand)}</button>
      <div class="tiny muted" style="text-align:center">DHH confirms stock and sends the sales order, challan and invoice.</div></div>`);
  }
  function goodsRows() {
    const out = [];
    for (const d of Object.values(D.docs)) if (d.type === "DC" && d.status !== "cancelled") for (const l of d.lines || []) { const p = r2((+l.qty || 0) - (+l.billedQty || 0) - (+l.returnedQty || 0)); if (p > 0) out.push({ d, l, pending: p }); }
    return out;
  }
  let ordTab = "open";
  function vOrders(tab) {
    const c = caps(); if (tab) ordTab = tab; if (ordTab === "goods" && !c.goods) ordTab = "open";
    const all = myOrders(); const isOpen = o => ["sent", "confirmed", "dispatched"].includes(o.status);
    let body;
    if (ordTab === "goods") {
      const rows = goodsRows();
      body = rows.length ? `<div class="card list">${rows.map(({ d, l, pending }) => { const out = daysBetween(d.date, today()); return `<a href="#doc-${encodeURIComponent(d.id)}" class="row" style="padding:12px 14px"><div style="flex:1"><b style="font-size:14.5px">${esc(l.desc)}</b><div class="tiny muted">${pending} not billed · ${esc(d.no)}${l.batch ? " · batch " + esc(l.batch) : ""}</div></div><span class="pill ${out > 14 ? "st-callback" : "st-sent"}">${out} day${out === 1 ? "" : "s"} out</span></a>`; }).join("")}</div>` : `<div class="card empty">No goods waiting at the hospital.</div>`;
    } else {
      const list = all.filter(o => ordTab === "open" ? isOpen(o) : !isOpen(o));
      body = list.length ? `<div class="stack" style="gap:10px">${list.map(o => `<a href="#order-${encodeURIComponent(o.id)}" class="card pad stack" style="gap:6px">
        <div class="row between"><b>Order ${esc(o.no || o.id)}</b>${stPill(o.status)}</div>
        <div class="small ink2">${(o.lines || []).map(l => `${esc(l.desc)} × ${l.qty}`).join(", ")}</div>
        <div class="row between tiny muted"><span>${fmtDT(o.createdAt)}</span><b class="ink">${inr((o.totals || {}).grand)}</b></div></a>`).join("")}</div>` : `<div class="card empty">${ordTab === "open" ? "No open orders." : "Nothing here yet."}</div>`;
    }
    return `<div class="stack"><h1 class="display" style="font-size:24px">Orders</h1>
      <div class="tabs" role="tablist"><button role="tab" data-otab="open" class="${ordTab === "open" ? "on" : ""}" aria-selected="${ordTab === "open"}">Open (${all.filter(isOpen).length})</button>
        <button role="tab" data-otab="done" class="${ordTab === "done" ? "on" : ""}" aria-selected="${ordTab === "done"}">Billed and closed</button>
        ${c.goods ? `<button role="tab" data-otab="goods" class="${ordTab === "goods" ? "on" : ""}" aria-selected="${ordTab === "goods"}">Goods at hospital</button>` : ""}</div>${body}</div>`;
  }
  function vOrder(id) {
    id = decodeURIComponent(id || ""); const o = D.orders[id]; if (!o) return `<div class="card empty">Order not found. <a href="#orders">Back to orders</a></div>`;
    const t = o.totals || {}; const idx = FLOW.indexOf(o.status); const s = o.surgery || {};
    const tl = o.status === "rejected" || o.status === "cancelled" ? `<div class="card pad small"><b>${ST[o.status][0]}.</b> ${esc(o.rejectReason || "Please call DHH for details.")}</div>` :
      `<section class="card pad"><div class="tl">${FLOW.map((st, i) => { const h = (o.history || []).filter(y => y.s === st).pop(); const done = i <= idx; return `<div class="st"><div class="dotcol"><span class="dot ${done ? "done" : ""} ${i === idx + 1 ? "now" : ""}"></span>${i < FLOW.length - 1 ? `<span class="ln ${i < idx ? "done" : ""}"></span>` : ""}</div><div style="padding-bottom:12px"><b style="font-size:14.5px;${done ? "" : "color:var(--muted)"}">${ST[st][0]}</b><div class="tiny muted">${h ? fmtDT(h.at) : "Waiting"}</div></div></div>`; }).join("")}</div></section>`;
    return `<div class="stack" style="max-width:760px;gap:16px">
      <a href="#orders" class="row small strong" style="gap:4px">${ico("back", 18)}Orders</a>
      <div class="banner"><div class="row between wrap"><h1 class="display" style="font-size:22px">${(ST[o.status] || [o.status])[0]}</h1><span class="sub">Order ${esc(o.no || id)}</span></div>
        <div class="sub">${esc([o.deliverTo, s.surgeon, s.patient, s.date ? fmtDate(s.date) : ""].filter(Boolean).join(" · ") || "Placed " + fmtDT(o.createdAt))}</div></div>
      ${tl}
      <section class="card"><div class="pad" style="padding-bottom:6px"><h2 style="font-size:16px">Items</h2></div><div class="list">${(o.lines || []).map(l => `<div class="row between" style="padding:10px 16px"><span>${esc(l.desc)} <span class="muted small">× ${l.qty}</span></span><span style="white-space:nowrap">${inr(l.price * l.qty)}</span></div>`).join("")}
        <div class="stack" style="padding:12px 16px;gap:4px">${+t.disc ? `<div class="row between small good"><span>Discount (${esc(o.discount)}%)</span><span>− ${inr(t.disc)}</span></div>` : ""}<div class="row between small"><span>GST ${esc(o.gstPct)}%</span><span>+ ${inr(t.gst)}</span></div><div class="row between"><b>Grand total</b><b>${inr(t.grand)}</b></div>
        <div class="tiny muted">As ordered. The sales order and invoice from DHH are final.</div></div></div></section>
      <section class="card"><div class="pad" style="padding-bottom:6px"><h2 style="font-size:16px">Documents</h2></div><div class="list">${(o.docs || []).length ? o.docs.map(d => `<a href="#doc-${encodeURIComponent(d.id)}" class="row" style="padding:10px 16px">${ico("doc", 20)}<span style="flex:1"><b style="font-size:14.5px">${KIND[d.type] || d.type}</b><span class="tiny muted" style="display:block">${esc(d.no)} · ${fmtDate(d.date)}</span></span><span class="small strong">View</span></a>`).join("") : `<div class="pad small muted">The sales order, challan and invoice from DHH appear here.</div>`}</div></section>
      ${o.note ? `<div class="card pad small"><b>Your note:</b> ${esc(o.note)}</div>` : ""}</div>`;
  }
  function vDoc(id) {
    id = decodeURIComponent(id || ""); const d = D.docs[id]; if (!d) return `<div class="card empty">Document not available yet. <a href="#orders">Back to orders</a></div>`;
    const co = d.company || {}, cu = d.customer || {}, t = d.totals || {};
    const showPrice = d.type !== "DC" || (d.lines || []).some(l => +l.rate > 0);
    return `<div class="stack" style="max-width:900px;gap:12px">
      <div class="row between noprint"><a href="javascript:history.back()" class="row small strong" style="gap:4px">${ico("back", 18)}Back</a><button class="btn sm" data-print>Print / save as PDF</button></div>
      <div class="card pad docpaper">
        <div class="row between wrap" style="align-items:flex-start"><div><b style="font-size:17px">${esc(co.name || "Dr. Han Health Care")}</b><div class="tiny muted" style="white-space:pre-line">${esc(co.address || "")}</div><div class="tiny muted">${co.gstin ? "GSTIN " + esc(co.gstin) : ""}${co.phone ? " · " + esc(co.phone) : ""}</div></div>
          <div style="text-align:right"><b style="font-size:16px">${esc((KIND[d.type] || d.type).toUpperCase())}</b><div class="small">${esc(d.no)}</div><div class="small">${fmtDate(d.date)}</div>${d.dueDate ? `<div class="small">Due ${fmtDate(d.dueDate)}</div>` : ""}</div></div>
        <div class="small" style="margin:10px 0"><b>To:</b> ${esc(cu.name || "")}<br><span class="muted" style="white-space:pre-line">${esc(cu.address || "")}</span>${cu.gstin ? `<br>GSTIN ${esc(cu.gstin)}` : ""}</div>
        ${d.case && (d.case.surgeon || d.case.patient) ? `<div class="small">${esc([d.case.surgeon ? "Surgeon: " + d.case.surgeon : "", d.case.patient ? "Patient: " + d.case.patient : ""].filter(Boolean).join(" · "))}</div>` : ""}
        <div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Product</th><th>Batch / serial</th><th>Expiry</th><th class="num">Qty</th>${showPrice ? '<th class="num">Rate</th><th class="num">Taxable</th><th class="num">GST</th><th class="num">Total</th>' : ""}</tr></thead><tbody>
          ${(d.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.desc)}<div class="tiny muted">${esc(l.mat || "")}${l.hsn ? " · HSN " + esc(l.hsn) : ""}</div></td><td>${esc([l.batch, l.serial].filter(Boolean).join(" / "))}</td><td>${esc(l.exp || "")}</td><td class="num">${esc(l.qty)}</td>${showPrice ? `<td class="num">${inr(l.rate)}</td><td class="num">${inr(l.taxable)}</td><td class="num">${esc(l.gstRate || 0)}%</td><td class="num">${inr(l.total)}</td>` : ""}</tr>`).join("")}
        </tbody>${showPrice ? `<tfoot>${+t.disc || +t.hospDisc || +t.surgDisc ? `<tr><td colspan="8" class="num">Discount</td><td class="num">− ${inr((+t.disc || 0) + (+t.hospDisc || 0) + (+t.surgDisc || 0))}</td></tr>` : ""}<tr><td colspan="8" class="num">Taxable</td><td class="num">${inr(t.taxable)}</td></tr><tr><td colspan="8" class="num">GST</td><td class="num">${inr((+t.cgst || 0) + (+t.sgst || 0) + (+t.igst || 0))}</td></tr>${t.roundOff ? `<tr><td colspan="8" class="num">Round off</td><td class="num">${inr(t.roundOff)}</td></tr>` : ""}<tr><td colspan="8" class="num"><b>Grand total</b></td><td class="num"><b>${inr(t.grand)}</b></td></tr>${d.type === "INV" && d.balance != null ? `<tr><td colspan="8" class="num">Balance due</td><td class="num"><b>${inr(d.balance)}</b></td></tr>` : ""}</tfoot>` : ""}</table></div>
        ${d.notes ? `<div class="tiny muted" style="margin-top:10px;white-space:pre-line">${esc(d.notes)}</div>` : ""}</div></div>`;
  }
  function vDues() {
    if (!caps().dues) return `<div class="card empty">Dues are shown to hospital, clinic and dealer accounts.</div>`;
    const du = D.dues || { list: [] }; const list = du.list || []; const adv = Object.values(D.advices);
    const out = list.reduce((n, v) => n + v.balance, 0), over = list.filter(v => v.due < today()).reduce((n, v) => n + v.balance, 0);
    return `<div class="stack" style="max-width:760px;gap:16px">
      <h1 class="display" style="font-size:24px">Dues and payments</h1>
      <div class="card pad grid two"><div class="kpi"><span class="tiny muted">Outstanding</span><b>${inr(out)}</b></div><div class="kpi"><span class="tiny warnc">Overdue</span><b class="warnc">${inr(over)}</b></div></div>
      ${du.updatedAt ? `<div class="tiny muted">Updated ${fmtDT(du.updatedAt)}</div>` : ""}
      <h2 style="font-size:17px">Unpaid invoices</h2>
      ${list.length ? list.map(v => { const late = daysBetween(v.due, today()); const a = adv.filter(x => x.invId === v.id && (x.status || "new") === "new"); return `<div class="card pad stack" style="gap:8px;${late > 0 ? "border-color:var(--warn-line)" : ""}">
        <div class="row between"><b>${esc(v.no)}</b><span class="pill ${late > 0 ? "st-callback" : "st-sent"}">${late > 0 ? `${late} days overdue` : late === 0 ? "Due today" : `Due in ${-late} days`}</span></div>
        <div class="row between small ink2"><span>Invoice ${fmtDate(v.date)} · Due ${fmtDate(v.due)}${v.paid ? ` · Paid ${inr(v.paid)}` : ""}</span><b class="ink">${inr(v.balance)}</b></div>
        ${a.map(x => `<div class="tiny bluec">Payment advice sent: ${inr(x.amount)} · ${esc(x.mode)} ${esc(x.ref)} · waiting for DHH to check</div>`).join("")}
        <div class="row">${D.docs[v.id] ? `<a class="btn sm ghost" style="flex:1" href="#doc-${encodeURIComponent(v.id)}">View invoice</a>` : ""}<button class="btn sm primary" style="flex:1" data-pay="${esc(v.id)}">I have paid</button></div></div>`; }).join("") : `<div class="card empty">No unpaid invoices.</div>`}
    </div>`;
  }
  function vAccount() {
    const cu = D.cust || {};
    return `<div class="stack" style="max-width:560px;gap:16px">
      <h1 class="display" style="font-size:24px">Account</h1>
      <div class="card pad stack" style="gap:4px"><b style="font-size:16px">${esc(D.me.name || D.me.loginId)}</b><div class="small muted">Login ID: ${esc(D.me.loginId)} · ${esc(cu.name || "")}${cu.type ? " · " + esc(TYPES[cu.type].label) : ""}</div></div>
      <form id="pwform" class="card pad stack" novalidate><b>Change password</b>
        <label class="field">Current password<input name="old" type="password" autocomplete="current-password"></label>
        <label class="field">New password<input name="p1" type="password" autocomplete="new-password"></label>
        <label class="field">Type it again<input name="p2" type="password" autocomplete="new-password"></label>
        <div id="pwerr" class="small err" role="alert"></div><button class="btn primary" type="submit">Save new password</button></form>
      <div class="card pad stack" style="gap:6px"><b>Install D Shop on your phone</b><div class="small muted">Android (Chrome): menu ⋮ → <b>Add to Home screen</b> or <b>Install app</b>. iPhone (Safari): Share → <b>Add to Home Screen</b>.</div>${D.installEvt ? '<button class="btn" id="install">Install D Shop</button>' : ""}</div>
      <button class="btn ghost" data-logout>Sign out</button></div>`;
  }

  /* ---------- router ---------- */
  function currentRoute() { const h = (location.hash || "#").slice(1); const k = h.indexOf("-"); return { name: (k < 0 ? h : h.slice(0, k)) || "home", arg: k < 0 ? undefined : h.slice(k + 1) }; }
  function route() {
    let { name, arg } = currentRoute(); let html;
    if (D.state === "login") { html = vLogin(); name = "login"; }
    else if (D.state === "reset") { html = vReset(); name = "reset"; }
    else if (D.state !== "app" || !D.cust || !D.catalog) { html = vLoading(); name = "loading"; }
    else { const v = { home: vHome, catalog: vCatalog, product: vProduct, cart: vCart, orders: vOrders, order: vOrder, doc: vDoc, dues: vDues, account: vAccount }[name]; if (!v) name = "home"; html = (v || vHome)(arg); }
    $("#app").innerHTML = html; renderNav(name === "product" ? "catalog" : name === "order" || name === "doc" ? "orders" : name);
    return name;
  }
  let last = "";
  function go() { const n = route(); if (n !== last) { window.scrollTo(0, 0); last = n; } }
  function nav(h) { if ((location.hash || "#") === h || (h === "#" && !location.hash)) route(); else location.hash = h; }

  /* ---------- actions ---------- */
  function addToCart(mat, q) { const c = cart(), ex = c.items.find(i => i.mat === mat); if (ex) ex.qty += q; else c.items.push({ mat, qty: q }); saveCart(); const it = item(mat); toast("Added to cart: " + (it ? it.desc : mat)); route(); }
  async function placeOrder(btn) {
    const c = cart(), cu = D.cust || {}, lines = cartLines().map(({ avail, ...l }) => l), gp = +(D.catalog || {}).gstPct || 0;
    if (!lines.length) return;
    const t = totals(lines, cu.discount, gp); const d = new Date();
    const no = "DS" + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const now = d.toISOString();
    const doc = { no, cid: D.me.cid, uid: D.me.uid, loginId: D.me.loginId, userName: D.me.name || "", custName: cu.name || "", custType: cu.type || "", lines, discount: +cu.discount || 0, gstPct: gp, totals: t,
      surgery: { patient: c.patient || "", surgeon: c.surgeon || (cu.type === "surgeon" ? cu.name || "" : ""), date: c.date || "" }, deliverTo: c.deliverTo || "", note: c.note || "", status: "sent", saleIds: [], docs: [], createdAt: now, history: [{ s: "sent", at: now }] };
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await fs.doc("shopOrders/" + no).set(doc);
      D._cart = { items: [], patient: "", surgeon: "", date: "", deliverTo: "", note: "" }; saveCart();
      modal(`<div class="stack" style="gap:12px;text-align:center;align-items:center"><div class="thumb" style="width:56px;height:56px;border-radius:28px;font-size:26px">✓</div>
        <h2 class="display" style="font-size:22px">Order ${esc(no)} placed</h2><div class="small muted">DHH has it now and will confirm it with a sales order. You can track it under Orders.</div>
        <div class="row" style="width:100%"><button class="btn ghost" style="flex:1" data-close>Keep browsing</button><a class="btn primary" style="flex:1" href="#order-${encodeURIComponent(no)}" data-close>Track order</a></div></div>`);
      route();
    } catch (e) { btn.disabled = false; btn.textContent = "Confirm order"; const el = $("#ordererr"); if (el) el.textContent = "Couldn't send the order: " + niceErr(e); }
  }
  function payModal(invId) {
    const v = ((D.dues || {}).list || []).find(x => x.id === invId); if (!v) return;
    const co = (D.catalog || {}).company || {};
    modal(`<form class="stack" id="payform" data-inv="${esc(invId)}" novalidate><div class="row between"><h2 style="font-size:18px">Paid ${esc(v.no)}?</h2><button type="button" class="btn sm ghost" data-close>Close</button></div>
      <div class="small muted">Pay ${esc(co.name || "Dr Han Health Care")} by UPI, NEFT or cheque as usual, then send the details here so DHH can match the payment to this invoice.</div>
      <label class="field">Amount paid (₹)<input name="amount" inputmode="decimal" value="${v.balance}"></label>
      <div class="grid two"><label class="field">Mode<select name="mode"><option>UPI</option><option>NEFT / RTGS</option><option>Cheque</option><option>Cash</option></select></label><label class="field">Date paid<input name="date" type="date" value="${today()}"></label></div>
      <label class="field">UTR / cheque no.<input name="ref"></label>
      <div id="payerr" class="small err" role="alert"></div>
      <button class="btn primary block" type="submit">Send payment advice</button></form>`);
  }
  const strong = p => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

  /* ---------- events ---------- */
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-add],[data-variant],[data-pq],[data-iq],[data-rm],[data-otab],[data-pay],[data-close],[data-logout],[data-print],#review,#placeorder,#install");
    if (!t) return; const d = t.dataset;
    if (d.close !== undefined) { closeModal(); return; }
    if (d.logout !== undefined) { closeModal(); await auth.signOut(); nav("#"); return; }
    if (d.print !== undefined) { window.print(); return; }
    if (d.add) { addToCart(d.add, +(d.q || 1)); pState.qty = 1; return; }
    if (d.variant) { pState.mat = d.variant; route(); return; }
    if (d.pq) { pState.qty = Math.max(1, pState.qty + +d.pq); route(); return; }
    if (d.iq) { const [m, q] = d.iq.split("|"); const it = cart().items.find(i => i.mat === m); if (it) { it.qty += +q; if (it.qty < 1) cart().items.splice(cart().items.indexOf(it), 1); } saveCart(); route(); return; }
    if (d.rm) { const c = cart(); c.items = c.items.filter(i => i.mat !== d.rm); saveCart(); route(); return; }
    if (d.otab) { nav("#orders-" + d.otab); return; }
    if (d.pay) { payModal(d.pay); return; }
    if (t.id === "review") { confirmModal(); return; }
    if (t.id === "placeorder") { placeOrder(t); return; }
    if (t.id === "install" && D.installEvt) { D.installEvt.prompt(); D.installEvt = null; }
  });
  document.addEventListener("input", e => { const f = e.target.dataset && e.target.dataset.f; if (f) { cart()[f] = e.target.value; saveCart(); } });
  document.addEventListener("change", e => {
    const d = e.target.dataset || {};
    if (e.target.id === "typesel") { catState.type = e.target.value; nav(e.target.value === "ALL" ? "#catalog" : "#catalog-" + encodeURIComponent(e.target.value)); }
    if (d.av) { catState.avail[d.av] = e.target.checked; route(); }
  });
  document.addEventListener("submit", async e => {
    const f = e.target; e.preventDefault(); const fd = new FormData(f); const btn = f.querySelector("button[type=submit]");
    const busy = on => { if (btn) { btn.disabled = on; } };
    if (f.id === "loginform") {
      const id = String(fd.get("loginid") || "").trim().toLowerCase(), pw = String(fd.get("pw") || ""); const err = $("#loginerr");
      if (!id || !pw) { err.textContent = "Enter your login ID and password."; return; }
      busy(true); err.textContent = ""; D.loginErr = "";
      try {
        const L = await fs.doc("shopLogins/" + id.replace(/\//g, "")).get();
        if (!L.exists || L.data().disabled) throw { code: L.exists ? "permission-denied" : "invalid-credential" };
        await auth.signInWithEmailAndPassword(L.data().email, pw);
        if (!location.hash || location.hash === "#") history.replaceState(null, "", "#home");
      } catch (x) { err.textContent = niceErr(x); busy(false); }
      return;
    }
    if (f.id === "resetform") {
      const p1 = String(fd.get("p1")), p2 = String(fd.get("p2")); const err = $("#reseterr");
      if (p1 !== p2) { err.textContent = "The two passwords do not match."; return; }
      if (!strong(p1)) { err.textContent = "Use at least 8 characters with a letter and a number."; return; }
      busy(true);
      try { await auth.currentUser.updatePassword(p1); await fs.doc("shopUsers/" + D.me.uid).update({ mustReset: false, pwChangedAt: new Date().toISOString() }); D.me.mustReset = false; toast("Password saved."); history.replaceState(null, "", "#home"); startApp(); }
      catch (x) { err.textContent = niceErr(x); busy(false); }
      return;
    }
    if (f.id === "pwform") {
      const old = String(fd.get("old")), p1 = String(fd.get("p1")), p2 = String(fd.get("p2")); const err = $("#pwerr");
      if (!old) { err.textContent = "Enter your current password."; return; }
      if (p1 !== p2) { err.textContent = "The two new passwords do not match."; return; }
      if (!strong(p1)) { err.textContent = "Use at least 8 characters with a letter and a number."; return; }
      busy(true);
      try { const u = auth.currentUser; await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, old)); await u.updatePassword(p1); f.reset(); err.textContent = ""; toast("Password changed."); }
      catch (x) { err.textContent = /wrong-password|invalid-credential/.test(x.code || "") ? "Current password is not right." : niceErr(x); }
      busy(false); return;
    }
    if (f.id === "payform") {
      const v = ((D.dues || {}).list || []).find(x => x.id === f.dataset.inv); const err = $("#payerr");
      const amt = Number(String(fd.get("amount")).replace(/[^\d.]/g, "")); const ref = String(fd.get("ref") || "").trim();
      if (!(amt > 0)) { err.textContent = "Enter the amount paid."; return; }
      if (!ref) { err.textContent = "Enter the UTR or cheque number."; return; }
      busy(true);
      try { await fs.collection("shopAdvices").add({ cid: D.me.cid, uid: D.me.uid, userName: D.me.name || D.me.loginId, invId: v.id, invNo: v.no, amount: amt, mode: String(fd.get("mode")), ref, date: String(fd.get("date") || ""), status: "new", at: new Date().toISOString() }); closeModal(); toast("Payment advice sent to DHH."); route(); }
      catch (x) { err.textContent = niceErr(x); busy(false); }
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal-root").innerHTML) closeModal(); });
  $("#modal-root").addEventListener("click", e => { if (e.target.classList.contains("scrim")) closeModal(); });
  let qt; $("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { if (!location.hash.startsWith("#catalog")) location.hash = "#catalog"; else route(); }, 250); });
  window.addEventListener("hashchange", go);
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); D.installEvt = e; });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  route();
})();
