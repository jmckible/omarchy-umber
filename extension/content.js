// Applies the Omarchy palette and any matching site styles, live. The palette
// lands as inline --omarchy-* custom properties on <html> plus a
// data-omarchy-mode attribute; site CSS attaches via adoptedStyleSheets, which
// sorts after the page's own sheets in the cascade. Everything reacts to
// storage.onChanged, so pages restyle with no reload.
const root = document.documentElement
const state = { colors: null, styles: [], enabled: true }
const sheets = new Map() // style name → CSSStyleSheet
const ownSheets = new Set()

// Match-pattern logic lives in match.js (Umber.matchesUrl), shared with the
// popup and the picker so all three agree on which stylesheet owns a URL.

const setPalette = () => {
  if (state.enabled && state.colors) {
    for (const [key, value] of Object.entries(state.colors))
      root.style.setProperty(`--omarchy-${key.replaceAll("_", "-")}`, value)
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

const trackRoot = root => {
  if (!root || shadowRoots.has(root)) return
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

chrome.storage.local.get(["omarchyColors", "omarchyStyles", "omarchyEnabled"]).then(v => {
  state.colors = v.omarchyColors || null
  state.styles = v.omarchyStyles || []
  state.enabled = v.omarchyEnabled !== false
  sync()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  let dirty = false
  if (changes.omarchyColors) { state.colors = changes.omarchyColors.newValue || null; dirty = true }
  if (changes.omarchyStyles) { state.styles = changes.omarchyStyles.newValue || []; dirty = true }
  if (changes.omarchyEnabled) { state.enabled = changes.omarchyEnabled.newValue !== false; dirty = true }
  if (dirty) sync()
})

// Path-scoped patterns on soft navigations: cheap to honor for hash/history
// moves (pushState is deliberately not intercepted).
addEventListener("hashchange", syncSheets)
addEventListener("popstate", syncSheets)
