const $ = id => document.getElementById(id)

const renderGenerate = gen => {
  const el = $("gen-status")
  el.classList.toggle("error", gen?.status === "error")
  el.textContent = gen
    ? { running: `Generating ${gen.site}… ${gen.detail}`,
        done: `Done: ${gen.detail}`,
        error: `Failed: ${gen.detail}` }[gen.status] || ""
    : ""
}

const init = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url || ""
  const themable = /^https?:/.test(url)
  const site = themable ? new URL(url).hostname : null

  const v = await chrome.storage.local.get(["omarchyColors", "omarchyStyles", "omarchyEnabled", "omarchyConnected", "omarchyGenerate"])

  // The stylesheet already covering this URL, if any — the file the agent
  // should refine instead of forking a hostname-named second one. Kept fresh
  // because a generation landing while the popup is open changes the answer.
  let owner = Umber.resolveStyle(v.omarchyStyles, url)

  // Theme the popup itself with the live palette.
  const paint = colors => {
    if (!colors) return
    for (const [key, value] of Object.entries(colors))
      document.documentElement.style.setProperty(`--omarchy-${key.replaceAll("_", "-")}`, value)
    $("mode").textContent = colors.mode || ""
  }
  paint(v.omarchyColors)

  $("enabled").checked = v.omarchyEnabled !== false
  $("enabled").addEventListener("change", e =>
    chrome.storage.local.set({ omarchyEnabled: e.target.checked }))

  const renderHost = ok => {
    $("host-status").textContent = ok ? "host: connected" : "host: disconnected"
  }
  renderHost(v.omarchyConnected)

  $("site").textContent = site || "(not a themable page)"
  const renderStyles = styles => {
    $("styles").replaceChildren(...(styles || []).map(s => {
      const li = document.createElement("li")
      li.textContent = s.name
      if (themable && Umber.matchesUrl(s.matches, url)) li.classList.add("on")
      return li
    }))
  }
  renderStyles(v.omarchyStyles)
  renderGenerate(v.omarchyGenerate)

  $("pick").disabled = $("generate").disabled = !themable

  $("pick").addEventListener("click", async () => {
    await chrome.tabs.sendMessage(tab.id, "umber-pick").catch(() => {})
    window.close()
  })

  // Launches the default agent in a floating terminal via the host, seeded
  // with a context dump of this page (census + screenshot). The terminal is
  // the progress UI; the live styles push previews every save. `site` names the
  // stylesheet, not the host: the file already claiming this URL when there is
  // one, so the host reads it as a refine rather than a fresh create.
  $("generate").addEventListener("click", async () => {
    $("generate").disabled = true
    const census = await chrome.tabs.sendMessage(tab.id, "umber-census").catch(() => null)
    const screenshot = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 60 }).catch(() => null)
    const resp = await chrome.runtime.sendMessage({
      toHost: { type: "agent", url, site: owner?.name || site, census: census || {}, screenshot },
    }).catch(e => ({ ok: false, error: String(e) }))
    if (resp?.ok) window.close()
    else {
      renderGenerate({ status: "error", detail: resp?.error || "host unreachable" })
      $("generate").disabled = false
    }
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    if (changes.omarchyColors) paint(changes.omarchyColors.newValue)
    if (changes.omarchyConnected) renderHost(changes.omarchyConnected.newValue)
    if (changes.omarchyStyles) {
      owner = Umber.resolveStyle(changes.omarchyStyles.newValue, url)
      renderStyles(changes.omarchyStyles.newValue)
    }
    if (changes.omarchyGenerate) {
      renderGenerate(changes.omarchyGenerate.newValue)
      if (changes.omarchyGenerate.newValue?.status !== "running") $("generate").disabled = !themable
    }
  })
}

init()
