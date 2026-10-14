// Owner/admin screens: crew today, defects, dispatch, ticket approval + invoice drafts, receipts, team, settings, QuickBooks.
import { sb, S, $, esc, toast, msg, svg, view, go, back, head, isAdmin, isOwner, today, iso, dayLabel, money, num, fmtH, initials, first, nameOf,
  truckName, clientName, logoUrl, sheet, closeSheet, uploadFile, signUrls, fileUrl, viewImage, loadCompany, applyTheme, CONFIG } from "./core.js";

const guard = main => { if (!isAdmin()) { main.innerHTML = '<p class="empty">Only admins can see this.</p>'; return false; } return true; };
const sub = (title, to = "home") => `<div class="subhead" style="margin:calc(-1 * (var(--top) + 22px)) -24px 18px">${back(to)}<b style="font-size:17px">${esc(title)}</b></div>`;

// ---------- crew today ----------
view("crewtoday", { tab: "home", async render(main) {
  if (!guard(main)) return;
  const t = today();
  main.innerHTML = `${sub("Crew today")}<div class="counts" id="ctCounts"></div><div id="ctList" style="margin-top:14px"></div>`;
  const [f, k] = await Promise.all([
    sb.from("form_submissions").select("user_id,template_id,kind,defects").eq("company_id", S.company.id).eq("work_date", t),
    sb.from("tickets").select("user_id").eq("company_id", S.company.id).eq("work_date", t),
  ]);
  const daily = S.templates.filter(x => x.active && x.daily), crew = S.people.filter(p => p.active);
  const by = {}; (f.data || []).forEach(r => (by[r.user_id] = by[r.user_id] || new Set()).add(r.template_id));
  const tk = new Set((k.data || []).map(r => r.user_id));
  const anyDone = crew.filter(p => by[p.user_id]).length;
  $("ctCounts").innerHTML = `<div class="count ok"><b>${anyDone}</b><span>Sent forms today</span></div><div class="count bad"><b>${crew.length - anyDone}</b><span>Nothing yet</span></div>`;
  $("ctList").innerHTML = crew.map(p => `<div class="crow"><span class="av">${esc(initials(p.full_name))}</span><span class="t"><b>${esc(p.full_name || "No name")}</b><span class="pills">
    ${daily.map(d => `<span class="pill ${by[p.user_id] && by[p.user_id].has(d.id) ? "y" : "n"}">${esc(d.kind === "pretrip" ? "Pre-Trip" : d.kind === "toolbox" ? "Toolbox" : d.name)}</span>`).join("")}<span class="pill ${tk.has(p.user_id) ? "y" : "n"}">Ticket</span></span></span></div>`).join("") || '<p class="empty">No crew yet. Invite them from Team.</p>';
} });

// ---------- defects ----------
view("defects", { tab: "home", async render(main) {
  if (!guard(main)) return;
  main.innerHTML = `${sub("Truck defects")}<div id="dfList"></div>`;
  const { data } = await sb.from("form_submissions").select("*").eq("company_id", S.company.id).neq("defects", "[]").order("created_at", { ascending: false }).limit(80);
  const rows = data || [];
  await signUrls(rows.flatMap(r => (r.defects || []).flatMap(d => d.photos || [])));
  $("dfList").innerHTML = rows.map(r => `<div class="defcard${r.defect_fixed_at ? " fixed" : ""}"><div class="top"><div><div class="unit">Truck ${esc(truckName(r.truck_id) || "?")}</div><div class="meta">${esc(dayLabel(r.work_date))} · ${esc(nameOf(r.user_id))}</div></div>
    <button class="fixbtn${r.defect_fixed_at ? " done" : ""}" type="button" data-fix="${r.id}" data-on="${r.defect_fixed_at ? 1 : 0}">${r.defect_fixed_at ? "Fixed" : "Mark fixed"}</button></div>
    <ul>${(r.defects || []).map(d => `<li><span><b>${esc(d.item)}</b>${d.note ? ": " + esc(d.note) : ""}</span></li>`).join("")}</ul>
    <div class="defphotos">${(r.defects || []).flatMap(d => d.photos || []).map(p => fileUrl(p) ? `<img src="${esc(fileUrl(p))}" alt="Defect photo" data-big="${esc(fileUrl(p))}">` : "").join("")}</div></div>`).join("") || '<p class="empty">No defects reported. Trucks are good.</p>';
  $("dfList").onclick = async e => {
    const big = e.target.closest("[data-big]"); if (big) return viewImage(big.dataset.big);
    const b = e.target.closest("[data-fix]"); if (!b) return;
    const on = b.dataset.on === "1";
    await sb.from("form_submissions").update({ defect_fixed_at: on ? null : new Date().toISOString(), defect_fixed_by: on ? null : S.user.id }).eq("id", b.dataset.fix);
    go("defects");
  };
} });

// ---------- dispatch ----------
view("dispatch", { tab: "home", async render(main) {
  if (!guard(main)) return;
  const D = { truck: null, people: new Set() };
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  main.innerHTML = `${sub("Dispatch")}<p class="msg" style="margin-top:0">Pick who's going, type the orders, and their phones ping.</p>
    <div class="label" style="margin-top:14px">Crew</div><div class="pickrow" id="dpPeople">${S.people.filter(p => p.active).map(p => `<button type="button" class="chipbtn" data-person="${p.user_id}" aria-pressed="false">${esc(first(p.full_name) || "?")}</button>`).join("")}</div>
    <div class="label" style="margin-top:16px">Truck</div><div class="pickrow" id="dpTruck">${S.trucks.filter(x => x.active).map(x => `<button type="button" class="chipbtn" data-truck="${x.id}" aria-pressed="false">${esc(x.unit)}</button>`).join("")}</div>
    <div class="group"><label><span>Date</span><input type="date" id="dpDate" value="${iso(tm)}"></label><label><span>Start</span><input id="dpTime" placeholder="6:00 AM"></label>
      <label><span>Client</span><select id="dpClient"><option value="">—</option>${S.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
      <label><span>Site</span><input id="dpSite" placeholder="LSD or directions"></label><label><span>Contact</span><input id="dpContact" placeholder="Name and number"></label></div>
    <label class="field" style="margin-top:14px"><span>Orders</span><textarea id="dpNotes" placeholder="What to bring, what to do"></textarea></label>
    <button class="btn" type="button" id="dpSend">${svg("send")} Send orders</button><p class="msg" id="dpMsg"></p>
    <div class="section">Sent</div><div id="dpSent"></div>`;
  main.querySelectorAll("[data-person]").forEach(b => b.onclick = () => { const id = b.dataset.person; D.people.has(id) ? D.people.delete(id) : D.people.add(id); b.setAttribute("aria-pressed", D.people.has(id)); });
  main.querySelectorAll("[data-truck]").forEach(b => b.onclick = () => { D.truck = D.truck === b.dataset.truck ? null : b.dataset.truck; main.querySelectorAll("[data-truck]").forEach(x => x.setAttribute("aria-pressed", x.dataset.truck === D.truck)); });
  $("dpSend").onclick = async () => {
    if (!D.people.size) { msg("dpMsg", "Pick at least one person.", "bad"); return; }
    $("dpSend").disabled = true; msg("dpMsg", "Sending...");
    const { data, error } = await sb.from("dispatches").insert({ company_id: S.company.id, work_date: $("dpDate").value || null, start_time: $("dpTime").value.trim() || null, truck_id: D.truck,
      client_id: $("dpClient").value || null, site: $("dpSite").value.trim() || null, contact: $("dpContact").value.trim() || null, notes: $("dpNotes").value.trim() || null, created_by: S.user.id }).select().single();
    if (error) { $("dpSend").disabled = false; msg("dpMsg", error.message, "bad"); return; }
    await sb.from("dispatch_recipients").insert([...D.people].map(u => ({ dispatch_id: data.id, user_id: u })));
    sb.functions.invoke("push", { body: { mode: "dispatch", dispatch_id: data.id } }).catch(() => {});
    toast("Orders sent"); go("dispatch");
  };
  const { data } = await sb.from("dispatches").select("*, dispatch_recipients(user_id, ack_at)").eq("company_id", S.company.id).order("created_at", { ascending: false }).limit(20);
  $("dpSent").innerHTML = (data || []).map(d => `<div class="dsent"><div class="t1"><b>${esc([d.truck_id && "Truck " + truckName(d.truck_id), clientName(d.client_id), d.site].filter(Boolean).join(" · ") || "Orders")}</b><span class="dt">${esc(d.work_date ? dayLabel(d.work_date) : "")}</span></div>
    <div class="sub">${(d.dispatch_recipients || []).map(r => esc(first(nameOf(r.user_id))) + (r.ack_at ? " ✓" : "")).join(", ")}</div><button class="del" type="button" data-del="${d.id}">Delete</button></div>`).join("") || '<p class="empty">Nothing sent yet.</p>';
  $("dpSent").onclick = async e => { const b = e.target.closest("[data-del]"); if (!b || !confirm("Delete these orders?")) return; await sb.from("dispatches").delete().eq("id", b.dataset.del); go("dispatch"); };
} });

// ---------- all tickets: approve + invoice drafts ----------
view("alltickets", { tab: "tickets", async render(main, p) {
  if (!guard(main)) return;
  const status = p.status || "submitted";
  main.innerHTML = `${sub("Field tickets", "tickets")}<div class="segtabs" style="grid-template-columns:repeat(3,1fr)">${[["submitted", "To approve"], ["approved", "Approved"], ["invoiced", "Invoiced"]].map(([k, l]) => `<button type="button" data-go="alltickets" data-p='${JSON.stringify({ status: k })}' aria-pressed="${status === k}">${l}</button>`).join("")}</div>
    <div id="atTop"></div><div id="atList"></div>`;
  const { data } = await sb.from("tickets").select("*").eq("company_id", S.company.id).eq("status", status).order("work_date", { ascending: false }).limit(200);
  const rows = data || [];
  if (status === "submitted" && rows.length) $("atTop").innerHTML = `<button class="btn" type="button" id="atAll">${svg("check")} Approve all ${rows.length}</button>`;
  if (status === "approved" && rows.length) $("atTop").innerHTML = `<div class="banner">${S.company.qbo_connected ? `<b>${rows.length} approved tickets</b> ready to become invoice drafts in QuickBooks, one per client. Nothing gets sent to the client.` : `<b>Connect QuickBooks</b> in More › QuickBooks to turn these into invoice drafts automatically.`}</div>
    ${S.company.qbo_connected ? `<button class="btn" type="button" id="atInv" style="margin-top:12px">${svg("file")} Draft invoices in QuickBooks</button><p class="msg" id="atMsg"></p>` : ""}`;
  const byClient = {}; rows.forEach(r => (byClient[r.client_id || "none"] = byClient[r.client_id || "none"] || []).push(r));
  $("atList").innerHTML = Object.entries(byClient).map(([c, list]) => `<div class="section">${esc(c === "none" ? "No client picked" : clientName(c))} · ${fmtH(list.reduce((a, r) => a + Number(r.hours || 0), 0))} hrs</div>
    ${list.map(r => `<div class="inv-row"><span><b>${esc(nameOf(r.user_id))} · ${fmtH(r.hours)} hrs${r.helper_hours > 0 ? ` + ${fmtH(r.helper_hours)} helper` : ""}</b><small>${esc([dayLabel(r.work_date), r.truck_id && "Truck " + truckName(r.truck_id), r.site, r.afe && "AFE " + r.afe].filter(Boolean).join(" · "))}</small>${r.description ? `<small>${esc(r.description)}</small>` : ""}</span>
      ${status === "submitted" ? `<span style="display:flex; gap:6px"><button class="fixbtn" type="button" data-rej="${r.id}">Send back</button><button class="fixbtn done" type="button" data-ok="${r.id}">Approve</button></span>` : r.invoice_ref ? `<span class="tag ok">${esc(r.invoice_ref)}</span>` : ""}</div>`).join("")}`).join("") || '<p class="empty">Nothing here.</p>';
  $("atList").onclick = async e => {
    const ok = e.target.closest("[data-ok]"), rej = e.target.closest("[data-rej]");
    if (ok) { await sb.from("tickets").update({ status: "approved" }).eq("id", ok.dataset.ok); go("alltickets", p); }
    if (rej) { await sb.from("tickets").update({ status: "rejected" }).eq("id", rej.dataset.rej); go("alltickets", p); }
  };
  const all = $("atAll"); if (all) all.onclick = async () => { await sb.from("tickets").update({ status: "approved" }).in("id", rows.map(r => r.id)); toast("Approved"); go("alltickets", p); };
  const inv = $("atInv"); if (inv) inv.onclick = async () => {
    inv.disabled = true; msg("atMsg", "Building drafts in QuickBooks...");
    const { data: res, error } = await sb.functions.invoke("qbo", { body: { action: "draft_invoices", company_id: S.company.id, ticket_ids: rows.map(r => r.id) } });
    inv.disabled = false;
    if (error || !res || res.error) { msg("atMsg", (res && res.error) || "QuickBooks didn't take it. Try again.", "bad"); return; }
    toast(`${res.created} draft invoice${res.created === 1 ? "" : "s"} in QuickBooks`); go("alltickets", { status: "invoiced" });
  };
} });

// ---------- receipts ----------
const CATS = ["Fuel and Vehicle", "Repair and maintenance", "Job Materials", "Supplies", "Tools", "Travel", "Travel meals", "Meals and entertainment", "Office expenses", "Utilities", "Insurance", "Rent or lease payments", "Dues and Subscriptions", "Legal and professional fees", "Taxes and Licenses", "Advertising", "Bank charges", "Subcontractors", "Uncategorized Expense"];
view("receipts", { tab: "home", async render(main) {
  if (!guard(main)) return;
  let file = null;
  main.innerHTML = `${sub("Receipts")}<p class="msg" style="margin-top:0">Snap it, check it, save it. ${S.company.qbo_connected ? "It goes into QuickBooks as an expense with the photo attached." : "Connect QuickBooks in More to send these to your books."}</p>
    <button type="button" class="shot" id="rcShot">${svg("camera")}Snap or upload a receipt<small>Photo or PDF</small></button><input type="file" id="rcFile" accept="image/*,application/pdf" hidden>
    <div class="reading" id="rcReading" hidden><i></i>Reading the receipt...</div>
    <form id="rc" style="margin-top:14px"><div class="group">
      <label><span>Date</span><input type="date" id="rcDate" value="${today()}"></label><label><span>Vendor</span><input id="rcVendor" placeholder="Who you paid"></label>
      <label><span>Total $</span><input id="rcTotal" inputmode="decimal"></label><label><span>GST $</span><input id="rcGst" inputmode="decimal"></label>
      <label><span>Category</span><select id="rcCat">${CATS.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label><span>Paid personally</span><span class="switch"><input type="checkbox" id="rcMine"><i></i></span></label></div>
      <label class="field" style="margin-top:14px"><span>Note</span><input id="rcNote" placeholder="Optional"></label>
      <button class="btn" id="rcSave">Save receipt</button><p class="msg" id="rcMsg"></p></form>
    <div class="section">Recent</div><div id="rcList"></div>`;
  $("rcShot").onclick = () => $("rcFile").click();
  $("rcFile").onchange = async () => {
    file = $("rcFile").files[0]; $("rcFile").value = ""; if (!file) return;
    $("rcShot").innerHTML = file.type.startsWith("image/") ? `<img src="${URL.createObjectURL(file)}" alt="Receipt">` : `${svg("file")}${esc(file.name)}`;
    if (!file.type.startsWith("image/")) return;
    $("rcReading").hidden = false;
    const { readReceipt } = await import("./ai.js");
    const r = await readReceipt(file, "expense"); $("rcReading").hidden = true;
    if (!r) { msg("rcMsg", "Couldn't read it. Type it in.", "bad"); return; }
    if (r.date) $("rcDate").value = r.date; if (r.vendor) $("rcVendor").value = r.vendor; if (r.total) $("rcTotal").value = Number(r.total).toFixed(2);
    if (r.gst != null) $("rcGst").value = Number(r.gst).toFixed(2); if (r.category && CATS.includes(r.category)) $("rcCat").value = r.category;
    msg("rcMsg", "Check it, then save.", "ok");
  };
  $("rc").onsubmit = async e => {
    e.preventDefault();
    const total = num($("rcTotal").value); if (!(total > 0)) { msg("rcMsg", "Enter the total.", "bad"); return; }
    $("rcSave").disabled = true; msg("rcMsg", "Saving...");
    let path = null; if (file) { try { path = (await uploadFile("expenses", file)).path; } catch (er) { } }
    const { data, error } = await sb.from("expenses").insert({ company_id: S.company.id, created_by: S.user.id, exp_date: $("rcDate").value, vendor: $("rcVendor").value.trim() || null, total, gst: num($("rcGst").value),
      category: $("rcCat").value, paid_personally: $("rcMine").checked, notes: $("rcNote").value.trim() || null, receipt_path: path }).select().single();
    if (error) { $("rcSave").disabled = false; msg("rcMsg", error.message, "bad"); return; }
    if (S.company.qbo_connected) sb.functions.invoke("qbo", { body: { action: "post_expense", company_id: S.company.id, expense_id: data.id } }).then(r => { if (r.data && r.data.ok) toast("In QuickBooks"); }).catch(() => {});
    toast("Receipt saved"); go("receipts");
  };
  const { data } = await sb.from("expenses").select("*").eq("company_id", S.company.id).order("created_at", { ascending: false }).limit(40);
  const tag = r => r.qbo_status === "posted" ? '<span class="tag ok">In QuickBooks</span>' : r.qbo_status === "error" ? `<span class="tag bad" title="${esc(r.qbo_error || "")}">Needs a look</span>` : S.company.qbo_connected ? '<span class="tag warn">Sending</span>' : '<span class="tag none">Saved</span>';
  $("rcList").innerHTML = (data || []).map(r => `<div class="inv-row"><span><b>${esc(r.vendor || "Receipt")} · ${money(r.total)}</b><small>${esc(dayLabel(r.exp_date))} · ${esc(r.category || "")}${r.paid_personally ? " · paid personally" : ""}</small></span>${tag(r)}</div>`).join("") || '<p class="empty">No receipts yet.</p>';
} });

// ---------- team ----------
view("team", { tab: "more", async render(main) {
  if (!guard(main)) return;
  main.innerHTML = `${sub("Team & invites", "more")}<div class="section" style="margin-top:0">Invite</div>
    <div class="two" style="margin-top:10px"><button class="btn" type="button" id="tmCrew">Invite crew</button><button class="btn ghost" type="button" id="tmAdmin" style="margin-top:0">Invite an admin</button></div>
    <div class="section">Crew (${S.people.filter(p => p.active).length})</div><div id="tmList"></div>`;
  const role = r => ({ owner: '<span class="tag warn">Owner</span>', admin: '<span class="tag ok">Admin</span>', crew: '<span class="tag none">Crew</span>' }[r]);
  $("tmList").innerHTML = S.people.map(p => `<button class="line" type="button" data-person="${p.user_id}" style="${p.active ? "" : "opacity:.5"}"><span class="av">${esc(initials(p.full_name))}</span><span class="t">${esc(p.full_name || "No name")}<small>${esc(p.phone || "")}${p.active ? "" : " · removed"}</small></span>${role(p.role)}</button>`).join("");
  const invite = async r => {
    const { data, error } = await sb.from("invites").insert({ company_id: S.company.id, role: r, max_uses: r === "crew" ? null : 1, created_by: S.user.id, expires_at: new Date(Date.now() + (r === "crew" ? 365 : 14) * 86400000).toISOString() }).select().single();
    if (error) { toast(error.message); return; }
    const link = location.origin + location.pathname + "?join=" + data.code, text = `Join ${S.company.name} on ${CONFIG.product}: ${link} (code ${data.code})`;
    sheet(`<h3>${r === "crew" ? "Crew invite" : "Admin invite"}</h3><p>${r === "crew" ? "Send this to anyone on your crew. One code works for all of them." : "This one makes them an admin. Works once."}</p>
      <div class="codebox"><div class="code">${esc(data.code)}</div><small>${esc(link)}</small></div>
      <button class="btn" type="button" id="ivShare" style="margin-top:14px">${svg("send")} Send by text</button><button class="btn ghost" type="button" id="ivCopy">Copy</button>`, el => {
      el.querySelector("#ivShare").onclick = async () => { if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else location.href = "sms:?&body=" + encodeURIComponent(text); };
      el.querySelector("#ivCopy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch (e) {} };
    });
  };
  $("tmCrew").onclick = () => invite("crew"); $("tmAdmin").onclick = () => invite("admin");
  $("tmList").onclick = e => {
    const b = e.target.closest("[data-person]"); if (!b) return;
    const p = S.byId[b.dataset.person]; if (!p || p.user_id === S.user.id) return;
    sheet(`<h3>${esc(p.full_name)}</h3><p>${esc(p.role)}${p.phone ? " · " + esc(p.phone) : ""}</p><div class="hublist">
      ${p.role === "crew" ? `<button class="hub" type="button" data-act="admin"><span class="ic">${svg("shield")}</span><span class="t"><b>Make admin</b><small>Can dispatch, approve tickets, see the books</small></span></button>` : ""}
      ${p.role === "admin" ? `<button class="hub" type="button" data-act="crew"><span class="ic">${svg("users")}</span><span class="t"><b>Make crew</b><small>Remove admin access</small></span></button>` : ""}
      ${p.role !== "owner" ? `<button class="hub" type="button" data-act="${p.active ? "remove" : "restore"}"><span class="ic">${svg(p.active ? "x" : "plus")}</span><span class="t"><b>${p.active ? "Remove from crew" : "Bring back"}</b><small>${p.active ? "They lose access right away" : "Give their access back"}</small></span></button>` : ""}
      <button class="hub" type="button" data-act="doc"><span class="ic">${svg("file")}</span><span class="t"><b>Add a ticket for them</b><small>H2S, First Aid and the rest</small></span></button></div>`, el => el.onclick = async ev => {
      const a = ev.target.closest("[data-act]"); if (!a) return;
      if (a.dataset.act === "doc") { const { docSheet } = await import("./views.js"); return docSheet(p.user_id, () => go("team")); }
      const upd = a.dataset.act === "admin" ? { role: "admin" } : a.dataset.act === "crew" ? { role: "crew" } : a.dataset.act === "remove" ? { active: false } : { active: true };
      const { error } = await sb.from("members").update(upd).eq("company_id", S.company.id).eq("user_id", p.user_id);
      closeSheet(); if (error) { toast(error.message); return; }
      await loadCompany(S.company.id); toast("Saved"); go("team");
    });
  };
} });

// ---------- settings ----------
view("settings", { tab: "more", async render(main) {
  if (!guard(main)) return;
  const co = S.company;
  const hub = (act, ic, t, s) => `<button class="hub" type="button" data-set="${act}"><span class="ic">${svg(ic)}</span><span class="t"><b>${t}</b><small>${s}</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>`;
  main.innerHTML = `${sub("Company settings", "more")}<div class="hublist">
    ${hub("look", "camera", "Logo and look", "Theme, accent colour, logo")}${hub("pay", "dollar", "Pay schedule", (co.pay_schedule || {}).type || "semi-monthly")}
    ${hub("trucks", "truck", "Trucks", S.trucks.length + " units")}${hub("clients", "users", "Clients", S.clients.length + " clients")}${hub("forms", "shield", "Safety forms", S.templates.filter(t => t.active).length + " active")}
    ${hub("details", "gear", "Company details", co.name)}</div>`;
  main.onclick = e => {
    const b = e.target.closest("[data-set]"); if (!b) return;
    const a = b.dataset.set;
    if (a === "look") return window.__fp.wizard(2, { single: true });
    if (a === "pay") return window.__fp.wizard(3, { single: true });
    if (a === "trucks") return window.__fp.wizard(4, { single: true });
    if (a === "clients") return window.__fp.wizard(5, { single: true });
    if (a === "forms") return go("formsettings");
    if (a === "details") return sheet(`<h3>Company details</h3><label class="field"><span>Name</span><input id="cdName" value="${esc(co.name)}"></label><label class="field"><span>GST number</span><input id="cdGst" value="${esc(co.gst_number || "")}"></label><button class="btn" type="button" id="cdSave">Save</button>`, el => el.querySelector("#cdSave").onclick = async () => { await sb.from("companies").update({ name: el.querySelector("#cdName").value.trim() || co.name, gst_number: el.querySelector("#cdGst").value.trim() || null }).eq("id", co.id); await loadCompany(co.id); closeSheet(); toast("Saved"); go("settings"); });
  };
} });

view("formsettings", { tab: "more", async render(main) {
  if (!guard(main)) return;
  main.innerHTML = `${sub("Safety forms", "settings")}<p class="msg" style="margin-top:0">Turn forms on or off, and choose which ones are due every day.</p><div id="fsList"></div>
    <button class="btn ghost" type="button" id="fsAdd" style="margin-top:16px">${svg("plus")} Add a custom checklist</button>`;
  const draw = () => $("fsList").innerHTML = S.templates.map(t => `<div class="setrow"><span>${esc(t.name)}<small>${t.kind === "custom" ? (t.schema.fields || []).find(f => f.type === "checklist")?.items.length + " items" : t.kind}</small></span>
    <span style="display:flex; gap:14px; align-items:center"><label style="display:flex; gap:6px; align-items:center; font-size:12px; color:var(--muted)">Daily<span class="switch"><input type="checkbox" data-daily="${t.id}"${t.daily ? " checked" : ""}><i></i></span></label>
    <label style="display:flex; gap:6px; align-items:center; font-size:12px; color:var(--muted)">On<span class="switch"><input type="checkbox" data-active="${t.id}"${t.active ? " checked" : ""}><i></i></span></label></span></div>`).join("");
  draw();
  $("fsList").onchange = async e => {
    const d = e.target.dataset.daily, a = e.target.dataset.active;
    if (d) await sb.from("form_templates").update({ daily: e.target.checked }).eq("id", d);
    if (a) await sb.from("form_templates").update({ active: e.target.checked }).eq("id", a);
    await loadCompany(S.company.id); toast("Saved");
  };
  $("fsAdd").onclick = () => sheet(`<h3>Custom checklist</h3><p>One item per line. Crew tap OK or Defect for each.</p>
    <label class="field"><span>Name</span><input id="cfName" placeholder="e.g. Skid steer walk-around"></label><label class="field"><span>Items</span><textarea id="cfItems" placeholder="Bucket and pins\nHydraulic hoses\nTracks"></textarea></label>
    <label class="setrow" style="border:0"><span>Ask which truck</span><span class="switch"><input type="checkbox" id="cfTruck" checked><i></i></span></label>
    <button class="btn" type="button" id="cfSave">Add form</button>`, el => el.querySelector("#cfSave").onclick = async () => {
    const name = el.querySelector("#cfName").value.trim(), items = el.querySelector("#cfItems").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (!name || !items.length) { toast("Give it a name and at least one item"); return; }
    await sb.from("form_templates").insert({ company_id: S.company.id, kind: "custom", name, daily: false, sort: 10 + S.templates.length,
      schema: { truck: el.querySelector("#cfTruck").checked, fields: [{ id: "checks", label: "Checklist", type: "checklist", items }, { id: "notes", label: "Notes", type: "textarea" }] } });
    await loadCompany(S.company.id); closeSheet(); toast("Form added"); go("formsettings");
  });
} });

// ---------- QuickBooks ----------
view("integrations", { tab: "more", async render(main, p) {
  if (!guard(main)) return;
  const co = S.company;
  await loadCompany(co.id);
  main.innerHTML = `${sub("QuickBooks", "more")}
    <div class="paycard"><div class="k">QuickBooks Online</div><div class="big" style="font-size:30px">${S.company.qbo_connected ? "Connected" : "Not connected"}</div>
    ${S.company.qbo_connected ? `<p class="msg">${esc(S.company.qbo_company_name || "")}</p>` : `<p class="msg">Connect once. Approved tickets become invoice drafts, and receipts become expenses with the photo attached. Nothing is ever sent to a client without you.</p>`}</div>
    ${S.company.qbo_connected ? `<div class="section">Match your clients</div><p class="msg">Pick the QuickBooks customer for each client so invoices land in the right place.</p><div id="qbMap"><p class="empty">Loading QuickBooks customers...</p></div>
      <button class="btn ghost" type="button" id="qbOff" style="margin-top:20px">Disconnect</button>` : `<button class="btn" type="button" id="qbOn" style="margin-top:18px">${svg("link")} Connect QuickBooks</button>`}<p class="msg" id="qbMsg"></p>`;
  const on = $("qbOn"); if (on) on.onclick = async () => {
    on.disabled = true; msg("qbMsg", "Opening QuickBooks...");
    const { data, error } = await sb.functions.invoke("qbo", { body: { action: "connect_url", company_id: co.id, return_to: location.origin + location.pathname } });
    on.disabled = false;
    if (error || !data || !data.url) { msg("qbMsg", (data && data.error) || "QuickBooks connection isn't switched on yet.", "bad"); return; }
    location.href = data.url;
  };
  const off = $("qbOff"); if (off) off.onclick = async () => { if (!confirm("Disconnect QuickBooks?")) return; await sb.functions.invoke("qbo", { body: { action: "disconnect", company_id: co.id } }); await loadCompany(co.id); go("integrations"); };
  if (S.company.qbo_connected) {
    const { data } = await sb.functions.invoke("qbo", { body: { action: "customers", company_id: co.id } });
    const cust = (data && data.customers) || [];
    $("qbMap").innerHTML = S.clients.map(c => `<div class="setrow"><span>${esc(c.name)}</span><select class="plain" style="max-width:55%; height:44px" data-map="${c.id}"><option value="">Create new in QuickBooks</option>${cust.map(q => `<option value="${esc(q.id)}"${c.qbo_customer_id === q.id ? " selected" : ""}>${esc(q.name)}</option>`).join("")}</select></div>`).join("") || '<p class="empty">Add clients in Settings first.</p>';
    $("qbMap").onchange = async e => { const id = e.target.dataset.map; if (!id) return; await sb.from("clients").update({ qbo_customer_id: e.target.value || null }).eq("id", id); await loadCompany(co.id); toast("Saved"); };
  }
} });
