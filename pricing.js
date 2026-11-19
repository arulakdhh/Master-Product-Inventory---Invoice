"use strict";
/* =====================================================================
   Selling prices & profit
   • Cost basis everywhere = the supplier invoice "Rate" (purchase rate per unit).
   • Selling price = Rate × selling % (default 200%). The % can be set for all
     products, per division, or per product (or a fixed price per product).
     Settings live in settings/pricing.
   • New sales lines are priced at the selling price and remember their cost.
   • "Sales Analysis → Profit": sale value, purchase cost, profit and margin
     by invoice, line, product, customer, division and month.
   ===================================================================== */
S.pricing = { defaultPct: 200, divPct: {}, mat: {} };
S.prc = { q: "", div: "", flag: "", page: 0, edits: {} };
S.prof = { range: "fy", from: "", to: "", div: "", by: "invoice", q: "", open: null };

/* ---------- core rules ---------- */
function costOfItem(it) { if (!it) return 0; return r2(+it.rate || (it.qty ? (+it.taxable || 0) / it.qty : 0)); }
function pricingPct(mat, div) {
  const P = S.pricing || {}; const o = (P.mat || {})[mat];
  if (o && +o.pct > 0) return +o.pct;
  const d = (P.divPct || {})[div]; if (+d > 0) return +d;
  return +P.defaultPct > 0 ? +P.defaultPct : 200;
}
function sellPrice(mat, div, rate) {
  const o = ((S.pricing || {}).mat || {})[mat]; if (o && +o.price > 0) return r2(+o.price);
  return r2((+rate || 0) * pricingPct(mat, div) / 100);
}
function priceBasis(mat, div) { const o = ((S.pricing || {}).mat || {})[mat]; if (o && +o.price > 0) return "fixed price"; if (o && +o.pct > 0) return "product %"; if (+((S.pricing || {}).divPct || {})[div] > 0) return "division %"; return "default %"; }
/* cost of one sales line: what was remembered when it was added, else the stock line's purchase rate */
function lineCost(l) { if (+l.cost > 0) return +l.cost; const it = S.items.find(r => r.key === l.key); return costOfItem(it); }
function lineProfit(l, intra, opts) { const c = calcLine(l, intra, opts); const cost = r2(lineCost(l) * (+l.qty || 0)); return { sale: c.taxable, cost, profit: r2(c.taxable - cost), disc: r2(c.disc + c.hospDisc + c.surgDisc) }; }

/* ---------- settings ---------- */
(function waitDb() {
  if (!S.db) return setTimeout(waitDb, 500);
  S.db.doc("settings/pricing").onSnapshot(d => {
    const v = d.exists ? d.data() : {};
    S.pricing = { defaultPct: +v.defaultPct > 0 ? +v.defaultPct : 200, divPct: { ...(v.divPct || {}) }, mat: { ...(v.mat || {}) }, updatedAt: v.updatedAt || "", by: v.by || "" };
    if (S.tab === "pricing") renderPricing(); else if (S.tab === "profit") renderProfit(); else if (S.tab && S.tab.startsWith("sales-") && S.ed && typeof renderEditor === "function") renderEditor();
  }, () => { });
})();
async function savePricing(patch, note) {
  const box = $("prcMsg");
  if (!canEditPanel("inventory")) { if (box) msg(box, "bad", "You can view, but not change, selling prices."); return false; }
  const next = { defaultPct: S.pricing.defaultPct, divPct: S.pricing.divPct, mat: S.pricing.mat, ...patch, updatedAt: new Date().toISOString(), by: S.myEmail || "" };
  try { await S.db.doc("settings/pricing").set(next); S.prc.note = note || "Saved."; const b2 = $("prcMsg"); if (b2) msg(b2, "ok", S.prc.note); return true; }
  catch (e) { if (box) msg(box, "bad", "Couldn't save: " + (e.message || e.code || e) + (/permission/i.test(e.code || e.message || "") ? " — only an admin can change prices until the new Firestore rules are published." : "")); return false; }
}

/* ---------- panels & sections ---------- */
(function hook() {
  // the sell % is chosen on each invoice, so there is no separate price-setting tab
  const an = PANELS.find(p => p.key === "analytics"); if (an && !an.subs.some(s => s[0] === "profit")) an.subs.push(["profit", "Profit"]);
  VIEW_SECTIONS.pricing = ["tab-pricing"]; VIEW_SECTIONS.profit = ["tab-profit"];
  for (const id of ["tab-pricing", "tab-profit"]) {
    if (!ALL_SECTIONS.includes(id)) ALL_SECTIONS.push(id);
    if (!document.getElementById(id)) { const s = document.createElement("section"); s.id = id; s.className = "hidden"; s.style.cssText = "display:grid;gap:14px"; (document.getElementById("tab-salesdash") || document.getElementById("tab-sales") || document.querySelector("main")).after(s); }
  }
  const st = document.createElement("style");
  st.textContent = `#tab-pricing td,#tab-profit td{vertical-align:top}.tiles6{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.tile6{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.tile6 .k{font-size:12px;color:var(--muted)}.tile6 .v{font-size:21px;font-weight:700;margin-top:2px}.tile6 .s{font-size:12px;color:var(--muted);margin-top:2px}.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg button{border:0;background:var(--surface);padding:6px 11px;cursor:pointer;font:inherit;font-size:13px;color:inherit}.seg button.on{background:var(--accent);color:#fff}.pos{color:#17663a}.neg{color:var(--bad)}.lowp{background:rgba(220,60,60,.07)}`;
  document.head.appendChild(st);
  const _ro = renderOps;
  renderOps = function () { if (S.tab === "pricing") { renderPricing(); return true; } if (S.tab === "profit") { renderProfit(); return true; } return _ro.apply(this, arguments); };
})();

/* ---------- Inventory → Selling prices ---------- */
function prcRows() {
  return (S.master || []).filter(m => m.mat).map(m => {
    const div = (m.divCodes || "").split(", ")[0] || ""; const rate = r2(+m.rate || 0);
    const price = sellPrice(m.mat, div, rate); const pctEff = rate ? price / rate * 100 : 0;
    return { mat: m.mat, desc: m.desc || "", div, rate, mrp: r2(+m.mrp || 0), price, pct: pricingPct(m.mat, div), pctEff, basis: priceBasis(m.mat, div), profit: r2(price - rate), avail: m.availQty ?? m.qty ?? "", gst: +m.igstRate || 0 };
  });
}
function renderPricing() {
  const el = $("tab-pricing"); if (!el) return;
  const P = S.pricing; const can = canEditPanel("inventory"); const F = S.prc;
  const all = prcRows(); const q = F.q.trim().toLowerCase();
  const rows = all.filter(r => (!F.div || r.div === F.div) && (!q || (r.mat + " " + r.desc).toLowerCase().includes(q)) &&
    (!F.flag || (F.flag === "override" ? r.basis === "fixed price" || r.basis === "product %" : F.flag === "overmrp" ? r.mrp > 0 && r.price > r.mrp : F.flag === "norate" ? !r.rate : true)))
    .sort((a, b) => a.desc.localeCompare(b.desc));
  const PER = 100; const pages = Math.max(1, Math.ceil(rows.length / PER)); if (F.page >= pages) F.page = pages - 1; const view = rows.slice(F.page * PER, F.page * PER + PER);
  const overMrp = all.filter(r => r.mrp > 0 && r.price > r.mrp).length, noRate = all.filter(r => !r.rate).length;
  const ex = 1000;
  el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 4px">Selling prices</h2>
    <p class="note" style="margin:0">Your purchase <b>Rate</b> (from the supplier invoice) is the base. Selling price = Rate × selling %. Example: Rate ₹${inr(ex, 0)} at ${inr(P.defaultPct, 0)}% → sell at ₹${inr(ex * P.defaultPct / 100, 0)}, profit ₹${inr(ex * P.defaultPct / 100 - ex, 0)} per unit. This is only a guide: the actual sell % is entered on each invoice when you make it.</p>
    <div style="display:grid;gap:10px;margin-top:12px;max-width:760px">
      <div class="row" style="gap:10px;align-items:center"><b style="min-width:190px">All products</b><input type="number" id="prcDef" min="1" step="0.01" value="${P.defaultPct}" style="width:100px" ${can ? "" : "disabled"} aria-label="Default selling percent"> <span>% of Rate</span></div>
      ${S.divisions.map(d => `<div class="row" style="gap:10px;align-items:center"><span style="min-width:190px">${esc(d.code)} · ${esc(d.name)}</span><input type="number" min="1" step="0.01" data-prcdiv="${esc(d.code)}" value="${P.divPct[d.code] || ""}" placeholder="${P.defaultPct}" style="width:100px" ${can ? "" : "disabled"} aria-label="Selling percent for ${esc(d.name)}"> <span class="note">% (blank = all products %)</span></div>`).join("")}
      <div class="row" style="gap:10px">${can ? `<button class="btn primary" id="prcSave">Save selling %</button>` : `<span class="note">View only.</span>`}<button class="btn" id="prcXlsx">Download price list (Excel)</button></div>
      <div id="prcMsg" class="${S.prc.note ? "msg ok" : "hidden"}">${esc(S.prc.note || "")}</div>
      ${P.updatedAt ? `<div class="note">Last changed ${esc(P.updatedAt.slice(0, 16).replace("T", " "))}${P.by ? " by " + esc(P.by) : ""}</div>` : ""}
    </div></div>
  <div class="panel"><div class="toolbar">
    <input type="search" id="prcQ" placeholder="Search code or description…" value="${esc(F.q)}">
    <select id="prcDiv"><option value="">All divisions</option>${S.divisions.map(d => `<option value="${esc(d.code)}" ${F.div === d.code ? "selected" : ""}>${esc(d.code)} · ${esc(d.name)}</option>`).join("")}</select>
    <select id="prcFlag"><option value="">All products</option><option value="override" ${F.flag === "override" ? "selected" : ""}>Own % or fixed price</option><option value="overmrp" ${F.flag === "overmrp" ? "selected" : ""}>Selling price above MRP (${overMrp})</option><option value="norate" ${F.flag === "norate" ? "selected" : ""}>No purchase rate (${noRate})</option></select>
    <span class="count">${inr(rows.length, 0)} products${pages > 1 ? ` · page ${F.page + 1} of ${pages}` : ""}</span>
    ${pages > 1 ? `<button class="btn" data-prcpg="-1" ${F.page ? "" : "disabled"}>‹ Prev</button><button class="btn" data-prcpg="1" ${F.page < pages - 1 ? "" : "disabled"}>Next ›</button>` : ""}</div>
    <div class="tablewrap"><table><thead><tr><th>Material code</th><th>Description</th><th>Division</th><th class="num">Purchase rate (₹)</th><th class="num">Selling %</th><th class="num">Selling price (₹)</th><th class="num">Profit / unit (₹)</th><th class="num">MRP (₹)</th><th>Own % or fixed price</th></tr></thead><tbody>
    ${view.length ? view.map(r => { const o = P.mat[r.mat] || {}; const e = F.edits[r.mat] || {};
      return `<tr class="${r.mrp > 0 && r.price > r.mrp ? "lowp" : ""}"><td class="code">${esc(r.mat)}</td><td class="desc">${esc(r.desc)}</td><td>${esc(r.div)}</td><td class="num">${inr(r.rate)}</td>
      <td class="num">${inr(r.pctEff, 0)}%<div class="note">${esc(r.basis)}</div></td><td class="num"><b>${inr(r.price)}</b></td><td class="num ${r.profit >= 0 ? "pos" : "neg"}">${inr(r.profit)}</td>
      <td class="num">${r.mrp ? inr(r.mrp) : "—"}${r.mrp > 0 && r.price > r.mrp ? `<div class="note neg">above MRP</div>` : ""}</td>
      <td>${can ? `<div class="row" style="gap:4px;flex-wrap:nowrap"><input type="number" min="1" step="0.01" data-prcpct="${esc(r.mat)}" value="${esc(e.pct ?? (o.pct || ""))}" placeholder="%" style="width:70px" aria-label="Own selling percent for ${esc(r.mat)}"><input type="number" min="0" step="0.01" data-prcfix="${esc(r.mat)}" value="${esc(e.price ?? (o.price || ""))}" placeholder="₹ fixed" style="width:96px" aria-label="Fixed selling price for ${esc(r.mat)}"><button class="btn" data-prcrow="${esc(r.mat)}">Save</button>${o.pct || o.price ? `<button class="btn" data-prcclr="${esc(r.mat)}" title="Back to the division / all-products %">✕</button>` : ""}</div>` : (o.pct ? inr(o.pct, 0) + "%" : o.price ? "₹ " + inr(o.price) : "—")}</td></tr>`; }).join("") : `<tr><td colspan="9" class="empty">No products. Add supplier invoices first.</td></tr>`}
    </tbody></table></div></div>`;

  const rer = () => { clearTimeout(renderPricing._t); renderPricing._t = setTimeout(() => { renderPricing(); const x = $("prcQ"); if (x && document.activeElement !== x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 200); };
  $("prcQ").oninput = e => { F.q = e.target.value; F.page = 0; rer(); };
  $("prcDiv").onchange = e => { F.div = e.target.value; F.page = 0; renderPricing(); };
  $("prcFlag").onchange = e => { F.flag = e.target.value; F.page = 0; renderPricing(); };
  el.querySelectorAll("[data-prcpg]").forEach(b => b.onclick = () => { F.page += +b.dataset.prcpg; renderPricing(); });
  $("prcXlsx").onclick = async () => {
    const aoa = [["Material code", "Description", "Division", "Purchase rate (₹)", "Selling %", "Selling price (₹)", "Profit per unit (₹)", "MRP (₹)", "Price basis", "GST %"], ...rows.map(r => [r.mat, r.desc, r.div, r.rate, r2(r.pctEff), r.price, r.profit, r.mrp || "", r.basis, r.gst])];
    await save(`Selling_prices_${todayIso()}.xlsx`, xlsxFrom([["Selling prices", aoa]]));
  };
  if (!can) return;
  el.querySelectorAll("[data-prcpct],[data-prcfix]").forEach(i => i.oninput = () => { const m = i.dataset.prcpct || i.dataset.prcfix; (F.edits[m] ||= {})[i.dataset.prcpct ? "pct" : "price"] = i.value; });
  $("prcSave").onclick = async () => {
    const d = +$("prcDef").value; if (!(d > 0)) return msg($("prcMsg"), "bad", "Enter a selling % above 0 (200 means twice the purchase rate).");
    const divPct = {}; el.querySelectorAll("[data-prcdiv]").forEach(i => { if (+i.value > 0) divPct[i.dataset.prcdiv] = +i.value; });
    await savePricing({ defaultPct: d, divPct }, `Saved: all products ${inr(d, 0)}% of Rate${Object.keys(divPct).length ? ", " + Object.entries(divPct).map(([k, v]) => `${k} ${inr(v, 0)}%`).join(", ") : ""}.`);
  };
  el.querySelectorAll("[data-prcrow]").forEach(b => b.onclick = async () => {
    const m = b.dataset.prcrow; const pi = el.querySelector(`[data-prcpct="${CSS.escape(m)}"]`), fi = el.querySelector(`[data-prcfix="${CSS.escape(m)}"]`);
    const pct = +pi.value || 0, price = +fi.value || 0;
    if (pct && price) return msg($("prcMsg"), "bad", `${m}: enter either a % or a fixed price, not both.`);
    const mat = { ...S.pricing.mat }; if (pct > 0) mat[m] = { pct }; else if (price > 0) mat[m] = { price }; else delete mat[m];
    delete F.edits[m]; await savePricing({ mat }, `${m}: ${pct ? inr(pct, 0) + "% of Rate" : price ? "fixed price ₹ " + inr(price) : "back to the default %"}.`);
  });
  el.querySelectorAll("[data-prcclr]").forEach(b => b.onclick = async () => { const m = b.dataset.prcclr; const mat = { ...S.pricing.mat }; delete mat[m]; delete F.edits[m]; await savePricing({ mat }, `${m}: back to the default %.`); });
}

/* ---------- Sales Analysis → Profit ---------- */
function profRange() {
  const t = todayIso(); const y = +t.slice(0, 4), mo = +t.slice(5, 7); const fy0 = mo >= 4 ? y : y - 1; const R = S.prof.range;
  if (R === "fy") return [`${fy0}-04-01`, `${fy0 + 1}-03-31`, `FY ${fy0}–${String(fy0 + 1).slice(2)}`];
  if (R === "lfy") return [`${fy0 - 1}-04-01`, `${fy0}-03-31`, `FY ${fy0 - 1}–${String(fy0).slice(2)}`];
  if (R === "month") return [t.slice(0, 8) + "01", t, "This month"];
  if (R === "3m") { const d = new Date(); d.setMonth(d.getMonth() - 2, 1); return [d.toISOString().slice(0, 8) + "01", t, "Last 3 months"]; }
  if (R === "custom") return [S.prof.from || "2000-01-01", S.prof.to || t, `${S.prof.from ? dmy(S.prof.from) : "start"} – ${S.prof.to ? dmy(S.prof.to) : "today"}`];
  return ["2000-01-01", "2999-12-31", "All time"];
}
function profFacts() {
  const [from, to] = profRange(); const div = S.prof.div; const itemByKey = new Map(S.items.map(r => [r.key, r])); const out = [];
  for (const [id, d] of Object.entries(S.sales || {})) {
    if (d.type !== "INV" || d.status === "cancelled" || !d.date || d.date < from || d.date > to) continue;
    const intra = d.intra != null ? d.intra : true; const cs = d.case || {};
    (d.lines || []).forEach((l, i) => {
      const it = itemByKey.get(l.key) || {}; const dv = it.divCode || ""; if (div && dv !== div) return;
      const sale = r2(l.taxable != null ? l.taxable : calcLine(l, intra, d.opts).taxable);
      const unit = lineCost(l); const cost = r2(unit * (+l.qty || 0)); const disc = r2((l.disc || 0) + (l.hospDisc || 0) + (l.surgDisc || 0));
      out.push({ invId: id, no: d.no, date: d.date, month: d.date.slice(0, 7), customer: (d.customer && d.customer.name) || "", procedure: cs.procedure || "", surgeon: cs.surgeon || "", patient: cs.patient || "", line: i + 1, pid: l.pid || "", mat: l.mat || "", desc: l.desc || "", div: dv, qty: +l.qty || 0, unitCost: unit, rate: +l.rate || 0, sale, disc, cost, profit: r2(sale - cost), target: pricingPct(l.mat, dv), sellPct: l.sellPct, noCost: !unit });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.no < b.no ? 1 : -1));
}
const PROF_BY = { invoice: "Invoice", procedure: "Procedure", surgeon: "Surgeon", line: "Each instrument", product: "Product", customer: "Customer", div: "Division", month: "Month" };
function profGroup(F, by) {
  if (by === "line") return F.map(x => ({ key: x.invId + "#" + x.line, name: x.desc, sub: `${x.pid || x.mat} · ${x.no} · ${dmy(x.date)}${x.procedure ? " · " + x.procedure : ""} · bought ₹${inr(x.unitCost)} → sold ₹${inr(x.qty ? x.sale / x.qty : 0)}`, qty: x.qty, sale: x.sale, cost: x.cost, profit: x.profit, disc: x.disc, n: 1, target: x.target, noCost: x.noCost }));
  const kf = { invoice: x => x.invId, procedure: x => x.procedure || "(no procedure entered)", surgeon: x => x.surgeon || "(no surgeon entered)", product: x => x.mat, customer: x => x.customer || "—", div: x => x.div || "—", month: x => x.month }[by];
  const m = new Map();
  for (const x of F) { const k = kf(x); let g = m.get(k);
    if (!g) { g = { key: k, qty: 0, sale: 0, cost: 0, profit: 0, disc: 0, n: 0, inv: new Set(), tgtW: 0, noCost: 0,
      name: by === "invoice" ? x.no : by === "product" ? x.desc : by === "div" ? (x.div ? divName(x.div) : "—") : by === "month" ? new Date(x.month + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : k,
      sub: by === "invoice" ? `${dmy(x.date)} · ${x.customer}${x.procedure ? " · " + x.procedure : ""}${x.patient ? " · " + x.patient : ""}` : by === "product" ? x.mat : "" }; m.set(k, g); }
    g.qty += x.qty; g.sale = r2(g.sale + x.sale); g.cost = r2(g.cost + x.cost); g.profit = r2(g.profit + x.profit); g.disc = r2(g.disc + x.disc); g.n++; g.inv.add(x.invId); g.tgtW += x.target * x.cost; if (x.noCost) g.noCost++;
  }
  const arr = [...m.values()].map(g => ({ ...g, invoices: g.inv.size, target: g.cost ? g.tgtW / g.cost : 0 }));
  return by === "month" ? arr.sort((a, b) => a.key < b.key ? 1 : -1) : by === "invoice" ? arr : arr.sort((a, b) => b.profit - a.profit);
}
function renderProfit() {
  const el = $("tab-profit"); if (!el) return;
  const P = S.prof; const [, , label] = profRange(); const F = profFacts();
  const T = F.reduce((a, x) => (a.sale += x.sale, a.cost += x.cost, a.profit += x.profit, a.disc += x.disc, a.qty += x.qty, a), { sale: 0, cost: 0, profit: 0, disc: 0, qty: 0 });
  for (const k of ["sale", "cost", "profit", "disc"]) T[k] = r2(T[k]);
  const invs = new Set(F.map(x => x.invId)).size; const noCost = F.filter(x => x.noCost).length;
  const pc = v => v == null || !isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";
  const target = +S.pricing.defaultPct || 200; const achieved = T.cost ? T.sale / T.cost : null;
  const tgtProfit = r2(T.cost * target / 100 - T.cost); const gap = r2(T.profit - tgtProfit);
  const G = profGroup(F, P.by); const q = P.q.trim().toLowerCase();
  const rows = G.filter(g => !q || (g.name + " " + (g.sub || "")).toLowerCase().includes(q));
  const show = rows.slice(0, 500);
  const tile = (k, v, s, cls) => `<div class="tile6"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div><div class="s">${s}</div></div>`;
  el.innerHTML = `<div class="panel pad"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">
      <div><h2 style="margin:0">Profit</h2><div class="note">${esc(label)}${P.div ? " · " + esc(divName(P.div)) : " · all divisions"} · active tax invoices · sale value excludes GST · cost = purchase <b>Rate</b> × quantity</div></div>
      <button class="btn" id="pfXlsx">Download profit report (Excel)</button></div>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      <select id="pfRange">${[["fy", "This financial year"], ["lfy", "Last financial year"], ["3m", "Last 3 months"], ["month", "This month"], ["all", "All time"], ["custom", "Custom dates"]].map(([k, l]) => `<option value="${k}" ${P.range === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      ${P.range === "custom" ? `<input type="date" id="pfFrom" value="${esc(P.from)}" aria-label="From date"><input type="date" id="pfTo" value="${esc(P.to)}" aria-label="To date">` : ""}
      <select id="pfDiv"><option value="">All divisions</option>${S.divisions.map(d => `<option value="${esc(d.code)}" ${P.div === d.code ? "selected" : ""}>${esc(d.code)} · ${esc(d.name)}</option>`).join("")}</select>
    </div></div>
  <div class="tiles6">
    ${tile("Sales value (excl. GST)", "₹ " + inr(T.sale), `${invs} invoice${invs === 1 ? "" : "s"} · ${inr(T.qty, 0)} units`)}
    ${tile("Purchase cost (at Rate)", "₹ " + inr(T.cost), "what these items cost you")}
    ${tile("Profit", "₹ " + inr(T.profit), `sales − purchase cost`, T.profit >= 0 ? "pos" : "neg")}
    ${tile("Profit margin", pc(T.sale ? T.profit / T.sale : null), "profit ÷ sales value")}
    ${tile("Average sold at", achieved == null ? "—" : inr(achieved * 100, 0) + "% of Rate", "after discounts, as entered on the invoices")}
    ${tile("Discounts given", "₹ " + inr(T.disc), "line + hospital + surgeon discounts")}
  </div>
  ${noCost ? `<div class="msg warn">${noCost} invoice line${noCost === 1 ? " has" : "s have"} no purchase rate, so their cost counts as ₹0. Check those products' supplier invoices.</div>` : ""}
  <div class="panel"><div class="toolbar">
    <span class="seg" role="group" aria-label="Group by">${Object.entries(PROF_BY).map(([k, l]) => `<button data-pfby="${k}" class="${P.by === k ? "on" : ""}">${l}</button>`).join("")}</span>
    <input type="search" id="pfQ" placeholder="Search PID, product, procedure, invoice…" value="${esc(P.q)}">
    <span class="count">${inr(rows.length, 0)} row${rows.length === 1 ? "" : "s"}${rows.length > show.length ? ` (first ${show.length} shown — download Excel for all)` : ""}</span></div>
    <div class="tablewrap"><table><thead><tr><th>${PROF_BY[P.by]}</th>${P.by !== "line" ? `<th class="num">Invoices</th>` : ""}<th class="num">Qty</th><th class="num">Sales value (₹)</th><th class="num">Purchase cost (₹)</th><th class="num">Profit (₹)</th><th class="num">Margin</th><th class="num">Sold at % of Rate</th><th class="num">Discounts (₹)</th></tr></thead><tbody>
    ${show.length ? show.map(g => { const at = g.cost ? g.sale / g.cost * 100 : null; const low = g.profit < 0;
      return `<tr class="${low ? "lowp" : ""}"><td><b>${esc(g.name)}</b>${g.sub ? `<div class="note">${esc(g.sub)}</div>` : ""}</td>${P.by !== "line" ? `<td class="num">${inr(g.invoices, 0)}</td>` : ""}<td class="num">${inr(g.qty, 0)}</td><td class="num">${inr(g.sale)}</td><td class="num">${inr(g.cost)}${g.noCost ? `<div class="note neg">no rate</div>` : ""}</td>
      <td class="num ${g.profit >= 0 ? "pos" : "neg"}"><b>${inr(g.profit)}</b></td><td class="num">${pc(g.sale ? g.profit / g.sale : null)}</td><td class="num">${at == null ? "—" : inr(at, 0) + "%"}${low ? `<div class="note neg">loss</div>` : ""}</td><td class="num">${inr(g.disc)}</td></tr>`; }).join("")
      : `<tr><td colspan="9" class="empty">No tax invoices in this period.</td></tr>`}
    ${show.length ? `<tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total</td>${P.by !== "line" ? `<td class="num">${inr(invs, 0)}</td>` : ""}<td class="num">${inr(T.qty, 0)}</td><td class="num">${inr(T.sale)}</td><td class="num">${inr(T.cost)}</td><td class="num">${inr(T.profit)}</td><td class="num">${pc(T.sale ? T.profit / T.sale : null)}</td><td class="num">${achieved == null ? "—" : inr(achieved * 100, 0) + "%"}</td><td class="num">${inr(T.disc)}</td></tr>` : ""}
    </tbody></table></div>
    <div class="note" style="padding:8px 12px">Rows shaded red were sold at a loss (below the purchase rate). Profit here is before your own expenses (freight, salaries, rent).</div></div>`;

  $("pfRange").onchange = e => { P.range = e.target.value; renderProfit(); };
  if ($("pfFrom")) { $("pfFrom").onchange = e => { P.from = e.target.value; renderProfit(); }; $("pfTo").onchange = e => { P.to = e.target.value; renderProfit(); }; }
  $("pfDiv").onchange = e => { P.div = e.target.value; renderProfit(); };
  el.querySelectorAll("[data-pfby]").forEach(b => b.onclick = () => { P.by = b.dataset.pfby; renderProfit(); });
  $("pfQ").oninput = e => { P.q = e.target.value; clearTimeout(renderProfit._t); renderProfit._t = setTimeout(() => { renderProfit(); const x = $("pfQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
  $("pfXlsx").onclick = async () => {
    const pctv = (a, b) => b ? r2(a / b * 100) : "";
    const head = ["Sales value (₹)", "Purchase cost (₹)", "Profit (₹)", "Margin %", "Sold at % of Rate", "Discounts (₹)"];
    const sheet = by => { const g = profGroup(F, by); return [[PROF_BY[by], "Detail", "Invoices", "Qty", ...head], ...g.map(x => [x.name, x.sub || "", x.invoices || 1, x.qty, x.sale, x.cost, x.profit, pctv(x.profit, x.sale), pctv(x.sale, x.cost), x.disc])]; };
    const lines = [["Invoice no.", "Date", "Customer", "Procedure", "Surgeon", "Patient / IP no.", "Line", "PID", "Material code", "Description", "Division", "Qty", "Purchase rate (₹)", "Selling rate (₹)", "Sales value (₹)", "Purchase cost (₹)", "Profit (₹)", "Margin %", "Sell % entered", "Sold at % of Rate (after discounts)", "Discounts (₹)"],
      ...F.map(x => [x.no, dmy(x.date), x.customer, x.procedure, x.surgeon, x.patient, x.line, x.pid, x.mat, x.desc, x.div, x.qty, x.unitCost, x.rate, x.sale, x.cost, x.profit, pctv(x.profit, x.sale), x.sellPct === "" || x.sellPct == null ? "" : x.sellPct, pctv(x.sale, x.cost), x.disc])];
    const sum = [["Profit report", label + (P.div ? " · " + divName(P.div) : " · all divisions")], [], ["Sales value excl. GST (₹)", T.sale], ["Purchase cost at Rate (₹)", T.cost], ["Profit (₹)", T.profit], ["Margin %", pctv(T.profit, T.sale)], ["Sold at % of Rate", pctv(T.sale, T.cost)], ["Discounts given (₹)", T.disc], ["Invoices", invs], ["Units", T.qty]];
    await save(`Profit_report_${todayIso()}.xlsx`, xlsxFrom([["Summary", sum], ["By invoice", sheet("invoice")], ["By procedure", sheet("procedure")], ["By surgeon", sheet("surgeon")], ["Each instrument", lines], ["By product", sheet("product")], ["By customer", sheet("customer")], ["By division", sheet("div")], ["By month", sheet("month")]]));
  };
}
