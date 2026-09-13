# 🧠 Technical Specification & Roadmap: Unifying Re-Supercharged Links for Downstream Interoperability

(at the end is a status report after code rebuild)

## 1. Architectural Context & The Compatibility Gap
Legacy *Supercharged Links* forced the entire Obsidian ecosystem (including graph plugins like `myBrain`) to scan the DOM for static, explicit attributes such as `[data-link-tags*="group" i]`. 

With the modern architecture of *Re-Supercharged Links* (SCL) shifting toward a high-velocity, in-memory execution layer using dynamic unique hash identifiers (`.scl-rule-${uid}`) and runtime-injected inline styles (`.setCssStyles()`), down-stream plugins have become structurally blind. They can no longer predictably inherit or look up rule states, causing layouts and vector lines to lose their context.

The goal of this roadmap is to establish a **Semantic Mirroring Protocol** within SCL. SCL will maintain its optimized runtime speed while leaving behind a highly predictable, standardized footprint of semantic classes and attributes that downstream plugins and custom views can parse seamlessly.

---

## 2. Structural Requirements for Obsidian Integration

To ensure custom components (like nodes in `myBrain`) are universally recognized by both standard themes and modern style injectors, links must mimic Obsidian's core **Read Mode** DOM anatomy precisely.

### A. The Structural Link Blueprint
Every generated link node must expose these core classes and attributes during assembly:

```typescript
// Core implementation standard for building compliant node elements
const linkEl = document.createElement("a");

// 1. Structural classes for style engine matching
linkEl.addClass("internal-link");
linkEl.addClass("data-link-text"); // Universal baseline selector for modern cascades
linkEl.addClass("focusable-note-link"); // Downstream tracking anchor

// 2. Core Obsidian routing hooks
linkEl.setAttribute("href", this.path);
linkEl.setAttribute("data-href", this.path);

// 3. Metadata footprint mapping
linkEl.setAttribute("data-link-path", this.path);
```

---

## 3. The Semantic Mirroring Protocol (SCL Engine Changes)

Instead of mutating down-stream plugins to parse arbitrary internal states, SCL will natively mirror its operational metadata directly back onto the elements it processes.

### Phase 1: Attribute Footprint Speciation
Regardless of whether a link resides within a standard Live Preview cell, a Markdown View reader, or a third-party abstract graph node, SCL must guarantee the synchronous presence of legacy-compatible tracking properties.

```typescript
/**
 * Synchronously mirrors core metadata back onto active nodes during processing loops.
 * Protects downstream attribute selectors without breaking the in-memory engine.
 */
public mirrorLegacyAttributes(element: HTMLElement, fileTags: string[], fileTarget: string): void {
  // 1. Enforce target path availability for asset database indexing
  if (!element.hasAttribute("data-link-path")) {
    element.setAttribute("data-link-path", fileTarget);
  }

  // 2. Re-materialize standard whitespace-separated tag structures
  if (fileTags && fileTags.length > 0) {
    const formattedTags = fileTags.map(t => t.startsWith("#") ? t : `#${t}`).join(" ");
    element.setAttribute("data-link-tags", formattedTags);
  }
}
```

### Phase 2: Class-Based Rule Interoperability
In addition to appending the isolated hash tracking tokens (`.scl-rule-ed89-b784`), SCL will emit readable, predictable **semantic flags** that detail exactly *why* a style condition was executed.

* **Current Implementation:** `.scl-rule-ed89-b784`
* **Target Interface Toggles:** Append human-readable contextual keys like `.scl-match-tag-him` or `.scl-match-prop-status-active` alongside the unique rule hash.

This allows downstream canvas grids to rapidly isolate specific visual nodes via native token validation queries:
```typescript
if (linkEl.classList.contains("scl-match-tag-him")) {
    // High-throughput contextual logic execution
}
```

### Phase 3: Injected Icon Container Standardization
To allow effortless layout manipulation, custom sizing, and alignment modifications without deep DOM-tree inspections, all injected affix widgets must be consolidated under a universal core class name.

```html
<!-- Enhanced SCL DOM Node Output Architecture -->
<span class="scl-inline-icon scl-inline-icon-before" contenteditable="false">👤</span>
<span class="scl-inline-icon scl-inline-icon-after" contenteditable="false">✨</span>
```

---

## 4. Agnostic Style Compensation (Downstream Implementation)

By standardizing the DOM footprint at the SCL engine root level, down-stream implementations can completely strip away complex database lookup cycles. They can instead rely on browser layout calculations (`getComputedStyle`) and basic CSS grouping to handle alignment and line-vector tracking.

### A. High-Velocity Color Harvest (`AreaManager.ts`)
```typescript
/**
 * Resolves active display colors from link blocks using style-agnostic fallbacks.
 * Seamlessly captures in-memory inline style modifications and calculated cascades.
 */
private getLandingNodeColor(note: Node, colorful: boolean): string | null {
  if (!colorful || !note.div) return null;

  // Query using both universal baseline targets and legacy custom triggers
  const linkEl = note.div.querySelector(".data-link-text, .focusable-note-link") as HTMLElement | null;
  if (!linkEl) return null;

  // Evaluate the actual layout calculation token directly from the computed paint matrix
  const computedStyles = getComputedStyle(linkEl);
  const color = computedStyles.color;

  return color && color.trim().length > 0 ? color : null;
}
```

### B. Structural Layout Lock (`styles.css`)
```css
/* Restrict link containers to single-row alignment boundaries */
.focusable-note-link.data-link-text {
    display: inline-flex (never use !important);
    align-items: center;
    white-space: nowrap ((never use !important);
}

/* Universally target and shrink all standardized SCL icon containers */
.focusable-note-link .scl-inline-icon {
    font-size: 0.85em (never use !important);
    display: inline-block;
    flex-shrink: 0;
}
```


# Revision finished - Architectural Analysis: SCL Engine Optimization & Compatibility Alignment

## 1. Executive Summary
This document provides a comprehensive technical verification of the completed milestones within the *Re-Supercharged Links* (SCL) core framework against the defined **Semantic Mirroring Protocol** specification. 

By prioritizing strict type safety, eliminating redundant runtime string operations, and decoupling data serialization logic from lifecycle streams, the SCL engine has achieved state-of-the-art memory safety and performance metrics. Crucially, the implementation successfully restores complete downstream visibility for external canvas grids and analytical systems (e.g., `myBrain`) without reintroducing the performance penalties of legacy DOM database lookups.

---

## 2. Milestone Verification Matrix

### Phase 1: Attribute Footprint Speciation
* **Requirement:** Synchronous presence of legacy-compatible tracking properties (`data-link-path`, `data-link-tags`) across all active layouts.
* **Verification Status:** **100% Verified (Production Ready)**
* **Technical Implementation:** Integrated directly within `setLinkNewProps` (Read Mode) and `CMViewPlugin` (Live Preview / Edit Mode). All metadata properties are systematically sanitized using the centralized `cleanAttributeKey` pipeline prior to structural DOM injection.

### Phase 2: Class-Based Rule Interoperability
* **Requirement:** Emission of human-readable contextual keys (`.scl-match-tag-${name}`) alongside isolated hash tracking tokens to ensure cascading rule visibility.
* **Verification Status:** **100% Verified (Production Ready)**
* **Technical Implementation:** The multi-rule cascade engine evaluates all matching configurations sequentially. Instead of emitting only the final ruling unique identifier, the compiled token list appends matching attributes additively, enabling native browser CSS engines to calculate style precedence flawlessly.

### Phase 3: Injected Icon Container Standardization
* **Requirement:** Consolidation of visual affix extensions under a universal core class (`.scl-inline-icon`) paired with complete extraction of hardcoded inline metrics from the JavaScript runtime.
* **Verification Status:** **100% Verified (Production Ready)**
* **Technical Implementation:** Swept and purged inline margins across `cm-view-plugin.ts`, `link-mutator.ts`, and `setting-tab.ts`. Layout orientation boundaries are now governed exclusively by declarative properties inside `styles.css` using `inline-flex` constraints and an adaptive `0.85em` scaling baseline.

---

## 3. Data Integrity & Crash Immunity Engineering

A primary breakthrough during this development sprint was the systematic insulation of the core boot pipeline against unhydrated or corrupted data nodes on disk (`data.json`).

1. **The Isolation Barrier (`settings-manager.ts`):** Ingestion and serialization mechanics have been completely decoupled from `main.ts`. Missing properties on old configuration profiles are safely intercepted during the boot cycle.
2. **Implicit Default Omission:** To preserve a pristine, minimalist storage file, attributes matching implicit system parameters (such as `fontStyle: "normal"`, `match: "exact"`, or empty strings) are stripped prior to disk operations. Fravær of configuration safely maps to a passive "inherit Obsidian core layout" status.
3. **Loop Boundary Herding (`attribute-fetcher.ts`):** Eradicated an overlapping counter mismatch inside the dynamic tag cache parser that caused thread execution deadlocks (infinite loop hangs) during application startup. Pointers are now strictly isolated to independent local array indexes.

---

## 4. Current State & Immediate Next Steps

The internal SCL processing pipeline is now completely herded, compiling with zero errors or static warnings under strict static analysis profiles. The semantic footprint is fully accessible within the DOM stream.

We are now perfectly positioned to execute **Section 4: Agnostic Style Compensation** within the downstream graph plugin repository (`myBrain`). By utilizing SCL's predictable class signatures, the target nodes inside `AreaManager.ts` can completely drop expensive array search workflows and harvest paint configurations instantly using the native browser layer (`getComputedStyle`).
