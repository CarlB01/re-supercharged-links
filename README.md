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

## The Breakthrough (v1.1.2 Architecture)

Legacy styling approaches frequently cause micro-stuttering (*jank*) in large vaults due to continuous layout thrashing and Garbage Collection spikes. **Re-Supercharged Links** solves this by treating link styling as a high-throughput graphics pipeline.

| Architectural Feature | Legacy Supercharged Links | Re-Supercharged Links (v1.1.2) |
| :--- | :--- | :--- |
| **Styling Mechanism** | Dynamic injection of generated CSS files | In-memory evaluation mapping directly to DOM tokens |
| **DOM Mutation** | Immediate, unbatched updates per event | Elastic Time-Slicing via `requestAnimationFrame` (`FRAME_BUDGET_MS = 1.5ms`) |
| **Memory Management** | Heavy allocation of transient Arrays/Objects | **Zero-allocation loops** using parallel pre-allocated backing store arrays |
| **Cache Stratification** | Naive path lookups | Uniform O(1) clean-key caching decoupling view context from core metadata |
| **CodeMirror Hot Path** | Full AST scan on cursor movement | Smart structural DOM-matching barriers and single-sweep in-memory maps |

---

## Technical Blueprint: Why it's faster

- **Zero-Allocation Pipeline:** The high-frequency runtime queue completely strips away object instantiation (`new MutationTask`) and `WeakRef` generation during rendering sweeps. Tasks are assigned directly to pre-allocated parallel array slots, eliminating Garbage Collection (GC) churn.
- **Elastic Frame-Time Budgeting:** Replaces rigid chunk sizes with a dedicated `1.5ms` time-sliced processing boundary. The loop processes as many nodes as your CPU physically allows, then yields thread control back to the browser to enforce fluid 60Hz/120Hz scrolling.
- **Synchronous O(1) DOM Structural Barriers:** Evaluates the rule-engine resolution directly against the active DOM node tokens *before* queuing. If a link already reflects the correct styles, it exits immediately on a microsecond, bypassing the asynchronous execution pipe entirely.
- **Context-Decoupled Cache Unification:** Caches pure document metadata layout structures rather than splicing layout arguments into keys. This enforces unified hit sharing across Dataview, Live Preview, and File Explorers simultaneously.
- **Single-Sweep DOM Mapping:** Replaces high-frequency `querySelectorAll` sweeps within the preview mode loop with a single dense pass. Links are aggregated into a local in-memory map, avoiding dynamic layout reflow thrashing.

---

## Real-World Telemetry (v1.1.2 Profiles)

Below are real benchmark profiles taken from extensive testing in a massive production vault following the v1.1.2 zero-allocation and time-sliced architectural overhaul.

### Test 1: High-Volume Multi-View Flush (Aggressive Mixed Scroll)
*Continuous fast scrolling across complex layouts combining File Explorers, core Markdown panes, and active background tabs simultaneously.*
- **Total Nodes Evaluated:** 178,798 nodes
- **O(1) Barrier Skip Rate:** **40.5%** 🚀 (72,401 synchronous exits bypassed entirely)
- **Internal Cache Hit Rate:** **94.1%** 🎯 (100,163 hits / 106,397 requests)
- **Frame Time (Avg / Max):** **0.42 ms** / **1.00 ms** ⚡ (*Sub-millisecond frame overhead even under high peak load*)
- **DOM Batches Flushed:** 19 flushes (*Drained peak burst volumes of up to 157,311 nodes smoothly inside a unified cycle without dropping a single frame*)

### Test 2: Volatile Dataview Core Sweep (Cold Cache Start)
*First-load initialization of rich Dataview data matrices forcing continuous cache-miss pipeline execution after a fresh vault reload.*
- **Total Nodes Evaluated:** 4,810 nodes
- **O(1) Barrier Skip Rate:** 13.3% (642 exits)
- **Internal Cache Hit Rate:** 42.1%
- **Frame Time (Avg / Max):** **0.00 ms** / **0.00 ms** 🪵 (*Instant dynamic execution executing on microsecond scales*)
- **DOM Batches Flushed:** 1 flush (*1,216 nodes fully parsed and drained inside the very first frame budget window*)

---

## Performance Tuning Tips

While v1.1.2 is engineered for extreme efficiency, overall performance can be influenced by your environment:
- If you run multiple complex UI-heavy plugins alongside massive Dataview arrays, keeping your rule conditions highly specific will yield the best results.
- If you notice unexpected rendering delays, please open an issue containing your approximate vault size, active theme, and a performance profile capture if possible.

---

## Credits & License

- **Conceptual Foundation:** Deeply inspired by the groundwork laid by the original [Supercharged Links](https://github.com/mdelobelle/obsidian_supercharged_links) community project.
- **License:** Distributed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Further Development & Support

I originally undertook this project because I really needed a modern, highly optimized, and robust version of *Supercharged Links*—one capable of handling a vast array of simultaneous design rules and visual flavors without inducing UI lag. My broader semantic graph ecosystem, [myBrain](https://github.com/CarlB01/myBrain), completely depends on it.

The learning curve for mastering Obsidian's complex internal rendering engine has been steep. However, navigating this journey alongside advanced AI collaborators has been an incredible experience, rewarding me with a much deeper understanding of Obsidian's inner workings than I ever anticipated. It has been a truly rewarding bonus.

As an active project, I welcome your feedback! Please let me know if you encounter any bugs, discover unmapped edge cases, or have feature suggestions that could improve the framework. 

If this plugin brings value to your workflow and keeps your vault beautiful, **please consider leaving a star ⭐**—it means the world to independent developers!
