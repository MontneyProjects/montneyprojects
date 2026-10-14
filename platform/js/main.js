// Boot, sign-in / sign-up, joining with an invite code, and the new-company setup wizard.
import { sb, S, CONFIG, $, esc, store, toast, msg, svg, go, loadCompany, applyTheme, logoUrl, closeSheet, sheet } from "./core.js";
import "./views.js";
import { startChat } from "./chat.js";
import { refreshPush } from "./push.js";

document.title = CONFIG.product;
$("splashName").textContent = CONFIG.product.toUpperCase();
if ($("splashTag")) $("splashTag").textContent = CONFIG.tagline;
const paint = root => root.querySelectorAll("[data-i]").forEach(el => { if (!el.querySelector("svg")) el.insertAdjacentHTML("afterbegin", svg(el.dataset.i)); });
paint(document);
new MutationObserver(() => paint(document)).observe(document.body, { childList: true, subtree: true });
$("scrim").addEventListener("click", closeSheet);
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

const started = Date.now();
const hideSplash = () => setTimeout(() => $("splash").classList.add("gone"), Math.max(0, 700 - (Date.now() - started)));
const gate = $("gate");
const showGate = html => { $("app").hidden = true; gate.hidden = false; gate.innerHTML = `<div class="wrap">${html}</div>`; gate.scrollTop = 0; hideSplash(); };
const brand = () => `<div class="brandmark"><img class="logo-img" src="icon-192.png" alt=""><span><b>${esc(CONFIG.product)}</b><small class="tagline">${esc(CONFIG.tagline)}</small></span></div>`;

// remember what they were doing if they have to confirm their email first
const urlJoin = new URLSearchParams(location.search).get("join");
if (urlJoin) store("fp_intent", { kind: "join", code: urlJoin.toUpperCase() });

// ---------- signed-out screens ----------
function welcome() {
  applyTheme("steelcap");
  showGate(`${brand()}
    <h1>Run your whole crew from your phone.</h1>
    <p class="lead">Safety forms, truck inspections, field tickets, dispatch, crew chat and the books. Built for oilfield crews of 1–20.</p>
    <button class="btn" type="button" id="wStart">Start my company</button>
    <button class="btn ghost" type="button" id="wJoin">I have an invite code</button>
    <p class="switcher">Already set up? <button class="link" type="button" id="wSign">Sign in</button></p>`);
  $("wStart").onclick = () => { store("fp_intent", { kind: "create" }); signUp("Create your account", "You'll set up your company next. Takes about 10 minutes."); };
  $("wJoin").onclick = () => joinCode();
  $("wSign").onclick = () => signIn();
}

function signIn(note) {
  showGate(`${brand()}<h1>Welcome back</h1><p class="lead">${esc(note || "Sign in to your crew.")}</p>
    <form id="siForm">
      <label class="field"><span>Email</span><input id="siEmail" type="email" autocomplete="username" required value="${esc(store("fp_email") || "")}"></label>
      <label class="field"><span>Password</span><input id="siPass" type="password" autocomplete="current-password" required></label>
      <button class="btn" id="siBtn">Sign in</button>
      <p class="msg" id="siMsg"></p>
    </form>
    <p class="switcher"><button class="link" type="button" id="siForgot">Forgot password?</button> · <button class="link" type="button" id="siBack">Back</button></p>`);
  $("siForm").onsubmit = async e => {
    e.preventDefault(); $("siBtn").disabled = true; msg("siMsg", "Signing in...");
    const email = $("siEmail").value.trim();
    const { error } = await sb.auth.signInWithPassword({ email, password: $("siPass").value });
    $("siBtn").disabled = false;
    if (error) { msg("siMsg", /confirm/i.test(error.message) ? "Confirm your email first. Check your inbox for the link." : "Wrong email or password.", "bad"); return; }
    store("fp_email", email);
  };
  $("siForgot").onclick = async () => {
    const email = $("siEmail").value.trim(); if (!email) { msg("siMsg", "Type your email first, then tap Forgot again.", "bad"); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "?reset=1" });
    msg("siMsg", error ? error.message : "If that email has an account, a reset link is on its way.", error ? "bad" : "ok");
  };
  $("siBack").onclick = welcome;
}

function signUp(title, lead, preset = {}) {
  showGate(`${preset.logo ? `<img class="co-logo" src="${esc(preset.logo)}" alt="">` : brand()}<h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p>
    <form id="suForm">
      <label class="field"><span>Your full name</span><input id="suName" autocomplete="name" required value="${esc(preset.name || "")}"></label>
      <label class="field"><span>Email</span><input id="suEmail" type="email" autocomplete="email" required></label>
      <label class="field"><span>Phone (optional)</span><input id="suPhone" type="tel" autocomplete="tel"></label>
      <label class="field"><span>Make a password</span><input id="suPass" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn" id="suBtn">Create account</button>
      <p class="msg" id="suMsg"></p>
    </form>
    <p class="switcher">Have an account? <button class="link" type="button" id="suSign">Sign in</button></p>`);
  $("suSign").onclick = () => signIn();
  $("suForm").onsubmit = async e => {
    e.preventDefault(); $("suBtn").disabled = true; msg("suMsg", "Setting you up...");
    const email = $("suEmail").value.trim(), full_name = $("suName").value.trim(), phone = $("suPhone").value.trim();
    const intent = store("fp_intent") || {}; store("fp_intent", { ...intent, full_name, phone });
    const { data, error } = await sb.auth.signUp({ email, password: $("suPass").value, options: { data: { full_name, phone }, emailRedirectTo: location.origin + location.pathname } });
    $("suBtn").disabled = false;
    if (error) { msg("suMsg", /registered/i.test(error.message) ? "That email already has an account. Sign in instead." : error.message, "bad"); return; }
    store("fp_email", email);
    if (!data.session) signIn("Check your email for a confirmation link, then sign in here.");
  };
}

async function joinCode(prefill) {
  showGate(`${brand()}<h1>Join your crew</h1><p class="lead">Type the code your boss sent you.</p>
    <form id="jcForm"><label class="field"><span>Invite code</span><input id="jcCode" autocapitalize="characters" autocomplete="off" required value="${esc(prefill || "")}" style="letter-spacing:.12em; text-transform:uppercase"></label>
    <button class="btn" id="jcBtn">Continue</button><p class="msg" id="jcMsg"></p></form>
    <p class="switcher"><button class="link" type="button" id="jcBack">Back</button></p>`);
  $("jcBack").onclick = welcome;
  $("jcForm").onsubmit = async e => {
    e.preventDefault();
    const code = $("jcCode").value.trim().toUpperCase();
    const { data } = await sb.rpc("invite_preview", { p_code: code });
    if (!data) { msg("jcMsg", "That code didn't work. It may be expired or already used.", "bad"); return; }
    store("fp_intent", { kind: "join", code });
    applyTheme(data.theme, data.accent);
    const { data: s } = await sb.auth.getSession();
    if (s.session) return route(s.session);
    signUp(`Join ${data.company}`, "Make your account and you're in.", { logo: logoUrl(data.logo_path), name: data.name || "" });
  };
  if (prefill) $("jcForm").requestSubmit();
}

// ---------- routing after sign-in ----------
let routing = false;
async function route(session) {
  if (routing) return; routing = true;
  try {
    if (!session) { S.user = null; welcome(); return; }
    S.user = session.user;
    const intent = store("fp_intent") || {};
    const meta = S.user.user_metadata || {};
    if (intent.kind === "join" && intent.code) {
      const { data, error } = await sb.rpc("accept_invite", { p_code: intent.code, p_full_name: intent.full_name || meta.full_name || "", p_phone: intent.phone || meta.phone || null });
      store("fp_intent", null);
      if (error) toast(error.message); else store("fp_company", data);
    }
    const { data: cos } = await sb.rpc("my_companies");
    S.companies = cos || [];
    if (!S.companies.length) {
      if (intent.kind === "create" || !intent.kind) return wizard(1);
      return joinCode();
    }
    const want = store("fp_company"), pick = S.companies.find(c => c.company_id === want) || S.companies[0];
    await enter(pick.company_id);
  } finally { routing = false; }
}
export async function enter(cid) {
  await loadCompany(cid);
  gate.hidden = true; $("app").hidden = false; hideSplash();
  if (S.company.created_by === S.user.id && !S.company.logo_path && !store("fp_setup_done_" + cid) && S.trucks.length === 0) return wizard(2);
  const qp = new URLSearchParams(location.search);
  if (qp.has("join") || qp.has("qbo") || qp.has("v") || qp.has("chat")) history.replaceState(null, "", location.pathname);
  if (qp.get("qbo")) go("integrations"); else if (qp.get("chat")) go("thread", { id: qp.get("chat") }); else go(qp.get("v") || "home");
  startChat(); refreshPush();
}
sb.auth.onAuthStateChange((evt, session) => {
  if (evt === "PASSWORD_RECOVERY") return newPassword();
  if (evt === "SIGNED_OUT") { S.user = null; welcome(); return; }
  if (evt === "INITIAL_SESSION" || evt === "SIGNED_IN") setTimeout(() => { if (!S.company || !session || S.user?.id !== session.user.id) route(session); }, 0);
});
function newPassword() {
  showGate(`${brand()}<h1>New password</h1><form id="npForm"><label class="field"><span>New password</span><input id="npPass" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn">Save</button><p class="msg" id="npMsg"></p></form>`);
  $("npForm").onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $("npPass").value }); if (error) msg("npMsg", error.message, "bad"); else { toast("Password saved"); history.replaceState(null, "", location.pathname); const { data } = await sb.auth.getSession(); route(data.session); } };
}

// ---------- company setup wizard ----------
const STEPS = 6;
const stepHead = (n, title, lead) => `<div class="steps">${Array.from({ length: STEPS }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>
  <div class="stepno">Step ${n} of ${STEPS}</div><h1 style="margin-top:6px">${esc(title)}</h1><p class="lead">${esc(lead)}</p>`;
const nav = (n, nextLabel = "Next", single) => `<button class="btn" type="submit" id="wzNext">${esc(nextLabel)}</button>${n > 2 ? `<button class="btn ghost" type="button" id="wzSkip">Skip for now</button>` : ""}<p class="msg" id="wzMsg"></p>`;

export async function wizard(n, opts = {}) {
  const next = k => opts.single ? (store("fp_setup_done_" + S.company.id, 1), enter(S.company.id).then(() => go("settings"))) : wizard(k);
  const co = S.company, intent = store("fp_intent") || {}, meta = (S.user && S.user.user_metadata) || {};
  if (n === 1) {
    showGate(`${stepHead(1, "Your company", "The basics. You can change all of this later.")}
      <form id="wz"><label class="field"><span>Company name</span><input id="wzName" required autocomplete="organization"></label>
      <label class="field"><span>Your name</span><input id="wzMe" required value="${esc(intent.full_name || meta.full_name || "")}"></label>
      <label class="field"><span>Province</span><select class="plain" id="wzProv">${["AB", "BC", "SK", "MB", "ON", "Other"].map(p => `<option>${p}</option>`).join("")}</select></label>
      ${nav(1)}</form>`);
    $("wz").onsubmit = async e => {
      e.preventDefault(); $("wzNext").disabled = true; msg("wzMsg", "Creating your company...");
      const prov = $("wzProv").value, tz = prov === "BC" ? "America/Vancouver" : prov === "SK" ? "America/Regina" : prov === "MB" ? "America/Winnipeg" : prov === "ON" ? "America/Toronto" : "America/Edmonton";
      const { data, error } = await sb.rpc("create_company", { p_name: $("wzName").value, p_full_name: $("wzMe").value, p_phone: intent.phone || meta.phone || null, p_province: prov, p_timezone: tz });
      if (error) { $("wzNext").disabled = false; msg("wzMsg", error.message, "bad"); return; }
      store("fp_intent", null);
      await loadCompany(data); wizard(2);
    };
    return;
  }
  if (n === 2) {
    let theme = co.theme || "steelcap", accent = co.accent || "", logoFile = null;
    const THEMES = [["steelcap", "Steelcap", "#0b0e10", "#00c2b2", "#e9ecef"], ["espresso", "Espresso", "#120b07", "#e3b873", "#f3ebdf"], ["steel", "Steel", "#0e1215", "#ff8a3d", "#eef2f4"], ["daylight", "Daylight", "#f4f2ee", "#1f4fd1", "#1a1d22"]];
    const SW = ["", "#00c2b2", "#e3b873", "#ff8a3d", "#f2c230", "#3fb36b", "#2f9bd6", "#1f4fd1", "#c8432b", "#9b6bd6"];
    showGate(`${stepHead(2, "Make it yours", "Your logo and colours show up for your whole crew.")}
      <form id="wz"><div class="label">Logo</div>
      <button type="button" class="logodrop" id="wzLogo">${co.logo_path ? `<img src="${esc(logoUrl(co.logo_path))}" alt="Logo">` : `${svg("camera")} Add your logo`}</button>
      <input type="file" id="wzLogoIn" accept="image/*" hidden>
      <div class="label" style="margin-top:22px">Look</div>
      <div class="themes">${THEMES.map(t => `<button type="button" class="themecard" data-theme-pick="${t[0]}" aria-pressed="${theme === t[0]}"><span class="sw" style="background:${t[2]}"><i style="background:${t[3]}; width:60%"></i><i style="background:${t[4]}; opacity:.5; width:85%"></i></span><b>${t[1]}</b></button>`).join("")}</div>
      <div class="label" style="margin-top:22px">Accent colour</div>
      <div class="swatches">${SW.map(c => `<button type="button" class="swatch" data-acc="${c}" aria-pressed="${accent === c}" aria-label="${c || "Default"}" style="background:${c || "conic-gradient(#e3b873 0 33%, #ff8a3d 0 66%, #1f4fd1 0)"}"></button>`).join("")}</div>
      <div style="margin-top:26px">${nav(2)}</div></form>`);
    applyTheme(theme, accent);
    $("wzLogo").onclick = () => $("wzLogoIn").click();
    $("wzLogoIn").onchange = () => { logoFile = $("wzLogoIn").files[0]; if (logoFile) $("wzLogo").innerHTML = `<img src="${URL.createObjectURL(logoFile)}" alt="Logo">`; };
    gate.querySelectorAll("[data-theme-pick]").forEach(b => b.onclick = () => { theme = b.dataset.themePick; gate.querySelectorAll("[data-theme-pick]").forEach(x => x.setAttribute("aria-pressed", x === b)); applyTheme(theme, accent); });
    gate.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { accent = b.dataset.acc; gate.querySelectorAll("[data-acc]").forEach(x => x.setAttribute("aria-pressed", x === b)); applyTheme(theme, accent); });
    $("wz").onsubmit = async e => {
      e.preventDefault(); $("wzNext").disabled = true; msg("wzMsg", "Saving...");
      const upd = { theme, accent: accent || null };
      if (logoFile) {
        const ext = (logoFile.type.split("/")[1] || "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
        const path = `${co.id}/logo-${Date.now()}.${ext}`;
        const { error } = await sb.storage.from("logos").upload(path, logoFile, { contentType: logoFile.type, upsert: true });
        if (!error) upd.logo_path = path; else toast("Logo didn't upload. You can add it later in Settings.");
      }
      await sb.from("companies").update(upd).eq("id", co.id);
      await loadCompany(co.id); next(3);
    };
    return;
  }
  if (n === 3) {
    const ps = co.pay_schedule || { type: "semi-monthly" };
    showGate(`${stepHead(3, "Pay schedule", "So the crew can see paydays and cut-offs on their calendar, and stop asking you.")}
      <form id="wz"><label class="field"><span>How often do you pay?</span><select class="plain" id="wzType">
        <option value="semi-monthly">Twice a month</option><option value="biweekly">Every two weeks</option><option value="weekly">Every week</option></select></label>
      <div id="wzSemi"><label class="field"><span>Paydays</span><select class="plain" id="wzDays"><option value="1,15">1st and 15th</option><option value="15,0">15th and last day of the month</option><option value="5,20">5th and 20th</option><option value="10,25">10th and 25th</option></select></label></div>
      <div id="wzBi" hidden><label class="field"><span>A recent payday</span><input type="date" id="wzAnchor"></label>
      <label class="field"><span>Cut-off is how many days before payday?</span><input type="number" id="wzLag" min="0" max="20" value="5" inputmode="numeric"></label></div>
      <p class="msg" style="margin-top:0">Twice a month means cut-offs on the 15th and the last day of the month. Paydays that land on a weekend or stat holiday move to the business day before.</p>
      ${nav(3)}</form>`);
    $("wzType").value = ps.type || "semi-monthly";
    if (ps.paydays) $("wzDays").value = ps.paydays.join(",");
    if (ps.anchor) $("wzAnchor").value = ps.anchor; if (ps.lag_days != null) $("wzLag").value = ps.lag_days;
    const sync = () => { const semi = $("wzType").value === "semi-monthly"; $("wzSemi").hidden = !semi; $("wzBi").hidden = semi; };
    $("wzType").onchange = sync; sync();
    $("wzSkip").onclick = () => next(4);
    $("wz").onsubmit = async e => {
      e.preventDefault();
      const type = $("wzType").value;
      const sched = type === "semi-monthly" ? { type, paydays: $("wzDays").value.split(",").map(Number) } : { type, anchor: $("wzAnchor").value, lag_days: Number($("wzLag").value || 5) };
      if (type !== "semi-monthly" && !sched.anchor) { msg("wzMsg", "Pick a recent payday so we can line up the schedule.", "bad"); return; }
      await sb.from("companies").update({ pay_schedule: sched }).eq("id", co.id);
      await loadCompany(co.id); next(4);
    };
    return;
  }
  if (n === 4 || n === 5) {
    const isT = n === 4, table = isT ? "trucks" : "clients";
    const list = () => (isT ? S.trucks : S.clients).map(r => `<div class="rowitem"><span class="t">${esc(isT ? r.unit : r.name)}${isT && (r.rate_hour || r.description) ? `<small>${[r.description, r.rate_hour ? "$" + r.rate_hour + "/hr" : ""].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</span><button type="button" class="x" data-del="${r.id}" aria-label="Remove">×</button></div>`).join("") || `<p class="empty">${isT ? "No trucks yet." : "No clients yet."}</p>`;
    showGate(`${stepHead(n, isT ? "Your trucks" : "Your clients", isT ? "Add each unit. Pre-Trips and field tickets get tied to them." : "Who you work for. Field tickets and invoice drafts get sorted by client.")}
      <form id="wz"><div class="rowlist" id="wzList">${list()}</div>
      <div class="addrow"><input id="wzAdd" placeholder="${isT ? "Unit, e.g. 003" : "Client name"}" autocomplete="off">${isT ? `<input id="wzRate" placeholder="$/hr" inputmode="decimal" style="flex:0 0 90px">` : ""}<button type="button" id="wzAddBtn">Add</button></div>
      <div style="margin-top:26px">${nav(n)}</div></form>`);
    const add = async () => {
      const v = $("wzAdd").value.trim(); if (!v) return;
      const row = isT ? { company_id: co.id, unit: v, rate_hour: Number($("wzRate").value) || null } : { company_id: co.id, name: v };
      const { error } = await sb.from(table).insert(row); if (error) { toast(error.message); return; }
      $("wzAdd").value = ""; if (isT) $("wzRate").value = "";
      await loadCompany(co.id); $("wzList").innerHTML = list(); $("wzAdd").focus();
    };
    $("wzAddBtn").onclick = add;
    $("wzAdd").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); add(); } };
    $("wzList").onclick = async e => { const b = e.target.closest("[data-del]"); if (!b) return; await sb.from(table).delete().eq("id", b.dataset.del); await loadCompany(co.id); $("wzList").innerHTML = list(); };
    $("wzSkip").onclick = () => next(n + 1);
    $("wz").onsubmit = e => { e.preventDefault(); if ($("wzAdd").value.trim()) add().then(() => next(n + 1)); else next(n + 1); };
    return;
  }
  if (n === 6) {
    let { data: inv } = await sb.from("invites").select("*").eq("company_id", co.id).is("max_uses", null).eq("role", "crew").gt("expires_at", new Date().toISOString()).limit(1);
    inv = inv && inv[0];
    if (!inv) { const r = await sb.from("invites").insert({ company_id: co.id, role: "crew", max_uses: null, expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), created_by: S.user.id }).select().single(); inv = r.data; }
    const link = location.origin + location.pathname + "?join=" + (inv ? inv.code : "");
    const text = `Join ${co.name} on ${CONFIG.product}: ${link} (code ${inv ? inv.code : ""})`;
    showGate(`${stepHead(6, "Invite your crew", "Send this to your guys. They tap the link, make an account, and they're on your crew.")}
      <div class="codebox"><div class="code">${esc(inv ? inv.code : "—")}</div><small>Crew code · works for everyone you send it to</small></div>
      <button class="btn" type="button" id="wzShare" style="margin-top:16px">${svg("send")} Send by text</button>
      <button class="btn ghost" type="button" id="wzCopy">Copy link</button>
      <p class="msg">Want someone to help run things? Make them an admin later in More › Team.</p>
      <button class="btn cream" type="button" id="wzDone" style="margin-top:20px">Finish setup</button>`);
    $("wzShare").onclick = async () => { if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else location.href = "sms:?&body=" + encodeURIComponent(text); };
    $("wzCopy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch (e) { toast(link); } };
    $("wzDone").onclick = () => { store("fp_setup_done_" + co.id, 1); enter(co.id); };
  }
}

// a company switcher for people on more than one crew
export function switchCompany() {
  sheet(`<h3>Switch company</h3><p>You're on more than one crew.</p><div class="hublist">${S.companies.map(c => `<button class="hub" type="button" data-co="${c.company_id}"><span class="ic">${svg("users")}</span><span class="t"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></span></button>`).join("")}
    <button class="hub" type="button" data-co="new"><span class="ic">${svg("plus")}</span><span class="t"><b>Start another company</b></span></button></div>`,
  el => el.onclick = e => { const b = e.target.closest("[data-co]"); if (!b) return; closeSheet(); if (b.dataset.co === "new") { S.company = null; wizard(1); } else enter(b.dataset.co); });
}
window.__fp = { wizard, switchCompany, enter };
