// MontneyPro service worker: makes the app installable and opens fast. Always tries the network first,
// so changes on the site show up right away; falls back to the saved copy when there's no signal.
const CACHE = "montneypro-v7";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "logo-cream.png", "truck.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;   // never touch Supabase, Google or form posts
  e.respondWith(fetch(r).then(res => {
    if (res.ok && u.pathname.startsWith("/app/")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
});

// Phone pings: chat messages and daily reminders.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
    // skip the banner if they're already looking at that chat
    if (d.tag && d.tag.startsWith("chat-") && wins.some(w => w.focused && w.url.includes("chat=" + d.tag.slice(5)))) return;
    await self.registration.showNotification(d.title || "MontneyPro", {
      body:d.body || "", tag:d.tag || undefined, renotify:!!d.tag, icon:"icon-192.png", badge:"icon-192.png", data:{ url:d.url || "/app/" }
    });
    if (navigator.setAppBadge && d.tag && d.tag.startsWith("chat-")) { try { await navigator.setAppBadge(); } catch (err) {} }
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/app/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
    for (const w of wins) if (w.url.includes("/app/")) { await w.focus(); w.postMessage({ type:"open", url }); return; }
    await self.clients.openWindow(url);
  })());
});
