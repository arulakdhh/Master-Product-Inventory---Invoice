"use strict";
/* ===== Sales Analysis dashboard: turnover, margin, forecast, suggestions, Excel / Power BI / PDF ===== */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mLabel = k => { const [y, m] = k.split("-"); return `${MON[+m - 1]} ${y.slice(2)}`; };
const mAdd = (k, n) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return mKey(d); };
const mRange = (a, b) => { const out = []; let k = a; while (k <= b && out.length < 240) { out.push(k); k = mAdd(k, 1); } return out; };
const isoToDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const lakh = v => { const a = Math.abs(v); return a >= 1e7 ? (v / 1e7).toFixed(2) + " Cr" : a >= 1e5 ? (v / 1e5).toFixed(2) + " L" : inr(v, 0); };
S.dash = S.dash || { range: "fy", div: "" };

/* ---------- data model ---------- */
function dashFacts() {
  const itemByKey = new Map(S.items.map(r => [r.key, r]));
  const sales = [];
  for (const [id, d] of Object.entries(S.sales)) {
    if (d.type !== "INV" || d.status === "cancelled") continue;
    (d.lines || []).forEach((l, i) => {
      const it = itemByKey.get(l.key) || {}; const unitCost = it.qty ? (it.taxable || 0) / it.qty : 0;
      sales.push({ invId: id, invNo: d.no, date: d.date, month: d.date.slice(0, 7), customerId: d.customerId || d.customer?.name || "", customer: d.customer?.name || "", state: d.customer?.stateCode || "",
        line: i + 1, pid: l.pid || "", mat: l.mat, desc: l.desc, hsn: l.hsn, div: it.divCode || "", qty: l.qty || 0, taxable: l.taxable || 0, gst: r2((l.cgst || 0) + (l.sgst || 0) + (l.igst || 0)), total: l.total || 0,
        cost: r2(unitCost * (l.qty || 0)), fromDc: !!d.fromDc });
    });
  }
  const purchases = S.items.map(r => { const dt = toDate(r.invoiceDate); return { invoiceNo: r.invoiceNo, date: dt ? mKey(dt) + "-" + String(dt.getDate()).padStart(2, "0") : "", month: dt ? mKey(dt) : "", pid: r.dhhId, mat: r.mat, desc: r.desc, div: r.divCode || "", qty: r.qty, taxable: r.taxable, igst: r.igst, sold: r.soldQty || 0, avail: r.availQty ?? r.qty, exp: r.exp, unitCost: r.qty ? r2(r.taxable / r.qty) : 0, mrp: r.mrp, batch: r.batch, serial: r.serial || "", invoiceDate: r.invoiceDate }; });
  const receipts = Object.entries(S.receipts || {}).filter(([, r]) => r.status !== "cancelled").map(([id, r]) => ({ id, no: r.no, date: r.date, month: r.date.slice(0, 7), customerId: r.customerId, customer: r.customer?.name || "", mode: r.mode, amount: r.amount, applied: r2(r.amount - (r.unallocated || 0)) }));
  return { sales, purchases, receipts };
}
function dashRange() {
  const t = new Date(); const cur = mKey(t); const fyStart = t.getMonth() >= 3 ? `${t.getFullYear()}-04` : `${t.getFullYear() - 1}-04`;
  const r = S.dash.range;
  if (r === "fy") return { from: fyStart, to: mAdd(fyStart, 11), label: `FY ${fyOf(todayIso()).replace("-", "–")}` };
  if (r === "lfy") return { from: mAdd(fyStart, -12), to: mAdd(fyStart, -1), label: `FY ${fyOf(mAdd(fyStart, -12) + "-01").replace("-", "–")}` };
  if (r === "12m") return { from: mAdd(cur, -11), to: cur, label: "Last 12 months" };
  if (r === "3m") return { from: mAdd(cur, -2), to: cur, label: "Last 3 months" };
  return { from: "2000-01", to: cur, label: "All time" };
}
function dashCompute() {
  const F = dashFacts(); const R = dashRange(); const div = S.dash.div; const cur = mKey(new Date());
  const inDiv = x => !div || x.div === div;
  const S0 = F.sales.filter(inDiv), P0 = F.purchases.filter(inDiv);
  const inR = x => x.month && x.month >= R.from && x.month <= R.to;
  const sales = S0.filter(inR), purch = P0.filter(inR), recs = F.receipts.filter(inR);
  // month axis: range clipped to data and today
  const firstData = [...S0.map(x => x.month), ...P0.map(x => x.month)].filter(Boolean).sort()[0] || cur;
  const from = R.from < firstData ? (S.dash.range === "all" ? firstData : R.from) : R.from; const to = R.to > cur ? cur : R.to;
  const months = mRange(from, to);
  const agg = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); (m[k] ||= []).push(x); } return m; };
  const sum = (arr, k) => r2(arr.reduce((a, x) => a + (x[k] || 0), 0));
  const bySM = agg(sales, x => x.month), byPM = agg(purch, x => x.month), byRM = agg(recs, x => x.month);
  const monthly = months.map(k => { const s = bySM[k] || []; const t = sum(s, "taxable"), c = sum(s, "cost");
    return { month: k, label: mLabel(k), invoices: new Set(s.map(x => x.invId)).size, qty: sum(s, "qty"), turnover: t, gst: sum(s, "gst"), gross: sum(s, "total"), cost: c, margin: r2(t - c), marginPct: t ? (t - c) / t : null, purchases: sum(byPM[k] || [], "taxable"), collections: sum(byRM[k] || [], "amount") }; });
  const T = { turnover: sum(sales, "taxable"), gst: sum(sales, "gst"), gross: sum(sales, "total"), cost: sum(sales, "cost"), qty: sum(sales, "qty"), invoices: new Set(sales.map(x => x.invId)).size, customers: new Set(sales.map(x => x.customerId)).size, purchases: sum(purch, "taxable"), collections: sum(recs, "amount") };
  T.margin = r2(T.turnover - T.cost); T.marginPct = T.turnover ? T.margin / T.turnover : null; T.avgInvoice = T.invoices ? T.turnover / T.invoices : 0;
  const rank = (arr, key, label, extra) => Object.entries(agg(arr, x => x[key])).map(([k, a]) => ({ key: k, name: label(a[0], k), turnover: sum(a, "taxable"), cost: sum(a, "cost"), qty: sum(a, "qty"), invoices: new Set(a.map(x => x.invId)).size, ...(extra ? extra(a) : {}) })).map(x => ({ ...x, margin: r2(x.turnover - x.cost), marginPct: x.turnover ? (x.turnover - x.cost) / x.turnover : null, share: T.turnover ? x.turnover / T.turnover : 0 })).sort((a, b) => b.turnover - a.turnover);
  const byCustomer = rank(sales, "customerId", (x) => x.customer);
  const byDivision = rank(sales, "div", (x, k) => k ? `${k} · ${divName(k)}` : "Not set");
  const byProduct = rank(sales, "mat", x => x.desc, a => ({ mat: a[0].mat }));
  // stock & receivables (current, not range-bound)
  const stockLines = P0.filter(x => x.avail > 0); const stockValue = r2(stockLines.reduce((a, x) => a + x.avail * x.unitCost, 0));
  const open = (typeof openInvoices === "function" ? openInvoices() : []).filter(x => !div || (x.d.lines || []).some(l => (S.items.find(r => r.key === l.key) || {}).divCode === div));
  const outstanding = r2(open.reduce((a, x) => a + x.bal, 0)); const today = todayIso();
  const overdue = r2(open.filter(x => x.due < today).reduce((a, x) => a + x.bal, 0));
  let atHosp = 0; for (const d of Object.values(S.sales)) { if (d.type !== "DC" || d.status === "cancelled") continue; for (const l of d.lines || []) { const it = S.items.find(r => r.key === l.key); if (div && (!it || it.divCode !== div)) continue; atHosp += dcPending(l) * (l.rate || l.mrp || 0); } }
  const fc = dashForecast(S0, cur);
  return { R, months, monthly, T, byCustomer, byDivision, byProduct, stockValue, stockLines, outstanding, overdue, atHosp: r2(atHosp), fc, facts: F, sales, purch, recs, S0, P0 };
}
/* ---------- forecast ---------- */
function dashForecast(salesAll, cur) {
  const byM = {}; for (const x of salesAll) byM[x.month] = (byM[x.month] || 0) + x.taxable;
  const first = Object.keys(byM).sort()[0];
  const out = { method: "", confidence: "low", history: [], next: [], note: "" };
  if (!first) { out.method = "No sales yet"; out.note = "Create tax invoices to see a forecast."; for (let i = 1; i <= 3; i++) out.next.push({ month: mAdd(cur, i), label: mLabel(mAdd(cur, i)), value: 0, low: 0, high: 0 }); return out; }
  const t = new Date(); const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); const elapsed = Math.max(1, t.getDate());
  const hist = mRange(first, cur).map(k => ({ month: k, actual: r2(byM[k] || 0), value: k === cur ? r2((byM[k] || 0) * dim / elapsed) : r2(byM[k] || 0), partial: k === cur }));
  out.history = hist;
  // use completed months for the model; the current month only counts once it is 2/3 done, or when there is too little history
  const full = hist.filter(h => !h.partial); const useCur = elapsed / dim >= 0.66 || full.length < 2;
  const basis = useCur ? hist : full; const ys = basis.map(h => h.value); const n = ys.length;
  let level, slope = 0, resid = [];
  if (n >= 6) {
    const L = ys.slice(-6); const xs = L.map((_, i) => i); const mx = 2.5, my = L.reduce((a, b) => a + b, 0) / 6;
    slope = xs.reduce((a, x, i) => a + (x - mx) * (L[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0); level = my + slope * (5 - mx);
    resid = L.map((y, i) => y - (my + slope * (i - mx)));
    const ma3 = ys.slice(-3).reduce((a, b) => a + b, 0) / 3; level = 0.6 * level + 0.4 * ma3; // blend trend with recent average
    out.method = "Trend of the last 6 months, blended with the 3-month average"; out.confidence = n >= 12 ? "medium" : "medium-low";
  } else if (n >= 3) {
    const L = ys.slice(-3); level = L.reduce((a, b) => a + b, 0) / 3; slope = ((L[2] - L[0]) / 2) * 0.5; resid = L.map(y => y - level);
    out.method = "Average of the last 3 months with half the recent trend"; out.confidence = "low";
  } else {
    level = ys[n - 1]; slope = 0; out.method = n === 1 && hist[0].partial ? "This month's run-rate (sales so far ÷ days elapsed × days in month)" : "Average of the months so far"; if (n === 2) level = (ys[0] + ys[1]) / 2; out.confidence = "very low";
  }
  const sd = resid.length > 1 ? Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (resid.length - 1)) : 0;
  const recent = ys.slice(-3), avg3 = recent.reduce((a, b) => a + b, 0) / recent.length, maxY = Math.max(...ys);
  for (let i = 1; i <= 3; i++) { const v = Math.min(Math.max(0, level + slope * i, avg3 * 0.5), Math.max(maxY * 1.25, avg3 * 1.5)); const band = Math.max(sd * Math.sqrt(i), v * (out.confidence === "very low" ? 0.35 : out.confidence === "low" ? 0.25 : 0.15));
    out.next.push({ month: mAdd(cur, i), label: mLabel(mAdd(cur, i)), value: r2(v), low: r2(Math.max(0, v - band)), high: r2(v + band) }); }
  out.note = (useCur ? "" : `This month (${mLabel(cur)}) is still in progress, so it isn't used yet. `) + (n < 6 ? `Based on ${n} month${n === 1 ? "" : "s"} of sales. Treat it as a rough guide; it firms up after 6 months of invoices.` : `Based on ${n} months of sales.`);
  return out;
}
/* ---------- suggestions ---------- */
function dashSuggestions(D) {
  const s = []; const T = D.T; const today = new Date(); const fcSum = D.fc.next.reduce((a, x) => a + x.value, 0);
  const add = (lvl, title, text, action) => s.push({ lvl, title, text, action });
  if (D.fc.next[0]) { const H = D.fc.history.filter(h => !h.partial).slice(-3); const last = H.length ? H.reduce((x, h) => x + h.actual, 0) / H.length : 0; const g = last ? (fcSum / 3 - last) / last : 0;
    add(g < -0.05 ? "warn" : "good", "Next 3 months", `Expected turnover about ₹ ${lakh(fcSum)} (excl. GST) for ${D.fc.next.map(x => x.label).join(", ")}${last ? `, about ₹ ${lakh(fcSum / 3)} a month: ${g >= 0 ? "up" : "down"} ${Math.abs(g * 100).toFixed(0)}% on the average of the last ${H.length} full month${H.length === 1 ? "" : "s"}` : ""}.`, g < -0.05 ? "Line up surgeries and orders now: follow up open quotations and sales orders in Sell Order." : "Keep stock ready for the expected demand (see reorder list below)."); }
  // velocity & reorder
  const days = Math.max(30, (today - new Date(D.months[0] + "-01")) / 864e5); const vel = {};
  for (const x of D.S0) vel[x.mat] = (vel[x.mat] || 0) + x.qty;
  const stockByMat = {}; for (const p of D.P0) stockByMat[p.mat] = (stockByMat[p.mat] || 0) + Math.max(0, p.avail);
  const reorder = Object.entries(vel).map(([mat, q]) => ({ mat, perMonth: q / days * 30, stock: stockByMat[mat] || 0, desc: (D.P0.find(p => p.mat === mat) || {}).desc || mat })).filter(x => vel[x.mat] >= 2 && x.stock < x.perMonth * 1.5).sort((a, b) => (a.stock / a.perMonth) - (b.stock / b.perMonth)).slice(0, 8);
  if (reorder.length) add("warn", "Reorder soon", `${reorder.length} product${reorder.length === 1 ? " has" : "s have"} less than 6 weeks of stock at the current selling pace: ${reorder.slice(0, 4).map(x => `${x.mat} (${x.stock} left, ~${x.perMonth.toFixed(1)}/month)`).join("; ")}${reorder.length > 4 ? " …" : ""}.`, "Raise a purchase order in the Purchase Order panel.");
  // expiring stock
  const in6 = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  const exp = D.P0.filter(p => p.avail > 0 && toDate(p.exp) && toDate(p.exp) <= in6); const expVal = exp.reduce((a, p) => a + p.avail * p.unitCost, 0);
  if (exp.length) add("bad", "Stock expiring within 6 months", `${exp.reduce((a, p) => a + p.avail, 0)} units worth ₹ ${lakh(expVal)} at cost expire by ${dmy(in6.toISOString().slice(0, 10))}.`, "Offer these first (they're listed first when you add products to a document), or ask the supplier about returns.");
  // slow movers
  const soldMats = new Set(D.S0.map(x => x.mat)); const slow = {}; for (const p of D.P0) { if (p.avail <= 0 || soldMats.has(p.mat)) continue; const age = (today - (toDate(p.invoiceDate) || today)) / 864e5; if (age < 60) continue; (slow[p.mat] ||= { mat: p.mat, desc: p.desc, qty: 0, val: 0 }); slow[p.mat].qty += p.avail; slow[p.mat].val += p.avail * p.unitCost; }
  const slowL = Object.values(slow).sort((a, b) => b.val - a.val);
  if (slowL.length) add("warn", "Slow-moving stock", `${slowL.length} products bought 60+ days ago have no sales yet, worth ₹ ${lakh(slowL.reduce((a, x) => a + x.val, 0))} at cost. Largest: ${slowL.slice(0, 3).map(x => x.mat).join(", ")}.`, "Promote them to surgeons, bundle them in quotations, or pause reordering.");
  // concentration
  if (D.byCustomer[0] && D.byCustomer.length > 1 && D.byCustomer[0].share > 0.4) add("warn", "Customer concentration", `${D.byCustomer[0].name} is ${(D.byCustomer[0].share * 100).toFixed(0)}% of turnover in this period.`, "Grow other hospitals to reduce the risk if this account slows down.");
  if (D.byCustomer.length) add("good", "Top customers", `${D.byCustomer.slice(0, 3).map(c => `${c.name} (₹ ${lakh(c.turnover)})`).join(", ")}.`, "Check their open quotations and keep their regular items in stock.");
  // receivables
  if (D.overdue > 0) add("bad", "Overdue payments", `₹ ${lakh(D.overdue)} is past its due date, of ₹ ${lakh(D.outstanding)} outstanding.`, "Work through Payment Follows, starting with the oldest.");
  else if (D.outstanding > 0) add("good", "Receivables", `₹ ${lakh(D.outstanding)} outstanding, none overdue.`, "");
  // unbilled at hospitals
  if (D.atHosp > 0) add("warn", "Goods at hospitals not billed", `₹ ${lakh(D.atHosp)} of goods are out on delivery challans.`, "Bill used items and return unused ones in Supply & Goods.");
  // margin by division
  const dm = D.byDivision.filter(x => x.turnover > 0 && x.marginPct != null); if (dm.length > 1) { const lo = dm.reduce((a, b) => a.marginPct < b.marginPct ? a : b); add("warn", "Lowest margin division", `${lo.name}: ${(lo.marginPct * 100).toFixed(1)}% gross margin vs ${(T.marginPct * 100).toFixed(1)}% overall.`, "Review its selling rates and discounts."); }
  if (T.marginPct != null && T.marginPct < 0.1 && T.turnover > 0) add("bad", "Thin margin", `Gross margin is ${(T.marginPct * 100).toFixed(1)}% this period.`, "Check hospital/surgeon discounts on recent invoices.");
  if (!D.S0.length) add("warn", "No sales data yet", "The dashboard fills in as you create tax invoices.", "Start in Invoice → Sales tax invoices, or bill a challan from Supply & Goods.");
  return { list: s, reorder, expiring: exp, slow: slowL };
}

/* ---------- render ---------- */
function renderSalesDash() {
  const el = $("tab-salesdash"); if (!el) return; const D = dashCompute(); const G = dashSuggestions(D); S._dashLast = { D, G };
  const T = D.T; const pct = v => v == null ? "—" : (v * 100).toFixed(1) + "%"; const fcSum = D.fc.next.reduce((a, x) => a + x.value, 0);
  const pill2 = (lvl) => lvl === "bad" ? '<span class="pill bad">⚠ Act</span>' : lvl === "warn" ? '<span class="pill warn">● Watch</span>' : '<span class="pill good">✓ Good</span>';
  el.innerHTML = `
  <div class="panel pad dash-head">
    <div class="row" style="justify-content:space-between">
      <div><h2 style="margin:0">Sales analysis</h2><div class="note">${esc(D.R.label)}${S.dash.div ? " · " + esc(divName(S.dash.div)) : " · all divisions"} · turnover is the taxable value of active tax invoices (excl. GST)</div></div>
      <div class="row no-print">
        <select data-dash="range" aria-label="Period"><option value="fy" ${S.dash.range === "fy" ? "selected" : ""}>This financial year</option><option value="lfy" ${S.dash.range === "lfy" ? "selected" : ""}>Last financial year</option><option value="12m" ${S.dash.range === "12m" ? "selected" : ""}>Last 12 months</option><option value="3m" ${S.dash.range === "3m" ? "selected" : ""}>Last 3 months</option><option value="all" ${S.dash.range === "all" ? "selected" : ""}>All time</option></select>
        <select data-dash="div" aria-label="Division"><option value="">All divisions</option>${S.divisions.map(d => `<option value="${esc(d.code)}" ${S.dash.div === d.code ? "selected" : ""}>${esc(d.code)} · ${esc(d.name)}</option>`).join("")}</select>
        <button class="btn" data-dashx="xlsx">Download Excel report</button>
        <button class="btn" data-dashx="pbi">Download Power BI data</button>
        <button class="btn primary" data-dashx="pdf">Download PDF</button>
        <button class="btn" data-dashx="print">Print</button>
      </div>
    </div>
  </div>
  <div class="tiles dash-tiles">
    ${[["Turnover (excl. GST)", "₹ " + lakh(T.turnover), `${T.invoices} invoice${T.invoices === 1 ? "" : "s"} · ${T.customers} customer${T.customers === 1 ? "" : "s"}`],
      ["Gross margin", "₹ " + lakh(T.margin), `${pct(T.marginPct)} of turnover (vs purchase cost)`],
      ["Invoice value incl. GST", "₹ " + lakh(T.gross), `GST ₹ ${lakh(T.gst)}`],
      ["Collections", "₹ " + lakh(T.collections), `Outstanding ₹ ${lakh(D.outstanding)}${D.overdue ? ` · overdue ₹ ${lakh(D.overdue)}` : ""}`],
      ["Purchases", "₹ " + lakh(T.purchases), "supplier invoices in this period"],
      ["Stock at cost", "₹ " + lakh(D.stockValue), `${D.stockLines.reduce((a, x) => a + x.avail, 0)} units · at hospitals ₹ ${lakh(D.atHosp)}`],
      ["Forecast next 3 months", "₹ " + lakh(fcSum), `${esc(D.fc.next.map(x => x.label).join(", "))} · ${esc(D.fc.confidence)} confidence`]].map(([k, v, n]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v hero">${v}</div><div class="note">${n}</div></div>`).join("")}
  </div>
  <div class="panel pad">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Monthly turnover and forecast</h2><span class="note">Columns: turnover excl. GST · lighter columns: forecast, with likely range</span></div>
    <div class="chartbox"><canvas id="cMonthly" height="300" role="img" aria-label="Monthly turnover with 3-month forecast"></canvas><div class="viztip" id="tipMonthly" hidden></div></div>
    <details class="no-print"><summary class="note">Show as a table</summary>${monthlyTable(D)}</details>
  </div>
  <div class="grid2">
    <div class="panel pad"><h2>Turnover by division</h2><div class="chartbox"><canvas id="cDiv" role="img" aria-label="Turnover by division"></canvas><div class="viztip" id="tipDiv" hidden></div></div></div>
    <div class="panel pad"><h2>Top customers</h2><div class="chartbox"><canvas id="cCust" role="img" aria-label="Top customers by turnover"></canvas><div class="viztip" id="tipCust" hidden></div></div></div>
  </div>
  <div class="panel pad"><h2>What to do next</h2><p class="note" style="margin-top:0">Suggestions worked out from your sales pace, stock, expiry dates and payments. ${esc(D.fc.method)}. ${esc(D.fc.note)}</p>
    <div class="tablewrap" style="max-height:none"><table><tbody>${G.list.map(x => `<tr><td style="width:96px">${pill2(x.lvl)}</td><td style="width:200px"><b>${esc(x.title)}</b></td><td class="desc" style="max-width:none">${esc(x.text)}${x.action ? `<div class="note">→ ${esc(x.action)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>
  </div>
  <div class="grid2">
    <div class="panel pad"><h2>Forecast</h2><div class="tablewrap" style="max-height:none"><table><thead><tr><th>Month</th><th class="num">Expected (₹)</th><th class="num">Likely low</th><th class="num">Likely high</th></tr></thead><tbody>${D.fc.next.map(x => `<tr><td>${esc(x.label)}</td><td class="num"><b>${inr(x.value, 0)}</b></td><td class="num">${inr(x.low, 0)}</td><td class="num">${inr(x.high, 0)}</td></tr>`).join("")}</tbody></table></div><p class="note">${esc(D.fc.method)} · ${esc(D.fc.confidence)} confidence.</p></div>
    <div class="panel pad"><h2>Top products</h2><div class="tablewrap" style="max-height:360px"><table><thead><tr><th>Material</th><th>Description</th><th class="num">QTY</th><th class="num">Turnover (₹)</th><th class="num">Margin</th></tr></thead><tbody>${D.byProduct.slice(0, 15).map(p => `<tr><td class="code">${esc(p.mat)}</td><td class="desc">${esc(p.name)}</td><td class="num">${inr(p.qty, 0)}</td><td class="num">${inr(p.turnover, 0)}</td><td class="num">${pct(p.marginPct)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No sales in this period.</td></tr>`}</tbody></table></div></div>
  </div>
  ${G.reorder.length ? `<div class="panel pad"><h2>Reorder list</h2><div class="tablewrap" style="max-height:none"><table><thead><tr><th>Material</th><th>Description</th><th class="num">In stock</th><th class="num">Selling / month</th><th class="num">Weeks of stock</th></tr></thead><tbody>${G.reorder.map(x => `<tr><td class="code">${esc(x.mat)}</td><td class="desc">${esc(x.desc)}</td><td class="num">${x.stock}</td><td class="num">${x.perMonth.toFixed(1)}</td><td class="num">${(x.stock / x.perMonth * 4.3).toFixed(1)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  ensureBound(el, dashEvent);
  requestAnimationFrame(() => { drawMonthly($("cMonthly"), D, true); drawRanked($("cDiv"), D.byDivision.slice(0, 8), "tipDiv", true); drawRanked($("cCust"), D.byCustomer.slice(0, 8), "tipCust", true); });
}
function monthlyTable(D) {
  return `<div class="tablewrap" style="max-height:none"><table><thead><tr><th>Month</th><th class="num">Invoices</th><th class="num">Turnover</th><th class="num">GST</th><th class="num">Cost</th><th class="num">Margin</th><th class="num">Margin %</th><th class="num">Purchases</th><th class="num">Collections</th></tr></thead><tbody>
  ${D.monthly.map(m => `<tr><td>${esc(m.label)}</td><td class="num">${m.invoices}</td><td class="num">${inr(m.turnover, 0)}</td><td class="num">${inr(m.gst, 0)}</td><td class="num">${inr(m.cost, 0)}</td><td class="num">${inr(m.margin, 0)}</td><td class="num">${m.marginPct == null ? "—" : (m.marginPct * 100).toFixed(1) + "%"}</td><td class="num">${inr(m.purchases, 0)}</td><td class="num">${inr(m.collections, 0)}</td></tr>`).join("")}
  ${D.fc.next.map(x => `<tr><td>${esc(x.label)} <span class="note">forecast</span></td><td></td><td class="num">${inr(x.value, 0)}</td><td colspan="6" class="note">likely ${inr(x.low, 0)} – ${inr(x.high, 0)}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------- charts (canvas, so the same drawing goes into the PDF) ---------- */
function vizTokens(forPrint) {
  const cs = getComputedStyle(document.documentElement); const g = n => cs.getPropertyValue(n).trim();
  if (forPrint) return { surface: "#ffffff", ink: "#0b0b0b", muted: "#52514e", grid: "#e4e4e1", s1: "#2a78d6", fc: "#9ec5f4", band: "#52514e" };
  const dark = matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light" || document.documentElement.dataset.theme === "dark";
  return { surface: g("--surface"), ink: g("--ink"), muted: g("--muted"), grid: g("--line"), s1: dark ? "#3987e5" : "#2a78d6", fc: dark ? "#1c5cab" : "#9ec5f4", band: g("--muted") };
}
function setupCanvas(cv, h, wOverride) {
  const w = wOverride || cv.parentElement.clientWidth || 700; const dpr = wOverride ? 2 : (window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px";
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.font = "12px 'IBM Plex Sans', system-ui, sans-serif"; return { ctx, w, h };
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
const axisFmt = v => v >= 1e7 ? (v / 1e7).toFixed(v % 1e7 ? 1 : 0) + " Cr" : v >= 1e5 ? (v / 1e5).toFixed(v % 1e5 ? 1 : 0) + " L" : v >= 1e3 ? (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + "K" : String(Math.round(v));
function roundTop(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h); ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h); ctx.closePath(); }
function drawMonthly(cv, D, interactive, opts = {}) {
  if (!cv) return; const t = vizTokens(opts.print); const { ctx, w, h } = setupCanvas(cv, opts.h || 300, opts.w);
  const pts = [...D.monthly.map(m => ({ label: m.label, v: m.turnover, kind: "a", m })), ...D.fc.next.map(f => ({ label: f.label, v: f.value, lo: f.low, hi: f.high, kind: "f", f }))];
  const L = 56, Rr = 12, Tt = 26, B = 34; const pw = w - L - Rr, ph = h - Tt - B;
  ctx.fillStyle = t.surface; ctx.fillRect(0, 0, w, h);
  const raw = Math.max(1, ...pts.map(p => p.hi || p.v)); const stepV = niceMax(raw / 4); const nT = Math.ceil(raw / stepV); const max = stepV * nT; const y = v => Tt + ph - v / max * ph;
  ctx.strokeStyle = t.grid; ctx.lineWidth = 1; ctx.fillStyle = t.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= nT; i++) { const v = stepV * i; const yy = Math.round(y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke(); ctx.fillText(axisFmt(v), L - 8, yy); }
  const n = pts.length; const slot = pw / Math.max(n, 1); const bw = Math.min(24, slot * 0.6); const rects = [];
  const step = Math.ceil(n / Math.floor(pw / 52));
  pts.forEach((p, i) => { const cx = L + slot * (i + 0.5); const x = cx - bw / 2;
    if (p.v > 0) { ctx.fillStyle = p.kind === "f" ? t.fc : t.s1; const top = y(p.v); roundTop(ctx, x, top, bw, Tt + ph - top, 4); ctx.fill(); }
    if (p.kind === "f" && p.hi > p.lo) { ctx.strokeStyle = t.band; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, y(p.hi)); ctx.lineTo(cx, y(p.lo)); ctx.moveTo(cx - 4, y(p.hi)); ctx.lineTo(cx + 4, y(p.hi)); ctx.moveTo(cx - 4, y(p.lo)); ctx.lineTo(cx + 4, y(p.lo)); ctx.stroke(); }
    if (i % step === 0 || p.kind === "f") { ctx.fillStyle = p.kind === "f" ? t.ink : t.muted; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(p.label, cx, Tt + ph + 8); }
    rects.push({ x: cx - slot / 2, w: slot, p }); });
  const lastA = pts.filter(p => p.kind === "a").pop(); const iA = pts.indexOf(lastA);
  if (lastA && lastA.v > 0) { ctx.fillStyle = t.ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.fillText("₹" + lakh(lastA.v), L + slot * (iA + 0.5), y(lastA.v) - 6); }
  const fIdx = pts.findIndex(p => p.kind === "f"); if (fIdx >= 0) { ctx.fillStyle = t.muted; ctx.font = "12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("Forecast →", L + slot * fIdx + 2, 6); }
  ctx.strokeStyle = t.grid; ctx.beginPath(); ctx.moveTo(L, Tt + ph + 0.5); ctx.lineTo(L + pw, Tt + ph + 0.5); ctx.stroke();
  if (interactive) hookTip(cv, $("tipMonthly"), (mx) => { const r = rects.find(r => mx >= r.x && mx < r.x + r.w); if (!r) return null; const p = r.p;
    return p.kind === "f" ? [`${p.label} (forecast)`, `Expected ₹ ${inr(p.v, 0)}`, `Likely ₹ ${inr(p.lo, 0)} – ${inr(p.hi, 0)}`] : [p.label, `Turnover ₹ ${inr(p.v, 0)}`, `Margin ₹ ${inr(p.m.margin, 0)}${p.m.marginPct != null ? ` (${(p.m.marginPct * 100).toFixed(1)}%)` : ""}`, `${p.m.invoices} invoice${p.m.invoices === 1 ? "" : "s"}`]; });
}
function drawRanked(cv, rows, tipId, interactive, opts = {}) {
  if (!cv) return; const t = vizTokens(opts.print); const n = Math.max(rows.length, 1); const rowH = 34; const h = opts.h || Math.max(80, n * rowH + 16);
  const { ctx, w } = setupCanvas(cv, h, opts.w); ctx.fillStyle = t.surface; ctx.fillRect(0, 0, w, h);
  if (!rows.length) { ctx.fillStyle = t.muted; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("No sales in this period.", 0, 24); return; }
  const labW = Math.min(170, w * 0.36), valW = 92; const pw = w - labW - valW; const max = Math.max(...rows.map(r => r.turnover), 1); const hits = [];
  rows.forEach((r, i) => { const yy = 8 + i * rowH; const bh = 16; const len = Math.max(2, r.turnover / max * pw);
    ctx.fillStyle = t.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "12px 'IBM Plex Sans', system-ui, sans-serif";
    let name = r.name || "—"; while (ctx.measureText(name).width > labW - 10 && name.length > 4) name = name.slice(0, -2); if (name !== (r.name || "—")) name = name.slice(0, -1) + "…"; ctx.fillText(name, 0, yy + bh / 2);
    ctx.fillStyle = t.s1; ctx.beginPath(); const x0 = labW, x1 = labW + len, rr = Math.min(4, len / 2); ctx.moveTo(x0, yy); ctx.lineTo(x1 - rr, yy); ctx.quadraticCurveTo(x1, yy, x1, yy + rr); ctx.lineTo(x1, yy + bh - rr); ctx.quadraticCurveTo(x1, yy + bh, x1 - rr, yy + bh); ctx.lineTo(x0, yy + bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = t.ink; ctx.fillText(`₹${lakh(r.turnover)}`, x1 + 6, yy + bh / 2); ctx.fillStyle = t.muted; ctx.font = "11px 'IBM Plex Sans', system-ui, sans-serif"; ctx.fillText(`${(r.share * 100).toFixed(0)}%`, x1 + 6 + ctx.measureText(`₹${lakh(r.turnover)}`).width + 14, yy + bh / 2);
    hits.push({ y0: yy - 8, y1: yy + rowH - 8, r }); });
  if (interactive) hookTip(cv, $(tipId), (mx, my) => { const hh = hits.find(x => my >= x.y0 && my < x.y1); if (!hh) return null; const r = hh.r; return [r.name, `Turnover ₹ ${inr(r.turnover, 0)} (${(r.share * 100).toFixed(1)}%)`, `Margin ${r.marginPct == null ? "—" : (r.marginPct * 100).toFixed(1) + "%"}`, `${r.invoices} invoice${r.invoices === 1 ? "" : "s"} · ${inr(r.qty, 0)} units`]; });
}
function hookTip(cv, tip, fn) {
  if (!tip) return; cv.onpointermove = e => { const b = cv.getBoundingClientRect(); const lines = fn(e.clientX - b.left, e.clientY - b.top); if (!lines) { tip.hidden = true; return; }
    tip.replaceChildren(...lines.map((l, i) => { const d = document.createElement("div"); d.textContent = l; if (!i) d.style.fontWeight = "600"; return d; }));
    tip.hidden = false; const x = Math.min(e.clientX - b.left + 14, b.width - 200); tip.style.left = Math.max(0, x) + "px"; tip.style.top = (e.clientY - b.top + 14) + "px"; };
  cv.onpointerleave = () => tip.hidden = true;
}
let _dashRedraw; window.addEventListener("resize", () => { clearTimeout(_dashRedraw); _dashRedraw = setTimeout(() => { if (S.tab === "salesdash" && S._dashLast) { const { D } = S._dashLast; drawMonthly($("cMonthly"), D, true); drawRanked($("cDiv"), D.byDivision.slice(0, 8), "tipDiv", true); drawRanked($("cCust"), D.byCustomer.slice(0, 8), "tipCust", true); } }, 150); });

/* ---------- events & exports ---------- */
async function dashEvent(e) {
  const t = e.target;
  if (e.type === "change" && t.dataset.dash) { S.dash[t.dataset.dash] = t.value; return renderSalesDash(); }
  if (e.type !== "click") return; const b = t.closest("[data-dashx]"); if (!b) return;
  const k = b.dataset.dashx; const { D, G } = S._dashLast || {}; if (!D) return;
  b.disabled = true;
  try {
    if (k === "xlsx") await save(`Sales_Analysis_${fileTag(D)}.xlsx`, dashExcel(D, G));
    if (k === "pbi") await save(`PowerBI_Sales_Data_${stamp()}.xlsx`, dashPowerBI(D));
    if (k === "pdf") await save(`Sales_Analysis_${fileTag(D)}.pdf`, new Uint8Array(dashPdf(D, G).output("arraybuffer")));
    if (k === "print") { if (FIREBASE_MODE) { window.print(); } else { await save(`Sales_Analysis_${fileTag(D)}.pdf`, new Uint8Array(dashPdf(D, G).output("arraybuffer"))); msg($("globalmsg"), "good", "Printing isn't allowed inside claude.ai, so the report was saved as a PDF instead. Open it and print from there."); } }
  } catch (err) { msg($("globalmsg"), "bad", "Couldn't create the file: " + (err.message || err)); }
  b.disabled = false;
}
const fileTag = D => `${D.R.label.replace(/[^\w]+/g, "_")}${S.dash.div ? "_" + S.dash.div : ""}_${stamp()}`;
function sheetFrom(aoa, widths) { const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }); ws["!cols"] = (widths || aoa[0].map(h => Math.max(10, String(h).length + 2))).map(w => ({ wch: w })); if (aoa.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) }; return ws; }
function dashExcel(D, G) {
  const wb = XLSX.utils.book_new(); const T = D.T; const p = v => v == null ? "" : r2(v * 100);
  const sum = [["Sales analysis", D.R.label + (S.dash.div ? " · " + divName(S.dash.div) : " · all divisions")], ["Generated", new Date().toLocaleString("en-IN")], [], ["Measure", "Value"],
    ["Turnover excl. GST (₹)", T.turnover], ["GST (₹)", T.gst], ["Invoice value incl. GST (₹)", T.gross], ["Cost of goods sold (₹)", T.cost], ["Gross margin (₹)", T.margin], ["Gross margin %", p(T.marginPct)],
    ["Invoices", T.invoices], ["Customers", T.customers], ["Units sold", T.qty], ["Average invoice (₹)", r2(T.avgInvoice)], ["Purchases (₹)", T.purchases], ["Collections (₹)", T.collections],
    ["Outstanding now (₹)", D.outstanding], ["Overdue now (₹)", D.overdue], ["Stock at cost now (₹)", D.stockValue], ["Goods at hospitals now (₹)", D.atHosp], [], ["Forecast method", D.fc.method], ["Confidence", D.fc.confidence], ["Note", D.fc.note]];
  XLSX.utils.book_append_sheet(wb, sheetFrom(sum, [34, 60]), "Summary");
  XLSX.utils.book_append_sheet(wb, sheetFrom([["Month", "Invoices", "Units", "Turnover (₹)", "GST (₹)", "Total incl. GST (₹)", "Cost (₹)", "Margin (₹)", "Margin %", "Purchases (₹)", "Collections (₹)"], ...D.monthly.map(m => [m.label, m.invoices, m.qty, m.turnover, m.gst, m.gross, m.cost, m.margin, p(m.marginPct), m.purchases, m.collections])]), "Monthly");
  XLSX.utils.book_append_sheet(wb, sheetFrom([["Month", "Type", "Turnover (₹)", "Likely low (₹)", "Likely high (₹)"], ...D.fc.history.map(h => [mLabel(h.month), h.partial ? "Actual (month so far, projected to month end)" : "Actual", h.partial ? h.value : h.actual, "", ""]), ...D.fc.next.map(f => [f.label, "Forecast", f.value, f.low, f.high]), [], ["Method", D.fc.method], ["Confidence", D.fc.confidence]], [14, 44, 16, 16, 16]), "Forecast");
  const rk = (rows, first) => [[first, "Turnover (₹)", "Share %", "Cost (₹)", "Margin (₹)", "Margin %", "Units", "Invoices"], ...rows.map(r => [r.name, r.turnover, r2(r.share * 100), r.cost, r.margin, p(r.marginPct), r.qty, r.invoices])];
  XLSX.utils.book_append_sheet(wb, sheetFrom(rk(D.byDivision, "Division"), [30, 14, 10, 14, 14, 10, 8, 9]), "By division");
  XLSX.utils.book_append_sheet(wb, sheetFrom(rk(D.byCustomer, "Customer"), [40, 14, 10, 14, 14, 10, 8, 9]), "By customer");
  XLSX.utils.book_append_sheet(wb, sheetFrom([["Material code", "Description", "Turnover (₹)", "Share %", "Cost (₹)", "Margin (₹)", "Margin %", "Units", "Invoices"], ...D.byProduct.map(r => [r.mat, r.name, r.turnover, r2(r.share * 100), r.cost, r.margin, p(r.marginPct), r.qty, r.invoices])], [18, 50, 14, 9, 14, 14, 9, 8, 9]), "By product");
  XLSX.utils.book_append_sheet(wb, sheetFrom([["Status", "Topic", "Finding", "Suggested action"], ...G.list.map(x => [x.lvl === "bad" ? "Act" : x.lvl === "warn" ? "Watch" : "Good", x.title, x.text, x.action])], [8, 26, 80, 60]), "Suggestions");
  if (G.reorder.length) XLSX.utils.book_append_sheet(wb, sheetFrom([["Material code", "Description", "In stock", "Selling per month", "Weeks of stock"], ...G.reorder.map(x => [x.mat, x.desc, x.stock, r2(x.perMonth), r2(x.stock / x.perMonth * 4.3)])], [18, 50, 10, 16, 14]), "Reorder");
  XLSX.utils.book_append_sheet(wb, sheetFrom([["Invoice", "Date", "Customer", "DHH PID", "Material", "Description", "Division", "Qty", "Turnover (₹)", "GST (₹)", "Total (₹)", "Cost (₹)", "Margin (₹)"], ...D.sales.map(x => [x.invNo, isoToDate(x.date), x.customer, x.pid, x.mat, x.desc, x.div, x.qty, x.taxable, x.gst, x.total, x.cost, r2(x.taxable - x.cost)])], [18, 11, 30, 10, 16, 44, 8, 6, 13, 11, 13, 13, 13]), "Sales lines");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }));
}
function dashPowerBI(D) {
  // Star schema for Power BI Desktop: Get Data → Excel workbook → tick every table. All history (not just the selected period).
  const F = D.facts; const wb = XLSX.utils.book_new(); const dk = iso => iso ? +iso.replace(/-/g, "").slice(0, 8) : null;
  const custs = Object.entries(S.customers).map(([id, c]) => [id, c.name, c.gstin || "", c.stateCode || "", c.stateName || "", c.creditDays ?? 30]);
  F.sales.forEach(x => { if (!S.customers[x.customerId] && !custs.some(c => c[0] === x.customerId)) custs.push([x.customerId, x.customer, "", x.state, "", 30]); });
  const prods = Object.values(S.master.reduce((m, p) => (m[p.mat] = p, m), {})).map(p => [p.mat, p.desc, p.hsn, p.uom, (p.divCodes || "").split(", ")[0] || "", p.mrp, p.rate, p.igstRate]);
  const allDates = [...F.sales.map(x => x.date), ...F.purchases.map(x => x.date), ...F.receipts.map(x => x.date)].filter(Boolean).sort();
  const d0 = allDates[0] ? isoToDate(allDates[0].slice(0, 7) + "-01") : new Date(new Date().getFullYear(), 3, 1); const d1 = new Date(new Date().getFullYear() + 1, 2, 31);
  const dates = []; for (let d = new Date(d0); d <= d1 && dates.length < 4000; d.setDate(d.getDate() + 1)) { const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; const fy = fyOf(iso);
    dates.push([dk(iso), new Date(d), d.getFullYear(), d.getMonth() + 1, MON[d.getMonth()], `${MON[d.getMonth()]} ${d.getFullYear()}`, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, "Q" + (Math.floor(((d.getMonth() + 9) % 12) / 3) + 1), "FY " + fy, ((d.getMonth() + 9) % 12) + 1]); }
  const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, sheetFrom(aoa), name);
  add("FactSales", [["InvoiceNo", "DateKey", "Date", "CustomerID", "MaterialCode", "DHH_PID", "DivisionCode", "Qty", "TaxableValue", "GST", "TotalValue", "Cost", "Margin", "FromChallan"], ...F.sales.map(x => [x.invNo, dk(x.date), isoToDate(x.date), x.customerId, x.mat, x.pid, x.div, x.qty, x.taxable, x.gst, x.total, x.cost, r2(x.taxable - x.cost), x.fromDc ? "Yes" : "No"])]);
  add("FactPurchases", [["SupplierInvoiceNo", "DateKey", "Date", "MaterialCode", "DHH_PID", "DivisionCode", "Batch", "Serial", "ExpiryDate", "Qty", "TaxableValue", "IGST", "UnitCost"], ...F.purchases.map(x => [x.invoiceNo, dk(x.date), x.date ? isoToDate(x.date) : null, x.mat, x.pid, x.div, x.batch, x.serial, toDate(x.exp), x.qty, x.taxable, x.igst, x.unitCost])]);
  add("FactStock", [["DHH_PID", "MaterialCode", "DivisionCode", "Batch", "Serial", "ExpiryDate", "QtyReceived", "QtySold", "QtyAvailable", "UnitCost", "StockValueAtCost", "SnapshotDate"], ...F.purchases.map(x => [x.pid, x.mat, x.div, x.batch, x.serial, toDate(x.exp), x.qty, x.sold, x.avail, x.unitCost, r2(x.avail * x.unitCost), new Date()])]);
  add("FactReceipts", [["ReceiptNo", "DateKey", "Date", "CustomerID", "Mode", "Amount", "AppliedToInvoices"], ...F.receipts.map(x => [x.no, dk(x.date), isoToDate(x.date), x.customerId, x.mode, x.amount, x.applied])]);
  add("FactForecast", [["MonthKey", "Month", "Type", "Turnover", "Low", "High"], ...D.fc.history.map(h => [h.month, mLabel(h.month), h.partial ? "Actual (projected month end)" : "Actual", h.partial ? h.value : h.actual, null, null]), ...D.fc.next.map(f => [f.month, f.label, "Forecast", f.value, f.low, f.high])]);
  add("DimDate", [["DateKey", "Date", "Year", "MonthNo", "Month", "MonthName", "YearMonth", "FiscalQuarter", "FiscalYear", "FiscalMonthNo"], ...dates]);
  add("DimProduct", [["MaterialCode", "Description", "HSN", "UOM", "DivisionCode", "MRP", "LastRate", "GSTRate"], ...prods]);
  add("DimCustomer", [["CustomerID", "Customer", "GSTIN", "StateCode", "State", "CreditDays"], ...custs]);
  add("DimDivision", [["DivisionCode", "Division"], ...S.divisions.map(d => [d.code, d.name])]);
  const readme = [["How to use this file in Power BI Desktop"], ["1. Home → Get data → Excel workbook → choose this file."], ["2. In Navigator, tick all the Fact… and Dim… sheets → Load."], ["3. Model view → create these relationships (many-to-one, single direction):"],
    ["   FactSales[DateKey] → DimDate[DateKey];  FactPurchases[DateKey] → DimDate[DateKey];  FactReceipts[DateKey] → DimDate[DateKey]"], ["   FactSales[CustomerID] → DimCustomer[CustomerID];  FactReceipts[CustomerID] → DimCustomer[CustomerID]"],
    ["   FactSales[MaterialCode] → DimProduct[MaterialCode];  FactPurchases[MaterialCode] → DimProduct[MaterialCode];  FactStock[MaterialCode] → DimProduct[MaterialCode]"], ["   FactSales[DivisionCode] → DimDivision[DivisionCode];  FactPurchases[DivisionCode] → DimDivision[DivisionCode];  FactStock[DivisionCode] → DimDivision[DivisionCode]"],
    ["4. Mark DimDate as the date table (Table tools → Mark as date table → Date). Sort DimDate[MonthName] by DimDate[YearMonth] and DimDate[FiscalYear] / [FiscalQuarter] by [FiscalMonthNo]."], ["5. Add these measures (Modeling → New measure):"],
    ["   Turnover = SUM(FactSales[TaxableValue])"], ["   Gross Margin = SUM(FactSales[Margin])"], ["   Margin % = DIVIDE([Gross Margin], [Turnover])"], ["   Invoices = DISTINCTCOUNT(FactSales[InvoiceNo])"], ["   Collections = SUM(FactReceipts[Amount])"],
    ["   Stock Value = SUM(FactStock[StockValueAtCost])"], ["   Turnover PY = CALCULATE([Turnover], SAMEPERIODLASTYEAR(DimDate[Date]))"], ["   Growth % = DIVIDE([Turnover] - [Turnover PY], [Turnover PY])"], ["   Turnover FYTD = TOTALYTD([Turnover], DimDate[Date], \"3/31\")"],
    ["6. Suggested visuals: line/column of Turnover by DimDate[YearMonth] with FactForecast; bar of Turnover by DimCustomer[Customer] and DimDivision[Division]; card visuals for Turnover, Margin %, Collections, Stock Value."],
    ["7. To refresh: download this file again from the register and replace the old one (same name/path), then Home → Refresh."], [], ["Exported " + new Date().toLocaleString("en-IN") + " · values in ₹ · turnover = taxable value of active tax invoices"]];
  XLSX.utils.book_append_sheet(wb, sheetFrom(readme, [140]), "README");
  wb.SheetNames.unshift(wb.SheetNames.pop());
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }));
}
function dashPdf(D, G) {
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }); addFonts(doc);
  const co = { ...DEFAULT_COMPANY, ...S.company }; const W = 297, M = 12, INK = [34, 34, 34], GREY = [102, 102, 102], BLUE = [42, 120, 214];
  const T = D.T; const pct = v => v == null ? "—" : (v * 100).toFixed(1) + "%";
  const head = (title) => { if (co.logo) { try { doc.addImage(co.logo, "PNG", M, 8, 12, 12); } catch (e) { } } doc.setFont("FreeSans", "bold"); doc.setFontSize(14); doc.setTextColor(...INK); doc.text(title, M + 15, 14);
    doc.setFont("FreeSans", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY); doc.text(`${co.name} · ${D.R.label}${S.dash.div ? " · " + divName(S.dash.div) : " · all divisions"} · generated ${new Date().toLocaleString("en-IN")}`, M + 15, 19); };
  head("Sales analysis");
  const tiles = [["Turnover (excl. GST)", "₹ " + lakh(T.turnover), `${T.invoices} invoices · ${T.customers} customers`], ["Gross margin", "₹ " + lakh(T.margin), pct(T.marginPct) + " of turnover"], ["Incl. GST", "₹ " + lakh(T.gross), "GST ₹ " + lakh(T.gst)], ["Collections", "₹ " + lakh(T.collections), "Outstanding ₹ " + lakh(D.outstanding)], ["Stock at cost", "₹ " + lakh(D.stockValue), "At hospitals ₹ " + lakh(D.atHosp)], ["Forecast 3 months", "₹ " + lakh(D.fc.next.reduce((a, x) => a + x.value, 0)), D.fc.confidence + " confidence"]];
  const tw = (W - 2 * M - 5 * 4) / 6; tiles.forEach(([k, v, n], i) => { const x = M + i * (tw + 4); doc.setDrawColor(220); doc.setFillColor(248, 248, 247); doc.roundedRect(x, 25, tw, 22, 2, 2, "FD");
    doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.text(k, x + 3, 30); doc.setFont("FreeSans", "bold"); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(v, x + 3, 37.5); doc.setFont("FreeSans", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(n, tw - 6)[0], x + 3, 43); });
  const cv = document.createElement("canvas"); drawMonthly(cv, D, false, { print: true, w: 1100, h: 330 });
  doc.setFont("FreeSans", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text("Monthly turnover and forecast (₹, excl. GST; lighter columns = forecast with likely range)", M, 54);
  doc.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", M, 57, W - 2 * M, (W - 2 * M) * 330 / 1100);
  let y = 57 + (W - 2 * M) * 330 / 1100 + 6;
  const half = (W - 2 * M - 8) / 2; const cv2 = document.createElement("canvas"); const rows2 = D.byDivision.slice(0, 6); drawRanked(cv2, rows2, null, false, { print: true, w: 640, h: Math.max(80, rows2.length * 34 + 16) });
  const cv3 = document.createElement("canvas"); const rows3 = D.byCustomer.slice(0, 6); drawRanked(cv3, rows3, null, false, { print: true, w: 640, h: Math.max(80, rows3.length * 34 + 16) });
  if (y > 150) { doc.addPage(); head("Sales analysis (continued)"); y = 28; }
  doc.setFont("FreeSans", "bold"); doc.setFontSize(10); doc.text("Turnover by division", M, y); doc.text("Top customers", M + half + 8, y);
  const h2 = half * cv2.height / cv2.width, h3 = half * cv3.height / cv3.width; doc.addImage(cv2.toDataURL("image/jpeg", 0.9), "JPEG", M, y + 3, half, h2); doc.addImage(cv3.toDataURL("image/jpeg", 0.9), "JPEG", M + half + 8, y + 3, half, h3);
  doc.addPage(); head("Forecast, suggestions and details");
  const st = { font: "FreeSans", fontSize: 8, cellPadding: 1.6, textColor: INK, lineColor: [215, 215, 215], lineWidth: 0.2 }, hs = { font: "FreeSans", fillColor: BLUE, textColor: 255, fontSize: 8 };
  doc.autoTable({ startY: 26, margin: { left: M, right: W / 2 + 4 }, theme: "grid", styles: st, headStyles: hs, head: [["Forecast month", "Expected (₹)", "Likely low", "Likely high"]], body: D.fc.next.map(f => [f.label, inr(f.value, 0), inr(f.low, 0), inr(f.high, 0)]), columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } });
  doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(`${D.fc.method}. ${D.fc.note}`, W / 2 - M - 6), M, doc.lastAutoTable.finalY + 5);
  doc.autoTable({ startY: 26, margin: { left: W / 2 + 4, right: M }, theme: "grid", styles: st, headStyles: hs, head: [["Top products", "Units", "Turnover (₹)", "Margin"]], body: D.byProduct.slice(0, 10).map(p => [`${p.mat}  ${p.name}`.slice(0, 60), inr(p.qty, 0), inr(p.turnover, 0), pct(p.marginPct)]), columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } });
  const y2 = Math.max(doc.lastAutoTable.finalY, 60) + 10;
  doc.autoTable({ startY: y2, margin: { left: M, right: M }, theme: "grid", styles: st, headStyles: hs, head: [["", "What to do next", "Finding", "Suggested action"]], body: G.list.map(x => [x.lvl === "bad" ? "Act" : x.lvl === "warn" ? "Watch" : "Good", x.title, x.text, x.action || ""]), columnStyles: { 0: { cellWidth: 14, fontStyle: "bold" }, 1: { cellWidth: 42, fontStyle: "bold" }, 2: { cellWidth: 120 } },
    didParseCell: c => { if (c.section === "body" && c.column.index === 0) c.cell.styles.textColor = c.cell.raw === "Act" ? [180, 35, 24] : c.cell.raw === "Watch" ? [161, 92, 0] : [29, 122, 62]; } });
  doc.addPage(); head("Monthly figures");
  doc.autoTable({ startY: 26, margin: { left: M, right: M }, theme: "grid", styles: st, headStyles: hs, head: [["Month", "Invoices", "Turnover (₹)", "GST (₹)", "Cost (₹)", "Margin (₹)", "Margin %", "Purchases (₹)", "Collections (₹)"]],
    body: [...D.monthly.map(m => [m.label, m.invoices, inr(m.turnover, 0), inr(m.gst, 0), inr(m.cost, 0), inr(m.margin, 0), pct(m.marginPct), inr(m.purchases, 0), inr(m.collections, 0)]), ["Total", T.invoices, inr(T.turnover, 0), inr(T.gst, 0), inr(T.cost, 0), inr(T.margin, 0), pct(T.marginPct), inr(T.purchases, 0), inr(T.collections, 0)]],
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => [i, { halign: "right" }])), didParseCell: c => { if (c.section === "body" && c.row.index === D.monthly.length) c.cell.styles.fontStyle = "bold"; } });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 8, margin: { left: M, right: M }, theme: "grid", styles: st, headStyles: hs, head: [["Customer", "Turnover (₹)", "Share", "Margin", "Invoices"]], body: D.byCustomer.slice(0, 20).map(c => [c.name, inr(c.turnover, 0), (c.share * 100).toFixed(1) + "%", pct(c.marginPct), c.invoices]), columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } });
  const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...GREY); doc.text(`Page ${i} of ${n} · Turnover = taxable value of active tax invoices; margin = turnover − purchase cost of the PIDs sold.`, M, 203); }
  return doc;
}
