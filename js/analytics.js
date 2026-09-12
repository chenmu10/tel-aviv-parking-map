// Usage events for Vercel Web Analytics. The Vercel tag (see index.html)
// is only injected on the *.vercel.app host, so on the GitHub Pages mirror
// and in local dev window.va is undefined and every call is a silent no-op.
//
// Rules for what goes in `data`: flat values only (strings, numbers,
// booleans -- Vercel rejects nested objects), and never anything the user
// typed. Lot names and statuses are public feed data.

export function track(name, data) {
  if (typeof window.va === "function") window.va("event", { name, data });
}
