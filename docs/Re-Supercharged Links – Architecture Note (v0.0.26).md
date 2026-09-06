# Re-Supercharged Links – Architecture Note (v0.0.26)

Date: 2026-09-06  
Topic: Bases + tag chips + end-to-end flow (settings → CSS → attributes → render/editor)

---

## 1) Session summary

- Bases styling was stabilized by using:
  - `registerViewType("bases", ...)` as primary
  - markdown fallback for rendered base blocks when needed
- Tag chips (`a.tag`) gained support via a dedicated setting:
  - `enableTagChips` (separate from `enableBases`)
- Prepend/append icon dedupe added:
  - skip icon if the same token is already at the start/end of visible text
  - robust against emoji variation differences (`☠` vs `☠️` via normalization)

Result: fast scrolling, consistent styling, and less visual duplication.

---

## 2) High-level model: 3 engines

The plugin works as a pipeline with three engines:

1. **Rule engine**: settings → generated CSS  
2. **Data engine**: link-target metadata → `data-link-*` attributes  
3. **Trigger engine**: when/where updates run (read mode, views, editor)

When all three align, links get styled correctly.

---

## 3) Technical flow (with your function names)

### A) Rule engine (settings → CSS)
**Files**: `SettingTab.ts`, `cssBuilder.ts`, `selectorSanitizer.ts`, `main.ts`

- User creates/edits rules (`CSSLink`) in settings
- Changes are persisted via `saveSettings()`
- CSS snippet is regenerated via `buildCSS(...)`
- `buildCSS` creates:
  - per-rule UID variables in `.theme-light` / `.theme-dark`
  - selectors targeting `data-link-*` attributes
- Snippet is written to:
  - `.obsidian/snippets/re-supercharged-links-gen.css`
- If enabled: snippet activate/reload via `customCss`

👉 Defines **what should be styled**.

---

### B) Data engine (metadata → attributes)
**File**: `linkAttributes.ts`

When a link is processed:

- resolve target with `metadataCache.getFirstLinkpathDest(...)`
- read metadata:
  - frontmatter
  - tags (`getAllTags`) if enabled
  - optional inline fields (Dataview bridge)
- normalize keys via `processKey`
- build props object (`Record<string,string>`)
- set element attributes:
  - `data-link-tags="..."`
  - `data-link-path="..."`
  - `data-link-status="..."`
  - etc.
- add classes:
  - `data-link-text`

Also (new): when `enableTagChips` is true, process `a.tag` and set `data-link-tags`.

👉 Defines **which elements match which rules**.

---

### C) Trigger engine (when updates run)
**Files**: `main.ts`, `observerEngine.ts`, `livePreview.ts`

#### Read mode / rendered markdown
- `registerMarkdownPostProcessor(...)`
- runs `updateElLinks(...)` after render
- internal links receive `data-link-*`

#### Workspace/panels
- `updateVisibleLinks(...)` refreshes visible links across open leaves
- `initViewObservers(...)` + `registerViewType(...)` attach observers
- on DOM changes: `updateContainer(...)` runs

#### Edit mode (Live Preview / CodeMirror)
- `buildCMViewPlugin(...)` mounts CM plugin
- `livePreview.ts` scans visible ranges
- for link tokens:
  - resolve file
  - compute props
  - `Decoration.mark(...)` with attributes/classes
  - add before/after icon widgets

👉 Enables styling in both reading mode and editor mode.

---

## 4) Why styles actually apply

When an element has:

- class `.data-link-text`
- and matching `data-link-*` attributes

...the generated CSS selectors match and apply:

- `color`
- `background-color`
- `font-weight`
- `font-style`
- `text-decoration`
- `::before` / `::after` icon content

---

## 5) End-to-end example

Rule: `tag contains project-x`, bold, light color `#3366ff`.

1. Rule is saved in settings  
2. `buildCSS` generates selector:
   `.data-link-text[data-link-tags*="project-x" i] { ... }`
3. Link processing finds target has `#project-x`
4. Element gets `data-link-tags="... #project-x ..."`
5. CSS matches → link renders blue + bold

---

## 6) Sequence diagram (adapted to your function names)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant ST as SettingTab.ts
    participant M as main.ts
    participant CB as cssBuilder.ts
    participant SA as selectorSanitizer.ts
    participant LA as linkAttributes.ts
    participant OE as observerEngine.ts
    participant LP as livePreview.ts
    participant DOM as DOM (Read/View)
    participant CM as CodeMirror (Live Preview)
    participant FS as Vault FS (.obsidian/snippets)

    Note over U,FS: 1) Rule engine: settings -> CSS
    U->>ST: Edit/create CSSLink rule in settings UI
    ST->>M: saveSettings()
    M->>CB: buildCSS(settings.selectors, ...)
    CB->>SA: sanitize selector fragments/keys
    SA-->>CB: safe selectors
    CB-->>M: generated CSS text
    M->>FS: write re-supercharged-links-gen.css
    M->>M: customCss enable/reload (if enabled)

    Note over U,CM: 2) Trigger + Data engine in Read/View
    M->>OE: initViewObservers(plugin)
    OE->>OE: registerViewType("bases"/"markdown"/...)
    OE->>DOM: MutationObserver callbacks

    M->>DOM: registerMarkdownPostProcessor(...)
    DOM->>LA: updateElLinks(container, selector)
    LA->>LA: resolve link (getFirstLinkpathDest)
    LA->>LA: read frontmatter/tags/inline fields
    LA->>LA: processKey/processValue
    LA->>LA: setLinkNewProps(data-link-*)
    LA-->>DOM: classes + attributes applied

    alt enableTagChips = true
        DOM->>LA: extractTagTokensFromElement(a.tag)
        LA->>LA: normalizeTagToken(...)
        LA-->>DOM: set data-link-tags on a.tag
    end

    Note over U,CM: 3) Editor engine (Live Preview)
    M->>LP: buildCMViewPlugin(...)
    LP->>CM: scan visible ranges
    LP->>LA: resolve metadata for link tokens
    LA-->>LP: props for token
    LP->>CM: Decoration.mark(classes+attrs)
    LP->>CM: icon widgets before/after

    Note over DOM,CM: Generated CSS matches .data-link-text[data-link-*] -> final visual styling
```

---

## 7) Practical checklist

- Keep `enableBases` and `enableTagChips` separate
- Avoid duplicate tag-chip processing (one block only in `updateContainer`)
- Keep normalization/attribute logic centralized in `linkAttributes.ts`
- Let `main.ts` orchestrate rather than own parsing details
- For icon dedupe: compare against visible label before setting prepend/append

---