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

## 🚀 What's New in v1.0.5

Version 1.0.5 marks the completion of a core architectural framework, featuring a massive data-layer modernization that results in a significant reduction in runtime rendering overhead:

* **Stripless In-Loop Execution Engine**: Style rules are now matched chronologically using clean, raw text tokens. High-frequency runtime string operations (`.replace()`, `decodeURIComponent()`, and regex matching) have been completely banished from active execution loops to guarantee buttery-smooth 60/120 FPS scrolling.
* **DOM-Exclusive Hash Serialization Protocol**: SCL now enforces strict layer separation. Settings, data streams, and internal caches are kept 100% clean of `#` markers. The hashtag prefix is injected *exclusively* at the absolute boundary DOM layer (`data-link-tags="#tag"`), fully satisfying `myBrain` and legacy CSS wildcard sheets without polluting configuration memories.
* **Transactional Array-Buffer Stream**: Replaced immediate CodeMirror injections with a flat transaction memory buffer. Layout marks are pre-sorted chronologically (`marks` prioritized over `widgets`) prior to builder streaming, permanently neutralizing `Ranges must be added sorted` editor crashes without heavy position `Set` lookups.
* **Type-Locked Operator Blueprints**: Complex string-based CSS operator sniffing has been replaced by strict, mechanical indexing at input (`exact` for tags/attributes, `contains` for note paths), maximizing lookbehind velocity.
* **Consolidated Leaf View Observers**: Sanered redundant `MutationObserver` leaks on the native leaf views while retaining immediate, zero-delay metadata pane layout hydration upon initial activation.

---

## ✨ What this plugin does

**Re-Supercharged Links** turns metadata into visual context directly in your notes.

Instead of plain internal links, you can style links based on frontmatter/fields so they communicate status, type, priority, source, or category at a glance.

---

## ✨ The Architectural Evolution: Original vs. Re-Supercharged

To understand why **Re-Supercharged Links** was built, it helps to look at the mechanics under the hood. The original plugin was a trailblazer, but its underlying browser-handling methodologies created inherent scaling challenges in massive vaults.

### 📊 Comparative Analysis

| Feature / Core Mechanism | Original Supercharged Links (`mdelobelle/..`) | Re-Supercharged Links (`CarlB01/..`) |
| :--- | :--- | :--- |
| **Styling Mechanism** | **Disk Persisted CSS Snippets.** Writes massive, static `.css` files to disk whenever rules change. | **All-In-Memory Runtime.** Eliminates disk manipulation entirely. Styles compile in-memory and update UI profiles synchronously. |
| **DOM Engine Lookup** | **Substring Attribute Scanning ($=, \*=).** Forces continuous, heavy substring searches on every frame while scrolling. | **O(1) Hash-Table Matching.** Assigns clean, static rule signatures (`.scl-rule-${uid}`) instantly. Extended by the **Semantic Mirroring Protocol**. |
| **Icon Affixes (Emojis)** | **CSS Pseudo-Elements (`::before`/`::after`).** Emojis are injected blindly via CSS text properties, causing layout lag anomalies. | **Physical HTML Widgets (`<span>`).** Embeds lightweight, standardized icon spans natively inside CodeMirror 6 and Read Mode streams. |
| **Ecosystem Integration** | **Native DOM Footprint.** Third-party plugins scan for static string attributes. | **Semantic Mirroring.** Synthesizes in-memory velocity with deterministic semantic class flags (e.g., `.scl-match-tag-him`) for downstream tools. |

---

## ⚙️ The Semantic Mirroring Protocol

With the release of the **Semantic Mirroring Protocol**, SCL delivers the best of both worlds: unprecedented in-memory rendering speed paired with absolute visibility for the Obsidian ecosystem.

1. **Attribute Footprint Speciation:** Regardless of the current layout view, SCL synchronously maintains legacy-compatible metadata footprint parameters (`data-link-path` and `data-link-tags`).
2. **Contextual Class Inheritance:** SCL processes matching rules chronologically and injects human-readable semantic descriptors (such as `.scl-match-tag-symptom`) additively. Downstream graphical frameworks and custom canvas matrices (like `myBrain`) can read or filter node states effortlessly.
3. **Standardized Affix Affiliation:** All runtime-injected prefix and postfix icon widgets are bound to a universal structural class (`.scl-inline-icon`), shifting layout, scaling, and alignment boundaries entirely over to clean, declarative CSS.

---

## ⚖️ The Honest Trade-offs: Pros and Cons

Engineering is about choices. While **Re-Supercharged Links** offers massive leaps forward in speed, it changes how the plugin interacts with your system.

### 🟢 Pros (Why you should use it)
* **Zero UI Lag or Scrolling Micro-Stutter:** Fluid, locked 60+ FPS rhythm across multi-thousand-note vaults.
* **Instant Settings Feedback:** Color choices light up preview badges in the exact microsecond you release the cursor.
* **Agnostic Style Compensation:** Empowers graph/canvas engines to harvest exact inline color configurations using native browser layout calculations (`getComputedStyle`).
* **Total Crash Immunity:** Equipped with an internal ingestion engine that automatically vends and repairs legacy data nodes on disk, wiping out `TypeError` boot-time crashes permanently.

### 🔴 Cons (What to be aware of)
* **Deep Architectural Divergence:** Move so far past the original implementation that settings objects are structurally unique. It cannot read legacy data structures from the original plugin without configuring rules anew.

---

## ⚙️ Quick Start

1. Open **Settings → Community plugins** and install **Re-Supercharged Links**.
2. Navigate to the option pane and create a new selector rule targeting a metadata marker (e.g., `status`).
3. **Strict Text Inputs**: Type rule values cleanly *without* the `#` character (e.g., enter `gruppe`, not `#gruppe`). SCL manages the `#` prefix under the hood.
4. Assign text weight options, custom icon affixes, and distinct colors for both light and dark mode.
5. Watch your workspace map itself out visually in real-time!

---

## 🔌 Compatibility notes

- Built for Obsidian users who rely on metadata-heavy workflows
- Works especially well with structured vaults (projects, PARA, Zettelkasten hybrids)
- Scoped observers protect native view leaves, file properties pane, and suggestion containers dynamically
- Dataview-related enrichment is handled defensively to avoid hard failures

---

## 🤝 Credits & Lineage

Deepest respect and gratitude to the original creators and maintainers of **Supercharged Links**. Their brilliant vision provided the conceptual baseline for what metadata links could achieve in Obsidian. This fork stands on that pioneering foundation, built to carry the workflow safely into future Obsidian API environments.

---

Developed with care by a healthcare worker who relies on metadata-heavy vaults and loves colorful, meaningful links that tell a story at a glance.
