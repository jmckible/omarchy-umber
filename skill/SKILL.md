---
name: umber
description: Work on Umber site stylesheets — Omarchy-palette theming for websites in the browser. Use when asked to theme a website with the desktop palette, fix or tweak a site's theme colors (gmail, reddit, etc.), or edit files in ~/.config/umber/sites/. Saves apply live to open tabs.
---

Read `~/.config/umber/AGENT.md` and follow it. In short: site stylesheets live in `~/.config/umber/sites/<site>.css`, scoped by a `/* @match ... */` first line; all colors come from `var(--omarchy-*)`; every save restyles the user's open tabs instantly, so iterate in small steps and ask what they see. Fresh page context (census, screenshot) may be in `~/.config/umber/context/<site>/`.
