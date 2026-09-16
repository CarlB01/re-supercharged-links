# Re-Supercharged Links

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-%23483699.svg?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Obsidian Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/plugins)
[![Release](https://img.shields.io/github/v/release/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/releases)
[![myBrain Integration](https://img.shields.io/badge/myBrain-Integration-00C853?logo=icloud&logoColor=white)](https://github.com/CarlB01/myBrain)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CarlB01/re-supercharged-links/blob/master/LICENSE)
[![Downloads](https://img.shields.io/github/downloads/CarlB01/re-supercharged-links/total)](https://github.com/CarlB01/re-supercharged-links/releases)
[![Stars](https://img.shields.io/github/stars/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/stargazers)

A modern, high-performance, and completely re-architected fork of **Supercharged Links** for Obsidian. Rebuilt from the ground up for instantaneous rendering, zero layout thrashing, and an ultra-light memory footprint.

---

## 🚀 What's New in v1.0.6

Version 1.0.0+ introduces a massive, underlying performance overhaul. We have completely cleaned how data flows through the plugin, shifting from a defensive, switch-heavy model to a **universal, zero-config styling engine** that reduces background processing considerably:

* **Buttery-Smooth Scrolling (Up to 120 FPS)**: All repetitive text-washing, file path calculations, and format-cleansing have been completely banished from active rendering loops, ensuring fluid scrolling even in massive vaults with thousands of links.
* **Smart `#` Hashtag Management**: SCL now enforces strict data layer separation. You type tags cleanly in the option panel *without* the `#` symbol. The plugin handles formatting under the hood, injecting the `#` prefix *exclusively* on your screen's HTML layer. This guarantees perfect, out-of-the-box compatibility with wildcard CSS snippets and ecosystem tools like `myBrain` without duplicate hash glitches.
* **Permanent Editor Crash Protection**: We completely re-designed how icons and styles are stacked together in Live Preview. By pre-sorting all visual elements in a flat transactional memory buffer before they hit the editor screen, we have permanently wiped out sequence sorting crashes when you edit or hover over link aliases.
* **Universal Auto-Detection (Goodbye Toggles!)**: SCL is now fast enough to run everywhere simultaneously without artificial speed gates. We have removed all legacy switches (`enableFileList`, `enableBacklinks`, `enableTabHeader`, etc.). SCL now penetrates the entire workspace natively, instantly color-coding sidebars, search results, tabs, popups, and native properties.
* **Instant Settings Feedback**: By streamlining how settings are stored on disk, your custom color and icon choices will now light up your layout instantly—the exact microsecond you release your mouse cursor.

---

## ✨ What this plugin does

**Re-Supercharged Links** turns metadata into visual context directly in your notes.

Instead of plain internal links, you can style links based on frontmatter/fields so they communicate status, type, priority, source, or category at a glance.

---

## ✨ The Architectural Evolution: Original vs. Re-Supercharged

To understand why **Re-Supercharged Links** was built, it helps to look at the mechanics under the hood. SCL v1.0.0 moves entirely past the legacy framework to unlock deep interoperability.

### 📊 Comparative Analysis

| Feature / Core Mechanism | Original Supercharged Links (`mdelobelle/..`) | Re-Supercharged Links (`CarlB01/..`) |
| :--- | :--- | :--- |
| **Styling Mechanism** | **Disk Persisted CSS Snippets.** Writes massive, static `.css` files to disk whenever rules change. | **All-In-Memory Runtime.** Eliminates disk manipulation entirely. Styles compile in-memory and update UI profiles synchronously. |
| **DOM Engine Lookup** | **Substring Attribute Scanning ($=, \*=).** Forces continuous, heavy substring searches on every frame while scrolling. | **O(1) Hash-Table Matching.** Assigns clean, static rule signatures instantly, backed by high-velocity attribute caching. |
| **Icon Affixes (Emojis)** | **CSS Pseudo-Elements (`::before`/`::after`).** Emojis are injected blindly via CSS text properties, causing layout lag anomalies. | **Physical HTML Widgets (`<span>`).** Embeds lightweight, standardized icon spans natively inside CodeMirror 6 and Read Mode streams. |
| **Ecosystem Integration** | **Native DOM Footprint.** Third-party plugins scan for static string attributes. | **Semantic Mirroring Protocol.** Synthesizes in-memory velocity with explicit data-attribute style exports (`data-link-color`) for downstream graphical tools. |
| **Configuration Setup** | **Manual Toggle-Heavy Labyrinth.** Users must explicitly activate/deactivate plugin targets to preserve system speed. | **Universal Zero-Config Engine.** Automatically detects active third-party extensions (like `Bases`, `myBrain`, etc.) on boot with zero overhead. |

---

## ⚙️ The Semantic Mirroring Protocol & `myBrain` Integration

With the release of the **Semantic Mirroring Protocol**, SCL delivers unprecedented rendering speed paired with absolute visibility for external canvas, link-graph, and index engines:

1. **Attribute Footprint Speciation:** SCL synchronously maintains legacy-compatible metadata footprint parameters (`data-link-path` and a fully standardized space-separated `data-link-tags="#him #nurse"` structure).
2. **Explicit Visual Style Export:** SCL injects compiled visual properties directly onto the DOM layer (`data-link-color`, `data-link-bg`, `data-link-weight`, and `data-link-style`). Third-party tools like **`myBrain`** can instantly read the exact hex values and text decorations via lightweight attribute lookups, completely discarding the need to evaluate internal rule configurations.
3. **Contextual Class Inheritance:** SCL processes matching rules chronologically and injects clean, human-readable semantic descriptors (such as `.scl-match-tag-symptom`) additively, allowing other tools to filter or group nodes effortlessly.

---

## ⚖️ The Honest Trade-offs: Pros and Cons

Engineering is about choices. While **Re-Supercharged Links** offers massive leaps forward in speed, it changes how the plugin interacts with your system.

### 🟢 Pros (Why you should use it)
* **Zero UI Lag or Scrolling Micro-Stutter:** Fluid, locked 60/120+ FPS rhythm across multi-thousand-note vaults.
* **Instant Settings Feedback:** Color choices light up preview badges in the exact microsecond you release the cursor.
* **Zero-Config Automation**: No advanced panel toggles to configure; everything farges automatically.
* **Total Crash Immunity:** Equipped with an internal ingestion engine that automatically scrubs and permanently heals legacy data nodes on disk, wiping out `TypeError` boot-time crashes permanently.

### 🔴 Cons (What to be aware of)
* **Deep Architectural Divergence:** Move so far past the original implementation that settings objects are structurally unique. It cannot read legacy data structures from the original plugin without configuring rules anew.

---

## ⚙️ Quick Start

1. Open **Settings → Community plugins** and install **Re-Supercharged Links**.
2. Navigate to the option pane and create a new selector rule targeting a metadata marker (e.g., `status`).
3. **Clean Text Inputs**: Type rule values cleanly **without** the `#` character (e.g., enter `gruppe`, not `#gruppe`). SCL manages the `#` prefix under the hood.
4. Assign text weight options, custom icon affixes, and distinct colors for both light and dark mode.
5. Watch your workspace map itself out visually across all panels in real-time!

---

## 🔌 Compatibility notes

- Built for Obsidian users who rely on metadata-heavy workflows.
- Works especially well with structured vaults (projects, PARA, Zettelkasten hybrids).
- Universal auto-detect engine protects native view leaves, file properties pane, suggestion containers, and third-party panels (`Bases`, `Breadcrumbs`, `myBrain`) dynamically.
- Dataview-related enrichment is handled defensively to avoid hard failures.

---

## 🤝 Credits & Lineage

Deepest respect and gratitude to the original creators and maintainers of **Supercharged Links**. Their brilliant vision provided the conceptual baseline for what metadata links could achieve in Obsidian. This fork stands on that pioneering foundation, built to carry the workflow safely into future Obsidian API environments.

---

Developed with care by a healthcare worker who relies on metadata-heavy vaults and loves colorful, meaningful links that tell a story at a glance.
