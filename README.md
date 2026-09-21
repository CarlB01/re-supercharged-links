# Re-Supercharged Links

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-%23483699.svg?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Obsidian Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/plugins)
[![Release](https://img.shields.io/github/v/release/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/releases)
[![myBrain Integration](https://img.shields.io/badge/myBrain-Integration-00C853?logo=icloud&logoColor=white)](https://github.com/CarlB01/myBrain)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CarlB01/re-supercharged-links/blob/master/LICENSE)
[![Downloads](https://img.shields.io/github/downloads/CarlB01/re-supercharged-links/total)](https://github.com/CarlB01/re-supercharged-links/releases)
[![Stars](https://img.shields.io/github/stars/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/stargazers)

Dynamic metadata-driven link styling engine for Obsidian, engineered for ultra-low runtime overhead across high-density layouts.

---

## 🚀 Enterprise-Scale Vault Architecture (v1.0.19)

When operating inside heavy production environments containing tens of thousands of structural notes, deep automation layers (e.g., **myBrain**), or high-density datatables (**Bases**), traditional DOM-scanning layout patterns inherently degrade system responsiveness. 

`Re-Supercharged Links` bypasses conventional disc-bound CSS generation and synchronous repaints by decoupling metadata resolution from the main layout thread. 

### 📊 Production Telemetry Metrics
During synthetic layout stress-testing (simulating unstable event chains and rapid view shifts), the engine successfully absorbs extreme mutation peaks. Under continuous, realistic production workloads inside high-density vaults, the core logging framework records the following operational benchmarks:

* **0.0% – 0.2% Main Thread Load:** Confirmed mitigation of background mutation loops. The rendering thread hits a complete standby state immediately following view stabilization.
* **54.1% Sustained Cache Efficiency:** Balanced real-world operational hit-rate under continuous scrolling and structural note navigation, bypassing redundant file metadata cache evaluations.
* **Sub-Millisecond Computation Boundaries:** Average rule compilation, selector matching, and structural element property lookups resolve within a strict **0.63ms to 1.11ms** execution frame.

---

## Technical Features

The plugin parses structural metadata blocks to overlay persistent visual context across the entire Obsidian UI surface area (Live Preview, Reading Mode, and File Explorer layout layers).

- **Tag Evaluation:** Matches clean tag configurations omitting leading delimiter tokens.
- **Attribute Processing:** Targets YAML frontmatter mappings or Dataview-backed inline field matrices.
- **Path Token Queries:** Evaluates parent directories and file path syntax parameters to enforce layout-wide aesthetics automatically.

---

**Typical Display Mappings**

<img src="media/details.png" alt="styling panel typical display" style="max-width: 100%; width: 280px; height: auto; border-radius: 8px;">
<img src="media/details2.png" alt="styling details" style="max-width: 100%; width: 280px; height: auto; border-radius: 8px;">

---

## 🛠️ System Architecture & Core Technologies

The rendering pipeline abandons destructive "refresh-all" layouts in favor of an idempotent, event-driven streaming model:

* **In-Memory CodeMirror Extensions:** Legacy styling models relied on writing physical `.css` files to disk and triggering volatile CSS snippets reloads. The modern engine compiles rules into memory and injects them natively into the editor state via a decoupled **CodeMirror 6 Compartment configuration extension**, eliminating file I/O overhead.
* **The Idempotent Immutability Guard:** The modification path executes an analytical state-check on target elements before triggering destructive DOM rewrites. If class structures and color data match active rule configurations, execution terminates (`scl-processed`), entirely isolating layout race conditions.
* **Asynchronous Mutation Batching:** Synchronous rendering of hundreds of concurrent DOM alterations generates severe thread blocking. The updated pipeline implements a frame-throttled queue via `requestAnimationFrame`. Element mutations are chunked into precise slices (capped at 25 elements per frame) to preserve a **fluid 60 FPS scrolling experience**.
* **Pre-Compiled Selectors Strategy:** Rules are evaluated once during configuration bounds updates and compiled into structural matcher predicates. The plugin avoids regex generation or string-cleansing loops inside critical editing paths.
* **Isolated Thread Housekeeping:** Memory caps, TTL verification, and cache pruning loops are extracted from real-time events and delegated to native Obsidian intervals running passively every 30 seconds.

---

## ⚖️ Architectural Paradigm Comparison

To illuminate the engineering trade-offs between different design systems, the table below highlights the contrasts between the traditional monolithic approach and the updated asynchronous model.

| Evaluation Vector | Monolithic Legacy Approach | Asynchronous Streaming Engine (v1.0.19+) |
| :--- | :--- | :--- |
| **🟢 Primary Technical Merits** | • Direct context-menu abstraction layers for inline data changes.<br>• Uncomplicated global repaint triggers ensuring immediate visual cohesion. | • High scalability across enterprise hvelv architectures.<br>• Deterministic execution with zero background ghost-cycles.<br>• Thread-safe decoupling protecting editor focus and cursor stability. |
| **🔴 System Trade-offs** | • Monolithic blocking sweeps causing frame drops under high density updates.<br>• Volatile cache evictions enforcing full re-scans on minor filesystem events.<br>• Propensity for editor layout thrashing inside active Live Preview viewports. | • Streamlined core scope omitting non-essential UI interaction panels.<br>• Elevated codebase complexity introducing multi-stage queues.<br>• Deep cache isolation requires strict workspace event tracking to surface external structural hacks. |
| **⚙️ DOM Processing** | **Synchronous Monolith:** Forces absolute layout rebuilding on active panes. | **Asynchronous Batching:** Distributes mutations into frame-capped slices (max 25 per frame). |
| **💾 Stylesheet Delivery** | **Disk-Bound Snippets:** Generates raw CSS files, causing structural layout re-evaluation. | **Native Runtime Extensions:** Injected as in-memory state compartments directly via CodeMirror. |
| **🧹 Cache Lifecycle** | **Broad Sweeps:** Full cache clear operations triggered on file system interactions. | **Granular Invalidation:** Selective target purging via path/prefix indexes, with separate timed pruning. |

---

## Contributing / Feedback

"We"** actively monitor telemetry logs and high-density performance bounds. Technical edge cases, profile traces, and architectural requests are welcome:
- Obsidian performance profiling traces
- Multi-layered frontmatter/Dataview edge-case matrices
- UI/UX refinements for complex settings tab trees

---

## Credits

Respect to the original community framework concepts that pioneered metadata link decoration within the Obsidian ecosystem. This iteration continues that fundamental vision with a modernized, production-grade runtime environment.

---
Developed with care for real-world, high-density note systems.

*(The "we" in this technical layout refers to the primary maintainer alongside a curated panel of slightly repetitive but dutifully aligned AI engineering companions.)*
