/* D Cart — product history ("where did this go?").
   Click any line in Inventory → All lines (or a product in Product master) to see where it came from
   and every DHH document it went out on: invoice / challan number, date, customer, place, case details,
   quantity, rate and payment status. Read-only. */
(function () {
  const TYPE = { INV: "Tax invoice", DC: "Delivery challan", QTN: "Quotation", SO: "Sales order" };
  const TAB = { INV: ["invoice", "sales-inv"], DC: ["dispatch", "sales-dc"], QTN: ["sellorder", "sales-so"], SO: ["sellorder", "sales-so"] };
  const place = c => { if (!c) return ""; const a = String(c.address || "").split(/\n|,/).map(s => s.trim()).filter(Boolean);
    const city = a.length ? a[a.length - 1].replace(/\s*-?\s*\d{6}\s*$/, "") : ""; return [city, c.stateName].filter(Boolean).filter((v, i, x) => x.indexOf(v) === i).join(", "); };
  const caseText = d => { const c = d.case || {}; return [c.procedure, c.surgeon && "Dr " + String(c.surgeon).replace(/^dr\.?\s*/i, ""), c.patient && "Patient: " + c.patient].filter(Boolean).join(" · "); };
  const payText = (id, d) => {
    if (d.type !== "INV" || d.status === "cancelled") return "";
    if (d.paidOutside) return `<span class="good">Paid</span>`;
    const bal = typeof invoiceBalance === "function" ? invoiceBalance(id) : null; if (bal == null) return "";
    return bal <= 0.5 ? `<span class="good">Paid</span>` : `<span class="warn">Due ₹${inr(bal)}</span>`;
  };
  const statusText = (d, l) => d.status === "cancelled" ? `<span class="bad">Cancelled</span>`
    : d.type === "DC" && l.returnedQty ? `Returned ${inr(l.returnedQty, 0)}` : d.type === "INV" && d.fromDc ? "Billed from challan" : d.type === "QTN" || d.type === "SO" ? "No stock change" : "";

  function movements(keys) {
    const ks = new Set(keys); const out = [];
    for (const [id, d] of Object.entries(S.sales || {})) for (const l of d.lines || []) if (l.key && ks.has(l.key))
      out.push({ id, d, l });
    return out.sort((a, b) => String(a.d.date).localeCompare(String(b.d.date)) || String(a.d.no).localeCompare(String(b.d.no)));
  }

  function draw(title, items) {
    let box = $("traceBox");
    if (!box) { box = document.createElement("div"); box.id = "traceBox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "traceTitle");
      box.style.cssText = "position:fixed;inset:0;z-index:50;display:flex;justify-content:flex-end;background:rgba(0,0,0,.45)";
      box.addEventListener("click", e => { if (e.target === box || e.target.closest("[data-trclose]")) close();
        const o = e.target.closest("[data-tropen]"); if (o) openDoc(o.dataset.tropen); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && $("traceBox") && !$("traceBox").hidden) close(); });
      document.body.appendChild(box); }
    if (typeof computeStock === "function") computeStock(S.items);
    const keys = items.map(r => r.key); const mv = movements(keys);
    const buy = items.reduce((a, r) => a + (+r.qty || 0), 0), avail = items.reduce((a, r) => a + (+r.availQty || 0), 0);
    const out = mv.filter(m => m.d.status !== "cancelled" && (m.d.type === "DC" || (m.d.type === "INV" && !m.d.fromDc))).reduce((a, m) => a + (+m.l.qty || 0) - (+m.l.returnedQty || 0), 0);
    const r0 = items[0] || {};
    const buyRows = items.map(r => `<tr><td class="dhh">${esc(r.dhhId || "—")}</td><td class="code">${esc(r.invoiceNo)}</td><td>${esc(r.invoiceDate || "")}</td><td>${esc([r.batch, r.serial].filter(Boolean).join(" / "))}</td><td>${esc(r.exp || "")}</td><td class="num">${inr(r.qty, 0)}</td><td class="num">${inr(r.availQty ?? r.qty, 0)}</td></tr>`).join("");
    const mvRows = mv.map(({ id, d, l }) => {
      const c = d.customer || {};
      return `<tr${d.status === "cancelled" ? ' style="opacity:.55"' : ""}>
        <td><b>${esc(TYPE[d.type] || d.type)}</b><div class="code">${esc(d.no || "")}</div></td>
        <td>${esc(dmy(d.date))}</td>
        <td>${esc(c.name || "—")}${place(c) ? `<div class="note">${esc(place(c))}</div>` : ""}${caseText(d) ? `<div class="note">${esc(caseText(d))}</div>` : ""}</td>
        <td class="dhh">${esc(l.pid || "")}</td>
        <td class="num">${inr(l.qty, 0)}${l.rate ? "" : ` <span class="note">free</span>`}</td>
        <td class="num">${l.rate ? "₹" + inr(l.rate) : "—"}</td>
        <td class="num">${l.total != null ? "₹" + inr(l.total) : ""}</td>
        <td>${[statusText(d, l), payText(id, d)].filter(Boolean).join("<br>")}</td>
        <td><button class="btn" data-tropen="${esc(id)}" aria-label="Open ${esc(TYPE[d.type] || "")} ${esc(d.no || "")}">Open</button></td></tr>`; }).join("");
    box.innerHTML = `<div style="width:min(980px,100%);height:100%;overflow:auto;background:var(--surface);border-left:1px solid var(--line);padding:18px 20px;display:grid;gap:14px;align-content:start">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 id="traceTitle" style="margin:0">${esc(title)}</h2>
        <div class="note">${esc(r0.mat || "")}${r0.hsn ? " · HSN " + esc(r0.hsn) : ""}${r0.divCode ? " · " + esc(r0.divCode) : ""}</div></div>
        <button class="btn" data-trclose>Close</button></div>
      <div class="row" style="gap:22px;flex-wrap:wrap">
        <div><div class="note">Bought</div><b>${inr(buy, 0)}</b></div><div><div class="note">Gone out (sold or on challan)</div><b>${inr(out, 0)}</b></div>
        <div><div class="note">In stock now</div><b>${inr(avail, 0)}</b></div><div><div class="note">DHH documents</div><b>${mv.length}</b></div></div>
      <section><h3 style="margin:0 0 6px">Where it came from</h3><div class="tablewrap" style="max-height:260px"><table><thead><tr><th>PID</th><th>Supplier invoice</th><th>Date</th><th>Batch / serial</th><th>Expiry</th><th class="num">Bought</th><th class="num">In stock</th></tr></thead><tbody>${buyRows}</tbody></table></div></section>
      <section><h3 style="margin:0 0 6px">Where it went</h3>${mv.length ? `<div class="tablewrap" style="max-height:none"><table><thead><tr><th>DHH document</th><th>Date</th><th>Customer · place · case</th><th>PID</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>${mvRows}</tbody></table></div>`
        : `<p class="note">Not sold, sent or quoted yet.</p>`}</section></div>`;
    box.hidden = false; box.style.display = "flex"; const cb = box.querySelector("[data-trclose]"); if (cb) cb.focus();
  }
  function close() { const b = $("traceBox"); if (b) { b.hidden = true; b.style.display = "none"; } }
  function openDoc(id) {
    const d = S.sales[id]; if (!d) return; close(); const [panel, tab] = TAB[d.type] || ["invoice", "sales-inv"];
    if (typeof setView === "function") setView(panel, tab); S.salesView = id; setTimeout(() => { if (typeof renderDocView === "function") renderDocView(id, true); }, 50);
  }

  window.showLineHistory = key => { const r = S.items.find(x => x.key === key); if (r) draw(r.desc || r.mat || "Product", [r]); };
  window.showProductHistory = mat => { const L = S.items.filter(x => x.mat === mat); if (L.length) draw(L[0].desc || mat, L); };

  // Click a row in Inventory (All lines / Product master) to open its history. Checkboxes, code links and badges keep their own behaviour.
  function bind() { const t = $("tbl"); if (!t || t.dataset.trace) return; t.dataset.trace = "1";
    t.tBodies[0].addEventListener("click", e => {
      if (e.target.closest("input,a,button,.badge,label")) return;
      const tr = e.target.closest("tr[data-key],tr[data-mat]"); if (!tr) return;
      if (tr.dataset.key) showLineHistory(tr.dataset.key); else showProductHistory(tr.dataset.mat);
    }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
