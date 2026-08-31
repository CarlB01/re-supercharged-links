# Re-Supercharged Links vs Original (`mdelobelle/obsidian_supercharged_links`)
## Full Audit Report (A–E)

**Date:** August 31, 2026  
**Repositories compared:**
- Relaunch candidate: `CarlB01/re-supercharged-links`
- Original: `mdelobelle/obsidian_supercharged_links`

---

## A) Executive Summary — **Caution (Promising, but needs validation via code-level profiling)**

You are **very likely moving in the right direction conceptually**, especially if your relaunch is intentionally targeting:

- cleaner architecture boundaries,
- improved light/dark theming,
- and lower runtime overhead from excessive global updates.

That said, a reliable **“Go”** requires code-level verification of actual runtime behavior under realistic vault load (especially 1k–10k notes).  
Without measured baselines, the biggest risk is unintentionally keeping the original plugin’s core bottleneck pattern: broad UI mutation and frequent recomputation.

### Decision signal
- **Current signal:** **Caution**
- **Upgrade to “Go” if:** you can demonstrate reduced full rescans, tighter invalidation, and stable frame timing.
- **Escalate to “Pivot” if:** style/data injection architecture still requires frequent full-surface DOM rewrites.

---

## B) Side-by-Side Technical Comparison (Original vs Relaunch Target)

> Note: This is a structured engineering comparison framework based on known plugin behavior and your stated relaunch goals.  
> The “Relaunch target” column reflects the expected/desired implementation direction for your fork.

| Dimension | Original (`obsidian_supercharged_links`) | Relaunch Target (`re-supercharged-links`) | Risk if unchanged | Recommendation |
|---|---|---|---|---|
| Core idea | Global link/tag enhancement through data attributes and CSS-driven customization | Same core value, but modernized with stricter update boundaries | Medium | Keep concept; modernize execution |
| Event handling | Can become broad/reactive across many UI areas | Prefer scoped listeners + debounce/throttle | High | Add event budget + coalescing |
| Recompute strategy | Risk of repeated parsing/matching on frequent metadata updates | Incremental indexing + dirty-file queue | High | Process only changed files/views |
| Regex/rules | Potential repeated compilation/eval overhead | Precompiled rule set with immutable snapshots | Medium | Compile on settings change only |
| Rendering | Broad attribute injection across multiple surfaces | View-scoped rendering with staged/batched writes | High | Batch writes with RAF/microtasks |
| Data/cache | Mixed transient and derived data paths | Explicit cache layers + invalidation keys | Medium | File revision/hash keyed caches |
| Settings/schema | Legacy growth tends to accumulate complexity | Versioned schema + migration pipeline | Medium | Introduce `settingsVersion` |
| Theme support | CSS-heavy flexibility but can drift in consistency | Tokenized light/dark variables + minimal specificity wars | Medium | Use CSS variables per semantic token |
| Maintainability | Powerful but can be hard to reason about when rules/features expand | Pipeline: parse → match → render | High | Enforce module boundaries |
| Obsidian future-fit | Potential fragility if UI internals change | Abstract surface adapters per view type | Medium | Add compatibility layer |

---

## C) Top 10 Improvements Ranked by ROI

## 1) Introduce **Dirty-Set Incremental Processing**
- Maintain a `Set<fileId>` of changed files.
- Recompute only impacted artifacts.
- **ROI:** Very high (largest CPU reduction in large vaults).

## 2) Compile Rules Once per Settings Revision
- Convert user rules to executable matchers once on save.
- Freeze compiled structure (`Object.freeze`) to prevent accidental mutation.
- **ROI:** Very high (cuts repeated parse/compile work).

## 3) Add Event Coalescing Layer
- Debounce metadata/file events (100–300ms window).
- Collapse multiple updates into one processing tick.
- **ROI:** High (stabilizes bursts).

## 4) Batch DOM Mutations
- Use `requestAnimationFrame` and write batching.
- Avoid interleaving reads/writes (prevent layout thrash).
- **ROI:** High (UI smoothness).

## 5) Build a 3-Stage Pipeline
- `collector` (metadata) → `matcher` (rules) → `renderer` (DOM/CSS attrs).
- Keep pure logic in stage 2 for easy testing.
- **ROI:** High (maintainability + correctness).

## 6) Add Lightweight Profiling Hooks
- Debug mode with timings: parse/ms, match/ms, render/ms, files touched.
- Aggregate p50/p95 locally.
- **ROI:** High (decision-quality diagnostics).

## 7) Cache by File Revision
- Cache computed outputs keyed by `(filePath, mtime/cacheVersion)`.
- Invalidate on exact change triggers.
- **ROI:** Medium-high.

## 8) Reduce Surface Area of Injection
- Render only for active panes / visible explorers when possible.
- Lazy-apply for unopened views.
- **ROI:** Medium-high (especially huge vaults).

## 9) Formalize Conflict Resolution in Rule Engine
- Priority + deterministic tie-breakers.
- E.g. explicit precedence: exact path > regex > tag default.
- **ROI:** Medium (predictability).

## 10) Add Schema Migration + Fallback Safety
- `settingsVersion`, migration chain, validation on startup.
- Fallback to safe defaults if migration fails.
- **ROI:** Medium (stability over time).

---

## D) Alternative “v2” Architecture Proposal

## Design goals
- Minimize unnecessary recomputation.
- Keep visual consistency across Obsidian views.
- Make behavior deterministic and testable.

## Proposed modules

1. **Source Adapters**
   - Pull from Obsidian metadata cache/events.
   - Normalize to plugin-internal model.

2. **Index Store**
   - Per-file normalized facts (tags, frontmatter, aliases, links).
   - Revision-aware cache entries.

3. **Rule Compiler**
   - Converts settings into immutable compiled predicates.
   - Runs only when settings change.

4. **Matcher Engine**
   - Pure function layer: `facts + compiledRules -> style tokens / attributes`.
   - Unit-test friendly.

5. **Render Adapters**
   - One adapter per surface (editor, preview, file explorer, backlinks).
   - Applies minimal diffs, not full rewrites.

6. **Scheduler**
   - Handles queueing/coalescing/prioritization.
   - Knows when to run fast path vs full rebuild.

7. **Telemetry-Light (local only)**
   - Timing + counters for diagnostics.
   - Optional user-visible “performance stats” panel.

## Why this is better
- Reduces coupling between Obsidian UI quirks and business logic.
- Makes performance bottlenecks visible and isolated.
- Enables safe feature growth without regressions.

---

## E) 7-Day Execution Plan (Practical)

## Day 1 — Baseline & Instrumentation
- Add timing probes around parse/match/render.
- Define baseline scenarios (small/medium/large vault).
- Capture p50/p95 and total updated nodes per event burst.

## Day 2 — Rule Compilation Refactor
- Move all regex/string parsing to settings-save path.
- Build immutable compiled rule object.
- Add unit tests for compile and invalid config handling.

## Day 3 — Dirty-Set + Scheduler
- Implement changed-file queue and coalescing window.
- Convert full-pass handlers to incremental handlers.
- Verify correctness on rename/delete/update events.

## Day 4 — Render Batching
- Introduce render diffing and RAF-batched writes.
- Remove direct synchronous write bursts in hot paths.
- Validate no visual regressions.

## Day 5 — Theme Token System
- Define semantic CSS tokens (`--scl-link-accent`, etc.).
- Map tokens for light/dark consistently.
- Reduce selector specificity and duplicate CSS blocks.

## Day 6 — Compatibility Pass
- Test across editor/reading/file explorer/backlinks.
- Add fallback behavior for unavailable surfaces.
- Harden against null/missing metadata states.

## Day 7 — Hardening & Release Candidate
- Run regression tests + manual stress test (5k+ notes if possible).
- Compare metrics vs Day 1 baseline.
- Publish RC notes with known limitations and feature flags.

---

## Suggested Success Criteria (Go/No-Go)

- **CPU:** Significant drop in recompute time per metadata burst.
- **UI:** No frame drops during common editing/navigation workflows.
- **Correctness:** Deterministic rule output across surfaces.
- **Stability:** No stale attributes after file rename/delete/move.
- **Maintainability:** New rule type can be added without touching render internals.

---

## Final Recommendation

Proceed with the relaunch — **but treat performance architecture as a first-class feature**, not a polish step.  
Your product direction is strong for Obsidian users if you deliver:

- incremental processing,
- deterministic rule behavior,
- and robust theming without DOM-heavy churn.

If you want, next step I can produce a **copy-paste “Implementation Checklist”** with concrete task tickets (GitHub issue-ready) for each item above.