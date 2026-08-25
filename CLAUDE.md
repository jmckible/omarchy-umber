# Omatheme

Live Omarchy theme sync for Chromium-family browsers. Architecture and install are in [README.md](README.md) — read it first.

## Key facts

- Extension ID is pinned to `jgaobdgdpcdgbmidehlfoiabemkakalp` via the `key` field in `extension/manifest.json` (public key `.extension-key.b64`, keypair `key.pem` git-ignored). The native host manifest's `allowed_origins` depends on it — never regenerate casually. For a Chrome Web Store upload the `key` field must be removed (the store assigns its own ID), which would break the local native-host pairing; keep store packaging on a branch if attempted.
- Palette keys come from `omarchy-theme-color --all` (56 keys), underscores hyphenated: `background` → `--omarchy-background`, `lighter_background` → `--omarchy-lighter-background`. `content.js` also stamps `data-omarchy-mode="dark|light"` on `<html>` for mode-scoped CSS.
- Site styles are files in `~/.config/omatheme/sites/*.css`, scoped by a `/* @match pattern, pattern */` header (Chromium match patterns; bare `host` is shorthand for `*://host/*`). The host inotify-watches that dir and re-pushes on any change, so editing a file restyles open tabs live — that dir is the iteration surface. Repo `sites/` holds the curated starters that `./install` seeds with `cp` no-overwrite.
- Host↔extension protocol (native messaging, all JSON): host pushes `{type:"palette"|"styles"|"generate-status"}`; extension sends `{type:"append", site, matches, css}` (picker save) and `{type:"generate", url, site, census}` (agent generation; the agent comes from the `omarchy-default-agent` slug mapped to a headless spelling, or the shell command in `~/.config/omatheme/agent` — contract: prompt on stdin, CSS on stdout). Storage keys: `omarchyColors`, `omarchyStyles`, `omarchyEnabled`, `omarchyConnected`, `omarchyGenerate`.
- `content.js` attaches site CSS via `adoptedStyleSheets` (sorts after the page's own sheets — wins specificity ties without `!important`). The host re-sends palette when `~/.local/state/omarchy/current/theme.name` gets a `close_write` — written after the atomic theme-dir swap, so it marks a completed theme change.
- Host code changes only take effect on a fresh port (extension reload or browser restart); extension code changes need an extension reload; site CSS changes need nothing.
- Bash follows Omarchy conventions: `#!/bin/bash`, `[[ ]]` for tests, two-space indent.

## Development workflow

The user's daily browser is **Helium** (extension loaded via `--load-extension` in `~/.config/helium-browser-flags.conf`). The claude-in-chrome MCP browser is a **separate Chrome instance that also has the extension** (loaded unpacked, 2026-08-25) — it is the styling lab, running the real pipeline:

1. Iterate by editing `~/.config/omatheme/sites/<site>.css` directly — open lab tabs restyle on save. Probe with `document.elementFromPoint(x, y)` ancestor chains (tag + classes + computed color/background), and enumerate icon sprites by filtering a container's descendants for `backgroundImage !== "none"` or `IMG` tags.
2. Test BOTH modes before shipping. For a theme that isn't active, either switch the desktop theme (ask the user first — it retints everything) or override the injected values inline with `javascript_tool`: set `--omarchy-*` properties and `data-omarchy-mode` on `documentElement` using `omarchy-theme-color --file <theme>/colors.toml`.
3. Ship a starter by copying the verified file into repo `sites/` and committing. Extension code changes: user reloads via `chrome://extensions` ↻ (both browsers). Host or native-manifest changes: re-run `./install`, then reload the extension to reconnect the port.
4. Only one session should drive the claude-in-chrome browser at a time.

## Gmail specifics (`sites/gmail.css`)

- Assumes Gmail's internal theme is **Dark** (the user's setting). The light-mode sprite inversions invert Gmail's white icon sprites; with Gmail internally light they'd invert the wrong way.
- Selector durability: Gmail's short classnames (`.zA` rows, `.aeN` nav, `.TK`/`.TO` labels, `.T-I` buttons, `.J-M` menus) have been stable for ~a decade. The `gb_*` classes rotate — use the stable IDs `#gb` (top bar) and `#aso_search_form_anchor` (search form) instead. Randomized classes show as `[BLOCKED: JWT token]` in probe output — never target them. The picker's `stableClass` heuristic encodes the same rule.
- Traps found empirically: nav text is an `<a>` inside `.nU` carrying Gmail's own color (needs `color: inherit`); the "No new mail!" banner (`tr.TD`) hardcodes `rgba(51,51,51,.8)` in both Gmail themes; search chips live under `.S0 .HW`, not `.aqn`; the conversation surface stays light even in Gmail dark, so text and backgrounds must be forced together.
- Untouched by design: HTML email bodies (`.a3s` descendants keep authored colors). Known gaps: Chat, the compose popup, footer links, the white wordmark image.

## Related

- Tier 1 of this concept (the Rails dashboard's server-side theme sync) lives in `~/dev/dashboard/omarchy/` — same palette names, same `theme-set` hook mechanism, independent delivery path.
