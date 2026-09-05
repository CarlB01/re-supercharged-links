# Re-Supercharged Links

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-%23483699.svg?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Release](https://img.shields.io/github/v/release/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/releases)
![BRAT Compatible](https://img.shields.io/badge/BRAT-Compatible-8A2BE2?logo=obsidian&logoColor=white)
[![myBrain Integration](https://img.shields.io/badge/myBrain-Integration-00C853?logo=icloud&logoColor=white)](https://github.com/CarlB01/myBrain)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CarlB01/re-supercharged-links/blob/master/LICENSE)
[![Downloads](https://img.shields.io/github/downloads/CarlB01/re-supercharged-links/total)](https://github.com/CarlB01/re-supercharged-links/releases)
[![Stars](https://img.shields.io/github/stars/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/stargazers)

A modern, performance-focused fork of **Supercharged Links** for Obsidian — rebuilt for cleaner architecture, faster rendering, and a smoother mobile experience.

---

## ✨ What this plugin does

**Re-Supercharged Links** turns metadata into visual context directly in your notes.

Instead of plain internal links, you can style links based on frontmatter/fields so they communicate status, type, priority, source, or category at a glance.

### Typical use cases

- Color links by `status` (e.g. active, waiting, done)
- Add subtle badges for `type` (project, meeting, person, reference)
- Highlight links by `priority`, `domain`, or `publishedIn`
- Keep visual consistency across large vaults without manual formatting

---

## 🚀 What’s new in v0.0.25

This release cycle focuses on **stability + strictness + maintainability** without losing speed.

### Core improvements

- ✅ Safer TypeScript patterns (reduced unsafe casts / `any` usage)
- ✅ Better runtime guards for dynamic plugin integrations (incl. Dataview bridge)
- ✅ Cleaner DOM handling patterns (lint-safe and future-proof)
- ✅ Improved attribute hydration pipeline for internal links
- ✅ Better consistency in metadata/property pane enrichment
- ✅ General internal cleanup for long-term maintainability

### Why it matters

You get the same visual power, but with a codebase that is:

- easier to evolve,
- easier to debug,
- less fragile against Obsidian API/lint changes.

---

## 🧠 Architecture highlights

The plugin is designed around a lightweight reactive model:

- **Cache-first metadata reads** to avoid unnecessary heavy DOM scans
- **Batched attribute/style updates** to reduce visual churn
- **Decoupled rendering logic** for easier maintenance
- **Mobile-aware behavior** for smoother editing on iOS/Android

---

## 📦 Installation

## Method 1 — BRAT (recommended while in beta/rapid updates)

1. Open **Settings → Community plugins** in Obsidian.
2. Install and enable **BRAT**.
3. Open BRAT settings and choose **Add Beta plugin**.
4. Paste this repository URL:  
   `https://github.com/CarlB01/re-supercharged-links`
5. Confirm. BRAT installs and keeps the plugin updated.

## Method 2 — Manual install

1. Go to the repository **Releases** page:  
   `https://github.com/CarlB01/re-supercharged-links/releases`
2. Download release assets: `main.js`, `manifest.json`, `styles.css`
3. Put them in your vault at:  
   `<your-vault>/.obsidian/plugins/re-supercharged-links/`
4. Reload Obsidian and enable **Re-Supercharged Links** in Community plugins.

---

## ⚙️ Quick start

1. Open plugin settings.
2. Create a rule for a metadata key (example: `status`).
3. Assign styles for light/dark mode.
4. Save and verify links update in notes/panes.

Tip: Start with 1–2 keys (`status`, `type`) and scale from there.

---

## 🖼️ Screenshots

Styles are created and edited directly in the settings UI.

<img src="media/details.png" alt="list view" style="max-width: 100%; width: 400px; height: auto; border-radius: 8px;">

<img src="media/details2.png" alt="details view" style="max-width: 100%; width: 400px; height: auto; border-radius: 8px;">

---

## 🔌 Compatibility notes

- Built for Obsidian users who rely on metadata-heavy workflows
- Works especially well with structured vaults (projects, PARA, Zettelkasten hybrids)
- Dataview-related enrichment is handled defensively to avoid hard failures

---

## 🗺️ Roadmap (post-0.0.25 direction)

- Continued UX refinements in settings flow
- More preset/style ergonomics
- Extra polish for large vault performance
- Ongoing strict-mode and lint hardening

---

## 🤝 Credits

Massive respect to the original **Supercharged Links** creators and contributors.  
This project stands on that foundation, with a modernized architecture and independent maintenance path.

---

## 💚 Support

If this plugin improves your workflow:

- ⭐ Star the repo
- 🐞 Report issues / suggest improvements
- 🧪 Test new builds via BRAT and share feedback

---

Developed with care by a healthcare worker who loves colorful, meaningful links.
