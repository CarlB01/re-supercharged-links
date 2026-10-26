# Re-Supercharged Links

[![Obsidian Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/plugins)
[![Release](https://img.shields.io/github/v/release/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/releases)
[![Downloads](https://img.shields.io/github/downloads/CarlB01/re-supercharged-links/total)](https://github.com/CarlB01/re-supercharged-links/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CarlB01/re-supercharged-links/blob/master/LICENSE)
[![myBrain Integration](https://img.shields.io/badge/myBrain-Integration-00C853?logo=icloud&logoColor=white)](https://github.com/CarlB01/myBrain)
[![Stars](https://img.shields.io/github/stars/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/stargazers)


A fast, modern fork of **Supercharged Links** for Obsidian, rebuilt from the ground up for high-performance rendering. 

Style internal links dynamically based on tags, frontmatter attributes, inline fields, and note paths — across reading mode, live preview, and supported UI views without sacrificing your frame rate.

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

## The Breakthrough (v1.1.0 Architecture)

Legacy styling approaches frequently cause micro-stuttering (*jank*) in large vaults due to continuous layout thrashing and Garbage Collection spikes. **Re-Supercharged Links** solves this by treating link styling as a high-throughput graphics pipeline.

| Architectural Feature | Legacy Supercharged Links | Re-Supercharged Links (v1.1.0) |
| :--- | :--- | :--- |
| **Styling Mechanism** | Dynamic injection of generated CSS files | In-memory evaluation mapping directly to DOM tokens |
| **DOM Mutation** | Immediate, unbatched updates per event | Asynchronous batches via `requestAnimationFrame` (`CHUNK_SIZE = 200`) |
| **Memory Management** | Heavy allocation of transient Arrays/Objects | Zero-allocation loops reusing local instanced Set pools (`.clear()`) |
| **Cache Stratification** | Naive path lookups | Strict `Set.prototype.has()` lookups on stratified LRU Cache Managers with sub-ms invalidation |
| **CodeMirror Hot Path** | Full AST scan on cursor movement | Smart spatial barriers (0% CPU impact on non-link spans) |

---

## Technical Blueprint: Why it's faster

- **V8 JIT-Optimized Loops:** All internal iterations use traditional `for (let i = 0; i < len; i++)` and `while(i--)` constructs. Length parameters are pre-cached to allow the V8 engine to maximize Just-In-Time compilation efficiency.
- **Garbage Collection (GC) Defusal:** Avoids `Array.from().sort()` during cache eviction. Uses an inline sequential lookup on `attrCacheTouchedAt`, drastically reducing heap allocations and stabilizing frame times.
- **Strict O(1) Set Barriers:** Internal state tracking handles range evaluation through native `Set.prototype.has()` hooks, completely avoiding prototype chain thrashing and ensuring immediate early exits on previously processed nodes.
- **Batched Reflow Prevention:** Employs a custom `DOMMutationBatcher`. Instead of triggering multiple recalculate-layout cycles, changes are queued and flushed smoothly in synchronization with your monitor's refresh rate.

---

## Real-World Telemetry (v1.1.0 Profiles)

Below are real benchmark profiles taken from extensive testing in a massive production vault following the v1.1.0 telemetry and cache barrier overhaul.

### Test 1: High-Volume Global Viewport Flush (Massive Vault Re-Index)
*Triggering a full layout refresh sweeping across multiple active workspace window layers simultaneously.*
- **Total Nodes Evaluated:** 44,198 nodes
- **Internal Cache Hit Rate:** **92.3%** 🎯 (40,777 hits)
- **O(1) Barrier Exits:** 0.0% (*Expected behavior: full DOM sweeps intentionally bypass editor layout barriers*)
- **Frame Time (Avg / Max):** **0.27 ms** / **1.00 ms** ⚡ (*Sub-millisecond frame overhead even under high peak load*)
- **DOM Batches Flushed:** 15 flushes (*Peak single-burst efficiency scaling up to 44,198 nodes without jank*)

### Test 2: Dynamic Dataview Stress Test
*Continuous high-speed stress test inside highly volatile, auto-rendering Dataview datasets.*
- **Total Operations Evaluated:** 54,719 operations
- **Internal Cache Hit Rate:** **87.2%** 📊 (*Maintained high cache integrity despite dynamic DOM reconstruction*)
- **Avg Execution Frame Time:** **0.63 ms** 🚀 (*Extremely stable frame delivery under maximum rendering load*)
- **Avg Nodes Styled per Batch:** 40 nodes

### Test 3: Casual Interaction & UI Navigation
*Standard real-world workflow consisting of typical scrolling, typing, and jumping between linked notes.*
- **Total Operations Evaluated:** 4,682 operations
- **Cache Hit Rate:** 64.2%
- **Avg Execution Frame Time:** **0.18 ms** 🪵 (*Near zero-cost operation frame footprint*)
- **Avg Nodes Styled per Batch:** 19 nodes

---

## Performance Tuning Tips

While v1.1.0 is engineered for extreme efficiency, overall performance can be influenced by your environment:
- If you run multiple complex UI-heavy plugins alongside massive Dataview arrays, keeping your rule conditions highly specific will yield the best results.
- If you notice unexpected rendering delays, please open an issue containing your approximate vault size, active theme, and a performance profile capture if possible.

---

## Credits & License

- **Conceptual Foundation:** Deeply inspired by the groundwork laid by the original [Supercharged Links](https://github.com/mdelobelle/obsidian_supercharged_links) community project.
- **License:** Distributed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Further Development & Support

I originally undertook this project because I desperately needed a modern, highly optimized, and robust version of *Supercharged Links*—one capable of handling a vast array of simultaneous design rules and visual flavors without inducing UI lag. My broader semantic graph ecosystem, [myBrain](https://github.com/CarlB01/myBrain), completely depends on it.

The learning curve for mastering Obsidian's complex internal rendering engine has been remarkably steep. However, navigating this journey alongside advanced AI collaborators has been an incredible experience, rewarding me with a much deeper understanding of Obsidian's inner workings than I ever anticipated. It has been a truly rewarding bonus.

As an active project, I welcome your feedback! Please let me know if you encounter any bugs, discover unmapped edge cases, or have feature suggestions that could improve the framework. 

If this plugin brings value to your workflow and keeps your vault beautiful, **please consider leaving a star ⭐**—it means the world to independent developers!
