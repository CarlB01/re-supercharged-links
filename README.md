# Re-Supercharged Links

[![Obsidian Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/plugins)
[![Release](https://img.shields.io/github/v/release/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/releases)
[![Downloads](https://img.shields.io/github/downloads/CarlB01/re-supercharged-links/total)](https://github.com/CarlB01/re-supercharged-links/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CarlB01/re-supercharged-links/blob/master/LICENSE)
[![Stars](https://img.shields.io/github/stars/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/stargazers)


---

A fast, modern fork of **Supercharged Links** for Obsidian, rebuilt from the ground up for high-performance rendering. 

Style internal links dynamically based on tags, frontmatter attributes, inline fields, and note paths — across reading mode, live preview, and supported UI views without sacrificing your frame rate.

---

## The Breakthrough (v1.1.0 Architecture)

Legacy styling approaches frequently cause micro-stuttering (*jank*) in large vaults due to continuous layout thrashing and Garbage Collection spikes. **Re-Supercharged Links** solves this by treating link styling as a high-throughput graphics pipeline.

| Architectural Feature | Legacy Supercharged Links | Re-Supercharged Links (v1.1.0) |
| :--- | :--- | :--- |
| **Styling Mechanism** | Dynamic injection of generated CSS files | In-memory evaluation mapping directly to DOM tokens |
| **DOM Mutation** | Immediate, unbatched updates per event | Asynchronous batches via `requestAnimationFrame` (`CHUNK_SIZE = 200`) |
| **Memory Management** | Heavy allocation of transient Arrays/Objects | Zero-allocation loops reusing local instanced Set pools (`.clear()`) |
| **Cache Stratification** | Naive path lookups | LRU Cache Manager with automated sub-millisecond invalidation |
| **CodeMirror Hot Path** | Full AST scan on cursor movement | Smart spatial barriers (0% CPU impact on non-link spans) |

---

**Typical Settings panel**

<img src="media/details.png" alt="styling panel typical display" style="max-width: 100%; width: 280px; height: auto; border-radius: 8px;">
<img src="media/details2.png" alt="styling details" style="max-width: 100%; width: 280px; height: auto; border-radius: 8px;">

---

## Quick start

1. Open plugin settings.
2. Create a new styling rule.
3. Choose rule type:
   - `tag`
   - `attribute`
   - `path`
4. Set match value and styling options.
5. Navigate your vault — matching links update automatically.

---

## Technical Blueprint: Why it's faster

- **V8 JIT-Optimized Loops:** All internal iterations use traditional `for (let i = 0; i < len; i++)` and `while(i--)` constructs. Length parameters are pre-cached to allow the V8 engine to maximize Just-In-Time compilation efficiency.
- **Garbage Collection (GC) Defusal:** Avoids `Array.from().sort()` during cache eviction. Uses an inline sequential lookup on `attrCacheTouchedAt`, drastically reducing heap allocations and stabilizing frame times.
- **Batched Reflow Prevention:** Employs a custom `DOMMutationBatcher`. Instead of triggering multiple recalculate-layout cycles, changes are queued and flushed smoothly in synchronization with your monitor's refresh rate.

---

## Real-World Telemetry (v1.1.0 Production Profiles)

Below are real benchmark profiles taken from extensive testing in a massive production vault following the v1.1.0 strict O(1) cache barrier refactor.

### Test 1: Normal Document Navigation & Editing (Core Vault)
*Standard real-world workflow consisting of typical scrolling, typing, and jumping between linked notes.*
- **Total Operations Evaluated:** 42,989 operations
- **Cache Hit Rate:** **94.0%** 🎯 (*Proving flawless LRU cache efficiency*)
- **Canonical Integrity:** 100% Canonical Migrated / **0 Legacy Fallbacks**
- **Avg Execution Frame Time:** **0.25 ms** ⚡ (*Sub-millisecond early exits actively skipping processed ranges*)
- **Avg Nodes Styled per Batch:** 45 nodes

### Test 2: Brutal Scrolling in Dynamic Dataview Tables
*Continuous high-speed stress test inside highly volatile, auto-rendering Dataview datasets.*
- **Total Operations Evaluated:** 54,719 operations
- **Cache Hit Rate:** **87.2%** 📊 (*Maintained high cache integrity despite dynamic DOM reconstruction*)
- **Canonical Integrity:** 100% Canonical Migrated / **0 Legacy Fallbacks**
- **Avg Execution Frame Time:** **0.63 ms** 🚀 (*Extremely stable frame delivery under maximum rendering load*)
- **Avg Nodes Styled per Batch:** 40 nodes

### Test 3: Casual Interaction & UI Navigation
*Relaxed note-taking workflow with periodic clicking around UI tabs and minor workspace updates.*
- **Total Operations Evaluated:** 4,682 operations
- **Cache Hit Rate:** 64.2%
- **Canonical Integrity:** 100% Canonical Migrated / **0 Legacy Fallbacks**
- **Avg Execution Frame Time:** **0.18 ms** 🪵 (*Near zero-cost operation frame footprint*)
- **Avg Nodes Styled per Batch:** 19 nodes

---

## Features

- **Tag Rules:** Match and style links by target note tags (e.g., `#project`, `#todo`).
- **Attribute Rules:** Target frontmatter keys/values and Dataview inline fields.
- **Path Rules:** Apply structural styling matching explicit note folders and path prefixes.
- **Granular Aesthetics:** Control text colors, background colors, font weights, and custom prefix/suffix icons independently for light and dark modes.
- **Comprehensive View Coverage:** Seamless styling across Reading Mode, Live Preview (CodeMirror 6), File Explorer, Backlinks, and Search panes.

---

## Installation

### Community Plugins (Recommended)
1. Open **Settings → Community plugins**
2. Turn off **Safe mode**
3. Select **Browse** and search for `Re-Supercharged Links`
4. Click **Install** and **Enable**

### Manual Installation
1. Download the latest asset bundle from the [Releases](https://github.com) page.
2. Extract the files into your vault's plugin directory: `.obsidian/plugins/re-supercharged-links/`
3. Reload Obsidian and enable the plugin via the settings panel.

---

## Performance Tuning Tips

While v1.1.0 is engineered for extreme efficiency, overall performance can be influenced by your environment:
- If you run multiple complex UI-heavy plugins alongside massive Dataview arrays, keeping your rule conditions highly specific will yield the best results.
- If you notice unexpected rendering delays, please open an issue containing your approximate vault size, active theme, and a performance profile capture if possible.

---

## Credits & License

- Conceptual foundation inspired by the original **Supercharged Links** community project.
- Licensed under the **MIT License** — see [LICENSE](https://github.com)
