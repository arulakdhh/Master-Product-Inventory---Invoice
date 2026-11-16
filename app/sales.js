"use strict";
/* ===== Sales & stock: quotations, delivery challans, tax invoices ===== */
const DOC_TYPES = {
  INV: { name: "Tax Invoice", short: "Invoice", title: "TAX INVOICE", prefix: "DHH/", deducts: true },
  QTN: { name: "Quotation", short: "Quotation", title: "QUOTATION", prefix: "DHH/QTN/", deducts: false },
  DC:  { name: "Delivery Challan", short: "Challan", title: "DELIVERY CHALLAN", prefix: "DHH/DC/", deducts: true },
};
const STATES = {"01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh","05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh","10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh","13":"Nagaland","14":"Manipur","15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal","20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh","24":"Gujarat","26":"Dadra & Nagar Haveli and Daman & Diu","27":"Maharashtra","29":"Karnataka","30":"Goa","31":"Lakshadweep","32":"Kerala","33":"Tamil Nadu","34":"Puducherry","35":"Andaman & Nicobar","36":"Telangana","37":"Andhra Pradesh","38":"Ladakh"};
const DEFAULT_COMPANY = {
  name: "Dr Han Health Care Private Limited",
  address: "New No. 26, Old No. 36, Pooram Prakasam Road, Royapettah,\nMylapore - Triplicane, Chennai - 600028, Tamil Nadu, India",
  gstin: "33AAICD8859P1ZS", stateCode: "33", dl: "TN/Z03/20B/00091, TN/Z03/21B/00091",
  phone: "8838096205", email: "", bankName: "", bankAccount: "", bankIfsc: "", bankBranch: "",
  terms: "Goods once sold will not be taken back.\nSubject to Chennai jurisdiction.", signatory: "Authorised Signatory"
};
Object.assign(S, { sales: {}, customers: {}, company: { ...DEFAULT_COMPANY }, ed: null, salesFilter: { type: "", status: "", q: "" }, salesView: null });

const fyOf = iso => { const [y, m] = iso.split("-").map(Number); const s = m >= 4 ? y : y - 1; return `${String(s % 100).padStart(2, "0")}-${String((s + 1) % 100).padStart(2, "0")}`; };
const dmy = iso => iso ? iso.split("-").reverse().join(".") : "";
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const docNo = (type, fy, seq) => `${DOC_TYPES[type].prefix}${fy}/${String(seq).padStart(4, "0")}`;

/* ---------- stock ---------- */
function lineDeducts(doc) {
  if (doc.status === "cancelled") return false;
  if (doc.type === "DC") return true;
  if (doc.type === "INV") return !doc.fromDc;
  return false;
}
function soldMap(exceptId) {
  const m = {};
  for (const [id, d] of Object.entries(S.sales)) { if (id === exceptId || !lineDeducts(d)) continue; for (const l of d.lines || []) m[l.key] = (m[l.key] || 0) + l.qty; }
  return m;
}
function computeStock(items) { const m = soldMap(); for (const r of items) { r.soldQty = m[r.key] || 0; r.availQty = r2(r.qty - r.soldQty); } }

/* ---------- money ---------- */
function calcLine(l, intra) {
  const gross = r2(l.qty * l.rate); const disc = r2(gross * (l.discPct || 0) / 100); const taxable = r2(gross - disc);
  const g = l.gstRate || 0; let cgst = 0, sgst = 0, igst = 0;
  if (intra) { cgst = r2(taxable * g / 200); sgst = r2(taxable * g / 200); } else igst = r2(taxable * g / 100);
  return { gross, disc, taxable, cgst, sgst, igst, total: r2(taxable + cgst + sgst + igst) };
}
function calcDoc(lines, intra, type) {
  const t = { qty: 0, gross: 0, disc: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  for (const l of lines) { const c = calcLine(l, intra); t.qty += l.qty; for (const k of ["gross", "disc", "taxable", "cgst", "sgst", "igst"]) t[k] = r2(t[k] + c[k]); }
  const exact = r2(t.taxable + t.cgst + t.sgst + t.igst); t.grand = Math.round(exact); t.roundOff = r2(t.grand - exact); t.exact = exact;
  return t;
}
function inWords(n) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = x => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : "");
  const three = x => (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : "") + (x % 100 ? two(x % 100) : "");
  n = Math.round(n); if (!n) return "Zero";
  const parts = []; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) parts.push(three(cr) + " Crore"); if (lk) parts.push(two(lk) + " Lakh"); if (th) parts.push(two(th) + " Thousand"); if (n) parts.push(three(n));
  return parts.join(" ");
}
const custState = c => (c && (c.stateCode || (c.gstin || "").slice(0, 2))) || "";
const isIntra = c => { const s = custState(c); return !s || s === (S.company.stateCode || "33"); };

/* ---------- editor ---------- */
function newDoc(type, from) {
  S.ed = { type, date: todayIso(), customerId: "", cust: { name: "", address: "", gstin: "", stateCode: "33", dl: "", phone: "" }, extra: [{ label: "", value: "" }], lines: [], notes: "", refQtn: "", refDc: "", fromDc: false, editingId: "" };
  if (from) {
    const src = S.sales[from];
    S.ed.cust = { ...src.customer }; S.ed.customerId = src.customerId || ""; S.ed.extra = (src.extra || []).map(x => ({ ...x })); if (!S.ed.extra.length) S.ed.extra = [{ label: "", value: "" }];
    S.ed.lines = src.lines.map(l => ({ ...l })); S.ed.notes = src.notes || "";
    if (src.type === "QTN") S.ed.refQtn = from;
    if (src.type === "DC") { S.ed.refDc = from; S.ed.fromDc = true; }
  }
  renderSales(); setTimeout(() => document.getElementById("edDate")?.scrollIntoView({ block: "center" }), 30);
}
function editQuotation(id) {
  const src = S.sales[id]; newDoc("QTN", null);
  Object.assign(S.ed, { editingId: id, date: src.date, cust: { ...src.customer }, customerId: src.customerId || "", extra: (src.extra || []).map(x => ({ ...x })), lines: src.lines.map(l => ({ ...l })), notes: src.notes || "" });
  if (!S.ed.extra.length) S.ed.extra = [{ label: "", value: "" }];
  renderSales();
}
function stockFor(key) { return S.items.find(r => r.key === key); }
function availFor(key) { const r = stockFor(key); if (!r) return 0; const m = soldMap(S.ed && S.ed.editingId); return r2(r.qty - (m[key] || 0)); }
function addLine(key) {
  const r = stockFor(key); if (!r) return;
  if (S.ed.lines.some(l => l.key === key)) { edMsg("That PID is already on this document. Change its quantity instead."); return; }
  S.ed.lines.push({ key, pid: r.dhhId || "", purchaseInvoice: r.invoiceNo, purchaseSr: r.sr, mat: r.mat, desc: r.desc, hsn: r.hsn, batch: r.batch, serial: r.serial || "", exp: r.exp, uom: r.uom, qty: 1, mrp: r.mrp, rate: r.mrp, discPct: 0, gstRate: r.igstRate || 0, remarks: "" });
  renderEditor();
}
function edMsg(t, kind = "warn") { const el = document.getElementById("edMsg"); if (el) { el.className = "msg " + kind; el.textContent = t; el.classList.remove("hidden"); } }

/* ---------- render ---------- */
function renderSales() {
  const el = $("tab-sales"); if (!el) return;
  if (!el.dataset.built) {
    el.dataset.built = "1";
    el.innerHTML = `
    <div class="panel pad">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Sales &amp; stock</h2>
        <div class="row">
          <button class="btn primary" data-new="INV">New tax invoice</button>
          <button class="btn" data-new="QTN">New quotation</button>
          <button class="btn" data-new="DC">New delivery challan</button>
          <button class="btn" id="btnCompany">Company details ▾</button>
          <button class="btn" id="btnCustomers">Customers ▾</button>
        </div>
      </div>
      <p class="note" style="margin:8px 0 0">Tax invoices and delivery challans reduce stock as soon as they're saved. Quotations don't. Cancelling returns the stock. A challan converted to an invoice isn't counted twice.</p>
    </div>
    <div class="panel pad hidden" id="companyBox"></div>
    <div class="panel pad hidden" id="customerBox"></div>
    <div class="panel pad hidden" id="editor"></div>
    <div class="panel hidden" id="docView"></div>
    <div class="panel">
      <div class="toolbar">
        <input type="search" id="sq" placeholder="Search number, customer, PID…" aria-label="Search documents">
        <select id="sType" aria-label="Document type"><option value="">All documents</option><option value="INV">Tax invoices</option><option value="QTN">Quotations</option><option value="DC">Delivery challans</option></select>
        <select id="sStatus" aria-label="Status"><option value="">Any status</option><option value="active">Active / open</option><option value="converted">Converted / billed</option><option value="cancelled">Cancelled</option></select>
        <span class="count" id="scount"></span>
      </div>
      <div class="tablewrap"><table id="salestbl"><thead></thead><tbody></tbody></table></div>
    </div>`;
    el.addEventListener("click", salesClick); el.addEventListener("input", salesInput); el.addEventListener("change", salesChange);
  }
  $("tab-sales").querySelectorAll("[data-new]").forEach(b => b.disabled = !S.canWrite || !S.db);
  renderEditor(); renderSalesList(); if (!$("companyBox").classList.contains("hidden")) renderCompany(); if (!$("customerBox").classList.contains("hidden")) renderCustomers();
  if (S.salesView) renderDocView(S.salesView);
}
function statusPill(d) {
  const s = d.status;
  if (s === "cancelled") return '<span class="pill bad">Cancelled</span>';
  if (d.type === "QTN") return s === "converted" ? '<span class="pill good">Converted</span>' : '<span class="pill warn">Open</span>';
  if (d.type === "DC") return s === "billed" ? '<span class="pill good">Billed</span>' : '<span class="pill warn">Open (not billed)</span>';
  return '<span class="pill good">Active</span>';
}
function renderSalesList() {
  const f = { q: ($("sq")?.value || "").toLowerCase(), t: $("sType")?.value || "", s: $("sStatus")?.value || "" };
  let docs = Object.entries(S.sales).map(([id, d]) => ({ id, ...d })).sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no));
  docs = docs.filter(d => (!f.t || d.type === f.t) && (!f.s || (f.s === "active" ? ["active", "open"].includes(d.status) : f.s === "converted" ? ["converted", "billed"].includes(d.status) : d.status === f.s))
    && (!f.q || [d.no, d.customer?.name, d.customer?.gstin, ...(d.lines || []).map(l => l.pid + " " + l.mat + " " + l.batch + " " + l.serial)].join(" ").toLowerCase().includes(f.q)));
  $("salestbl").tHead.innerHTML = "<tr><th>Number</th><th>Type</th><th>Date</th><th>Customer</th><th class='num'>Lines</th><th class='num'>QTY</th><th class='num'>Total (₹)</th><th>Status</th><th></th></tr>";
  $("salestbl").tBodies[0].innerHTML = docs.length ? docs.map(d => {
    const acts = [`<button class="btn" data-view="${esc(d.id)}">View / PDF</button>`];
    if (S.canWrite && d.status !== "cancelled") {
      if (d.type === "QTN" && d.status === "open") acts.push(`<button class="btn" data-editq="${esc(d.id)}">Edit</button>`, `<button class="btn" data-conv="INV:${esc(d.id)}">→ Invoice</button>`, `<button class="btn" data-conv="DC:${esc(d.id)}">→ Challan</button>`);
      if (d.type === "DC" && d.status === "open") acts.push(`<button class="btn" data-conv="INV:${esc(d.id)}">→ Invoice</button>`);
      if (!(d.type === "DC" && d.status === "billed") && !(d.type === "QTN" && d.status === "converted")) acts.push(`<button class="btn danger" data-cancel="${esc(d.id)}">Cancel</button>`);
    }
    return `<tr><td class="code">${esc(d.no)}</td><td>${esc(DOC_TYPES[d.type].short)}</td><td>${esc(dmy(d.date))}</td><td>${esc(d.customer?.name || "")}</td><td class="num">${(d.lines || []).length}</td><td class="num">${inr(d.totals?.qty || 0, 0)}</td><td class="num">${inr(d.type === "DC" ? d.totals?.taxable : d.totals?.grand)}</td><td>${statusPill(d)}${d.refNo ? `<div class="note">from ${esc(d.refNo)}</div>` : ""}${d.billedBy ? `<div class="note">billed in ${esc(d.billedBy)}</div>` : ""}${d.convertedTo ? `<div class="note">→ ${esc(d.convertedTo)}</div>` : ""}</td><td><div class="row" style="flex-wrap:nowrap">${acts.join("")}</div></td></tr>`;
  }).join("") : `<tr><td colspan="9" class="empty">No documents yet. Start with <b>New tax invoice</b>, <b>New quotation</b> or <b>New delivery challan</b>.</td></tr>`;
  $("scount").textContent = `${docs.length} document${docs.length === 1 ? "" : "s"}`;
}
function renderEditor() {
  const box = $("editor"); if (!box) return;
  const E = S.ed; box.classList.toggle("hidden", !E); if (!E) return;
  const T = DOC_TYPES[E.type]; const intra = isIntra(E.cust); const tot = calcDoc(E.lines, intra, E.type);
  const custOpts = Object.entries(S.customers).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, c]) => `<option value="${esc(id)}" ${E.customerId === id ? "selected" : ""}>${esc(c.name)}${c.gstin ? " · " + esc(c.gstin) : ""}</option>`).join("");
  const focus = document.activeElement && document.activeElement.id; const caret = focus && document.activeElement.selectionStart;
  box.innerHTML = `
   <div class="row" style="justify-content:space-between"><h2 style="margin:0">${E.editingId ? "Edit " : "New "}${esc(T.name)}${E.refQtn ? ` <span class="note">from ${esc(S.sales[E.refQtn]?.no || "")}</span>` : ""}${E.refDc ? ` <span class="note">billing challan ${esc(S.sales[E.refDc]?.no || "")}</span>` : ""}</h2>
     <span class="note">Number is given when you save: ${esc(E.editingId ? S.sales[E.editingId].no : `${DOC_TYPES[E.type].prefix}${fyOf(E.date || todayIso())}/____`)}</span></div>
   <div class="grid2" style="margin-top:10px">
     <div style="display:grid;gap:8px;align-content:start">
       <div class="row"><label for="edDate"><b>Date</b></label><input type="date" id="edDate" value="${esc(E.date)}"></div>
       <div class="row"><label for="edCust"><b>Customer</b></label><select id="edCust"><option value="">— new customer —</option>${custOpts}</select></div>
       <div class="kvform">
         <label for="cName">Name</label><input type="text" id="cName" data-c="name" value="${esc(E.cust.name)}">
         <label for="cAddr">Address</label><textarea id="cAddr" data-c="address" rows="2" style="min-height:52px;font-family:var(--font-body);font-size:13px">${esc(E.cust.address)}</textarea>
         <label for="cGstin">GSTIN</label><input type="text" id="cGstin" data-c="gstin" value="${esc(E.cust.gstin)}" maxlength="15" placeholder="Leave blank if unregistered">
         <label for="cState">State</label><select id="cState" data-c="stateCode">${Object.entries(STATES).map(([k, v]) => `<option value="${k}" ${custState(E.cust) === k ? "selected" : ""}>${k} · ${v}</option>`).join("")}</select>
         <label for="cDl">Drug licence</label><input type="text" id="cDl" data-c="dl" value="${esc(E.cust.dl)}">
         <label for="cPhone">Phone</label><input type="text" id="cPhone" data-c="phone" value="${esc(E.cust.phone)}">
       </div>
       <div class="note">${intra ? "Same state as you: CGST + SGST." : "Other state: IGST."}${E.customerId ? "" : " A new customer is saved for next time when you save this document."}</div>
     </div>
     <div style="display:grid;gap:8px;align-content:start">
       <b>Additional details</b>
       <div class="note">Anything you want printed on the document, e.g. Patient name, IP no., Doctor, Hospital, PO no.</div>
       ${E.extra.map((x, i) => `<div class="row"><input type="text" data-xl="${i}" value="${esc(x.label)}" placeholder="Label" style="width:150px" aria-label="Detail label ${i + 1}"><input type="text" data-xv="${i}" value="${esc(x.value)}" placeholder="Value" style="flex:1" aria-label="Detail value ${i + 1}"><button class="btn" data-xdel="${i}" aria-label="Remove detail">✕</button></div>`).join("")}
       <div><button class="btn" id="xAdd">+ Add detail</button></div>
       <label for="edNotes"><b>Notes</b></label><textarea id="edNotes" rows="2" style="min-height:52px;font-family:var(--font-body);font-size:13px">${esc(E.notes)}</textarea>
     </div>
   </div>
   ${E.fromDc ? `<div class="msg warn" style="margin-top:10px">Billing a delivery challan: items and quantities come from the challan and its stock is already out, so this invoice won't reduce stock again. You can change rates, discount and GST.</div>` : `
   <div style="margin-top:12px;display:grid;gap:6px">
     <label for="pick"><b>Add product</b> <span class="note">search PID, code, description, batch or serial. In-stock items only, earliest expiry first.</span></label>
     <input type="search" id="pick" placeholder="e.g. MHC12, MT-PS73, LUSC-35, K2512…" autocomplete="off">
     <div id="pickres"></div>
   </div>`}
   <div class="tablewrap" style="margin-top:10px;max-height:none"><table class="edtable">
     <thead><tr><th>#</th><th>PID</th><th>Description</th><th>Batch / Serial</th><th>Expiry</th><th class="num">Avail.</th><th class="num">QTY</th><th class="num">MRP</th><th class="num">Rate</th><th class="num">Disc %</th><th class="num">GST %</th><th class="num">Taxable</th><th class="num">Total</th><th>Remarks</th><th></th></tr></thead>
     <tbody>${E.lines.length ? E.lines.map((l, i) => { const c = calcLine(l, intra); const av = availFor(l.key); const over = T.deducts && !E.fromDc && l.qty > av;
       return `<tr><td>${i + 1}</td><td class="dhh">${esc(l.pid)}</td><td class="desc">${esc(l.desc)}<div class="note">${esc(l.mat)} · HSN ${esc(l.hsn)}</div></td><td class="code">${esc(l.batch)}${l.serial ? "<br>" + esc(l.serial) : ""}</td><td>${esc(l.exp)}</td><td class="num">${E.fromDc ? "—" : inr(av, 0)}</td>
       <td class="num"><input type="number" min="1" step="1" data-l="qty" data-i="${i}" value="${l.qty}" style="width:64px;text-align:right;${over ? "border-color:var(--bad)" : ""}" ${E.fromDc || l.serial ? "readonly" : ""} aria-label="Quantity line ${i + 1}"></td>
       <td class="num">${inr(l.mrp)}</td>
       <td class="num"><input type="number" min="0" step="0.01" data-l="rate" data-i="${i}" value="${l.rate}" style="width:96px;text-align:right" aria-label="Rate line ${i + 1}"></td>
       <td class="num"><input type="number" min="0" max="100" step="0.01" data-l="discPct" data-i="${i}" value="${l.discPct}" style="width:64px;text-align:right" aria-label="Discount line ${i + 1}"></td>
       <td class="num"><input type="number" min="0" max="28" step="0.01" data-l="gstRate" data-i="${i}" value="${l.gstRate}" style="width:56px;text-align:right" aria-label="GST line ${i + 1}"></td>
       <td class="num">${inr(c.taxable)}</td><td class="num">${inr(c.total)}</td>
       <td><input type="text" data-l="remarks" data-i="${i}" value="${esc(l.remarks)}" style="width:130px" aria-label="Remarks line ${i + 1}"></td>
       <td>${E.fromDc ? "" : `<button class="btn" data-ldel="${i}" aria-label="Remove line">✕</button>`}</td></tr>`; }).join("") : `<tr><td colspan="15" class="empty">No products yet. Search above to add.</td></tr>`}</tbody>
   </table></div>
   <div class="row" style="justify-content:space-between;margin-top:10px;align-items:flex-start">
     <div id="edMsg" class="hidden"></div>
     <dl class="kv" style="margin-left:auto;text-align:right">
       <dt>Taxable</dt><dd class="num">${inr(tot.taxable)}</dd>
       ${intra ? `<dt>CGST</dt><dd>${inr(tot.cgst)}</dd><dt>SGST</dt><dd>${inr(tot.sgst)}</dd>` : `<dt>IGST</dt><dd>${inr(tot.igst)}</dd>`}
       <dt>Round off</dt><dd>${inr(tot.roundOff)}</dd><dt><b>Grand total</b></dt><dd><b>₹ ${inr(tot.grand)}</b></dd>
     </dl>
   </div>
   <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn" id="edCancel">Discard</button><button class="btn primary" id="edSave" ${E.lines.length ? "" : "disabled"}>${E.editingId ? "Save changes" : "Save " + esc(T.name.toLowerCase())}</button></div>`;
  if (focus) { const f = document.getElementById(focus) || box.querySelector(`[id="${focus}"]`); if (f) { f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch { } } }
  const pq = $("pick"); if (pq && S._pickq) { pq.value = S._pickq; renderPick(); }
}
function renderPick() {
  const q = ($("pick")?.value || "").trim().toLowerCase(); S._pickq = q; const out = $("pickres"); if (!out) return;
  if (!q) { out.innerHTML = ""; return; }
  const m = soldMap(S.ed.editingId);
  const res = S.items.filter(r => r2(r.qty - (m[r.key] || 0)) > 0 && q.split(/\s+/).every(w => [r.dhhId, r.mat, r.desc, r.batch, r.serial, r.hsn].join(" ").toLowerCase().includes(w)))
    .sort((a, b) => (toDate(a.exp)?.getTime() ?? Infinity) - (toDate(b.exp)?.getTime() ?? Infinity)).slice(0, 25);
  out.innerHTML = res.length ? `<div class="tablewrap" style="max-height:260px"><table><thead><tr><th>PID</th><th>Description</th><th>Batch / Serial</th><th>Expiry</th><th class="num">Avail.</th><th class="num">MRP</th><th></th></tr></thead><tbody>${res.map(r => `<tr><td class="dhh">${esc(r.dhhId || "—")}</td><td class="desc">${esc(r.desc)}<div class="note">${esc(r.mat)}</div></td><td class="code">${esc(r.batch)}${r.serial ? "<br>" + esc(r.serial) : ""}</td><td>${esc(r.exp)}</td><td class="num">${inr(r2(r.qty - (m[r.key] || 0)), 0)}</td><td class="num">${inr(r.mrp)}</td><td><button class="btn" data-add="${esc(r.key)}">Add</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="note">No in-stock product matches "${esc(q)}".</div>`;
}

/* ---------- editor events ---------- */
function salesInput(e) {
  const t = e.target; const E = S.ed;
  if (t.id === "sq") return renderSalesList();
  if (t.id === "pick") return renderPick();
  if (!E) return;
  if (t.dataset.c) { E.cust[t.dataset.c] = t.value; if (t.dataset.c === "gstin" && /^\d{2}/.test(t.value) && STATES[t.value.slice(0, 2)]) { E.cust.stateCode = t.value.slice(0, 2); } return; }
  if (t.dataset.xl) { E.extra[+t.dataset.xl].label = t.value; return; }
  if (t.dataset.xv) { E.extra[+t.dataset.xv].value = t.value; return; }
  if (t.id === "edNotes") { E.notes = t.value; return; }
  if (t.dataset.l) { const l = E.lines[+t.dataset.i]; const k = t.dataset.l; l[k] = k === "remarks" ? t.value : (parseFloat(t.value) || 0); if (k === "qty") l.qty = Math.max(0, Math.round(l.qty)); }
}
function salesChange(e) {
  const t = e.target; const E = S.ed;
  if (t.id === "sType" || t.id === "sStatus") return renderSalesList();
  if (!E) return;
  if (t.id === "edDate") { E.date = t.value || todayIso(); return renderEditor(); }
  if (t.id === "edCust") { E.customerId = t.value; E.cust = t.value ? { ...S.customers[t.value] } : { name: "", address: "", gstin: "", stateCode: "33", dl: "", phone: "" }; return renderEditor(); }
  if (t.dataset.c === "stateCode" || t.dataset.c === "gstin") { E.cust[t.dataset.c] = t.value; if (t.dataset.c === "gstin" && STATES[t.value.slice(0, 2)]) E.cust.stateCode = t.value.slice(0, 2); return renderEditor(); }
  if (t.dataset.l && t.dataset.l !== "remarks") return renderEditor();
}
async function salesClick(e) {
  const b = e.target.closest("button"); if (!b) return; const E = S.ed;
  if (b.dataset.new) { S.salesView = null; $("docView").classList.add("hidden"); return newDoc(b.dataset.new); }
  if (b.dataset.add) return addLine(b.dataset.add);
  if (b.dataset.ldel) { E.lines.splice(+b.dataset.ldel, 1); return renderEditor(); }
  if (b.id === "xAdd") { E.extra.push({ label: "", value: "" }); return renderEditor(); }
  if (b.dataset.xdel) { E.extra.splice(+b.dataset.xdel, 1); if (!E.extra.length) E.extra.push({ label: "", value: "" }); return renderEditor(); }
  if (b.id === "edCancel") { S.ed = null; S._pickq = ""; return renderEditor(); }
  if (b.id === "edSave") return saveDoc(b);
  if (b.dataset.view) { S.salesView = b.dataset.view; return renderDocView(b.dataset.view, true); }
  if (b.dataset.editq) return editQuotation(b.dataset.editq);
  if (b.dataset.conv) { const [type, id] = b.dataset.conv.split(":"); return newDoc(type, id); }
  if (b.dataset.cancel) return cancelDoc(b);
  if (b.dataset.pdf) return downloadPdf(b.dataset.pdf);
  if (b.id === "closeView") { S.salesView = null; $("docView").classList.add("hidden"); return; }
  if (b.id === "btnCompany") { $("companyBox").classList.toggle("hidden"); return renderCompany(); }
  if (b.id === "btnCustomers") { $("customerBox").classList.toggle("hidden"); return renderCustomers(); }
  if (b.id === "saveCompany") return saveCompany(b);
  if (b.dataset.custdel) return deleteCustomer(b);
}

/* ---------- save / cancel ---------- */
async function nextNumber(type, fy) {
  const ref = S.db.doc("settings/salescounters"); const holder = "s" + Math.random().toString(36).slice(2);
  const lease = await ref.acquire({ holder, ttlMs: 60000 }); if (!lease.acquired) throw new Error("another document is being saved right now; try again in a moment");
  const snap = await ref.get(); const c = { ...((snap.exists && snap.data().counts) || {}) }; const k = type + "_" + fy;
  let seq = (c[k] || 0) + 1; while (S.sales[`${type}_${fy}_${String(seq).padStart(4, "0")}`]) seq++;
  c[k] = seq; await ref.set({ counts: c, updatedAt: new Date().toISOString() }); return seq;
}
async function saveDoc(btn) {
  const E = S.ed; const T = DOC_TYPES[E.type];
  if (!E.cust.name.trim()) return edMsg("Enter the customer's name.", "bad");
  if (!E.lines.length) return edMsg("Add at least one product.", "bad");
  if (E.lines.some(l => !(l.qty > 0))) return edMsg("Every line needs a quantity of at least 1.", "bad");
  if (E.lines.some(l => l.serial && l.qty > 1)) return edMsg("A serial-numbered implant can only have quantity 1.", "bad");
  if (E.cust.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(E.cust.gstin.trim().toUpperCase())) return edMsg("The GSTIN doesn't look right (15 characters, e.g. 33AAICD8859P1ZS). Fix it or leave it blank.", "bad");
  if (T.deducts && !E.fromDc) {
    const m = soldMap(E.editingId); const bad = E.lines.filter(l => { const r = stockFor(l.key); return !r || l.qty > r2(r.qty - (m[l.key] || 0)); });
    if (bad.length) return edMsg(`Not enough stock for ${bad.map(l => l.pid || l.mat).join(", ")}. Lower the quantity or remove the line.`, "bad");
  }
  if (E.fromDc && S.sales[E.refDc]?.status !== "open") return edMsg("That challan is no longer open (already billed or cancelled).", "bad");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const intra = isIntra(E.cust); const totals = calcDoc(E.lines, intra, E.type);
    const cust = { ...E.cust, gstin: (E.cust.gstin || "").trim().toUpperCase(), stateCode: custState(E.cust) || "33" }; cust.stateName = STATES[cust.stateCode] || "";
    let customerId = E.customerId;
    if (!customerId) { customerId = "c" + Date.now().toString(36); await S.db.doc(`customers/${customerId}`).set({ name: cust.name, address: cust.address, gstin: cust.gstin, stateCode: cust.stateCode, stateName: cust.stateName, dl: cust.dl, phone: cust.phone }); }
    const lines = E.lines.map(l => { const c = calcLine(l, intra); return { ...l, ...c }; });
    const base = { type: E.type, date: E.date, customerId, customer: cust, intra, extra: E.extra.filter(x => x.label.trim() || x.value.trim()), notes: E.notes, lines, totals, company: { ...S.company } };
    let id, no;
    if (E.editingId) { id = E.editingId; const old = S.sales[id]; no = old.no; await S.db.doc(`sales/${id}`).set({ ...old, ...base, no, updatedAt: new Date().toISOString() }); }
    else {
      const fy = fyOf(E.date); const seq = await nextNumber(E.type, fy); id = `${E.type}_${fy}_${String(seq).padStart(4, "0")}`; no = docNo(E.type, fy, seq);
      const ref = E.refQtn || E.refDc;
      await S.db.doc(`sales/${id}`).set({ ...base, no, fy, seq, status: E.type === "INV" ? "active" : "open", fromDc: !!E.fromDc, refId: ref || "", refNo: ref ? S.sales[ref].no : "", createdAt: new Date().toISOString() });
      if (E.refQtn) await S.db.doc(`sales/${E.refQtn}`).set({ ...S.sales[E.refQtn], status: "converted", convertedTo: no });
      if (E.refDc) await S.db.doc(`sales/${E.refDc}`).set({ ...S.sales[E.refDc], status: "billed", billedBy: no, billedId: id });
    }
    S.ed = null; S._pickq = ""; S.salesView = id; renderSales();
    msg($("globalmsg"), "good", `Saved ${T.name.toLowerCase()} ${no}.` + (T.deducts && !E.fromDc ? " Stock updated." : ""));
  } catch (err) { btn.disabled = false; btn.textContent = "Save"; edMsg("Couldn't save: " + (err.message || err.code), "bad"); }
}
async function cancelDoc(b) {
  const id = b.dataset.cancel; const d = S.sales[id];
  if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again to cancel " + d.no; setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = "Cancel"; } }, 4000); return; }
  b.disabled = true;
  try {
    await S.db.doc(`sales/${id}`).set({ ...d, status: "cancelled", cancelledAt: new Date().toISOString() });
    if (d.type === "INV" && d.fromDc && d.refId && S.sales[d.refId]) { const dc = { ...S.sales[d.refId], status: "open" }; delete dc.billedBy; delete dc.billedId; await S.db.doc(`sales/${d.refId}`).set(dc); }
    if (d.refId && S.sales[d.refId]?.type === "QTN" && S.sales[d.refId].convertedTo === d.no) { const q = { ...S.sales[d.refId], status: "open" }; delete q.convertedTo; await S.db.doc(`sales/${d.refId}`).set(q); }
    msg($("globalmsg"), "good", `Cancelled ${d.no}.` + (lineDeducts(d) ? " Its quantity is back in stock." : d.fromDc ? " The challan is open again." : ""));
  } catch (err) { b.disabled = false; msg($("globalmsg"), "bad", "Couldn't cancel: " + (err.message || err.code)); }
}

/* ---------- company & customers ---------- */
function renderCompany() {
  const c = S.company; const f = [["name", "Company name"], ["address", "Address", 1], ["gstin", "GSTIN"], ["stateCode", "State code"], ["dl", "Drug licence no."], ["phone", "Phone"], ["email", "Email"], ["bankName", "Bank name"], ["bankAccount", "Account no."], ["bankIfsc", "IFSC"], ["bankBranch", "Branch"], ["terms", "Terms & conditions", 1], ["signatory", "Signatory line"]];
  $("companyBox").innerHTML = `<h2>Company details (printed on every document)</h2><div class="kvform">${f.map(([k, l, ta]) => `<label for="co_${k}">${l}</label>${ta ? `<textarea id="co_${k}" rows="3" style="min-height:60px;font-family:var(--font-body);font-size:13px">${esc(c[k] || "")}</textarea>` : `<input type="text" id="co_${k}" value="${esc(c[k] || "")}">`}`).join("")}</div>
   <div class="row" style="margin-top:10px"><button class="btn primary" id="saveCompany" ${S.canWrite ? "" : "disabled"}>Save company details</button><span class="note" id="coNote">Saved documents keep the details they were made with.</span></div>`;
}
async function saveCompany(b) {
  const keys = ["name", "address", "gstin", "stateCode", "dl", "phone", "email", "bankName", "bankAccount", "bankIfsc", "bankBranch", "terms", "signatory"];
  const c = {}; keys.forEach(k => c[k] = $("co_" + k).value.trim()); b.disabled = true;
  try { await S.db.doc("settings/company").set(c); S.company = c; $("coNote").textContent = "Saved."; } catch (e) { $("coNote").textContent = "Couldn't save: " + (e.message || e.code); }
  b.disabled = false;
}
function renderCustomers() {
  const list = Object.entries(S.customers).sort((a, b) => a[1].name.localeCompare(b[1].name));
  $("customerBox").innerHTML = `<h2>Customers</h2><p class="note">Customers are added automatically the first time you save a document for them.</p>
   <div class="tablewrap"><table><thead><tr><th>Name</th><th>GSTIN</th><th>State</th><th>Drug licence</th><th>Phone</th><th class="num">Documents</th><th></th></tr></thead><tbody>
   ${list.length ? list.map(([id, c]) => { const n = Object.values(S.sales).filter(d => d.customerId === id).length; return `<tr><td>${esc(c.name)}<div class="note">${esc(c.address || "")}</div></td><td class="code">${esc(c.gstin || "")}</td><td>${esc(c.stateCode)} ${esc(c.stateName || "")}</td><td>${esc(c.dl || "")}</td><td>${esc(c.phone || "")}</td><td class="num">${n}</td><td>${S.canWrite && !n ? `<button class="btn danger" data-custdel="${esc(id)}">Delete</button>` : ""}</td></tr>`; }).join("") : `<tr><td colspan="7" class="empty">No customers yet.</td></tr>`}
   </tbody></table></div>`;
}
async function deleteCustomer(b) { if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again"; return; } try { await S.db.doc(`customers/${b.dataset.custdel}`).delete(); } catch (e) { msg($("globalmsg"), "bad", "Couldn't delete: " + (e.message || e.code)); } }

/* ---------- view & PDF ---------- */
function renderDocView(id, scroll) {
  const d = S.sales[id]; const box = $("docView"); if (!d) { box.classList.add("hidden"); return; }
  const T = DOC_TYPES[d.type]; const co = d.company || S.company; const t = d.totals;
  box.classList.remove("hidden");
  box.innerHTML = `<div class="toolbar"><b>${esc(T.name)} ${esc(d.no)}</b> ${statusPill(d)}<span class="count"></span><button class="btn primary" data-pdf="${esc(id)}">Download PDF</button><button class="btn" id="closeView">Close</button></div>
  <div class="pad" style="display:grid;gap:12px">
    <div class="grid2"><div><b>${esc(co.name)}</b><div class="note" style="white-space:pre-line">${esc(co.address)}</div><div class="note">GSTIN ${esc(co.gstin)} · DL ${esc(co.dl)}</div></div>
      <div><dl class="kv"><dt>${esc(T.short)} no.</dt><dd class="code">${esc(d.no)}</dd><dt>Date</dt><dd>${esc(dmy(d.date))}</dd>${d.refNo ? `<dt>Reference</dt><dd>${esc(d.refNo)}</dd>` : ""}<dt>Customer</dt><dd>${esc(d.customer.name)}${d.customer.gstin ? `<div class="note">GSTIN ${esc(d.customer.gstin)}</div>` : ""}<div class="note">${esc(d.customer.stateCode)} ${esc(d.customer.stateName || "")}</div></dd>
      ${(d.extra || []).map(x => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join("")}</dl></div></div>
    <div class="tablewrap" style="max-height:none"><table><thead><tr><th>#</th><th>PID</th><th>Description</th><th>HSN</th><th>Batch / Serial</th><th>Expiry</th><th class="num">QTY</th><th class="num">Rate</th><th class="num">Disc %</th><th class="num">Taxable</th><th class="num">GST %</th><th class="num">Total</th><th>Remarks</th></tr></thead>
    <tbody>${d.lines.map((l, i) => `<tr><td>${i + 1}</td><td class="dhh">${esc(l.pid)}</td><td class="desc">${esc(l.desc)}</td><td>${esc(l.hsn)}</td><td class="code">${esc(l.batch)}${l.serial ? "<br>" + esc(l.serial) : ""}</td><td>${esc(l.exp)}</td><td class="num">${inr(l.qty, 0)}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(l.discPct)}</td><td class="num">${inr(l.taxable)}</td><td class="num">${inr(l.gstRate)}</td><td class="num">${inr(l.total)}</td><td>${esc(l.remarks || "")}</td></tr>`).join("")}</tbody></table></div>
    <dl class="kv" style="margin-left:auto;text-align:right"><dt>Taxable</dt><dd>${inr(t.taxable)}</dd>${d.intra ? `<dt>CGST</dt><dd>${inr(t.cgst)}</dd><dt>SGST</dt><dd>${inr(t.sgst)}</dd>` : `<dt>IGST</dt><dd>${inr(t.igst)}</dd>`}<dt>Round off</dt><dd>${inr(t.roundOff)}</dd><dt><b>Grand total</b></dt><dd><b>₹ ${inr(t.grand)}</b></dd></dl>
    <div class="note">Rupees ${esc(inWords(t.grand))} only</div>
  </div>`;
  if (scroll) box.scrollIntoView({ block: "start" });
}
function buildPdf(d) {
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4" }); const T = DOC_TYPES[d.type]; const co = d.company || S.company; const t = d.totals;
  const W = 210, M = 10; const n2 = v => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(T.title, W / 2, 12, { align: "center" });
  if (d.status === "cancelled") { doc.setTextColor(200, 30, 30); doc.setFontSize(10); doc.text("CANCELLED", W / 2, 17, { align: "center" }); doc.setTextColor(0); }
  doc.setFontSize(11); doc.text(co.name || "", M, 24); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  let y = 29; for (const ln of doc.splitTextToSize((co.address || "").replace(/\n/g, " "), 110)) { doc.text(ln, M, y); y += 4; }
  doc.text(`GSTIN: ${co.gstin || ""}   State: ${co.stateCode || ""} ${STATES[co.stateCode] || ""}`, M, y); y += 4;
  if (co.dl) { doc.text(`DL No.: ${co.dl}`, M, y); y += 4; } if (co.phone || co.email) { doc.text([co.phone ? "Ph: " + co.phone : "", co.email].filter(Boolean).join("   "), M, y); y += 4; }
  const rx = 132; let ry = 24; doc.setFont("helvetica", "bold"); doc.text(`${T.short} No.: ${d.no}`, rx, ry); doc.setFont("helvetica", "normal"); ry += 5;
  doc.text(`Date: ${dmy(d.date)}`, rx, ry); ry += 5; if (d.refNo) { doc.text(`Ref: ${d.refNo}`, rx, ry); ry += 5; }
  doc.text(`Place of supply: ${d.customer.stateCode} ${d.customer.stateName || ""}`, rx, ry); ry += 5;
  y = Math.max(y, ry) + 2; doc.setDrawColor(150); doc.line(M, y, W - M, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.text(d.type === "DC" ? "Deliver to:" : "Bill to:", M, y); doc.setFont("helvetica", "normal"); y += 4.5;
  const cy0 = y; doc.setFont("helvetica", "bold"); doc.text(d.customer.name || "", M, y); doc.setFont("helvetica", "normal"); y += 4;
  for (const ln of doc.splitTextToSize((d.customer.address || "").replace(/\n/g, " "), 110)) { doc.text(ln, M, y); y += 4; }
  if (d.customer.gstin) { doc.text(`GSTIN: ${d.customer.gstin}`, M, y); y += 4; } if (d.customer.dl) { doc.text(`DL No.: ${d.customer.dl}`, M, y); y += 4; } if (d.customer.phone) { doc.text(`Ph: ${d.customer.phone}`, M, y); y += 4; }
  let ey = cy0; for (const x of d.extra || []) { for (const ln of doc.splitTextToSize(`${x.label}: ${x.value}`, 66)) { doc.text(ln, rx, ey); ey += 4; } }
  y = Math.max(y, ey) + 2;
  const head = [["#", "PID", "Description", "HSN", "Batch / Serial", "Expiry", "Qty", "Rate", "Disc%", "Taxable", "GST%", "Total"]];
  const body = d.lines.map((l, i) => [i + 1, l.pid || "", l.desc + (l.remarks ? `\n(${l.remarks})` : ""), l.hsn, l.batch + (l.serial ? "\n" + l.serial : ""), l.exp || "", l.qty, n2(l.rate), n2(l.discPct), n2(l.taxable), n2(l.gstRate), n2(l.total)]);
  doc.autoTable({ head, body, startY: y, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7.2, cellPadding: 1.2, valign: "top", lineColor: [180, 180, 180] }, headStyles: { fillColor: [11, 110, 117], textColor: 255, fontSize: 7.2 },
    columnStyles: { 0: { cellWidth: 6 }, 1: { cellWidth: 15 }, 2: { cellWidth: 44 }, 3: { cellWidth: 14 }, 4: { cellWidth: 22 }, 5: { cellWidth: 15 }, 6: { cellWidth: 8, halign: "right" }, 7: { cellWidth: 16, halign: "right" }, 8: { cellWidth: 9, halign: "right" }, 9: { cellWidth: 17, halign: "right" }, 10: { cellWidth: 8, halign: "right" }, 11: { cellWidth: 16, halign: "right" } } });
  y = doc.lastAutoTable.finalY + 4; if (y > 240) { doc.addPage(); y = 15; }
  const rows = [["Taxable value", n2(t.taxable)]]; if (d.intra) rows.push(["CGST", n2(t.cgst)], ["SGST", n2(t.sgst)]); else rows.push(["IGST", n2(t.igst)]); rows.push(["Round off", n2(t.roundOff)], ["Grand total (Rs.)", n2(t.grand)]);
  doc.autoTable({ body: rows, startY: y, margin: { left: 130, right: M }, theme: "plain", styles: { fontSize: 8.5, cellPadding: 1 }, columnStyles: { 1: { halign: "right" } }, didParseCell: c => { if (c.row.index === rows.length - 1) c.cell.styles.fontStyle = "bold"; } });
  doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.text("Amount in words:", M, y + 3); doc.setFont("helvetica", "normal");
  let wy = y + 7; for (const ln of doc.splitTextToSize(`Rupees ${inWords(t.grand)} only`, 112)) { doc.text(ln, M, wy); wy += 4; }
  if (d.notes) { for (const ln of doc.splitTextToSize("Notes: " + d.notes, 112)) { doc.text(ln, M, wy); wy += 4; } }
  y = Math.max(doc.lastAutoTable.finalY, wy) + 6; if (y > 250) { doc.addPage(); y = 15; }
  if (d.type !== "DC" && (co.bankName || co.bankAccount)) { doc.setFont("helvetica", "bold"); doc.text("Bank details", M, y); doc.setFont("helvetica", "normal"); y += 4; doc.text([co.bankName, co.bankAccount ? "A/c " + co.bankAccount : "", co.bankIfsc ? "IFSC " + co.bankIfsc : "", co.bankBranch].filter(Boolean).join("  ·  "), M, y); y += 6; }
  if (co.terms) { doc.setFont("helvetica", "bold"); doc.text("Terms & conditions", M, y); doc.setFont("helvetica", "normal"); y += 4; for (const ln of doc.splitTextToSize(co.terms.replace(/\n/g, " · "), 115)) { doc.text(ln, M, y); y += 4; } }
  doc.setFont("helvetica", "bold"); doc.text(`For ${co.name}`, W - M, Math.max(y, doc.lastAutoTable.finalY + 8), { align: "right" }); doc.setFont("helvetica", "normal");
  doc.text(co.signatory || "Authorised Signatory", W - M, Math.max(y, doc.lastAutoTable.finalY + 8) + 16, { align: "right" });
  if (d.type === "QTN") { doc.setFontSize(7.5); doc.text("This is a quotation, not a tax invoice. Prices are subject to stock availability.", M, 287); }
  if (d.type === "DC") { doc.setFontSize(7.5); doc.text("Delivery challan, not a tax invoice. Goods sent for use; to be billed separately.", M, 287); }
  const pages = doc.getNumberOfPages(); for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(7); doc.text(`Page ${p} of ${pages}`, W - M, 292, { align: "right" }); }
  return doc;
}
async function downloadPdf(id) {
  const d = S.sales[id];
  try { const pdf = buildPdf(d); await save(d.no.replace(/\//g, "-") + ".pdf", new Uint8Array(pdf.output("arraybuffer"))); }
  catch (e) { msg($("globalmsg"), "bad", "Couldn't make the PDF: " + (e.message || e)); }
}

/* ---------- exports ---------- */
function salesSql(q, d8) {
  let s = `\nCREATE TABLE IF NOT EXISTS sales_documents (\n  doc_id VARCHAR(40) PRIMARY KEY, doc_no VARCHAR(40) UNIQUE, doc_type VARCHAR(4), doc_date DATE, status VARCHAR(12),\n  customer_name VARCHAR(200), customer_gstin VARCHAR(20), customer_state VARCHAR(4), customer_address VARCHAR(400),\n  taxable DECIMAL(14,2), cgst DECIMAL(14,2), sgst DECIMAL(14,2), igst DECIMAL(14,2), round_off DECIMAL(8,2), grand_total DECIMAL(14,2),\n  ref_doc_no VARCHAR(40), additional_details TEXT, notes TEXT, created_at VARCHAR(40)\n);\n\nCREATE TABLE IF NOT EXISTS sales_items (\n  doc_id VARCHAR(40) NOT NULL, line_no INT NOT NULL, dhh_product_id VARCHAR(20), purchase_invoice_no VARCHAR(40), purchase_sr_no INT,\n  material_code VARCHAR(60), description VARCHAR(400), hsn_code VARCHAR(12), batch_no VARCHAR(40), serial_no VARCHAR(40), expiry_date DATE,\n  qty DECIMAL(12,3), rate DECIMAL(14,2), disc_pct DECIMAL(6,2), taxable DECIMAL(14,2), gst_rate DECIMAL(5,2), cgst DECIMAL(14,2), sgst DECIMAL(14,2), igst DECIMAL(14,2), total DECIMAL(14,2), remarks VARCHAR(255),\n  PRIMARY KEY (doc_id, line_no), KEY idx_pid (dhh_product_id)\n);\n\n`;
  for (const [id, d] of Object.entries(S.sales)) {
    const t = d.totals || {};
    s += `REPLACE INTO sales_documents VALUES (${q(id)},${q(d.no)},${q(d.type)},${q(d.date)},${q(d.status)},${q(d.customer?.name)},${q(d.customer?.gstin)},${q(d.customer?.stateCode)},${q(d.customer?.address)},${q(t.taxable)},${q(t.cgst)},${q(t.sgst)},${q(t.igst)},${q(t.roundOff)},${q(t.grand)},${q(d.refNo)},${q(JSON.stringify(d.extra || []))},${q(d.notes)},${q(d.createdAt)});\n`;
    (d.lines || []).forEach((l, i) => { s += `REPLACE INTO sales_items VALUES (${q(id)},${i + 1},${q(l.pid)},${q(l.purchaseInvoice)},${q(l.purchaseSr)},${q(l.mat)},${q(l.desc)},${q(l.hsn)},${q(l.batch)},${q(l.serial)},${d8(l.exp)},${q(l.qty)},${q(l.rate)},${q(l.discPct)},${q(l.taxable)},${q(l.gstRate)},${q(l.cgst)},${q(l.sgst)},${q(l.igst)},${q(l.total)},${q(l.remarks)});\n`; });
  }
  return s;
}
function salesSheets() {
  const docs = Object.entries(S.sales).sort((a, b) => (a[1].date + a[1].no).localeCompare(b[1].date + b[1].no));
  const D = [["Number", "Type", "Date", "Status", "Customer", "GSTIN", "State", "Taxable", "CGST", "SGST", "IGST", "Round off", "Grand total", "Reference"],
    ...docs.map(([, d]) => [d.no, DOC_TYPES[d.type].name, dmy(d.date), d.status, d.customer?.name, d.customer?.gstin, d.customer?.stateCode, d.totals?.taxable, d.totals?.cgst, d.totals?.sgst, d.totals?.igst, d.totals?.roundOff, d.totals?.grand, d.refNo || ""])];
  const L = [["Number", "Type", "Date", "Status", "Customer", "Line", "DHH PID", "Material Code", "Description", "HSN", "Batch", "Serial", "Expiry", "QTY", "Rate", "Disc %", "Taxable", "GST %", "CGST", "SGST", "IGST", "Total", "Remarks"]];
  docs.forEach(([, d]) => (d.lines || []).forEach((l, i) => L.push([d.no, DOC_TYPES[d.type].name, dmy(d.date), d.status, d.customer?.name, i + 1, l.pid, l.mat, l.desc, l.hsn, l.batch, l.serial, l.exp, l.qty, l.rate, l.discPct, l.taxable, l.gstRate, l.cgst, l.sgst, l.igst, l.total, l.remarks || ""])));
  return [["Sales documents", D], ["Sales lines", L]];
}
