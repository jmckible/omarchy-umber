// Holds the native messaging port open; palette and style updates land in
// storage, which every content script observes. Chromium keeps the service
// worker alive while a native messaging port is connected, and the top-level
// connect() re-runs on every worker start.
let port = null

function connect() {
  port = chrome.runtime.connectNative("com.omarchy.theme")
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

// Popup and picker reach the host through here.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.toHost) return
  if (!port) return sendResponse({ ok: false, error: "native host disconnected" })
  try {
    port.postMessage(msg.toHost)
    sendResponse({ ok: true })
  } catch (e) {
    sendResponse({ ok: false, error: String(e) })
  }
})

chrome.commands.onCommand.addListener(async command => {
  if (command !== "pick-element") return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) chrome.tabs.sendMessage(tab.id, "omatheme-pick").catch(() => {})
})

connect()
chrome.runtime.onStartup.addListener(() => {})
