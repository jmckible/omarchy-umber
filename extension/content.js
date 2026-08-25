const apply = colors => {
  if (!colors) return
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors))
    root.style.setProperty(`--omarchy-${key.replaceAll("_", "-")}`, value)
  root.dataset.omarchyMode = colors.mode || "dark"
}

chrome.storage.local.get("omarchyColors").then(({ omarchyColors }) => apply(omarchyColors))
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.omarchyColors) apply(changes.omarchyColors.newValue)
})
