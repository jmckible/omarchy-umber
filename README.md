# Umber

Live Omarchy theme sync for Chromium-family browsers (built for Helium). A MV3 extension stamps the full Omarchy palette onto every page as `--omarchy-*` CSS custom properties and updates them the moment the desktop theme changes; per-site stylesheets consume the variables, and the whole collection lives as plain CSS files in `~/.config/umber/sites/`.

## How it works

- `host/umber-host` — bidirectional native messaging host (bash). Pushes the palette from `omarchy-theme-color --all` and the site stylesheets from `~/.config/umber/sites/` on connect, then again whenever the theme changes (`~/.local/state/omarchy/current/theme.name` rewritten after each atomic theme swap) or a style file changes — both watched with inotify. Handles two requests from the extension: appending a picked rule to a site's file, and generating a stylesheet via the system agent.
- `extension/background.js` — holds the native port open (which keeps the service worker alive), lands palette/style updates in `chrome.storage.local`, and relays popup/picker requests back to the host.
- `extension/content.js` — on every page and frame, applies the stored palette to `documentElement` as inline `--omarchy-<key>` properties (underscores become hyphens) plus a `data-omarchy-mode="dark|light"` attribute, and attaches any site styles whose `@match` patterns cover the current URL via `adoptedStyleSheets` (which sorts after the page's own sheets in the cascade). Everything reacts to `storage.onChanged`: pages restyle live with no reload, and the popup's Enabled toggle strips palette and styles the same way.
- `extension/picker.js` — the element picker. Click the toolbar popup's "Pick element…" (or `Alt+Shift+O`), click any element, choose text/background/border and a palette swatch (previewed live), and Save appends the rule to the site's CSS file through the host.
- `extension/popup.html` — toolbar popup: on/off toggle, host status, the styles matching the current tab, the picker, and "Generate theme".

## Site styles

One CSS file per site in `~/.config/umber/sites/`, scoped by a comment header:

```css
/* @match https://mail.google.com/* */
.zA { background: var(--omarchy-background) !important; }
```

`@match` takes comma-separated Chromium match patterns; a bare `mail.google.com` is shorthand for `*://mail.google.com/*`, so scope can be a domain, a page, or any wildcard in between. Edit a file and open tabs restyle immediately — the host watches the directory. Sharing a site style is sharing a file; the repo's `sites/` directory holds curated starters that `./install` seeds (never overwriting local edits).

## Agent generation

"Generate theme" in the popup sends the page's *census* — visible elements clustered by computed color/background with sample selectors — to the host, which asks the system agent for a stylesheet written against the palette variables. Agent choice defers to `omarchy-default-agent`: the host maps the chosen slug to its headless spelling (`claude -p`, `codex exec`, `opencode run`, `crush run`, `grok -p` — Omarchy's own `omarchy-agent` only knows interactive launches). For anything else, put a shell command in `~/.config/umber/agent`; it receives the prompt on stdin and must print CSS on stdout. The result lands in `~/.config/umber/sites/<domain>.css` and applies live; fix the rough edges with the picker or a text editor. There is deliberately no generic auto-theming — site semantics need judgment, so the long tail is the agent's job and the starters are curated.

## Install

```bash
./install
```

Writes the native host manifest into Helium/Chromium/Chrome config dirs, seeds `~/.config/umber/sites/` with the bundled starters, and joins the extension into Helium's `--load-extension` list in `~/.config/helium-browser-flags.conf` (comma-joined onto the existing line — a second `--load-extension` line would override the first and drop omarchy's copy-url). Restart Helium to load it. For branded Chrome, which ignores `--load-extension`, load `extension/` unpacked via `chrome://extensions` instead; the extension ID is pinned via the `key` field in `manifest.json` (public key in `.extension-key.b64`, ID in `.extension-id`), so the native host manifest's `allowed_origins` stays valid for any unpacked load. `key.pem` is the keypair it was derived from; it is git-ignored and only needed to regenerate.

## Consuming the variables

Any page or userstyle (e.g. Stylus) can use the palette once the extension runs:

```css
background: var(--omarchy-background);
color: color-mix(in srgb, var(--omarchy-foreground) 70%, var(--omarchy-background));
```

Key names follow `omarchy-theme-color --all` with underscores hyphenated: `--omarchy-accent`, `--omarchy-lighter-background`, `--omarchy-bright-red`, `--omarchy-mode`, etc. Mode-specific rules can scope with `:root[data-omarchy-mode="light"]`.
