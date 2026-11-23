/* D Cart — import past sales bills (DHH_sales_bills_import.json).
   Each bill becomes a tax invoice. Products found in stock are taken out of stock:
   same material code + same batch first, then the oldest purchase invoice. Pieces with no stock left
   (or products not in D Cart) stay on the bill as sales lines that don't touch stock. */
(function () {
  const BI = { file: null, plan: null, paidCredit: true, busy: false, msg: "" };
  const nz = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
  const ymd = s => { const m = String(s || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); return m ? m[3] + m[2].padStart(2, "0") + m[1].padStart(2, "0") : "99999999"; };
  const impId = no => "IMP_" + String(no).replace(/[^A-Za-z0-9_-]/g, "_");

  function buildPlan(data) {
    const sold = soldMap(); const used = {}; const byMat = {};
    for (const r of S.items) { const k = nz(r.mat); if (k) (byMat[k] ||= []).push(r); }
    const avail = r => r2(r.qty - (sold[r.key] || 0) - (used[r.key] || 0));
    const bills = [...data.bills].sort((a, b) => (a.date + a.billNo).localeCompare(b.date + b.billNo));
    return bills.map(b => {
      const exists = !!S.sales[impId(b.billNo)] || Object.values(S.sales).some(d => d.no === b.billNo && d.status !== "cancelled");
      const out = []; let fromStock = 0, noStock = 0, noStockValue = 0;
      for (const l of b.lines) {
        const cands = (byMat[nz(l.mat)] || []).slice().sort((x, y) => (nz(y.batch) === nz(l.batch)) - (nz(x.batch) === nz(l.batch)) || ymd(x.invoiceDate).localeCompare(ymd(y.invoiceDate)) || String(x.key).localeCompare(String(y.key)));
        const refCost = cands.length ? costOfItem(cands[0]) : 0;
        for (const [need0, free] of [[+l.qty || 0, false], [+l.free || 0, true]]) {
          let need = need0; if (!(need > 0)) continue;
          const base = { mat: l.mat || l.printedMat || "", desc: l.desc, hsn: l.hsn || "", exp: l.exp || "", mrp: +l.mrp || 0, rate: free ? 0 : +l.rate || 0, discPct: free ? 0 : +l.discPct || 0, gstRate: +l.gstRate || 0, uom: "" };
          if (!exists) for (const r of cands) {
            if (need <= 0) break; const pd = ymd(r.invoiceDate); if (pd !== "99999999" && pd > b.date.replace(/-/g, "")) continue;  // bought after this bill: can't be what was sold
            const a = avail(r); if (a <= 0) continue; const q = Math.min(a, need);
            used[r.key] = r2((used[r.key] || 0) + q); need = r2(need - q); fromStock += q;
            out.push({ ...base, key: r.key, pid: r.dhhId || "", purchaseInvoice: r.invoiceNo, purchaseSr: r.sr, batch: r.batch || l.batch || "", serial: r.serial || "", exp: r.exp || l.exp || "", hsn: r.hsn || base.hsn, uom: r.uom || "", qty: q, cost: costOfItem(r),
              remarks: [free ? "Free" : "", nz(r.batch) !== nz(l.batch) && l.batch ? `bill batch ${l.batch}` : ""].filter(Boolean).join(" · ") });
          }
          if (need > 0) { noStock += need; if (!free) noStockValue += r2(need * base.rate * (1 - base.discPct / 100));
            out.push({ ...base, key: "", pid: "", purchaseInvoice: "", purchaseSr: "", batch: l.batch || "", serial: "", qty: need, cost: refCost, noStock: true,
              remarks: [free ? "Free" : "", cands.length ? "no D Cart stock bought on or before this date" : "not in D Cart stock"].filter(Boolean).join(" · ") }); }
        }
      }
      const lines = out.map(l => { const c = calcLine(l, true, {}); const cv = r2((+l.cost || 0) * l.qty); return { ...l, ...c, sellPct: l.cost && l.rate ? markupPct(l.cost, l.rate) : "", costValue: cv, profit: r2(c.taxable - cv) }; });
      const totals = calcDoc(lines, true, "INV", {});
      return { b, exists, lines, totals, fromStock, noStock, noStockValue, ok: Math.abs(totals.taxable - (+b.base || 0)) < 0.05 };
    });
  }

  async function custIdFor(b) {
    const nm = b.customer.trim(); const hit = Object.entries(S.customers || {}).find(([, c]) => (c.name || "").trim().toUpperCase() === nm.toUpperCase());
    if (hit) return [hit[0], hit[1]];
    const id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const c = { name: nm, address: "", gstin: (b.gstin || "").toUpperCase(), stateCode: "33", stateName: "Tamil Nadu", dl: "", phone: "" };
    await S.db.doc(`customers/${id}`).set(c); S.customers[id] = c; return [id, c];
  }

  async function runImport() {
    const P = BI.plan.filter(p => !p.exists && p.lines.length); if (!P.length) return;
    BI.busy = true; let n = 0; draw();
    try {
      for (const p of P) {
        const b = p.b; const [customerId, c] = await custIdFor(b); const cash = /cash/i.test(b.terms || "");
        const cd = cash ? 0 : (c.creditDays != null ? +c.creditDays : 30); const due = new Date(b.date); due.setDate(due.getDate() + cd);
        const doc = { type: "INV", no: b.billNo, date: b.date, dueDate: due.toISOString().slice(0, 10), creditDays: cd, opts: {}, validUntil: "", yourRef: "", preparedBy: "",
          customerId, customer: { name: c.name, address: c.address || "", gstin: c.gstin || "", stateCode: "33", stateName: "Tamil Nadu", dl: c.dl || "", phone: c.phone || "" }, intra: true,
          extra: [{ label: "Terms", value: b.terms || "" }], notes: `Imported from past bill ${b.file || b.billNo}.`, lines: p.lines, totals: p.totals, company: { ...S.company },
          case: { procedure: "", surgeon: "", patient: "" }, fy: fyOf(b.date), seq: 0, status: "active", fromDc: false, refId: "", refNo: "",
          imported: { source: "past bill", file: b.file || "", at: new Date().toISOString() }, paidOutside: cash || BI.paidCredit, createdAt: new Date().toISOString() };
        await S.db.doc(`sales/${impId(b.billNo)}`).set(doc); S.sales[impId(b.billNo)] = doc; n++; BI.msg = `Saving… ${n} of ${P.length}`; draw();
      }
      BI.msg = `Done: ${n} bill${n === 1 ? "" : "s"} added. Stock is updated.`; BI.plan = null; BI.file = null;
    } catch (e) { BI.msg = `Stopped after ${n} bill${n === 1 ? "" : "s"}: ${e.message || e.code}. Load the file again; bills already added are skipped.`; }
    BI.busy = false; if (typeof computeStock === "function") computeStock(S.items); draw(); if (typeof renderSalesList === "function" && $("salestbl")) renderSalesList();
  }

  function draw() {
    const box = $("impBox"); if (!box) return;
    const P = BI.plan; let h = `<div class="row" style="justify-content:space-between"><h3 style="margin:0">Import past sales bills</h3><button class="btn" data-bi="close">Close</button></div>
      <p class="note" style="margin:6px 0 10px">Choose <b>DHH_sales_bills_import.json</b>. Each bill becomes a tax invoice with its own bill number. Products in stock are taken out (same batch first, then the oldest purchase; only stock bought on or before the bill date). Products not in D Cart are kept on the bill but don't change stock. Bills already imported are skipped.</p>
      <div class="row"><button class="btn primary" data-bi="pick" ${BI.busy ? "disabled" : ""}>Choose file…</button><input type="file" id="biFile" accept=".json,application/json" hidden>${BI.file ? `<span class="note">${esc(BI.file)}</span>` : ""}</div>`;
    if (P) {
      const nw = P.filter(p => !p.exists), sk = P.length - nw.length; const sum = (a, k) => a.reduce((s, p) => s + p[k], 0);
      const sales = sum(nw.map(p => ({ v: p.totals.taxable })), "v"), bad = nw.filter(p => !p.ok);
      h += `<div class="row" style="gap:18px;margin:12px 0;flex-wrap:wrap">
        <div><div class="note">Bills to add</div><b>${nw.length}</b>${sk ? ` <span class="note">(${sk} already in D Cart, skipped)</span>` : ""}</div>
        <div><div class="note">Sales before GST</div><b>₹${inr(sales)}</b></div>
        <div><div class="note">Pieces taken out of stock</div><b>${inr(sum(nw, "fromStock"), 0)}</b></div>
        <div><div class="note">Pieces with no stock in D Cart</div><b>${inr(sum(nw, "noStock"), 0)}</b> <span class="note">₹${inr(sum(nw, "noStockValue"))} of sales</span></div></div>
        ${bad.length ? `<p class="note" style="color:var(--bad)">Totals don't match the printed bill for ${bad.map(p => esc(p.b.billNo)).join(", ")}.</p>` : ""}
        <label class="chk" style="margin:6px 0"><input type="checkbox" data-bi="paid" ${BI.paidCredit ? "checked" : ""}> Credit bills are already paid (don't show them as money due). Cash bills are always marked paid.</label>
        <details style="margin:8px 0"><summary class="note" style="cursor:pointer">See each bill</summary><div class="tablewrap" style="max-height:360px"><table><thead><tr><th>Bill</th><th>Date</th><th>Customer</th><th class="num">Lines</th><th class="num">From stock</th><th class="num">No stock</th><th class="num">Total (₹)</th><th></th></tr></thead><tbody>
        ${P.map(p => `<tr><td class="code">${esc(p.b.billNo)}</td><td>${esc(dmy(p.b.date))}</td><td>${esc(p.b.customer)}</td><td class="num">${p.b.lines.length}</td><td class="num">${inr(p.fromStock, 0)}</td><td class="num">${inr(p.noStock, 0)}</td><td class="num">${inr(p.totals.grand)}</td><td>${p.exists ? pill("", "Already in D Cart") : p.ok ? pill("good", "Ready") : pill("bad", "Check total")}</td></tr>`).join("")}
        </tbody></table></div></details>
        <div class="row"><button class="btn primary" data-bi="go" ${BI.busy || !nw.length ? "disabled" : ""}>Add ${nw.length} bill${nw.length === 1 ? "" : "s"} and update stock</button></div>`;
    }
    if (BI.msg) h += `<p class="note" style="margin:10px 0 0" role="status">${esc(BI.msg)}</p>`;
    box.innerHTML = h;
  }

  window.openBillImport = function () { const box = $("impBox"); if (!box) return; box.classList.toggle("hidden"); if (box.dataset.bound !== "1") { box.dataset.bound = "1";
    box.addEventListener("click", e => { const b = e.target.closest("[data-bi]"); if (!b) return; const a = b.dataset.bi;
      if (a === "close") { box.classList.add("hidden"); return; }
      if (a === "pick") { $("biFile").click(); return; }
      if (a === "go") return runImport(); });
    box.addEventListener("change", e => { if (e.target.dataset.bi === "paid") BI.paidCredit = e.target.checked;
      if (e.target.id === "biFile") { const f = e.target.files[0]; if (!f) return; f.text().then(t => { let d; try { d = JSON.parse(t); } catch (_) { d = null; }
        if (!d || d.kind !== "dcart-sales-bills" || !Array.isArray(d.bills)) { BI.plan = null; BI.msg = "That isn't a D Cart sales-bills file."; return draw(); }
        BI.file = f.name; BI.msg = ""; BI.plan = buildPlan(d); draw(); }); } }); }
    draw(); };
  window.biImpId = impId;
})();
