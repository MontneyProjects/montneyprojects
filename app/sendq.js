/* MontneyPro send queue.
 * A form is saved on the phone first. Then it goes to the office in two parts:
 *   1. The record (the portal check mark) and the PDF go straight to Montney's own database. This is what
 *      counts as "sent" for the crew member.
 *   2. The PDF is also emailed to safety@ through FormSubmit. If FormSubmit is slow or down, that email keeps
 *      retrying in the background, but it no longer holds up the form or the check mark.
 * If there's no signal, both parts wait on the phone and retry on their own: every minute while a form page or
 * the app is open, whenever the phone gets signal back, and every time the app or a form is opened.
 */
(function () {
  var SEND_TO = "safety@montneyprojects.com";
  var TRACK_URL = "https://nwcbvchcdsbwwnnbtyht.supabase.co/rest/v1/";
  var TRACK_KEY = "sb_publishable_JtICuOehqdwzQOm8v0i-SA_qf21Bh0e"; // public key, safe to be here
  var DB = "montney_outbox", STORE = "forms", LOCK = "montney_outbox_lock";
  var isFrame = window.self !== window.top; // the hidden "sent" confirmation page loads in a frame; it must do nothing

  function openDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
        t.oncomplete = function () { db.close(); res(out && "result" in out ? out.result : undefined); };
        t.onerror = t.onabort = function () { db.close(); rej(t.error); };
      });
    });
  }
  function put(item) { return tx("readwrite", function (s) { return s.put(item); }); }
  function del(id) { return tx("readwrite", function (s) { return s.delete(id); }); }
  function get(id) { return tx("readonly", function (s) { return s.get(id); }); }
  function all() { return tx("readonly", function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }

  // One upload to the office. Resolves only when FormSubmit confirms it arrived.
  function post(item) {
    return new Promise(function (res, rej) {
      var nm = "send" + Date.now() + Math.random().toString(36).slice(2, 6);
      var ifr = document.createElement("iframe"); ifr.name = nm; ifr.style.display = "none"; document.body.appendChild(ifr);
      var f = document.createElement("form"); f.method = "POST"; f.enctype = "multipart/form-data";
      f.action = "https://formsubmit.co/" + SEND_TO; f.target = nm; f.style.display = "none";
      function add(n, v) { var i = document.createElement("input"); i.type = "hidden"; i.name = n; i.value = v; f.appendChild(i); }
      add("_subject", item.subject); add("_template", "table"); add("_captcha", "false");
      add("_next", location.origin + "/app/sent.html?sent=1");
      Object.keys(item.fields || {}).forEach(function (k) { add(k, item.fields[k]); });
      var fi = document.createElement("input"); fi.type = "file"; fi.name = "attachment";
      try { var dt = new DataTransfer(); dt.items.add(new File([item.blob], item.fname, { type: "application/pdf" })); fi.files = dt.files; }
      catch (e) { ifr.remove(); return rej(new Error("unsupported")); }
      if (!fi.files || !fi.files.length) { ifr.remove(); return rej(new Error("unsupported")); }
      f.appendChild(fi); document.body.appendChild(f);
      var done = false, timer = setTimeout(function () { finish(false); }, 90000);
      function finish(ok) { if (done) return; done = true; clearTimeout(timer); f.remove(); setTimeout(function () { ifr.remove(); }, 500); ok ? res() : rej(new Error("unconfirmed")); }
      ifr.addEventListener("load", function () {
        var href = ""; try { href = ifr.contentWindow.location.href; } catch (e) { return finish(false); }
        if (href === "about:blank") return;
        finish(/[?&]sent=1/.test(href));
      });
      f.submit();
    });
  }

  // Part 1: the record and the PDF go to Montney's own database. Resolves true once the record is in
  // (or can never go in), false if it should be tried again later (no signal, server hiccup).
  function slug(t) { return String(t || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "form"; }
  function uploadPdf(item) {
    var t = item.track, path = "forms/" + (t.work_date || "nodate") + "/" + slug(t.form) + "-" + slug(t.crew_name) + "-" + item.id + ".pdf";
    return fetch(TRACK_URL.replace("/rest/v1/", "/storage/v1/object/safety-forms/") + path, {
      method: "POST", headers: { apikey: TRACK_KEY, "Content-Type": "application/pdf" }, body: item.blob
    }).then(function (r) {
      if (r.ok) return path;
      return r.text().then(function (txt) {
        if (/duplicate|already exists/i.test(txt)) return path;   // went up on an earlier try
        if (r.status >= 500) throw new Error("retry");
        return "";                                               // rejected for good (e.g. too big): send the record without it
      });
    });
  }
  function saveToDb(item) {
    if (item.dbDone) return Promise.resolve(true);
    if (!item.track || !item.track.crew_name) return Promise.resolve(true); // nothing to record (no name picked from the list)
    var pdf = item.pdfPath !== undefined ? Promise.resolve(item.pdfPath) : uploadPdf(item);
    return pdf.then(function (path) {
      item.pdfPath = path;
      var rec = Object.assign({}, item.track);
      if (path) rec.details = Object.assign({}, rec.details || {}, { pdf: path });
      return fetch(TRACK_URL + "safety_forms", { method: "POST", keepalive: true,
        headers: { apikey: TRACK_KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(rec) });
    }).then(function (r) {
      if (!r.ok && r.status >= 500) return false;
      item.dbDone = true; return true;                          // a 4xx won't succeed on retry, same as before
    }).catch(function () { return false; });
  }

  // Portal check mark. Form pages already have logForm(); the app home doesn't, so it gets the same thing here.
  function track(rec) {
    if (!rec || !rec.crew_name) return;
    if (typeof window.logForm === "function") return window.logForm(rec);
    var q; try { q = JSON.parse(localStorage.getItem("montney_pending") || "[]"); } catch (e) { q = []; }
    q.push(rec);
    Promise.all(q.map(function (r) {
      return fetch(TRACK_URL + "safety_forms", { method: "POST", keepalive: true,
        headers: { apikey: TRACK_KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(r) })
        .then(function (x) { return x.ok || x.status < 500; }).catch(function () { return false; });
    })).then(function (ok) {
      try { localStorage.setItem("montney_pending", JSON.stringify(q.filter(function (_, i) { return !ok[i]; }))); } catch (e) {}
    });
  }

  // Only one page at a time works the outbox, so a form isn't sent twice.
  function takeLock() {
    try {
      var t = +localStorage.getItem(LOCK) || 0;
      if (Date.now() - t < 120000) return false;
      localStorage.setItem(LOCK, String(Date.now())); return true;
    } catch (e) { return true; }
  }
  function dropLock() { try { localStorage.removeItem(LOCK); } catch (e) {} }

  var running = null, busy = {};
  var WEEK = 7 * 864e5;
  function flush() {
    if (isFrame || !window.indexedDB) return Promise.resolve({ sent: [], left: 0 });
    if (running) return running;
    if (navigator.onLine === false || !takeLock()) return all().then(function (l) { return { sent: [], left: pending(l) }; }).catch(function () { return { sent: [], left: 0 }; });
    running = all().then(function (items) {
      items.sort(function (a, b) { return a.id - b.id; });
      var sent = [];
      // Part 1 for everything first, so a slow email never holds up a check mark.
      return items.reduce(function (p, it) {
        return p.then(function () {
          if (it.dbDone || busy[it.id]) return;
          return saveToDb(it).then(function (ok) { if (ok) { sent.push(it.id); return put(it); } });
        });
      }, Promise.resolve()).then(function () {
        // Part 2: the email copy. Already in the database and over a week old with no email? Stop trying.
        return items.reduce(function (p, it) {
          return p.then(function () { return get(it.id); }).then(function (fresh) {
            if (!fresh || busy[fresh.id]) return;               // already sent, or being saved right now
            it = fresh;
            if (it.dbDone && Date.now() - it.id > WEEK) return del(it.id);
            try { localStorage.setItem(LOCK, String(Date.now())); } catch (e) {}
            return post(it).then(function () {
              if (!it.dbDone) { sent.push(it.id); track(it.track); }
              return del(it.id);
            }).catch(function (e) {
              if (e && e.message === "unsupported") { it.unsupported = true; return put(it); }
            });
          });
        }, Promise.resolve());
      }).then(function () { return all(); }).then(function (l) { return { sent: sent, left: pending(l) }; });
    }).catch(function () { return { sent: [], left: 0 }; })
      .then(function (r) { running = null; dropLock(); notify(r); return r; });
    return running;
  }
  // Forms that haven't reached the office at all yet (an email still retrying doesn't count).
  function pending(l) { return (l || []).filter(function (it) { return !it.dbDone; }).length; }

  var listeners = [];
  function notify(r) { listeners.forEach(function (fn) { try { fn(r); } catch (e) {} }); }

  window.MontneyOutbox = {
    // Save a finished form on the phone, then try to send it right away.
    add: function (o) {
      var item = { id: Date.now(), blob: o.blob, fname: o.fname, subject: o.subject, fields: o.fields || {}, track: o.track || null, saved: new Date().toISOString() };
      // Save on the phone, then put it in the database right away (no waiting on the email or another page).
      busy[item.id] = true;
      return put(item).then(function () { return navigator.onLine === false ? false : saveToDb(item); })
        .then(function (ok) { return ok ? put(item).then(function () { return true; }) : false; })
        .catch(function (e) { delete busy[item.id]; throw e; })
        .then(function (inDb) {
          delete busy[item.id];
          flush();                                              // the email copy goes out in the background
          if (inDb) notify({ sent: [item.id], left: 0 });
          return { id: item.id, sent: inDb };
        });
    },
    flush: flush,
    post1: post, // one straight send, used only if the phone can't save the form

    count: function () { return all().then(pending).catch(function () { return 0; }); },
    onChange: function (fn) { listeners.push(fn); }
  };

  if (!isFrame) {
    addEventListener("load", function () { setTimeout(flush, 1500); });
    addEventListener("online", function () { setTimeout(flush, 3000); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") flush(); });
    setInterval(flush, 60000);
  }
})();
