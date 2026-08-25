# Umber agent guide

You are working on Umber site stylesheets: per-site CSS files that retint websites with the live Omarchy desktop palette. Read this whole file before editing anything.

## The loop

- Stylesheets live in `~/.config/umber/sites/<site>.css`, one file per site, named by hostname (e.g. `www.reddit.com.css`). Repo-curated starters also exist (e.g. `gmail.css`); prefer editing the file that already matches the site.
- **Every save applies instantly to the user's open tabs** — no reload, no build step. Iterate in small increments and ask the user what they see, or ask them to describe/screenshot problem areas.
- Session context may be in `~/.config/umber/context/<site>/`: `census.json` (visible elements clustered by computed color and background, with counts and one sample selector each), `page.jpg` (screenshot at capture time), and `url`. The census is orientation, not a work list: it tells you the surface colors and hands you stable anchor selectors. It reflects only the captured page — usually the home feed, the *least* representative surface — and its `omarchyMode` field is the desktop mode, not the site's own theme state. Probe detail/comment/settings pages live.

## File format

The first line scopes the file with comma-separated Chromium match patterns (a bare `host` means `*://host/*`):

```css
/* @match https://mail.google.com/*, *://sh.example.com/* */
```

## Rules

- Every color must come from `var(--omarchy-*)`. Never hardcode palette values — the palette changes with the desktop theme. Derive shades with `color-mix(in srgb, ...)`; mixing background toward foreground is polarity-correct in both light and dark modes.
- Palette keys follow `omarchy-theme-color --all` with underscores hyphenated: `--omarchy-background`, `--omarchy-lighter-background`, `--omarchy-accent`, `--omarchy-bright-red`, … Run that command to see current values when judging contrast.
- The extension stamps `data-omarchy-mode="dark|light"` on `<html>`. Scope mode-specific rules (icon inversions especially) with `:root[data-omarchy-mode="light"]` etc., and handle both modes.
- The stylesheet is injected into the document **and into every open shadow root**. Declare design-token overrides on `:root, :host` so they also win inside web components; plain element/class rules apply within shadow trees too — but a descendant selector never *crosses* a shadow boundary. If `some-component .bg-white` misses, pair it with `:host(some-component) .bg-white`.
- Selector durability: prefer ids and short stable class names; never target auto-generated or randomized class names (long, digit-heavy, or hash-like). Use `!important` where the site's own rules would otherwise win.
- Leave embedded user content alone: HTML email bodies, documents, post media, avatars keep their authored colors.
- Icon sprites that clash with the new backgrounds: prefer CSS `filter` (invert/brightness), scoped per mode.

## Site design tokens

If the site has its own design-token custom properties (`--color-*` etc.), remapping those is the highest-leverage move — often the whole theme. But two traps:

- **Sites re-declare their token block on inner theme containers** (wrapper divs like `.theme-light`, `.theme-rpl`), not just on `:root`. A custom property resolves from the *nearest ancestor* that declares it, and `!important` only breaks ties on the same element — an important `:root` override does nothing for those subtrees, and the failure looks like a mystery bug, not a specificity problem. Find every container the site declares tokens on and repeat your full selector list (`:root, :host, .theme-x, …`) on **every** override block.
- **Discovery recipe:** enumerate custom properties from `getComputedStyle(document.documentElement)`, filter to color-valued ones, and group by naming family to learn the semantic ladder (content vs surface scales, state families). To find the *declaring selectors*, fetch the site's CSS bundles with `curl` from bash — page-side `document.styleSheets`/`cssRules` is usually CORS-opaque for CDN stylesheets and is a dead end. When dumping values through a browser JS tool, chunk and filter the output: long runs of hex-ish strings can trip output redaction.

## Looking at the page

- If you have browser tools (a browser MCP such as Claude in Chrome), use them: get the tab context, open the site, probe computed styles and element chains with JavaScript, and screenshot as you iterate. Live inspection beats static context every time.
- **Rule, not a note:** full-page screenshots can serve stale frames and can miss `adoptedStyleSheets` styling entirely. Verify with region zooms and computed-style probes; treat a full capture that contradicts them as the lie.
- **Theme the site, not the page.** Cover its major page types: home/feed, a detail page (post, thread, message, video), section pages (subreddit, channel, label), profile/user pages, and search/compose/settings surfaces. Visit each — or ask the user to — and fix the seams per page type before calling the theme done.
- Without browser access, work from `census.json` and `page.jpg`, and ask the user to describe or screenshot each page type as you go.

## Verifying

- Ask the user to check seams: hover states, menus and dropdowns, banners, form fields, scrollbars.
- **Test the other mode without touching the desktop.** Read another theme's palette with `omarchy-theme-color --file <theme-dir>/colors.toml --all` (built-in themes live in `/usr/share/omarchy/themes/`, user themes in `~/.config/omarchy/themes/` — e.g. flexoki-light against a dark desktop; a missing file fails silently with garbage values, so check the path), then inline-override all 56 `--omarchy-*` properties on `documentElement` and set `data-omarchy-mode` to the palette's `mode` key. Every theme carries all 56 keys, so no fallbacks are needed. Undo by clearing the inline overrides. Only ask the user to switch the actual desktop theme as a final confirmation.
