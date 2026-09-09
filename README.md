# Umber

Your Omarchy theme, in your browser.

[![Watch the Umber demo: live Omarchy theme sync for Chromium-family browsers](docs/hero.jpg)](https://www.youtube.com/watch?v=QFHmhyZwx5o)

Umber stamps the full Omarchy palette onto every page as `--omarchy-*` CSS custom properties and keeps them live — change the desktop theme and every themed site retints in place, no reload. Per-site stylesheets consume those variables, and the whole collection is plain CSS files in `~/.config/umber/sites/`: readable, editable while you watch, and shareable one file at a time.

## Install

Umber needs Omarchy itself (for `omarchy-theme-color`, plus `omarchy-default-agent` if you want the agent path) and a Chromium-family browser. The host also uses `jq`, `inotify-tools`, and either `python3` or `perl` — all usually present already.

```bash
git clone https://github.com/jmckible/omarchy-umber.git
cd omarchy-umber
./install
```

That writes the native host manifest into your browser's config dir, seeds `~/.config/umber/sites/` with the bundled starters, and asks before touching anything it doesn't own (`--yes` accepts, `--no-optional` declines, and a non-interactive run declines):

- **Helium** loads unpacked extensions from `~/.config/helium-browser-flags.conf`. Umber offers to join its own path onto the existing `--load-extension` list — comma-joined, because a second `--load-extension` line would override the first and drop whatever it was loading. The previous file is kept as `.umber-backup`.
- **Chromium and Chrome** ignore `--load-extension`. Load `extension/` yourself via `chrome://extensions` → Developer mode → Load unpacked. The extension ID is pinned by the `key` field in `manifest.json`, so the native host manifest's `allowed_origins` stays valid however you load it.

Then restart the browser.

## Getting started

**1. Check the bridge.** Open the Umber toolbar popup. It should say `host: connected`. If it says disconnected, the browser can't reach `host/umber-host` — re-run `./install` and reload the extension from `chrome://extensions`.

**2. Look at a page you haven't themed.** Nothing will look different, and that's correct: Umber only supplies the variables. Open devtools on any page and you'll find them on `<html>`:

```
--omarchy-background: #282c34
--omarchy-foreground: #abb2bf
--omarchy-accent:     #61afef
… 56 in all, plus data-omarchy-mode="dark"
```

**3. Open [Omarchy Radio](https://radio.omarchy.org).** `sites/radio.omarchy.org.css` ships with Umber and is seeded on install, so the site is themed the moment the extension loads. This is the worked example — read it to see what a finished site style looks like.

**4. Change your desktop theme.** Every open themed tab retints as the theme lands. Nothing reloads, and nothing is stored per-theme: the stylesheets only ever reference variables, so one file covers every palette you'll ever install.

> `sites/gmail.css` ships as well, and assumes Gmail's own Appearance setting is **Dark**. It inverts Gmail's white icon sprites on light Omarchy palettes; with Gmail internally set to light, those inversions run the wrong way.

> `sites/github.com.css` points GitHub's syntax highlighting at the palette's ANSI colors and its `--fontStack-monospace` token at `JetBrainsMono Nerd Font`, so a diff reads like the same file in your terminal. That font is Omarchy's default but it is matched by name from the local system — on a machine without it, code falls back to GitHub's own stack and only the colors carry over.

## Site styles

One CSS file per site in `~/.config/umber/sites/`, scoped by a comment header:

```css
/* @match radio.omarchy.org */

:root, :host {
  --bg:   var(--omarchy-background) !important;         /* the deck       */
  --lcd:  var(--omarchy-darker-background) !important;  /* inset screen   */
  --fg:   var(--omarchy-bright-foreground) !important;  /* ink            */
  --ac:   var(--omarchy-accent) !important;             /* accent fills   */
  --acFg: var(--omarchy-background) !important;         /* ink on accent  */
}

::selection {
  background: var(--omarchy-selection);
  color: var(--omarchy-selection-foreground);
}
```

`@match` takes comma-separated Chromium match patterns, and a bare `radio.omarchy.org` is shorthand for `*://radio.omarchy.org/*` — so a style's scope can be a whole domain, one page, or any wildcard in between. The filename is just a name; the header decides what the file claims.

Edit a file and open tabs restyle immediately — the host watches the directory, so a save is the whole feedback loop. That makes the directory the place to iterate, and sharing a site style is just sharing a file.

Three things the Radio starter demonstrates that are worth copying. Where a site already keeps its colors in custom properties, re-declaring that block from the palette is most of the job — the site's own stylesheet then does the rest unchanged, and an `!important` author declaration outranks the site's inline style whatever order the two land in. That is the whole of the block above.

Mode-specific rules scope off an attribute Umber sets for you. Radio's LCD is lit-on-dark under a dark theme and dark-on-light under a light one, so "recessed" is two different mixes rather than one:

```css
:root[data-omarchy-mode="dark"]  { --g1: color-mix(in srgb, var(--omarchy-accent) 62%, var(--omarchy-darker-background)) !important; }
:root[data-omarchy-mode="light"] { --g1: color-mix(in srgb, var(--omarchy-accent) 72%, var(--omarchy-foreground)) !important; }
```

And where a site has no tokens to borrow, you're writing selectors instead — where durable ones matter more than clever ones. `gmail.css` targets Gmail's short classnames (`.zA`, `.aeN`, `.T-I`), stable for a decade, and the `#gb` id rather than the `gb_*` classes that rotate weekly. Anything long, digit-heavy or hash-like is generated — don't target it.

## Theming a site nothing covers yet

**The picker**, for one element at a time. Open the popup and click "Pick element…" (or press `Alt+Shift+O`), then click anything on the page — it pierces open shadow roots, so web components are fair game. Choose text, background or border, hover the palette swatches to preview the change live across the whole page, and Save. The rule appends to whichever stylesheet already claims the URL, falling back to a new file named for the hostname.

**The agent**, for a whole site. The agent button — "Theme with agent", or "Refine with agent" once a stylesheet claims the page — hands your default agent (`omarchy-default-agent`) a census of the rendered page — visible elements clustered by computed color and background, with sample selectors — plus a screenshot, and launches it in a floating terminal pointed at the site's stylesheet. The terminal is the progress UI, and every save it makes restyles your open tabs live. If a stylesheet already claims the page it refines that file narrowly rather than rewriting it; otherwise it creates one.

The agent is your agent, running with your permissions, and the page context it's handed is authored by the site. Umber bounds that context and tells the agent to treat it as data rather than instructions, but a coding agent reading an attacker-authored page is a prompt-injection surface: point it at pages you'd be willing to point an agent at, and keep its confirmation prompts on.

There is deliberately no generic auto-theming. Site semantics need judgment, so the long tail is the agent's job and the bundled starters are curated.

## Consuming the variables elsewhere

Any page or userstyle (Stylus, a bookmarklet, your own site in development) can use the palette once the extension is running:

```css
background: var(--omarchy-background);
color: color-mix(in srgb, var(--omarchy-foreground) 70%, var(--omarchy-background));
```

Key names follow `omarchy-theme-color --all` with underscores hyphenated: `--omarchy-accent`, `--omarchy-lighter-background`, `--omarchy-bright-red`, `--omarchy-mode`. Mode-specific rules scope with `:root[data-omarchy-mode="light"]`.

## How it works

- `host/umber-host` — bidirectional native messaging host (bash). Pushes the palette from `omarchy-theme-color --all` and the site stylesheets on connect, then again whenever the theme changes (`~/.local/state/omarchy/current/theme.name` is rewritten after each atomic theme swap) or a style file changes — both watched with inotify. Handles two requests from the extension: appending a picked rule, and launching the agent on a stylesheet.
- `extension/background.js` — holds the native port open (which is what keeps the MV3 service worker alive), lands palette and style updates in `chrome.storage.local`, and relays popup and picker requests back to the host over a bounded, explicitly-typed contract.
- `extension/match.js` — the match-pattern matcher, and on top of it the answer to "which stylesheet owns this URL". Shared by all three writers, because they have to agree: `content.js` adopts every matching sheet, the popup decides create-vs-refine before launching the agent, and the picker chooses the file a saved rule appends to. When a URL is already claimed, writes go to the claiming file — `gmail.css` owns `mail.google.com`, so keying off the hostname would fork a second stylesheet over an already-themed site.
- `extension/content.js` — on every page and frame, applies the palette to `documentElement` and attaches matching site styles via `adoptedStyleSheets`, which sorts after the page's own sheets in the cascade. A soft navigation that swaps the document element's attributes — Astro view transitions, Turbo, htmx boosting — takes the inline palette with it while the adopted sheets survive, so an observer re-stamps it rather than leaving the site style resolving every `var()` to nothing. Everything reacts to `storage.onChanged`, so pages restyle live and the popup's per-site power button strips palette and styles the same way.
- `extension/shadow-hook.js` — a `document_start` script in the page's main world that wraps `Element.prototype.attachShadow`, so site styles reach open shadow roots as components hydrate. Declarative shadow roots never call it and are found by scanning instead.
- `extension/picker.js` — the element picker, the page census, and the progress toast.

## Removal

```bash
./uninstall            # keeps your site stylesheets
./uninstall --purge    # removes ~/.config/umber as well
```

Removes the native host manifest from every browser config dir, takes the extension back out of the Helium flags line, and unlinks the Claude skill. Then remove the extension in `chrome://extensions` and restart the browser. Your hand-edited stylesheets in `~/.config/umber/sites/` are left alone unless you pass `--purge`.

## What it touches, and what it trusts

Umber runs a native messaging host — an unsandboxed bash script running as you — alongside a content script on every page. Worth knowing before you install it:

- **Every page, every frame.** The content script stamps custom properties on `documentElement`, and a `document_start` script in the page's main world wraps `Element.prototype.attachShadow` so site styles can reach open shadow roots. Nothing is read out of the page or sent anywhere unless you click.
- **`~/.config/umber/sites/` is a web-readable surface.** Site CSS is attached with `adoptedStyleSheets`, and a page's own JavaScript can read the text of the sheets attached to it. Treat those files as public to the sites they match: don't park anything private in that directory.
- **Anything can write to that directory, so the host does not trust it.** Every stylesheet is opened once with `O_NOFOLLOW`, checked on that descriptor (regular file, under the sites dir, at most 256 KB), and read through the same descriptor — a symlink, a FIFO, an oversize or growing file is refused rather than followed or truncated. The same goes the other way: the host never opens a predictable path with a truncating redirection, run state lives in a private `mktemp -d`, and a picked rule may only ever be a single palette remap (`selector { color: var(--omarchy-*) !important }`) appended to a stylesheet whose name is a plain slug.
- **The screenshot and census only leave the page when you click the agent button** ("Theme with agent" / "Refine with agent"), and they go to a run-private directory on your own machine and to your own agent. Umber makes no network requests of its own.
- **`test/hostile.sh`** runs the fixtures behind those claims — symlinked, FIFO, oversize and star-bomb stylesheets, traversing and non-slug style names, appends through a planted symlink, CSS that tries to escape its rule or `@import`, a non-http page URL, an oversize screenshot and an over-ceiling message length — in an isolated `HOME`, asserting each is refused and that a victim file outside the sites dir is untouched.

## License

[MIT](LICENSE)
