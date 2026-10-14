// Core: Supabase client, shared state, helpers, theming, navigation.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

export const CONFIG = {
  product: "Steelcap Pro",
  tagline: "Built for the field",            // product name: change here and in index.html <title>
  url: "https://hsyscwheyixsxzqahvbr.supabase.co",
  key: "sb_publishable_fonqS_pw5_MOpi-Hvbs24A_N_NA5-TU",   // public key, safe in the browser
  vapid: "BFPgfyJrT6phvRD61mehf8KxxW6F9UFhAKtn_Q9gBbNNcZQ6S6lZYOlRZSC9EAJxBpjGaztQdYgJz4iFyHqFMos",   // public push key, safe in the browser
};

export const sb = createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true } });

// S = everything the app knows about who is signed in and which company they are in
export const S = { user: null, companies: [], company: null, me: null, people: [], byId: {}, trucks: [], clients: [], templates: [], view: "home", params: {} };
export const isAdmin = () => !!S.me && (S.me.role === "owner" || S.me.role === "admin");
export const isOwner = () => !!S.me && S.me.role === "owner";

// ---------- small helpers ----------
export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
export const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const today = () => iso(new Date());
export const dayLabel = k => new Date(k + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
export const money = n => "$" + Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = s => { const n = parseFloat(String(s ?? "").replace(/[,\s$]/g, "")); return isNaN(n) ? null : n; };
export const fmtH = n => (Math.round(Number(n || 0) * 10) / 10).toString();
export const initials = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
export const first = n => String(n || "").trim().split(/\s+/)[0] || "";
export const nameOf = id => (S.byId[id] && S.byId[id].full_name) || "Someone";
export const truckName = id => { const t = S.trucks.find(x => x.id === id); return t ? t.unit : ""; };
export const clientName = id => { const c = S.clients.find(x => x.id === id); return c ? c.name : ""; };
export const timeOf = t => { const d = new Date(t), now = new Date(); return iso(d) === iso(now) ? d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : (now - d < 6 * 86400000 ? d.toLocaleDateString("en-CA", { weekday: "short" }) : d.toLocaleDateString("en-CA", { month: "short", day: "numeric" })); };
export const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const toast = t => { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2800); };
export const msg = (el, t, kind) => { if (typeof el === "string") el = $(el); if (!el) return; el.textContent = t || ""; el.className = "msg" + (kind ? " " + kind : ""); };

// ---------- icons ----------
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  ticket: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  truck: '<rect x="2" y="7" width="13" height="10" rx="1.5"/><path d="M15 10h4l3 3v4h-7"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
  users: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15 14.2c2.9-.4 6 1.3 6 4.8"/>',
  check: '<path d="M5 12l5 5L20 7"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  clip: '<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13M7 8h5"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l7 5V5L7 10H4a1 1 0 0 0-1 1z"/><path d="M18 8a5 5 0 0 1 0 8"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  dollar: '<path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.8c0 4.7 10 2.4 10 7.2 0 2.3-2.2 3.5-5 3.5s-5-1.2-5-3.2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};
export const svg = (n, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.9}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;

// ---------- theming ----------
const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function applyTheme(theme, accent) {
  const r = document.documentElement;
  r.dataset.theme = theme || "steelcap";
  const rgb = hexRgb(accent);
  if (rgb) {
    r.style.setProperty("--gold", accent); r.style.setProperty("--gold2", accent); r.style.setProperty("--acc-rgb", rgb.join(","));
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    r.style.setProperty("--on-acc", lum > 0.6 ? "#111111" : "#ffffff");
  } else ["--gold", "--gold2", "--acc-rgb", "--on-acc"].forEach(p => r.style.removeProperty(p));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(r).getPropertyValue("--bg").trim() || "#0b0e10";
}
export const logoUrl = path => path ? `${CONFIG.url}/storage/v1/object/public/logos/${path}` : "";

// ---------- sheets (bottom pop-ups) ----------
export function sheet(html, onMount) {
  const el = $("sheet");
  el.innerHTML = `<div class="grab"></div>${html}`;
  $("scrim").classList.add("on"); el.classList.add("on");
  if (onMount) onMount(el);
  return el;
}
export function closeSheet() { $("sheet").classList.remove("on"); $("scrim").classList.remove("on"); }

export function viewImage(url) {
  const d = document.createElement("div"); d.className = "viewer";
  d.innerHTML = `<img src="${esc(url)}" alt=""><button type="button" aria-label="Close">×</button>`;
  d.addEventListener("click", () => d.remove()); document.body.appendChild(d);
}

// ---------- files ----------
export async function shrinkImage(f, max = 1800) {
  if (!f.type.startsWith("image/") || f.type === "image/gif") return { blob: f, type: f.type, ext: (f.name.split(".").pop() || "bin").toLowerCase() };
  try {
    const bmp = await createImageBitmap(f), sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .85));
    return { blob, type: "image/jpeg", ext: "jpg", w: c.width, h: c.height };
  } catch (e) { return { blob: f, type: f.type, ext: (f.name.split(".").pop() || "bin").toLowerCase() }; }
}
// Every company file lives under files/<company_id>/<area>/...
export async function uploadFile(area, file) {
  const s = await shrinkImage(file);
  const ext = String(s.ext).replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${S.company.id}/${area}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("files").upload(path, s.blob, { contentType: s.type || "application/octet-stream" });
  if (error) throw error;
  return { path, type: s.type, size: s.blob.size, w: s.w, h: s.h, name: file.name };
}
const urlCache = {};
export async function signUrls(paths) {
  const need = [...new Set(paths.filter(p => p && !urlCache[p]))];
  if (need.length) { const { data } = await sb.storage.from("files").createSignedUrls(need, 6 * 3600); (data || []).forEach(d => { if (d.signedUrl) urlCache[d.path] = d.signedUrl; }); }
  return urlCache;
}
export const fileUrl = p => urlCache[p] || "";

// ---------- navigation ----------
const VIEWS = {};
export function view(name, def) { VIEWS[name] = def; }
const TAB_OF = n => (VIEWS[n] && VIEWS[n].tab) || n;
export async function go(name, params = {}) {
  if (!VIEWS[name]) name = "home";
  S.view = name; S.params = params;
  const main = $("main");
  main.scrollTop = 0; main.removeAttribute("style"); main.onclick = null; main.onchange = null;
  main.className = "view" + (VIEWS[name].cls ? " " + VIEWS[name].cls : "");
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === TAB_OF(name)));
  $("tabs").hidden = !!VIEWS[name].noTabs;
  main.innerHTML = "";
  try { await VIEWS[name].render(main, params); } catch (e) { console.error(e); main.innerHTML = `<p class="empty">Something went wrong loading this screen. Pull down or go back and try again.</p>`; }
}
export const back = (to = "home") => `<button class="back" type="button" data-go="${to}" aria-label="Back">${svg("left")}</button>`;
export const head = (eyebrow, title, side = "") => `<div class="pagehead"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 class="h1">${esc(title)}</h1></div>${side ? `<div class="side">${side}</div>` : ""}</div>`;

// Global click routing: any element with data-go="view" navigates.
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (!g) return;
  e.preventDefault(); go(g.dataset.go, g.dataset.p ? JSON.parse(g.dataset.p) : {});
});

// ---------- company context ----------
export async function loadCompany(cid) {
  const [co, mem, tr, cl, ft] = await Promise.all([
    sb.from("companies").select("*").eq("id", cid).single(),
    sb.from("members").select("*").eq("company_id", cid).order("full_name"),
    sb.from("trucks").select("*").eq("company_id", cid).order("unit"),
    sb.from("clients").select("*").eq("company_id", cid).order("name"),
    sb.from("form_templates").select("*").eq("company_id", cid).order("sort"),
  ]);
  if (co.error) throw co.error;
  S.company = co.data;
  S.people = mem.data || []; S.byId = Object.fromEntries(S.people.map(p => [p.user_id, p]));
  S.me = S.byId[S.user.id] || null;
  S.trucks = tr.data || []; S.clients = cl.data || []; S.templates = ft.data || [];
  store("fp_company", cid);
  applyTheme(S.company.theme, S.company.accent);
  return S.company;
}

// ---------- pay schedule ----------
// Supports semi-monthly (cut-offs on the 15th and month end), bi-weekly and weekly.
const nthMon = (y, m, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((8 - d.getDay()) % 7) + (n - 1) * 7); return d; };
const easter = y => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
  h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
  mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); };
const holCache = {};
export const holidays = y => holCache[y] || (holCache[y] = (() => {
  const gf = easter(y); gf.setDate(gf.getDate() - 2);
  const vic = new Date(y, 4, 24); vic.setDate(24 - ((vic.getDay() + 6) % 7));
  return new Set([new Date(y, 0, 1), nthMon(y, 1, 3), gf, vic, new Date(y, 6, 1), nthMon(y, 7, 1), nthMon(y, 8, 1), new Date(y, 8, 30),
    nthMon(y, 9, 2), new Date(y, 10, 11), new Date(y, 11, 25), new Date(y, 11, 26)].map(iso));
})());
export const businessDay = d => { const x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6 || holidays(x.getFullYear()).has(iso(x))) x.setDate(x.getDate() - 1); return x; };

// Returns { paydays:Set<iso>, cutoffs:Set<iso> } for a range of dates
export function payEvents(sched, from, to) {
  sched = sched || { type: "semi-monthly" };
  const pays = new Set(), cuts = new Set();
  const start = new Date(from), end = new Date(to);
  if (sched.type === "biweekly" || sched.type === "weekly") {
    const step = sched.type === "weekly" ? 7 : 14, lag = Number(sched.lag_days ?? 5);
    let p = new Date((sched.anchor || iso(new Date())) + "T00:00:00");
    while (p > start) p.setDate(p.getDate() - step);
    while (p <= new Date(end.getTime() + 20 * 86400000)) {
      const pay = businessDay(p), cut = new Date(p); cut.setDate(cut.getDate() - lag);
      pays.add(iso(pay)); cuts.add(iso(cut));
      p.setDate(p.getDate() + step);
    }
  } else {
    const pd = sched.paydays || [1, 15];   // day of month; 0 = last day
    for (let y = start.getFullYear(), m = start.getMonth() - 1; new Date(y, m, 1) <= new Date(end.getFullYear(), end.getMonth() + 1, 1); m++) {
      const last = new Date(y, m + 1, 0).getDate();
      cuts.add(iso(new Date(y, m, 15))); cuts.add(iso(new Date(y, m, last)));
      pd.forEach(d => pays.add(iso(businessDay(new Date(y, m, d === 0 ? last : d)))));
    }
  }
  return { paydays: pays, cutoffs: cuts };
}
export function nextPay(sched) {
  const t = new Date(), end = new Date(t); end.setDate(end.getDate() + 45);
  const ev = payEvents(sched, t, end), k = iso(t);
  const nextOf = set => [...set].filter(x => x >= k).sort()[0];
  return { pay: nextOf(ev.paydays), cut: nextOf(ev.cutoffs) };
}
export const nice = k => !k ? "—" : k === today() ? "Today" : dayLabel(k);
