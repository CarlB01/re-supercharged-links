## Title
Tech Debt Plan: Runtime Reliability + Observer/Cache Lifecycle Hardening

## Summary
This issue tracks prioritized technical debt identified in a project health review of `re-supercharged-links`.

The codebase has strong performance architecture, but there are a few high-priority reliability and maintainability risks:
- likely runtime bug in mutation batching
- possible missing import/runtime safety issues
- high observer lifecycle complexity
- refresh/re-init fan-out patterns
- moderate duplication/noise increasing maintenance cost

---

## Goals
1. Eliminate known correctness risks.
2. Reduce observer and refresh lifecycle complexity.
3. Improve maintainability without changing core behavior.

---

## Priority Breakdown

### P0 — Correctness (Immediate)
- [ ] Fix `instanceOf` usage in `src/views/view-invalidator.ts` (`instanceof` operator).
- [ ] Verify/import `Notice` in `src/settings/setting-tab.ts` where used.
- [ ] Validate `IconWidget` element creation path (`doc["createEl"]`) across supported contexts; replace with safe standard path if needed.
- [ ] Add sanity checks/logging around DOM batch failures to prevent silent queue stalls.

### P1 — Lifecycle/Performance (Near-term)
- [ ] Reduce full observer teardown/re-init frequency in layout-change flow.
- [ ] Coalesce startup refresh timers into a single scheduler mechanism.
- [ ] Review and rationalize modal/container observer ownership to avoid duplicate tracking layers.
- [ ] Consolidate repeated global plugin lookup logic into shared helper(s).

### P2 — Maintainability (Medium-term)
- [ ] Simplify settings UI state/update flow to reduce coupling between render, persistence, and live preview updates.
- [ ] Remove redundant telemetry condition checks and dead/noisy branches.
- [ ] Normalize comment style: concise technical intent over decorative narrative.
- [ ] Add internal architecture docs (observer flow, cache flow, refresh pipeline).

---

## Deliverables

### Code
- [ ] Bugfix PR(s) for P0 items
- [ ] Lifecycle simplification PR(s) for P1 items
- [ ] Refactor/documentation PR(s) for P2 items

### Tests
- [ ] Unit tests for rule compilation + resolution behavior
- [ ] Unit tests for cache index invalidation by path/prefix
- [ ] Regression test for mutation batch processing path

### Documentation
- [ ] `docs/architecture/observer-lifecycle.md`
- [ ] `docs/architecture/cache-lifecycle.md`
- [ ] `docs/architecture/refresh-pipeline.md`

---

## Success Metrics
- No runtime errors from mutation batching in normal usage.
- Stable observer count after repeated layout changes.
- Reduced refresh fan-out (fewer redundant update cycles).
- Lower maintenance overhead in settings/render code paths.
- Improved contributor onboarding clarity via architecture docs.

---

## Notes
This plan is intentionally incremental: preserve behavior first, then simplify internals.