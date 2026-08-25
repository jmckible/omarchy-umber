// Holds the native messaging port open; palette updates land in storage,
// which every content script observes. Chromium keeps the service worker
// alive while a native messaging port is connected.
function connect() {
  const port = chrome.runtime.connectNative("com.omarchy.theme")
  port.onMessage.addListener(msg => {
    if (msg && msg.colors) chrome.storage.local.set({ omarchyColors: msg.colors })
  })
  port.onDisconnect.addListener(() => setTimeout(connect, 5000))
}

connect()
chrome.runtime.onStartup.addListener(() => {})
