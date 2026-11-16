/* Firebase connector for the Implant Product Register (GitHub Pages version).
 *
 * The app talks to its database through window.claude.use("db"), the claude.ai
 * artifact database. Outside claude.ai that doesn't exist, so this file provides
 * the same interface on top of Google Firebase:
 *   - Firestore stores the documents (same paths: invoices/…, chunks/…, sales/…)
 *   - Firebase Auth signs people in with Google; only signed-in users get a db
 *   - acquire() (the counter lock used for PIDs and document numbers) is a
 *     Firestore transaction on locks/{path}
 * Inside claude.ai this file does nothing.
 */
(function () {
  if (window.claude && window.claude.use) return;           // running inside claude.ai
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey || /PASTE/.test(window.FIREBASE_CONFIG.apiKey)) {
    document.addEventListener("DOMContentLoaded", () => showGate("Setup needed: paste your Firebase settings into firebase-config.js (see README)."));
    window.claude = { use: async () => null }; return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(); const fs = firebase.firestore();
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  const wrapDocSnap = s => ({ id: s.id, exists: s.exists, data: () => s.data(), metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });
  const wrapQuerySnap = q => ({ docs: q.docs.map(wrapDocSnap), size: q.size, empty: q.empty, metadata: { fromCache: q.metadata.fromCache, hasPendingWrites: q.metadata.hasPendingWrites }, docChanges: () => q.docChanges() });
  const err = e => ({ code: e.code === "permission-denied" ? "invalid_argument" : (e.code || "unavailable"), message: e.message || String(e) });

  function docRef(path) {
    const r = fs.doc(path);
    return {
      id: r.id, path,
      get: () => r.get().then(wrapDocSnap).catch(e => { throw err(e); }),
      set: d => r.set(d).catch(e => { throw err(e); }),
      update: d => r.update(d).catch(e => { throw err(e); }),
      delete: () => r.delete().catch(e => { throw err(e); }),
      onSnapshot: (next, onErr) => r.onSnapshot({ includeMetadataChanges: true }, s => next(wrapDocSnap(s)), e => onErr && onErr(err(e))),
      collection: sub => collRef(path + "/" + sub),
      acquire: async ({ holder, ttlMs = 30000 }) => {
        const lock = fs.doc("locks/" + path.replace(/\//g, "__"));
        const ttl = Math.min(Math.max(ttlMs, 1000), 600000);
        return fs.runTransaction(async tx => {
          const s = await tx.get(lock); const now = Date.now(); const d = s.exists ? s.data() : null;
          if (d && d.expiresAt > now && d.holder !== holder) return { acquired: false, expiresAt: new Date(d.expiresAt).toISOString() };
          tx.set(lock, { holder, expiresAt: now + ttl, by: auth.currentUser ? auth.currentUser.email : "" });
          return { acquired: true, holder, expiresAt: new Date(now + ttl).toISOString() };
        }).catch(e => { throw err(e); });
      },
    };
  }
  function query(q) {
    return {
      where: (f, op, v) => query(q.where(f, op, v)),
      orderBy: (f, dir) => query(q.orderBy(f, dir || "asc")),
      limit: n => query(q.limit(n)),
      get: () => q.get().then(wrapQuerySnap).catch(e => { throw err(e); }),
      onSnapshot: (next, onErr) => q.onSnapshot({ includeMetadataChanges: true }, s => next(wrapQuerySnap(s)), e => onErr && onErr(err(e))),
    };
  }
  function collRef(path) {
    const c = fs.collection(path);
    return Object.assign(query(c), { path, doc: id => docRef(path + "/" + (id || c.doc().id)), add: async d => { const r = docRef(path + "/" + c.doc().id); await r.set(d); return r; } });
  }
  const db = { doc: docRef, collection: collRef };

  const downloads = { save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000); return { status: "saved" }; } };

  let signedIn; const ready = new Promise(res => signedIn = res);
  auth.onAuthStateChanged(u => {
    if (u) { hideGate(); showUserBar(u); signedIn(u); }
    else showGate("Sign in to open the register.", true);
  });
  const user = { id: async () => (await ready).uid, email: async () => ((await ready).email || "").toLowerCase(), name: async () => (await ready).displayName || "", can: async () => true, canEdit: async () => true, isOwner: async () => true };

  window.claude = { use: async name => {
    if (name === "downloads") return downloads;
    await ready;
    if (name === "db") return db;
    if (name === "user") return user;
    return null; } };

  /* --- sign-in screen --- */
  function showGate(text, withButton) {
    let g = document.getElementById("fbGate");
    if (!g) { g = document.createElement("div"); g.id = "fbGate";
      g.style.cssText = "position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:var(--bg,#f4f6f7);font-family:var(--font-body,system-ui)";
      document.body.appendChild(g); }
    g.innerHTML = `<div style="background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:10px;padding:28px 32px;max-width:420px;text-align:center;display:grid;gap:14px">
      <b style="font-size:18px">Implant Product Register</b><div style="color:var(--muted,#666)">${text}</div>
      ${withButton ? '<button id="fbSignIn" class="btn primary" style="justify-self:center">Sign in with Google</button><div id="fbErr" style="color:#b42318;font-size:13px"></div>' : ""}</div>`;
    const b = document.getElementById("fbSignIn");
    if (b) b.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => { document.getElementById("fbErr").textContent = e.message; });
  }
  function hideGate() { const g = document.getElementById("fbGate"); if (g) g.remove(); }
  function showUserBar(u) {
    const st = document.querySelector(".status"); if (!st || document.getElementById("fbUser")) return;
    const s = document.createElement("span"); s.id = "fbUser"; s.style.cssText = "display:flex;gap:6px;align-items:center";
    s.innerHTML = `· ${u.email} <button class="btn" style="padding:2px 8px;font-size:12px">Sign out</button>`;
    s.querySelector("button").onclick = () => auth.signOut().then(() => location.reload());
    st.appendChild(s);
  }
  window.addEventListener("error", e => { if (/permission/i.test(e.message || "")) showGate("Your Google account isn't allowed to use this register. Ask the owner to add your email to the Firestore rules.", true); });
})();
