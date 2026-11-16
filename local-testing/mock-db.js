// In-memory stand-in for the claude.ai artifact database, for local testing only.
// Implements the subset of the db interface the app uses. Data is lost on reload.
(function () {
  const store = {}; const subs = [];
  function notify() {
    subs.forEach(s => {
      if (s.doc) { const d = store[s.doc]; s.next({ exists: !!d, data: () => d, metadata: { fromCache: false } }); return; }
      const docs = Object.keys(store).filter(p => p.startsWith(s.col + "/") && p.split("/").length === s.col.split("/").length + 1).sort()
        .map(p => ({ id: p.split("/").pop(), data: () => store[p] }));
      s.next({ docs, metadata: { fromCache: false } });
    });
  }
  const db = {
    doc: p => ({
      set: async d => { store[p] = JSON.parse(JSON.stringify(d)); notify(); },
      delete: async () => { delete store[p]; notify(); },
      get: async () => ({ exists: !!store[p], data: () => store[p] }),
      acquire: async () => ({ acquired: true }),
      onSnapshot: next => { subs.push({ doc: p, next }); setTimeout(notify, 10); return () => {}; },
    }),
    collection: c => ({ onSnapshot: next => { subs.push({ col: c, next }); setTimeout(notify, 10); return () => {}; } }),
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000); return { status: "saved" };
    },
  };
  window.claude = { use: async n => n === "db" ? db : n === "downloads" ? downloads : n === "user" ? { can: async () => true } : null };
})();
