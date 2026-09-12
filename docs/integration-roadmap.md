# 🧠 Technical Specification & Roadmap: Unifying Re-Supercharged Links for Downstream Interoperability

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
