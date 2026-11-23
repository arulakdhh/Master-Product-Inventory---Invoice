/* =====================================================================
   D Cart (GitHub version) ↔ Dr. Han Field Sales app
   The register keeps its own database (dhh-register). This file opens a
   second, separate connection to the Field app's database (han-field-tracker)
   and, once you connect with the Field app's ADMIN login:
   1. Publishes the product list (MRP, GST, HSN only) to catalog/products,
      the letterhead to catalog/company and purchase rates (admin-only
      General quotations) to rates/products — automatically whenever stock
      or company details change.
   2. Adds "Sell Order → Field quotations": every quotation the field
      executives make, with status and PDF.
   ===================================================================== */
(function () {
  "use strict";
  if (!window.firebase) return;                       // claude.ai copy: nothing to link
  const FIELD_CONFIG = {                               // public values (security is in the Field app's firestore.rules)
    apiKey: "AIzaSyAXgQwVusXVX4PdvBx1IuN1agQ4ONnst-g",
    authDomain: "han-field-tracker.firebaseapp.com",
    projectId: "han-field-tracker",
    storageBucket: "han-field-tracker.firebasestorage.app",
    messagingSenderId: "397269426722",
    appId: "1:397269426722:web:b5e1f30acb02aa0ba7e07b"
  };
  const ADMIN_EMAIL = "admin@hanfield.app";

  let fapp, ffs, fauth, fuser = null;
  try { fapp = firebase.initializeApp(FIELD_CONFIG, "fieldlink"); ffs = fapp.firestore(); fauth = fapp.auth(); }
  catch (e) { console.error("Field link:", e); return; }
  const fsx = () => (fuser ? ffs : null);

  let pubState = "Not connected to the Field app yet.", lastSig = null, remoteSig = null, pubTimer = null,
      fq = {}, fqUnsub = null, catUnsub = null, fqFilt = { exec: "", st: "", q: "" }, connErr = "";
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + "." + s.length; };
  const nice = e => { const c = (e && e.code) || "";
    if (/popup-closed|cancelled-popup/.test(c)) return "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return "Wrong User ID or password (use the Field app's ADMIN password).";
    if (/unauthorized-domain/.test(c)) return "Google sign-in isn't allowed from this website in the Field app's Firebase (han-field-tracker → Authentication → Settings → Authorized domains → add arulakdhh.github.io). Or use the ADMIN login.";
    if (/too-many/.test(c)) return "Too many attempts. Wait a few minutes.";
    if (/popup-blocked/.test(c)) return "The browser blocked the sign-in window. Allow pop-ups and try again.";
    return (e && e.message) || "Couldn't connect."; };

  fauth.onAuthStateChanged(u => {
    fuser = u || null; lastSig = null;
    if (fqUnsub) { fqUnsub(); fqUnsub = null; } if (catUnsub) { catUnsub(); catUnsub = null; }
    fq = {};
    if (fuser) { startFq(); setPub("Connected. Sending the product list…"); schedulePublish(1500); }
    else setPub("Not connected to the Field app yet.");
    if (typeof S !== "undefined" && S.tab === "fieldq") renderFieldQ();
  });

  /* ---------- 1. product list for the field app ---------- */
  function catalogList() {
    return (S.master || []).filter(m => m.mat && m.desc).map(m => ({
      mat: String(m.mat), desc: String(m.desc), hsn: String(m.hsn || ""), uom: String(m.uom || ""),
      mrp: Math.round((+m.mrp || 0) * 100) / 100, gst: +m.igstRate || 0,
      div: (m.divCodes || "").split(", ").filter(Boolean).map(c => divName(c)).join(", ")
    })).sort((a, b) => a.desc.localeCompare(b.desc));
  }
  function rateList() {
    return (S.master || []).filter(m => m.mat && (+m.rate || +m.netRate)).map(m => ({ mat: String(m.mat), rate: Math.round((+m.rate || 0) * 100) / 100, netRate: Math.round((+m.netRate || 0) * 100) / 100 }));
  }
  function companyCard() {
    const c = S.company || {}; const o = {};
    for (const k of ["name", "tagline", "address", "gstin", "cin", "stateCode", "phone", "email", "termsQuote", "closing", "signatory", "logo"]) if (c[k] != null && c[k] !== "") o[k] = c[k];
    return o;
  }
  function schedulePublish(ms) { clearTimeout(pubTimer); pubTimer = setTimeout(() => publish(false), ms || 4000); }
  function setPub(t) { pubState = t; const st = document.getElementById("fqPub"); if (st) st.innerHTML = t; }
  async function publish(force) {
    if (!fsx()) return setPub("Not connected to the Field app yet.");
    if (!S.me || !S.db) return setPub("Waiting for sign-in to the register…"), schedulePublish();
    if (!S.loaded) { setPub("Waiting for the stock data to load…"); return schedulePublish(); }
    const list = catalogList();
    if (!list.length) return setPub(`<b style="color:var(--bad)">No products to send yet.</b> Add supplier invoices first.`);
    const co = companyCard(), rates = rateList();
    const sig = hash(JSON.stringify(list) + "|" + JSON.stringify(co) + "|" + JSON.stringify(rates));
    if (!force && (sig === lastSig || sig === remoteSig)) { lastSig = sig; return setPub(`✅ Field app product list is up to date: <b>${list.length}</b> products (MRP, GST, HSN only — purchase rates are never shown to executives).`); }
    try {
      await fsx().doc("catalog/company").set({ ...co, updatedAt: new Date().toISOString() });
      await fsx().doc("catalog/products").set({ list, count: list.length, sig, source: "github-register", updatedAt: new Date().toISOString(), by: S.myEmail || "" });
      let rateNote = "";
      try { await fsx().doc("rates/products").set({ list: rates, count: rates.length, updatedAt: new Date().toISOString() }); }
      catch (e) { rateNote = ` <b style="color:var(--bad)">Purchase rates for General quotations weren't sent (${esc(e.code || e.message)}).</b>`; }
      lastSig = sig; remoteSig = sig;
      setPub(`✅ Product list sent to the Field app: <b>${list.length}</b> products (just now).` + rateNote);
    } catch (e) {
      setPub(`<b style="color:var(--bad)">Couldn't send the product list: ${esc(e.code || e.message || String(e))}.</b> ${/permission/i.test(e.code || e.message || "") ? "This login isn't allowed to write the Field app's product list. Connect with the ADMIN login." : ""}`);
    }
  }
  const _rebuild = rebuild;
  rebuild = function () { const r = _rebuild.apply(this, arguments); if (fuser) schedulePublish(); return r; };
  if (typeof saveCompany === "function") { const _sc = saveCompany; saveCompany = async function () { const r = await _sc.apply(this, arguments); if (fuser) schedulePublish(); return r; }; }

  /* ---------- 2. Field quotations view ---------- */
  const sell = PANELS.find(p => p.key === "sellorder"); if (sell && !sell.subs.some(s => s[0] === "fieldq")) sell.subs.push(["fieldq", "Field app & quotations"]);
  VIEW_SECTIONS.fieldq = ["tab-fieldq"]; if (!ALL_SECTIONS.includes("tab-fieldq")) ALL_SECTIONS.push("tab-fieldq");
  const stl = document.createElement("style"); stl.textContent = "#tab-fieldq td,#tab-fieldq th{white-space:normal;vertical-align:top}#tab-fieldq table{width:100%}#tab-fieldq td.code{white-space:nowrap}#tab-fieldq .fl input{padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--surface);color:inherit}";
  document.head.appendChild(stl);
  const sec = document.createElement("section"); sec.id = "tab-fieldq"; sec.className = "hidden"; sec.style.cssText = "display:grid;gap:14px";
  (document.getElementById("tab-sales") || document.querySelector("main")).after(sec);
  const _renderOps = renderOps;
  renderOps = function () { if (S.tab === "fieldq") { renderFieldQ(); return true; } return _renderOps.apply(this, arguments); };

  function startFq() {
    if (!fsx() || fqUnsub) return;
    fqUnsub = fsx().collection("fquotes").onSnapshot(s => { fq = {}; s.docs.forEach(d => fq[d.id] = d.data()); if (S.tab === "fieldq") renderFieldQ(); },
      e => { fqUnsub = null; const el = document.getElementById("fqList"); if (el) el.innerHTML = `<div class="msg bad">Can't read field quotations: ${esc(e.message || e.code)}.</div>`; });
    catUnsub = fsx().doc("catalog/products").onSnapshot(s => { remoteSig = s.exists ? s.data().sig : null; }, () => { });
  }

  function connectCard() {
    if (fuser) return `<div class="row" style="gap:10px;align-items:center;margin-top:8px"><span class="pill" style="background:#e7f6ee;color:#17663a;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600">● Connected</span>
      <span class="note">as ${esc(fuser.email || "")} · Field app database <span class="code">han-field-tracker</span></span>
      <button class="btn" id="fqSend">Send product list now</button><button class="btn" id="fqOut">Disconnect</button></div>
      <div class="note" id="fqPub" style="margin-top:6px">${pubState}</div>`;
    return `<div class="fl" style="margin-top:10px;display:grid;gap:8px;max-width:420px">
      <div class="note">Log in with the Field app's <b>ADMIN</b> password once on this computer. It stays connected after that.</div>
      <div class="row" style="gap:8px"><input id="flId" value="ADMIN" style="width:110px" aria-label="Field app User ID"><input id="flPw" type="password" placeholder="Field app ADMIN password" style="flex:1" aria-label="Field app password" autocomplete="off"></div>
      <div class="row" style="gap:8px"><button class="btn primary" id="flGo">Connect Field app</button><button class="btn" id="flG">Use Google instead</button></div>
      <div class="msg bad ${connErr ? "" : "hidden"}" id="flErr">${esc(connErr)}</div></div>`;
  }

  const ST = { open: "Open", accepted: "Accepted", lost: "Lost", cancelled: "Cancelled" };
  const n2 = v => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function renderFieldQ() {
    const el = document.getElementById("tab-fieldq"); if (!el) return;
    const all = Object.entries(fq).map(([id, d]) => ({ id, ...d })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const execs = [...new Map(all.map(q => [q.exec, q.execName || q.exec])).entries()];
    const q = fqFilt.q.toLowerCase();
    const rows = all.filter(d => (!fqFilt.exec || d.exec === fqFilt.exec) && (!fqFilt.st || d.status === fqFilt.st) &&
      (!q || [d.no, d.doctor, d.customer && d.customer.name, ...(d.lines || []).map(l => l.desc + " " + l.mat)].join(" ").toLowerCase().includes(q)));
    const sum = a => a.reduce((x, d) => x + (+(d.totals && d.totals.grand) || 0), 0);
    el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 4px">Field Sales app link</h2>
      <p class="note" style="margin:0">Sends this register's product list (MRP, GST, HSN) to the Field Sales app (drhanfield.netlify.app) automatically whenever stock changes, and shows the quotations field executives make. Field quotations don't change stock; to bill, make an order, challan or invoice here as usual.</p>
      ${connectCard()}</div>
    ${fuser ? `<div class="panel" id="fqList"><div class="toolbar">
      <select id="fqExec"><option value="">All executives</option>${execs.map(([id, nm]) => `<option value="${esc(id)}" ${fqFilt.exec === id ? "selected" : ""}>${esc(id)} · ${esc(nm)}</option>`).join("")}</select>
      <select id="fqSt"><option value="">All status</option>${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${fqFilt.st === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input type="search" id="fqQ" placeholder="Search number, doctor, hospital, product…" value="${esc(fqFilt.q)}">
      <span class="note">${rows.length} quotation${rows.length === 1 ? "" : "s"} · ₹ ${n2(sum(rows))}</span></div>
      <div class="tablewrap"><table><thead><tr><th>Quotation no.</th><th>Date</th><th>Executive</th><th>Doctor / hospital</th><th>Products</th><th style="text-align:right">Grand total (₹)</th><th>Status / PDF</th></tr></thead><tbody>
      ${rows.length ? rows.map(d => `<tr><td class="code" style="font-size:11.5px">${esc(d.no)}</td><td>${esc(dmy(d.date))}</td><td>${esc(d.execName || "")} <span class="code">${esc(d.exec)}</span></td>
        <td><b>${esc(d.doctor || "")}</b><br><span class="note">${esc((d.customer && d.customer.name) || "")}</span></td>
        <td style="max-width:320px">${(d.lines || []).map(l => `${esc(l.qty)} × ${esc(l.desc)}`).join("<br>")}</td><td style="text-align:right">${n2(d.totals && d.totals.grand)}</td>
        <td><div style="display:grid;gap:4px;width:112px"><select data-fqst="${esc(d.id)}">${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${d.status === k ? "selected" : ""}>${l}</option>`).join("")}</select><button class="btn" data-fqpdf="${esc(d.id)}">⬇ PDF</button></div></td></tr>`).join("") : `<tr><td colspan="7" class="empty">No field quotations yet.</td></tr>`}
      </tbody></table></div></div>` : ""}`;

    if (!fuser) {
      const err = t => { connErr = t; const x = document.getElementById("flErr"); if (x) { x.textContent = t; x.classList.toggle("hidden", !t); } };
      const go = async () => { err(""); const id = document.getElementById("flId").value.trim(), pw = document.getElementById("flPw").value;
        if (!id || !pw) return err("Enter the User ID (ADMIN) and the Field app password.");
        const email = id.toUpperCase() === "ADMIN" ? ADMIN_EMAIL : id.includes("@") ? id.toLowerCase() : "";
        if (!email) return err("Use the ADMIN login here (field executives can't connect the register).");
        const b = document.getElementById("flGo"); b.disabled = true; b.textContent = "Connecting…";
        try { await fauth.signInWithEmailAndPassword(email, pw); connErr = ""; } catch (e) { b.disabled = false; b.textContent = "Connect Field app"; err(nice(e)); } };
      document.getElementById("flGo").onclick = go;
      document.getElementById("flPw").onkeydown = e => { if (e.key === "Enter") go(); };
      document.getElementById("flG").onclick = async () => { err(""); try { const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); await fauth.signInWithPopup(p); } catch (e) { err(nice(e)); } };
      return;
    }
    document.getElementById("fqSend").onclick = () => { setPub("Sending…"); publish(true); };
    document.getElementById("fqOut").onclick = () => fauth.signOut();
    document.getElementById("fqExec").onchange = e => { fqFilt.exec = e.target.value; renderFieldQ(); };
    document.getElementById("fqSt").onchange = e => { fqFilt.st = e.target.value; renderFieldQ(); };
    const qi = document.getElementById("fqQ"); qi.oninput = e => { fqFilt.q = e.target.value; clearTimeout(renderFieldQ._t); renderFieldQ._t = setTimeout(() => { renderFieldQ(); const x = document.getElementById("fqQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
    el.querySelectorAll("[data-fqpdf]").forEach(b => b.onclick = async () => {
      const d = JSON.parse(JSON.stringify(fq[b.dataset.fqpdf])); d.company = { ...DEFAULT_COMPANY, ...S.company, ...(d.company || {}) }; if (S.company && S.company.logo) d.company.logo = S.company.logo; d.codeLabel = "Product Code";
      try { const pdf = buildPdf(d); await save(d.no.replace(/\//g, "-") + ".pdf", new Uint8Array(pdf.output("arraybuffer"))); } catch (e) { msg($("globalmsg"), "bad", "Couldn't make the PDF: " + (e.message || e)); }
    });
    el.querySelectorAll("[data-fqst]").forEach(sl => sl.onchange = async () => {
      if (!canEditPanel("sellorder")) { msg($("globalmsg"), "bad", "You can view, but not change, sell orders."); renderFieldQ(); return; }
      const id = sl.dataset.fqst; try { await fsx().doc("fquotes/" + id).set({ ...fq[id], status: sl.value, statusAt: Date.now(), statusBy: S.myEmail || "" }); } catch (e) { msg($("globalmsg"), "bad", "Couldn't update: " + (e.message || e.code)); }
    });
  }
})();
