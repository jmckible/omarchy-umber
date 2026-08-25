// Element picker + page census. Top frame only; woken by "umber-pick"
// (popup button or keyboard command) and "umber-census" messages.
// Picked remaps become plain CSS appended to the site's file via the host, so
// hand edits, picker output, and agent output all land in the same place.
(() => {
  // Curated palette keys (aliases like bg/fg omitted, non-colors omitted).
  const KEYS = [
    "background", "lighter-background", "darker-background", "dark-background",
    "foreground", "bright-foreground", "light-foreground", "dark-foreground",
    "muted", "accent", "cursor", "selection-background", "selection-foreground",
    "red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta", "brown",
    "bright-red", "bright-yellow", "bright-green", "bright-cyan", "bright-blue",
    "bright-magenta", "bright-purple",
    "color0", "color1", "color2", "color3", "color4", "color5", "color6", "color7",
    "color8", "color9", "color10", "color11", "color12", "color13", "color14", "color15",
  ]
  const PROPS = { text: "color", background: "background-color", border: "border-color" }

  let pickHandlers = null
  let panelHost = null
  const previewSheet = new CSSStyleSheet()
  let previewAdopted = false
  let previewRoot = null

  // Pierce open shadow roots so components (Reddit, YouTube, ...) are pickable.
  const deepTarget = (x, y) => {
    let el = document.elementFromPoint(x, y)
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y)
      if (!inner || inner === el) break
      el = inner
    }
    return el
  }

  const varValue = key =>
    getComputedStyle(document.documentElement).getPropertyValue(`--omarchy-${key}`).trim()

  // --- selector generation -------------------------------------------------
  // Stable = short, letter-only tokens (Gmail's .zA/.T-I school); anything
  // digit-bearing or long reads as generated and is skipped.
  const stableClass = c => /^[A-Za-z-]{1,12}$/.test(c)
  const stableId = id => /^[A-Za-z][A-Za-z_-]{0,24}$/.test(id)

  const selectorFor = (el, generalize) => {
    const parts = []
    let node = el
    while (node && node !== document.documentElement && parts.length < 4) {
      if (node.id && stableId(node.id)) {
        parts.unshift("#" + CSS.escape(node.id))
        break
      }
      let part = node.tagName.toLowerCase()
      const stable = [...node.classList].filter(stableClass)
      if (stable.length) part += "." + stable.slice(0, 2).map(CSS.escape).join(".")
      else if (!generalize && node.parentElement)
        part += `:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`
      parts.unshift(part)
      node = node.parentElement
    }
    let sel = parts.join(" > ")
    if (!generalize) {
      try {
        const hits = document.querySelectorAll(sel)
        if (hits.length > 1 && el.parentElement) {
          sel += `:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`
        }
      } catch {}
    }
    return sel
  }

  // --- pick mode -----------------------------------------------------------
  const exitPickMode = () => {
    if (!pickHandlers) return
    const { hl, onMove, onClick, onKey, onDown } = pickHandlers
    hl.remove()
    removeEventListener("mousemove", onMove, true)
    removeEventListener("click", onClick, true)
    removeEventListener("mousedown", onDown, true)
    removeEventListener("mouseup", onDown, true)
    removeEventListener("keydown", onKey, true)
    pickHandlers = null
  }

  const enterPickMode = () => {
    if (pickHandlers) return
    closePanel()
    const accent = varValue("accent") || "#61afef"
    const hl = document.createElement("div")
    Object.assign(hl.style, {
      position: "fixed", left: 0, top: 0, width: 0, height: 0,
      pointerEvents: "none", zIndex: 2147483646,
      background: "color-mix(in srgb, " + accent + " 20%, transparent)",
      outline: "2px solid " + accent,
    })
    document.documentElement.appendChild(hl)
    const onMove = e => {
      const el = deepTarget(e.clientX, e.clientY)
      if (!el || el === hl) return
      const r = el.getBoundingClientRect()
      Object.assign(hl.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" })
    }
    const onDown = e => { e.preventDefault(); e.stopPropagation() }
    const onClick = e => {
      e.preventDefault()
      e.stopPropagation()
      hl.style.display = "none"
      const el = deepTarget(e.clientX, e.clientY)
      exitPickMode()
      if (el) openPanel(el, e.clientX, e.clientY)
    }
    const onKey = e => {
      if (e.key === "Escape") { e.stopPropagation(); exitPickMode() }
    }
    addEventListener("mousemove", onMove, true)
    addEventListener("click", onClick, true)
    addEventListener("mousedown", onDown, true)
    addEventListener("mouseup", onDown, true)
    addEventListener("keydown", onKey, true)
    pickHandlers = { hl, onMove, onClick, onKey, onDown }
  }

  // --- preview + persistence ----------------------------------------------
  const setPreview = css => {
    if (!previewAdopted) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, previewSheet]
      previewAdopted = true
    }
    // A pick inside a shadow root previews there; the saved rule reaches the
    // root through the normal styles push, which content.js injects everywhere.
    if (previewRoot && !previewRoot.adoptedStyleSheets.includes(previewSheet))
      previewRoot.adoptedStyleSheets = [...previewRoot.adoptedStyleSheets, previewSheet]
    try { previewSheet.replaceSync(css) } catch {}
  }
  const clearPreview = () => previewSheet.replaceSync("")

  // --- generation progress toast ------------------------------------------
  // The popup closes as soon as focus leaves it, so generation progress lives
  // on the page: a storage-driven toast fed by the host's heartbeat messages.
  let toastEl = null, toastInner = null, toastTimer = null
  const toast = (text, { error = false, sticky = false } = {}) => {
    if (!toastEl) {
      toastEl = document.createElement("div")
      toastEl.style.cssText = "all:initial; position:fixed; right:16px; bottom:16px; z-index:2147483647;"
      toastInner = document.createElement("div")
      toastEl.attachShadow({ mode: "closed" }).appendChild(toastInner)
    }
    const bg = varValue("lighter-background") || "#333"
    const fg = varValue(error ? "red" : "foreground") || "#eee"
    toastInner.style.cssText = `font: 12px system-ui, sans-serif; padding: 8px 12px; border-radius: 6px;
      background: ${bg}; color: ${fg}; box-shadow: 0 4px 16px rgba(0,0,0,.35);
      border: 1px solid color-mix(in srgb, ${fg} 25%, ${bg})`
    toastInner.textContent = text
    if (!toastEl.isConnected) document.documentElement.appendChild(toastEl)
    clearTimeout(toastTimer)
    if (!sticky) toastTimer = setTimeout(() => toastEl.remove(), 7000)
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    // The persisted rule arrives through the normal styles push; drop the
    // temporary preview once it does.
    if (changes.omarchyStyles) clearPreview()
    const gen = changes.omarchyGenerate?.newValue
    if (gen && gen.site === location.hostname) {
      if (gen.status === "running") toast(`Umber: ${gen.detail}`, { sticky: true })
      else if (gen.status === "done") toast(`Umber: ${gen.detail}`)
      else if (gen.status === "error") toast(`Umber: ${gen.detail}`, { error: true })
    }
  })

  // --- panel ---------------------------------------------------------------
  const closePanel = () => {
    if (panelHost) { panelHost.remove(); panelHost = null }
  }

  const openPanel = (el, x, y) => {
    closePanel()
    const rootNode = el.getRootNode()
    previewRoot = rootNode instanceof ShadowRoot ? rootNode : null
    panelHost = document.createElement("div")
    panelHost.style.cssText = "all:initial; position:fixed; z-index:2147483647;"
    const shadow = panelHost.attachShadow({ mode: "closed" })
    const cs = getComputedStyle(el)
    const st = { selector: selectorFor(el, true), prop: "text", key: null }

    const swatches = KEYS.map(k => ({ key: k, value: varValue(k) })).filter(s => s.value)
    const bg = varValue("background") || "#1e1e2e"
    const fg = varValue("foreground") || "#cdd6f4"
    const border = "color-mix(in srgb, " + fg + " 25%, " + bg + ")"

    shadow.innerHTML = `
      <style>
        :host { all: initial }
        .panel {
          position: relative; width: 268px; font: 12px system-ui, sans-serif;
          background: ${bg}; color: ${fg}; border: 1px solid ${border};
          border-radius: 8px; padding: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.4);
        }
        .sel { width: 100%; box-sizing: border-box; font: 11px monospace; margin: 6px 0;
          background: color-mix(in srgb, ${fg} 8%, ${bg}); color: ${fg};
          border: 1px solid ${border}; border-radius: 4px; padding: 4px; }
        .row { display: flex; gap: 4px; margin: 6px 0 }
        .row button { flex: 1; font: 11px system-ui; padding: 3px 0; cursor: pointer;
          background: color-mix(in srgb, ${fg} 8%, ${bg}); color: ${fg};
          border: 1px solid ${border}; border-radius: 4px; }
        .row button.on { background: ${varValue("accent") || "#61afef"}; color: ${bg}; border-color: transparent }
        .grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; margin: 8px 0 }
        .sw { aspect-ratio: 1; border-radius: 4px; cursor: pointer; border: 1px solid ${border} }
        .sw.on { outline: 2px solid ${fg}; outline-offset: 1px }
        .foot { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px }
        .foot button { font: 11px system-ui; padding: 4px 10px; cursor: pointer; border-radius: 4px;
          border: 1px solid ${border}; background: color-mix(in srgb, ${fg} 8%, ${bg}); color: ${fg} }
        .foot .save { background: ${varValue("accent") || "#61afef"}; color: ${bg}; border-color: transparent }
        .note { opacity: .65; font-size: 11px }
        .err { color: ${varValue("red") || "#f66"}; font-size: 11px; margin-top: 6px }
      </style>
      <div class="panel">
        <div><b>Remap</b> <span class="note">${el.tagName.toLowerCase()} · ${cs.color} on ${cs.backgroundColor}</span></div>
        <input class="sel" title="CSS selector (editable)" value="">
        <div class="note count"></div>
        <div class="row" id="prop">
          <button data-p="text" class="on">Text</button>
          <button data-p="background">Background</button>
          <button data-p="border">Border</button>
        </div>
        <div class="row" id="scope">
          <button data-s="all" class="on">All similar</button>
          <button data-s="one">Only this one</button>
        </div>
        ${swatches.length ? '<div class="grid"></div>' : '<div class="err">No Omarchy palette on this page — is the native host connected?</div>'}
        <div class="foot"><button class="cancel">Cancel</button><button class="save" disabled>Save</button></div>
        <div class="err" hidden></div>
      </div>`

    const q = s => shadow.querySelector(s)

    // Counts through open shadow roots, so "All similar" shows its true blast
    // radius before saving.
    const deepCount = sel => {
      let n = 0
      const walk = root => {
        let els
        try { n += root.querySelectorAll(sel).length; els = root.querySelectorAll("*") } catch { return }
        for (const e of els) if (e.shadowRoot) walk(e.shadowRoot)
      }
      walk(document)
      return n
    }
    const updateCount = () => {
      q(".count").textContent = st.selector ? `${deepCount(st.selector)} element(s) affected` : ""
    }

    const ruleCssFor = key =>
      `${st.selector} {\n  ${PROPS[st.prop]}: var(--omarchy-${key}) !important;\n}`
    const ruleCss = () => ruleCssFor(st.key)
    // Re-applies the committed pick, or clears when nothing is selected —
    // also the restore path after a hover preview ends.
    const preview = () => {
      if (st.key && st.selector) setPreview(ruleCss())
      else clearPreview()
    }

    const selInput = q(".sel")
    selInput.value = st.selector
    let countTimer = null
    selInput.addEventListener("input", () => {
      st.selector = selInput.value
      preview()
      clearTimeout(countTimer)
      countTimer = setTimeout(updateCount, 250)
    })

    q("#prop").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return
      q("#prop .on")?.classList.remove("on"); b.classList.add("on")
      st.prop = b.dataset.p; preview()
    })
    q("#scope").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return
      q("#scope .on")?.classList.remove("on"); b.classList.add("on")
      st.selector = selectorFor(el, b.dataset.s === "all")
      selInput.value = st.selector; preview(); updateCount()
    })

    const grid = q(".grid")
    if (grid) {
      for (const s of swatches) {
        const d = document.createElement("div")
        d.className = "sw"
        d.style.background = s.value
        d.title = `${s.key} (${s.value})`
        // Hovering flips the page live so every affected area shows before
        // committing; leaving the grid restores the committed pick.
        d.addEventListener("mouseenter", () => { if (st.selector) setPreview(ruleCssFor(s.key)) })
        d.addEventListener("click", () => {
          grid.querySelector(".on")?.classList.remove("on")
          d.classList.add("on")
          st.key = s.key
          q(".save").disabled = false
          preview()
        })
        grid.appendChild(d)
      }
      grid.addEventListener("mouseleave", preview)
    }
    updateCount()

    q(".cancel").addEventListener("click", () => { clearPreview(); closePanel() })
    q(".save").addEventListener("click", async () => {
      const site = location.hostname
      const resp = await chrome.runtime.sendMessage({
        toHost: { type: "append", site, matches: [`*://${site}/*`], css: ruleCss() },
      }).catch(e => ({ ok: false, error: String(e) }))
      if (resp && resp.ok) {
        closePanel() // preview clears when the styles push lands
      } else {
        const err = q(".panel > .err")
        err.hidden = false
        err.textContent = resp?.error || "failed to reach the native host"
      }
    })

    document.documentElement.appendChild(panelHost)
    const r = shadow.querySelector(".panel").getBoundingClientRect()
    panelHost.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 16)) + "px"
    panelHost.style.top = Math.max(8, Math.min(y + 12, innerHeight - r.height - 16)) + "px"
  }

  // --- census --------------------------------------------------------------
  // Compact digest of the rendered page for the generation agent: visible
  // elements clustered by (tag, color, background), with counts and one
  // durable-ish sample selector per cluster.
  const buildCensus = () => {
    const clusters = new Map()
    let scanned = 0
    for (const el of document.querySelectorAll("body *")) {
      if (++scanned > 8000) break
      const r = el.getBoundingClientRect()
      if (r.width < 6 || r.height < 6) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden") continue
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
      const key = `${el.tagName}|${cs.color}|${cs.backgroundColor}|${hasText}`
      let c = clusters.get(key)
      if (!c) {
        c = { tag: el.tagName.toLowerCase(), color: cs.color, background: cs.backgroundColor,
              text: hasText, count: 0, sample: selectorFor(el, true) }
        clusters.set(key, c)
      }
      c.count++
      if (cs.backgroundImage !== "none") c.icons = true
    }
    return {
      url: location.href,
      title: document.title,
      omarchyMode: document.documentElement.dataset.omarchyMode || null,
      bodyBackground: document.body ? getComputedStyle(document.body).backgroundColor : null,
      clusters: [...clusters.values()].sort((a, b) => b.count - a.count).slice(0, 120),
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg === "umber-pick") enterPickMode()
    else if (msg === "umber-census") sendResponse(buildCensus())
  })
})()
