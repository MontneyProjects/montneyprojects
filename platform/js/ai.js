// The built-in AI assistant, and receipt reading (AI first, on-phone text reading as a fallback).
import { sb, S, $, esc, toast, svg, view, isAdmin, iso, shrinkImage, CONFIG } from "./core.js";

const SUGS_ADMIN = ["Who hasn't done their Pre-Trip today?", "Any open truck defects?", "Whose tickets expire in the next 30 days?", "How many hours did we bill each client this pay period?", "What did fuel cost per truck this month?", "Write a toolbox talk on working near overhead lines"];
const SUGS_CREW = ["When's my next payday?", "How many hours do I have this pay period?", "When does my H2S expire?", "Write a toolbox talk on cold weather", "What hazards should go on an FLHA for a picker lift?"];
let history = [];

view("ask", { tab: "more", async render(main) {
  main.innerHTML = `<div class="pagehead"><div><div class="eyebrow">AI assistant</div><h1 class="h1">Ask ${esc(CONFIG.product)}</h1></div></div>
    <p class="msg" style="margin-top:8px">It knows your crew's forms, tickets, defects, certs and fuel${isAdmin() ? ", and receipts" : ""}. Ask it like you'd ask an office manager.</p>
    <div class="ai-msgs" id="aiMsgs"></div><div class="ai-sugs" id="aiSugs">${(isAdmin() ? SUGS_ADMIN : SUGS_CREW).map(s => `<button type="button">${esc(s)}</button>`).join("")}</div>
    <div style="height:90px"></div>
    <form class="aibar" id="aiForm"><input id="aiIn" placeholder="Ask anything about your crew" autocomplete="off"><button aria-label="Ask">${svg("send", 2.4)}</button></form>`;
  const box = $("aiMsgs");
  const draw = () => { box.innerHTML = history.map(h => `<div class="${h.role === "user" ? "ai-q" : "ai-a"}">${esc(h.content)}</div>`).join(""); $("aiSugs").hidden = history.length > 0; main.scrollTop = main.scrollHeight; };
  draw();
  const ask = async q => {
    if (!q.trim()) return;
    history.push({ role: "user", content: q.trim() }); draw();
    box.insertAdjacentHTML("beforeend", `<div class="ai-a" id="aiWait"><span class="reading" style="margin:0"><i></i>Thinking...</span></div>`); main.scrollTop = main.scrollHeight;
    const { data, error } = await sb.functions.invoke("ai", { body: { action: "ask", company_id: S.company.id, messages: history.slice(-10), today: iso(new Date()) } });
    $("aiWait")?.remove();
    history.push({ role: "assistant", content: error || !data || data.error ? ((data && data.error) || "I couldn't answer that right now. Try again in a minute.") : data.answer });
    draw();
  };
  $("aiSugs").onclick = e => { const b = e.target.closest("button"); if (b) ask(b.textContent); };
  $("aiForm").onsubmit = e => { e.preventDefault(); const q = $("aiIn").value; $("aiIn").value = ""; ask(q); };
} });

// ---------- receipts ----------
const toB64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(",")[1]); f.readAsDataURL(blob); });
export async function readReceipt(file, kind) {
  try {
    const s = await shrinkImage(file, 1600);
    const { data, error } = await sb.functions.invoke("ai", { body: { action: "receipt", company_id: S.company.id, kind, image_b64: await toB64(s.blob), media_type: s.type || "image/jpeg" } });
    if (!error && data && data.receipt) return data.receipt;
  } catch (e) {}
  return readOnPhone(file);   // fallback: read the text on the phone
}
let tess = null;
const loadTess = () => tess || (tess = new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; sc.onload = () => res(window.Tesseract); sc.onerror = rej; document.head.appendChild(sc); }));
const num = s => { const n = parseFloat(String(s).replace(/[,\s]/g, "").replace(/[^\d.]/g, "")); return isNaN(n) ? null : n; };
async function readOnPhone(file) {
  try {
    const T = await loadTess(); const r = await T.recognize(file, "eng"); const t = (r.data.text || "").replace(/\r/g, ""), up = t.toUpperCase(), out = {};
    const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
    let m = up.match(/(\d{1,4}[.,]\d{1,3})\s*(?:L\b|LTR|LITRE|LITER)/); if (m) out.litres = num(m[1].replace(",", "."));
    m = up.match(/(\d\.\d{3,4})\s*(?:\$?\s*\/\s*L|\/LTR|PER\s*L)/) || up.match(/@\s*\$?(\d\.\d{2,4})/); if (m) out.price_per_litre = num(m[1]);
    m = up.match(/GST[^\d\n]{0,20}(\d{1,4}[.,]\d{2})/); if (m) out.gst = num(m[1].replace(",", "."));
    const totals = []; lines.forEach(l => { const L = l.toUpperCase(); if (/TOTAL|AMOUNT|SALE|PURCHASE/.test(L) && !/SUB\s*TOTAL|GST|PST|TAX/.test(L)) { const mm = L.match(/(\d{1,5}[.,]\d{2})(?!\d)/g); if (mm) totals.push(num(mm[mm.length - 1].replace(",", "."))); } });
    if (totals.length) out.total = Math.max(...totals);
    if ((m = up.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) out.date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const headL = lines.slice(0, 4).find(l => /[A-Za-z]{3,}/.test(l)); if (headL) out.vendor = headL.replace(/[^\w &'.-]/g, "").trim().slice(0, 60);
    return out;
  } catch (e) { return null; }
}
