// Network-only — no cache, ever. Afterburner's whole value on this screen is
// live budget numbers; caching any response would mean the one time it
// matters (a slow connection, low signal) the app shows a stale budget
// instead of a real one, which is worse than not being installable at all.
// This fetch handler exists purely because Chrome requires one to consider
// the app installable — it never changes what the network would have done.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
