# Umber

Live Omarchy theme sync for Chromium-family browsers (built for Helium). A MV3 extension stamps the full Omarchy palette onto every page as `--omarchy-*` CSS custom properties and updates them the moment the desktop theme changes; per-site stylesheets consume the variables, and the whole collection lives as plain CSS files in `~/.config/umber/sites/`.

## How it works

- `host/umber-host` — bidirectional native messaging host (bash). Pushes the palette from `omarchy-theme-color --all` and the site stylesheets from `~/.config/umber/sites/` on connect, then again whenever the theme changes (`~/.local/state/omarchy/current/theme.name` rewritten after each atomic theme swap) or a style file changes — both watched with inotify. Handles two requests from the extension: appending a picked rule to a stylesheet, and launching the system agent on one. In both, the `site` field names the *stylesheet*, not the page host — see `extension/match.js`.
- `extension/background.js` — holds the native port open (which keeps the service worker alive), lands palette/style updates in `chrome.storage.local`, and relays popup/picker requests back to the host.
- `extension/match.js` — the match-pattern matcher and, on top of it, the answer to "which stylesheet owns this URL". Loaded into the content-script world and into the popup, because the three writers have to agree: `content.js` adopts every matching sheet, the popup decides create-vs-refine before launching the agent, and the picker picks the file a saved rule appends to. When a URL is already claimed, writes go to the claiming file — `gmail.css` owns `mail.google.com`, so keying off the hostname would fork a second stylesheet over a themed site.
- `extension/content.js` — on every page and frame, applies the stored palette to `documentElement` as inline `--omarchy-<key>` properties (underscores become hyphens) plus a `data-omarchy-mode="dark|light"` attribute, and attaches any site styles whose `@match` patterns cover the current URL via `adoptedStyleSheets` (which sorts after the page's own sheets in the cascade). Everything reacts to `storage.onChanged`: pages restyle live with no reload, and the popup's Enabled toggle strips palette and styles the same way.
- `extension/picker.js` — the element picker. Click the toolbar popup's "Pick element…" (or `Alt+Shift+O`), click any element, choose text/background/border and a palette swatch (previewed live), and Save appends the rule through the host to whichever stylesheet already claims the URL (falling back to a new hostname-named file).
- `extension/popup.html` — toolbar popup: on/off toggle, host status, the styles matching the current tab, the picker, and "Theme with agent" (create or refine, depending on whether a stylesheet already claims the tab).

## Site styles

One CSS file per site in `~/.config/umber/sites/`, scoped by a comment header:

```css
/* @match https://mail.google.com/* */
.zA { background: var(--omarchy-background) !important; }
```

`@match` takes comma-separated Chromium match patterns; a bare `mail.google.com` is shorthand for `*://mail.google.com/*`, so scope can be a domain, a page, or any wildcard in between. Edit a file and open tabs restyle immediately — the host watches the directory. Sharing a site style is sharing a file; the repo's `sites/` directory holds curated starters that `./install` seeds (never overwriting local edits).

## Agent generation

"Theme with agent" in the popup sends the page's *census* — visible elements clustered by computed color/background with sample selectors — plus a screenshot of the visible tab to the host, which writes them to a run-private directory and launches `omarchy-default-agent` in a floating terminal pointed at the site's stylesheet. The terminal is the progress UI and every save restyles open tabs live; fix the rough edges with the picker or a text editor afterwards. There is deliberately no generic auto-theming — site semantics need judgment, so the long tail is the agent's job and the starters are curated.

The agent is your agent, running with your permissions, and the page context handed to it is authored by the site. Umber bounds that context and tells the agent to treat it as data rather than instructions, but a coding agent reading an attacker-authored page is a prompt-injection surface: use it on pages you would be willing to point an agent at, and keep the agent's own confirmation prompts on.

## Install

```bash
./install
```

Writes the native host manifest into Helium/Chromium/Chrome config dirs, seeds `~/.config/umber/sites/` with the bundled starters, and refreshes `~/.config/umber/AGENT.md`. Two further steps touch configuration Umber does not own, so it asks first (`--yes` takes them, `--no-optional` skips them, and a non-interactive run skips them): joining the extension into Helium's `--load-extension` list in `~/.config/helium-browser-flags.conf` (comma-joined onto the existing line — a second `--load-extension` line would override the first and drop omarchy's copy-url; the previous file is kept as `.umber-backup`), and linking the Claude Code skill into `~/.claude/skills/umber`. Restart Helium to load it. For branded Chrome, which ignores `--load-extension`, load `extension/` unpacked via `chrome://extensions` instead; the extension ID is pinned via the `key` field in `manifest.json` (public key in `.extension-key.b64`, ID in `.extension-id`), so the native host manifest's `allowed_origins` stays valid for any unpacked load. `key.pem` is the keypair it was derived from; it is git-ignored and only needed to regenerate.

## Removal

```bash
./uninstall            # keeps your site stylesheets
./uninstall --purge    # removes ~/.config/umber as well
```

Removes the native host manifest from every browser config dir, takes the extension back out of the Helium flags line, and unlinks the Claude skill. Then remove the extension in `chrome://extensions` and restart the browser. Your hand-edited stylesheets in `~/.config/umber/sites/` are left alone unless you pass `--purge`.

## What it touches, and what it trusts

Umber runs a native messaging host — an unsandboxed bash script running as you — alongside a content script on every page. Worth knowing before you install it:

- **Every page, every frame.** The content script stamps custom properties on `documentElement`, and a `document_start` script in the page's main world wraps `Element.prototype.attachShadow` so site styles can reach open shadow roots. Nothing is read out of the page or sent anywhere unless you click.
- **`~/.config/umber/sites/` is a web-readable surface.** Site CSS is attached with `adoptedStyleSheets`, and a page's own JavaScript can read the text of the sheets attached to it. Treat those files as public to the sites they match: do not park anything private in that directory.
- **Anything can write to that directory, so the host does not trust it.** Every stylesheet is opened once with `O_NOFOLLOW`, checked on that descriptor (regular file, under the sites dir, at most 256 KB), and read through the same descriptor — a symlink, a FIFO, an oversize or growing file is refused rather than followed or truncated. The same goes the other way: the host never opens a predictable path with a truncating redirection, run state lives in a private `mktemp -d`, and a picked rule may only ever be a single palette remap (`selector { color: var(--omarchy-*) !important }`) appended to a stylesheet whose name is a plain slug.
- **The screenshot and census only leave the page when you click "Theme with agent"**, and they go to a run-private directory on your own machine and to your own agent. Umber makes no network requests of its own.
- **`test/hostile.sh`** runs the fixtures behind those claims — symlinked, FIFO, oversize and star-bomb stylesheets, traversing and non-slug style names, appends through a planted symlink, CSS that tries to escape its rule or `@import`, a non-http page URL, an oversize screenshot and an over-ceiling message length — in an isolated `HOME`, asserting each is refused and that a victim file outside the sites dir is untouched.

## Consuming the variables

Any page or userstyle (e.g. Stylus) can use the palette once the extension runs:

```css
background: var(--omarchy-background);
color: color-mix(in srgb, var(--omarchy-foreground) 70%, var(--omarchy-background));
```

Key names follow `omarchy-theme-color --all` with underscores hyphenated: `--omarchy-accent`, `--omarchy-lighter-background`, `--omarchy-bright-red`, `--omarchy-mode`, etc. Mode-specific rules can scope with `:root[data-omarchy-mode="light"]`.
