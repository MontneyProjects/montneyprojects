/**
 * MontneyPro – Admin field tickets
 * Lets the admin account in MontneyPro list and edit field tickets on the
 * "Montney Projects Master Ticketing" sheet. Only a signed-in MontneyPro admin
 * can use it: every request carries the user's MontneyPro sign-in, which this
 * script checks with Supabase before touching the sheet.
 *
 * Setup (one time):
 *  1. script.google.com > New project, signed in as general@montneyprojects.com
 *  2. Paste this whole file in, Save
 *  3. Deploy > New deployment > type: Web app
 *       Execute as: Me      Who has access: Anyone
 *  4. Authorize, then copy the Web app URL into MontneyPro (TICKETS_ADMIN_URL)
 * Re-deploying later: Deploy > Manage deployments > edit > Version: New version
 * (keeps the same URL).
 */

const SHEET_ID = "1qfz5qib6jDOzwujP7HynkOa3W3G4lg_9W0DkTtlSUKQ";
const TABS = ["001", "002", "003", "004", "005", "006", "009", "Skid steer"];
const HEADER_ROW = 5;            // Date | Truck # | Client | ... on row 5
const FIRST_ROW = 6;
const COLS = ["date", "truck", "client", "job", "supervisor", "location", "hours",
              "fitter", "helper", "scope", "shop", "sub", "invoiced"];  // A..M
const SUPABASE_URL = "https://nwcbvchcdsbwwnnbtyht.supabase.co";
const SUPABASE_KEY = "sb_publishable_JtICuOehqdwzQOm8v0i-SA_qf21Bh0e"; // public key
const TZ = "America/Edmonton";

function doGet() { return out({ ok: true, service: "montneypro-admin-tickets" }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents || "{}"); } catch (err) { return out({ error: "bad request" }); }
  const who = checkAdmin(req.token);
  if (!who) return out({ error: "not admin" });
  try {
    if (req.action === "list") return out(list(req.from, req.to));
    if (req.action === "update") return out(update(req, who));
    return out({ error: "unknown action" });
  } catch (err) {
    return out({ error: String(err && err.message || err) });
  }
}

// ---- auth: the MontneyPro sign-in must belong to an admin profile ----
function checkAdmin(token) {
  if (!token) return null;
  const head = { apikey: SUPABASE_KEY, Authorization: "Bearer " + token };
  const u = UrlFetchApp.fetch(SUPABASE_URL + "/auth/v1/user", { headers: head, muteHttpExceptions: true });
  if (u.getResponseCode() !== 200) return null;
  const user = JSON.parse(u.getContentText());
  const p = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/profiles?select=role&id=eq." + encodeURIComponent(user.id),
    { headers: head, muteHttpExceptions: true });
  if (p.getResponseCode() !== 200) return null;
  const rows = JSON.parse(p.getContentText());
  return rows.length && rows[0].role === "admin" ? (user.email || "admin") : null;
}

// ---- list every ticket row between two dates (yyyy-mm-dd), all truck tabs ----
function list(from, to) {
  const ss = SpreadsheetApp.openById(SHEET_ID), out = [];
  TABS.forEach(function (tab) {
    const sh = ss.getSheetByName(tab); if (!sh) return;
    const last = sh.getLastRow(); if (last < FIRST_ROW) return;
    const vals = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, COLS.length).getValues();
    vals.forEach(function (r, i) {
      const d = toIso(r[0]); if (!d) return;
      if ((from && d < from) || (to && d > to)) return;
      const t = { tab: tab, row: FIRST_ROW + i };
      COLS.forEach(function (k, c) { t[k] = c === 0 ? d : (r[c] === null ? "" : r[c]); });
      out.push(t);
    });
  });
  return { ok: true, tickets: out };
}

// ---- edit one row; refuses if the row changed since the app loaded it ----
function update(req, who) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(req.tab);
    if (!sh || TABS.indexOf(req.tab) < 0) return { error: "no such tab" };
    const row = Number(req.row);
    if (!(row >= FIRST_ROW) || row > sh.getLastRow()) return { error: "no such row" };
    const range = sh.getRange(row, 1, 1, COLS.length), cur = range.getValues()[0];
    const was = req.was || {};
    // the row must still be the same ticket (rows can move if someone sorts the tab)
    const same = toIso(cur[0]) === was.date && String(cur[2]) === String(was.client || "") &&
                 String(cur[6]) === String(was.hours === undefined ? "" : was.hours) && String(cur[7]) === String(was.fitter || "");
    if (!same) return { error: "moved" };
    const set = req.set || {}, next = cur.slice();
    COLS.forEach(function (k, c) {
      if (!(k in set)) return;
      let v = set[k];
      if (k === "date") { const p = String(v).split("-"); v = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : cur[0]; }
      else if (k === "hours" || k === "shop") { v = v === "" || v === null ? "" : Number(v); if (v !== "" && !(v >= 0 && v <= 24)) throw new Error("Hours must be 0 to 24"); }
      else v = String(v == null ? "" : v).slice(0, 2000);
      next[c] = v;
    });
    range.setValues([next]);
    const note = "Edited in MontneyPro by " + who + " " + Utilities.formatDate(new Date(), TZ, "MMM d, h:mm a");
    sh.getRange(row, 1).setNote(note);
    const t = { tab: req.tab, row: row };
    COLS.forEach(function (k, c) { t[k] = c === 0 ? toIso(next[0]) : next[c]; });
    return { ok: true, ticket: t };
  } finally { lock.releaseLock(); }
}

function toIso(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  return "";
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
