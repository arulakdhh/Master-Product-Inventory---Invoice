/* D Cart — import past sales bills (DHH_sales_bills_import.json).
   Each bill becomes a tax invoice. Products found in stock are taken out of stock:
   same material code + same batch first, then the oldest purchase invoice. Pieces with no stock left
   (or products not in D Cart) stay on the bill as sales lines that don't touch stock. */
(function () {
  const BI = { file: null, plan: null, paidCredit: true, busy: false, msg: "" };
  const nz = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
  const ymd = s => { const m = String(s || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); return m ? m[3] + m[2].padStart(2, "0") + m[1].padStart(2, "0") : "99999999"; };
  const impId = no => "IMP_" + String(no).replace(/[^A-Za-z0-9_-]/g, "_");
  /* Batch matching. Bills are typed by hand, so a batch number may be cut short or mistyped
     (MI026017 for MI1026017, M11026022 for MI1026022, 3FG-014 for C3FG014). 3 = same, 2 = same once
     look-alike letters are evened out (I/L→1, O→0), 1 = one is inside the other or one character off. */
  const bz = s => nz(s).replace(/[IL]/g, "1");
  function lev1(a, b) { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return e + (a.length - i) + (b.length - j) <= 1; }
  function batchScore(bill, stock) { const a = nz(bill), b = nz(stock); if (!a || !b) return 0; if (a === b) return 3;
    const x = bz(bill), y = bz(stock); if (x === y) return 2;
    if (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x) || lev1(x, y))) return 1; return 0; }
  /* Order stock for a bill line: best batch match first, then the oldest purchase. Stock bought after the bill
     is skipped, except the same batch (a supplier invoice can be dated a little after the goods arrived): up to 31 days. */
  function candidatesFor(list, l, billYmd) {
    const lim = (() => { const d = new Date(billYmd.slice(0, 4) + "-" + billYmd.slice(4, 6) + "-" + billYmd.slice(6, 8)); d.setDate(d.getDate() + 31); return d.toISOString().slice(0, 10).replace(/-/g, ""); })();
    return (list || []).map(r => ({ r, s: batchScore(l.batch, r.batch), pd: ymd(r.invoiceDate) }))
      .filter(x => x.pd === "99999999" || x.pd <= billYmd || (x.s >= 2 && x.pd <= lim))
      .sort((a, b) => b.s - a.s || a.pd.localeCompare(b.pd) || String(a.r.key).localeCompare(String(b.r.key))).map(x => x.r);
  }

  function buildPlan(data) {
    const sold = soldMap(); const used = {}; const byMat = {};
    for (const r of S.items) { const k = nz(r.mat); if (k) (byMat[k] ||= []).push(r); }
    const avail = r => r2(r.qty - (sold[r.key] || 0) - (used[r.key] || 0));
    const bills = [...data.bills].sort((a, b) => (a.date + a.billNo).localeCompare(b.date + b.billNo));
    return bills.map(b => {
      const exists = !!S.sales[impId(b.billNo)] || Object.values(S.sales).some(d => d.no === b.billNo && d.status !== "cancelled");
      const out = []; let fromStock = 0, noStock = 0, noStockValue = 0;
      for (const l of b.lines) {
        const cands = candidatesFor(byMat[nz(l.mat)], l, b.date.replace(/-/g, ""));
        const refCost = cands.length ? costOfItem(cands[0]) : 0;
        for (const [need0, free] of [[+l.qty || 0, false], [+l.free || 0, true]]) {
          let need = need0; if (!(need > 0)) continue;
          const base = { mat: l.mat || l.printedMat || "", desc: l.desc, hsn: l.hsn || "", exp: l.exp || "", mrp: +l.mrp || 0, rate: free ? 0 : +l.rate || 0, discPct: free ? 0 : +l.discPct || 0, gstRate: +l.gstRate || 0, uom: "" };
          if (!exists) for (const r of cands) {
            if (need <= 0) break;
            const a = avail(r); if (a <= 0) continue; const q = Math.min(a, need);
            used[r.key] = r2((used[r.key] || 0) + q); need = r2(need - q); fromStock += q;
            out.push({ ...base, billBatch: l.batch || "", key: r.key, pid: r.dhhId || "", purchaseInvoice: r.invoiceNo, purchaseSr: r.sr, batch: r.batch || l.batch || "", serial: r.serial || "", exp: r.exp || l.exp || "", hsn: r.hsn || base.hsn, uom: r.uom || "", qty: q, cost: costOfItem(r),
              remarks: [free ? "Free" : "", l.batch && nz(r.batch) !== nz(l.batch) ? `bill batch ${l.batch}` : ""].filter(Boolean).join(" · ") });
          }
          if (need > 0) { noStock += need; if (!free) noStockValue += r2(need * base.rate * (1 - base.discPct / 100));
            out.push({ ...base, billBatch: l.batch || "", key: "", pid: "", purchaseInvoice: "", purchaseSr: "", batch: l.batch || "", serial: "", qty: need, cost: refCost, noStock: true,
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
      <p class="note" style="margin:6px 0 10px">Choose <b>DHH_sales_bills_import.json</b>. Each bill becomes a tax invoice with its own bill number. Products in stock are taken out by the batch number on the bill first (allowing for typing slips), then the oldest purchase; only stock bought on or before the bill date (the exact same batch may be up to 31 days later). Products not in D Cart are kept on the bill but don't change stock. Bills already imported are skipped.</p>
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

  window.openBillImport = function () { const box = $("impBox"); if (!box) return; box.onclick = null; box.classList.toggle("hidden"); if (box.dataset.bound !== "1") { box.dataset.bound = "1";
    box.addEventListener("click", e => { const b = e.target.closest("[data-bi]"); if (!b) return; const a = b.dataset.bi;
      if (a === "close") { box.classList.add("hidden"); return; }
      if (a === "pick") { $("biFile").click(); return; }
      if (a === "go") return runImport(); });
    box.addEventListener("change", e => { if (e.target.dataset.bi === "paid") BI.paidCredit = e.target.checked;
      if (e.target.id === "biFile") { const f = e.target.files[0]; if (!f) return; f.text().then(t => { let d; try { d = JSON.parse(t); } catch (_) { d = null; }
        if (!d || d.kind !== "dcart-sales-bills" || !Array.isArray(d.bills)) { BI.plan = null; BI.msg = "That isn't a D Cart sales-bills file."; return draw(); }
        BI.file = f.name; BI.msg = ""; BI.plan = buildPlan(d); draw(); }); } }); }
    draw(); };

  /* ---------- Link past bills to stock ----------
     Lines of imported bills that had no stock when they were imported ("noStock") are linked to stock
     uploaded later: same batch first, then the oldest purchase, only stock bought on or before the bill date.
     Amounts on the bills stay the same; only the stock link changes. */
  const LK = { plan: null, busy: false, msg: "" };
  const billBatchOf = l => l.billBatch || ((String(l.remarks || "").match(/bill batch (\S+)/) || [])[1]) || l.batch || "";
  function linkPlan() {
    const sold = soldMap(); const used = {}; const byMat = {}; const byKey = {};
    for (const r of S.items) { byKey[r.key] = r; const k = nz(r.mat); if (k) (byMat[k] ||= []).push(r); }
    const avail = r => r2(r.qty - (sold[r.key] || 0) - (used[r.key] || 0));
    const docs = Object.entries(S.sales).filter(([, d]) => d.type === "INV" && d.imported && d.status !== "cancelled")
      .sort((a, b) => (a[1].date + a[1].no).localeCompare(b[1].date + b[1].no));
    const out = []; let skippedRound = 0, docsWith = 0;
    const finish = p => { const c = calcLine(p, true, {}); const cv = r2((+p.cost || 0) * p.qty); return { ...p, ...c, sellPct: p.cost && p.rate ? markupPct(p.cost, p.rate) : "", costValue: cv, profit: r2(c.taxable - cv) }; };
    for (const [id, d] of docs) {
      const bd = String(d.date || "").replace(/-/g, ""); const lines = []; let linked = 0, moved = 0, left = 0, changed = false, any = false;
      for (const orig of d.lines) {
        const bb = billBatchOf(orig); const cur = orig.key ? byKey[orig.key] : null;
        const curScore = cur ? batchScore(bb, cur.batch) : -1;
        // A: no stock yet → link.  B: linked to a different batch while a better match for the bill's batch now exists → move.
        const mode = orig.noStock ? "A" : (cur && bb && curScore < 3 ? "B" : "");
        if (!mode) { lines.push(orig); continue; } any = true;
        const qty = +orig.qty || 0; const l = { ...orig, batch: bb };
        if (mode === "B") sold[cur.key] = r2((sold[cur.key] || 0) - qty);          // release its current stock while we look
        let cands = candidatesFor(byMat[nz(l.mat)], l, bd);
        if (mode === "B") cands = cands.filter(r => r.key !== cur.key && batchScore(bb, r.batch) > curScore);
        let need = qty; const parts = []; const take = {};
        for (const r of cands) { if (need <= 0) break; const a = avail(r); if (a <= 0) continue; const q = Math.min(a, need); take[r.key] = q; need = r2(need - q);
          parts.push({ ...orig, key: r.key, pid: r.dhhId || "", purchaseInvoice: r.invoiceNo, purchaseSr: r.sr, batch: r.batch || bb, billBatch: bb, serial: r.serial || "", exp: r.exp || orig.exp || "", hsn: r.hsn || orig.hsn, uom: r.uom || orig.uom || "", qty: q, cost: costOfItem(r), noStock: false,
            remarks: [orig.rate ? "" : "Free", bb && nz(r.batch) !== nz(bb) ? `bill batch ${bb}` : "", mode === "A" ? "linked later" : "re-matched by batch"].filter(Boolean).join(" · ") }); }
        const restore = () => { if (mode === "B") sold[cur.key] = r2((sold[cur.key] || 0) + qty); };
        if (!parts.length) { restore(); lines.push(orig); if (mode === "A") left += qty; continue; }
        if (need > 0) parts.push({ ...orig, qty: need });                              // the rest stays as it was (no stock / old PID)
        const done = parts.map(finish);
        const before = calcLine(orig, true, {}).taxable, after = r2(done.reduce((a, p) => a + p.taxable, 0));
        if (Math.abs(before - after) > 0.001) { restore(); lines.push(orig); skippedRound++; if (mode === "A") left += qty; continue; }   // a split would change the bill by paise: leave it
        if (mode === "B" && need > 0) sold[cur.key] = r2((sold[cur.key] || 0) + need);
        for (const [k, q] of Object.entries(take)) used[k] = r2((used[k] || 0) + q);
        const got = r2(qty - need); if (mode === "A") { linked += got; left += need; } else moved += got;
        changed = true; lines.push(...done);
      }
      if (any) docsWith++;
      if (!changed) continue;
      const totals = calcDoc(lines, true, "INV", {});
      if (totals.grand !== d.totals.grand || Math.abs(totals.taxable - d.totals.taxable) > 0.001) { skippedRound++; continue; }
      out.push({ id, d, lines, totals, linked, moved, left });
    }
    return { out, skippedRound, docs: docsWith };
  }
  async function linkRun() {
    const P = LK.plan.out; LK.busy = true; let n = 0; drawLink();
    try { for (const p of P) { const doc = { ...p.d, lines: p.lines, totals: p.totals, relinkedAt: new Date().toISOString() };
        await S.db.doc(`sales/${p.id}`).set(doc); S.sales[p.id] = doc; n++; LK.msg = `Saving… ${n} of ${P.length}`; drawLink(); }
      LK.msg = `Done: ${n} bill${n === 1 ? "" : "s"} updated: ${inr(P.reduce((a, p) => a + p.linked, 0), 0)} pieces newly taken out of stock, ${inr(P.reduce((a, p) => a + p.moved, 0), 0)} moved to the bill's own batch.`; LK.plan = null;
    } catch (e) { LK.msg = `Stopped after ${n} bill${n === 1 ? "" : "s"}: ${e.message || e.code}. Click "Check" again; bills already linked are skipped.`; }
    LK.busy = false; if (typeof computeStock === "function") computeStock(S.items); drawLink(); if (typeof renderSalesList === "function" && $("salestbl")) renderSalesList();
  }
  function drawLink() {
    const box = $("impBox"); if (!box) return; const P = LK.plan;
    let h = `<div class="row" style="justify-content:space-between"><h3 style="margin:0">Link past bills to stock</h3><button class="btn" data-lk="close">Close</button></div>
      <p class="note" style="margin:6px 0 10px" >Imported bills are matched to your stock by the <b>batch number printed on the bill</b> (allowing for small typing slips), then the oldest purchase, using only stock bought on or before the bill date (the exact same batch may be up to 31 days later). Lines with no stock get linked; lines that were linked to a different batch move to the bill's own batch when it's now in D Cart. Bill amounts don't change. Nothing is saved until you click the button below.</p>
      <div class="row"><button class="btn primary" data-lk="check" ${LK.busy ? "disabled" : ""}>Check</button></div>`;
    if (P) {
      const pcs = P.out.reduce((a, p) => a + p.linked, 0), mv = P.out.reduce((a, p) => a + p.moved, 0), left = P.out.reduce((a, p) => a + p.left, 0);
      h += `<div class="row" style="gap:18px;margin:12px 0;flex-wrap:wrap"><div><div class="note">Bills to update</div><b>${P.out.length}</b> <span class="note">of ${P.docs} to look at</span></div>
        <div><div class="note">Pieces newly taken out of stock</div><b>${inr(pcs, 0)}</b></div><div><div class="note">Pieces moved to the bill's own batch</div><b>${inr(mv, 0)}</b></div><div><div class="note">Still without stock on those bills</div><b>${inr(left, 0)}</b></div></div>
        ${P.skippedRound ? `<p class="note">${P.skippedRound} line${P.skippedRound === 1 ? "" : "s"} left as they are, because splitting them would change a bill by a few paise.</p>` : ""}
        ${P.out.length ? `<details style="margin:8px 0"><summary class="note" style="cursor:pointer">See each bill</summary><div class="tablewrap" style="max-height:360px"><table><thead><tr><th>Bill</th><th>Date</th><th>Customer</th><th class="num">Linked</th><th class="num">Moved to bill batch</th><th class="num">Still no stock</th></tr></thead><tbody>
        ${P.out.map(p => `<tr><td class="code">${esc(p.d.no)}</td><td>${esc(dmy(p.d.date))}</td><td>${esc(p.d.customer?.name || "")}</td><td class="num">${inr(p.linked, 0)}</td><td class="num">${inr(p.moved, 0)}</td><td class="num">${inr(p.left, 0)}</td></tr>`).join("")}</tbody></table></div></details>
        <div class="row"><button class="btn primary" data-lk="go" ${LK.busy ? "disabled" : ""}>Update ${P.out.length} bill${P.out.length === 1 ? "" : "s"}</button></div>` : `<p class="note">Nothing to change: every bill line is already on its own batch, or no matching stock is in D Cart yet.</p>`}`;
    }
    if (LK.msg) h += `<p class="note" style="margin:10px 0 0" role="status">${esc(LK.msg)}</p>`;
    box.innerHTML = h;
  }
  window.openBillLink = function () { const box = $("impBox"); if (!box) return; box.classList.remove("hidden"); LK.plan = null; LK.msg = "";
    box.onclick = e => { const b = e.target.closest("[data-lk]"); if (!b) return; const a = b.dataset.lk;
      if (a === "close") { box.classList.add("hidden"); box.onclick = null; return; }
      if (a === "check") { LK.plan = linkPlan(); LK.msg = ""; drawLink(); }
      if (a === "go") linkRun(); };
    drawLink(); };
  window.biImpId = impId;
})();
