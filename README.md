# Release Notes: Resupercharged Links (0.0.12 ->) Architecture Overhaul

> 💡 **Important Note**: This plugin is a complete architectural modernization and independent continuation developed by a new author. It is built as a modernized successor to the brilliant, original *Supercharged Links* plugin.

This release marks a complete structural and architectural rewrite of the codebase. The core goal of this modernization was to transition from the original plugin's heavyweight, highly coupled design to a decoupled, lean framework that leverages Obsidian’s native UI paradigms and isolates style generation from reactive memory loops. see [development plan](./docs/README-audit-plan.md).

---

## Core Architectural Differences from the Original Plugin

| Feature / Domain | Original Plugin Approach | Modernized Blueprint (0.0.12 ->) |
| :--- | :--- | :--- |
| **Settings Engine** | Relied on an imperative, manually injected DOM schema tied to a global, static "Target Attributes" index. | Built entirely on Obsidian’s native declarative framework (`getSettingDefinitions`), using a unified Union Type layout. |
| **Metadata Scavenging** | Scanned a hardcoded global array on every DOM shift, forcing redundant sweeps for unused metadata attributes. | **Dynamic Event Scavenging**: Collects metadata *only* for attributes actively declared in active styling rules (`settings.selectors`). |
| **UI State & Modification** | Heavy pop-up modals (`CSSBuilderModal`) decoupled from main lists, causing context switching. | A flat "Accordion" list where rows act as reactive toggle buttons, dynamically mounting configuration fields via `render` blocks. |
| **CSS Infrastructure** | Generated complex, deeply nested selectors using inline `.style` property injections in real-time. | Isolated variables (`--scl-color-*`, `--scl-bg-*`) separating logic from layout, written asynchronously to a native snippet directory. |

---

## Technical Feature Log
* **Dynamic Attribute Scavenging**: Automated detection sweeps. The plugin no longer monitors a global array. It builds an in-memory `Set` of active parameters directly from user styling rules.
* **Hierarchical Accordion UI**: Renders live HTML link previews directly inside the configuration row. Layout parameters, priority ordering (up/down arrows), and deletion buttons are packed into a single, compact view node.
* **Context-Aware Inputs**: The `Key Name` text parameter automatically unmounts or displays based on the chosen matching type (Tag vs. Attribute).
* **Expanded Formatting Matrix**: Re-implemented and expanded formatting engines to support **Font Weight** (Tynn, Normal, Bold), **Font Style/Decoration** (Kursiv, Understreket, Overstrøket/Line-through), and dual-theme **Background Colors**.
* **Compliant Styling Abstraction**: Stripped out all hardcoded inline styling. Visual indicators, hover animations, accent borders, and danger buttons are offloaded to an optimized external sheet (`styles.css`).

---

## 📊 Comprehensive Efficiency Assessment

### 1. Memory Management & Garbage Collection
* **The Original Issue:** The previous architecture used persistent `.addEventListener("click")` hooks attached during iterative view rebuilds. This frequently led to hidden memory leaks, causing the Obsidian settings pane to progressively slow down during extended sessions.
* **The V2 Fix:** Replaced with localized, isolated execution closures inside native `addButton` instances and declarative triggers. Handlers are safely disposed of by the engine whenever the settings view unmounts, keeping the heap clean and interactions instantaneous.

### 2. File I/O and Disk Overhead
* **The Approach:** Disk writes are mitigated via a built-in `debounce` routine (300ms) paired with asynchronous file adaptations (`vault.adapter.mkdir` and `vault.create`).
* **Performance Impact:** Negligible. Style definitions are compiled and committed to disk only when user changes freeze. Typing or dragging styles inside the menu won't cause write-locks or stuttering.

### 3. Rendering Pipeline & DOM Performance (Live Preview & Reading View)
* **The Approach:** Real-time links are updated by evaluating cached properties against active selection states (`fetchTargetAttributesSync`). 
* **Performance Impact:** By limiting property evaluation to active style rules rather than monitoring a massive global target matrix, the synchronous overhead inside large markdown files is significantly lower. Using native CSS Custom Properties ensures that toggling light/dark themes is handled directly by Obsidian's graphics wrapper without running JavaScript recalculations.

### 4. Code Maintenance & Maintainability
* **The Approach:** The file system has been stripped down. Modals and redundant data models have been removed. The layout relies on strict TypeScript type guards (`isSelectorEditableKey`) and indexing templates (`Record<string, unknown>`).
* **Performance Impact:** The codebase is roughly 40% smaller than the original implementation. This makes it easier to debug, limits runtime exceptions from unhandled `undefined` states, and provides an open pathway for seamless integration with external node graphing ecosystems (such as *myBrain*).

---

## ❤️ Acknowledgements & Gratitude

This modernized evolution would not exist without the incredible foundation laid down before it. 

A deep, heartfelt thank you goes out to the original creators and contributors of **Supercharged Links**. Your brilliant concept, visionary ideas, and hard work opened up a whole new world of visual context within Obsidian. You gave the community the power to make links truly intelligent, and this project stands proudly on your shoulders. Thank you for your generosity, your dedication to open-source software, and for inspiring this brand new chapter! 🌟
