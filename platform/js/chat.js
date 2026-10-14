// Crew chat: group and private, photos, videos, files, links, realtime, pings.
import { sb, S, $, esc, toast, svg, view, go, isAdmin, iso, initials, first, nameOf, timeOf, sheet, closeSheet, uploadFile, signUrls, fileUrl, viewImage, IOS } from "./core.js";

const C = { threads: [], open: null, msgs: [], chan: null, pending: [] };
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const URL_RE = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/gi;
const linkify = t => esc(t).replace(URL_RE, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const titleOf = t => t.kind === "dm" ? (t.other_name || "Private chat") : (t.title || "Group");

export async function startChat() {
  await loadThreads();
  if (C.chan) sb.removeChannel(C.chan);
  C.chan = sb.channel("chat-" + S.user.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, p => onNew(p.new))
    .subscribe();
}
async function loadThreads() {
  const { data } = await sb.rpc("my_threads", { p_company: S.company.id });
  C.threads = data || [];
  const unread = C.threads.reduce((a, t) => a + (t.unread || 0), 0);
  const b = $("chatBadge"); if (b) { b.hidden = !unread; b.textContent = unread > 99 ? "99+" : unread; }
  if (navigator.setAppBadge) { try { unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge(); } catch (e) {} }
  const list = $("threads"); if (!list) return;
  list.innerHTML = C.threads.map(t => `<button class="thr${t.unread ? " unread" : ""}" type="button" data-thread="${t.id}">${t.kind === "group" ? `<span class="av grp">${svg("users")}</span>` : `<span class="av">${esc(initials(titleOf(t)))}</span>`}
    <span class="t"><span class="t1"><b>${esc(titleOf(t))}</b><time>${t.last_body ? timeOf(t.last_message_at) : ""}</time></span><span class="t2"><span class="pv">${esc(t.last_body || (t.everyone ? "Say hi to the crew" : "No messages yet"))}</span>${t.unread ? `<span class="ub">${t.unread}</span>` : ""}</span></span></button>`).join("") || '<p class="empty">No chats yet.</p>';
}

view("chat", { async render(main) {
  main.innerHTML = `<div class="chathead"><div><div class="eyebrow">${esc(S.company.name)}</div><h1 class="h1">Chat</h1></div><button class="newbtn" type="button" id="newChat">${svg("plus")}New</button></div><div class="threads" id="threads"></div>`;
  await loadThreads();
  $("threads").onclick = e => { const b = e.target.closest("[data-thread]"); if (b) go("thread", { id: b.dataset.thread }); };
  $("newChat").onclick = newChat;
} });

function newChat() {
  let mode = "dm";
  const ppl = S.people.filter(p => p.active && p.user_id !== S.user.id);
  const draw = el => {
    el.querySelector("#ncList").innerHTML = ppl.map(p => mode === "dm" ? `<button class="pick" type="button" data-dm="${p.user_id}"><span class="av">${esc(initials(p.full_name))}</span>${esc(p.full_name)}</button>`
      : `<label class="pick"><span class="av">${esc(initials(p.full_name))}</span>${esc(p.full_name)}<input type="checkbox" value="${p.user_id}"></label>`).join("") || '<p class="empty">Nobody else is on the crew yet.</p>';
    el.querySelector("#ncGrp").hidden = mode !== "group";
    el.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === mode));
  };
  sheet(`<h3>New chat</h3><div class="segtabs"><button type="button" data-mode="dm" aria-pressed="true">Private</button><button type="button" data-mode="group" aria-pressed="false">Group</button></div>
    <div id="ncGrp" hidden><label class="field"><span>Group name</span><input id="ncName" placeholder="e.g. Night crew"></label></div><div class="plist" id="ncList"></div>
    <div id="ncGrp2"><button class="btn" type="button" id="ncMake" hidden>Make group</button></div>`, el => {
    draw(el);
    el.onclick = async e => {
      const m = e.target.closest("[data-mode]"); if (m) { mode = m.dataset.mode; draw(el); el.querySelector("#ncMake").hidden = mode !== "group"; return; }
      const d = e.target.closest("[data-dm]");
      if (d) { const { data, error } = await sb.rpc("start_dm", { p_company: S.company.id, p_other: d.dataset.dm }); closeSheet(); if (error) return toast("Couldn't open that chat"); await loadThreads(); go("thread", { id: data }); }
      if (e.target.closest("#ncMake")) {
        const name = el.querySelector("#ncName").value.trim(), ids = [...el.querySelectorAll("input:checked")].map(i => i.value);
        if (!name || !ids.length) return toast("Name the group and pick people");
        const { data, error } = await sb.rpc("create_group", { p_company: S.company.id, p_title: name, p_members: ids }); closeSheet(); if (error) return toast("Couldn't make that group");
        await loadThreads(); go("thread", { id: data });
      }
    };
  });
}

view("thread", { tab: "chat", cls: "frame", noTabs: true, async render(main, p) {
  if (!C.threads.find(t => t.id === p.id)) await loadThreads();
  const t = C.threads.find(x => x.id === p.id); if (!t) return go("chat");
  C.open = t; C.msgs = []; C.pending = [];
  main.id = "main"; main.style.padding = "0";
  main.innerHTML = `<div style="display:flex; flex-direction:column; height:100%">
    <div class="thead"><button class="back" type="button" data-go="chat" aria-label="Back">${svg("left")}</button>${t.kind === "group" ? `<span class="av grp">${svg("users")}</span>` : `<span class="av">${esc(initials(titleOf(t)))}</span>`}
    <span class="tt"><b>${esc(titleOf(t))}</b><small>${t.kind === "group" ? "Group" : "Private"}</small></span></div>
    <div class="msgs" id="msgs"><p class="empty" style="text-align:center">Loading...</p></div>
    <div class="tray" id="tray" hidden></div>
    <form class="composer" id="composer"><button type="button" class="round" id="attach" aria-label="Attach">${svg("clip")}</button><input type="file" id="fileIn" multiple hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt">
    <textarea id="msgIn" rows="1" placeholder="Message"></textarea><button class="send" id="sendBtn" disabled aria-label="Send">${svg("send", 2.4)}</button></form></div>`;
  const { data } = await sb.from("chat_messages").select("*").eq("thread_id", t.id).order("created_at", { ascending: false }).limit(150);
  if (C.open !== t) return;
  C.msgs = (data || []).reverse();
  await signUrls(C.msgs.flatMap(m => (m.attachments || []).map(a => a.path)));
  render(true); markRead();
  const grow = () => { const x = $("msgIn"); x.style.height = "auto"; x.style.height = Math.min(140, x.scrollHeight) + "px"; $("sendBtn").disabled = !x.value.trim() && !C.pending.length; };
  $("msgIn").oninput = grow;
  $("msgIn").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !IOS && matchMedia("(pointer:fine)").matches) { e.preventDefault(); $("composer").requestSubmit(); } };
  $("attach").onclick = () => $("fileIn").click();
  $("fileIn").onchange = () => { [...$("fileIn").files].forEach(f => { if (f.size > 50 * 1048576) return toast(f.name + " is over 50 MB"); C.pending.push({ file: f, local: URL.createObjectURL(f) }); }); $("fileIn").value = ""; tray(); grow(); };
  $("tray").onclick = e => { const b = e.target.closest("[data-rm]"); if (b) { C.pending.splice(+b.dataset.rm, 1); tray(); grow(); } };
  $("composer").onsubmit = async e => {
    e.preventDefault();
    const body = $("msgIn").value.trim(), files = C.pending.map(x => x.file); if (!body && !files.length) return;
    $("msgIn").value = ""; C.pending = []; tray(); grow();
    const tmp = { id: "", pending: true, sender_id: S.user.id, body, created_at: new Date().toISOString(), attachments: files.map(f => ({ type: f.type, name: f.name, size: f.size, local: URL.createObjectURL(f) })) };
    C.msgs.push(tmp); render(true);
    try {
      const atts = []; for (const f of files) { const u = await uploadFile("chat", f); atts.push(u); }
      const { data: m, error } = await sb.from("chat_messages").insert({ thread_id: t.id, sender_id: S.user.id, body: body || null, attachments: atts }).select().single();
      if (error) throw error;
      C.msgs = C.msgs.filter(x => x !== tmp); if (!C.msgs.find(x => x.id === m.id)) { await signUrls(atts.map(a => a.path)); C.msgs.push(m); }
      render(true); sb.functions.invoke("push", { body: { mode: "chat", message_id: m.id } }).catch(() => {}); loadThreads();
    } catch (er) { C.msgs = C.msgs.filter(x => x !== tmp); render(); $("msgIn").value = body; grow(); toast("Didn't send. Check your signal."); }
  };
  $("msgs").onclick = async e => {
    const v = e.target.closest("[data-view]"); if (v) return viewImage(v.dataset.view);
    if (e.target.closest("a,video,button")) return;
    const row = e.target.closest("[data-mid]"); if (!row || !row.dataset.mid) return;
    const m = C.msgs.find(x => x.id === row.dataset.mid); if (!m || !(m.sender_id === S.user.id)) return;
    if (confirm("Delete this message?")) { await sb.from("chat_messages").delete().eq("id", m.id); C.msgs = C.msgs.filter(x => x.id !== m.id); render(); loadThreads(); }
  };
} });

function tray() {
  const el = $("tray"); if (!el) return; el.hidden = !C.pending.length;
  el.innerHTML = C.pending.map((x, i) => `<div>${x.file.type.startsWith("image/") ? `<img src="${x.local}" alt="">` : x.file.type.startsWith("video/") ? `<video src="${x.local}#t=0.1" muted playsinline></video>` : esc(x.file.name.slice(0, 18))}<button type="button" data-rm="${i}" aria-label="Remove">×</button></div>`).join("");
}
function att(a) {
  const url = fileUrl(a.path) || a.local || "";
  if ((a.type || "").startsWith("image/")) return `<img class="media" src="${esc(url)}" alt="${esc(a.name || "Photo")}" loading="lazy" data-view="${esc(url)}"${a.w ? ` style="aspect-ratio:${a.w}/${a.h}; height:auto"` : ""}>`;
  if ((a.type || "").startsWith("video/")) return `<video class="media" src="${esc(url)}#t=0.1" controls playsinline preload="metadata"></video>`;
  return `<a class="fileatt" href="${esc(url)}" target="_blank" rel="noopener" download="${esc(a.name || "file")}">${svg("file")}<span><b>${esc(a.name || "File")}</b><small>${a.size ? kb(a.size) : "File"}</small></span></a>`;
}
function linkCard(u) {
  let host = ""; try { host = new URL(u).hostname.replace(/^www\.|^m\./, ""); } catch (e) { return ""; }
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  const kind = /instagram\.com/.test(host) ? "Instagram" : /tiktok\.com/.test(host) ? "TikTok" : /facebook\.com|fb\.watch/.test(host) ? "Facebook" : yt ? "YouTube" : "";
  if (!kind) return "";
  return `<a class="linkcard" href="${esc(u)}" target="_blank" rel="noopener">${yt ? `<img src="https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg" alt="" loading="lazy">` : ""}<span class="lc">${svg("link")}<span>${kind}<small>${esc(host)}</small></span></span></a>`;
}
function render(jump) {
  const box = $("msgs"); if (!box) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120, group = C.open.kind === "group";
  let html = "", lastDay = "", prev = null;
  if (!C.msgs.length) html = `<p class="empty" style="text-align:center; margin-top:40px">${C.open.everyone ? "This chat has the whole crew in it." : "Say something."}</p>`;
  C.msgs.forEach((m, i) => {
    const d = iso(new Date(m.created_at));
    if (d !== lastDay) { html += `<div class="day">${d === iso(new Date()) ? "Today" : new Date(m.created_at).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</div>`; lastDay = d; prev = null; }
    if (!m.sender_id) { html += `<div class="sysmsg">${linkify(m.body || "")}<small>${timeOf(m.created_at)}</small></div>`; prev = null; return; }
    const me = m.sender_id === S.user.id, next = C.msgs[i + 1];
    const firstRun = !prev || prev.sender_id !== m.sender_id || new Date(m.created_at) - new Date(prev.created_at) > 300000;
    const lastRun = !next || next.sender_id !== m.sender_id || new Date(next.created_at) - new Date(m.created_at) > 300000;
    const links = (m.body || "").match(URL_RE) || [];
    html += `<div class="m${me ? " me" : ""}${m.pending ? " sending" : ""}" data-mid="${m.id || ""}">${!me && group ? `<span class="av${lastRun ? "" : " sp"}">${esc(initials(nameOf(m.sender_id)))}</span>` : ""}<div class="col">${!me && group && firstRun ? `<div class="who">${esc(nameOf(m.sender_id))}</div>` : ""}${(m.attachments || []).map(att).join("")}${links.map(linkCard).join("")}${m.body ? `<div class="bub">${linkify(m.body)}</div>` : ""}${lastRun ? `<span class="tm">${m.pending ? "Sending..." : timeOf(m.created_at)}</span>` : ""}</div></div>`;
    prev = m;
  });
  box.innerHTML = html;
  if (jump || atBottom) box.scrollTop = box.scrollHeight;
}
async function markRead() { if (!C.open) return; await sb.from("chat_members").update({ last_read_at: new Date().toISOString() }).eq("thread_id", C.open.id).eq("user_id", S.user.id); loadThreads(); }
async function onNew(m) {
  if (C.open && S.view === "thread" && m.thread_id === C.open.id) {
    if (!C.msgs.find(x => x.id === m.id) && m.sender_id !== S.user.id) { await signUrls((m.attachments || []).map(a => a.path)); C.msgs.push(m); render(); }
    if (!document.hidden) markRead();
  } else loadThreads();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.company) loadThreads(); });
