// Phone notifications: subscribe this phone, keep the subscription fresh.
import { sb, S, CONFIG, toast, IOS } from "./core.js";

const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const on = () => supported() && Notification.permission === "granted";
const keyBytes = k => Uint8Array.from(atob((k + "=".repeat((4 - k.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function save(sub) {
  const j = sub.toJSON();
  await sb.from("push_subscriptions").upsert({ endpoint: j.endpoint, user_id: S.user.id, company_id: S.company.id, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
}
export async function enablePush() {
  if (!supported()) { toast(IOS && !STANDALONE ? "Add the app to your home screen first (Share › Add to Home Screen)" : "This phone can't do notifications"); return false; }
  try {
    if ((await Notification.requestPermission()) !== "granted") { toast("Notifications are off. Turn them on in Settings."); return false; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CONFIG.vapid) });
    await save(sub);
    sb.functions.invoke("push", { body: { mode: "test" } }).catch(() => {});
    toast("Notifications are on"); return true;
  } catch (e) { toast("Couldn't turn on notifications"); return false; }
}
export async function refreshPush() {
  if (!on()) return;
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await save(sub); } catch (e) {}
}
export async function pushRow() {
  const state = on() ? "On for this phone" : (IOS && !STANDALONE) ? "Add to home screen first" : (supported() && Notification.permission === "denied") ? "Blocked in phone settings" : "Off";
  return `<div class="setrow"><span>Notifications<small>${state}</small></span>${on() ? "" : `<button class="link" type="button" id="pushOn">Turn on</button>`}</div>`;
}
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => {
  if (e.data && e.data.type === "open") { const u = new URL(e.data.url); const c = u.searchParams.get("chat"), v = u.searchParams.get("v"); import("./core.js").then(m => c ? m.go("thread", { id: c }) : v && m.go(v)); }
});
