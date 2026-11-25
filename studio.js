"use strict";
/* ===== Insight Studio: build-your-own report pages (Power BI style) ===== */
const ST_PAL = { light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"], dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"] };
const ST_OTHER = { light: "#a8a7a2", dark: "#6b6a66" };
const ST_SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const ST_TYPES = [
  ["Numbers", [["card", "KPI card"], ["gauge", "Gauge (vs target)"], ["table", "Table"], ["matrix", "Matrix (pivot)"]]],
  ["Compare", [["column", "Column"], ["bar", "Bar (horizontal)"], ["stackedColumn", "Stacked column"], ["stackedBar", "Stacked bar"], ["pctColumn", "100% stacked column"], ["funnel", "Funnel"], ["waterfall", "Waterfall"]]],
  ["Trend", [["line", "Line"], ["area", "Area"]]],
  ["Part of whole", [["donut", "Donut"], ["pie", "Pie"], ["treemap", "Treemap"]]],
  ["Relationship", [["scatter", "Scatter"], ["heatmap", "Heatmap"]]],
];
const ST_TYPE_LABEL = Object.fromEntries(ST_TYPES.flatMap(g => g[1]));
const ST_USES_X = t => !["card", "gauge"].includes(t);
const ST_USES_LEGEND = t => ["column", "bar", "stackedColumn", "stackedBar", "pctColumn", "line", "area", "heatmap", "matrix"].includes(t);
const ST_NEEDS_LEGEND = t => ["stackedColumn", "stackedBar", "pctColumn", "heatmap", "matrix"].includes(t);
const ST_USES_V2 = t => t === "scatter" || t === "table";
const ST_DS = {
  sales: { label: "Sales (tax invoice lines)", period: true, dims: [["month", "Month", "time"], ["quarter", "Quarter", "time"], ["fy", "Financial year", "time"], ["date", "Day", "time"], ["customer", "Customer"], ["company", "Company"], ["product", "Product (material code)"], ["description", "Product description"], ["pid", "DHH PID"], ["state", "State"], ["hsn", "HSN"], ["invoice", "Invoice no."]],
    measures: [["taxable", "Turnover (excl. GST)", "sum", "inr"], ["total", "Value incl. GST", "sum", "inr"], ["gst", "GST", "sum", "inr"], ["cost", "Cost of goods", "sum", "inr"], ["margin", "Gross margin", "sum", "inr"], ["marginPct", "Margin %", "ratio:margin/taxable", "pct"], ["qty", "Units sold", "sum", "num"], ["invoices", "Invoices", "distinct:invoice", "num"], ["customers", "Customers", "distinct:customer", "num"], ["avgInvoice", "Average invoice value", "ratio:taxable/invoices", "inr"], ["lines", "Invoice lines", "count", "num"]] },
  stock: { label: "Purchases & stock (supplier invoice lines)", period: false, dims: [["company", "Company"], ["product", "Product (material code)"], ["description", "Product description"], ["pid", "DHH PID"], ["expMonth", "Expiry month", "time"], ["expBucket", "Expiry window", "ord"], ["month", "Purchase month", "time"], ["quarter", "Purchase quarter", "time"], ["fy", "Purchase financial year", "time"], ["supplierInvoice", "Supplier invoice"], ["batch", "Batch"]],
    measures: [["stockValue", "Stock value at cost", "sum", "inr"], ["avail", "Units in stock", "sum", "num"], ["sold", "Units sold", "sum", "num"], ["qty", "Units received", "sum", "num"], ["purchase", "Purchase value", "sum", "inr"], ["expiring6", "Expiring within 6 months (value)", "sum", "inr"], ["sellThrough", "Sell-through %", "ratio:sold/qty", "pct"], ["products", "Products", "distinct:product", "num"], ["lines", "Lines", "count", "num"]] },
  receipts: { label: "Payments received", period: true, dims: [["month", "Month", "time"], ["quarter", "Quarter", "time"], ["fy", "Financial year", "time"], ["date", "Day", "time"], ["customer", "Customer"], ["mode", "Payment mode"]],
    measures: [["amount", "Amount received", "sum", "inr"], ["applied", "Applied to invoices", "sum", "inr"], ["advance", "Advance (not applied)", "sum", "inr"], ["count", "Receipts", "count", "num"]] },
  outstanding: { label: "Outstanding invoices (now)", period: false, dims: [["ageing", "Ageing", "ord"], ["customer", "Customer"], ["company", "Company"], ["month", "Invoice month", "time"], ["dueMonth", "Due month", "time"], ["invoice", "Invoice no."]],
    measures: [["balance", "Balance due", "sum", "inr"], ["total", "Invoice value", "sum", "inr"], ["received", "Received so far", "sum", "inr"], ["count", "Invoices", "count", "num"], ["daysOverdue", "Days overdue (average)", "avg", "num"]] },
};
const ORD = { ageing: ["Not due", "1–30 days overdue", "31–60 days overdue", "61–90 days overdue", "90+ days overdue"], expBucket: ["Expired", "0–3 months", "3–6 months", "6–12 months", "12+ months", "No expiry"] };
S.st = S.st || { reportId: null, editing: null, draft: null, saving: "" }; S.reports = S.reports || {};

/* ---------- datasets ---------- */
function stQuarter(iso) { const fy = fyOf(iso); const m = +iso.slice(5, 7); return `FY${fy} Q${Math.floor(((m + 8) % 12) / 3) + 1}`; }
function stDatasets() {
  const F = dashFacts(); const base = iso => iso ? { date: iso, month: iso.slice(0, 7), quarter: stQuarter(iso), fy: "FY " + fyOf(iso) } : { date: "", month: "", quarter: "", fy: "" };
  const cn = c => c ? `${c} · ${divName(c)}` : "Not set"; const today = new Date(); const in6 = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  const sales = F.sales.map(x => ({ ...base(x.date), customer: x.customer || "—", company: cn(x.div), product: x.mat, description: x.desc, pid: x.pid, state: STATES[x.state] || x.state || "—", hsn: x.hsn, invoice: x.invNo, qty: x.qty, taxable: x.taxable, gst: x.gst, total: x.total, cost: x.cost, margin: r2(x.taxable - x.cost), _cust: x.customerId, _div: x.div }));
  const stock = F.purchases.map(p => { const e = toDate(p.exp); const mo = e ? (e.getFullYear() - today.getFullYear()) * 12 + e.getMonth() - today.getMonth() : null;
    return { ...base(p.date), company: cn(p.div), product: p.mat, description: p.desc, pid: p.pid, batch: p.batch, supplierInvoice: p.invoiceNo, expMonth: e ? mKey(e) : "", expBucket: !e ? "No expiry" : e < today ? "Expired" : mo < 3 ? "0–3 months" : mo < 6 ? "3–6 months" : mo < 12 ? "6–12 months" : "12+ months",
      qty: p.qty, sold: p.sold, avail: p.avail, purchase: p.taxable, stockValue: r2(Math.max(0, p.avail) * p.unitCost), expiring6: e && e <= in6 && p.avail > 0 ? r2(p.avail * p.unitCost) : 0, _div: p.div }; });
  const receipts = F.receipts.map(r => ({ ...base(r.date), customer: r.customer || "—", mode: r.mode, amount: r.amount, applied: r.applied, advance: r2(r.amount - r.applied), _cust: r.customerId }));
  const todayIso_ = todayIso(); const itemDiv = new Map(S.items.map(r => [r.key, r.divCode]));
  const outstanding = (typeof openInvoices === "function" ? openInvoices() : []).map(x => { const od = daysBetween(x.due, todayIso_); const div = (x.d.lines || []).map(l => itemDiv.get(l.key)).find(Boolean) || "";
    return { ...base(x.d.date), dueMonth: x.due.slice(0, 7), customer: x.d.customer?.name || "—", company: cn(div), invoice: x.d.no, ageing: od <= 0 ? "Not due" : od <= 30 ? "1–30 days overdue" : od <= 60 ? "31–60 days overdue" : od <= 90 ? "61–90 days overdue" : "90+ days overdue",
      balance: x.bal, total: x.d.totals?.grand || 0, received: x.rec || 0, count: 1, daysOverdue: Math.max(0, od), _cust: x.d.customerId, _div: div }; });
  return { sales, stock, receipts, outstanding };
}
function stDimLabel(dim, key) { if (!key) return "—"; if (dim === "month" || dim === "expMonth" || dim === "dueMonth") return /^\d{4}-\d{2}$/.test(key) ? mLabel(key) : key; if (dim === "date") return dmy(key); return key; }
function stMeasure(ds, key) { return ST_DS[ds].measures.find(m => m[0] === key); }
function stDim(ds, key) { return ST_DS[ds].dims.find(d => d[0] === key); }
function stValue(rows, ds, mkey, agg) {
  const m = stMeasure(ds, mkey); if (!m) return 0; const kind = m[2];
  if (kind === "count") return rows.length;
  if (kind === "avg") return rows.length ? rows.reduce((a, r) => a + (r[mkey] || 0), 0) / rows.length : 0;
  if (kind.startsWith("distinct:")) { const f = kind.slice(9); return new Set(rows.map(r => r[f])).size; }
  if (kind.startsWith("ratio:")) { const [a, b] = kind.slice(6).split("/"); const d = stValue(rows, ds, b); return d ? stValue(rows, ds, a) / d : 0; }
  const vals = rows.map(r => r[mkey] || 0); if (!vals.length) return 0;
  if (agg === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length; if (agg === "min") return Math.min(...vals); if (agg === "max") return Math.max(...vals);
  return r2(vals.reduce((a, b) => a + b, 0));
}
function stFmt(v, fmt, short) { if (v == null || isNaN(v)) return "—"; if (fmt === "pct") return (v * 100).toFixed(1) + "%"; if (fmt === "inr") return short ? "₹" + lakh(v) : "₹ " + inr(v, 0); return short && Math.abs(v) >= 1e5 ? lakh(v) : inr(v, Number.isInteger(v) ? 0 : 1); }
function stAxisFmt(v, fmt) { return fmt === "pct" ? Math.round(v * 100) + "%" : axisFmt(v); }

/* ---------- compute one visual ---------- */
function stFilterRows(vis, rep, DS) {
  const ds = ST_DS[vis.ds]; let rows = DS[vis.ds] || []; const sl = rep.slicers || {};
  if (sl.company) rows = rows.filter(r => r._div === sl.company);
  if (sl.customer && rows.length && "_cust" in rows[0]) rows = rows.filter(r => r._cust === sl.customer);
  const usePeriod = vis.applyPeriod ?? ds.period;
  if (usePeriod && sl.range && sl.range !== "all") { const R = stRange(sl.range); rows = rows.filter(r => r.month && r.month >= R.from && r.month <= R.to); }
  return rows;
}
function stRange(r) { const old = S.dash.range; S.dash.range = r; const R = dashRange(); S.dash.range = old; return R; }
function stCompute(vis, rep, DS) {
  const rows = stFilterRows(vis, rep, DS); const m = stMeasure(vis.ds, vis.measure); const fmt = m ? m[3] : "num"; const val = rs => stValue(rs, vis.ds, vis.measure, vis.agg);
  const out = { rows: rows.length, fmt, mLabel: m ? m[1] + (m[2] === "sum" && vis.agg && vis.agg !== "sum" ? ` (${{ avg: "average", min: "minimum", max: "maximum" }[vis.agg]})` : "") : "" };
  if (vis.type === "card" || vis.type === "gauge") { out.value = val(rows); return out; }
  const xd = stDim(vis.ds, vis.x) || ST_DS[vis.ds].dims[0]; const xk = xd[0];
  const group = (rs, k) => { const g = new Map(); for (const r of rs) { const v = r[k] || ""; if (!g.has(v)) g.set(v, []); g.get(v).push(r); } return g; };
  const order = (keys, valueOf, dim) => { const d = stDim(vis.ds, dim) || []; const isTime = d[2] === "time", isOrd = d[2] === "ord";
    if (isOrd) return keys.sort((a, b) => ORD[dim].indexOf(a) - ORD[dim].indexOf(b));
    if (vis.sort === "x" || (isTime && vis.sort !== "desc" && vis.sort !== "asc")) return keys.sort();
    return keys.sort((a, b) => vis.sort === "asc" ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a)); };
  const gx = group(rows, xk); let cats = [...gx.keys()]; const cv = new Map(cats.map(k => [k, val(gx.get(k))]));
  cats = order(cats, k => cv.get(k), xk);
  const top = +vis.top || 0; const isTimeX = (stDim(vis.ds, xk) || [])[2] === "time" || (stDim(vis.ds, xk) || [])[2] === "ord";
  let otherRows = null;
  const capFor = ["pie", "donut"].includes(vis.type) ? 6 : vis.type === "treemap" ? 7 : 0; const lim = top || capFor;
  if (lim && cats.length > lim && !isTimeX) { const keep = vis.sort === "asc" ? cats.slice(0, lim) : [...cats].sort((a, b) => cv.get(b) - cv.get(a)).slice(0, lim); const ks = new Set(keep);
    otherRows = rows.filter(r => !ks.has(r[xk] || "")); cats = cats.filter(k => ks.has(k)); if (capFor || vis.showOther !== false) { cats.push("__other"); cv.set("__other", val(otherRows)); gx.set("__other", otherRows); } }
  else if (top && cats.length > top) cats = cats.slice(isTimeX ? -top : 0, isTimeX ? undefined : top);
  out.cats = cats.map(k => ({ key: k, label: k === "__other" ? "Other" : stDimLabel(xk, k) })); out.xLabel = xd[1];
  if (vis.type === "scatter") { const m2 = stMeasure(vis.ds, vis.measure2) || m; out.fmt2 = m2[3]; out.m2Label = m2[1]; out.points = cats.map(k => ({ label: k === "__other" ? "Other" : stDimLabel(xk, k), x: cv.get(k), y: stValue(gx.get(k), vis.ds, m2[0], vis.agg) })); return out; }
  if (vis.type === "table") { const m2 = vis.measure2 ? stMeasure(vis.ds, vis.measure2) : null; out.m2 = m2; out.table = cats.map(k => ({ label: k === "__other" ? "Other" : stDimLabel(xk, k), v: cv.get(k), v2: m2 ? stValue(gx.get(k), vis.ds, m2[0], vis.agg) : null })); out.total = val(rows); out.total2 = m2 ? stValue(rows, vis.ds, m2[0], vis.agg) : null; return out; }
  // series
  const ld = ST_USES_LEGEND(vis.type) && vis.legend ? stDim(vis.ds, vis.legend) : null;
  if (ld) { const lk = ld[0]; const gl = group(rows, lk); let sk = [...gl.keys()]; const sv = new Map(sk.map(k => [k, val(gl.get(k))]));
    const isOrdL = ld[2] === "ord" || ld[2] === "time"; sk = isOrdL ? (ld[2] === "ord" ? sk.sort((a, b) => ORD[lk].indexOf(a) - ORD[lk].indexOf(b)) : sk.sort()) : sk.sort((a, b) => sv.get(b) - sv.get(a));
    const maxS = vis.type === "heatmap" || vis.type === "matrix" ? 24 : 8; let fold = null; if (sk.length > maxS) { fold = new Set(sk.slice(maxS - 1)); sk = [...sk.slice(0, maxS - 1), "__other"]; }
    out.series = sk.map(k => ({ key: k, label: k === "__other" ? "Other" : stDimLabel(lk, k) })); out.legendLabel = ld[1];
    const cell = new Map(); for (const c of cats) { const crs = gx.get(c) || []; const g = new Map(); for (const r of crs) { let s = r[lk] || ""; if (fold && fold.has(s)) s = "__other"; if (!g.has(s)) g.set(s, []); g.get(s).push(r); } for (const s of sk) cell.set(c + "\u0001" + s, val(g.get(s) || [])); }
    out.val = (ci, si) => cell.get(cats[ci] + "\u0001" + sk[si]) || 0;
  } else { out.series = [{ key: "_", label: out.mLabel }]; out.val = (ci) => cv.get(cats[ci]) || 0; }
  out.catTotal = ci => cv.get(cats[ci]) || 0; out.total = val(rows);
  return out;
}

/* ---------- drawing ---------- */
function stColors(n, dark) { const p = dark ? ST_PAL.dark : ST_PAL.light; return Array.from({ length: n }, (_, i) => p[i % 8]); }
function stIsDark() { const d = document.documentElement.dataset.theme; return d === "dark" || (d !== "light" && matchMedia("(prefers-color-scheme: dark)").matches); }
function stSeriesColor(R, si, dark) { const s = R.series[si]; if (s && s.key === "__other") return dark ? ST_OTHER.dark : ST_OTHER.light; return (dark ? ST_PAL.dark : ST_PAL.light)[si % 8]; }
function stCatColor(R, ci, dark) { const c = R.cats[ci]; if (c && c.key === "__other") return dark ? ST_OTHER.dark : ST_OTHER.light; return (dark ? ST_PAL.dark : ST_PAL.light)[ci % 8]; }
function stLum(hex) { const n = parseInt(hex.slice(1), 16); const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); }
const stInk = hex => stLum(hex) > 0.36 ? "#0b0b0b" : "#ffffff";
function stText(ctx, s, maxW) { s = String(s); if (ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1); return s + "…"; }
function stDraw(cv, vis, R, opts = {}) {
  const print = !!opts.print, dark = !print && stIsDark(); const t = vizTokens(print); const H = opts.h || 300;
  const { ctx, w, h } = setupCanvas(cv, H, opts.w); ctx.fillStyle = t.surface; ctx.fillRect(0, 0, w, h); const hits = [];
  const font = (sz, wt) => ctx.font = `${wt || 400} ${sz}px 'IBM Plex Sans', system-ui, sans-serif`;
  const empty = () => { font(13); ctx.fillStyle = t.muted; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("No data for these filters", w / 2, h / 2); };
  if ((R.cats && !R.cats.length) || (R.points && !R.points.length)) { empty(); return hits; }
  const type = vis.type; const fmt = R.fmt;
  if (type === "gauge") {
    const target = +vis.target || 0; const cx = w / 2, cy = h * 0.72, r = Math.min(w / 2 - 20, h * 0.58); const frac = target > 0 ? Math.min(1.2, R.value / target) : 0;
    ctx.lineCap = "round"; ctx.lineWidth = 22; ctx.strokeStyle = t.grid; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = frac >= 1 ? (dark ? "#0ca30c" : "#008300") : stSeriesColor({ series: [{}] }, 0, dark); ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * Math.min(1, frac)); ctx.stroke();
    font(26, 700); ctx.fillStyle = t.ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(stFmt(R.value, fmt, true), cx, cy - 8);
    font(12); ctx.fillStyle = t.muted; ctx.fillText(target > 0 ? `${(frac * 100).toFixed(0)}% of target ${stFmt(target, fmt, true)}` : "Set a target in the visual settings", cx, cy + 18);
    ctx.textAlign = "left"; ctx.fillText(stFmt(0, fmt, true), cx - r - 10, cy + 18); ctx.textAlign = "right"; if (target) ctx.fillText(stFmt(target, fmt, true), cx + r + 10, cy + 18);
    hits.push({ k: "rect", x: 0, y: 0, w, h, lines: [R.mLabel, stFmt(R.value, fmt), target ? `Target ${stFmt(target, fmt)}` : ""] }); return hits;
  }
  if (type === "pie" || type === "donut") {
    const vals = R.cats.map((_, i) => Math.max(0, R.val(i, 0))); const tot = vals.reduce((a, b) => a + b, 0) || 1; const cx = w / 2, cy = h / 2, r1 = Math.min(w, h) / 2 - 12, r0 = type === "donut" ? r1 * 0.6 : 0; let a = -Math.PI / 2;
    vals.forEach((v, i) => { const da = v / tot * Math.PI * 2; ctx.fillStyle = stCatColor(R, i, dark); ctx.beginPath(); ctx.arc(cx, cy, r1, a, a + da); if (r0) ctx.arc(cx, cy, r0, a + da, a, true); else ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = t.surface; ctx.lineWidth = 2; ctx.stroke(); hits.push({ k: "arc", cx, cy, r0, r1, a0: a, a1: a + da, lines: [R.cats[i].label, stFmt(v, fmt), `${(v / tot * 100).toFixed(1)}% of total`] }); a += da; });
    if (r0) { font(18, 700); ctx.fillStyle = t.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(stFmt(R.total, fmt, true), cx, cy - 6); font(11); ctx.fillStyle = t.muted; ctx.fillText("Total", cx, cy + 12); }
    return hits;
  }
  if (type === "treemap") {
    const items = R.cats.map((c, i) => ({ i, v: Math.max(0, R.val(i, 0)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v); const tot = items.reduce((a, x) => a + x.v, 0); if (!tot) { empty(); return hits; }
    const rects = []; (function sq(list, x, y, W, Hh) { if (!list.length) return; if (list.length === 1) { rects.push({ ...list[0], x, y, w: W, h: Hh }); return; }
      const sum = list.reduce((a, b) => a + b.v, 0); let acc = 0, k = 0; const half = sum / 2; while (k < list.length - 1 && acc + list[k].v <= half) acc += list[k++].v; if (k === 0) { acc = list[0].v; k = 1; }
      const A = list.slice(0, k), B = list.slice(k); if (W >= Hh) { const wa = W * acc / sum; sq(A, x, y, wa, Hh); sq(B, x + wa, y, W - wa, Hh); } else { const ha = Hh * acc / sum; sq(A, x, y, W, ha); sq(B, x, y + ha, W, Hh - ha); } })(items, 0, 0, w, h);
    for (const r of rects) { const col = stCatColor(R, r.i, dark); ctx.fillStyle = col; ctx.fillRect(r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2));
      if (r.w > 60 && r.h > 34) { ctx.fillStyle = stInk(col); font(12, 600); ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(stText(ctx, R.cats[r.i].label, r.w - 12), r.x + 7, r.y + 6); font(11); ctx.fillText(stText(ctx, `${stFmt(r.v, fmt, true)} · ${(r.v / tot * 100).toFixed(0)}%`, r.w - 12), r.x + 7, r.y + 22); }
      hits.push({ k: "rect", x: r.x, y: r.y, w: r.w, h: r.h, lines: [R.cats[r.i].label, stFmt(r.v, fmt), `${(r.v / tot * 100).toFixed(1)}% of total`] }); }
    return hits;
  }
  if (type === "heatmap") {
    const L = Math.min(170, w * 0.3), T = 8, B = 46; const nC = R.cats.length, nS = R.series.length; const cw = (w - L - 8) / nC, ch = Math.min(34, (h - T - B) / nS); let max = 0;
    for (let c = 0; c < nC; c++) for (let s = 0; s < nS; s++) max = Math.max(max, R.val(c, s));
    for (let s = 0; s < nS; s++) { font(11); ctx.fillStyle = t.ink; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(stText(ctx, R.series[s].label, L - 10), L - 8, T + s * ch + ch / 2);
      for (let c = 0; c < nC; c++) { const v = R.val(c, s); const step = max ? Math.round(v / max * (ST_SEQ.length - 1)) : 0; const col = v ? ST_SEQ[step] : t.grid; ctx.fillStyle = col; ctx.fillRect(L + c * cw + 1, T + s * ch + 1, cw - 2, ch - 2);
        if (v && cw > 46) { font(10); ctx.fillStyle = stInk(col); ctx.textAlign = "center"; ctx.fillText(stText(ctx, stFmt(v, fmt, true), cw - 6), L + c * cw + cw / 2, T + s * ch + ch / 2); }
        hits.push({ k: "rect", x: L + c * cw, y: T + s * ch, w: cw, h: ch, lines: [`${R.series[s].label} · ${R.cats[c].label}`, stFmt(v, fmt)] }); } }
    const step = Math.ceil(nC / Math.max(1, Math.floor((w - L) / 56))); font(11); ctx.fillStyle = t.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
    R.cats.forEach((c, i) => { if (i % step === 0) ctx.fillText(stText(ctx, c.label, cw * step - 4), L + i * cw + cw / 2, T + nS * ch + 6); });
    return hits;
  }
  if (type === "scatter") {
    const P = R.points; const L = 60, Rr = 14, T = 12, B = 40; const pw = w - L - Rr, ph = h - T - B;
    const mx = niceMax(Math.max(...P.map(p => p.x), 0) || 1), my = niceMax(Math.max(...P.map(p => p.y), 0) || 1); const X = v => L + v / mx * pw, Y = v => T + ph - v / my * ph;
    font(11); ctx.strokeStyle = t.grid; ctx.lineWidth = 1; ctx.fillStyle = t.muted;
    for (let i = 0; i <= 4; i++) { const yy = Math.round(Y(my * i / 4)) + .5; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke(); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(stAxisFmt(my * i / 4, R.fmt2), L - 6, yy);
      const xx = Math.round(X(mx * i / 4)) + .5; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(stAxisFmt(mx * i / 4, R.fmt), xx, T + ph + 6); }
    ctx.fillText(R.mLabel + " →", L + pw / 2, T + ph + 22); ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText(R.m2Label + " →", 0, 0); ctx.restore();
    const col = stSeriesColor({ series: [{}] }, 0, dark);
    P.forEach(p => { const x = X(p.x), y = Y(p.y); ctx.fillStyle = col; ctx.strokeStyle = t.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); hits.push({ k: "circle", x, y, r: 12, lines: [p.label, `${R.mLabel}: ${stFmt(p.x, R.fmt)}`, `${R.m2Label}: ${stFmt(p.y, R.fmt2)}`] }); });
    const topP = [...P].sort((a, b) => b.y - a.y).slice(0, 3); font(11); ctx.fillStyle = t.ink; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; topP.forEach(p => ctx.fillText(stText(ctx, p.label, 140), X(p.x) + 8, Y(p.y) - 4));
    return hits;
  }
  // cartesian family
  const horiz = ["bar", "stackedBar", "funnel"].includes(type); const stacked = ["stackedColumn", "stackedBar", "pctColumn"].includes(type); const pct = type === "pctColumn";
  const C = R.cats, Sr = R.series, nC = C.length, nS = Sr.length; const v = (c, s) => R.val(c, s);
  let lo = 0, hi = 0;
  if (type === "waterfall") { let cum = 0; for (let c = 0; c < nC; c++) { cum += v(c, 0); hi = Math.max(hi, cum); lo = Math.min(lo, cum); } }
  else if (stacked) { for (let c = 0; c < nC; c++) { let p = 0, n = 0; for (let s = 0; s < nS; s++) { const x = v(c, s); if (x >= 0) p += x; else n += x; } hi = Math.max(hi, pct ? 1 : p); lo = Math.min(lo, pct ? 0 : n); } }
  else for (let c = 0; c < nC; c++) for (let s = 0; s < nS; s++) { hi = Math.max(hi, v(c, s)); lo = Math.min(lo, v(c, s)); }
  const axF = pct ? "pct" : fmt; const stepV = niceMax((hi - lo || 1) / 4); const top = Math.ceil(hi / stepV) * stepV || stepV, bot = Math.floor(lo / stepV) * stepV;
  if (horiz) {
    const L = Math.min(190, w * 0.34), Rr = type === "funnel" ? 12 : 74, T = 6, B = type === "funnel" ? 6 : 26; const pw = w - L - Rr, ph = h - T - B; const band = ph / nC; const bh = Math.min(22, band * 0.68);
    const X = val => L + (val - bot) / (top - bot) * pw;
    if (type !== "funnel") { font(11); ctx.strokeStyle = t.grid; ctx.lineWidth = 1; ctx.fillStyle = t.muted; ctx.textAlign = "center"; ctx.textBaseline = "top"; for (let x = bot; x <= top + 1e-9; x += stepV) { const xx = Math.round(X(x)) + .5; ctx.beginPath(); ctx.moveTo(xx, T); ctx.lineTo(xx, T + ph); ctx.stroke(); ctx.fillText(stAxisFmt(x, axF), xx, T + ph + 6); } }
    const first = v(0, 0) || 1;
    C.forEach((c, ci) => { const yc = T + band * ci + band / 2; font(12); ctx.fillStyle = t.ink; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(stText(ctx, c.label, L - 12), L - 8, yc);
      if (type === "funnel") { const val = v(ci, 0); const len = Math.max(2, val / (hi || 1) * pw); const x0 = L + (pw - len) / 2; ctx.fillStyle = stSeriesColor(R, 0, dark); ctx.fillRect(x0, yc - bh / 2, len, bh);
        const lab = `${stFmt(val, fmt, true)} · ${(val / first * 100).toFixed(0)}%`; font(11, 600); const tw = ctx.measureText(lab).width; ctx.textAlign = "center"; if (tw + 12 < len) { ctx.fillStyle = stInk(stSeriesColor(R, 0, dark)); ctx.fillText(lab, L + pw / 2, yc); } else { ctx.fillStyle = t.ink; ctx.textAlign = "left"; ctx.fillText(lab, x0 + len + 6, yc); }
        hits.push({ k: "rect", x: L, y: yc - band / 2, w: pw, h: band, lines: [c.label, stFmt(val, fmt), `${(val / first * 100).toFixed(1)}% of first`] }); return; }
      if (stacked) { let pp = 0, nn = 0; const tot = pct ? Sr.reduce((a, _, s) => a + Math.max(0, v(ci, s)), 0) || 1 : 1;
        Sr.forEach((s, si) => { let val = v(ci, si); if (pct) val = Math.max(0, val) / tot; if (!val) return; const a = val >= 0 ? pp : nn; const b = a + val; if (val >= 0) pp = b; else nn = b; const x0 = X(Math.min(a, b)), x1 = X(Math.max(a, b));
          ctx.fillStyle = stSeriesColor(R, si, dark); ctx.fillRect(x0 + 1, yc - bh / 2, Math.max(1, x1 - x0 - 2), bh); hits.push({ k: "rect", x: x0, y: yc - bh / 2, w: x1 - x0, h: bh, lines: [`${c.label} · ${s.label}`, pct ? `${(val * 100).toFixed(1)}%` : stFmt(val, fmt)] }); });
        font(11); ctx.fillStyle = t.ink; ctx.textAlign = "left"; if (!pct) ctx.fillText(stFmt(R.catTotal(ci), fmt, true), X(pp) + 6, yc); }
      else { const gh = bh / Math.max(1, nS) * (nS > 1 ? 1 : 1); const sub = nS > 1 ? Math.min(14, band * 0.8 / nS) : bh;
        Sr.forEach((s, si) => { const val = v(ci, si); const y0 = nS > 1 ? yc - sub * nS / 2 + si * sub : yc - bh / 2; const x0 = X(Math.min(0, val)), x1 = X(Math.max(0, val)); ctx.fillStyle = stSeriesColor(R, si, dark);
          const len = Math.max(1, x1 - x0); const rr = Math.min(4, len / 2, (nS > 1 ? sub : bh) / 2); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + len - rr, y0); ctx.quadraticCurveTo(x0 + len, y0, x0 + len, y0 + rr); ctx.lineTo(x0 + len, y0 + (nS > 1 ? sub - 2 : bh) - rr); ctx.quadraticCurveTo(x0 + len, y0 + (nS > 1 ? sub - 2 : bh), x0 + len - rr, y0 + (nS > 1 ? sub - 2 : bh)); ctx.lineTo(x0, y0 + (nS > 1 ? sub - 2 : bh)); ctx.closePath(); ctx.fill();
          hits.push({ k: "rect", x: L, y: y0, w: pw, h: nS > 1 ? sub : bh, lines: [nS > 1 ? `${c.label} · ${s.label}` : c.label, stFmt(val, fmt)] }); if (nS === 1) { font(11); ctx.fillStyle = t.ink; ctx.textAlign = "left"; ctx.fillText(stFmt(val, fmt, true), x0 + len + 6, yc); } }); } });
    return hits;
  }
  const L = 62, Rr = 12, T = 18, B = 40; const pw = w - L - Rr, ph = h - T - B; const Y = val => T + ph - (val - bot) / (top - bot) * ph; const slot = pw / nC;
  font(11); ctx.strokeStyle = t.grid; ctx.lineWidth = 1; ctx.fillStyle = t.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let y = bot; y <= top + 1e-9; y += stepV) { const yy = Math.round(Y(y)) + .5; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke(); ctx.fillText(stAxisFmt(y, axF), L - 8, yy); }
  const lblStep = Math.ceil(nC / Math.max(1, Math.floor(pw / 64))); ctx.textAlign = "center"; ctx.textBaseline = "top";
  C.forEach((c, i) => { if (i % lblStep === 0) { ctx.fillStyle = t.muted; ctx.fillText(stText(ctx, c.label, slot * lblStep - 6), L + slot * (i + .5), T + ph + 8); } });
  if (type === "line" || type === "area") {
    Sr.forEach((s, si) => { const col = stSeriesColor(R, si, dark); const pts = C.map((_, ci) => [L + slot * (ci + .5), Y(v(ci, si))]);
      if (type === "area") { ctx.globalAlpha = nS > 1 ? 0.08 : 0.12; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], Y(Math.max(0, bot))); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], Y(Math.max(0, bot))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      if (nC <= 24) pts.forEach(p => { ctx.fillStyle = col; ctx.strokeStyle = t.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      const lp = pts[pts.length - 1]; if (nS <= 4) { font(11, 600); ctx.fillStyle = t.ink; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(stFmt(v(nC - 1, si), fmt, true), lp[0] - 6, lp[1] - 6); } });
    C.forEach((c, ci) => hits.push({ k: "rect", x: L + slot * ci, y: T, w: slot, h: ph, cross: L + slot * (ci + .5), lines: [c.label, ...Sr.map((s, si) => `${nS > 1 ? s.label + ": " : ""}${stFmt(v(ci, si), fmt)}`)] }));
    return hits;
  }
  if (type === "waterfall") { let cum = 0; const bw = Math.min(28, slot * .6);
    C.forEach((c, ci) => { const val = v(ci, 0); const a = cum, b = cum + val; cum = b; const y0 = Y(Math.max(a, b)), y1 = Y(Math.min(a, b)); ctx.fillStyle = val >= 0 ? stSeriesColor(R, 0, dark) : (dark ? ST_PAL.dark[1] : ST_PAL.light[1]); ctx.fillRect(L + slot * (ci + .5) - bw / 2, y0, bw, Math.max(1, y1 - y0));
      if (ci < nC - 1) { ctx.strokeStyle = t.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L + slot * (ci + .5) + bw / 2, Y(b) + .5); ctx.lineTo(L + slot * (ci + 1.5) - bw / 2, Y(b) + .5); ctx.stroke(); }
      hits.push({ k: "rect", x: L + slot * ci, y: T, w: slot, h: ph, lines: [c.label, `${val >= 0 ? "+" : ""}${stFmt(val, fmt)}`, `Running total ${stFmt(b, fmt)}`] }); });
    font(11, 600); ctx.fillStyle = t.ink; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(`Total ${stFmt(cum, fmt, true)}`, L + pw, T - 2); return hits; }
  // columns
  const groupW = Math.min(slot * .72, nS > 1 && !stacked ? 22 * nS : 26); const bw = stacked || nS === 1 ? Math.min(24, groupW) : Math.min(22, groupW / nS - 2);
  C.forEach((c, ci) => { const cx = L + slot * (ci + .5);
    if (stacked) { let pp = 0, nn = 0; const tot = pct ? Sr.reduce((a, _, s) => a + Math.max(0, v(ci, s)), 0) || 1 : 1;
      Sr.forEach((s, si) => { let val = v(ci, si); if (pct) val = Math.max(0, val) / tot; if (!val) return; const a = val >= 0 ? pp : nn, b = a + val; if (val >= 0) pp = b; else nn = b; const y0 = Y(Math.max(a, b)), y1 = Y(Math.min(a, b));
        ctx.fillStyle = stSeriesColor(R, si, dark); ctx.fillRect(cx - bw / 2, y0 + 1, bw, Math.max(1, y1 - y0 - 2)); hits.push({ k: "rect", x: cx - slot / 2, y: y0, w: slot, h: y1 - y0, lines: [`${c.label} · ${s.label}`, pct ? `${(val * 100).toFixed(1)}%` : stFmt(val, fmt)] }); }); }
    else Sr.forEach((s, si) => { const val = v(ci, si); const x = nS > 1 ? cx - (bw + 2) * nS / 2 + si * (bw + 2) + 1 : cx - bw / 2; const yv = Y(Math.max(0, val)), y0 = Y(Math.min(0, val)); ctx.fillStyle = stSeriesColor(R, si, dark);
      if (val > 0) { roundTop(ctx, x, yv, bw, y0 - yv, 4); ctx.fill(); } else if (val < 0) ctx.fillRect(x, yv, bw, y0 - yv);
      hits.push({ k: "rect", x: nS > 1 ? x - 1 : cx - slot / 2, y: T, w: nS > 1 ? bw + 2 : slot, h: ph, lines: [nS > 1 ? `${c.label} · ${s.label}` : c.label, stFmt(val, fmt)] }); });
  });
  if (nS === 1 && !stacked && nC <= 14) { font(10, 600); ctx.fillStyle = t.ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; let best = 0; C.forEach((_, ci) => { if (v(ci, 0) > v(best, 0)) best = ci; }); ctx.fillText(stFmt(v(best, 0), fmt, true), L + slot * (best + .5), Y(Math.max(0, v(best, 0))) - 4); }
  return hits;
}
function stHook(cv, tip, hits) {
  cv.onpointermove = e => { const b = cv.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top;
    const hit = [...hits].reverse().find(h => h.k === "rect" ? x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h : h.k === "circle" ? (x - h.x) ** 2 + (y - h.y) ** 2 <= h.r * h.r
      : (() => { const dx = x - h.cx, dy = y - h.cy, d = Math.hypot(dx, dy); if (d < h.r0 || d > h.r1) return false; if (!isFinite(h.a0) || !isFinite(h.a1)) return false; const T2 = Math.PI * 2; let a = Math.atan2(dy, dx); a = h.a0 + (((a - h.a0) % T2) + T2) % T2; return a <= h.a1; })());
    if (!hit) { tip.hidden = true; return; } tip.replaceChildren(...hit.lines.filter(Boolean).map((l, i) => { const d = document.createElement("div"); d.textContent = l; if (!i) d.style.fontWeight = "600"; return d; }));
    tip.hidden = false; tip.style.left = Math.max(0, Math.min(x + 14, b.width - 190)) + "px"; tip.style.top = (y + 14) + "px"; };
  cv.onpointerleave = () => tip.hidden = true;
}

/* ---------- report state ---------- */
function stDefaultReport() {
  const V = (o) => ({ id: "v" + Math.random().toString(36).slice(2, 8), agg: "sum", sort: "", top: "", size: 2, ...o });
  return { name: "Overview", slicers: { range: "fy", company: "", customer: "" }, visuals: [
    V({ title: "Turnover", type: "card", ds: "sales", measure: "taxable", size: 1 }), V({ title: "Margin %", type: "card", ds: "sales", measure: "marginPct", size: 1 }),
    V({ title: "Collections", type: "card", ds: "receipts", measure: "amount", size: 1 }), V({ title: "Stock value at cost", type: "card", ds: "stock", measure: "stockValue", size: 1 }),
    V({ title: "Invoices", type: "card", ds: "sales", measure: "invoices", size: 1 }), V({ title: "Outstanding", type: "card", ds: "outstanding", measure: "balance", size: 1 }),
    V({ title: "Turnover by month", type: "column", ds: "sales", x: "month", measure: "taxable", size: 4 }), V({ title: "Turnover by company", type: "donut", ds: "sales", x: "company", measure: "taxable", size: 2 }),
    V({ title: "Top customers", type: "bar", ds: "sales", x: "customer", measure: "taxable", top: "8", size: 3 }), V({ title: "Margin % by month", type: "line", ds: "sales", x: "month", measure: "marginPct", size: 3 }),
    V({ title: "Outstanding by ageing", type: "stackedBar", ds: "outstanding", x: "ageing", legend: "customer", measure: "balance", size: 3 }), V({ title: "Stock value by expiry window", type: "column", ds: "stock", x: "expBucket", measure: "stockValue", size: 3 }),
    V({ title: "Stock value by product", type: "treemap", ds: "stock", x: "product", measure: "stockValue", size: 3 }), V({ title: "Products by month", type: "matrix", ds: "sales", x: "product", legend: "month", measure: "qty", top: "15", size: 3 }),
  ] };
}
function stCurrent() {
  if (S.st.draft && (!S.st.reportId || S.st.draft._id === S.st.reportId)) return S.st.draft;
  const ids = Object.keys(S.reports).sort((a, b) => (S.reports[a].name || "").localeCompare(S.reports[b].name || ""));
  if (!S.st.reportId || !S.reports[S.st.reportId]) S.st.reportId = ids[0] || null;
  S.st.draft = S.st.reportId ? { ...JSON.parse(JSON.stringify(S.reports[S.st.reportId])), _id: S.st.reportId } : { ...stDefaultReport(), _id: null };
  return S.st.draft;
}
let _stSave;
function stChanged(redrawId) {
  const rep = S.st.draft; if (!canEditPanel("studio") || !S.db) { S.st.saving = "View only: changes aren't saved"; stStatus(); } else {
    S.st.saving = "Saving…"; stStatus(); clearTimeout(_stSave);
    _stSave = setTimeout(async () => { try { let id = rep._id; if (!id) { id = "r" + Date.now().toString(36); rep._id = id; S.st.reportId = id; } const { _id, ...doc } = rep; await S.db.doc(`reports/${id}`).set({ ...doc, updatedAt: new Date().toISOString(), updatedBy: S.myEmail || "" }); S.st.saving = "Saved"; } catch (e) { S.st.saving = "Couldn't save: " + (e.message || e.code); } stStatus(); }, 700); }
  if (redrawId) stRenderVisual(redrawId); else renderStudio();
}
function stStatus() { const el = $("stStatus"); if (el) el.textContent = S.st.saving || ""; }

/* ---------- render ---------- */
function renderStudio() {
  const el = $("tab-studio"); if (!el) return; S._stDS = null; const rep = stCurrent(); const can = canEditPanel("studio") && !!S.db; const sl = rep.slicers || (rep.slicers = {});
  const ids = Object.keys(S.reports).sort((a, b) => (S.reports[a].name || "").localeCompare(S.reports[b].name || ""));
  const custs = Object.entries(S.customers).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const ed = S.st.editing ? rep.visuals.find(v => v.id === S.st.editing) : null;
  el.innerHTML = `
  <div class="panel pad no-print"><div class="row" style="justify-content:space-between">
    <div class="row"><b>Report</b><select data-st="report" aria-label="Report">${!rep._id ? `<option value="" selected>${esc(rep.name)} (not saved yet)</option>` : ""}${ids.map(id => `<option value="${esc(id)}" ${id === rep._id ? "selected" : ""}>${esc(S.reports[id].name || "Untitled")}</option>`).join("")}</select>
      ${can ? `<input type="text" data-st="name" value="${esc(rep.name)}" aria-label="Report name" style="width:180px"><button class="btn" data-sta="new">New report</button><button class="btn" data-sta="dup">Duplicate</button>${rep._id ? `<button class="btn danger" data-sta="del">Delete</button>` : ""}` : ""}
      <span class="note" id="stStatus">${esc(S.st.saving || "")}</span></div>
    <div class="row">${can ? `<button class="btn primary" data-sta="add">+ Add visual</button>` : ""}<button class="btn" data-sta="xlsx">Download Excel</button><button class="btn" data-sta="pdf">Download PDF</button><button class="btn" data-sta="print">Print</button></div>
  </div>
  <div class="row" style="margin-top:10px"><span class="note">Page filters:</span>
    <select data-sl="range" aria-label="Period"><option value="fy" ${sl.range === "fy" ? "selected" : ""}>This financial year</option><option value="lfy" ${sl.range === "lfy" ? "selected" : ""}>Last financial year</option><option value="12m" ${sl.range === "12m" ? "selected" : ""}>Last 12 months</option><option value="3m" ${sl.range === "3m" ? "selected" : ""}>Last 3 months</option><option value="all" ${sl.range === "all" ? "selected" : ""}>All time</option></select>
    <select data-sl="company" aria-label="Company"><option value="">All companies</option>${S.divisions.map(d => `<option value="${esc(d.code)}" ${sl.company === d.code ? "selected" : ""}>${esc(d.code)} · ${esc(d.name)}</option>`).join("")}</select>
    <select data-sl="customer" aria-label="Customer"><option value="">All customers</option>${custs.map(([id, c]) => `<option value="${esc(id)}" ${sl.customer === id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
    <span class="note">The period filter applies to sales and payments; stock and outstanding always show the position now.</span></div></div>
  <div class="print-only"><h2 style="margin:0">${esc(rep.name)}</h2><div class="note">${esc(stRange(sl.range || "fy").label)}${sl.company ? " · " + esc(divName(sl.company)) : ""}${sl.customer && S.customers[sl.customer] ? " · " + esc(S.customers[sl.customer].name) : ""}</div></div>
  ${ed ? stEditorHtml(ed) : ""}
  <div class="stgrid">${rep.visuals.map(v => `<div class="panel stcard ${v.id === S.st.editing ? "editing" : ""}" data-vis="${esc(v.id)}" style="grid-column:span ${v.size || 2}"></div>`).join("") || `<div class="panel pad empty" style="grid-column:span 6">This report has no visuals yet.${can ? " Click <b>+ Add visual</b>." : ""}</div>`}</div>`;
  ensureBound(el, stEvent);
  requestAnimationFrame(() => rep.visuals.forEach(v => stRenderVisual(v.id)));
}
function stRenderVisual(id) {
  const rep = S.st.draft; const v = rep.visuals.find(x => x.id === id); const box = $("tab-studio").querySelector(`[data-vis="${CSS.escape(id)}"]`); if (!v || !box) return;
  box.style.gridColumn = `span ${v.size || 2}`; const DS = S._stDS || (S._stDS = stDatasets()); const R = stCompute(v, rep, DS); const can = canEditPanel("studio") && !!S.db; const dark = stIsDark();
  const head = `<div class="sthead"><div><div class="sttitle">${esc(v.title || ST_TYPE_LABEL[v.type])}</div><div class="note">${esc(R.mLabel)}${v.x && ST_USES_X(v.type) ? " by " + esc((stDim(v.ds, v.x) || [])[1] || "") : ""}${v.legend && ST_USES_LEGEND(v.type) ? " and " + esc((stDim(v.ds, v.legend) || [])[1] || "") : ""}</div></div>
    <details class="no-print stmore"><summary aria-label="Visual options" title="Options">⋯</summary><div class="stmenu">${can ? `<button class="btn" data-ve="${esc(id)}">✎ Edit</button><button class="btn" data-vu="${esc(id)}">↑ Move earlier</button><button class="btn" data-vd="${esc(id)}">↓ Move later</button><button class="btn" data-vc="${esc(id)}">⧉ Duplicate</button>` : ""}${v.type === "card" || v.type === "table" || v.type === "matrix" ? "" : `<button class="btn" data-vp="${esc(id)}">Download image (PNG)</button>`}<button class="btn" data-vx="${esc(id)}">Download data (Excel)</button>${can ? `<button class="btn danger" data-vr="${esc(id)}">✕ Remove</button>` : ""}</div></details></div>`;
  let body = "";
  if (v.type === "card") body = `<div class="stcardv">${esc(stFmt(R.value, R.fmt, true))}</div><div class="note">${esc(stFmt(R.value, R.fmt))} · ${R.rows} record${R.rows === 1 ? "" : "s"}</div>`;
  else if (v.type === "table") body = `<div class="tablewrap" style="max-height:320px"><table><thead><tr><th>${esc(R.xLabel)}</th><th class="num">${esc(R.mLabel)}</th>${R.m2 ? `<th class="num">${esc(R.m2[1])}</th>` : ""}</tr></thead><tbody>${R.table.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(stFmt(r.v, R.fmt))}</td>${R.m2 ? `<td class="num">${esc(stFmt(r.v2, R.m2[3]))}</td>` : ""}</tr>`).join("") || `<tr><td colspan="3" class="empty">No data for these filters</td></tr>`}<tr><td><b>Total</b></td><td class="num"><b>${esc(stFmt(R.total, R.fmt))}</b></td>${R.m2 ? `<td class="num"><b>${esc(stFmt(R.total2, R.m2[3]))}</b></td>` : ""}</tr></tbody></table></div>`;
  else if (v.type === "matrix") body = !R.cats.length ? `<div class="empty">No data for these filters</div>` : `<div class="tablewrap" style="max-height:340px"><table><thead><tr><th>${esc(R.xLabel)}</th>${R.series.map(s => `<th class="num">${esc(s.label)}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>${R.cats.map((c, ci) => `<tr><td class="desc" style="min-width:120px">${esc(c.label)}</td>${R.series.map((_, si) => { const x = R.val(ci, si); return `<td class="num">${x ? esc(stFmt(x, R.fmt)) : '<span class="note">·</span>'}</td>`; }).join("")}<td class="num"><b>${esc(stFmt(R.catTotal(ci), R.fmt))}</b></td></tr>`).join("")}<tr><td><b>Total</b></td>${R.series.map((_, si) => `<td class="num"><b>${esc(stFmt(R.cats.reduce((a, _, ci) => a + R.val(ci, si), 0), R.fmt))}</b></td>`).join("")}<td class="num"><b>${esc(stFmt(R.total, R.fmt))}</b></td></tr></tbody></table></div>`;
  else {
    const legendItems = ["pie", "donut", "treemap"].includes(v.type) ? R.cats.map((c, i) => [c.label, stCatColor(R, i, dark)]) : R.series && R.series.length > 1 && v.type !== "heatmap" ? R.series.map((s, i) => [s.label, stSeriesColor(R, i, dark)]) : v.type === "waterfall" ? [["Increase", stSeriesColor(R, 0, dark)], ["Decrease", dark ? ST_PAL.dark[1] : ST_PAL.light[1]]] : [];
    const line = ["line", "area"].includes(v.type);
    body = `${legendItems.length ? `<div class="stlegend">${legendItems.map(([l, c]) => `<span><i style="background:${c};${line ? "height:2px;width:14px;border-radius:1px" : ""}"></i>${esc(l)}</span>`).join("")}</div>` : ""}<div class="chartbox"><canvas role="img" aria-label="${esc(v.title || "")}"></canvas><div class="viztip" hidden></div></div>`;
  }
  box.innerHTML = head + `<div class="stbody">${body}</div>`;
  const cv = box.querySelector("canvas"); if (cv) { const hgt = v.type === "gauge" ? 200 : ["bar", "stackedBar", "funnel"].includes(v.type) ? Math.max(160, Math.min(420, (R.cats ? R.cats.length : 4) * 32 + 40)) : v.type === "heatmap" ? Math.max(160, Math.min(520, (R.series ? R.series.length : 4) * 32 + 60)) : 280;
    const hits = stDraw(cv, v, R, { h: hgt }); stHook(cv, box.querySelector(".viztip"), hits); }
}
function stEditorHtml(v) {
  const ds = ST_DS[v.ds]; const m = stMeasure(v.ds, v.measure); const opt = (arr, cur, blank) => (blank ? `<option value="">${blank}</option>` : "") + arr.map(d => `<option value="${esc(d[0])}" ${d[0] === cur ? "selected" : ""}>${esc(d[1])}</option>`).join("");
  return `<div class="panel pad no-print steditor"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Visual settings</h2><button class="btn primary" data-sta="done">Done</button></div>
   <div class="stform">
    <label>Title<input type="text" data-vf="title" value="${esc(v.title || "")}"></label>
    <label>Chart type<select data-vf="type">${ST_TYPES.map(([g, ts]) => `<optgroup label="${esc(g)}">${ts.map(([k, l]) => `<option value="${k}" ${k === v.type ? "selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>`).join("")}</select></label>
    <label>Data<select data-vf="ds">${Object.entries(ST_DS).map(([k, d]) => `<option value="${k}" ${k === v.ds ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select></label>
    ${ST_USES_X(v.type) ? `<label>${v.type === "scatter" ? "Points (one per)" : v.type === "table" || v.type === "matrix" ? "Rows" : ["pie", "donut", "treemap", "funnel"].includes(v.type) ? "Slices / categories" : "Axis (category)"}<select data-vf="x">${opt(ds.dims, v.x)}</select></label>` : ""}
    ${ST_USES_LEGEND(v.type) ? `<label>${v.type === "matrix" ? "Columns" : v.type === "heatmap" ? "Rows (second category)" : "Legend (split by)"}<select data-vf="legend">${opt(ds.dims.filter(d => d[0] !== v.x), v.legend, ST_NEEDS_LEGEND(v.type) ? "— choose —" : "None")}</select></label>` : ""}
    <label>${v.type === "scatter" ? "X value" : "Value"}<select data-vf="measure">${opt(ds.measures, v.measure)}</select></label>
    ${m && m[2] === "sum" ? `<label>Summarise<select data-vf="agg">${[["sum", "Sum"], ["avg", "Average"], ["min", "Minimum"], ["max", "Maximum"]].map(([k, l]) => `<option value="${k}" ${(v.agg || "sum") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
    ${ST_USES_V2(v.type) ? `<label>${v.type === "scatter" ? "Y value" : "Second value (optional)"}<select data-vf="measure2">${opt(ds.measures, v.measure2, v.type === "table" ? "None" : "")}</select></label>` : ""}
    ${ST_USES_X(v.type) && v.type !== "matrix" ? `<label>Sort<select data-vf="sort"><option value="" ${!v.sort ? "selected" : ""}>Automatic</option><option value="desc" ${v.sort === "desc" ? "selected" : ""}>Value: high to low</option><option value="asc" ${v.sort === "asc" ? "selected" : ""}>Value: low to high</option><option value="x" ${v.sort === "x" ? "selected" : ""}>Axis A–Z / oldest first</option></select></label>` : ""}
    ${ST_USES_X(v.type) ? `<label>Show<select data-vf="top">${[["", "All"], ["5", "Top 5"], ["8", "Top 8"], ["10", "Top 10"], ["15", "Top 15"], ["20", "Top 20"], ["30", "Top 30"]].map(([k, l]) => `<option value="${k}" ${(v.top || "") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
    ${v.type === "gauge" ? `<label>Target<input type="number" min="0" step="1" data-vf="target" value="${esc(v.target || "")}" placeholder="e.g. 1000000"></label>` : ""}
    <label>Width<select data-vf="size">${[[1, "1/6"], [2, "1/3"], [3, "1/2"], [4, "2/3"], [6, "Full width"]].map(([k, l]) => `<option value="${k}" ${+(v.size || 2) === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    ${ds.period ? `<label class="chk" style="align-self:end"><input type="checkbox" data-vf="applyPeriod" ${(v.applyPeriod ?? true) ? "checked" : ""}> Use the page's period filter</label>` : ""}
   </div>${ST_NEEDS_LEGEND(v.type) && !v.legend ? `<div class="msg warn" style="margin-top:8px">${esc(ST_TYPE_LABEL[v.type])} needs a ${v.type === "matrix" ? "Columns" : v.type === "heatmap" ? "second category" : "Legend"} field.</div>` : ""}</div>`;
}
function stFix(v) {
  const ds = ST_DS[v.ds]; if (!stMeasure(v.ds, v.measure)) v.measure = ds.measures[0][0];
  if (ST_USES_X(v.type) && !stDim(v.ds, v.x)) v.x = ds.dims[0][0];
  if (v.legend && (!stDim(v.ds, v.legend) || v.legend === v.x || !ST_USES_LEGEND(v.type))) v.legend = "";
  if (ST_NEEDS_LEGEND(v.type) && !v.legend) v.legend = (ds.dims.find(d => d[0] !== v.x && d[2] !== "time") || ds.dims.find(d => d[0] !== v.x))[0];
  if (v.type === "scatter" && (!v.measure2 || !stMeasure(v.ds, v.measure2))) v.measure2 = (ds.measures[1] || ds.measures[0])[0];
  if (v.type === "table" && v.measure2 && !stMeasure(v.ds, v.measure2)) v.measure2 = "";
  if (stMeasure(v.ds, v.measure)[2] !== "sum") v.agg = "sum";
}
async function stEvent(e) {
  const t = e.target; const rep = S.st.draft; if (!rep) return;
  if (e.type === "input") {
    if (t.dataset.st === "name") { rep.name = t.value; clearTimeout(S._stNameT); S._stNameT = setTimeout(() => stChanged("__none"), 400); return; }
    if (t.dataset.vf === "title" || t.dataset.vf === "target") { const v = rep.visuals.find(x => x.id === S.st.editing); v[t.dataset.vf] = t.value; clearTimeout(S._stT); S._stT = setTimeout(() => stChanged(v.id), 300); return; }
    return;
  }
  if (e.type === "change") {
    if (t.dataset.st === "report") { S.st.reportId = t.value || null; S.st.draft = null; S.st.editing = null; S.st.saving = ""; return renderStudio(); }
    if (t.dataset.sl) { rep.slicers[t.dataset.sl] = t.value; S._stDS = null; return canEditPanel("studio") && S.db ? stChanged() : renderStudio(); }
    if (t.dataset.vf && t.dataset.vf !== "title" && t.dataset.vf !== "target") { const v = rep.visuals.find(x => x.id === S.st.editing); const k = t.dataset.vf; v[k] = t.type === "checkbox" ? t.checked : k === "size" ? +t.value : t.value; stFix(v); return stChanged(); }
    return;
  }
  if (e.type !== "click") return; const b = t.closest("button"); if (!b) return; const dd = b.closest("details.stmore"); if (dd) dd.open = false;
  const id = b.dataset.ve || b.dataset.vu || b.dataset.vd || b.dataset.vc || b.dataset.vp || b.dataset.vx || b.dataset.vr; const i = id ? rep.visuals.findIndex(x => x.id === id) : -1;
  if (b.dataset.ve) { S.st.editing = S.st.editing === id ? null : id; renderStudio(); $("tab-studio").querySelector(".steditor")?.scrollIntoView({ block: "nearest" }); return; }
  if (b.dataset.vu && i > 0) { rep.visuals.splice(i - 1, 0, rep.visuals.splice(i, 1)[0]); return stChanged(); }
  if (b.dataset.vd && i < rep.visuals.length - 1) { rep.visuals.splice(i + 1, 0, rep.visuals.splice(i, 1)[0]); return stChanged(); }
  if (b.dataset.vc) { const c = { ...JSON.parse(JSON.stringify(rep.visuals[i])), id: "v" + Math.random().toString(36).slice(2, 8), title: (rep.visuals[i].title || "") + " (copy)" }; rep.visuals.splice(i + 1, 0, c); S.st.editing = c.id; return stChanged(); }
  if (b.dataset.vr) { if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Remove?"; return; } rep.visuals.splice(i, 1); if (S.st.editing === id) S.st.editing = null; return stChanged(); }
  if (b.dataset.vp) { const cv = $("tab-studio").querySelector(`[data-vis="${CSS.escape(id)}"] canvas`); if (!cv) { msg($("globalmsg"), "warn", "Cards, tables and matrices have no image. Use XLSX for their data."); return; }
    const off = document.createElement("canvas"); const v = rep.visuals[i]; const R = stCompute(v, rep, S._stDS || stDatasets()); stDraw(off, v, R, { print: true, w: 1200, h: Math.round(1200 * cv.clientHeight / cv.clientWidth) });
    const blob = await new Promise(r => off.toBlob(r, "image/png")); await save(`${(v.title || "visual").replace(/[^\w]+/g, "_")}.png`, blob); return; }
  if (b.dataset.vx) { const v = rep.visuals[i]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheetFrom(stVisualAoA(v, rep)), (v.title || "Data").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Data"); await save(`${(v.title || "visual").replace(/[^\w]+/g, "_")}_data.xlsx`, new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }))); return; }
  const a = b.dataset.sta; if (!a) return;
  if (a === "add") { const v = { id: "v" + Math.random().toString(36).slice(2, 8), title: "New visual", type: "column", ds: "sales", x: "month", measure: "taxable", agg: "sum", sort: "", top: "", size: 3 }; rep.visuals.unshift(v); S.st.editing = v.id; return stChanged(); }
  if (a === "done") { S.st.editing = null; return renderStudio(); }
  if (a === "new") { const r = { name: "New report", slicers: { range: "fy", company: "", customer: "" }, visuals: [], _id: null }; S.st.draft = r; S.st.reportId = null; S.st.editing = null; return stChanged(); }
  if (a === "dup") { const r = { ...JSON.parse(JSON.stringify(rep)), name: rep.name + " (copy)", _id: null }; S.st.draft = r; S.st.reportId = null; return stChanged(); }
  if (a === "del") { if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again to delete"; return; } try { await S.db.doc(`reports/${rep._id}`).delete(); S.st.reportId = null; S.st.draft = null; S.st.editing = null; S.st.saving = "Deleted"; renderStudio(); } catch (err) { msg($("globalmsg"), "bad", "Couldn't delete: " + (err.message || err.code)); } return; }
  if (a === "xlsx") { const wb = XLSX.utils.book_new(); const used = new Set(); rep.visuals.forEach((v, k) => { let n = ((k + 1) + " " + (v.title || ST_TYPE_LABEL[v.type])).replace(/[\\/?*[\]:]/g, " ").slice(0, 31); while (used.has(n)) n = n.slice(0, 28) + "_" + k; used.add(n); XLSX.utils.book_append_sheet(wb, sheetFrom(stVisualAoA(v, rep)), n); });
    if (!rep.visuals.length) XLSX.utils.book_append_sheet(wb, sheetFrom([["No visuals"]]), "Empty"); await save(`${rep.name.replace(/[^\w]+/g, "_")}_${stamp()}.xlsx`, new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }))); return; }
  if (a === "pdf" || (a === "print" && !FIREBASE_MODE)) { b.disabled = true; try { await save(`${rep.name.replace(/[^\w]+/g, "_")}_${stamp()}.pdf`, new Uint8Array(stPdf(rep).output("arraybuffer"))); if (a === "print") msg($("globalmsg"), "good", "Printing isn't allowed inside claude.ai, so the report was saved as a PDF. Open it and print from there."); } catch (err) { msg($("globalmsg"), "bad", "Couldn't make the PDF: " + (err.message || err)); } b.disabled = false; return; }
  if (a === "print") { S.st.editing = null; renderStudio(); setTimeout(() => window.print(), 400); }
}
function stVisualAoA(v, rep) {
  const R = stCompute(v, rep, S._stDS || stDatasets()); const raw = x => R.fmt === "pct" ? r2(x * 100) : r2(x); const ml = R.mLabel + (R.fmt === "pct" ? " (%)" : R.fmt === "inr" ? " (₹)" : "");
  if (v.type === "card" || v.type === "gauge") return [["Measure", "Value"], [ml, raw(R.value)], ...(v.type === "gauge" ? [["Target", +v.target || ""]] : [])];
  if (v.type === "scatter") return [[R.xLabel, ml, R.m2Label], ...R.points.map(p => [p.label, raw(p.x), R.fmt2 === "pct" ? r2(p.y * 100) : r2(p.y)])];
  if (v.type === "table") return [[R.xLabel, ml, ...(R.m2 ? [R.m2[1]] : [])], ...R.table.map(r => [r.label, raw(r.v), ...(R.m2 ? [R.m2[3] === "pct" ? r2(r.v2 * 100) : r2(r.v2)] : [])]), ["Total", raw(R.total), ...(R.m2 ? [R.m2[3] === "pct" ? r2(R.total2 * 100) : r2(R.total2)] : [])]];
  if (R.series.length > 1 || v.legend) return [[R.xLabel + " \\ " + (R.legendLabel || ""), ...R.series.map(s => s.label), "Total"], ...R.cats.map((c, ci) => [c.label, ...R.series.map((_, si) => raw(R.val(ci, si))), raw(R.catTotal(ci))])];
  return [[R.xLabel, ml], ...R.cats.map((c, ci) => [c.label, raw(R.val(ci, 0))])];
}
function stPdf(rep) {
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }); addFonts(doc); const co = { ...DEFAULT_COMPANY, ...S.company };
  const W = 297, Hh = 210, M = 10, gap = 5, colW = (W - 2 * M - 5 * gap) / 6; const DS = S._stDS || stDatasets(); const sl = rep.slicers || {};
  const head = () => { if (pdfLogo(co)[0]) { try { doc.addImage(...pdfLogo(co), M, 7, 10, 10); } catch (e) { } } doc.setFont("FreeSans", "bold"); doc.setFontSize(13); doc.setTextColor(34); doc.text(rep.name, M + 13, 12.5);
    doc.setFont("FreeSans", "normal"); doc.setFontSize(8); doc.setTextColor(102); doc.text(`${co.name} · ${stRange(sl.range || "fy").label}${sl.company ? " · " + divName(sl.company) : ""}${sl.customer && S.customers[sl.customer] ? " · " + S.customers[sl.customer].name : ""} · ${new Date().toLocaleString("en-IN")}`, M + 13, 16.5); };
  head(); let x = M, y = 22, rowH = 0;
  for (const v of rep.visuals) {
    const span = v.size || 2; const vw = colW * span + gap * (span - 1); const R = stCompute(v, rep, DS);
    const vh = v.type === "card" ? 24 : v.type === "gauge" ? 50 : ["table", "matrix"].includes(v.type) ? Math.min(150, 14 + (R.cats || R.table || []).length * 5.2 + 10) : 72;
    if (x + vw > W - M + 0.1) { x = M; y += rowH + gap; rowH = 0; }
    if (y + vh > Hh - 10) { doc.addPage(); head(); x = M; y = 22; rowH = 0; }
    doc.setDrawColor(220); doc.roundedRect(x, y, vw, vh, 1.5, 1.5, "S");
    doc.setFont("FreeSans", "bold"); doc.setFontSize(9); doc.setTextColor(34); doc.text(doc.splitTextToSize(v.title || ST_TYPE_LABEL[v.type], vw - 6)[0], x + 3, y + 5.5);
    doc.setFont("FreeSans", "normal"); doc.setFontSize(7); doc.setTextColor(110); doc.text(doc.splitTextToSize(R.mLabel + (v.x && ST_USES_X(v.type) ? " by " + ((stDim(v.ds, v.x) || [])[1] || "") : ""), vw - 6)[0], x + 3, y + 9);
    if (v.type === "card") { doc.setFont("FreeSans", "bold"); doc.setFontSize(17); doc.setTextColor(34); doc.text(stFmt(R.value, R.fmt, true), x + 3, y + 19); }
    else if (v.type === "table" || v.type === "matrix") {
      const aoa = stVisualAoA(v, rep); doc.autoTable({ startY: y + 11, margin: { left: x + 2, right: W - x - vw + 2 }, tableWidth: vw - 4, theme: "grid", head: [aoa[0].map(String)], body: aoa.slice(1, 26).map(r => r.map(c => typeof c === "number" ? inr(c, R.fmt === "pct" ? 1 : 0) : String(c ?? ""))),
        styles: { font: "FreeSans", fontSize: 6.5, cellPadding: 0.9, lineColor: [225, 225, 225], lineWidth: 0.1 }, headStyles: { font: "FreeSans", fillColor: [42, 120, 214], textColor: 255, fontSize: 6.5 } });
    } else {
      const legend = ["pie", "donut", "treemap"].includes(v.type) ? R.cats.map((c, i) => [c.label, stCatColor(R, i, false)]) : R.series && R.series.length > 1 && v.type !== "heatmap" ? R.series.map((s, i) => [s.label, stSeriesColor(R, i, false)]) : [];
      let ly = y + 12; if (legend.length) { doc.setFontSize(6.5); let lx = x + 3; for (const [l, c] of legend.slice(0, 10)) { const tw = doc.getTextWidth(l) + 6; if (lx + tw > x + vw - 3) { lx = x + 3; ly += 3.5; } doc.setFillColor(c); doc.rect(lx, ly - 2, 2.4, 2.4, "F"); doc.setTextColor(60); doc.text(l, lx + 3.2, ly); lx += tw + 2; } ly += 2; }
      const ih = vh - (ly - y) - 3; const cv = document.createElement("canvas"); const pxW = Math.round(vw * 4.2); stDraw(cv, v, R, { print: true, w: pxW, h: Math.round(pxW * ih / (vw - 4)) });
      doc.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", x + 2, ly, vw - 4, ih, undefined, "FAST");
    }
    rowH = Math.max(rowH, vh); x += vw + gap;
  }
  const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120); doc.text(`Insight Studio · page ${i} of ${n}`, W - M, Hh - 5, { align: "right" }); }
  return doc;
}
/* refresh datasets when data changes */
(async () => { if (!window.claude || !claude.use) return; const db = await claude.use("db"); if (!db) return;
  db.collection("reports").onSnapshot(s => { S.reports = {}; s.docs.forEach(d => S.reports[d.id] = d.data()); const busy = document.activeElement && $("tab-studio").contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName); if (busy) return; if (S.tab === "studio" && !S.st.editing && !(S.st.saving || "").startsWith("Saving")) { S.st.draft = null; renderStudio(); } else if (S.tab === "studio") { const sel = $("tab-studio").querySelector('[data-st="report"]'); if (sel && !S.st.editing) renderStudio(); } }, () => {}); })();
