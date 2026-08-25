# Omatheme

Live Omarchy theme sync for Chromium-family browsers. Architecture and install are in [README.md](README.md) — read it first.

## Key facts

- Extension ID is pinned to `jgaobdgdpcdgbmidehlfoiabemkakalp` via the `key` field in `extension/manifest.json` (public key `.extension-key.b64`, keypair `key.pem` git-ignored). The native host manifest's `allowed_origins` depends on it — never regenerate casually. For a Chrome Web Store upload the `key` field must be removed (the store assigns its own ID), which would break the local native-host pairing; keep store packaging on a branch if attempted.
- Palette keys come from `omarchy-theme-color --all` (56 keys), underscores hyphenated: `background` → `--omarchy-background`, `lighter_background` → `--omarchy-lighter-background`. `content.js` also stamps `data-omarchy-mode="dark|light"` on `<html>` for mode-scoped CSS.
- The host (`host/omatheme-host`) re-sends the palette when `~/.local/state/omarchy/current/theme.name` gets a `close_write` — that file is written after the atomic theme-dir swap, so it marks a completed theme change.
- Bash follows Omarchy conventions: `#!/bin/bash`, `[[ ]]` for tests, two-space indent.

## Development workflow

The user's daily browser is **Helium** (extension loaded via `--load-extension` in `~/.config/helium-browser-flags.conf`). The claude-in-chrome MCP browser is a **separate Chrome instance without the extension** — it is the styling lab:

1. Simulate the extension in the lab tab with `javascript_tool`: set `--omarchy-*` inline properties on `documentElement`, set `data-omarchy-mode`, and inject/append a `<style id="omatheme-lab">` tag with the candidate CSS. Get palette values via `omarchy-theme-color --all` (or `--file <theme>/colors.toml` for a theme that isn't active).
2. Iterate against the live DOM. Probe with `document.elementFromPoint(x, y)` ancestor chains (tag + classes + computed color/background), and enumerate icon sprites by filtering a container's descendants for `backgroundImage !== "none"` or `IMG` tags.
3. Test BOTH modes before shipping: swap the injected palette to a light theme (e.g. flexoki-light) and a dark one, screenshot each.
4. Ship by writing the verified CSS to `extension/sites/*.css`, then have the user reload the extension in Helium (`chrome://extensions` ↻ or restart Helium). Host or manifest changes: re-run `./install`, then restart Helium.

Only one session should drive the claude-in-chrome browser at a time.

## Gmail specifics (`sites/gmail.css`)

- Assumes Gmail's internal theme is **Dark** (the user's setting). The light-mode sprite inversions invert Gmail's white icon sprites; with Gmail internally light they'd invert the wrong way.
- Selector durability: Gmail's short classnames (`.zA` rows, `.aeN` nav, `.TK`/`.TO` labels, `.T-I` buttons, `.J-M` menus) have been stable for ~a decade. The `gb_*` classes rotate — use the stable IDs `#gb` (top bar) and `#aso_search_form_anchor` (search form) instead. Randomized classes show as `[BLOCKED: JWT token]` in probe output — never target them.
- Traps found empirically: nav text is an `<a>` inside `.nU` carrying Gmail's own color (needs `color: inherit`); the "No new mail!" banner (`tr.TD`) hardcodes `rgba(51,51,51,.8)` in both Gmail themes; search chips live under `.S0 .HW`, not `.aqn`; the conversation surface stays light even in Gmail dark, so text and backgrounds must be forced together.
- Untouched by design: HTML email bodies (`.a3s` descendants keep authored colors). Known gaps: Chat, the compose popup, footer links, the white wordmark image.

## Related

- Tier 1 of this concept (the Rails dashboard's server-side theme sync) lives in `~/dev/dashboard/omarchy/` — same palette names, same `theme-set` hook mechanism, independent delivery path.
