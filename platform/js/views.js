// Crew screens: home, safety forms, tickets, hours & pay, documents, the More hub.
import { sb, S, $, esc, store, toast, msg, svg, view, go, back, head, isAdmin, today, iso, dayLabel, money, num, fmtH, initials, first, nameOf,
  truckName, clientName, logoUrl, sheet, closeSheet, uploadFile, signUrls, fileUrl, viewImage, payEvents, nextPay, nice, CONFIG } from "./core.js";
import "./admin.js";
import "./ai.js";
import { pushRow, enablePush } from "./push.js";

const mine = (rows) => rows.filter(r => r.user_id === S.user.id);
const dailyTemplates = () => S.templates.filter(t => t.active && t.daily);
export function periodOf(d = new Date()) {
  const sched = S.company.pay_schedule || {};
  if (sched.type === "biweekly" || sched.type === "weekly") {
    const back = new Date(d); back.setDate(back.getDate() - 40); const fwd = new Date(d); fwd.setDate(fwd.getDate() + 40);
    const cuts = [...payEvents(sched, back, fwd).cutoffs].sort(), k = iso(d);
    const end = cuts.find(c => c >= k) || k, prev = cuts.filter(c => c < k).pop();
    const s = prev ? new Date(prev + "T00:00:00") : new Date(d); s.setDate(s.getDate() + 1);
    return { s: iso(s), e: end };
  }
  return d.getDate() <= 15 ? { s: iso(new Date(d.getFullYear(), d.getMonth(), 1)), e: iso(new Date(d.getFullYear(), d.getMonth(), 15)) }
    : { s: iso(new Date(d.getFullYear(), d.getMonth(), 16)), e: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
const brandTop = () => `<div class="topbar">${S.company.logo_path ? `<img class="co-logo" src="${esc(logoUrl(S.company.logo_path))}" alt="${esc(S.company.name)}">` : `<span class="co-name">${esc(S.company.name)}</span>`}
  <button class="avatar" type="button" id="meBtn" aria-label="Account">${esc(initials(S.me?.full_name || S.user.email))}</button></div>`;

// ---------- account sheet ----------
export function accountSheet() {
  sheet(`<h3>${esc(S.me?.full_name || "Your account")}</h3><p>${esc(S.user.email)} · ${esc(S.me?.role || "")} at ${esc(S.company.name)}</p>
    <div id="pushBox"></div>
    <div class="setrow"><span>Your name<small>What the crew sees</small></span><button class="link" type="button" id="acName">Edit</button></div>
    ${S.companies.length > 1 || isAdmin() ? `<div class="setrow"><span>Company<small>${esc(S.company.name)}</small></span><button class="link" type="button" id="acSwitch">Switch</button></div>` : ""}
    <button class="btn ghost" type="button" id="acOut" style="margin-top:16px">${svg("logout")} Sign out</button>`, async el => {
    el.querySelector("#acOut").onclick = () => { closeSheet(); sb.auth.signOut(); };
    const sw = el.querySelector("#acSwitch"); if (sw) sw.onclick = () => window.__fp.switchCompany();
    el.querySelector("#acName").onclick = async () => {
      const n = prompt("Your name", S.me?.full_name || ""); if (!n) return;
      await sb.from("members").update({ full_name: n.trim() }).eq("company_id", S.company.id).eq("user_id", S.user.id);
      S.me.full_name = n.trim(); toast("Saved"); closeSheet(); go(S.view, S.params);
    };
    el.querySelector("#pushBox").innerHTML = await pushRow();
    el.querySelector("#pushBox").onclick = e => { if (e.target.closest("#pushOn")) enablePush(); };
  });
}
document.addEventListener("click", e => { if (e.target.closest("#meBtn")) accountSheet(); });

// ---------- HOME ----------
view("home", { cls: "", async render(main) {
  const t = today(), per = periodOf();
  const np = nextPay(S.company.pay_schedule);
  main.style.paddingTop = "0";
  main.innerHTML = `<div class="home-hero"></div><div style="position:relative">${brandTop()}
    <div class="greet"><div class="eyebrow">${esc(new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }))}</div>
    <h1>${new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"}, ${esc(first(S.me?.full_name) || "there")}</h1>
    <p id="hSub">Here's what's on today.</p></div>
    <div class="tiles" id="hTiles"></div>
    <div class="band"><div><div class="k">Hours this pay period</div><div class="v" id="hHours">–</div></div><div class="r"><div class="k">Next payday</div><div class="v" style="font-size:22px">${esc(nice(np.pay))}</div></div></div>
    <button class="btn" type="button" data-go="ticket" style="margin-top:20px">${svg("plus")} New field ticket</button>
    <button class="btn ghost" type="button" data-go="fuel">${svg("fuel")} Log fuel</button>
    <div id="hOrders"></div>
    <div id="hAdmin"></div>
    <button class="hub" type="button" data-go="ask" style="margin-top:22px"><span class="ic">${svg("spark")}</span><span class="t"><b>Ask ${esc(CONFIG.product)}</b><small>"Who hasn't done their Pre-Trip?" "What's fuel costing us?"</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>
  </div>`;
  const [subs, tks, ords] = await Promise.all([
    sb.from("form_submissions").select("kind,template_id,user_id").eq("company_id", S.company.id).eq("work_date", t),
    sb.from("tickets").select("hours,helper_hours,standby_hours,work_date,user_id").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", per.s).lte("work_date", per.e),
    sb.from("dispatch_recipients").select("ack_at, dispatches(*)").eq("user_id", S.user.id),
  ]);
  const done = new Set(mine(subs.data || []).map(r => r.template_id));
  const tkToday = (tks.data || []).some(r => r.work_date === t);
  const tiles = dailyTemplates().map(tp => ({ label: tp.kind === "pretrip" ? "Pre-Trip" : tp.kind === "toolbox" ? "Toolbox" : tp.name, done: done.has(tp.id), go: "form", p: { id: tp.id } }));
  tiles.push({ label: "Ticket", done: tkToday, go: "ticket", p: {} });
  const el = $("hTiles"); el.className = "tiles" + (tiles.length === 2 ? " two" : "");
  el.style.gridTemplateColumns = `repeat(${tiles.length === 4 ? 2 : Math.min(tiles.length, 3)}, minmax(0,1fr))`;
  el.innerHTML = tiles.map(x => `<button class="ftile${x.done ? " done" : ""}" type="button" data-go="${x.go}" data-p='${esc(JSON.stringify(x.p))}'>${svg(x.done ? "check" : "plus", x.done ? 2.8 : 1.9)}<span><b>${esc(x.label)}</b><small>${x.done ? "Done" : "To do"}</small></span></button>`).join("");
  const left = tiles.filter(x => !x.done).length;
  $("hSub").textContent = left ? `${left} thing${left > 1 ? "s" : ""} left for today.` : "All caught up today. Nice work.";
  $("hHours").innerHTML = `${fmtH((tks.data || []).reduce((a, r) => a + Number(r.hours || 0), 0))}<small> hrs</small>`;
  const orders = (ords.data || []).filter(o => o.dispatches && (!o.dispatches.work_date || o.dispatches.work_date >= t)).sort((a, b) => String(a.dispatches.work_date).localeCompare(String(b.dispatches.work_date))).slice(0, 3);
  $("hOrders").innerHTML = orders.map(o => { const d = o.dispatches; return `<div class="orders"><div class="when">${esc(d.work_date ? nice(d.work_date) : "Orders")}${d.start_time ? " · " + esc(d.start_time) : ""}</div>
    <h3>${esc([truckName(d.truck_id) && "Truck " + truckName(d.truck_id), clientName(d.client_id)].filter(Boolean).join(" · ") || "Marching orders")}</h3>
    <div class="kv">${d.site ? `<div class="wide"><span>Site</span><b>${esc(d.site)}</b></div>` : ""}${d.contact ? `<div class="wide"><span>Contact</span><b>${esc(d.contact)}</b></div>` : ""}</div>
    ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ""}
    ${o.ack_at ? `<div class="acked">${svg("check", 2.6)} Got it</div>` : `<button class="btn ack" type="button" data-ack="${d.id}">Got it</button>`}</div>`; }).join("");
  $("hOrders").onclick = async e => { const b = e.target.closest("[data-ack]"); if (!b) return; await sb.from("dispatch_recipients").update({ ack_at: new Date().toISOString() }).eq("dispatch_id", b.dataset.ack).eq("user_id", S.user.id); go("home"); };
  if (isAdmin()) {
    const crew = S.people.filter(p => p.active);
    const doneBy = new Set((subs.data || []).map(r => r.user_id));
    const { count: openDef } = await sb.from("form_submissions").select("id", { count: "exact", head: true }).eq("company_id", S.company.id).neq("defects", "[]").is("defect_fixed_at", null);
    $("hAdmin").innerHTML = `<div class="section">Running the crew</div><div class="hublist">
      <button class="hub" type="button" data-go="crewtoday"><span class="ic">${svg("users")}</span><span class="t"><b>Crew today</b><small>${doneBy.size} of ${crew.length} have done a form today</small></span></button>
      <button class="hub" type="button" data-go="defects"><span class="ic">${svg("alert")}</span><span class="t"><b>Truck defects</b><small>${openDef ? openDef + " open" : "Nothing open"}</small></span>${openDef ? `<span class="end">${openDef}</span>` : ""}</button>
      <button class="hub" type="button" data-go="dispatch"><span class="ic">${svg("megaphone")}</span><span class="t"><b>Dispatch</b><small>Send orders to the crew's phones</small></span></button>
      <button class="hub" type="button" data-go="alltickets"><span class="ic">${svg("ticket")}</span><span class="t"><b>Field tickets</b><small>Approve and send to QuickBooks</small></span></button>
      <button class="hub" type="button" data-go="receipts"><span class="ic">${svg("receipt")}</span><span class="t"><b>Receipts</b><small>Snap it, it goes to the books</small></span></button>
    </div>`;
  }
} });

// ---------- SAFETY ----------
view("safety", { async render(main) {
  const t = today(), start = new Date(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  main.innerHTML = `${head("Safety", "Daily forms")}<div class="week" id="sfWeek"></div><div class="fcards" id="sfCards"></div>
    <div class="section">Recent</div><div class="lines" id="sfRecent"></div>`;
  const { data } = await sb.from("form_submissions").select("id,kind,template_id,work_date,user_id,truck_id,site,defects,created_at").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", iso(start)).order("created_at", { ascending: false });
  const rows = data || [];
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return iso(d); });
  $("sfWeek").innerHTML = days.map(k => { const n = rows.filter(r => r.work_date === k).length, isT = k === t;
    return `<div><div class="d${isT ? " today-l" : ""}">${new Date(k + "T00:00:00").toLocaleDateString("en-CA", { weekday: "narrow" })}</div><div class="c${isT ? " today" : k > t ? " off" : ""}"><b>${new Date(k + "T00:00:00").getDate()}</b>${n ? `<i style="background:${isT ? "var(--on-acc)" : "var(--ok)"}"></i>` : ""}</div></div>`; }).join("");
  const done = new Set(rows.filter(r => r.work_date === t).map(r => r.template_id));
  $("sfCards").innerHTML = S.templates.filter(x => x.active).map(tp => `<button class="fcard${done.has(tp.id) ? " sent" : " due"}" type="button" data-go="form" data-p='${esc(JSON.stringify({ id: tp.id }))}' style="width:100%; text-align:left">
    <span class="ic">${svg(tp.kind === "pretrip" ? "truck" : tp.kind === "toolbox" ? "users" : "shield")}</span><span class="t"><b>${esc(tp.name)}</b><small>${done.has(tp.id) ? "Sent today" : tp.daily ? "Due today" : "As needed"}</small></span><span class="go">${done.has(tp.id) ? "Done" : svg("chev")}</span></button>`).join("") || '<p class="empty">No forms set up yet.</p>';
  $("sfRecent").innerHTML = rows.slice(0, 10).map(r => { const tp = S.templates.find(x => x.id === r.template_id); return `<div class="line"><span class="t">${esc(tp ? tp.name : r.kind)}<small>${esc(dayLabel(r.work_date))}${r.truck_id ? " · Truck " + esc(truckName(r.truck_id)) : ""}${r.site ? " · " + esc(r.site) : ""}</small></span>${(r.defects || []).length ? `<span class="tag bad">${r.defects.length} defect${r.defects.length > 1 ? "s" : ""}</span>` : `<span class="tag ok">Sent</span>`}</div>`; }).join("") || '<p class="empty">Nothing yet this week.</p>';
} });

// ---------- FILL A FORM ----------
view("form", { tab: "safety", async render(main, p) {
  const tp = S.templates.find(x => x.id === p.id); if (!tp) return go("safety");
  const sc = tp.schema || { fields: [] }, F = { truck: store("fp_last_truck"), checks: {}, defects: {}, photos: {}, multi: {} };
  if (!S.trucks.find(x => x.id === F.truck)) F.truck = null;
  const field = f => {
    if (f.type === "checklist") return `<div class="formsec"><div class="label">${esc(f.label)}</div><p class="msg" style="margin-top:4px">Tap OK or Defect for each one.</p>
      <div id="ck-${f.id}">${(f.items || []).map((it, i) => `<div class="chk"><span class="lbl">${esc(it)}</span><span class="okbad"><button type="button" class="ok" data-ck="${i}" data-v="ok" aria-pressed="false">OK</button><button type="button" class="bad" data-ck="${i}" data-v="bad" aria-pressed="false">Defect</button></span></div><div class="defbox" id="db-${i}" hidden><input placeholder="What's wrong with it?" data-note="${i}"><div class="ph"><button type="button" data-photo="${i}">${svg("camera")} Add photo</button><span id="pv-${i}"></span></div></div>`).join("")}</div>
      <button type="button" class="link" id="allOk" style="margin-top:12px">Mark everything else OK</button></div>`;
    if (f.type === "multi") return `<div class="formsec"><div class="label">${esc(f.label)}</div><div class="multi">${(f.options || []).map(o => `<button type="button" class="chipbtn" data-multi="${esc(f.id)}" data-o="${esc(o)}" aria-pressed="false">${esc(o)}</button>`).join("")}</div></div>`;
    if (f.type === "textarea") return `<label class="field formsec"><span>${esc(f.label)}</span><textarea data-f="${esc(f.id)}"${f.required ? " required" : ""}></textarea></label>`;
    return `<label class="field formsec"><span>${esc(f.label)}</span><input data-f="${esc(f.id)}" ${f.type === "number" ? 'inputmode="decimal"' : ""}${f.required ? " required" : ""}></label>`;
  };
  main.innerHTML = `<div class="subhead" style="margin:calc(-1 * (var(--top) + 22px)) -24px 18px">${back("safety")}<b style="font-size:17px">${esc(tp.name)}</b></div>
    <form id="ff">${sc.truck ? `<div class="label">Truck</div><div class="trucks" id="ffTruck">${S.trucks.filter(x => x.active).map(x => `<button type="button" data-truck="${x.id}" aria-pressed="${F.truck === x.id}">${esc(x.unit)}</button>`).join("") || '<p class="empty">No trucks added yet. Your boss can add them in Settings.</p>'}</div>` : ""}
    ${(sc.fields || []).map(field).join("")}
    <button class="btn" id="ffSend" style="margin-top:26px">Send ${esc(tp.name)}</button><p class="msg" id="ffMsg"></p></form>`;
  main.querySelectorAll("[data-truck]").forEach(b => b.onclick = () => { F.truck = b.dataset.truck; main.querySelectorAll("[data-truck]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  main.querySelectorAll("[data-ck]").forEach(b => b.onclick = () => { const i = b.dataset.ck; F.checks[i] = b.dataset.v; main.querySelectorAll(`[data-ck="${i}"]`).forEach(x => x.setAttribute("aria-pressed", x.dataset.v === F.checks[i])); $("db-" + i).hidden = F.checks[i] !== "bad"; if (F.checks[i] === "bad") main.querySelector(`[data-note="${i}"]`).focus(); });
  main.querySelectorAll("[data-multi]").forEach(b => b.onclick = () => { const k = b.dataset.multi; F.multi[k] = F.multi[k] || new Set(); const on = !F.multi[k].has(b.dataset.o); on ? F.multi[k].add(b.dataset.o) : F.multi[k].delete(b.dataset.o); b.setAttribute("aria-pressed", on); });
  const allOk = $("allOk"); if (allOk) allOk.onclick = () => main.querySelectorAll('[data-ck][data-v="ok"]').forEach(b => { if (!F.checks[b.dataset.ck]) b.click(); });
  const picker = document.createElement("input"); picker.type = "file"; picker.accept = "image/*"; picker.capture = "environment";
  main.querySelectorAll("[data-photo]").forEach(b => b.onclick = () => { picker.dataset.i = b.dataset.photo; picker.click(); });
  picker.onchange = () => { const f = picker.files[0], i = picker.dataset.i; picker.value = ""; if (!f) return; (F.photos[i] = F.photos[i] || []).push(f); $("pv-" + i).innerHTML = F.photos[i].map(x => `<img src="${URL.createObjectURL(x)}" alt="">`).join(""); };
  $("ff").onsubmit = async e => {
    e.preventDefault();
    if (sc.truck && !F.truck && S.trucks.length) { msg("ffMsg", "Tap your truck at the top.", "bad"); return; }
    const ckField = (sc.fields || []).find(f => f.type === "checklist");
    if (ckField) { const miss = ckField.items.filter((_, i) => !F.checks[i]); if (miss.length) { msg("ffMsg", `Still need: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? "…" : ""}`, "bad"); return; } }
    $("ffSend").disabled = true; msg("ffMsg", "Sending...");
    const data = {}, defects = [];
    main.querySelectorAll("[data-f]").forEach(i => data[i.dataset.f] = i.value.trim());
    Object.keys(F.multi).forEach(k => data[k] = [...F.multi[k]]);
    try {
      if (ckField) {
        data[ckField.id] = Object.fromEntries(ckField.items.map((it, i) => [it, F.checks[i]]));
        for (const [i, v] of Object.entries(F.checks)) if (v === "bad") {
          const photos = []; for (const f of (F.photos[i] || [])) { try { photos.push((await uploadFile("defects", f)).path); } catch (er) {} }
          defects.push({ item: ckField.items[i], note: main.querySelector(`[data-note="${i}"]`).value.trim(), photos });
        }
      }
      const row = { company_id: S.company.id, template_id: tp.id, kind: tp.kind, user_id: S.user.id, work_date: today(), truck_id: F.truck || null, site: data.site || null, data, defects };
      const { error } = await sb.from("form_submissions").insert(row);
      if (error) throw error;
      if (F.truck) store("fp_last_truck", F.truck);
      toast(defects.length ? `Sent. Your boss got the defect alert.` : `${tp.name} sent`);
      go("safety");
    } catch (er) { $("ffSend").disabled = false; msg("ffMsg", "Didn't send. Check your signal and try again.", "bad"); }
  };
} });

// ---------- TICKETS ----------
view("tickets", { async render(main) {
  main.innerHTML = `${head("Field tickets", "Your tickets")}<button class="btn" type="button" data-go="ticket" style="margin-top:20px">${svg("plus")} New field ticket</button>
    ${isAdmin() ? `<button class="btn ghost" type="button" data-go="alltickets">All crew tickets</button>` : ""}<div class="lines" id="tkList" style="margin-top:12px"></div>`;
  const { data } = await sb.from("tickets").select("*").eq("company_id", S.company.id).eq("user_id", S.user.id).order("work_date", { ascending: false }).limit(60);
  const tag = s => ({ submitted: '<span class="tag warn">Sent</span>', approved: '<span class="tag ok">Approved</span>', invoiced: '<span class="tag ok">Invoiced</span>', rejected: '<span class="tag bad">Fix it</span>' }[s] || "");
  $("tkList").innerHTML = (data || []).map(r => `<div class="line"><span class="t">${esc(dayLabel(r.work_date))} · ${fmtH(r.hours)} hrs<small>${esc([r.truck_id && "Truck " + truckName(r.truck_id), clientName(r.client_id), r.site].filter(Boolean).join(" · "))}</small></span>${tag(r.status)}</div>`).join("") || '<p class="empty">No tickets yet.</p>';
} });

view("ticket", { tab: "tickets", async render(main) {
  const last = store("fp_tk_last") || {};
  const T = { truck: S.trucks.find(x => x.id === last.truck) ? last.truck : null };
  const step = (id, label, val) => `<div class="stepper"><div class="label">${label}</div><div class="row"><button type="button" data-step="${id}" data-d="-0.5">−</button><input id="${id}" inputmode="decimal" value="${val}"><button type="button" data-step="${id}" data-d="0.5">+</button></div></div>`;
  main.innerHTML = `<div class="subhead" style="margin:calc(-1 * (var(--top) + 22px)) -24px 18px">${back("tickets")}<b style="font-size:17px">New field ticket</b></div>
    <form id="tk"><div class="label">Truck</div><div class="trucks" id="tkTruck">${S.trucks.filter(x => x.active).map(x => `<button type="button" data-truck="${x.id}" aria-pressed="${T.truck === x.id}">${esc(x.unit)}</button>`).join("") || '<p class="empty">No trucks set up.</p>'}</div>
    <div class="steppers">${step("tkHours", "Hours", last.hours || 10)}${step("tkHelper", "Helper hours", 0)}</div>
    <div class="group">
      <label><span>Date</span><input type="date" id="tkDate" value="${today()}"></label>
      <label><span>Client</span><select id="tkClient"><option value="">Pick one</option>${S.clients.filter(c => c.active).map(c => `<option value="${c.id}"${last.client === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label><span>Site / LSD</span><input id="tkSite" placeholder="e.g. 4-12-79-10 W6" value="${esc(last.site || "")}"></label>
      <label><span>AFE / PO</span><input id="tkAfe" placeholder="Optional"></label>
      <label><span>Cost code</span><input id="tkCode" placeholder="Optional"></label>
      <label><span>Site supervisor</span><input id="tkSup" placeholder="Optional" value="${esc(last.sup || "")}"></label>
      <label><span>Standby hrs</span><input id="tkStandby" inputmode="decimal" placeholder="0"></label>
    </div>
    <label class="field" style="margin-top:18px"><span>What you did</span><textarea id="tkDesc" placeholder="Lifts, moves, materials, anything the client needs to see"></textarea></label>
    <button class="btn" id="tkSend">Send ticket</button><p class="msg" id="tkMsg"></p></form>`;
  main.querySelectorAll("[data-truck]").forEach(b => b.onclick = () => { T.truck = b.dataset.truck; main.querySelectorAll("[data-truck]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  main.querySelectorAll("[data-step]").forEach(b => b.onclick = () => { const i = $(b.dataset.step); i.value = Math.max(0, (num(i.value) || 0) + Number(b.dataset.d)); });
  $("tk").onsubmit = async e => {
    e.preventDefault();
    if (S.trucks.length && !T.truck) { msg("tkMsg", "Tap your truck at the top.", "bad"); return; }
    const hours = num($("tkHours").value) || 0; if (!(hours > 0)) { msg("tkMsg", "Put in your hours.", "bad"); return; }
    $("tkSend").disabled = true; msg("tkMsg", "Sending...");
    const row = { company_id: S.company.id, user_id: S.user.id, work_date: $("tkDate").value || today(), truck_id: T.truck, client_id: $("tkClient").value || null,
      site: $("tkSite").value.trim() || null, afe: $("tkAfe").value.trim() || null, cost_code: $("tkCode").value.trim() || null, supervisor: $("tkSup").value.trim() || null,
      hours, helper_hours: num($("tkHelper").value) || 0, standby_hours: num($("tkStandby").value) || 0, description: $("tkDesc").value.trim() || null };
    const { error } = await sb.from("tickets").insert(row);
    if (error) { $("tkSend").disabled = false; msg("tkMsg", "Didn't send. Check your signal and try again.", "bad"); return; }
    store("fp_tk_last", { truck: T.truck, client: row.client_id, site: row.site, sup: row.supervisor, hours });
    toast("Ticket sent. Let's get this bag.");
    go("tickets");
  };
} });

// ---------- HOURS & PAY ----------
view("hours", { tab: "more", async render(main, p) {
  const now = new Date(), m = p.m ? new Date(p.m + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1);
  const per = periodOf(), np = nextPay(S.company.pay_schedule);
  const firstD = iso(m), lastD = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0));
  main.innerHTML = `${head("Hours & pay", "Your pay calendar")}
    <div class="paycard"><div class="k">This pay period · ${esc(dayLabel(per.s))} – ${esc(dayLabel(per.e))}</div><div class="big" id="hpBig">–<small>hrs</small></div>
    <div class="paynext"><div><b>${esc(nice(np.cut))}</b><span>Next cut-off</span></div><div><b>${esc(nice(np.pay))}</b><span>Next payday</span></div></div></div>
    <div class="monthbar"><h2>${esc(m.toLocaleDateString("en-CA", { month: "long", year: "numeric" }))}</h2><div class="arrows">
      <button class="round" type="button" data-go="hours" data-p='${JSON.stringify({ m: iso(new Date(m.getFullYear(), m.getMonth() - 1, 1)) })}' aria-label="Previous month">${svg("left")}</button>
      <button class="round" type="button" data-go="hours" data-p='${JSON.stringify({ m: iso(new Date(m.getFullYear(), m.getMonth() + 1, 1)) })}' aria-label="Next month">${svg("chev")}</button></div></div>
    <div class="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="cal" id="hpCal"></div>
    <div class="legend"><span><i class="sq">$</i>Payday</span><span><i class="ln"></i>Cut-off</span></div>
    <div class="section">Documents and tickets</div><div class="lines" id="hpDocs"></div>
    <button class="btn ghost" type="button" id="hpAdd" style="margin-top:12px">${svg("plus")} Add a ticket or certificate</button>`;
  const [tk, pk, docs] = await Promise.all([
    sb.from("tickets").select("work_date,hours").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", firstD).lte("work_date", lastD),
    sb.from("tickets").select("hours").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", per.s).lte("work_date", per.e),
    sb.from("documents").select("*").eq("company_id", S.company.id).eq("user_id", S.user.id).order("expiry_date", { ascending: true, nullsFirst: false }),
  ]);
  $("hpBig").innerHTML = `${fmtH((pk.data || []).reduce((a, r) => a + Number(r.hours || 0), 0))}<small>hrs</small>`;
  const hrs = {}; (tk.data || []).forEach(r => hrs[r.work_date] = (hrs[r.work_date] || 0) + Number(r.hours || 0));
  const ev = payEvents(S.company.pay_schedule, new Date(m.getFullYear(), m.getMonth(), 1), new Date(m.getFullYear(), m.getMonth() + 1, 0));
  const lead = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(), tk0 = today();
  let html = ""; for (let i = 0; i < lead; i++) html += "<div></div>";
  for (let d = 1; d <= days; d++) { const k = iso(new Date(m.getFullYear(), m.getMonth(), d)), v = hrs[k];
    html += `<div class="${(k === tk0 ? "t" : v ? "w" : k > tk0 ? "f" : "") + (ev.paydays.has(k) ? " pay" : "") + (ev.cutoffs.has(k) ? " cut" : "")}"><span class="n">${d}</span><span class="h">${v ? fmtH(v) : k === tk0 ? "today" : ""}</span><i></i></div>`; }
  $("hpCal").innerHTML = html;
  const st = d => { if (!d) return ["none", "No expiry"]; const left = Math.round((new Date(d + "T00:00:00") - new Date(tk0 + "T00:00:00")) / 86400000); return left < 0 ? ["bad", "Expired"] : left <= 30 ? ["warn", "Expires in " + left + "d"] : ["ok", "Valid"]; };
  $("hpDocs").innerHTML = (docs.data || []).map(d => { const [c, l] = st(d.expiry_date); return `<button class="line" type="button" data-doc="${esc(d.file_path || "")}"><span class="docic">${svg("file")}</span><span class="t">${esc(d.title || d.doc_type)}<small>${esc(d.doc_type)}${d.expiry_date ? " · expires " + esc(d.expiry_date) : ""}</small></span><span class="tag ${c}">${l}</span></button>`; }).join("") || '<p class="empty">Add your H2S, First Aid and other tickets. You\'ll get a heads-up before they expire.</p>';
  $("hpDocs").onclick = async e => { const b = e.target.closest("[data-doc]"); if (!b || !b.dataset.doc) return; await signUrls([b.dataset.doc]); const u = fileUrl(b.dataset.doc); if (u) window.open(u, "_blank"); };
  $("hpAdd").onclick = () => docSheet(S.user.id, () => go("hours", p));
} });

export function docSheet(userId, done) {
  const TYPES = ["H2S Alive", "Standard First Aid", "Ground Disturbance", "CSTS", "PST / OSSA", "WHMIS", "TDG", "Fall Protection", "Confined Space", "Driver's licence", "Crane / picker certification", "Other"];
  let file = null;
  sheet(`<h3>Add a ticket or certificate</h3><p>Snap a photo of the card. You'll get a reminder before it expires.</p>
    <label class="field"><span>Type</span><select class="plain" id="dsType">${TYPES.map(t => `<option>${t}</option>`).join("")}</select></label>
    <label class="field"><span>Expiry date</span><input type="date" id="dsExp"></label>
    <button type="button" class="logodrop" id="dsPick" style="height:90px">${svg("camera")} Photo or PDF</button><input type="file" id="dsFile" accept="image/*,application/pdf" hidden>
    <button class="btn" type="button" id="dsSave" style="margin-top:14px">Save</button><p class="msg" id="dsMsg"></p>`, el => {
    el.querySelector("#dsPick").onclick = () => el.querySelector("#dsFile").click();
    el.querySelector("#dsFile").onchange = () => { file = el.querySelector("#dsFile").files[0]; if (file) el.querySelector("#dsPick").textContent = file.name; };
    el.querySelector("#dsSave").onclick = async () => {
      msg("dsMsg", "Saving...");
      let path = null; if (file) { try { path = (await uploadFile("docs", file)).path; } catch (e) { msg("dsMsg", "Upload failed. Try again.", "bad"); return; } }
      const t = el.querySelector("#dsType").value;
      const { error } = await sb.from("documents").insert({ company_id: S.company.id, user_id: userId, doc_type: t, title: t, expiry_date: el.querySelector("#dsExp").value || null, file_path: path });
      if (error) { msg("dsMsg", error.message, "bad"); return; }
      closeSheet(); toast("Saved"); done && done();
    };
  });
}

// ---------- FUEL ----------
view("fuel", { tab: "more", async render(main) {
  const F = { truck: S.trucks.find(x => x.id === store("fp_last_truck")) ? store("fp_last_truck") : null, file: null };
  main.innerHTML = `<div class="subhead" style="margin:calc(-1 * (var(--top) + 22px)) -24px 18px">${back("home")}<b style="font-size:17px">Log fuel</b></div>
    <div class="label">Truck</div><div class="trucks">${S.trucks.filter(x => x.active).map(x => `<button type="button" data-truck="${x.id}" aria-pressed="${F.truck === x.id}">${esc(x.unit)}</button>`).join("")}</div>
    <button type="button" class="shot" id="fuShot">${svg("camera")}Snap the receipt<small>It reads the litres and cost for you</small></button><input type="file" id="fuFile" accept="image/*" capture="environment" hidden>
    <div class="reading" id="fuReading" hidden><i></i>Reading the receipt...</div>
    <form id="fu" style="margin-top:14px"><div class="group">
      <label><span>Date</span><input type="date" id="fuDate" value="${today()}"></label><label><span>Station</span><input id="fuStation" placeholder="Cardlock"></label>
      <label><span>Litres</span><input id="fuL" inputmode="decimal"></label><label><span>$ per litre</span><input id="fuP" inputmode="decimal"></label>
      <label><span>GST</span><input id="fuG" inputmode="decimal"></label><label><span>Total $</span><input id="fuT" inputmode="decimal"></label><label><span>Odometer</span><input id="fuO" inputmode="numeric"></label></div>
      <button class="btn" id="fuSave" style="margin-top:18px">Save fill-up</button><p class="msg" id="fuMsg"></p></form>
    <div class="section">${isAdmin() ? "Fuel by day" : "Your fill-ups"}</div><div id="fuList"></div>`;
  main.querySelectorAll("[data-truck]").forEach(b => b.onclick = () => { F.truck = b.dataset.truck; main.querySelectorAll("[data-truck]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  $("fuShot").onclick = () => $("fuFile").click();
  $("fuFile").onchange = async () => {
    const f = $("fuFile").files[0]; $("fuFile").value = ""; if (!f) return; F.file = f;
    $("fuShot").innerHTML = `<img src="${URL.createObjectURL(f)}" alt="Receipt">`; $("fuReading").hidden = false;
    const { readReceipt } = await import("./ai.js");
    const r = await readReceipt(f, "fuel");
    $("fuReading").hidden = true;
    if (r) { if (r.date) $("fuDate").value = r.date; if (r.vendor) $("fuStation").value = r.vendor; if (r.litres) $("fuL").value = r.litres; if (r.price_per_litre) $("fuP").value = r.price_per_litre; if (r.gst != null) $("fuG").value = Number(r.gst).toFixed(2); if (r.total) $("fuT").value = Number(r.total).toFixed(2);
      msg("fuMsg", r.total ? "Got it. Check the numbers, then save." : "Couldn't read all of it. Fill in what's missing.", r.total ? "ok" : "bad"); }
    else msg("fuMsg", "Couldn't read it. Type the numbers in.", "bad");
  };
  $("fu").onsubmit = async e => {
    e.preventDefault();
    if (S.trucks.length && !F.truck) { msg("fuMsg", "Tap the truck at the top.", "bad"); return; }
    const total = num($("fuT").value); if (!(total > 0)) { msg("fuMsg", "Enter the total.", "bad"); return; }
    $("fuSave").disabled = true; msg("fuMsg", "Saving...");
    let path = null; if (F.file) { try { path = (await uploadFile("fuel", F.file)).path; } catch (er) {} }
    const { error } = await sb.from("fuel_logs").insert({ company_id: S.company.id, user_id: S.user.id, truck_id: F.truck, fill_date: $("fuDate").value, station: $("fuStation").value.trim() || null,
      litres: num($("fuL").value), price_per_l: num($("fuP").value), gst: num($("fuG").value), total, odometer: $("fuO").value.trim() || null, receipt_path: path });
    if (error) { $("fuSave").disabled = false; msg("fuMsg", "Didn't save. Try again.", "bad"); return; }
    store("fp_last_truck", F.truck); toast("Fuel saved"); go("fuel");
  };
  const since = new Date(); since.setDate(since.getDate() - 31);
  const { data } = await sb.from("fuel_logs").select("*").eq("company_id", S.company.id).gte("fill_date", iso(since)).order("fill_date", { ascending: false }).limit(300);
  const rows = data || []; await signUrls(rows.map(r => r.receipt_path));
  const days = {}; rows.forEach(r => (days[r.fill_date] = days[r.fill_date] || []).push(r));
  $("fuList").innerHTML = Object.keys(days).map(k => { const l = days[k]; return `<div class="fday"><h3>${esc(dayLabel(k))}<b>${money(l.reduce((a, r) => a + Number(r.total || 0), 0))}</b></h3>
    ${l.map(r => `<div class="frow">${r.receipt_path && fileUrl(r.receipt_path) ? `<img src="${esc(fileUrl(r.receipt_path))}" alt="Receipt" data-big="${esc(fileUrl(r.receipt_path))}">` : `<span class="noimg">${svg("fuel")}</span>`}<span class="t"><b>Truck ${esc(truckName(r.truck_id) || "?")}${r.station ? " · " + esc(r.station) : ""}</b><small>${[r.litres ? Number(r.litres).toFixed(1) + " L" : "", isAdmin() ? first(nameOf(r.user_id)) : ""].filter(Boolean).map(esc).join(" · ")}</small></span><span class="amt">${money(r.total)}</span></div>`).join("")}</div>`; }).join("") || '<p class="empty">No fill-ups yet.</p>';
  $("fuList").onclick = e => { const b = e.target.closest("[data-big]"); if (b) viewImage(b.dataset.big); };
} });

// ---------- MORE ----------
view("more", { async render(main) {
  const hub = (go, ic, t, s) => `<button class="hub" type="button" data-go="${go}"><span class="ic">${svg(ic)}</span><span class="t"><b>${t}</b><small>${s}</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>`;
  main.innerHTML = `${head(S.company.name, "More")}
    <div class="hublist">${hub("hours", "clock", "Hours & pay", "Pay calendar, cut-offs, your tickets and certs")}${hub("fuel", "fuel", "Fuel", "Snap the cardlock receipt")}${hub("ask", "spark", "Ask " + esc(CONFIG.product), "Your AI office assistant")}</div>
    ${isAdmin() ? `<div class="section">Office</div><div class="hublist">
      ${hub("crewtoday", "users", "Crew today", "Who's done their forms")}${hub("defects", "alert", "Truck defects", "From Pre-Trips, with photos")}${hub("dispatch", "megaphone", "Dispatch", "Send orders to the crew")}
      ${hub("alltickets", "ticket", "Field tickets", "Approve, then draft invoices")}${hub("receipts", "receipt", "Receipts", "Into QuickBooks with the photo")}${hub("team", "users", "Team & invites", "Add crew, set admins")}
      ${hub("settings", "gear", "Company settings", "Logo, look, trucks, clients, forms, pay")}${hub("integrations", "link", "QuickBooks", S.company.qbo_connected ? "Connected" : "Connect your books")}</div>` : ""}
    <button class="btn ghost" type="button" id="moAcct" style="margin-top:24px">Account and notifications</button>`;
  $("moAcct").onclick = accountSheet;
} });
