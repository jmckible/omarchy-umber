// Holds the native messaging port open; palette and style updates land in
// storage, which every content script observes. Chromium keeps the service
// worker alive while a native messaging port is connected, and the top-level
// connect() re-runs on every worker start.
let port = null

function connect() {
  port = chrome.runtime.connectNative("com.mckible.umber")
  port.onMessage.addListener(msg => {
    if (!msg) return
    if (msg.type === "palette" || msg.colors) chrome.storage.local.set({ omarchyColors: msg.colors, omarchyConnected: true })
    else if (msg.type === "styles") chrome.storage.local.set({ omarchyStyles: msg.styles || [] })
    else if (msg.type === "generate-status") chrome.storage.local.set({ omarchyGenerate: msg })
  })
  port.onDisconnect.addListener(() => {
    port = null
    chrome.storage.local.set({ omarchyConnected: false })
    setTimeout(connect, 5000)
  })
}

// The extension→host contract, stated once. Everything on the far side of this
// port runs unsandboxed as the user, and the fields below are shaped by
// whatever page the picker or the popup was looking at — so a message is
// rebuilt here from known keys with known types and ceilings rather than
// forwarded as it arrived. The host re-validates all of it; this is the second
// lock, not the only one, and it keeps a content-script bug from turning into a
// file write.
const LIMIT = { site: 64, css: 8192, url: 2048, census: 262144, screenshot: 11534336 }

const bounded = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null)

const hostMessage = msg => {
  if (!msg || typeof msg !== "object") return null
  const site = bounded(msg.site, LIMIT.site)
  if (!site) return null
  if (msg.type === "append") {
    const css = bounded(msg.css, LIMIT.css)
    return css ? { type: "append", site, css } : null
  }
  if (msg.type === "agent") {
    const url = bounded(msg.url, LIMIT.url)
    if (!url || !/^https?:\/\//.test(url)) return null
    let census = {}
    try {
      const encoded = JSON.stringify(msg.census ?? {})
      if (encoded.length <= LIMIT.census) census = JSON.parse(encoded)
    } catch {}
    const shot = bounded(msg.screenshot, LIMIT.screenshot)
    return {
      type: "agent",
      url,
      site,
      census,
      screenshot: shot && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]*={0,2}$/.test(shot) ? shot : null,
    }
  }
  return null
}

// Popup and picker reach the host through here. onMessage only ever fires for
// this extension's own contexts — another extension would arrive on
// onMessageExternal, which is deliberately not registered — but the sender is
// checked anyway so that stays true if a listener is ever added.
//
// Deliberately not backed by an externally_connectable entry in the manifest:
// with the key absent, web pages cannot connect at all and extensions can only
// reach onMessageExternal, so a deny-all entry adds nothing — and Chromium
// warns on one ("specifies neither 'matches' nor 'ids'"). The check below is
// what actually holds the line.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.toHost) return
  if (sender.id !== chrome.runtime.id) return sendResponse({ ok: false, error: "rejected sender" })
  const payload = hostMessage(msg.toHost)
  if (!payload) return sendResponse({ ok: false, error: "malformed host message" })
  if (!port) return sendResponse({ ok: false, error: "native host disconnected" })
  try {
    port.postMessage(payload)
    sendResponse({ ok: true })
  } catch (e) {
    sendResponse({ ok: false, error: String(e) })
  }
})

chrome.commands.onCommand.addListener(async command => {
  if (command !== "pick-element") return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) chrome.tabs.sendMessage(tab.id, "umber-pick").catch(() => {})
})

connect()
chrome.runtime.onStartup.addListener(() => {})
