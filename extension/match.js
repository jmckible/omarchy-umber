// Which stylesheet owns a URL — the one answer three contexts have to agree on:
// content.js adopts the matching sheets, popup.js decides create-vs-refine
// before launching the agent, picker.js picks the file a saved rule appends to.
// While the copies were separate they drifted (only content.js learned about
// ports) and the popup and picker forked hostname-named files beside styles
// that already covered the page — hence gmail.css next to mail.google.com.css.
//
// Loaded into the content-script world alongside content.js at document_start,
// so picker.js (document_idle, same world) sees it too; popup.html loads it as
// a plain script before popup.js.
self.Umber = (() => {
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const patternCache = new Map()

  // Chromium match patterns, plus a shorthand: a bare "mail.google.com" or
  // "mail.google.com/u/*" is treated as *://host/path.
  const compilePattern = raw => {
    if (patternCache.has(raw)) return patternCache.get(raw)
    let p = raw.trim()
    let re = null
    if (p === "<all_urls>") re = /^(https?|file|ftp):/
    else {
      if (!p.includes("://")) p = "*://" + p + (p.includes("/") ? "" : "/*")
      const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/.exec(p)
      if (m) {
        const scheme = m[1] === "*" ? "https?" : m[1]
        const host = m[2]
        const path = m[3] || "/*"
        let src = "^" + scheme + "://"
        if (host === "*") src += "[^/]*"
        else if (host.startsWith("*.")) src += "(?:[^/]+\\.)?" + escapeRe(host.slice(2))
        else src += escapeRe(host)
        // Chromium match patterns carry no port and ignore it when matching, so
        // a host-only pattern has to cover dev servers on :3000 etc.
        src += "(?::\\d+)?"
        src += path.split("*").map(escapeRe).join(".*") + "$"
        try { re = new RegExp(src) } catch { re = null }
      }
    }
    patternCache.set(raw, re)
    return re
  }

  const matchesUrl = (patterns, url) =>
    Array.isArray(patterns) && patterns.some(p => compilePattern(p)?.test(url))

  // The stylesheet a write for this URL belongs in — its @match header claims
  // the page, so the filename is irrelevant (gmail.css owns mail.google.com).
  // Null means nothing covers the URL yet and the caller should fall back to a
  // hostname-named file. When several already claim it, target the one carrying
  // the most of the site's theme rather than forking yet another.
  const resolveStyle = (styles, url) =>
    (styles || [])
      .filter(s => matchesUrl(s.matches, url))
      .sort((a, b) => (b.css || "").length - (a.css || "").length)[0] || null

  return { matchesUrl, resolveStyle }
})()
