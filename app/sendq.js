/* MontneyPro send queue.
 * A form is saved on the phone first, then sent to the office. If there's no signal (or the send times out),
 * it stays saved and keeps retrying on its own: every minute while a form page or the app is open, whenever
 * the phone gets signal back, and every time the app or a form is opened. The crew member only taps Submit once.
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

  // Portal check mark. Form pages already have logForm(); the app home doesn't, so it gets the same thing here.
  function track(rec) {
    if (!rec || !rec.crew_name) return;
    if (typeof window.logForm === "function") return window.logForm(rec);
    var q; try { q = JSON.parse(localStorage.getItem("montney_pending") || "[]"); } catch (e) { q = []; }
    q.push(rec);
    try { localStorage.setItem("montney_pending", JSON.stringify(q)); } catch (e) {}
    Promise.all(q.map(function (r) {
      return fetch(TRACK_URL + "safety_forms", { method: "POST", keepalive: true,
        headers: { apikey: TRACK_KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(r) })
        .then(function (x) { return x.ok || (x.status < 500 && x.status !== 408 && x.status !== 429); }).catch(function () { return false; });
    })).then(function (ok) {
      // Re-read the list and take out only what was sent, so records added meanwhile aren't wiped.
      try {
        var sent = q.filter(function (_, i) { return ok[i]; }).map(function (r) { return JSON.stringify(r); });
        var now = JSON.parse(localStorage.getItem("montney_pending") || "[]");
        localStorage.setItem("montney_pending", JSON.stringify(now.filter(function (r) {
          var k = sent.indexOf(JSON.stringify(r)); if (k < 0) return true; sent.splice(k, 1); return false;
        })));
      } catch (e) {}
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

  var running = null;
  function flush() {
    if (isFrame || !window.indexedDB) return Promise.resolve({ sent: [], left: 0 });
    if (running) return running;
    if (navigator.onLine === false || !takeLock()) return all().then(function (l) { return { sent: [], left: l.length }; }).catch(function () { return { sent: [], left: 0 }; });
    running = all().then(function (items) {
      items.sort(function (a, b) { return a.id - b.id; });
      var sent = [], left = 0;
      return items.reduce(function (p, it) {
        return p.then(function () {
          try { localStorage.setItem(LOCK, String(Date.now())); } catch (e) {}
          return post(it).then(function () { sent.push(it.id); track(it.track); return del(it.id); })
            .catch(function (e) {
              if (e && e.message === "unsupported") { it.unsupported = true; return put(it).then(function () { left++; }); }
              left++;
            });
        });
      }, Promise.resolve()).then(function () { return { sent: sent, left: left }; });
    }).catch(function () { return { sent: [], left: 0 }; })
      .then(function (r) { running = null; dropLock(); notify(r); return r; });
    return running;
  }

  var listeners = [];
  function notify(r) { listeners.forEach(function (fn) { try { fn(r); } catch (e) {} }); }

  window.MontneyOutbox = {
    // Save a finished form on the phone, then try to send it right away.
    add: function (o) {
      var item = { id: Date.now(), blob: o.blob, fname: o.fname, subject: o.subject, fields: o.fields || {}, track: o.track || null, saved: new Date().toISOString() };
      // If a send is already running (the every-minute retry), wait for it, then send this one. Otherwise the
      // new form sat in the outbox and the crew member was told "no signal" when there was signal.
      return put(item).then(function () { return running ? running.then(flush, flush) : flush(); }).then(function (r) {
        return { id: item.id, sent: r.sent.indexOf(item.id) >= 0 };
      });
    },
    flush: flush,
    post1: post, // one straight send, used only if the phone can't save the form

    count: function () { return all().then(function (l) { return l.length; }).catch(function () { return 0; }); },
    onChange: function (fn) { listeners.push(fn); }
  };

  if (!isFrame) {
    addEventListener("load", function () { setTimeout(flush, 1500); });
    addEventListener("online", function () { setTimeout(flush, 3000); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") flush(); });
    setInterval(flush, 60000);
    // Leaving the page mid-send: free the lock so the next page can send straight away instead of saying "no signal".
    addEventListener("pagehide", function () { if (running) dropLock(); });
  }
})();
