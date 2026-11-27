/* D Cart — Activity log (Admin panel → Activity log).
   Every save, edit and delete made in D Cart is written to the "activity" collection:
   who, when, what document, and what changed. The Firebase rules let any active user ADD an entry
   (only in their own name) but nobody can edit or delete one, and only the owner can read them.
   firebase-adapter.js calls window.DCLOG after each successful write. */
(function () {
  const KIND = { sales: "Sales document", invoices: "Supplier invoice / PIDs", purchaseOrders: "Purchase order", receipts: "Payment receipt",
    followups: "Payment follow-up", customers: "Customer", users: "User access", settings: "Settings", reports: "Insight Studio report", fquotes: "Field quotation" };
  const SALES_T = { INV: "Tax invoice", DC: "Delivery challan", QTN: "Quotation", SO: "Sales order" };
  const money = v => "₹" + (typeof inr === "function" ? inr(+v || 0) : (+v || 0).toFixed(2));
  const SKIPKEYS = new Set(["updatedAt", "createdAt", "pickedAt", "linkedAt", "savedAt", "rows"]);

  function kindOf(coll, d) { return coll === "sales" && d && SALES_T[d.type] ? SALES_T[d.type] : (KIND[coll] || coll); }
  function titleOf(coll, id, d) {
    d = d || {};
    if (coll === "sales" || coll === "purchaseOrders" || coll === "receipts") return [d.no || id, d.customer?.name || d.supplier?.name || d.supplier || ""].filter(Boolean).join(" · ");
    if (coll === "invoices") return [d.invoiceNo || id, d.supplier || ""].filter(Boolean).join(" · ");
    if (coll === "customers") return d.name || id;
    if (coll === "users") return d.email || id;
    if (coll === "settings") return id;
    return d.no || d.name || d.title || id;
  }
  function totalOf(coll, d) { if (!d) return null; if (d.totals && d.totals.grand != null) return d.totals.grand; if (coll === "receipts") return d.amount; if (d.total != null) return d.total; return null; }
  function detailOf(op, coll, d, b) {
    const out = [];
    if (op === "deleted") { const t = totalOf(coll, b); if (t != null) out.push("total " + money(t)); return out.join(" · "); }
    const t1 = totalOf(coll, d), t0 = totalOf(coll, b);
    if (t1 != null) out.push(b && t0 != null && Math.abs(t0 - t1) > 0.004 ? `total ${money(t0)} → ${money(t1)}` : `total ${money(t1)}`);
    if (d && Array.isArray(d.lines)) out.push(b && Array.isArray(b.lines) && b.lines.length !== d.lines.length ? `lines ${b.lines.length} → ${d.lines.length}` : `${d.lines.length} line${d.lines.length === 1 ? "" : "s"}`);
    if (d && b && d.status !== b.status && (d.status || b.status)) out.push(`status ${b.status || "—"} → ${d.status || "—"}`);
    if (coll === "invoices" && d) out.push(b && b.rowCount !== d.rowCount ? `PIDs ${b.rowCount ?? "?"} → ${d.rowCount}` : `${d.rowCount ?? ""} PIDs`);
    if (coll === "users" && d) {
      if (b && !!b.active !== !!d.active) out.push(d.active ? "activated" : "deactivated");
      if (b && !!b.isAdmin !== !!d.isAdmin) out.push(d.isAdmin ? "made admin" : "admin removed");
      const p0 = (b && b.perms) || {}, p1 = d.perms || {}; const ch = [...new Set([...Object.keys(p0), ...Object.keys(p1)])].filter(k => (p0[k] || "none") !== (p1[k] || "none"));
      if (ch.length) out.push(ch.map(k => `${k}: ${p0[k] || "none"} → ${p1[k] || "none"}`).join(", "));
    }
    if (!out.length && d && b) {
      const ch = Object.keys({ ...b, ...d }).filter(k => !SKIPKEYS.has(k) && JSON.stringify(b[k]) !== JSON.stringify(d[k]));
      if (ch.length) out.push("changed: " + ch.slice(0, 8).join(", ") + (ch.length > 8 ? "…" : ""));
    }
    return out.join(" · ");
  }

  window.DCLOG = function (op, path, data, before, user, write) {
    const [coll, ...rest] = path.split("/"); const id = rest.join("/");
    const b = before === undefined ? (coll === "sales" ? S.sales?.[id] : coll === "invoices" ? S.invoices?.[id] : coll === "receipts" ? S.receipts?.[id] : coll === "purchaseOrders" ? S.pos?.[id] : coll === "customers" ? S.customers?.[id] : null) || null : before;
    const action = op === "delete" ? "deleted" : b ? "edited" : "created";
    const d = op === "delete" ? null : (op === "update" && b ? { ...b, ...data } : data);
    if (action === "edited" && d && b && JSON.stringify({ ...d, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 })) return;   // nothing really changed
    const ref = d || b || {};
    const rec = { at: new Date().toISOString(), by: ((user && user.email) || S.myEmail || "").toLowerCase(), name: (user && user.displayName) || S.me?.name || "",
      action, coll, docId: id, kind: kindOf(coll, ref), title: String(titleOf(coll, id, ref)).slice(0, 200), detail: String(detailOf(action, coll, d, b)).slice(0, 500) };
    try { const p = write(rec); if (p && p.catch) p.catch(e => console.warn("Activity log not saved:", e.code || e.message)); } catch (e) { console.warn("Activity log not saved:", e); }
  };

  /* ---------- Admin panel → Activity log ---------- */
  if (typeof PANELS === "undefined") return;
  const adm = PANELS.find(p => p.key === "admin"); if (adm && !adm.subs.some(s => s[0] === "activity")) adm.subs.push(["activity", "Activity log"]);
  VIEW_SECTIONS.activity = ["tab-activity"]; if (!ALL_SECTIONS.includes("tab-activity")) ALL_SECTIONS.push("tab-activity");
  const sec = document.createElement("section"); sec.id = "tab-activity"; sec.className = "hidden"; sec.style.cssText = "display:grid;gap:14px";
  (document.getElementById("tab-sales") || document.querySelector("main")).after(sec);
  const _renderOps = renderOps;
  renderOps = function () { if (S.tab === "activity") { draw(); return true; } return _renderOps.apply(this, arguments); };

  const L = { list: null, limit: 500, busy: false, err: "", who: "", kind: "", act: "", from: "", to: "", q: "", loadedFor: 0 };
  const when = s => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("en-GB").replace(/\//g, ".") + " " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); };
  async function load() {
    L.busy = true; L.err = ""; draw();
    try { const s = await S.db.collection("activity").orderBy("at", "desc").limit(L.limit).get(); L.list = s.docs.map(x => ({ id: x.id, ...x.data() })); L.loadedFor = L.limit; }
    catch (e) { L.err = /invalid_argument|permission/i.test((e.code || "") + (e.message || "")) ? "Only the owner can see the activity log. If you are the owner, publish the updated Firebase rules (with the activity section)." : "Couldn't load: " + (e.message || e.code); }
    L.busy = false; draw();
  }
  function filtered() {
    const q = L.q.trim().toLowerCase();
    return (L.list || []).filter(r => (!L.who || r.by === L.who) && (!L.kind || r.kind === L.kind) && (!L.act || r.action === L.act)
      && (!L.from || r.at.slice(0, 10) >= L.from) && (!L.to || r.at.slice(0, 10) <= L.to)
      && (!q || [r.by, r.name, r.kind, r.title, r.detail, r.docId].join(" ").toLowerCase().includes(q)));
  }
  function draw() {
    const el = document.getElementById("tab-activity"); if (!el) return;
    if (L.list === null && !L.busy && !L.err) { load(); return; }
    const list = filtered(); const all = L.list || [];
    const opts = (vals, cur, lab) => `<option value="">${lab}</option>` + [...new Set(vals)].filter(Boolean).sort().map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
    const pill = a => `<span class="pill ${a === "deleted" ? "bad" : a === "created" ? "good" : "warn"}">${esc(a)}</span>`;
    el.innerHTML = `<div class="panel pad"><h2 style="margin:0 0 4px">Activity log</h2>
      <p class="note" style="margin:0">Every save, edit and delete in D Cart: who did it, when, and what changed. Entries can't be edited or deleted by anyone, and only the owner can see this page. Recording started when this page was added; earlier changes weren't recorded.</p>
      ${L.err ? `<p class="note" role="alert" style="color:var(--bad);margin-top:10px">${esc(L.err)}</p>` : ""}</div>
      <div class="panel"><div class="toolbar">
        <input type="search" id="acQ" placeholder="Search…" value="${esc(L.q)}" aria-label="Search the activity log">
        <select id="acWho" aria-label="Person">${opts(all.map(r => r.by), L.who, "Everyone")}</select>
        <select id="acKind" aria-label="Document type">${opts(all.map(r => r.kind), L.kind, "All documents")}</select>
        <select id="acAct" aria-label="Action">${opts(["created", "edited", "deleted"], L.act, "All actions")}</select>
        <label class="note">From <input type="date" id="acFrom" value="${esc(L.from)}"></label><label class="note">To <input type="date" id="acTo" value="${esc(L.to)}"></label>
        <button class="btn" data-ac="refresh" ${L.busy ? "disabled" : ""}>${L.busy ? "Loading…" : "Refresh"}</button>
        <button class="btn" data-ac="xlsx" ${list.length ? "" : "disabled"}>Download Excel</button>
        <span class="count">${inr(list.length, 0)} of ${inr(all.length, 0)} entries</span></div>
      <div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Type</th><th>Document</th><th>Details</th></tr></thead><tbody>
      ${list.length ? list.map(r => `<tr><td style="white-space:nowrap">${esc(when(r.at))}</td><td>${esc(r.name || "")}<div class="note">${esc(r.by)}</div></td><td>${pill(r.action)}</td><td>${esc(r.kind)}</td><td class="code">${esc(r.title || r.docId)}</td><td style="white-space:normal;max-width:420px">${esc(r.detail || "")}</td></tr>`).join("")
        : `<tr><td colspan="6" class="empty">${L.busy ? "Loading…" : all.length ? "No entries match these filters." : "No activity recorded yet."}</td></tr>`}
      </tbody></table></div>
      ${all.length >= L.loadedFor && L.loadedFor ? `<div class="pad"><button class="btn" data-ac="more">Load older entries</button></div>` : ""}</div>`;
    const on = (id, k, ev = "change") => { const x = document.getElementById(id); if (x) x.addEventListener(ev, () => { L[k] = x.value; draw(); if (ev === "input") { const y = document.getElementById(id); y.focus(); y.setSelectionRange(y.value.length, y.value.length); } }); };
    on("acQ", "q", "input"); on("acWho", "who"); on("acKind", "kind"); on("acAct", "act"); on("acFrom", "from"); on("acTo", "to");
  }
  document.addEventListener("click", async e => {
    const b = e.target.closest("#tab-activity [data-ac]"); if (!b) return; const a = b.dataset.ac;
    if (a === "refresh") load();
    if (a === "more") { L.limit += 500; load(); }
    if (a === "xlsx") {
      const head = ["When", "Email", "Name", "Action", "Type", "Document", "Details", "Database path"];
      const body = filtered().map(r => [when(r.at), r.by, r.name || "", r.action, r.kind, r.title || "", r.detail || "", r.coll + "/" + r.docId]);
      await save(`Activity_log_${new Date().toISOString().slice(0, 10)}.xlsx`, xlsxFrom([["Activity log", [head, ...body]]]));
    }
  });
})();
