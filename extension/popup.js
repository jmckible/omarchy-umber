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

  const v = await chrome.storage.local.get(["omarchyColors", "omarchyStyles", "omarchyDisabledSites", "omarchyConnected", "omarchyGenerate"])

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

  // The power button is scoped to this tab's host. Stored as a blocklist so on
  // is the default for every site that has never been touched, and so the key
  // stays absent until the user turns something off.
  let off = v.omarchyDisabledSites || []
  // Everything keyed to "which sheet owns this URL, and is the host blocked" —
  // repainted together because owner drives all three. On is a conjunction:
  // some stylesheet claims this URL *and* the host is not switched off. With
  // nothing claiming it there is no switch to offer — flipping one would change
  // nothing on the page — so the button goes inert and the agent is the way
  // forward. Off and unthemed therefore look alike, which is honest: neither is
  // putting anything on the page.
  const renderSite = () => {
    const themed = themable && !!owner
    const on = themed && !off.includes(site)
    $("power").setAttribute("aria-pressed", String(on))
    $("power").disabled = !themed
    $("power").title = themed ? `Turn Umber ${on ? "off" : "on"} for ${site}` : ""
    $("sheet").textContent = owner?.name || ""
    // Same create-vs-refine split the host reads off `owner`, said out loud —
    // the verb changes, "with agent" stays put as the tell that a terminal
    // opens. Never touches .disabled: that is the generate lifecycle's to own.
    $("generate").textContent = owner ? "Refine with agent" : "Theme with agent"
    $("generate").title = !themable ? ""
      : owner ? `Refine ${owner.name} with the agent`
      : `Write a new stylesheet for ${site} with the agent`
  }
  // A disabled button cannot dispatch click, but site is null off http(s) and a
  // null must never reach the blocklist.
  $("power").addEventListener("click", () => {
    if (!themable || !owner) return
    off = off.includes(site) ? off.filter(h => h !== site) : [...off, site]
    chrome.storage.local.set({ omarchyDisabledSites: off })
    renderSite()
  })

  const renderHost = ok => {
    $("host-status").textContent = ok ? "host: connected" : "host: disconnected"
    $("host-status").classList.toggle("down", !ok)
  }
  renderHost(v.omarchyConnected)

  $("site").textContent = site || "(not a themable page)"
  renderSite()
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
    if (changes.omarchyDisabledSites) { off = changes.omarchyDisabledSites.newValue || []; renderSite() }
    if (changes.omarchyConnected) renderHost(changes.omarchyConnected.newValue)
    if (changes.omarchyStyles) {
      owner = Umber.resolveStyle(changes.omarchyStyles.newValue, url)
      renderSite()
    }
    if (changes.omarchyGenerate) {
      renderGenerate(changes.omarchyGenerate.newValue)
      if (changes.omarchyGenerate.newValue?.status !== "running") $("generate").disabled = !themable
    }
  })
}

init()
