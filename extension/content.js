// Applies the Omarchy palette and any matching site styles, live. The palette
// lands as inline --omarchy-* custom properties on <html> plus a
// data-omarchy-mode attribute; site CSS attaches via adoptedStyleSheets, which
// sorts after the page's own sheets in the cascade. Everything reacts to
// storage.onChanged, so pages restyle with no reload.
const root = document.documentElement
const state = { colors: null, styles: [], enabled: true }
const sheets = new Map() // style name → CSSStyleSheet
const ownSheets = new Set()

// Umber is on everywhere by default; the popup writes a blocklist of hostnames
// (omarchyDisabledSites) and this frame is off when any host in its embedding
// chain is on that list. Own host alone isn't enough: turning a site off should
// not leave its iframes tinted, and an about:blank frame has no host to consult.
// ancestorOrigins is Chromium-only and populated across origins; sandboxed
// frames report the string "null", which the URL parse rejects.
const frameHosts = () => {
  const hosts = new Set()
  if (location.hostname) hosts.add(location.hostname)
  for (const origin of location.ancestorOrigins || [])
    try { hosts.add(new URL(origin).hostname) } catch {}
  return hosts
}

// Fixed for this document: a same-document navigation cannot change a hostname,
// and anything else reloads the content script.
const hosts = frameHosts()
const offHere = list => (list || []).some(host => hosts.has(host))

// Match-pattern logic lives in match.js (Umber.matchesUrl), shared with the
// popup and the picker so all three agree on which stylesheet owns a URL.

// The host already shapes these, but this is what actually names a CSS
// property on every page, so the shape is re-checked where it is used.
const PALETTE_KEY = /^[a-z0-9_]{1,40}$/

const setPalette = () => {
  if (state.enabled && state.colors) {
    for (const [key, value] of Object.entries(state.colors)) {
      if (!PALETTE_KEY.test(key) || typeof value !== "string" || value.length > 64) continue
      root.style.setProperty(`--omarchy-${key.replaceAll("_", "-")}`, value)
    }
    root.dataset.omarchyMode = state.colors.mode || "dark"
  } else {
    for (const prop of [...root.style]) if (prop.startsWith("--omarchy-")) root.style.removeProperty(prop)
    delete root.dataset.omarchyMode
  }
}

// Site CSS reaches shadow DOM too: the same constructed sheets are adopted
// into every open shadow root (imperative roots announced by shadow-hook.js,
// declarative ones found by scanning). Token overrides should target
// ":root, :host" so they win inside components as well.
const shadowRoots = new Set()
let activeSheetList = []

const adoptInto = (target, activeSheets) => {
  target.adoptedStyleSheets = [
    ...target.adoptedStyleSheets.filter(sh => !ownSheets.has(sh)),
    ...activeSheets,
  ]
}

const syncSheets = () => {
  const active = state.enabled ? state.styles.filter(s => Umber.matchesUrl(s.matches, location.href)) : []
  for (const s of active) {
    let sheet = sheets.get(s.name)
    if (!sheet) {
      sheet = new CSSStyleSheet()
      sheets.set(s.name, sheet)
      ownSheets.add(sheet)
    }
    try { sheet.replaceSync(s.css) } catch {}
  }
  const keep = new Set(active.map(s => s.name))
  for (const name of [...sheets.keys()]) if (!keep.has(name)) sheets.delete(name)
  activeSheetList = active.map(s => sheets.get(s.name))
  adoptInto(document, activeSheetList)
  for (const root of shadowRoots) {
    if (!root.host.isConnected) { shadowRoots.delete(root); continue }
    adoptInto(root, activeSheetList)
  }
}

const shadowObserver = new MutationObserver(muts => {
  for (const m of muts)
    for (const n of m.addedNodes) if (n instanceof Element) scanForShadows(n)
})

// One MutationObserver per tracked root, and "umber-shadow" is an ordinary
// DOM event a page can dispatch as often as it likes — so the number of roots
// this page can make us observe is bounded.
const MAX_SHADOW_ROOTS = 2000

const trackRoot = root => {
  if (!root || shadowRoots.has(root) || shadowRoots.size >= MAX_SHADOW_ROOTS) return
  shadowRoots.add(root)
  // Observation doesn't cross shadow boundaries, so each root is watched
  // itself — components hydrated inside other components are still found.
  shadowObserver.observe(root, { childList: true, subtree: true })
  if (activeSheetList.length) adoptInto(root, activeSheetList)
}

// Walks a subtree — document, element, or shadow root — descending into every
// open shadow root found, since declarative roots nested inside other
// components never fire the attachShadow hook.
const scanForShadows = node => {
  if (node.shadowRoot) {
    trackRoot(node.shadowRoot)
    scanForShadows(node.shadowRoot)
  }
  for (const el of node.querySelectorAll("*"))
    if (el.shadowRoot) {
      trackRoot(el.shadowRoot)
      scanForShadows(el.shadowRoot)
    }
}

// Imperative roots, announced by the MAIN-world attachShadow hook.
addEventListener("umber-shadow", e => {
  if (e.target instanceof Element) trackRoot(e.target.shadowRoot)
}, true)

// Declarative roots: attached during parsing without attachShadow, so find
// them by scanning added subtrees (and everything present once loaded).
shadowObserver.observe(document, { childList: true, subtree: true })
if (document.readyState === "loading")
  addEventListener("DOMContentLoaded", () => scanForShadows(document.documentElement))
else scanForShadows(document.documentElement)

const sync = () => { setPalette(); syncSheets() }

chrome.storage.local.get(["omarchyColors", "omarchyStyles", "omarchyDisabledSites"]).then(v => {
  state.colors = v.omarchyColors || null
  state.styles = v.omarchyStyles || []
  state.enabled = !offHere(v.omarchyDisabledSites)
  sync()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  let dirty = false
  if (changes.omarchyColors) { state.colors = changes.omarchyColors.newValue || null; dirty = true }
  if (changes.omarchyStyles) { state.styles = changes.omarchyStyles.newValue || []; dirty = true }
  if (changes.omarchyDisabledSites) { state.enabled = !offHere(changes.omarchyDisabledSites.newValue); dirty = true }
  if (dirty) sync()
})

// Path-scoped patterns on soft navigations: cheap to honor for hash/history
// moves (pushState is deliberately not intercepted).
addEventListener("hashchange", syncSheets)
addEventListener("popstate", syncSheets)
