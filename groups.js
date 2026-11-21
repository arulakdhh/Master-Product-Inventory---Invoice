"use strict";
/* =====================================================================
   Product groups: Category → General name → sizes → batches / PIDs
   • A product's group comes from the start of its item code
     (MT-SS1235014 → MT-SS12, LUSC-35/06 → LUSC), so every size of one
     product lands in the same group automatically.
   • Name and category: your own (settings/groups) → Invoice Master's
     Product Family / Category → a name suggested from the descriptions.
   • Used in: Inventory → Product groups, the line list filter and
     columns, the invoice product search, and Sales Analysis → Profit.
   ===================================================================== */
S.groupNames = {};            // settings/groups.groups: { key: { name, cat } }
S.grp = { q: "", cat: "", stock: "", open: {}, edits: {} };

function groupKeyOf(mat) {
  const m = String(mat || "").trim().toUpperCase(); if (!m) return "—";
  const a = m.match(/^([A-Z]{1,3}-[A-Z]{2}\d{2})/); if (a) return a[1];       // MT-SS12…
  const b = m.split(/[-\/ ]/)[0]; if (b && b !== m && /[A-Z]/.test(b)) return b;  // LUSC-35/06 → LUSC
  return m;                                                                     // plain codes stay on their own
}
const GRP_CATS = [["k-wire", "Wire"], ["wire", "Wire"], ["cable", "Cable"], ["washer", "Washer"], ["screw", "Screw"], ["bolt", "Bolt"], ["nail", "Nail"], ["plate", "Plate"],
  ["femoral stem", "Hip stem"], ["stem", "Hip stem"], ["acetabular", "Acetabular cup"], ["cup", "Acetabular cup"], ["shell", "Acetabular cup"], ["liner", "Liner"], ["head", "Femoral head"],
  ["femoral component", "Knee femoral"], ["tibial", "Knee tibial"], ["patella", "Patella"], ["insert", "Insert"], ["cement", "Bone cement"], ["pin", "Pin"], ["anchor", "Anchor"], ["staple", "Staple"], ["sleeve", "Sleeve"]];
function guessCat(desc) { const d = expandAbbr(String(desc || "")).toLowerCase(); for (const [k, v] of GRP_CATS) if (d.includes(k)) return v; return "Other"; }
const SIZE_TOK = /^(l\d+(\.\d+)?|\d+h|size\d*|std|xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large|r|right|left|lt|rt|long|short|\d+(\.\d+)?(mm)?|\d+hx\d+s|[-,–\/]+)$/i;
/* short forms on supplier invoices → full words (as in your Format Rules) */
const ABBR = { pl: "Plate", dis: "Distal", dist: "Distal", rad: "Radius", prox: "Proximal", tib: "Tibia", lat: "Lateral", med: "Medial", hum: "Humerus", ant: "Anterior", post: "Posterior", fem: "Femur", thr: "Thread", ful: "Full",
  canc: "Cancellous", ext: "Extension", recon: "Reconstruction", sup: "Superior", clav: "Clavicle", olec: "Olecranon", vol: "Volar", periar: "Periarticular", col: "Column", scr: "Screw", sc: "Screw", plt: "Plate", cannu: "Cannulated", slf: "Self", dr: "Drilling", th: "Thread", tap: "Tapping", lck: "Locking", cort: "Cortex" };
const expandAbbr = t => t.replace(/\b([A-Za-z]+)\b/g, w => ABBR[w.toLowerCase()] || w);
function cleanName(s) {
  let w = String(s || "").replace(/\s+/g, " ").trim().split(" ");
  while (w.length > 1 && SIZE_TOK.test(w[w.length - 1].replace(/[,;]+$/, ""))) w.pop();
  let t = w.join(" ").replace(/[\s,;\-–\/(]+$/, "").trim();
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
  return expandAbbr(t);
}
function suggestName(descs) {
  const D = [...new Set(descs.map(d => String(d || "").replace(/\s+/g, " ").trim()).filter(Boolean))]; if (!D.length) return "";
  if (D.length === 1) return cleanName(D[0]);
  const T = D.map(d => d.split(" ")); let i = 0; while (T.every(t => i < t.length && t[i].toLowerCase() === T[0][i].toLowerCase())) i++;
  const pre = T[0].slice(0, i).join(" ");
  return pre.split(" ").length >= 2 ? cleanName(pre) : cleanName(D[0]);
}
/* build the group table from the current stock lines */
function buildGroups() {
  const G = {};
  for (const r of S.items || []) { const k = groupKeyOf(r.mat); const g = (G[k] ||= { key: k, items: [], fam: {}, cat: {}, descs: [] }); g.items.push(r); g.descs.push(r.desc);
    if (r.family) g.fam[r.family] = (g.fam[r.family] || 0) + 1; if (r.category) g.cat[r.category] = (g.cat[r.category] || 0) + 1; }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  for (const g of Object.values(G)) { const own = S.groupNames[g.key] || {};
    g.auto = top(g.fam) || suggestName(g.descs); g.name = own.name || g.auto || g.key;
    g.autoCat = top(g.cat) || guessCat(g.auto + " " + g.descs[0]); g.cat = own.cat || g.autoCat; g.named = !!own.name; }
  S.groups = G;
  for (const r of S.items || []) { const g = G[groupKeyOf(r.mat)]; r.grpKey = g.key; r.grpName = g.name; r.grpCat = g.cat; }
  for (const m of S.master || []) { const g = G[groupKeyOf(m.mat)]; if (g) { m.grpKey = g.key; m.grpName = g.name; m.grpCat = g.cat; } }
  return G;
}
function grpOf(r) { const g = (S.groups || {})[groupKeyOf(r && r.mat)]; return g ? { key: g.key, name: g.name, cat: g.cat } : { key: groupKeyOf(r && r.mat), name: "", cat: "" }; }

/* ---------- settings ---------- */
(function waitDb() {
  if (!S.db) return setTimeout(waitDb, 500);
  S.db.doc("settings/groups").onSnapshot(d => { S.groupNames = (d.exists && d.data().groups) || {}; buildGroups(); fillGrpFilter();
    if (S.tab === "groups") renderGroups(); else if (["lines", "master"].includes(S.tab) && typeof render === "function") render(); }, () => { });
})();

/* ---------- hooks: rebuild, columns, line-list filter ---------- */
(function hook() {
  const _rb = rebuild; rebuild = function () { const r = _rb.apply(this, arguments); buildGroups(); fillGrpFilter(); if (S.tab === "groups") renderGroups(); return r; };
  const di = LINE_FIELDS.findIndex(f => f[0] === "desc"); LINE_FIELDS.splice(di + 1, 0, ["grpCat", "Category", "Product category (Plate, Screw, Nail, Hip stem …)", "t"], ["grpName", "Product group", "General name shared by every size of the product", "t"]);
  const mi = MASTER_FIELDS.findIndex(f => f[0] === "desc"); MASTER_FIELDS.splice(mi + 1, 0, ["grpCat", "Category", "Product category", "t"], ["grpName", "Product group", "General name shared by every size of the product", "t"]);
  for (const arr of [S.colsLines, S.colsMaster]) if (arr && !arr.includes("grpName")) { const i = arr.indexOf("desc"); arr.splice(i < 0 ? arr.length : i + 1, 0, "grpName"); }
  const fd = document.getElementById("fDiv");
  if (fd && !document.getElementById("fGrp")) { const s = document.createElement("select"); s.id = "fGrp"; s.setAttribute("aria-label", "Product group"); s.innerHTML = '<option value="">All groups</option>'; fd.after(s);
    s.addEventListener("input", () => { S.page = 0; render(); }); }
  const _f = filtered; filtered = function () { const out = _f.apply(this, arguments); const v = ($("fGrp") || {}).value || ""; if (!v) return out;
    if (v.startsWith("cat:")) { const c = v.slice(4); return out.filter(r => (r.grpCat || grpOf(r).cat) === c); } return out.filter(r => (r.grpKey || groupKeyOf(r.mat)) === v); };
  const inv = PANELS.find(p => p.key === "inventory"); if (inv && !inv.subs.some(s => s[0] === "groups")) inv.subs.splice(1, 0, ["groups", "Product groups"]);
  VIEW_SECTIONS.groups = ["tab-groups"]; if (!ALL_SECTIONS.includes("tab-groups")) ALL_SECTIONS.push("tab-groups");
  if (!document.getElementById("tab-groups")) { const s = document.createElement("section"); s.id = "tab-groups"; s.className = "hidden"; s.style.cssText = "display:grid;gap:14px"; (document.getElementById("tab-sales") || document.querySelector("main")).after(s); }
  const st = document.createElement("style"); st.textContent = `#tab-groups tr.gcat td{background:var(--bg);font-weight:700;border-top:2px solid var(--line)}#tab-groups tr.gsub td{background:var(--surface);font-size:12.5px}#tab-groups tr.gsub td:first-child{padding-left:34px}#tab-groups .gtog{border:0;background:none;cursor:pointer;font:inherit;color:var(--accent);padding:0 6px 0 0}#tab-groups input.gname{width:100%;min-width:220px}#tab-groups input.gcatin{width:160px}`;
  document.head.appendChild(st);
  const _ro = renderOps; renderOps = function () { if (S.tab === "groups") { renderGroups(); return true; } return _ro.apply(this, arguments); };
})();
function fillGrpFilter() {
  const s = document.getElementById("fGrp"); if (!s || !S.groups) return; const keep = s.value;
  const byCat = {}; for (const g of Object.values(S.groups)) (byCat[g.cat] ||= []).push(g);
  s.innerHTML = '<option value="">All groups</option>' + Object.keys(byCat).sort().map(c => `<optgroup label="${esc(c)}"><option value="cat:${esc(c)}">All ${esc(c)} (${byCat[c].reduce((a, g) => a + g.items.length, 0)})</option>${byCat[c].sort((a, b) => a.name.localeCompare(b.name)).map(g => `<option value="${esc(g.key)}">${esc(g.name)} (${g.items.length})</option>`).join("")}</optgroup>`).join("");
  s.value = keep;
}

/* ---------- sales per group (all time, active tax invoices) ---------- */
function groupSales() {
  const byKey = new Map((S.items || []).map(r => [r.key, r])); const out = {};
  for (const d of Object.values(S.sales || {})) { if (d.type !== "INV" || d.status === "cancelled") continue;
    for (const l of d.lines || []) { const it = byKey.get(l.key) || l; const k = groupKeyOf(it.mat || l.mat); const o = (out[k] ||= { qty: 0, sale: 0, cost: 0 });
      const sale = +(l.taxable ?? l.amount ?? 0); const cost = (typeof lineCost === "function" ? lineCost(l) : +l.cost || 0) * (+l.qty || 0);
      o.qty += +l.qty || 0; o.sale += sale; o.cost += cost; } }
  return out;
}

/* ---------- Inventory → Product groups ---------- */
function renderGroups() {
  const el = $("tab-groups"); if (!el) return; if (!S.groups) buildGroups();
  const F = S.grp; const can = canEditPanel("inventory"); const SL = groupSales();
  const q = F.q.trim().toLowerCase();
  const rows = Object.values(S.groups).map(g => { const inStock = g.items.reduce((a, r) => a + (+r.availQty || 0), 0); const sizes = new Set(g.items.map(r => r.mat)).size;
    const val = g.items.reduce((a, r) => a + (+r.availQty || 0) * (typeof costOfItem === "function" ? costOfItem(r) : +r.rate || 0), 0); const s = SL[g.key] || { qty: 0, sale: 0, cost: 0 };
    return { g, inStock, sizes, pids: g.items.filter(r => r.dhhId).length, val: r2(val), sold: s.qty, sale: r2(s.sale), profit: r2(s.sale - s.cost) }; })
    .filter(x => (!F.cat || x.g.cat === F.cat) && (!F.stock || (F.stock === "in" ? x.inStock > 0 : x.inStock <= 0)) &&
      (!q || [x.g.name, x.g.key, x.g.cat, ...x.g.items.map(r => r.mat + " " + r.desc + " " + (r.dhhId || "") + " " + (r.batch || ""))].join(" ").toLowerCase().includes(q)));
  const cats = [...new Set(Object.values(S.groups).map(g => g.cat))].sort();
  const byCat = {}; for (const x of rows) (byCat[x.g.cat] ||= []).push(x);
  const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const T = { groups: rows.length, sizes: sum(rows, "sizes"), stock: sum(rows, "inStock"), val: r2(sum(rows, "val")), sale: r2(sum(rows, "sale")), profit: r2(sum(rows, "profit")) };
  const unnamed = Object.values(S.groups).filter(g => !g.named && !Object.keys(g.fam).length).length;
  const sub = x => { if (!F.open[x.g.key]) return ""; const bySize = {}; for (const r of x.g.items) (bySize[r.mat] ||= []).push(r);
    return Object.entries(bySize).sort((a, b) => a[0].localeCompare(b[0])).map(([mat, L]) => `<tr class="gsub"><td colspan="2"><span class="code">${esc(mat)}</span> ${esc(L[0].desc)}</td><td class="num">${L.length}</td><td class="num">${inr(L.reduce((a, r) => a + (+r.availQty || 0), 0), 0)}</td>
      <td colspan="5" class="note">${L.map(r => `${esc(r.dhhId || "no PID")} · batch ${esc(r.batch || "—")}${r.serial ? " · S/N " + esc(r.serial) : ""} · exp ${esc(r.exp || "—")} · ${inr(+r.availQty || 0, 0)} in stock`).join("<br>")}</td></tr>`).join(""); };
  el.innerHTML = `<div class="panel pad"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">
     <div><h2 style="margin:0">Product groups</h2><div class="note">Every size of one product is kept under one general name, by the start of its item code (e.g. MT-SS12… = all lengths of one screw). Names come from your Invoice Master's Product Family, or are suggested from the descriptions; correct any name or category below and save.</div></div>
     <div class="row" style="gap:8px">${can ? `<button class="btn primary" id="gSave">Save names</button>` : ""}<button class="btn" id="gXlsx">Download (Excel)</button></div></div>
     <div id="gMsg" class="${F.note ? "msg ok" : "hidden"}" style="margin-top:8px">${esc(F.note || "")}</div>
     ${unnamed && can ? `<div class="note" style="margin-top:6px">${unnamed} group name${unnamed === 1 ? " was" : "s were"} suggested automatically. Check them and press Save names to keep them.</div>` : ""}</div>
  <div class="tiles6">
    <div class="tile6"><div class="k">Categories${ib("Categories")}</div><div class="v">${Object.keys(byCat).length}</div><div class="s">${esc(Object.keys(byCat).slice(0, 4).join(", "))}${Object.keys(byCat).length > 4 ? " …" : ""}</div></div>
    <div class="tile6"><div class="k">Product groups${ib("Product groups")}</div><div class="v">${inr(T.groups, 0)}</div><div class="s">${inr(T.sizes, 0)} sizes / codes</div></div>
    <div class="tile6"><div class="k">In stock${ib("In stock")}</div><div class="v">${inr(T.stock, 0)} pcs</div><div class="s">₹ ${inr(T.val, 0)} at purchase rate</div></div>
    <div class="tile6"><div class="k">Sold (tax invoices)${ib("Sold (tax invoices)")}</div><div class="v">₹ ${inr(T.sale, 0)}</div><div class="s">profit ₹ ${inr(T.profit, 0)}</div></div>
  </div>
  <div class="panel"><div class="toolbar">
    <input type="search" id="gQ" placeholder="Search group, code, product, PID or batch…" value="${esc(F.q)}">
    <select id="gCat" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${F.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <select id="gStock" aria-label="Stock"><option value="">Any stock</option><option value="in" ${F.stock === "in" ? "selected" : ""}>In stock</option><option value="out" ${F.stock === "out" ? "selected" : ""}>Out of stock</option></select>
    <button class="btn" id="gOpenAll">${Object.keys(F.open).length ? "Close all" : "Open all"}</button>
    <span class="count">${rows.length} groups</span></div>
    <datalist id="gCatList">${[...new Set([...cats, ...GRP_CATS.map(c => c[1])])].sort().map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="tablewrap"><table><thead><tr><th>Product group (general name)</th><th>Category · code</th><th class="num">Sizes</th><th class="num">In stock (pcs)</th><th class="num">Stock value (₹)</th><th class="num">Sold (pcs)</th><th class="num">Sales (₹)</th><th class="num">Profit (₹)</th><th class="num">Lines / PIDs</th></tr></thead><tbody>
    ${Object.keys(byCat).sort().map(c => { const L = byCat[c].sort((a, b) => a.g.name.localeCompare(b.g.name));
      return `<tr class="gcat"><td>${esc(c)} <span class="note">${L.length} group${L.length === 1 ? "" : "s"}</span></td><td></td><td class="num">${inr(sum(L, "sizes"), 0)}</td><td class="num">${inr(sum(L, "inStock"), 0)}</td><td class="num">${inr(sum(L, "val"), 0)}</td><td class="num">${inr(sum(L, "sold"), 0)}</td><td class="num">${inr(sum(L, "sale"), 0)}</td><td class="num">${inr(sum(L, "profit"), 0)}</td><td class="num">${inr(sum(L, "pids"), 0)}</td></tr>` +
        L.map(x => { const e = F.edits[x.g.key] || {};
          return `<tr><td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="gtog" data-gtog="${esc(x.g.key)}" aria-label="Show sizes">${F.open[x.g.key] ? "▾" : "▸"}</button>${can ? `<input class="gname" data-gname="${esc(x.g.key)}" value="${esc(e.name ?? x.g.name)}" aria-label="Group name for ${esc(x.g.key)}">` : `<b>${esc(x.g.name)}</b>`}</div></td>
          <td>${can ? `<input class="gcatin" list="gCatList" data-gcat="${esc(x.g.key)}" value="${esc(e.cat ?? x.g.cat)}" aria-label="Category for ${esc(x.g.key)}">` : esc(x.g.cat)}<div class="note code">${esc(x.g.key)}</div></td>
          <td class="num">${x.sizes}</td><td class="num"><b>${inr(x.inStock, 0)}</b></td><td class="num">${inr(x.val, 0)}</td><td class="num">${inr(x.sold, 0)}</td><td class="num">${inr(x.sale, 0)}</td><td class="num ${x.profit < 0 ? "neg" : ""}">${inr(x.profit, 0)}</td><td class="num">${x.g.items.length} / ${x.pids}</td></tr>${sub(x)}`; }).join(""); }).join("") || `<tr><td colspan="9" class="empty">No products. Add supplier invoices first.</td></tr>`}
    </tbody></table></div></div>`;

  const rer = id => { clearTimeout(renderGroups._t); renderGroups._t = setTimeout(() => { renderGroups(); const x = $(id); if (x) { x.focus(); x.setSelectionRange?.(x.value.length, x.value.length); } }, 250); };
  $("gQ").oninput = e => { F.q = e.target.value; rer("gQ"); };
  $("gCat").onchange = e => { F.cat = e.target.value; renderGroups(); };
  $("gStock").onchange = e => { F.stock = e.target.value; renderGroups(); };
  $("gOpenAll").onclick = () => { if (Object.keys(F.open).length) F.open = {}; else rows.forEach(x => F.open[x.g.key] = 1); renderGroups(); };
  el.querySelectorAll("[data-gtog]").forEach(b => b.onclick = () => { const k = b.dataset.gtog; if (F.open[k]) delete F.open[k]; else F.open[k] = 1; renderGroups(); });
  el.querySelectorAll("[data-gname],[data-gcat]").forEach(i => i.oninput = () => { const k = i.dataset.gname || i.dataset.gcat; (F.edits[k] ||= {})[i.dataset.gname ? "name" : "cat"] = i.value; });
  $("gXlsx").onclick = async () => {
    const a = [["Category", "Product group", "Group code", "Sizes", "In stock (pcs)", "Stock value at purchase rate (₹)", "Sold (pcs)", "Sales (₹)", "Profit (₹)", "Lines", "PIDs"], ...rows.sort((x, y) => x.g.cat.localeCompare(y.g.cat) || x.g.name.localeCompare(y.g.name)).map(x => [x.g.cat, x.g.name, x.g.key, x.sizes, x.inStock, x.val, x.sold, x.sale, x.profit, x.g.items.length, x.pids])];
    const b = [["Category", "Product group", "Material code", "Description", "PID", "Batch", "Serial", "Expiry", "Qty", "In stock", "Purchase rate (₹)", "MRP (₹)", "Supplier invoice"], ...rows.flatMap(x => x.g.items.map(r => [x.g.cat, x.g.name, r.mat, r.desc, r.dhhId || "", r.batch || "", r.serial || "", r.exp || "", r.qty, +r.availQty || 0, +r.rate || 0, +r.mrp || 0, r.invoiceNo]))];
    await save(`Product_groups_${todayIso()}.xlsx`, xlsxFrom([["Groups", a], ["Every line", b]]));
  };
  if (!can) return;
  $("gSave").onclick = async () => {
    // keep: names you typed now, names saved before, and the current names of every group (so suggestions are fixed once saved)
    const next = { ...S.groupNames }; let n = 0;
    for (const g of Object.values(S.groups)) { const e = F.edits[g.key] || {}; const name = String(e.name ?? g.name).trim() || g.auto, cat = String(e.cat ?? g.cat).trim() || g.autoCat;
      if (!next[g.key] || next[g.key].name !== name || next[g.key].cat !== cat) { next[g.key] = { name, cat }; n++; } }
    try { await S.db.doc("settings/groups").set({ groups: next, updatedAt: new Date().toISOString(), by: S.myEmail || "" }); F.edits = {}; F.note = `Saved ${n} group name${n === 1 ? "" : "s"}.`; renderGroups(); }
    catch (e) { msg($("gMsg"), "bad", "Couldn't save: " + (e.message || e.code) + (/permission/i.test(e.code || e.message || "") ? " — only an admin can change this until the new Firestore rules are published." : "")); }
  };
}
