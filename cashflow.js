"use strict";
/* =====================================================================
   Sales Analysis → Cash flow  and  Sales Analysis → Payment cycle
   Worked out live from: tax invoices (sales), receipts (money in),
   supplier invoices (money out) and settings/cashflow:
     { custDays: 45, supDays: { default: 30, MLS: 30, … }, paid: { "<supplier inv no>": { date, by } } }
   ===================================================================== */
S.cf = { custDays: 45, supDays: { default: 30 }, paid: {} };
S.cfv = { ahead: 6, back: 3, listQ: "", supShow: "unpaid" };
S.cyv = { q: "", by: "customer" };

(function waitDb() {
  if (!S.db) return setTimeout(waitDb, 500);
  S.db.doc("settings/cashflow").onSnapshot(d => {
    const v = d.exists ? d.data() : {};
    S.cf = { custDays: +v.custDays > 0 ? +v.custDays : 45, supDays: { default: 30, ...(v.supDays || {}) }, paid: { ...(v.paid || {}) } };
    if (S.tab === "cashflow") renderCashflow(); if (S.tab === "cycle") renderCycle();
  }, () => { });
})();
async function saveCf(patch, note, box) {
  try { await S.db.doc("settings/cashflow").set({ custDays: S.cf.custDays, supDays: S.cf.supDays, paid: S.cf.paid, ...patch, updatedAt: new Date().toISOString(), by: S.myEmail || "" }); if (box && $(box)) msg($(box), "ok", note || "Saved."); return true; }
  catch (e) { if (box && $(box)) msg($(box), "bad", "Couldn't save: " + (e.message || e.code) + (/permission/i.test(e.code || e.message || "") ? " — only an admin can change this until the new Firestore rules are published." : "")); return false; }
}

/* ---------- panels ---------- */
(function hook() {
  const an = PANELS.find(p => p.key === "analytics");
  if (an) { if (!an.subs.some(s => s[0] === "cashflow")) an.subs.push(["cashflow", "Cash flow"]); if (!an.subs.some(s => s[0] === "cycle")) an.subs.push(["cycle", "Payment cycle"]); }
  VIEW_SECTIONS.cashflow = ["tab-cashflow"]; VIEW_SECTIONS.cycle = ["tab-cycle"];
  for (const id of ["tab-cashflow", "tab-cycle"]) {
    if (!ALL_SECTIONS.includes(id)) ALL_SECTIONS.push(id);
    if (!document.getElementById(id)) { const s = document.createElement("section"); s.id = id; s.className = "hidden"; s.style.cssText = "display:grid;gap:14px"; (document.getElementById("tab-salesdash") || document.querySelector("main")).after(s); }
  }
  const st = document.createElement("style");
  st.textContent = `.cfbars{display:flex;align-items:flex-end;gap:14px;height:230px;padding:24px 8px 0;border-bottom:1px solid var(--line);overflow-x:auto}
  .cfm{display:grid;grid-template-rows:1fr auto;min-width:104px;height:100%}.cfm .bb{display:flex;align-items:flex-end;gap:3px;justify-content:center}
  .cfm .b{width:24px;border-radius:4px 4px 0 0;position:relative;min-height:1px}.cfm .b span{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-size:10.5px;white-space:nowrap;color:var(--muted);padding-bottom:2px}
  .cfm .lb{text-align:center;font-size:12px;padding:6px 0 0;color:var(--muted)}.cfm.fut .lb{font-style:italic}.cfm.now .lb{font-weight:700;color:inherit}
  .cfkey{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;margin-top:8px}.cfkey i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  .rate-f{background:#e3f5ea;color:#17663a}.rate-m{background:#fff4d6;color:#8a5a00}.rate-s{background:#fde4e4;color:#a12a2a}.rate-n{background:var(--bg);color:var(--muted)}
  .ratepill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:600}.cyc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15px}.cyc b{font-size:22px}`;
  document.head.appendChild(st);
  const _ro = renderOps;
  renderOps = function () { if (S.tab === "cashflow") { renderCashflow(); return true; } if (S.tab === "cycle") { renderCycle(); return true; } return _ro.apply(this, arguments); };
  const _rb = rebuild; rebuild = function () { const r = _rb.apply(this, arguments); if (S.tab === "cashflow") renderCashflow(); else if (S.tab === "cycle") renderCycle(); return r; };
  setInterval(() => { const sig = Object.keys(S.receipts || {}).length + ":" + Object.keys(S.sales || {}).length; if (sig !== S._cfSig) { S._cfSig = sig; if (S.tab === "cashflow") renderCashflow(); else if (S.tab === "cycle") renderCycle(); } }, 2000);
})();

/* ---------- shared calculations ---------- */
const cfIso = d => d.toISOString().slice(0, 10);
const cfAdd = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + Math.round(n)); return cfIso(d); };
const cfDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const dmyToIso = s => { const d = toDate(s); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : ""; };
const monKey = s => s.slice(0, 7);
const monLbl = k => new Date(k + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const cfLakh = v => { const a = Math.abs(v); return (v < 0 ? "−" : "") + (a >= 1e7 ? (a / 1e7).toFixed(2) + " Cr" : a >= 1e5 ? (a / 1e5).toFixed(2) + " L" : inr(a, 0)); };
const cfShort = v => v >= 1e7 ? (v / 1e7).toFixed(1) + "Cr" : v >= 1e5 ? (v / 1e5).toFixed(1) + "L" : v >= 1e3 ? Math.round(v / 1e3) + "K" : String(Math.round(v));
const custName = d => (S.customers[d.customerId] && S.customers[d.customerId].name) || (d.customer && d.customer.name) || "—";

/* every active tax invoice with what has been paid, when, and how long it took */
function cfInvoices() {
  const pays = {};
  for (const [rid, r] of Object.entries(S.receipts || {})) { if (r.status === "cancelled") continue; for (const a of r.allocations || []) (pays[a.invId] ||= []).push({ date: r.date, amount: +a.amount || 0, rno: r.no }); }
  const out = [];
  for (const [id, d] of Object.entries(S.sales || {})) {
    if (d.type !== "INV" || d.status === "cancelled" || !d.date) continue;
    const grand = r2(d.totals?.grand || 0); const P = (pays[id] || []).sort((a, b) => a.date < b.date ? -1 : 1);
    const paid = d.paidOutside ? grand : r2(P.reduce((a, x) => a + x.amount, 0)); const bal = r2(grand - paid);
    const daysW = paid > 0 && !d.paidOutside ? P.reduce((a, x) => a + x.amount * Math.max(0, cfDays(d.date, x.date)), 0) / paid : null;
    out.push({ id, d, no: d.no, date: d.date, cust: custName(d), custId: d.customerId || custName(d), grand, paid, bal, pays: P, daysToPay: daysW, fullyPaid: bal <= 0.5, due: typeof invDue === "function" ? invDue(d) : cfAdd(d.date, d.creditDays || 30) });
  }
  return out;
}
/* each customer's habit: weighted average days to pay */
function custHabits(INV) {
  const m = {};
  for (const x of INV) { const c = (m[x.custId] ||= { custId: x.custId, name: x.cust, n: 0, billed: 0, paid: 0, bal: 0, wDays: 0, wAmt: 0, overdue: 0, oldestOd: 0, open: 0, last: "" });
    c.n++; c.billed += x.grand; c.paid += x.paid; c.bal += Math.max(0, x.bal); if (x.date > c.last) c.last = x.date;
    if (x.daysToPay != null) { c.wDays += x.daysToPay * x.paid; c.wAmt += x.paid; }
    if (x.bal > 0.5) { c.open++; const od = cfDays(x.due, todayIso()); if (od > 0) { c.overdue += x.bal; c.oldestOd = Math.max(c.oldestOd, od); } } }
  for (const c of Object.values(m)) { c.avgDays = c.wAmt ? c.wDays / c.wAmt : null; c.rating = c.avgDays == null ? "n" : c.avgDays <= 30 ? "f" : c.avgDays <= 60 ? "m" : "s"; }
  return m;
}
const RATE = { f: ["Fast", "0–30 days"], m: ["Medium", "31–60 days"], s: ["Slow", "60+ days"], n: ["No history", "no payments yet"] };
const ratePill = r => `<span class="ratepill rate-${r}">${RATE[r][0]}</span>`;
/* when each open balance is expected to come in */
function expectedIn(INV, H) {
  const today = todayIso(); const out = [];
  for (const x of INV) { if (x.bal <= 0.5) continue; const h = H[x.custId];
    const days = h && h.avgDays != null ? h.avgDays : S.cf.custDays; const basis = h && h.avgDays != null ? `${x.cust} usually pays in ${Math.round(h.avgDays)} days` : `no payment history: ${S.cf.custDays} days assumed`;
    let exp = cfAdd(x.date, days); const late = exp < today; if (late) exp = today;
    out.push({ ...x, exp, basis, late, lateBy: late ? cfDays(cfAdd(x.date, days), today) : 0 }); }
  return out.sort((a, b) => a.exp < b.exp ? -1 : 1);
}
/* supplier invoices: amount (taxable + GST) and due date from the supplier's credit days */
function supplierBills() {
  const g = {};
  for (const r of S.items || []) { const k = r.invoiceNo; const b = (g[k] ||= { no: k, date: dmyToIso(r.invoiceDate), supplier: r.supplier || "", div: r.divCode || "", amt: 0 }); b.amt += (+r.taxable || 0) + (+r.igst || 0); }
  return Object.values(g).filter(b => b.date).map(b => { const days = +(S.cf.supDays[b.div] ?? S.cf.supDays.default ?? 30); const p = S.cf.paid[b.no];
    return { ...b, amt: r2(b.amt), days, due: cfAdd(b.date, days), paid: !!p, paidOn: p ? p.date : "" }; }).sort((a, b) => a.due < b.due ? -1 : 1);
}

/* ---------- Cash flow ---------- */
function renderCashflow() {
  const el = $("tab-cashflow"); if (!el) return;
  const V = S.cfv; const today = todayIso(); const curM = monKey(today);
  const INV = cfInvoices(); const H = custHabits(INV); const EXP = expectedIn(INV, H); const SUP = supplierBills();
  const can = canEditPanel("payrecv") || canEditPanel("analytics");
  // months: back … current … ahead
  const months = []; { const d = new Date(today.slice(0, 8) + "01"); d.setMonth(d.getMonth() - V.back); for (let i = 0; i <= V.back + V.ahead; i++) { months.push(cfIso(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); } }
  const M = Object.fromEntries(months.map(k => [k, { k, billed: 0, inAct: 0, inExp: 0, outAct: 0, outExp: 0 }]));
  for (const x of INV) { const m = M[monKey(x.date)]; if (m) m.billed += x.grand; for (const p of x.pays) { const mm = M[monKey(p.date)]; if (mm) mm.inAct += p.amount; } }
  for (const r of Object.values(S.receipts || {})) { if (r.status === "cancelled" || !(r.unallocated > 0)) continue; const mm = M[monKey(r.date)]; if (mm) mm.inAct += +r.unallocated; }
  let beyondIn = 0; for (const x of EXP) { const m = M[monKey(x.exp)]; if (m) m.inExp += x.bal; else if (monKey(x.exp) > months[months.length - 1]) beyondIn += x.bal; }
  for (const b of SUP) { if (b.paid) { const m = M[monKey(b.paidOn)]; if (m) m.outAct += b.amt; } else { const k = b.due < today ? curM : monKey(b.due); const m = M[k]; if (m) m.outExp += b.amt; } }
  const rows = months.map(k => { const m = M[k]; const cin = r2(m.inAct + m.inExp), cout = r2(m.outAct + m.outExp); return { ...m, cin, cout, net: r2(cin - cout), past: k < curM, now: k === curM }; });
  let run = 0; for (const r of rows) { if (r.past) continue; run = r2(run + r.net); r.run = run; }
  const recv = r2(EXP.reduce((a, x) => a + x.bal, 0)), overdue = r2(INV.filter(x => x.bal > 0.5 && x.due < today).reduce((a, x) => a + x.bal, 0));
  const in30 = r2(EXP.filter(x => x.exp <= cfAdd(today, 30)).reduce((a, x) => a + x.bal, 0));
  const supUnpaid = SUP.filter(b => !b.paid); const pay = r2(supUnpaid.reduce((a, b) => a + b.amt, 0)); const pay30 = r2(supUnpaid.filter(b => b.due <= cfAdd(today, 30)).reduce((a, b) => a + b.amt, 0));
  const net30 = r2(in30 - pay30);
  const peak = Math.max(1, ...rows.map(r => Math.max(r.billed, r.cin, r.cout)));
  const hgt = v => Math.max(v > 0 ? 2 : 0, Math.round(v / peak * 180));
  const tight = rows.filter(r => !r.past && r.net < 0);
  const tile = (k, v, s, cls) => `<div class="tile6"><div class="k">${k}${ib(k)}</div><div class="v ${cls || ""}">${v}</div><div class="s">${s}</div></div>`;
  const q = V.listQ.trim().toLowerCase(); const expList = EXP.filter(x => !q || (x.no + " " + x.cust).toLowerCase().includes(q));
  const supList = SUP.filter(b => V.supShow === "all" || !b.paid);
  const divs = S.divisions || [];

  el.innerHTML = `<div class="panel pad"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">
     <div><h2 style="margin:0">Cash flow</h2><div class="note">Money in from customers (receipts, and open invoices expected on each customer's usual payment days) and money out to suppliers (supplier invoices on their credit days). Amounts include GST.</div></div>
     <button class="btn" id="cfXlsx">Download cash flow (Excel)</button></div>
     <details style="margin-top:10px"><summary style="cursor:pointer"><b>Payment days used</b> <span class="note">· customers without history: ${S.cf.custDays} days · supplier credit: ${divs.map(d => `${d.code} ${S.cf.supDays[d.code] ?? S.cf.supDays.default}d`).join(", ") || S.cf.supDays.default + "d"}</span></summary>
       <div style="display:grid;gap:8px;margin-top:10px;max-width:640px">
         <div class="row" style="gap:8px;align-items:center"><span style="min-width:260px">Customers with no payment history yet pay in</span><input type="number" id="cfCust" min="0" value="${S.cf.custDays}" style="width:80px" ${can ? "" : "disabled"} aria-label="Default customer payment days"> days</div>
         <div class="row" style="gap:8px;align-items:center"><span style="min-width:260px">Supplier credit days (all suppliers)</span><input type="number" id="cfSupD" min="0" value="${S.cf.supDays.default}" style="width:80px" ${can ? "" : "disabled"} aria-label="Default supplier credit days"> days</div>
         ${divs.map(d => `<div class="row" style="gap:8px;align-items:center"><span style="min-width:260px">${esc(d.code)} · ${esc(d.name)}</span><input type="number" min="0" data-cfsup="${esc(d.code)}" value="${S.cf.supDays[d.code] ?? ""}" placeholder="${S.cf.supDays.default}" style="width:80px" ${can ? "" : "disabled"} aria-label="Supplier credit days for ${esc(d.name)}"> days</div>`).join("")}
         ${can ? `<div class="row" style="gap:8px"><button class="btn primary" id="cfSave">Save payment days</button></div>` : ""}<div id="cfMsg" class="hidden"></div></div></details></div>
  <div class="tiles6">
    ${tile("To collect from customers", "₹ " + cfLakh(recv), `${EXP.length} open invoice${EXP.length === 1 ? "" : "s"}`)}
    ${tile("Overdue now", "₹ " + cfLakh(overdue), "past the invoice due date", overdue > 0 ? "neg" : "")}
    ${tile("Expected in, next 30 days", "₹ " + cfLakh(in30), "from customers' usual payment days", "pos")}
    ${tile("To pay suppliers", "₹ " + cfLakh(pay), `${supUnpaid.length} supplier invoice${supUnpaid.length === 1 ? "" : "s"} not marked paid`)}
    ${tile("Due to suppliers, next 30 days", "₹ " + cfLakh(pay30), "on their credit days", pay30 > 0 ? "neg" : "")}
    ${tile("Net cash, next 30 days", (net30 >= 0 ? "+ ₹ " : "− ₹ ") + cfLakh(Math.abs(net30)), net30 >= 0 ? "more coming in than going out" : "more going out than coming in", net30 >= 0 ? "pos" : "neg")}
  </div>
  ${tight.length ? `<div class="msg warn">Tight month${tight.length > 1 ? "s" : ""}: ${tight.map(r => `<b>${monLbl(r.k)}</b> (₹ ${cfLakh(r.cin)} in, ₹ ${cfLakh(r.cout)} out)`).join(", ")}. Push collections from slow payers before then, or plan supplier payments around it.</div>` : ""}
  <div class="panel pad"><h3 style="margin:0">Month by month${ib("Month by month")}</h3><div class="note">Past months are actual; this month and later are expected. Hover a bar for the amount.</div>
    <div class="cfbars" role="img" aria-label="Billed, cash in and cash out by month">${rows.map(r => `<div class="cfm ${r.past ? "" : r.now ? "now" : "fut"}"><div class="bb">
      <div class="b" style="height:${hgt(r.billed)}px;background:#2a78d6" title="${monLbl(r.k)}: billed ₹ ${inr(r.billed, 0)}">${hgt(r.billed) >= 16 ? `<span>${cfShort(r.billed)}</span>` : ""}</div>
      <div class="b" style="height:${hgt(r.cin)}px;background:#1baf7a;${r.past ? "" : "opacity:.6"}" title="${monLbl(r.k)}: cash in ₹ ${inr(r.cin, 0)}${r.inExp ? ` (₹ ${inr(r.inExp, 0)} expected)` : ""}">${hgt(r.cin) >= 16 ? `<span>${cfShort(r.cin)}</span>` : ""}</div>
      <div class="b" style="height:${hgt(r.cout)}px;background:#eb6834;${r.past ? "" : "opacity:.6"}" title="${monLbl(r.k)}: cash out ₹ ${inr(r.cout, 0)}">${hgt(r.cout) >= 16 ? `<span>${cfShort(r.cout)}</span>` : ""}</div></div>
      <div class="lb">${monLbl(r.k)}${r.now ? " · now" : ""}</div></div>`).join("")}</div>
    <div class="cfkey"><span><i style="background:#2a78d6"></i>Billed to customers</span><span><i style="background:#1baf7a"></i>Cash in (faded = expected)</span><span><i style="background:#eb6834"></i>Paid / due to suppliers</span></div>
    <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Month</th><th class="num">Billed (₹)</th><th class="num">Cash in (₹)</th><th class="num">Cash out (₹)</th><th class="num">Net (₹)</th><th class="num">Running from this month (₹)</th></tr></thead><tbody>
    ${rows.map(r => `<tr${r.now ? ' style="font-weight:700"' : ""}><td>${monLbl(r.k)}${r.past ? ' <span class="note">actual</span>' : r.now ? ' <span class="note">now</span>' : ' <span class="note">expected</span>'}</td><td class="num">${inr(r.billed, 0)}</td><td class="num">${inr(r.cin, 0)}${r.inExp && r.inAct ? `<div class="note">${inr(r.inAct, 0)} received + ${inr(r.inExp, 0)} expected</div>` : ""}</td><td class="num">${inr(r.cout, 0)}</td><td class="num ${r.net >= 0 ? "pos" : "neg"}">${inr(r.net, 0)}</td><td class="num">${r.past ? "" : inr(r.run, 0)}</td></tr>`).join("")}
    ${beyondIn > 0.5 ? `<tr><td colspan="6" class="note">₹ ${inr(beyondIn, 0)} more is expected after ${monLbl(months[months.length - 1])}.</td></tr>` : ""}
    </tbody></table></div></div>
  <div class="panel"><div class="toolbar"><b>Expected from customers</b>${ib("Expected from customers")}<input type="search" id="cfQ" placeholder="Search customer or invoice…" value="${esc(V.listQ)}"><span class="count">${expList.length} open · ₹ ${inr(expList.reduce((a, x) => a + x.bal, 0), 0)}</span></div>
    <div class="tablewrap"><table><thead><tr><th>Expected</th><th>Customer</th><th>Invoice</th><th class="num">Invoice (₹)</th><th class="num">Still to come (₹)</th><th>Why this date</th></tr></thead><tbody>
    ${expList.length ? expList.slice(0, 300).map(x => `<tr class="${x.late ? "lowp" : ""}"><td>${x.late ? `<b class="neg">Overdue</b><div class="note">${x.lateBy} days past their usual time</div>` : dmy(x.exp)}</td><td>${esc(x.cust)} ${H[x.custId] ? ratePill(H[x.custId].rating) : ""}</td><td class="code">${esc(x.no)}<div class="note">${dmy(x.date)}</div></td><td class="num">${inr(x.grand)}</td><td class="num"><b>${inr(x.bal)}</b></td><td class="note">${esc(x.basis)}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">Nothing outstanding. Every invoice is paid.</td></tr>`}
    </tbody></table></div></div>
  <div class="panel"><div class="toolbar"><b>Supplier payments</b>${ib("Supplier payments")}<select id="cfSupShow"><option value="unpaid" ${V.supShow === "unpaid" ? "selected" : ""}>Not paid yet</option><option value="all" ${V.supShow === "all" ? "selected" : ""}>All supplier invoices</option></select><span class="count">${supList.length} · ₹ ${inr(supList.reduce((a, b) => a + b.amt, 0), 0)}</span></div>
    <div class="tablewrap"><table><thead><tr><th>Due</th><th>Supplier invoice</th><th>Supplier</th><th>Division</th><th class="num">Amount incl. GST (₹)</th><th>Status</th></tr></thead><tbody>
    ${supList.length ? supList.map(b => { const od = !b.paid && b.due < today; return `<tr class="${od ? "lowp" : ""}"><td>${dmy(b.due)}<div class="note">${b.days} days credit</div></td><td class="code">${esc(b.no)}<div class="note">${dmy(b.date)}</div></td><td>${esc(b.supplier)}</td><td>${esc(b.div)}</td><td class="num">${inr(b.amt)}</td>
      <td>${b.paid ? `<span class="ratepill rate-f">Paid ${dmy(b.paidOn)}</span>${can ? ` <button class="btn" data-cfunpay="${esc(b.no)}" title="Mark as not paid">↺</button>` : ""}` : `${od ? `<span class="ratepill rate-s">${cfDays(b.due, today)}d overdue</span>` : `<span class="ratepill rate-m">Due in ${cfDays(today, b.due)}d</span>`}${can ? ` <button class="btn" data-cfpay="${esc(b.no)}">Mark paid</button>` : ""}`}</td></tr>`; }).join("") : `<tr><td colspan="6" class="empty">${V.supShow === "unpaid" ? "All supplier invoices are marked paid." : "No supplier invoices yet."}</td></tr>`}
    </tbody></table></div><div class="note" style="padding:8px 12px">Mark a supplier invoice paid when you pay it, so it moves from "due" to "paid" in the months above.</div></div>`;

  $("cfQ").oninput = e => { V.listQ = e.target.value; clearTimeout(renderCashflow._t); renderCashflow._t = setTimeout(() => { renderCashflow(); const x = $("cfQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
  $("cfSupShow").onchange = e => { V.supShow = e.target.value; renderCashflow(); };
  $("cfXlsx").onclick = async () => {
    const m = [["Month", "Actual / expected", "Billed (₹)", "Cash in received (₹)", "Cash in expected (₹)", "Cash out paid (₹)", "Cash out due (₹)", "Net (₹)", "Running from this month (₹)"], ...rows.map(r => [monLbl(r.k), r.past ? "actual" : r.now ? "this month" : "expected", r2(r.billed), r2(r.inAct), r2(r.inExp), r2(r.outAct), r2(r.outExp), r.net, r.past ? "" : r.run])];
    const e = [["Expected date", "Overdue?", "Customer", "Speed", "Invoice", "Invoice date", "Invoice (₹)", "Paid (₹)", "Still to come (₹)", "Basis"], ...EXP.map(x => [dmy(x.exp), x.late ? `yes, ${x.lateBy} days late` : "", x.cust, H[x.custId] ? RATE[H[x.custId].rating][0] : "", x.no, dmy(x.date), x.grand, x.paid, x.bal, x.basis])];
    const s = [["Due date", "Supplier invoice", "Invoice date", "Supplier", "Division", "Credit days", "Amount incl. GST (₹)", "Paid on"], ...SUP.map(b => [dmy(b.due), b.no, dmy(b.date), b.supplier, b.div, b.days, b.amt, b.paid ? dmy(b.paidOn) : ""])];
    const sum = [["Cash flow", dmy(today)], [], ["To collect from customers (₹)", recv], ["Overdue now (₹)", overdue], ["Expected in, next 30 days (₹)", in30], ["To pay suppliers (₹)", pay], ["Due to suppliers, next 30 days (₹)", pay30], ["Net cash, next 30 days (₹)", net30], [], ["Customers with no history: days assumed", S.cf.custDays], ...Object.entries(S.cf.supDays).map(([k, v]) => [`Supplier credit days: ${k === "default" ? "all suppliers" : k}`, v])];
    await save(`Cash_flow_${today}.xlsx`, xlsxFrom([["Summary", sum], ["Month by month", m], ["Expected from customers", e], ["Supplier payments", s]]));
  };
  if (!can) return;
  $("cfSave").onclick = async () => { const c = Math.max(0, +$("cfCust").value || 0), sd = Math.max(0, +$("cfSupD").value || 0); const supDays = { default: sd };
    el.querySelectorAll("[data-cfsup]").forEach(i => { if (i.value !== "") supDays[i.dataset.cfsup] = Math.max(0, +i.value || 0); });
    await saveCf({ custDays: c || 45, supDays }, "Payment days saved.", "cfMsg"); };
  el.querySelectorAll("[data-cfpay]").forEach(b => b.onclick = async () => { const no = b.dataset.cfpay; const dt = prompt(`Date you paid supplier invoice ${no} (dd.mm.yyyy):`, dmy(today)); if (dt == null) return; const isoD = dmyToIso(dt) || today;
    await saveCf({ paid: { ...S.cf.paid, [no]: { date: isoD, by: S.myEmail || "" } } }); });
  el.querySelectorAll("[data-cfunpay]").forEach(b => b.onclick = async () => { const p = { ...S.cf.paid }; delete p[b.dataset.cfunpay]; await saveCf({ paid: p }); });
}

/* ---------- Payment cycle ---------- */
function cycleFacts(INV) {
  // per sold line: days in stock (purchase → sale), days to pay (that invoice), supplier days, sale value
  const byKey = new Map((S.items || []).map(r => [r.key, r])); const out = [];
  for (const x of INV) { for (const l of x.d.lines || []) { const it = byKey.get(l.key); if (!it) continue; const pd = dmyToIso(it.invoiceDate); if (!pd) continue;
    const div = it.divCode || ""; const sup = +(S.cf.supDays[div] ?? S.cf.supDays.default ?? 30); const val = +(l.taxable || l.amount || 0);
    out.push({ inv: x, cust: x.cust, custId: x.custId, div, mat: l.mat || it.mat, desc: l.desc || it.desc, val, stockDays: Math.max(0, cfDays(pd, x.date)), payDays: x.daysToPay, paidShare: x.grand ? Math.min(1, x.paid / x.grand) : 0, supDays: sup }); } }
  return out;
}
function cycleSum(F) {
  let v = 0, sd = 0, pv = 0, pd = 0, sup = 0;
  for (const f of F) { v += f.val; sd += f.stockDays * f.val; sup += f.supDays * f.val; if (f.payDays != null) { const w = f.val * f.paidShare; pv += w; pd += f.payDays * w; } }
  const stock = v ? sd / v : null, pay = pv ? pd / pv : null, supD = v ? sup / v : null;
  return { val: v, stock, pay, sup: supD, cycle: stock != null && pay != null ? stock + pay - supD : null };
}
function renderCycle() {
  const el = $("tab-cycle"); if (!el) return;
  const V = S.cyv; const INV = cfInvoices(); const H = custHabits(INV); const F = cycleFacts(INV); const T = cycleSum(F);
  const r0 = v => v == null ? "—" : Math.round(v); const pay = T.pay ?? S.cf.custDays; const cyc = T.stock != null ? T.stock + pay - (T.sup ?? S.cf.supDays.default) : null;
  const custs = Object.values(H).sort((a, b) => (b.avgDays ?? -1) - (a.avgDays ?? -1));
  const q = V.q.trim().toLowerCase();
  const groupBy = (kf, nf) => { const m = new Map(); for (const f of F) { const k = kf(f); if (!m.has(k)) m.set(k, { k, name: nf(f), F: [] }); m.get(k).F.push(f); } return [...m.values()].map(g => ({ ...g, ...cycleSum(g.F), qty: g.F.length })); };
  const divRows = groupBy(f => f.div || "—", f => f.div ? divName(f.div) : "—").sort((a, b) => b.val - a.val);
  const prodRows = groupBy(f => f.mat, f => f.desc).filter(g => !q || (g.k + " " + g.name).toLowerCase().includes(q)).sort((a, b) => (b.cycle ?? -1e9) - (a.cycle ?? -1e9));
  const cnt = r => custs.filter(c => c.rating === r).length;
  const custList = custs.filter(c => !q || c.name.toLowerCase().includes(q));
  const plain = cyc == null ? "Make some sales and record receipts to see your cycle." : cyc <= 0 ? `Your money comes back <b>${Math.abs(Math.round(cyc))} days before</b> you have to pay the supplier, so sales fund the next purchase.` : `From paying for stock to getting paid by the customer takes about <b>${Math.round(cyc)} days</b>. That's how long each rupee of stock is tied up, so you need that much working capital, or faster collections.`;
  el.innerHTML = `<div class="panel pad"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">
     <div><h2 style="margin:0">Payment cycle</h2><div class="note">How long stock sits, how long customers take to pay, and how many days suppliers give you. Worked out from your actual invoices and receipts (weighted by value).</div></div>
     <button class="btn" id="cyXlsx">Download payment cycle (Excel)</button></div>
     <div class="cyc" style="margin-top:14px">
       <span>Stock held <b>${r0(T.stock)}</b> days</span><span>+</span>
       <span>Customers pay in <b>${r0(pay)}</b> days${T.pay == null ? ' <span class="note">(assumed, no receipts yet)</span>' : ""}</span><span>−</span>
       <span>Supplier credit <b>${r0(T.sup ?? S.cf.supDays.default)}</b> days</span><span>=</span>
       <span style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:6px 12px">Cash cycle${ib("Cash cycle")} <b class="${cyc != null && cyc > 0 ? "neg" : "pos"}">${r0(cyc)}</b> days</span></div>
     <p style="margin:10px 0 0">${plain}</p></div>
  <div class="tiles6">
    <div class="tile6"><div class="k">Fast payers${ib("Fast payers")}</div><div class="v">${cnt("f")}</div><div class="s">pay within 30 days</div></div>
    <div class="tile6"><div class="k">Medium payers${ib("Medium payers")}</div><div class="v">${cnt("m")}</div><div class="s">31–60 days</div></div>
    <div class="tile6"><div class="k">Slow payers${ib("Slow payers")}</div><div class="v ${cnt("s") ? "neg" : ""}">${cnt("s")}</div><div class="s">over 60 days</div></div>
    <div class="tile6"><div class="k">No payment yet${ib("No payment yet")}</div><div class="v">${cnt("n")}</div><div class="s">customers with no receipts</div></div>
  </div>
  <div class="panel"><div class="toolbar"><span class="seg" role="group" aria-label="View">${[["customer", "Customers"], ["division", "Company / division"], ["product", "Products"]].map(([k, l]) => `<button data-cyby="${k}" class="${V.by === k ? "on" : ""}">${l}</button>`).join("")}</span>
    ${V.by !== "division" ? `<input type="search" id="cyQ" placeholder="Search…" value="${esc(V.q)}">` : ""}</div>
    <div class="tablewrap"><table>${V.by === "customer" ? `<thead><tr><th>Customer</th><th>Speed</th><th class="num">Avg days to pay</th><th class="num">Invoices</th><th class="num">Billed (₹)</th><th class="num">Received (₹)</th><th class="num">Outstanding (₹)</th><th class="num">Overdue (₹)</th><th class="num">Oldest overdue</th></tr></thead><tbody>
      ${custList.length ? custList.map(c => `<tr class="${c.rating === "s" || c.oldestOd > 60 ? "lowp" : ""}"><td><b>${esc(c.name)}</b><div class="note">last invoice ${dmy(c.last)}</div></td><td>${ratePill(c.rating)}</td><td class="num"><b>${c.avgDays == null ? "—" : Math.round(c.avgDays)}</b></td><td class="num">${c.n}</td><td class="num">${inr(c.billed, 0)}</td><td class="num">${inr(c.paid, 0)}</td><td class="num">${inr(c.bal, 0)}</td><td class="num ${c.overdue > 0 ? "neg" : ""}">${inr(c.overdue, 0)}</td><td class="num">${c.oldestOd ? c.oldestOd + " days" : "—"}</td></tr>`).join("") : `<tr><td colspan="9" class="empty">No tax invoices yet.</td></tr>`}</tbody>`
    : `<thead><tr><th>${V.by === "division" ? "Company / division" : "Product"}</th><th class="num">Lines sold</th><th class="num">Sales value (₹)</th><th class="num">Stock held (days)</th><th class="num">Customers pay (days)</th><th class="num">Supplier credit (days)</th><th class="num">Cash cycle (days)</th></tr></thead><tbody>
      ${(V.by === "division" ? divRows : prodRows).slice(0, 400).map(g => { const p = g.pay ?? S.cf.custDays; const c = g.stock != null ? g.stock + p - g.sup : null; return `<tr><td><b>${esc(g.name)}</b>${V.by === "product" ? `<div class="note">${esc(g.k)}</div>` : ""}</td><td class="num">${g.qty}</td><td class="num">${inr(g.val, 0)}</td><td class="num">${r0(g.stock)}</td><td class="num">${g.pay == null ? `${S.cf.custDays}<div class="note">assumed</div>` : Math.round(g.pay)}</td><td class="num">${r0(g.sup)}</td><td class="num ${c != null && c > 60 ? "neg" : ""}"><b>${r0(c)}</b></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">No sales yet.</td></tr>`}</tbody>`}
    </table></div>
    <div class="note" style="padding:8px 12px">Speed: Fast 0–30 days, Medium 31–60, Slow over 60, from the dates of the receipts against each invoice. Stock held = days from the supplier invoice date to the date you sold that PID. Supplier credit days are set in Cash flow → Payment days used.</div></div>`;

  el.querySelectorAll("[data-cyby]").forEach(b => b.onclick = () => { V.by = b.dataset.cyby; V.q = ""; renderCycle(); });
  if ($("cyQ")) $("cyQ").oninput = e => { V.q = e.target.value; clearTimeout(renderCycle._t); renderCycle._t = setTimeout(() => { renderCycle(); const x = $("cyQ"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250); };
  $("cyXlsx").onclick = async () => {
    const c = [["Customer", "Speed", "Avg days to pay", "Invoices", "Billed (₹)", "Received (₹)", "Outstanding (₹)", "Overdue (₹)", "Oldest overdue (days)", "Last invoice"], ...custs.map(x => [x.name, RATE[x.rating][0], x.avgDays == null ? "" : Math.round(x.avgDays), x.n, r2(x.billed), r2(x.paid), r2(x.bal), r2(x.overdue), x.oldestOd || "", dmy(x.last)])];
    const g = (rows, lbl) => [[lbl, "Code", "Lines sold", "Sales value (₹)", "Stock held (days)", "Customers pay (days)", "Supplier credit (days)", "Cash cycle (days)"], ...rows.map(x => { const p = x.pay ?? S.cf.custDays; return [x.name, x.k, x.qty, r2(x.val), r0(x.stock), x.pay == null ? `${S.cf.custDays} (assumed)` : Math.round(x.pay), r0(x.sup), x.stock != null ? Math.round(x.stock + p - x.sup) : ""]; })];
    const sum = [["Payment cycle", dmy(todayIso())], [], ["Stock held (days)", r0(T.stock)], ["Customers pay in (days)", r0(pay) + (T.pay == null ? " (assumed)" : "")], ["Supplier credit (days)", r0(T.sup ?? S.cf.supDays.default)], ["Cash cycle (days)", r0(cyc)], [], ["Fast payers (0–30 days)", cnt("f")], ["Medium payers (31–60 days)", cnt("m")], ["Slow payers (60+ days)", cnt("s")], ["No payment yet", cnt("n")]];
    await save(`Payment_cycle_${todayIso()}.xlsx`, xlsxFrom([["Summary", sum], ["Customers", c], ["Company wise", g(divRows, "Company / division")], ["Products", g(groupBy(f => f.mat, f => f.desc).sort((a, b) => b.val - a.val), "Product")]]));
  };
}
