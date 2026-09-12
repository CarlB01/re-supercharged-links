# 🧠 Technical Summary: DOM Architecture & Style Mutation for Re-Supercharged Links 0.0.38

## 1. Core Architectural Shift (The Overview)
* **Legacy Supercharged Links:** Relied on writing a static physical CSS file to disk, using heavy substring attribute selectors (like `[data-link-tags*="👥gruppe" i]`) continuously evaluated by the browser's graphics thread.
* **Re-Supercharged Links (New System):** Operates on a synchronous **All-In-Memory Runtime Engine**. It completely eliminates the generated CSS snippet file. Instead, it assigns raw, static helper classes and unique rule identifiers (`.scl-rule-${uid}`) during node assembly, applying exact styling values instantly via native `.setCssStyles()` (inline properties).

---

## 2. Characterization of Links in the DOM

### A. Read Mode Links
Read Mode elements are stripped of duplicate classes and styled directly via ultra-clean inline styles and physically appended/prepended elements.
* **Core Identifier Class:** `.data-link-text` is **always** guaranteed to be appended to the class list for structural mapping.
* **HTML Blueprint Example (Perfect Match):**
  ```html
  <a data-href="male⚕️" href="male⚕️" class="internal-link data-link-text" target="_blank" rel="noopener nofollow" data-link-tags="#him #lege #psykiater" data-link-path="male⚕️.md" style="color: rgb(87, 115, 255);">
      <span class="scl-inline-icon-before" style="margin-right: 3px; display: inline-block;">👤</span>
      male⚕️
  </a>
  ```

### B. Edit Mode / Live Preview Links (CodeMirror 6)
Live Preview relies on official CodeMirror 6 `Decoration` marks combined with a reactive in-memory theme compartment interface.
* **Core Identifier Class:** Contains `.data-link-text` and an explicit unique hash rule tracking class: **`.scl-rule-${uid}`** (e.g., `.scl-rule-ed89-b784`).
* **HTML Blueprint Example (Perfect Match):**
  ```html
  <div class="cm-line cm-active" dir="ltr">
      <span class="scl-inline-icon-before" contenteditable="false" style="margin-right: 3px; display: inline-block;">👤</span>
      <span class="cm-hmd-internal-link">
          <span class="data-link-text scl-rule-ed89-b784" data-link-tags="#him" data-link-data-href="♂menn" data-link-path="♂menn.md" data-scl-icon-before="👤">
              <span class="cm-underline" tabindex="-1" draggable="true">♂menn</span>
          </span>
      </span>
  </div>
  ```

---

## 3. Comprehensive Class & Attribute Matrix

| Class / Attribute Name | Node Target | Type / Characterization | Functional Behavior / Purpose |
| :--- | :--- | :--- | :--- |
| **`.data-link-text`** | Primary Link Core | Core Structural Base Class | **Universal baseline selector.** Present on every single styled link across both Read Mode and Edit Mode. Always listen for this class first. |
| **`.scl-rule-${uid}`** | Live Preview Mark | Unique In-Memory Rule Identifier | Generated dynamically based on the rule's UUID (e.g., `.scl-rule-c8f0`). Bound directly to CM6 `EditorView.theme` for reactive theme swapping without layout lag. |
| **`.scl-inline-icon-before`** | Affix Element (`<span>`) | Physical DOM Node (Prefix) | Emojis injected **before** the link text. Created natively via `createEl("span")` to bypass `HierarchyRequestError` crashes. |
| **`.scl-inline-icon-after`** | Affix Element (`<span>`) | Physical DOM Node (Suffix) | Emojis injected **after** the link text. |
| **`data-link-*` attributes** | Primary Link Core | Backward-Compatibility Metadata | Properties like `data-link-tags`, `data-link-path`, and custom frontmatter entries are still populated on the element for global pipeline fallback tracking. |
| **`data-scl-icon-before`** | Live Preview Mark | State Metadata Property | Stores the raw icon character string (e.g., `"👤"`) directly on the wrapper node for internal CodeMirror evaluation loops. |

---

## 4. The In-Memory Cascade (Additive Layering)
The new styling engine features a **Cascading Style Compiler** that aggregates user configurations sequentially from top to bottom.
* If multiple rules match a link, the visual properties **merge positively** (e.g., Rule 1 provides a font-weight and a prepended icon; Rule 2 changes the text color).
* In case of explicit conflict, **the lowest rule in the settings list wins**.
* **Deduplication:** The script evaluates the link filename string *before* building the icon widgets. If the filename text natively starts or ends with the targeted emoji token, the creation of `.scl-inline-icon-before` or `.scl-inline-icon-after` is cleanly bypassed, but the typography and text colors are kept intact.

---

## 🗺️ Strategies for `myBrain` Integration

When updating your listeners in `myBrain`, you have two clear paths forward:

1. **The Agnostic Approach (Safest):** Program `myBrain` to query elements using `.data-link-text`. Since this class is used as the foundational baseline in both the old and new plugin architecture, `myBrain` will capture links seamlessly regardless of which version the user is running.
2. **The Target Approach (Divergent):** If `myBrain` needs to extract icon strings or specific rules dynamically:
   * Look for `data-link-tags` (legacy attributes).
   * Check for the presence of physical child nodes `.scl-inline-icon-before` or `.scl-inline-icon-after` to fetch current active metadata emojis on the fly.
