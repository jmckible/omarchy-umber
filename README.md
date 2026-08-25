# Omatheme

Live Omarchy theme sync for Chromium-family browsers (built for Helium). A MV3 extension stamps the full Omarchy palette onto every page as `--omarchy-*` CSS custom properties and updates them the moment the desktop theme changes; per-site stylesheets (starting with Gmail) consume the variables.

## How it works

- `host/omatheme-host` — native messaging host (bash). Sends the palette from `omarchy-theme-color --all` on connect, then again whenever `~/.local/state/omarchy/current/theme.name` is rewritten (the marker written after each atomic theme swap), watched with inotify.
- `extension/background.js` — holds the native port open and writes each palette into `chrome.storage.local`; the open port keeps the service worker alive, and it reconnects on drop.
- `extension/content.js` — on every page and frame, applies the stored palette to `documentElement` as inline `--omarchy-<key>` properties (underscores become hyphens) plus a `data-omarchy-mode` attribute, and reapplies on `storage.onChanged`. Pages restyle live with no reload; site CSS can scope rules per mode via `:root[data-omarchy-mode="light"]`.
- `extension/sites/*.css` — per-site mappings written against the variables, using `color-mix()` for derived shades.

The extension ID is pinned via the `key` field in `manifest.json` (public key in `.extension-key.b64`, ID in `.extension-id`), so the native host manifest's `allowed_origins` stays valid for an unpacked load. `key.pem` is the keypair it was derived from; it is git-ignored and only needed to regenerate.

## Install

```bash
./install
```

Writes the native host manifest into Helium/Chromium/Chrome config dirs and joins the extension into Helium's `--load-extension` list in `~/.config/helium-browser-flags.conf` (comma-joined onto the existing line — a second `--load-extension` line would override the first and drop omarchy's copy-url). Restart Helium to load it.

## Consuming the variables

Any page or userstyle (e.g. Stylus) can use the palette once the extension runs:

```css
background: var(--omarchy-background);
color: color-mix(in srgb, var(--omarchy-foreground) 70%, var(--omarchy-background));
```

Key names follow `omarchy-theme-color --all` with underscores hyphenated: `--omarchy-accent`, `--omarchy-lighter-background`, `--omarchy-bright-red`, `--omarchy-mode`, etc.
