/* D Cart — Batch audit (Inventory → Batch audit).
   Every line of every DHH tax invoice / delivery challan, with the batch printed on the bill next to the
   batch of the PID it took stock from, whether they agree, and how much of that PID is still in stock.
   Read-only. */
(function () {
  const nz = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
  const bz = s => nz(s).replace(/[IL]/g, "1");
  const billBatch = l => l.billBatch || ((String(l.remarks || "").match(/bill batch (\S+)/) || [])[1]) || l.batch || "";
  const ST = {
    exact: ["Same batch", "good", "The batch on the bill is the batch of the PID that was taken out of stock."],
    near: ["Typing slip", "warn", "Almost the same (a character missing, I typed as 1, a prefix cut off). Check the bill and correct it if needed."],
    diff: ["Different batch", "bad", "Stock was taken from another batch, because the bill's batch isn't in D Cart or has no stock left. Upload the supplier invoice for that batch, then run Link past bills to stock."],
    nostock: ["No stock in D Cart", "bad", "No PID was taken out for this line. Upload the supplier invoice, then run Link past bills to stock."],
    nobatch: ["No batch on bill", "", "The bill line has no batch number to compare."]
  };
  const A = { f: "", q: "", only: "" };

  function rows() {
    if (typeof computeStock === "function") computeStock(S.items);
    const byKey = {}; for (const r of S.items) byKey[r.key] = r;
    const out = [];
    for (const [id, d] of Object.entries(S.sales || {})) {
      if (d.status === "cancelled" || !(d.type === "INV" || d.type === "DC")) continue;
      if (d.type === "INV" && d.fromDc) continue;                      // stock went out on the challan
      for (const l of d.lines || []) {
        const it = l.key ? byKey[l.key] : null; const bb = billBatch(l);
        const st = !it ? "nostock" : !bb ? "nobatch" : nz(bb) === nz(it.batch) ? "exact" : bz(bb) === bz(it.batch) || bz(bb).includes(bz(it.batch)) || bz(it.batch).includes(bz(bb)) || lev1(bz(bb), bz(it.batch)) ? "near" : "diff";
        out.push({ id, no: d.no, type: d.type, date: d.date, cust: d.customer?.name || "", mat: l.mat || "", desc: l.desc || "", billBatch: bb,
          pid: it ? it.dhhId || "" : "", pidBatch: it ? it.batch || "" : "", supInv: it ? it.invoiceNo : "", qty: +l.qty || 0, free: !l.rate,
          bought: it ? it.qty : null, sold: it ? it.soldQty : null, left: it ? it.availQty : null, st });
      }
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));
  }
  function lev1(a, b) { if (!a || !b || Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return e + (a.length - i) + (b.length - j) <= 1; }

  function render() {
    const el = $("tab-audit"); if (!el) return;
    const all = rows(); const cnt = k => all.filter(r => r.st === k).length;
    const q = A.q.trim().toLowerCase();
    const list = all.filter(r => (!A.f || r.st === A.f) && (!A.only || (r.left > 0)) && (!q || [r.no, r.cust, r.mat, r.desc, r.billBatch, r.pid, r.pidBatch, r.supInv].join(" ").toLowerCase().includes(q)));
    const tile = (k, n) => `<button class="tile" data-auf="${k}" style="text-align:left;cursor:pointer${A.f === k ? ";outline:2px solid var(--accent)" : ""}" title="${esc(ST[k][2])}"><div class="k">${esc(ST[k][0])}</div><div class="v">${inr(n, 0)}</div><div class="note">bill lines</div></button>`;
    el.innerHTML = `<div class="panel pad"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Batch audit</h2><button class="btn" data-audl>Download (Excel)</button></div>
      <p class="note" style="margin:6px 0 0">Every line of your tax invoices and delivery challans, with the <b>batch printed on the bill</b> next to the <b>batch of the PID</b> it took from stock, and how many of that PID are <b>still in stock</b>. Click a box to show only those lines.</p></div>
      <div class="tiles">${["exact", "near", "diff", "nostock"].map(k => tile(k, cnt(k))).join("")}</div>
      <div class="panel"><div class="toolbar"><input type="search" id="auQ" placeholder="Search bill no., customer, product, batch, PID…" value="${esc(A.q)}" aria-label="Search the audit">
        <select id="auF" aria-label="Match"><option value="">All lines (${all.length})</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${A.f === k ? "selected" : ""}>${esc(v[0])} (${cnt(k)})</option>`).join("")}</select>
        <label class="chk"><input type="checkbox" id="auOnly" ${A.only ? "checked" : ""}> Only PIDs with stock left</label><span class="count">${inr(list.length, 0)} lines</span></div>
      <div class="tablewrap"><table><thead><tr><th>DHH bill</th><th>Date</th><th>Customer</th><th>Product</th><th>Batch on bill</th><th>PID</th><th>PID batch</th><th>Match</th><th class="num">Qty on bill</th><th class="num">PID bought</th><th class="num">PID sold</th><th class="num">PID left</th><th>Supplier invoice</th></tr></thead><tbody>
      ${list.length ? list.map(r => `<tr><td class="code">${esc(r.no)}${r.type === "DC" ? ' <span class="note">challan</span>' : ""}</td><td>${esc(dmy(r.date))}</td><td>${esc(r.cust)}</td>
        <td><span class="code">${esc(r.mat)}</span><div class="note" style="white-space:normal;max-width:260px">${esc(r.desc)}</div></td>
        <td class="code">${esc(r.billBatch || "—")}</td><td class="dhh">${r.pid ? `<a class="codelink" data-aupid="${esc(r.pid)}">${esc(r.pid)}</a>` : "—"}</td><td class="code">${esc(r.pidBatch || "—")}</td>
        <td>${ST[r.st][1] ? `<span class="pill ${ST[r.st][1]}">${esc(ST[r.st][0])}</span>` : esc(ST[r.st][0])}</td>
        <td class="num">${inr(r.qty, 0)}${r.free ? ' <span class="note">free</span>' : ""}</td><td class="num">${r.bought == null ? "" : inr(r.bought, 0)}</td><td class="num">${r.sold == null ? "" : inr(r.sold, 0)}</td>
        <td class="num">${r.left == null ? "" : `<b>${inr(r.left, 0)}</b>`}</td><td class="code">${esc(r.supInv || "")}</td></tr>`).join("") : `<tr><td colspan="13" class="empty">No lines.</td></tr>`}
      </tbody></table></div></div>`;
    A.list = list;
  }
  document.addEventListener("click", async e => {
    if (!$("tab-audit") || !e.target.closest("#tab-audit")) return;
    const t = e.target.closest("[data-auf]"); if (t) { A.f = A.f === t.dataset.auf ? "" : t.dataset.auf; render(); return; }
    const p = e.target.closest("[data-aupid]"); if (p) { const r = S.items.find(x => x.dhhId === p.dataset.aupid); if (r && window.showLineHistory) showLineHistory(r.key); return; }
    if (e.target.closest("[data-audl]")) {
      const head = ["DHH bill", "Type", "Date", "Customer", "Material code", "Description", "Batch on bill", "PID", "PID batch", "Match", "Qty on bill", "Free", "PID bought", "PID sold", "PID left", "Supplier invoice"];
      const body = rows().map(r => [r.no, r.type === "DC" ? "Challan" : "Tax invoice", dmy(r.date), r.cust, r.mat, r.desc, r.billBatch, r.pid, r.pidBatch, ST[r.st][0], r.qty, r.free ? "yes" : "", r.bought ?? "", r.sold ?? "", r.left ?? "", r.supInv]);
      if (typeof xlsxFrom === "function" && typeof save === "function") await save(`Batch_audit_${typeof todayIso === "function" ? todayIso() : new Date().toISOString().slice(0, 10)}.xlsx`, xlsxFrom([["Batch audit", [head, ...body]]]));
    }
  });
  document.addEventListener("input", e => { if (e.target.id === "auQ") { A.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $("auQ"); n.focus(); n.setSelectionRange(pos, pos); } });
  document.addEventListener("change", e => { if (e.target.id === "auF") { A.f = e.target.value; render(); } if (e.target.id === "auOnly") { A.only = e.target.checked; render(); } });

  const inv = PANELS.find(p => p.key === "inventory"); if (inv && !inv.subs.some(s => s[0] === "audit")) inv.subs.push(["audit", "Batch audit"]);
  VIEW_SECTIONS.audit = ["tab-audit"]; if (!ALL_SECTIONS.includes("tab-audit")) ALL_SECTIONS.push("tab-audit");
  if (!document.getElementById("tab-audit")) { const s = document.createElement("section"); s.id = "tab-audit"; s.className = "hidden"; s.style.cssText = "display:grid;gap:14px"; (document.getElementById("tab-sales") || document.querySelector("main")).after(s); }
  const _ro = renderOps; renderOps = function () { if (S.tab === "audit") { render(); return true; } return _ro.apply(this, arguments); };
})();
