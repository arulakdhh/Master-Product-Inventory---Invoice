"use strict";
/* ===== Panels, access control, purchase orders, supply & goods, payments, admin ===== */
DOC_TYPES.RCPT = { name: "Receipt", short: "Receipt", title: "PAYMENT RECEIPT", prefix: "DHH/RCPT/", deducts: false };

const PANELS = [
  { key: "po", label: "Purchase Order", subs: [["po", "Purchase orders"]] },
  { key: "invoice", label: "Invoice", subs: [["pid", "Supplier invoices & PIDs"], ["sales-inv", "Sales tax invoices"]] },
  { key: "dispatch", label: "Dispatch", subs: [["sales-dc", "Delivery challans"]] },
  { key: "inventory", label: "Inventory", subs: [["lines", "All lines"], ["master", "Product master"], ["analysis", "Analysis"]] },
  { key: "sellorder", label: "Sell Order", subs: [["sales-so", "Orders & quotations"]] },
  { key: "supply", label: "Supply & Goods", subs: [["supply", "Goods at hospitals"]] },
  { key: "payfollow", label: "Payment Follows", subs: [["payfollow", "Outstanding & follow-ups"]] },
  { key: "payrecv", label: "Payment Received", subs: [["payrecv", "Receipts"]] },
  { key: "analytics", label: "Sales Analysis", subs: [["salesdash", "Dashboard"]] },
  { key: "studio", label: "Insight Studio", subs: [["studio", "Reports"]] },
  { key: "company", label: "Company data", subs: [["company", "Company details"], ["customers", "Customers"]] },
  { key: "admin", label: "Admin panel", subs: [["users", "Users & access"], ["export", "Export & backup"]] },
];
const VIEW_SECTIONS = { pid: ["tab-pid", "tab-invoices"], "sales-inv": ["tab-sales"], "sales-dc": ["tab-sales"], "sales-so": ["tab-sales"], lines: ["tab-table"], master: ["tab-table"], analysis: ["tab-analysis"], export: ["tab-export"],
  po: ["tab-po"], supply: ["tab-supply"], payfollow: ["tab-payfollow"], payrecv: ["tab-payrecv"], company: ["tab-company"], customers: ["tab-customers"], users: ["tab-users"], salesdash: ["tab-salesdash"], studio: ["tab-studio"], noaccess: ["tab-noaccess"] };
const ALL_SECTIONS = [...new Set(Object.values(VIEW_SECTIONS).flat())];
const FIREBASE_MODE = !!(window.FIREBASE_CONFIG && window.firebase);
Object.assign(S, { me: FIREBASE_MODE ? null : { email: "", name: "Owner", isAdmin: true, local: true, perms: {} }, users: {}, pos: {}, receipts: {}, followups: {}, panel: "invoice", poEd: null, poView: null, rcEd: null, pfOpen: null });

/* ---------- access ---------- */
function canViewPanel(k) { const m = S.me; if (!m) return false; if (m.isAdmin) return true; if (k === "admin") return false; const p = (m.perms || {})[k]; return p === "view" || p === "edit"; }
function canEditPanel(k) { const m = S.me; if (!m) return false; if (m.isAdmin) return true; if (k === "admin") return false; return (m.perms || {})[k] === "edit"; }
function panelOfView(v) { const p = PANELS.find(p => p.subs.some(s => s[0] === v)); return p ? p.key : null; }

function renderNav() {
  const nav = $("panelnav"), sub = $("subnav");
  const vis = PANELS.filter(p => canViewPanel(p.key));
  nav.innerHTML = vis.map(p => `<button role="tab" data-panel="${p.key}" aria-selected="${S.panel === p.key}">${esc(p.label)}</button>`).join("");
  const cur = PANELS.find(p => p.key === S.panel);
  sub.innerHTML = cur && canViewPanel(cur.key) && cur.subs.length > 1 ? cur.subs.map(([v, l]) => `<button data-view="${v}" aria-selected="${S.tab === v}">${esc(l)}</button>`).join("") + (canEditPanel(cur.key) ? "" : '<span class="viewonly">View only</span>')
    : (cur && canViewPanel(cur.key) && !canEditPanel(cur.key) ? '<span class="viewonly">View only</span>' : "");
}
function setView(panel, view) {
  if (!S.me) { S.panel = ""; S.tab = "noaccess"; showSections(); renderNav(); renderNoAccess(); return; }
  if (!panel || !canViewPanel(panel)) panel = (PANELS.find(p => canViewPanel(p.key)) || {}).key;
  if (!panel) { S.panel = ""; S.tab = "noaccess"; showSections(); renderNav(); renderNoAccess(); return; }
  const P = PANELS.find(p => p.key === panel); if (!view || !P.subs.some(s => s[0] === view)) view = P.subs[0][0];
  S.panel = panel; S.tab = view; S.page = 0; S.sort = null;
  S.canWrite = canEditPanel(panel) && !!S.db;
  showSections(); renderNav();
  $("fMatch").parentElement.classList.toggle("hidden", view === "master");
  render();
}
function showSections() { const on = new Set(VIEW_SECTIONS[S.tab] || []); ALL_SECTIONS.forEach(id => { const el = $(id); if (el) el.classList.toggle("hidden", !on.has(id)); }); }
function renderNoAccess() {
  const m = $("noaccessMsg");
  if (FIREBASE_MODE && S.meState === "loading") m.textContent = "Checking your access…";
  else if (S.meState === "inactive") m.innerHTML = `Your account <b>${esc(S.myEmail || "")}</b> has been switched off. Ask an admin to turn it back on.`;
  else m.innerHTML = `Your account <b>${esc(S.myEmail || "")}</b> doesn't have access to any panel yet. Ask an admin to add you in <b>Admin panel → Users &amp; access</b>.`;
}
$("panelnav").addEventListener("click", e => { const b = e.target.closest("[data-panel]"); if (b) setView(b.dataset.panel); });
$("subnav").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) setView(S.panel, b.dataset.view); });

function renderOps() {
  const v = S.tab;
  if (v === "noaccess") { renderNoAccess(); return true; }
  if (v === "po") { renderPO(); return true; }
  if (v === "supply") { renderSupply(); return true; }
  if (v === "payfollow") { renderPayFollow(); return true; }
  if (v === "payrecv") { renderPayRecv(); return true; }
  if (v === "company") { renderCompany(); return true; }
  if (v === "customers") { renderCustomers(); return true; }
  if (v === "users") { renderUsers(); return true; }
  if (v === "studio") { if (typeof renderStudio === "function") renderStudio(); return true; }
  if (v === "salesdash") { if (typeof renderSalesDash === "function") renderSalesDash(); return true; }
  return false;
}
["tab-company", "tab-customers"].forEach(id => $(id).addEventListener("click", e => salesClick(e)));

/* ---------- helpers ---------- */
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 864e5);
const pill = (cls, t) => `<span class="pill ${cls}">${t}</span>`;
function tiles(arr) { return `<div class="tiles">${arr.map(([k, v, note]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${v}</div>${note ? `<div class="note">${note}</div>` : ""}</div>`).join("")}</div>`; }
function ensureBound(el, fn) { if (!el.dataset.bound) { el.dataset.bound = "1"; el.addEventListener("click", fn); el.addEventListener("change", fn); el.addEventListener("input", fn); } }

/* ===================== PURCHASE ORDERS ===================== */
function poReceived(po) {
  const linked = new Set(po.linkedInvoices || []); const got = {};
  for (const r of S.items) if (linked.has(r.invoiceNo)) got[r.mat] = (got[r.mat] || 0) + r.qty;
  return got;
}
function poStatus(po) {
  if (po.status === "cancelled") return ["bad", "Cancelled"]; if (po.status === "closed") return ["good", "Closed"];
  const got = poReceived(po); const L = po.lines || [];
  const full = L.every(l => (got[l.mat] || 0) >= l.qty), any = L.some(l => (got[l.mat] || 0) > 0);
  return full && L.length ? ["good", "Received"] : any ? ["warn", "Part received"] : ["warn", "Pending"];
}
function supplierFor(div) {
  const last = Object.values(S.pos).filter(p => p.division === div).sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no))[0];
  if (last) return { ...last.customer };
  const inv = Object.values(S.invoices).find(i => (S.registry[i.invoiceNo] || {}).division === div);
  const d = S.divisions.find(x => x.code === div);
  const gstin = inv ? inv.supplierGstin || "" : "";
  return { name: inv ? inv.supplier : (d ? d.name + " Private Limited" : ""), address: "", gstin, stateCode: gstin.slice(0, 2) || "24", dl: "", phone: "" };
}
function newPO(id) {
  const src = id ? S.pos[id] : null; const div = src ? src.division : (S.divisions[0] || {}).code;
  S.poEd = src ? { editingId: id, division: src.division, date: src.date, expectedDate: src.expectedDate || "", sup: { ...src.customer }, lines: src.lines.map(l => ({ ...l })), notes: src.notes || "", opts: { ...src.opts } }
    : { editingId: "", division: div, date: todayIso(), expectedDate: "", sup: supplierFor(div), lines: [], notes: "", opts: { gstOn: false, gstPct: "" } };
  S.poView = null; renderPO();
}
function renderPO() {
  const el = $("tab-po"); ensureBound(el, poEvent);
  const can = canEditPanel("po") && !!S.db;
  const pos = Object.entries(S.pos).map(([id, p]) => ({ id, ...p })).sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no));
  const q = (S._poq || "").toLowerCase();
  const list = pos.filter(p => !q || [p.no, p.customer?.name, p.division, ...(p.lines || []).map(l => l.mat + " " + l.desc)].join(" ").toLowerCase().includes(q));
  const open = pos.filter(p => !["cancelled", "closed"].includes(p.status) && poStatus(p)[1] !== "Received");
  el.innerHTML = `
   <div class="panel pad"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Purchase orders</h2><button class="btn primary" data-ponew ${can ? "" : "disabled"}>New purchase order</button></div>
   <p class="note" style="margin:8px 0 0">Orders to Meril divisions. Link the supplier invoices that arrive against a PO to track what has been received.</p></div>
   ${tiles([["Open POs", inr(open.length, 0)], ["Value on order (₹)", inr(open.reduce((a, p) => a + (p.totals?.grand || 0), 0))], ["All POs", inr(pos.length, 0)]])}
   <div class="panel pad ${S.poEd ? "" : "hidden"}" id="poEditor">${S.poEd ? poEditorHtml() : ""}</div>
   <div class="panel ${S.poView ? "" : "hidden"}" id="poViewBox">${S.poView && S.pos[S.poView] ? poViewHtml(S.poView) : ""}</div>
   <div class="panel"><div class="toolbar"><input type="search" data-poq placeholder="Search PO no., supplier, material code…" value="${esc(S._poq || "")}"><span class="count">${list.length} PO${list.length === 1 ? "" : "s"}</span></div>
   <div class="tablewrap"><table><thead><tr><th>PO No.</th><th>Date</th><th>Division</th><th>Supplier</th><th class="num">Lines</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Value (₹)</th><th>Status</th><th></th></tr></thead><tbody>
   ${list.length ? list.map(p => { const got = poReceived(p); const ord = (p.lines || []).reduce((a, l) => a + l.qty, 0); const rec = (p.lines || []).reduce((a, l) => a + Math.min(l.qty, got[l.mat] || 0), 0); const [c, t] = poStatus(p);
     return `<tr><td class="code">${esc(p.no)}</td><td>${esc(dmy(p.date))}</td><td><span class="divtag">${esc(p.division)}</span></td><td>${esc(p.customer?.name || "")}</td><td class="num">${(p.lines || []).length}</td><td class="num">${inr(ord, 0)}</td><td class="num">${inr(rec, 0)}</td><td class="num">${inr(p.totals?.grand)}</td><td>${pill(c, t)}${(p.linkedInvoices || []).length ? `<div class="note">inv. ${esc(p.linkedInvoices.join(", "))}</div>` : ""}</td>
       <td><div class="row" style="flex-wrap:nowrap"><button class="btn" data-poview="${esc(p.id)}">View / PDF</button>${can && p.status === "open" && !(p.linkedInvoices || []).length ? `<button class="btn" data-poedit="${esc(p.id)}">Edit</button>` : ""}</div></td></tr>`; }).join("") : `<tr><td colspan="10" class="empty">No purchase orders yet.</td></tr>`}
   </tbody></table></div></div>`;
  const pq = el.querySelector("[data-popick]"); if (pq && S._popick) { pq.value = S._popick; renderPOPick(); pq.focus(); pq.setSelectionRange(pq.value.length, pq.value.length); }
}
function poEditorHtml() {
  const E = S.poEd; const intra = isIntra(E.sup); const tot = calcDoc(E.lines, intra, "PO", E.opts);
  return `<div class="row" style="justify-content:space-between"><h2 style="margin:0">${E.editingId ? "Edit " + esc(S.pos[E.editingId].no) : "New purchase order"}</h2><span class="note">Number is given when you save</span></div>
   <div class="grid2" style="margin-top:10px"><div class="kvform">
     <label>Division</label><select data-pof="division">${S.divisions.map(d => `<option value="${esc(d.code)}" ${E.division === d.code ? "selected" : ""}>${esc(d.code)} · ${esc(d.name)}</option>`).join("")}</select>
     <label>Supplier name</label><input type="text" data-pos="name" value="${esc(E.sup.name)}">
     <label>Supplier address</label><textarea data-pos="address" rows="2" style="min-height:48px;font-family:var(--font-body);font-size:13px">${esc(E.sup.address || "")}</textarea>
     <label>Supplier GSTIN</label><input type="text" data-pos="gstin" value="${esc(E.sup.gstin || "")}" maxlength="15">
   </div><div class="kvform">
     <label>PO date</label><input type="date" data-pof="date" value="${esc(E.date)}">
     <label>Expected delivery</label><input type="date" data-pof="expectedDate" value="${esc(E.expectedDate)}">
     <label>Notes</label><textarea data-pof="notes" rows="2" style="min-height:48px;font-family:var(--font-body);font-size:13px">${esc(E.notes)}</textarea>
     <label>GST</label><div class="row"><label class="chk"><input type="checkbox" data-poo="gstOn" ${E.opts.gstOn ? "checked" : ""}> Add GST</label><input type="number" min="0" max="28" step="0.01" data-poo="gstPct" value="${esc(E.opts.gstPct)}" placeholder="e.g. 5" style="width:80px" ${E.opts.gstOn ? "" : "disabled"}> % <span class="note">${E.opts.gstOn ? (intra ? "CGST + SGST" : "IGST") : ""}</span></div>
   </div></div>
   <div style="margin-top:12px;display:grid;gap:6px"><label><b>Add product</b> <span class="note">search the product master by code or description</span></label>
     <input type="search" data-popick placeholder="e.g. MT-PS73, LUSC-35, femoral stem…" autocomplete="off"><div id="popickres"></div>
     <div class="row"><input type="text" data-pofree="mat" placeholder="Other item: material code" style="width:170px"><input type="text" data-pofree="desc" placeholder="Description" style="flex:1"><button class="btn" data-poaddfree>Add item</button></div></div>
   <div class="tablewrap" style="margin-top:10px;max-height:none"><table class="edtable"><thead><tr><th>#</th><th>Material Code</th><th>Description</th><th>HSN</th><th class="num">QTY</th><th class="num">Rate (₹)</th><th class="num">Amount</th><th></th></tr></thead><tbody>
   ${E.lines.length ? E.lines.map((l, i) => `<tr><td>${i + 1}</td><td class="code">${esc(l.mat)}</td><td class="desc">${esc(l.desc)}</td><td><input type="text" data-pol="hsn" data-i="${i}" value="${esc(l.hsn || "")}" style="width:90px"></td>
     <td class="num"><input type="number" min="1" step="1" data-pol="qty" data-i="${i}" value="${l.qty}" style="width:70px;text-align:right"></td><td class="num"><input type="number" min="0" step="0.01" data-pol="rate" data-i="${i}" value="${l.rate}" style="width:100px;text-align:right"></td>
     <td class="num">${inr(r2(l.qty * l.rate))}</td><td><button class="btn" data-podel="${i}">✕</button></td></tr>`).join("") : `<tr><td colspan="8" class="empty">No items yet.</td></tr>`}</tbody></table></div>
   <div class="row" style="justify-content:space-between;margin-top:10px;align-items:flex-start"><div class="hidden" id="poMsg"></div>
     <dl class="kv" style="margin-left:auto;text-align:right"><dt>Gross value</dt><dd>${inr(tot.amount)}</dd>${E.opts.gstOn ? (intra ? `<dt>CGST</dt><dd>${inr(tot.cgst)}</dd><dt>SGST</dt><dd>${inr(tot.sgst)}</dd>` : `<dt>IGST</dt><dd>${inr(tot.igst)}</dd>`) : ""}<dt><b>Total</b></dt><dd><b>₹ ${inr(tot.grand)}</b></dd></dl></div>
   <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn" data-pocancel>Discard</button><button class="btn primary" data-posave ${E.lines.length ? "" : "disabled"}>${E.editingId ? "Save changes" : "Save purchase order"}</button></div>`;
}
function renderPOPick() {
  const q = (S._popick || "").trim().toLowerCase(); const out = $("popickres"); if (!out) return; if (!q) { out.innerHTML = ""; return; }
  const res = S.master.filter(m => q.split(/\s+/).every(w => [m.mat, m.desc, m.hsn].join(" ").toLowerCase().includes(w))).slice(0, 20);
  out.innerHTML = res.length ? `<div class="tablewrap" style="max-height:240px"><table><thead><tr><th>Material Code</th><th>Description</th><th class="num">Last rate</th><th class="num">In stock</th><th></th></tr></thead><tbody>${res.map(m => `<tr><td class="code">${esc(m.mat)}</td><td class="desc">${esc(m.desc)}</td><td class="num">${inr(m.rate)}</td><td class="num">${inr(m.availQty, 0)}</td><td><button class="btn" data-poadd="${esc(m.mat)}">Add</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="note">No product matches. Use "Other item" below.</div>`;
}
function poViewHtml(id) {
  const p = S.pos[id]; const got = poReceived(p); const [c, t] = poStatus(p); const can = canEditPanel("po") && !!S.db;
  const linkable = Object.values(S.invoices).filter(i => !Object.values(S.pos).some(o => o.status !== "cancelled" && (o.linkedInvoices || []).includes(i.invoiceNo))).sort((a, b) => a.invoiceNo < b.invoiceNo ? 1 : -1);
  return `<div class="toolbar"><b>Purchase order ${esc(p.no)}</b> ${pill(c, t)}<span class="count"></span><button class="btn primary" data-popdf="${esc(id)}">Download PDF</button><button class="btn" data-poclose>Close</button></div>
   <div class="pad" style="display:grid;gap:12px">
   <dl class="kv"><dt>Supplier</dt><dd>${esc(p.customer?.name || "")} ${p.customer?.gstin ? `<span class="note">GSTIN ${esc(p.customer.gstin)}</span>` : ""}</dd><dt>Date</dt><dd>${esc(dmy(p.date))}${p.expectedDate ? ` · expected ${esc(dmy(p.expectedDate))}` : ""}</dd>${p.notes ? `<dt>Notes</dt><dd>${esc(p.notes)}</dd>` : ""}</dl>
   <div class="tablewrap" style="max-height:none"><table><thead><tr><th>#</th><th>Material Code</th><th>Description</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Pending</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
   ${(p.lines || []).map((l, i) => { const g = got[l.mat] || 0; const pend = Math.max(0, l.qty - g); return `<tr><td>${i + 1}</td><td class="code">${esc(l.mat)}</td><td class="desc">${esc(l.desc)}</td><td class="num">${inr(l.qty, 0)}</td><td class="num">${inr(g, 0)}</td><td class="num">${pend ? pill("warn", inr(pend, 0)) : pill("good", "0")}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(l.amount)}</td></tr>`; }).join("")}</tbody></table></div>
   <div><b>Supplier invoices received against this PO</b>
     <div class="row" style="margin-top:6px">${(p.linkedInvoices || []).map(no => `<span class="divtag">${esc(no)} ${can && p.status === "open" ? `<a href="#" data-pounlink="${esc(id)}|${esc(no)}" style="color:var(--bad);text-decoration:none" aria-label="Unlink">✕</a>` : ""}</span>`).join(" ") || '<span class="note">None linked yet.</span>'}</div>
     ${can && p.status === "open" ? `<div class="row" style="margin-top:8px"><select data-polinksel><option value="">— choose a supplier invoice —</option>${linkable.map(i => `<option value="${esc(i.invoiceNo)}">${esc(i.invoiceNo)} · ${esc(i.invoiceDate)} · ${esc((S.registry[i.invoiceNo] || {}).division || "")}</option>`).join("")}</select><button class="btn" data-polink="${esc(id)}">Link invoice</button></div>` : ""}</div>
   ${can && p.status === "open" ? `<div class="row"><button class="btn" data-postatus="${esc(id)}|closed">Mark as closed</button><button class="btn danger" data-postatus="${esc(id)}|cancelled">Cancel PO</button><span class="note" id="poViewMsg"></span></div>` : ""}
   </div>`;
}
async function poEvent(e) {
  const t = e.target; const E = S.poEd;
  if (e.type === "input") {
    if (t.matches("[data-poq]")) { S._poq = t.value; const pos = t.selectionStart; renderPO(); const n = $("tab-po").querySelector("[data-poq]"); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (t.matches("[data-popick]")) { S._popick = t.value; return renderPOPick(); }
    if (!E) return;
    if (t.dataset.pos) { E.sup[t.dataset.pos] = t.value; if (t.dataset.pos === "gstin" && STATES[t.value.slice(0, 2)]) E.sup.stateCode = t.value.slice(0, 2); return; }
    if (t.dataset.pof && t.dataset.pof !== "division") { E[t.dataset.pof] = t.value; return; }
    if (t.dataset.pol) { const l = E.lines[+t.dataset.i]; l[t.dataset.pol] = t.dataset.pol === "hsn" ? t.value : (parseFloat(t.value) || 0); return; }
    if (t.dataset.poo === "gstPct") { E.opts.gstPct = t.value === "" ? "" : +t.value; return; }
    return;
  }
  if (e.type === "change") {
    if (!E) return;
    if (t.dataset.pof === "division") { E.division = t.value; if (!E.editingId) E.sup = supplierFor(t.value); return renderPO(); }
    if (t.dataset.poo === "gstOn") { E.opts.gstOn = t.checked; return renderPO(); }
    if (t.dataset.pol || t.dataset.poo || t.dataset.pos === "gstin") return renderPO();
    return;
  }
  const b = t.closest("button,a[data-pounlink]"); if (!b) return;
  if (b.hasAttribute("data-ponew")) return newPO();
  if (b.dataset.poedit) return newPO(b.dataset.poedit);
  if (b.hasAttribute("data-pocancel")) { S.poEd = null; S._popick = ""; return renderPO(); }
  if (b.dataset.poadd) { const m = S.master.find(x => x.mat === b.dataset.poadd); if (E.lines.some(l => l.mat === m.mat)) return; E.lines.push({ mat: m.mat, desc: m.desc, hsn: m.hsn, uom: m.uom, qty: 1, rate: m.rate || 0, mrp: m.mrp || 0, discPct: 0, gstRate: 0 }); return renderPO(); }
  if (b.hasAttribute("data-poaddfree")) { const box = $("tab-po"); const mat = box.querySelector('[data-pofree="mat"]').value.trim(), desc = box.querySelector('[data-pofree="desc"]').value.trim(); if (!mat && !desc) return; E.lines.push({ mat: mat || "—", desc: desc || mat, hsn: "", uom: "NOS", qty: 1, rate: 0, mrp: 0, discPct: 0, gstRate: 0 }); return renderPO(); }
  if (b.dataset.podel) { E.lines.splice(+b.dataset.podel, 1); return renderPO(); }
  if (b.hasAttribute("data-posave")) return savePO(b);
  if (b.dataset.poview) { S.poView = b.dataset.poview; S.poEd = null; renderPO(); $("poViewBox").scrollIntoView({ block: "start" }); return; }
  if (b.hasAttribute("data-poclose")) { S.poView = null; return renderPO(); }
  if (b.dataset.popdf) { const p = S.pos[b.dataset.popdf]; try { const pdf = buildPdf(p); await save(p.no.replace(/\//g, "-") + ".pdf", new Uint8Array(pdf.output("arraybuffer"))); } catch (err) { msg($("globalmsg"), "bad", "Couldn't make the PDF: " + (err.message || err)); } return; }
  if (b.dataset.polink) { const no = $("tab-po").querySelector("[data-polinksel]").value; if (!no) return; const p = S.pos[b.dataset.polink]; await S.db.doc(`purchaseOrders/${b.dataset.polink}`).set({ ...p, linkedInvoices: [...(p.linkedInvoices || []), no] }); return; }
  if (b.dataset.pounlink) { e.preventDefault(); const [id, no] = b.dataset.pounlink.split("|"); const p = S.pos[id]; await S.db.doc(`purchaseOrders/${id}`).set({ ...p, linkedInvoices: (p.linkedInvoices || []).filter(x => x !== no) }); return; }
  if (b.dataset.postatus) { const [id, st] = b.dataset.postatus.split("|"); if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again to confirm"; return; } await S.db.doc(`purchaseOrders/${id}`).set({ ...S.pos[id], status: st, [st + "At"]: new Date().toISOString() }); return; }
}
async function savePO(btn) {
  const E = S.poEd; const m = t => { const el = $("poMsg"); el.className = "msg bad"; el.textContent = t; };
  if (!E.sup.name.trim()) return m("Enter the supplier name.");
  if (E.lines.some(l => !(l.qty > 0))) return m("Every item needs a quantity.");
  if (E.opts.gstOn && !(+E.opts.gstPct > 0)) return m("GST is ticked: enter the GST %, or untick it.");
  btn.disabled = true;
  try {
    const sup = { ...E.sup, stateCode: custState(E.sup) || "24" }; sup.stateName = STATES[sup.stateCode] || ""; const intra = isIntra(sup); const opts = { ...E.opts };
    const lines = E.lines.map(l => ({ ...l, ...calcLine(l, intra, opts) })); const totals = calcDoc(E.lines, intra, "PO", opts);
    const base = { type: "PO", division: E.division, date: E.date, expectedDate: E.expectedDate, customer: sup, intra, opts, lines, totals, notes: E.notes, extra: [], company: { ...S.company } };
    let id;
    if (E.editingId) { id = E.editingId; await S.db.doc(`purchaseOrders/${id}`).set({ ...S.pos[id], ...base, updatedAt: new Date().toISOString() }); }
    else { const fy = fyOf(E.date); const seq = await nextNumber("PO", fy); id = `PO_${fy}_${String(seq).padStart(4, "0")}`;
      await S.db.doc(`purchaseOrders/${id}`).set({ ...base, no: docNo("PO", fy, seq), fy, seq, status: "open", linkedInvoices: [], createdAt: new Date().toISOString(), createdBy: S.myEmail || "" }); }
    S.poEd = null; S._popick = ""; S.poView = id; msg($("globalmsg"), "good", "Purchase order saved."); renderPO();
  } catch (err) { btn.disabled = false; m("Couldn't save: " + (err.message || err.code)); }
}

/* ===================== SUPPLY & GOODS ===================== */
function renderSupply() {
  const el = $("tab-supply"); ensureBound(el, supplyEvent);
  const now = todayIso(); const rows = [];
  for (const [id, d] of Object.entries(S.sales)) { if (d.type !== "DC" || d.status === "cancelled") continue; (d.lines || []).forEach((l, i) => { const p = dcPending(l); if (p > 0) rows.push({ id, d, l, i, p, days: daysBetween(d.date, now), value: r2(p * (l.rate || l.mrp || 0)) }); }); }
  const byCust = {}; rows.forEach(r => { const k = r.d.customerId || r.d.customer?.name; (byCust[k] ||= { name: r.d.customer?.name || "", rows: [], dcs: new Set() }).rows.push(r); byCust[k].dcs.add(r.id); });
  const q = (S._supq || "").toLowerCase(); const custs = Object.values(byCust).sort((a, b) => b.rows.reduce((x, r) => x + r.value, 0) - a.rows.reduce((x, r) => x + r.value, 0));
  const canBill = canEditPanel("invoice") && !!S.db, canRet = (canEditPanel("supply") || canEditPanel("dispatch")) && !!S.db;
  el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 6px">Goods at hospitals</h2><p class="note" style="margin:0">Everything sent on delivery challans that hasn't been billed or returned yet. After a surgery, bill the items used and return the unused ones to stock.</p></div>
   ${tiles([["Hospitals holding goods", inr(custs.length, 0)], ["Items at hospitals", inr(rows.reduce((a, r) => a + r.p, 0), 0)], ["Value at hospitals (₹)", inr(rows.reduce((a, r) => a + r.value, 0))], ["Oldest challan", rows.length ? Math.max(...rows.map(r => r.days)) + " days" : "—"]])}
   <div class="panel hidden retbox"></div>
   <div class="panel"><div class="toolbar"><input type="search" data-supq placeholder="Search hospital, PID, challan no., batch…" value="${esc(S._supq || "")}"><span class="count">${rows.length} line${rows.length === 1 ? "" : "s"} at ${custs.length} hospital${custs.length === 1 ? "" : "s"}</span></div>
   ${custs.length ? custs.map(c => { const R = c.rows.filter(r => !q || [c.name, r.l.pid, r.d.no, r.l.batch, r.l.serial, r.l.desc].join(" ").toLowerCase().includes(q)); if (!R.length) return "";
     return `<div style="border-top:1px solid var(--line)"><div class="toolbar" style="background:var(--bg)"><b>${esc(c.name)}</b><span class="note">${R.reduce((a, r) => a + r.p, 0)} items · ₹ ${inr(R.reduce((a, r) => a + r.value, 0))}</span></div>
     <div class="tablewrap" style="max-height:none"><table><thead><tr><th>Challan</th><th>Date</th><th class="num">Days out</th><th>PID</th><th>Description</th><th>Batch / Serial</th><th>Expiry</th><th class="num">At hospital</th><th class="num">Value (₹)</th></tr></thead><tbody>
     ${R.map(r => `<tr><td class="code">${esc(r.d.no)}</td><td>${esc(dmy(r.d.date))}</td><td class="num">${r.days > 30 ? pill("bad", r.days) : r.days > 14 ? pill("warn", r.days) : r.days}</td><td class="dhh">${esc(r.l.pid)}</td><td class="desc">${esc(r.l.desc)}</td><td class="code">${esc(r.l.batch)}${r.l.serial ? "<br>" + esc(r.l.serial) : ""}</td><td>${esc(r.l.exp || "")}</td><td class="num">${inr(r.p, 0)}</td><td class="num">${inr(r.value)}</td></tr>`).join("")}</tbody></table></div>
     <div class="row" style="padding:8px 12px">${[...c.dcs].map(id => `<span class="note">${esc(S.sales[id].no)}:</span>${canBill ? `<button class="btn" data-supbill="${esc(id)}">Bill used items →</button>` : ""}${canRet ? `<button class="btn" data-ret="${esc(id)}">Return unused</button>` : ""}`).join(" ")}</div></div>`; }).join("")
     : `<div class="empty">No goods at hospitals. Delivery challans from Dispatch show here until they're billed or returned.</div>`}</div>`;
}
function supplyEvent(e) {
  const t = e.target;
  if (e.type === "input" && t.matches("[data-supq]")) { S._supq = t.value; const p = t.selectionStart; renderSupply(); const n = $("tab-supply").querySelector("[data-supq]"); n.focus(); n.setSelectionRange(p, p); return; }
  if (e.type !== "click") return;
  const b = t.closest("[data-supbill]"); if (b) { setView("invoice", "sales-inv"); newDoc("INV", b.dataset.supbill); }
}

/* ===================== PAYMENTS ===================== */
function invoiceReceived(invId) { const dd = S.sales[invId]; if (dd && dd.paidOutside) return r2(dd.totals?.grand || 0); let s = 0; for (const r of Object.values(S.receipts)) { if (r.status === "cancelled") continue; for (const a of r.allocations || []) if (a.invId === invId) s += a.amount; } return r2(s); }
function invoiceBalance(id) { const d = S.sales[id]; return d ? r2((d.totals?.grand || 0) - invoiceReceived(id)) : 0; }
function invDue(d) { if (d.dueDate) return d.dueDate; const c = S.customers[d.customerId]; const x = new Date(d.date); x.setDate(x.getDate() + (c && c.creditDays != null ? +c.creditDays : 30)); return x.toISOString().slice(0, 10); }
function invoicePayPill(d) {
  if (d.status === "cancelled") return pill("bad", "Cancelled");
  const id = Object.keys(S.sales).find(k => S.sales[k] === d) || d.id; const rec = invoiceReceived(id), bal = r2((d.totals?.grand || 0) - rec);
  if (bal <= 0) return pill("good", "Paid");
  const od = daysBetween(invDue(d), todayIso());
  return (rec > 0 ? pill("warn", `Part paid · ₹${inr(bal, 0)} due`) : pill("warn", "Unpaid")) + (od > 0 ? " " + pill("bad", `${od}d overdue`) : "");
}
function openInvoices(custId) {
  const out = [];
  for (const [id, d] of Object.entries(S.sales)) { if (d.type !== "INV" || d.status === "cancelled") continue; if (custId && d.customerId !== custId) continue; const bal = invoiceBalance(id); if (bal > 0.004) out.push({ id, d, bal, rec: invoiceReceived(id), due: invDue(d) }); }
  return out.sort((a, b) => (a.d.date + a.d.no).localeCompare(b.d.date + b.d.no));
}
function renderPayFollow() {
  const el = $("tab-payfollow"); ensureBound(el, payFollowEvent);
  const today = todayIso(); const all = openInvoices();
  all.forEach(x => { x.od = daysBetween(x.due, today); const f = S.followups[x.id]; x.f = f; x.next = f?.nextDate || ""; x.last = f?.notes?.length ? f.notes[f.notes.length - 1] : null; });
  const tot = all.reduce((a, x) => a + x.bal, 0), od = all.filter(x => x.od > 0), soon = all.filter(x => x.od <= 0 && x.od > -7), fu = all.filter(x => x.next && x.next <= today);
  const q = (S._pfq || "").toLowerCase(); const mode = S._pfmode || "inv"; const flt = S._pff || "";
  let L = all.filter(x => !q || [x.d.no, x.d.customer?.name].join(" ").toLowerCase().includes(q));
  if (flt === "od") L = L.filter(x => x.od > 0); if (flt === "fu") L = L.filter(x => x.next && x.next <= today);
  L.sort((a, b) => b.od - a.od);
  const canF = canEditPanel("payfollow") && !!S.db, canR = canEditPanel("payrecv") && !!S.db;
  let body;
  if (mode === "cust") {
    const g = {}; L.forEach(x => { const k = x.d.customerId || x.d.customer?.name; const e = g[k] ||= { name: x.d.customer?.name, n: 0, bal: 0, od: 0, oldest: 0, id: x.d.customerId }; e.n++; e.bal += x.bal; if (x.od > 0) e.od += x.bal; e.oldest = Math.max(e.oldest, x.od); });
    body = `<table><thead><tr><th>Customer</th><th class="num">Invoices</th><th class="num">Outstanding (₹)</th><th class="num">Overdue (₹)</th><th class="num">Oldest overdue</th><th></th></tr></thead><tbody>${Object.values(g).sort((a, b) => b.bal - a.bal).map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.n}</td><td class="num">${inr(c.bal)}</td><td class="num">${c.od ? inr(c.od) : "—"}</td><td class="num">${c.oldest > 0 ? pill("bad", c.oldest + " days") : "—"}</td><td>${canR ? `<button class="btn" data-pfpay="${esc(c.id || "")}|">Record payment →</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nothing outstanding.</td></tr>`}</tbody></table>`;
  } else {
    body = `<table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total (₹)</th><th class="num">Received</th><th class="num">Balance</th><th>Due</th><th>Status</th><th>Last follow-up</th><th>Next follow-up</th><th></th></tr></thead><tbody>
    ${L.map(x => `<tr><td class="code">${esc(x.d.no)}</td><td>${esc(dmy(x.d.date))}</td><td>${esc(x.d.customer?.name || "")}</td><td class="num">${inr(x.d.totals?.grand)}</td><td class="num">${inr(x.rec)}</td><td class="num"><b>${inr(x.bal)}</b></td><td>${esc(dmy(x.due))}</td>
      <td>${x.od > 0 ? pill("bad", x.od + " days overdue") : x.od > -7 ? pill("warn", `due in ${-x.od} days`) : pill("good", "Not due")}</td>
      <td class="desc" style="min-width:160px">${x.last ? `${esc(x.last.text)}<div class="note">${esc(dmy(x.last.at.slice(0, 10)))}${x.last.by ? " · " + esc(x.last.by) : ""}${x.last.promisedDate ? " · promised " + esc(dmy(x.last.promisedDate)) : ""}</div>` : '<span class="note">—</span>'}</td>
      <td>${x.next ? (x.next <= today ? pill("bad", dmy(x.next)) : esc(dmy(x.next))) : "—"}</td>
      <td><div class="row" style="flex-wrap:nowrap">${canF ? `<button class="btn" data-pfnote="${esc(x.id)}">Add follow-up</button>` : ""}${canR ? `<button class="btn" data-pfpay="${esc(x.d.customerId || "")}|${esc(x.id)}">Record payment →</button>` : ""}</div></td></tr>
      ${S.pfOpen === x.id ? `<tr><td colspan="11" style="background:var(--bg)"><div class="row"><input type="text" data-pftext placeholder="What was discussed, e.g. 'Spoke to accounts, cheque next week'" style="flex:1;min-width:240px"><label class="note">Next follow-up</label><input type="date" data-pfnext><label class="note">Promised payment date</label><input type="date" data-pfprom><button class="btn primary" data-pfsave="${esc(x.id)}">Save</button><button class="btn" data-pfclose>Cancel</button></div>
        ${(x.f?.notes || []).length ? `<div class="note" style="margin-top:6px">${x.f.notes.slice().reverse().map(n => `${esc(dmy(n.at.slice(0, 10)))}${n.by ? " · " + esc(n.by) : ""}: ${esc(n.text)}`).join("<br>")}</div>` : ""}</td></tr>` : ""}`).join("") || `<tr><td colspan="11" class="empty">Nothing outstanding.</td></tr>`}</tbody></table>`;
  }
  el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 6px">Payment follow-up</h2><p class="note" style="margin:0">Every tax invoice not yet fully paid. Due date = invoice date + the customer's credit days. Record calls and promises here; record money in Payment Received.</p></div>
   ${tiles([["Outstanding (₹)", inr(tot)], ["Overdue (₹)", inr(od.reduce((a, x) => a + x.bal, 0)), `${od.length} invoice${od.length === 1 ? "" : "s"}`], ["Due in 7 days (₹)", inr(soon.reduce((a, x) => a + x.bal, 0))], ["Follow-ups due today", inr(fu.length, 0)]])}
   <div class="panel"><div class="toolbar"><input type="search" data-pfq placeholder="Search invoice or customer…" value="${esc(S._pfq || "")}">
     <select data-pfmode><option value="inv" ${mode === "inv" ? "selected" : ""}>By invoice</option><option value="cust" ${mode === "cust" ? "selected" : ""}>By customer</option></select>
     <select data-pff><option value="">All outstanding</option><option value="od" ${flt === "od" ? "selected" : ""}>Overdue only</option><option value="fu" ${flt === "fu" ? "selected" : ""}>Follow-up due</option></select><span class="count">${L.length} invoice${L.length === 1 ? "" : "s"}</span></div>
   <div class="tablewrap">${body}</div></div>`;
}
async function payFollowEvent(e) {
  const t = e.target;
  if (e.type === "input" && t.matches("[data-pfq]")) { S._pfq = t.value; const p = t.selectionStart; renderPayFollow(); const n = $("tab-payfollow").querySelector("[data-pfq]"); n.focus(); n.setSelectionRange(p, p); return; }
  if (e.type === "change" && t.matches("[data-pfmode]")) { S._pfmode = t.value; return renderPayFollow(); }
  if (e.type === "change" && t.matches("[data-pff]")) { S._pff = t.value; return renderPayFollow(); }
  if (e.type !== "click") return; const b = t.closest("button"); if (!b) return;
  if (b.dataset.pfnote) { S.pfOpen = b.dataset.pfnote; renderPayFollow(); $("tab-payfollow").querySelector("[data-pftext]").focus(); return; }
  if (b.hasAttribute("data-pfclose")) { S.pfOpen = null; return renderPayFollow(); }
  if (b.dataset.pfsave) { const box = $("tab-payfollow"); const text = box.querySelector("[data-pftext]").value.trim(), next = box.querySelector("[data-pfnext]").value, prom = box.querySelector("[data-pfprom]").value; if (!text && !next) return;
    const id = b.dataset.pfsave; const d = S.sales[id]; const f = S.followups[id] || { invoiceId: id, invoiceNo: d.no, notes: [] };
    b.disabled = true; try { await S.db.doc(`followups/${id}`).set({ ...f, notes: [...(f.notes || []), { at: new Date().toISOString(), by: S.myEmail || S.me?.name || "", text, nextDate: next, promisedDate: prom }], nextDate: next || "", promisedDate: prom || f.promisedDate || "" }); S.pfOpen = null; }
    catch (err) { b.disabled = false; msg($("globalmsg"), "bad", "Couldn't save: " + (err.message || err.code)); } return; }
  if (b.dataset.pfpay != null) { const [cid, inv] = b.dataset.pfpay.split("|"); setView("payrecv"); newReceipt(cid, inv); }
}
/* --- receipts --- */
const PAY_MODES = ["NEFT / RTGS", "UPI", "Cheque", "Cash", "Card", "DD", "Other"];
function newReceipt(custId, invId, editId) {
  if (editId) { const r = S.receipts[editId]; S.rcEd = { editingId: editId, date: r.date, customerId: r.customerId, mode: r.mode, ref: r.ref || "", bank: r.bank || "", amount: r.amount, notes: r.notes || "", alloc: Object.fromEntries((r.allocations || []).map(a => [a.invId, a.amount])) }; }
  else { S.rcEd = { editingId: "", date: todayIso(), customerId: custId || "", mode: "NEFT / RTGS", ref: "", bank: "", amount: "", notes: "", alloc: {} };
    if (invId) { S.rcEd.amount = invoiceBalance(invId); S.rcEd.alloc[invId] = invoiceBalance(invId); } }
  renderPayRecv();
}
function rcOpenFor(E) {
  const L = openInvoices(E.customerId).map(x => ({ ...x }));
  if (E.editingId) { const r = S.receipts[E.editingId]; for (const a of r.allocations || []) { const x = L.find(y => y.id === a.invId); if (x) x.bal = r2(x.bal + a.amount); else if (S.sales[a.invId]) L.push({ id: a.invId, d: S.sales[a.invId], bal: a.amount, due: invDue(S.sales[a.invId]) }); } }
  return L.sort((a, b) => (a.d.date + a.d.no).localeCompare(b.d.date + b.d.no));
}
function renderPayRecv() {
  const el = $("tab-payrecv"); ensureBound(el, payRecvEvent);
  const can = canEditPanel("payrecv") && !!S.db; const E = S.rcEd;
  const recs = Object.entries(S.receipts).map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no));
  const q = (S._rcq || "").toLowerCase(); const L = recs.filter(r => !q || [r.no, r.customer?.name, r.ref, r.mode, ...(r.allocations || []).map(a => a.invNo)].join(" ").toLowerCase().includes(q));
  const month = todayIso().slice(0, 7); const live = recs.filter(r => r.status !== "cancelled");
  let ed = "";
  if (E) {
    const custs = Object.entries(S.customers).sort((a, b) => a[1].name.localeCompare(b[1].name)); const open = E.customerId ? rcOpenFor(E) : [];
    const allocSum = r2(Object.values(E.alloc).reduce((a, v) => a + (+v || 0), 0)); const unalloc = r2((+E.amount || 0) - allocSum);
    ed = `<div class="panel pad" style="display:grid;gap:10px"><h2 style="margin:0">${E.editingId ? "Edit allocation: " + esc(S.receipts[E.editingId].no) : "New receipt"}</h2>
     <div class="grid2"><div class="kvform">
       <label>Date</label><input type="date" data-rcf="date" value="${esc(E.date)}" ${E.editingId ? "disabled" : ""}>
       <label>Customer</label><select data-rcf="customerId" ${E.editingId ? "disabled" : ""}><option value="">— choose —</option>${custs.map(([id, c]) => { const ob = openInvoices(id).reduce((a, x) => a + x.bal, 0); return `<option value="${esc(id)}" ${E.customerId === id ? "selected" : ""}>${esc(c.name)}${ob > 0 ? ` · ₹${inr(ob, 0)} due` : ""}</option>`; }).join("")}</select>
       <label>Amount received (₹)</label><input type="number" min="0" step="0.01" data-rcf="amount" value="${esc(E.amount)}" ${E.editingId ? "disabled" : ""}>
     </div><div class="kvform">
       <label>Mode</label><select data-rcf="mode" ${E.editingId ? "disabled" : ""}>${PAY_MODES.map(m => `<option ${E.mode === m ? "selected" : ""}>${m}</option>`).join("")}</select>
       <label>Reference no.</label><input type="text" data-rcf="ref" value="${esc(E.ref)}" placeholder="UTR / cheque no. / UPI ref" ${E.editingId ? "disabled" : ""}>
       <label>Bank / notes</label><input type="text" data-rcf="notes" value="${esc(E.notes)}">
     </div></div>
     ${E.customerId ? `<div><div class="row" style="justify-content:space-between"><b>Apply to invoices</b><button class="btn" data-rcauto>Auto-allocate (oldest first)</button></div>
      <div class="tablewrap" style="max-height:none;margin-top:6px"><table><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="num">Balance (₹)</th><th class="num">Apply now (₹)</th></tr></thead><tbody>
      ${open.length ? open.map(x => `<tr><td class="code">${esc(x.d.no)}</td><td>${esc(dmy(x.d.date))}</td><td>${esc(dmy(x.due))}</td><td class="num">${inr(x.bal)}</td><td class="num"><input type="number" min="0" max="${x.bal}" step="0.01" data-rcal="${esc(x.id)}" value="${E.alloc[x.id] ?? ""}" style="width:120px;text-align:right"></td></tr>`).join("") : `<tr><td colspan="5" class="empty">No unpaid invoices for this customer. The whole amount is kept as an advance.</td></tr>`}</tbody></table></div>
      <div class="row" style="justify-content:flex-end;margin-top:6px"><span>Applied ₹ ${inr(allocSum)}</span><span class="${unalloc < -0.004 ? "pill bad" : "note"}">${unalloc < -0.004 ? "More applied than received" : `Advance / unapplied ₹ ${inr(unalloc)}`}</span></div></div>` : ""}
     <div class="row" style="justify-content:flex-end"><span class="note" id="rcMsg"></span><button class="btn" data-rccancel>Discard</button><button class="btn primary" data-rcsave>${E.editingId ? "Save allocation" : "Save receipt"}</button></div></div>`;
  }
  el.innerHTML = `<div class="panel pad"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Payments received</h2><button class="btn primary" data-rcnew ${can ? "" : "disabled"}>New receipt</button></div>
   <p class="note" style="margin:8px 0 0">Record each payment and apply it to one or more invoices. Part payments are fine. Anything not applied stays as an advance you can apply later.</p></div>
   ${tiles([["Received this month (₹)", inr(live.filter(r => r.date.startsWith(month)).reduce((a, r) => a + r.amount, 0))], ["Receipts", inr(live.length, 0)], ["Advances not applied (₹)", inr(live.reduce((a, r) => a + (r.unallocated || 0), 0))], ["Outstanding on invoices (₹)", inr(openInvoices().reduce((a, x) => a + x.bal, 0))]])}
   ${ed}
   <div class="panel"><div class="toolbar"><input type="search" data-rcq placeholder="Search receipt, customer, reference, invoice…" value="${esc(S._rcq || "")}"><span class="count">${L.length} receipt${L.length === 1 ? "" : "s"}</span></div>
   <div class="tablewrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Mode</th><th>Reference</th><th class="num">Amount (₹)</th><th>Applied to</th><th class="num">Advance</th><th>Status</th><th></th></tr></thead><tbody>
   ${L.length ? L.map(r => `<tr><td class="code">${esc(r.no)}</td><td>${esc(dmy(r.date))}</td><td>${esc(r.customer?.name || "")}</td><td>${esc(r.mode)}</td><td class="code">${esc(r.ref || "")}</td><td class="num">${inr(r.amount)}</td><td>${(r.allocations || []).map(a => `${esc(a.invNo)} <span class="note">₹${inr(a.amount)}</span>`).join("<br>") || "—"}</td><td class="num">${r.unallocated > 0 ? inr(r.unallocated) : "—"}</td><td>${r.status === "cancelled" ? pill("bad", "Cancelled") : pill("good", "Received")}</td>
     <td><div class="row" style="flex-wrap:nowrap"><button class="btn" data-rcpdf="${esc(r.id)}">PDF</button>${can && r.status !== "cancelled" ? `<button class="btn" data-rcedit="${esc(r.id)}">Apply / edit</button><button class="btn danger" data-rccancelrc="${esc(r.id)}">Cancel</button>` : ""}</div></td></tr>`).join("") : `<tr><td colspan="10" class="empty">No receipts yet.</td></tr>`}
   </tbody></table></div></div>`;
}
async function payRecvEvent(e) {
  const t = e.target; const E = S.rcEd;
  if (e.type === "input") {
    if (t.matches("[data-rcq]")) { S._rcq = t.value; const p = t.selectionStart; renderPayRecv(); const n = $("tab-payrecv").querySelector("[data-rcq]"); n.focus(); n.setSelectionRange(p, p); return; }
    if (!E) return;
    if (t.dataset.rcf && t.dataset.rcf !== "customerId") { E[t.dataset.rcf] = t.value; return; }
    if (t.dataset.rcal) { E.alloc[t.dataset.rcal] = t.value === "" ? "" : +t.value; return; }
    return;
  }
  if (e.type === "change") { if (!E) return; if (t.dataset.rcf === "customerId") { E.customerId = t.value; E.alloc = {}; return renderPayRecv(); } if (t.dataset.rcal || t.dataset.rcf === "amount") return renderPayRecv(); return; }
  const b = t.closest("button"); if (!b) return;
  if (b.hasAttribute("data-rcnew")) return newReceipt();
  if (b.hasAttribute("data-rccancel")) { S.rcEd = null; return renderPayRecv(); }
  if (b.dataset.rcedit) return newReceipt(null, null, b.dataset.rcedit);
  if (b.hasAttribute("data-rcauto")) { let left = +E.amount || 0; E.alloc = {}; for (const x of rcOpenFor(E)) { if (left <= 0) break; const a = r2(Math.min(left, x.bal)); E.alloc[x.id] = a; left = r2(left - a); } return renderPayRecv(); }
  if (b.hasAttribute("data-rcsave")) return saveReceipt(b);
  if (b.dataset.rccancelrc) { const r = S.receipts[b.dataset.rccancelrc]; if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again to cancel " + r.no; return; } await S.db.doc(`receipts/${b.dataset.rccancelrc}`).set({ ...r, status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: S.myEmail || "" }); msg($("globalmsg"), "good", `Cancelled ${r.no}. Its invoices show as unpaid again.`); return; }
  if (b.dataset.rcpdf) return receiptPdf(b.dataset.rcpdf);
}
async function saveReceipt(btn) {
  const E = S.rcEd; const m = t => { $("rcMsg").textContent = t; $("rcMsg").className = "pill bad"; };
  const amount = r2(+E.amount || 0); if (!E.customerId) return m("Choose the customer."); if (!(amount > 0)) return m("Enter the amount received.");
  const open = rcOpenFor(E); const allocations = [];
  for (const x of open) { const a = r2(+E.alloc[x.id] || 0); if (!a) continue; if (a > x.bal + 0.004) return m(`${x.d.no}: more than its balance.`); allocations.push({ invId: x.id, invNo: x.d.no, amount: a }); }
  const applied = r2(allocations.reduce((a, x) => a + x.amount, 0)); if (applied > amount + 0.004) return m("More applied than received.");
  btn.disabled = true;
  try {
    const c = S.customers[E.customerId] || {};
    if (E.editingId) { const r = S.receipts[E.editingId]; await S.db.doc(`receipts/${E.editingId}`).set({ ...r, allocations, unallocated: r2(r.amount - applied), notes: E.notes, updatedAt: new Date().toISOString() }); }
    else { const fy = fyOf(E.date); const seq = await nextNumber("RCPT", fy); const id = `RCPT_${fy}_${String(seq).padStart(4, "0")}`;
      await S.db.doc(`receipts/${id}`).set({ no: docNo("RCPT", fy, seq), fy, seq, date: E.date, customerId: E.customerId, customer: { name: c.name || "", gstin: c.gstin || "", address: c.address || "" }, mode: E.mode, ref: E.ref, notes: E.notes, amount, allocations, unallocated: r2(amount - applied), status: "received", createdAt: new Date().toISOString(), createdBy: S.myEmail || "" }); }
    S.rcEd = null; msg($("globalmsg"), "good", `Receipt saved: ₹ ${inr(amount)}${applied ? `, ₹ ${inr(applied)} applied to ${allocations.length} invoice${allocations.length === 1 ? "" : "s"}` : ""}.`); renderPayRecv();
  } catch (err) { btn.disabled = false; m("Couldn't save: " + (err.message || err.code)); }
}
async function receiptPdf(id) {
  const r = S.receipts[id]; const co = { ...DEFAULT_COMPANY, ...S.company };
  try {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "landscape" }); addFonts(doc);
    const W = 210, M = 12, RED = [192, 57, 43];
    if (co.logo) { try { doc.addImage(co.logo, "PNG", M, 8, 16, 16); } catch (e) { } }
    doc.setFont("FreeSans", "bold"); doc.setFontSize(13); doc.setTextColor(34); doc.text(co.name, M + 20, 14); doc.setFont("FreeSans", "normal"); doc.setFontSize(7.5); doc.setTextColor(100);
    doc.text((co.address || "").replace(/\n/g, ", "), M + 20, 18.5, { maxWidth: 110 }); doc.text(`GSTIN: ${co.gstin}  |  ${co.phone}  |  ${co.email}`, M + 20, 25);
    doc.setFont("FreeSans", "bold"); doc.setFontSize(16); doc.setTextColor(...RED); doc.text(r.status === "cancelled" ? "RECEIPT (CANCELLED)" : "PAYMENT RECEIPT", W - M, 15, { align: "right" });
    doc.setFontSize(9); doc.setTextColor(34); doc.text(`No.: ${r.no}`, W - M, 21, { align: "right" }); doc.setFont("FreeSans", "normal"); doc.text(`Date: ${dmy(r.date)}`, W - M, 26, { align: "right" });
    doc.setDrawColor(43); doc.setLineWidth(0.4); doc.line(M, 30, W - M, 30);
    doc.setFontSize(10); let y = 38;
    doc.text(`Received with thanks from `, M, y); doc.setFont("FreeSans", "bold"); doc.text(r.customer?.name || "", M + doc.getTextWidth("Received with thanks from ") + 1, y); doc.setFont("FreeSans", "normal"); y += 7;
    doc.text(`the sum of ₹ ${inr(r.amount)} (Rupees ${inWords(Math.floor(r.amount))}${r.amount % 1 ? " and " + Math.round((r.amount % 1) * 100) + " Paise" : ""} Only)`, M, y, { maxWidth: W - 2 * M }); y += 10;
    doc.text(`by ${r.mode}${r.ref ? `, reference ${r.ref}` : ""}${r.notes ? ` (${r.notes})` : ""}.`, M, y); y += 6;
    if ((r.allocations || []).length) doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: "grid", head: [["Against invoice", "Invoice date", "Amount applied (₹)"]], body: [...r.allocations.map(a => [a.invNo, dmy(S.sales[a.invId]?.date || ""), inr(a.amount)]), ...(r.unallocated > 0 ? [["Advance (not yet applied)", "", inr(r.unallocated)]] : [])],
      headStyles: { font: "FreeSans", fillColor: RED, textColor: 255, fontSize: 8 }, styles: { font: "FreeSans", fontSize: 8.5 }, columnStyles: { 2: { halign: "right" } } });
    const fy = Math.max(y + 8, (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 14);
    doc.setFont("FreeSans", "bold"); doc.setFontSize(9); doc.text(`For ${co.name}`, W - M, fy, { align: "right" }); doc.setFont("FreeSans", "normal"); doc.setFontSize(8); doc.text(co.signatory || "Authorised Signatory", W - M, fy + 14, { align: "right" });
    await save(r.no.replace(/\//g, "-") + ".pdf", new Uint8Array(doc.output("arraybuffer")));
  } catch (err) { msg($("globalmsg"), "bad", "Couldn't make the PDF: " + (err.message || err)); }
}

/* ===================== CUSTOMERS (with credit days) ===================== */
function renderCustomers() {
  const box = $("customerBox"); if (!box) return; const can = canEditPanel("company") && !!S.db; const ed = S.custEd;
  const list = Object.entries(S.customers).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const form = ed ? `<div class="panel pad" style="background:var(--bg);display:grid;gap:8px;margin-bottom:12px"><b>${ed.id ? "Edit customer" : "New customer"}</b><div class="kvform">
     <label>Name</label><input type="text" data-cu="name" value="${esc(ed.name || "")}"><label>Address</label><textarea data-cu="address" rows="2" style="min-height:48px;font-family:var(--font-body);font-size:13px">${esc(ed.address || "")}</textarea>
     <label>GSTIN</label><input type="text" data-cu="gstin" value="${esc(ed.gstin || "")}" maxlength="15"><label>State</label><select data-cu="stateCode">${Object.entries(STATES).map(([k, v]) => `<option value="${k}" ${(ed.stateCode || "33") === k ? "selected" : ""}>${k} · ${v}</option>`).join("")}</select>
     <label>Drug licence</label><input type="text" data-cu="dl" value="${esc(ed.dl || "")}"><label>Phone</label><input type="text" data-cu="phone" value="${esc(ed.phone || "")}">
     <label>Credit days</label><input type="number" min="0" step="1" data-cu="creditDays" value="${esc(ed.creditDays ?? 30)}" style="width:90px"></div>
     <div class="row"><button class="btn primary" data-cusave>Save customer</button><button class="btn" data-cuclose>Cancel</button><span class="note" id="cuMsg"></span></div></div>` : "";
  box.innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">Customers</h2><button class="btn primary" data-cunew ${can ? "" : "disabled"}>Add customer</button></div>
   <p class="note">Credit days set the due date on new tax invoices (used by Payment Follows). Customers are also added automatically the first time you save a document for them.</p>${form}
   <div class="tablewrap"><table><thead><tr><th>Name</th><th>GSTIN</th><th>State</th><th>Drug licence</th><th>Phone</th><th class="num">Credit days</th><th class="num">Documents</th><th class="num">Outstanding (₹)</th><th></th></tr></thead><tbody>
   ${list.length ? list.map(([id, c]) => { const n = Object.values(S.sales).filter(d => d.customerId === id).length; const ob = openInvoices(id).reduce((a, x) => a + x.bal, 0);
     return `<tr><td>${esc(c.name)}<div class="note">${esc(c.address || "")}</div></td><td class="code">${esc(c.gstin || "")}</td><td>${esc(c.stateCode)} ${esc(c.stateName || "")}</td><td>${esc(c.dl || "")}</td><td>${esc(c.phone || "")}</td><td class="num">${c.creditDays ?? 30}</td><td class="num">${n}</td><td class="num">${ob ? inr(ob) : "—"}</td>
       <td><div class="row" style="flex-wrap:nowrap">${can ? `<button class="btn" data-cuedit="${esc(id)}">Edit</button>` : ""}${can && !n ? `<button class="btn danger" data-custdel="${esc(id)}">Delete</button>` : ""}</div></td></tr>`; }).join("") : `<tr><td colspan="9" class="empty">No customers yet.</td></tr>`}</tbody></table></div>`;
}
$("tab-customers").addEventListener("input", e => { const k = e.target.dataset.cu; if (k && S.custEd) S.custEd[k] = e.target.value; });
$("tab-customers").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.hasAttribute("data-cunew")) { S.custEd = { stateCode: "33", creditDays: 30 }; return renderCustomers(); }
  if (b.dataset.cuedit) { S.custEd = { id: b.dataset.cuedit, ...S.customers[b.dataset.cuedit] }; renderCustomers(); $("customerBox").scrollIntoView({ block: "start" }); return; }
  if (b.hasAttribute("data-cuclose")) { S.custEd = null; return renderCustomers(); }
  if (b.hasAttribute("data-cusave")) { const c = S.custEd; if (!(c.name || "").trim()) { $("cuMsg").textContent = "Enter a name."; return; }
    const gstin = (c.gstin || "").trim().toUpperCase(); const sc = STATES[gstin.slice(0, 2)] ? gstin.slice(0, 2) : (c.stateCode || "33");
    const doc = { name: c.name.trim(), address: c.address || "", gstin, stateCode: sc, stateName: STATES[sc] || "", dl: c.dl || "", phone: c.phone || "", creditDays: Math.max(0, Math.round(+c.creditDays || 0)) };
    b.disabled = true; try { await S.db.doc(`customers/${c.id || "c" + Date.now().toString(36)}`).set(doc); S.custEd = null; renderCustomers(); } catch (err) { b.disabled = false; $("cuMsg").textContent = "Couldn't save: " + (err.message || err.code); } }
});

/* ===================== ADMIN: USERS & ACCESS ===================== */
const PERM_PANELS = PANELS.filter(p => p.key !== "admin");
function renderUsers() {
  const el = $("tab-users");
  if (!FIREBASE_MODE) { el.innerHTML = `<div class="panel pad"><h2>Users &amp; access</h2><p class="note">Per-user panel access works in your <b>GitHub + Firebase</b> version, where everyone signs in with Google. On claude.ai, who can open this register is set with claude.ai's <b>Share</b> button instead.</p></div>`; return; }
  ensureBound(el, usersEvent);
  const users = Object.values(S.users).sort((a, b) => (b.isAdmin - a.isAdmin) || (a.email < b.email ? -1 : 1));
  const sel = (u, k) => { const v = (u.perms || {})[k] || "none"; return `<select data-perm="${esc(u.email)}|${k}" aria-label="${esc(k)} access for ${esc(u.email)}" ${u.isAdmin ? "disabled" : ""} style="font-size:12px;padding:4px 6px;${v === "edit" ? "border-color:var(--good)" : v === "view" ? "border-color:var(--warn)" : ""}"><option value="none" ${v === "none" ? "selected" : ""}>No access</option><option value="view" ${v === "view" ? "selected" : ""}>View</option><option value="edit" ${v === "edit" ? "selected" : ""}>Edit</option></select>`; };
  el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 6px">Users &amp; access</h2>
   <p class="note" style="margin:0">Add each person by the Google (Gmail) account they sign in with, then choose what they can do in each panel: <b>No access</b> hides the panel, <b>View</b> lets them look and download, <b>Edit</b> lets them create and change. Admins can do everything and manage users. Changes apply immediately.</p>
   <div class="row" style="margin-top:10px"><input type="email" data-newemail placeholder="name@gmail.com" style="width:240px" aria-label="New user email"><input type="text" data-newname placeholder="Name" style="width:180px" aria-label="New user name">
     <select data-newpreset aria-label="Starting access"><option value="none">Start with no access</option><option value="view">Start with view on all panels</option><option value="edit">Start with edit on all panels</option></select><button class="btn primary" data-adduser>Add user</button><span class="note" id="uMsg"></span></div></div>
   <div class="panel"><div class="tablewrap"><table><thead><tr><th>User</th><th>Active</th><th>Admin</th>${PERM_PANELS.map(p => `<th style="white-space:normal;min-width:84px">${esc(p.label)}</th>`).join("")}<th></th></tr></thead><tbody>
   ${users.map(u => { const self = u.email === S.myEmail; return `<tr><td><b>${esc(u.name || "")}</b><div class="code">${esc(u.email)}</div>${self ? '<div class="note">you</div>' : ""}</td>
     <td><input type="checkbox" data-uactive="${esc(u.email)}" ${u.active !== false ? "checked" : ""} ${self ? "disabled" : ""} aria-label="Active"></td><td><input type="checkbox" data-uadmin="${esc(u.email)}" ${u.isAdmin ? "checked" : ""} ${self ? "disabled" : ""} aria-label="Admin"></td>
     ${PERM_PANELS.map(p => `<td>${u.isAdmin ? '<span class="note">All</span>' : sel(u, p.key)}</td>`).join("")}<td>${self ? "" : `<button class="btn danger" data-udel="${esc(u.email)}">Remove</button>`}</td></tr>`; }).join("") || `<tr><td colspan="${PERM_PANELS.length + 4}" class="empty">No users yet.</td></tr>`}
   </tbody></table></div></div>`;
}
async function usersEvent(e) {
  const t = e.target; if (e.type === "input") return;
  const put = async (email, patch) => { const u = S.users[email]; try { await S.db.doc(`users/${email}`).set({ ...u, ...patch, updatedAt: new Date().toISOString(), updatedBy: S.myEmail }); } catch (err) { msg($("globalmsg"), "bad", "Couldn't save: " + (err.message || err.code)); } };
  if (e.type === "change") {
    if (t.dataset.perm) { const [em, k] = t.dataset.perm.split("|"); return put(em, { perms: { ...(S.users[em].perms || {}), [k]: t.value } }); }
    if (t.dataset.uactive) return put(t.dataset.uactive, { active: t.checked });
    if (t.dataset.uadmin) return put(t.dataset.uadmin, { isAdmin: t.checked });
    return;
  }
  const b = t.closest("button"); if (!b) return;
  if (b.hasAttribute("data-adduser")) { const box = $("tab-users"); const em = box.querySelector("[data-newemail]").value.trim().toLowerCase(), nm = box.querySelector("[data-newname]").value.trim(), pr = box.querySelector("[data-newpreset]").value;
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(em)) { $("uMsg").textContent = "Enter a valid email."; return; } if (S.users[em]) { $("uMsg").textContent = "Already added."; return; }
    try { await S.db.doc(`users/${em}`).set({ email: em, name: nm, active: true, isAdmin: false, perms: Object.fromEntries(PERM_PANELS.map(p => [p.key, pr])), createdAt: new Date().toISOString(), createdBy: S.myEmail }); $("uMsg").textContent = `Added. Ask ${em} to sign in at this page's address.`; }
    catch (err) { $("uMsg").textContent = "Couldn't add: " + (err.message || err.code); } return; }
  if (b.dataset.udel) { if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again"; return; } try { await S.db.doc(`users/${b.dataset.udel}`).delete(); } catch (err) { msg($("globalmsg"), "bad", "Couldn't remove: " + (err.message || err.code)); } }
}

/* ===================== BOOT ===================== */
S.meState = FIREBASE_MODE ? "loading" : "ok";
setView(FIREBASE_MODE ? null : "invoice", FIREBASE_MODE ? null : "pid");
(async () => {
  if (!window.claude || !claude.use) return;
  const db = await claude.use("db"); if (!db) return;
  const rer = views => () => { if (views.includes(S.tab) || S.tab.startsWith("sales")) render(); };
  const sub = (col, key, views) => db.collection(col).onSnapshot(s => { S[key] = {}; s.docs.forEach(d => S[key][d.id] = d.data()); rer(views)(); }, () => {});
  if (FIREBASE_MODE) {
    const u = await claude.use("user"); const email = ((u && u.email && await u.email()) || "").toLowerCase(); S.myEmail = email;
    const ref = db.doc(`users/${email}`); let tried = false;
    ref.onSnapshot(async snap => {
      if (!snap.exists) {
        if (!tried) { tried = true; try { await ref.set({ email, name: (u.name && await u.name()) || "", active: true, isAdmin: true, owner: true, perms: {}, createdAt: new Date().toISOString() }); return; } catch (e) { } }
        S.me = null; S.meState = "none"; setView(null); return;
      }
      const d = snap.data(); if (d.active === false) { S.me = null; S.meState = "inactive"; setView(null); return; }
      const first = !S.me; S.me = d; S.meState = "ok";
      const st = $("dbstatus"); if (st && d.isAdmin) st.title = "Admin";
      if (first || !canViewPanel(S.panel)) setView(S.panel && canViewPanel(S.panel) ? S.panel : null, S.tab); else { S.canWrite = canEditPanel(S.panel) && !!S.db; renderNav(); render(); }
      if (d.isAdmin && !S._usersSub) S._usersSub = db.collection("users").onSnapshot(s => { S.users = {}; s.docs.forEach(x => S.users[x.id] = x.data()); if (S.tab === "users") renderUsers(); }, () => {});
    }, () => { S.me = null; S.meState = "none"; setView(null); });
  }
  sub("purchaseOrders", "pos", ["po"]);
  sub("receipts", "receipts", ["payfollow", "payrecv", "customers", "salesdash", "studio"]);
  sub("followups", "followups", ["payfollow"]);
  const wait = setInterval(() => { if (S.db) { clearInterval(wait); if (S.me) { S.canWrite = canEditPanel(S.panel); render(); } } }, 300);
})();
