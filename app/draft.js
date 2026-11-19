/* MontneyPro form drafts.
 * Keeps an unfinished safety form on the phone while it's being filled in, so closing the page, a dead battery,
 * a phone call or a failed send doesn't wipe it. Reopen the form the same day and it's all back (sign again).
 * Cleared as soon as the form is sent or saved to send. Drafts from an earlier day are thrown away.
 * How: every button tap with an onclick (add row, OK/defect, topic, present...) is logged in order, plus the
 * value of every field. On reopen the taps are replayed in the same order (so added rows exist again), then the
 * values are put back.
 */
(function () {
  if (window.self !== window.top) return;
  var KEY = "montney_draft_" + location.pathname.replace(/[^a-z0-9]+/gi, "_");
  var SKIP = /submitForm|saveCopy|clearSig/;
  var log = [], restoring = false, timer = null;
  function key(el) { return el.id || el.name || el.tagName; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function clickables() { return Array.prototype.slice.call(document.querySelectorAll("[onclick]")); }
  function fields() { return Array.prototype.slice.call(document.querySelectorAll("input,select,textarea")).filter(function (el) { return el.type !== "file" && el.type !== "hidden"; }); }
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save() {
    if (restoring) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      var vals = fields().map(function (el) { return el.type === "checkbox" || el.type === "radio" ? (el.checked ? 1 : 0) : el.value; });
      var touched = log.length || fields().some(function (el) { return el.type !== "date" && el.type !== "time" && el.tagName !== "SELECT" && el.value; });
      if (!touched) return;
      try { localStorage.setItem(KEY, JSON.stringify({ day: today(), clicks: log, vals: vals, keys: fields().map(key) })); } catch (e) {}
    }, 400);
  }
  function clear() { log = []; clearTimeout(timer); try { localStorage.removeItem(KEY); } catch (e) {} }

  document.addEventListener("click", function (e) {
    if (restoring) return;
    var el = e.target.closest && e.target.closest("[onclick]");
    if (!el || SKIP.test(el.getAttribute("onclick"))) return;
    var i = clickables().indexOf(el);
    if (i >= 0) { log.push(i); save(); }
  }, true);
  document.addEventListener("input", save, true);
  document.addEventListener("change", save, true);
  // A list the worker picked themselves (their name, a crew role) is never put back to the draft's value later.
  document.addEventListener("change", function (e) { if (!restoring && e.target && e.target.tagName === "SELECT") e.target.dataset.userSet = "1"; }, true);

  function putValues(d, onlySelects) {
    var f = fields();
    d.vals.forEach(function (v, i) {
      var el = f[i]; if (!el || (onlySelects && el.tagName !== "SELECT")) return;
      if (onlySelects && el.dataset.userSet) return;               // they changed it since the draft came back
      if (d.keys && d.keys[i] !== key(el)) return;                  // the form changed (app update) since this draft: don't put a value in the wrong box
      if (el.type === "checkbox" || el.type === "radio") el.checked = !!v;
      else if (v !== "" && v != null) {
        if (el.tagName === "SELECT" && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) return;
        el.value = v;
      }
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  function restore() {
    var d = read();
    if (!d) return;
    if (d.day !== today()) { clear(); return; }
    restoring = true;
    try {
      (d.clicks || []).forEach(function (i) { var el = clickables()[i]; if (el) try { el.click(); } catch (e) {} });
      putValues(d, false);
    } finally { restoring = false; }
    log = (d.clicks || []).slice();
    // The name list loads from the internet a moment later; put the name back once it's there.
    [1500, 4000, 8000].forEach(function (ms) { setTimeout(function () { restoring = true; try { putValues(d, true); } finally { restoring = false; } }, ms); });
    var box = document.getElementById("mpQueue");
    if (box) { box.hidden = false; box.textContent = "Your unfinished form from earlier is back. Check it, sign again, then submit."; }
  }
  addEventListener("load", function () { setTimeout(restore, 300); });

  // Sent (or saved on the phone to send later): the draft is done.
  function wrap() {
    var o = window.MontneyOutbox; if (!o || o._draftWrapped) return; o._draftWrapped = true;
    var add = o.add, direct = o.direct, post1 = o.post1;
    o.add = function () { return add.apply(o, arguments).then(function (r) { clear(); return r; }); };
    if (direct) o.direct = function () { return direct.apply(o, arguments).then(function (ok) { if (ok) clear(); return ok; }); };
    if (post1) o.post1 = function () { return post1.apply(o, arguments).then(function (r) { clear(); return r; }); };
  }
  wrap(); addEventListener("load", wrap);
  window.MontneyDraft = { clear: clear };
})();
