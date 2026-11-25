/* =====================================================================
   D Cart → D Shop (customer ordering app, its own Firebase: dhh-dshop)
   Sends product names, sizes and purchase RATE (code, description, HSN,
   unit, rate) to D Shop's admin-only area, automatically whenever D Cart's
   products change. D Shop shows customers only the selling price
   (rate + sell %), never the rate. No stock, suppliers, divisions, PIDs or
   customers are sent.
   Connect once per computer with the D Shop admin password:
   Admin panel → D Shop link.
   ===================================================================== */
(function () {
  "use strict";
  if (!window.firebase) return;                        // claude.ai copy: nothing to link
  const DSHOP_CONFIG = {                                 // public values (security is in D Shop's firestore.rules)
    apiKey: "AIzaSyBi393G4NnSyM500s6gpukI5gLTKOgCLLw",
    authDomain: "dhh-dshop.firebaseapp.com",
    projectId: "dhh-dshop",
    storageBucket: "dhh-dshop.firebasestorage.app",
    messagingSenderId: "748855531653",
    appId: "1:748855531653:web:6d05f58040a22cd82a31ec"
  };
  const ADMIN_EMAIL = "admin@" + DSHOP_CONFIG.authDomain;

  let dapp, dfs, dauth, duser = null;
  try { dapp = firebase.initializeApp(DSHOP_CONFIG, "dshoplink"); dfs = dapp.firestore(); dauth = dapp.auth(); }
  catch (e) { console.error("D Shop link:", e); return; }

  let state = "Not connected to D Shop yet.", lastSig = null, remoteSig = null, timer = null, feedUnsub = null, connErr = "", remoteInfo = null;
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + "." + s.length; };
  const nice = e => { const c = (e && e.code) || "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return "Wrong password. Use the password you chose for login ID \"admin\" in D Shop.";
    if (/too-many/.test(c)) return "Too many attempts. Wait a few minutes.";
    if (/network/.test(c)) return "No internet connection.";
    return (e && (e.message || e.code)) || "Couldn't connect."; };

  dauth.onAuthStateChanged(u => {
    duser = u || null; lastSig = null;
    if (feedUnsub) { feedUnsub(); feedUnsub = null; }
    if (duser) {
      feedUnsub = dfs.doc("private/dcartFeed").onSnapshot(s => { remoteSig = s.exists ? s.data().sig : null; remoteInfo = s.exists ? { count: s.data().count, at: s.data().updatedAt } : null; }, e => setState(`<b style="color:var(--bad)">D Shop refused access (${esc(e.code || e.message)}). This login isn't the D Shop admin.</b>`));
      setState("Connected. Sending products…"); schedule(1500);
    } else setState("Not connected to D Shop yet.");
    if (typeof S !== "undefined" && S.tab === "dshop") render();
  });

  /* ---------- product names, sizes and rates ----------
     Rate = the purchase cost D Cart itself uses for selling (the invoice line's
     rate, or taxable ÷ qty when the invoice has no rate column), from the latest
     purchase of that product. */
  function costOf(r) { if (!r) return 0; if (typeof costOfItem === "function") return +costOfItem(r) || 0; return +r.rate || (r.qty ? (+r.taxable || 0) / r.qty : 0); }
  function rateMap() {
    const best = {};
    for (const r of S.items || []) {
      if (!r.mat) continue; const c = costOf(r); if (!(c > 0)) continue;
      const d = (typeof toDate === "function" && toDate(r.invoiceDate)) || new Date(0);
      const b = best[r.mat]; if (!b || d >= b.d) best[r.mat] = { d, c };
    }
    return best;
  }
  function feedList() {
    const rm = rateMap();
    return (S.master || []).filter(m => m.mat && m.desc).map(m => {
      const own = +m.rate > 0 ? +m.rate : (rm[m.mat] ? rm[m.mat].c : 0);
      return { code: String(m.mat), desc: String(m.desc).trim(), hsn: String(m.hsn || ""), uom: String(m.uom || ""), rate: Math.round((own || 0) * 100) / 100 };
    }).sort((a, b) => a.desc.localeCompare(b.desc, undefined, { numeric: true }));
  }
  const withRate = list => list.filter(x => x.rate > 0).length;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => send(false), ms || 4000); }
  function setState(t) { state = t; const el = document.getElementById("dsState"); if (el) el.innerHTML = t; }
  async function send(force) {
    if (!duser) return setState("Not connected to D Shop yet.");
    if (!S.me || !S.db) { setState("Waiting for sign-in to D Cart…"); return schedule(); }
    if (!S.loaded) { setState("Waiting for the product data to load…"); return schedule(); }
    const list = feedList();
    if (!list.length) return setState(`<b style="color:var(--bad)">No products to send yet.</b> Add supplier invoices first.`);
    const sig = hash(JSON.stringify(list));
    if (!force && (sig === lastSig || sig === remoteSig)) { lastSig = sig; return setState(`✅ D Shop has D Cart's products: <b>${list.length}</b> names, sizes and rates (<b>${withRate(list)}</b> with a rate).`); }
    try {
      await dfs.doc("private/dcartFeed").set({ list, count: list.length, sig, source: "D Cart", updatedAt: new Date().toISOString(), by: S.myEmail || "" });
      lastSig = sig; remoteSig = sig;
      setState(`✅ Sent to D Shop: <b>${list.length}</b> products with names, sizes and rates (<b>${withRate(list)}</b> with a rate, just now). D Shop prices them automatically (rate + sell %).`);
    } catch (e) {
      setState(`<b style="color:var(--bad)">Couldn't send to D Shop: ${esc(e.code || e.message || String(e))}.</b> ${/permission/i.test(e.code || e.message || "") ? "Connect with the D Shop admin password, and check D Shop's Firestore rules are published." : ""}`);
    }
  }
  const _rebuild = rebuild;
  rebuild = function () { const r = _rebuild.apply(this, arguments); if (duser) schedule(); return r; };

  /* ---------- Admin panel → D Shop link ---------- */
  const adm = PANELS.find(p => p.key === "admin"); if (adm && !adm.subs.some(s => s[0] === "dshop")) adm.subs.push(["dshop", "D Shop link"]);
  VIEW_SECTIONS.dshop = ["tab-dshop"]; if (!ALL_SECTIONS.includes("tab-dshop")) ALL_SECTIONS.push("tab-dshop");
  const sec = document.createElement("section"); sec.id = "tab-dshop"; sec.className = "hidden"; sec.style.cssText = "display:grid;gap:14px";
  (document.getElementById("tab-sales") || document.querySelector("main")).after(sec);
  const _renderOps = renderOps;
  renderOps = function () { if (S.tab === "dshop") { render(); return true; } return _renderOps.apply(this, arguments); };

  function render() {
    const el = document.getElementById("tab-dshop"); if (!el) return;
    const n = feedList().length;
    el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 4px">D Shop link</h2>
      <p class="note" style="margin:0">Sends your products' <b>names, sizes and rates</b> (code, description, HSN, unit, rate) to D Shop, the customer ordering app, automatically whenever products change here. D Shop keeps the rate in its admin-only area and shows customers only the <b>selling price</b> (rate + sell %, set in D Shop → Settings). <b>Not sent:</b> stock, suppliers, divisions, PIDs, customers.</p>
      ${duser ? `<div class="row" style="gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap"><span class="pill good">Connected</span><span class="note">D Shop database <span class="code">dhh-dshop</span>${remoteInfo ? ` · last received ${esc(new Date(remoteInfo.at).toLocaleString("en-IN"))}` : ""}</span>
        <button class="btn" id="dsSend">Send now</button><button class="btn" id="dsOut">Disconnect</button></div>
        <div class="note" id="dsState" style="margin-top:8px">${state}</div>`
      : `<div style="margin-top:10px;display:grid;gap:8px;max-width:440px"><div class="note">Enter the D Shop <b>admin</b> password once on this computer. It stays connected after that.</div>
        <div class="row" style="gap:8px"><input value="admin" disabled style="width:90px" aria-label="D Shop login ID"><input id="dsPw" type="password" placeholder="D Shop admin password" style="flex:1" aria-label="D Shop admin password"></div>
        <div class="row"><button class="btn primary" id="dsGo">Connect D Shop</button></div>
        <div class="msg bad ${connErr ? "" : "hidden"}">${esc(connErr)}</div></div>`}
      <p class="note" style="margin-top:10px">${n} products in D Cart right now.</p></div>`;
    const go = document.getElementById("dsGo");
    if (go) go.onclick = async () => { const pw = document.getElementById("dsPw").value; if (!pw) return; go.disabled = true; go.textContent = "Connecting…"; connErr = "";
      try { await dauth.signInWithEmailAndPassword(ADMIN_EMAIL, pw); } catch (e) { connErr = nice(e); render(); } };
    const pwI = document.getElementById("dsPw"); if (pwI) pwI.onkeydown = e => { if (e.key === "Enter") go.click(); };
    const sn = document.getElementById("dsSend"); if (sn) sn.onclick = () => { setState("Sending…"); send(true); };
    const out = document.getElementById("dsOut"); if (out) out.onclick = async () => { await dauth.signOut(); };
  }
  window.DShopLink = { send, feedList };
})();
